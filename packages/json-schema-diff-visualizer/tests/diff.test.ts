import { describe, expect, it } from "vitest";
import { deepEqual, diffSchemas, summarizeDiff } from "../src/lib/diff.js";

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
