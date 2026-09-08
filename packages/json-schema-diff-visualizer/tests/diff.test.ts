import { describe, expect, it } from "vitest";
import { collectBreakingChanges, deepEqual, diffSchemas, isBreakingChange, summarizeBreaking, summarizeDiff } from "../src/lib/diff.js";

function findChild(node: ReturnType<typeof diffSchemas>, key: string) {
  const found = node.children.find((c) => c.key === key);
  if (!found) throw new Error(`No child named "${key}" among [${node.children.map((c) => c.key).join(", ")}]`);
  return found;
}

describe("diffSchemas: root-level", () => {
  it("marks two identical schemas as unchanged", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } };
    const tree = diffSchemas(schema, schema);
    expect(tree.status).toBe("unchanged");
    expect(findChild(tree, "name").status).toBe("unchanged");
  });

  it("detects a root type change", () => {
    const tree = diffSchemas({ type: "object" }, { type: "array" });
    expect(tree.status).toBe("type-changed");
    expect(tree.changes[0]).toContain("type: object -> array");
  });
});

describe("diffSchemas: added/removed properties", () => {
  it("marks a property present only on the right as added", () => {
    const left = { type: "object", properties: { a: { type: "string" } } };
    const right = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "a").status).toBe("unchanged");
    expect(findChild(tree, "b").status).toBe("added");
  });

  it("marks a property present only on the left as removed", () => {
    const left = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } };
    const right = { type: "object", properties: { a: { type: "string" } } };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "b").status).toBe("removed");
  });

  it("recursively marks the entire subtree of an added nested object as added", () => {
    const left = { type: "object", properties: {} };
    const right = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: { city: { type: "string" }, zip: { type: "string" } },
        },
      },
    };
    const tree = diffSchemas(left, right);
    const address = findChild(tree, "address");
    expect(address.status).toBe("added");
    expect(findChild(address, "city").status).toBe("added");
    expect(findChild(address, "zip").status).toBe("added");
  });
});

describe("diffSchemas: type changes", () => {
  it("detects a property type change", () => {
    const left = { type: "object", properties: { age: { type: "string" } } };
    const right = { type: "object", properties: { age: { type: "integer" } } };
    const tree = diffSchemas(left, right);
    const age = findChild(tree, "age");
    expect(age.status).toBe("type-changed");
    expect(age.changes).toContain("type: string -> integer");
  });
});

describe("diffSchemas: constraint changes", () => {
  it("detects a constraint change without a type change", () => {
    const left = { type: "string", minLength: 1, maxLength: 10 };
    const right = { type: "string", minLength: 1, maxLength: 20 };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("constraint-changed");
    expect(tree.changes).toContain("maxLength: 10 -> 20");
  });

  it("detects a required-list change", () => {
    const left = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const right = { type: "object", properties: { a: { type: "string" } }, required: [] };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("constraint-changed");
    expect(tree.changes.some((c) => c.startsWith("required:"))).toBe(true);
  });

  it("detects an enum change", () => {
    const left = { type: "string", enum: ["a", "b"] };
    const right = { type: "string", enum: ["a", "b", "c"] };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("constraint-changed");
  });
});

describe("diffSchemas: array items", () => {
  it("recurses into array item schemas", () => {
    const left = { type: "array", items: { type: "string" } };
    const right = { type: "array", items: { type: "number" } };
    const tree = diffSchemas(left, right);
    const items = findChild(tree, "items");
    expect(items.status).toBe("type-changed");
  });

  it("diffs nested object properties inside array items", () => {
    const left = { type: "array", items: { type: "object", properties: { id: { type: "integer" } } } };
    const right = {
      type: "array",
      items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } },
    };
    const tree = diffSchemas(left, right);
    const items = findChild(tree, "items");
    expect(findChild(items, "name").status).toBe("added");
    expect(findChild(items, "id").status).toBe("unchanged");
  });
});

describe("diffSchemas: plain JSON documents (shape inference)", () => {
  it("diffs two plain JSON objects by inferring their shapes", () => {
    const a = { name: "Ada", age: 36 };
    const b = { name: "Ada", age: "36" }; // type changed from number to string
    const tree = diffSchemas(a, b);
    expect(findChild(tree, "age").status).toBe("type-changed");
    expect(findChild(tree, "name").status).toBe("unchanged");
  });
});

describe("summarizeDiff", () => {
  it("counts nodes by status across the whole tree", () => {
    const left = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } } };
    const right = { type: "object", properties: { a: { type: "integer" }, c: { type: "boolean" } } };
    const tree = diffSchemas(left, right);
    const counts = summarizeDiff(tree);
    expect(counts["type-changed"]).toBe(1); // a
    expect(counts.removed).toBe(1); // b
    expect(counts.added).toBe(1); // c
    expect(counts.unchanged).toBe(1); // root itself (only property-level changes)
  });
});

describe("breaking-change classification: required fields", () => {
  it("marks removing a required property as breaking", () => {
    const left = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a", "b"] };
    const right = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "b").breaking).toBe(true);
  });

  it("marks removing an optional (non-required) property as non-breaking", () => {
    const left = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a"] };
    const right = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "b").breaking).toBe(false);
  });

  it("marks adding a new required property as breaking", () => {
    const left = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const right = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a", "b"] };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "b").breaking).toBe(true);
  });

  it("marks adding a new optional property as non-breaking", () => {
    const left = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const right = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: ["a"] };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "b").breaking).toBe(false);
  });

  it("marks an existing property becoming required as breaking", () => {
    const left = { type: "object", properties: { a: { type: "string" } }, required: [] };
    const right = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "a").breaking).toBe(true);
  });

  it("marks an existing required property becoming optional as non-breaking", () => {
    const left = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const right = { type: "object", properties: { a: { type: "string" } }, required: [] };
    const tree = diffSchemas(left, right);
    expect(findChild(tree, "a").breaking).toBe(false);
  });

  it("does not mark nested descendants of an added/removed subtree as independently breaking", () => {
    const left = { type: "object", properties: {}, required: [] };
    const right = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"], // required *within* the new subtree, but the subtree itself is optional
        },
      },
      required: [],
    };
    const tree = diffSchemas(left, right);
    const address = findChild(tree, "address");
    expect(address.breaking).toBe(false); // "address" itself is optional
    expect(findChild(address, "city").breaking).toBe(false);
  });
});

describe("breaking-change classification: type changes", () => {
  it("marks narrowing a union type down to one member as breaking", () => {
    const left = { type: ["string", "number"] };
    const right = { type: "string" };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("type-changed");
    expect(tree.breaking).toBe(true);
  });

  it("marks widening a single type into a union as non-breaking", () => {
    const left = { type: "string" };
    const right = { type: ["string", "number"] };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("type-changed");
    expect(tree.breaking).toBe(false);
  });

  it("marks a disjoint type swap as breaking", () => {
    const left = { type: "string" };
    const right = { type: "integer" };
    const tree = diffSchemas(left, right);
    expect(tree.breaking).toBe(true);
  });

  it("marks going from unconstrained (no type) to constrained as breaking", () => {
    const left = { minLength: 0 };
    const right = { type: "string", minLength: 0 };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("type-changed");
    expect(tree.breaking).toBe(true);
  });

  it("marks going from constrained to unconstrained (type removed) as non-breaking", () => {
    const left = { type: "string" };
    // A bare `{}` would be treated as plain JSON data (shape-inferred to
    // `{type: "object"}`), not a schema -- use a `$schema`-marked object
    // with no `type` key to represent a genuinely unconstrained schema.
    const right = { $schema: "http://json-schema.org/draft-07/schema#" };
    const tree = diffSchemas(left, right);
    expect(tree.status).toBe("type-changed");
    expect(tree.breaking).toBe(false);
  });

  it("leaves an unchanged type non-breaking", () => {
    const tree = diffSchemas({ type: "string" }, { type: "string" });
    expect(tree.breaking).toBe(false);
  });
});

describe("breaking-change classification: numeric/length/items bounds", () => {
  it("marks raising minimum as breaking, lowering it as non-breaking", () => {
    const stricter = diffSchemas({ type: "number", minimum: 0 }, { type: "number", minimum: 5 });
    expect(stricter.breaking).toBe(true);
    const looser = diffSchemas({ type: "number", minimum: 5 }, { type: "number", minimum: 0 });
    expect(looser.breaking).toBe(false);
  });

  it("marks lowering maximum as breaking, raising it as non-breaking", () => {
    const stricter = diffSchemas({ type: "number", maximum: 100 }, { type: "number", maximum: 10 });
    expect(stricter.breaking).toBe(true);
    const looser = diffSchemas({ type: "number", maximum: 10 }, { type: "number", maximum: 100 });
    expect(looser.breaking).toBe(false);
  });

  it("marks introducing a minLength/maxLength bound as breaking, removing one as non-breaking", () => {
    const introduced = diffSchemas({ type: "string" }, { type: "string", maxLength: 10 });
    expect(introduced.breaking).toBe(true);
    const removed = diffSchemas({ type: "string", maxLength: 10 }, { type: "string" });
    expect(removed.breaking).toBe(false);
  });

  it("marks raising minItems as breaking and lowering maxItems as breaking", () => {
    const minRaised = diffSchemas({ type: "array", minItems: 1 }, { type: "array", minItems: 3 });
    expect(minRaised.breaking).toBe(true);
    const maxLowered = diffSchemas({ type: "array", maxItems: 10 }, { type: "array", maxItems: 2 });
    expect(maxLowered.breaking).toBe(true);
  });

  it("marks uniqueItems turning on as breaking and turning off as non-breaking", () => {
    const turnedOn = diffSchemas({ type: "array", uniqueItems: false }, { type: "array", uniqueItems: true });
    expect(turnedOn.breaking).toBe(true);
    const turnedOff = diffSchemas({ type: "array", uniqueItems: true }, { type: "array", uniqueItems: false });
    expect(turnedOff.breaking).toBe(false);
  });
});

describe("breaking-change classification: pattern, format, const", () => {
  it("marks adding a pattern as breaking and removing one as non-breaking", () => {
    const added = diffSchemas({ type: "string" }, { type: "string", pattern: "^[a-z]+$" });
    expect(added.breaking).toBe(true);
    const removed = diffSchemas({ type: "string", pattern: "^[a-z]+$" }, { type: "string" });
    expect(removed.breaking).toBe(false);
  });

  it("marks adding a const as breaking and removing one as non-breaking", () => {
    const added = diffSchemas({ type: "string" }, { type: "string", const: "fixed" });
    expect(added.breaking).toBe(true);
    const removed = diffSchemas({ type: "string", const: "fixed" }, { type: "string" });
    expect(removed.breaking).toBe(false);
  });

  it("does not treat a default-value or description change as breaking", () => {
    const defaultChanged = diffSchemas(
      { type: "string", default: "a" },
      { type: "string", default: "b" },
    );
    expect(defaultChanged.status).toBe("constraint-changed");
    expect(defaultChanged.breaking).toBe(false);

    const descriptionChanged = diffSchemas(
      { type: "string", description: "old" },
      { type: "string", description: "new" },
    );
    expect(descriptionChanged.breaking).toBe(false);
  });
});

describe("breaking-change classification: enum", () => {
  it("marks widening an enum (superset) as non-breaking", () => {
    const tree = diffSchemas({ type: "string", enum: ["a", "b"] }, { type: "string", enum: ["a", "b", "c"] });
    expect(tree.breaking).toBe(false);
  });

  it("marks narrowing an enum (drops an option) as breaking, even if it also adds one", () => {
    const dropOnly = diffSchemas({ type: "string", enum: ["a", "b"] }, { type: "string", enum: ["a"] });
    expect(dropOnly.breaking).toBe(true);

    const dropAndAdd = diffSchemas({ type: "string", enum: ["a", "b"] }, { type: "string", enum: ["a", "c"] });
    expect(dropAndAdd.breaking).toBe(true);
  });

  it("marks introducing a new enum restriction as breaking and removing enum entirely as non-breaking", () => {
    const introduced = diffSchemas({ type: "string" }, { type: "string", enum: ["a", "b"] });
    expect(introduced.breaking).toBe(true);
    const removed = diffSchemas({ type: "string", enum: ["a", "b"] }, { type: "string" });
    expect(removed.breaking).toBe(false);
  });
});

describe("breaking-change classification: aggregate helpers", () => {
  const left = {
    type: "object",
    properties: {
      id: { type: "string" },
      age: { type: "number", minimum: 0 },
      nickname: { type: "string" },
    },
    required: ["id", "age"],
  };
  const right = {
    type: "object",
    properties: {
      id: { type: "string" },
      age: { type: "number", minimum: 18 }, // breaking: stricter minimum
      email: { type: "string" }, // non-breaking: new optional field
    },
    required: ["id", "age", "email"], // "email" newly required -> breaking; "nickname" removed but was optional -> non-breaking
  };

  it("collectBreakingChanges finds every breaking node with its path", () => {
    const tree = diffSchemas(left, right);
    const breaking = collectBreakingChanges(tree);
    const paths = breaking.map((n) => n.path).sort();
    expect(paths).toEqual(["$.properties.age", "$.properties.email"].sort());
  });

  it("isBreakingChange is true when any node in the tree is breaking, false for an all-safe diff", () => {
    const tree = diffSchemas(left, right);
    expect(isBreakingChange(tree)).toBe(true);

    const safeLeft = { type: "object", properties: { a: { type: "string" } }, required: [] };
    const safeRight = { type: "object", properties: { a: { type: "string" }, b: { type: "number" } }, required: [] };
    expect(isBreakingChange(diffSchemas(safeLeft, safeRight))).toBe(false);
  });

  it("summarizeBreaking counts breaking vs. non-breaking changed nodes, excluding unchanged ones", () => {
    const tree = diffSchemas(left, right);
    const counts = summarizeBreaking(tree);
    // breaking: age (stricter minimum), email (added as required)
    // non-breaking: nickname (removed, was optional), root itself (its `required`
    // array's *text* changed -- "constraint-changed" -- but that's just the
    // textual record; the actual breaking-ness is attributed to the "email"
    // child node, not double-counted here).
    expect(counts.breaking).toBe(2);
    expect(counts.nonBreaking).toBe(2);

    const identical = diffSchemas({ type: "string" }, { type: "string" });
    expect(summarizeBreaking(identical)).toEqual({ breaking: 0, nonBreaking: 0 });
  });
});

describe("deepEqual", () => {
  it("compares primitives, arrays, and objects structurally", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });
});
