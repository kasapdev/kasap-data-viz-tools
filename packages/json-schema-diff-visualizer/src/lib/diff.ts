/**
 * Recursive structural tree-diff between two JSON Schemas (or shapes
 * inferred from plain JSON documents). Produces a DiffNode tree where each
 * node -- object property, array items schema, or the root -- is tagged
 * with a diff status and, for changed nodes, a human-readable list of what
 * changed.
 */

import { type MinimalSchema, toSchema } from "./shape.js";

export type DiffStatus = "added" | "removed" | "type-changed" | "constraint-changed" | "unchanged";

export interface DiffNode {
  /** JSON-pointer-ish path to this node, e.g. "$.properties.age". */
  path: string;
  /** The property name (or "items"/"$" for array-items/root nodes). */
  key: string;
  status: DiffStatus;
  leftType?: string | string[];
  rightType?: string | string[];
  /** Human-readable descriptions of constraint changes at this node. */
  changes: string[];
  /**
   * Whether *this node's own* change (not its descendants') is a
   * backward-incompatible change under JSON Schema semantics -- i.e. some
   * document that validated against the left schema could fail to validate
   * against the right schema. See `isTypeChangeBreaking`, `isConstraintBreaking`,
   * and the `required`-handling in `diffNode` for the exact rules.
   * Always `false` for "unchanged" nodes.
   */
  breaking: boolean;
  children: DiffNode[];
}

const CONSTRAINT_KEYS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "enum",
  "const",
  "required",
  "format",
  "default",
  "description",
] as const;

/** Diff two full JSON documents (schemas, or plain JSON to infer shapes from). */
export function diffSchemas(leftDoc: unknown, rightDoc: unknown): DiffNode {
  const left = toSchema(leftDoc);
  const right = toSchema(rightDoc);
  return diffNode(left, right, "$", "$");
}

function diffNode(
  left: MinimalSchema | undefined,
  right: MinimalSchema | undefined,
  key: string,
  path: string,
  /** Was `key` listed in the *parent* schema's `required` array on each side? Irrelevant (left false) for the root node and array-items nodes, which have no parent `required` list. */
  leftRequiredInParent = false,
  rightRequiredInParent = false,
): DiffNode {
  if (left === undefined && right === undefined) {
    return { path, key, status: "unchanged", changes: [], breaking: false, children: [] };
  }
  if (left === undefined) {
    return {
      path,
      key,
      status: "added",
      rightType: right?.type,
      changes: [],
      // Adding a new required field is breaking (existing documents that
      // never had it now fail validation); adding an optional field isn't.
      breaking: rightRequiredInParent,
      children: subtreeForOneSide(right, "added", path),
    };
  }
  if (right === undefined) {
    return {
      path,
      key,
      status: "removed",
      leftType: left.type,
      changes: [],
      // Removing a field that was required is breaking; removing an
      // optional field is not (nothing depended on it being present).
      breaking: leftRequiredInParent,
      children: subtreeForOneSide(left, "removed", path),
    };
  }

  const changes: string[] = [];
  const leftTypes = normalizeType(left.type);
  const rightTypes = normalizeType(right.type);
  const typeChanged = !sameTypeSet(leftTypes, rightTypes);
  if (typeChanged) {
    changes.push(`type: ${describeType(left.type)} -> ${describeType(right.type)}`);
  }

  let constraintBreaking = false;
  for (const constraintKey of CONSTRAINT_KEYS) {
    const lv = left[constraintKey];
    const rv = right[constraintKey];
    if (!deepEqual(lv, rv)) {
      changes.push(`${constraintKey}: ${describeValue(lv)} -> ${describeValue(rv)}`);
      if (constraintKey !== "required" && isConstraintBreaking(constraintKey, lv, rv)) {
        constraintBreaking = true;
      }
    }
  }

  // "required" is intentionally excluded from the generic constraint-value
  // comparison above: a raw array-equality check can't tell *which
  // direction* it changed. Instead, each property's own required-ness is
  // evaluated where that property is diffed (below, and at the top of this
  // function for added/removed nodes) via `leftRequiredInParent` /
  // `rightRequiredInParent`, computed from *this* node's `required` array
  // when recursing into `properties`. The property itself flipping from
  // optional-or-absent to required in its parent's required list is
  // breaking; the reverse (required -> optional) is a safe relaxation.
  const parentRequiredBreaking = !leftRequiredInParent && rightRequiredInParent;

  const children: DiffNode[] = [];

  if (left.properties || right.properties) {
    const allKeys = new Set([...Object.keys(left.properties ?? {}), ...Object.keys(right.properties ?? {})]);
    for (const propKey of [...allKeys].sort()) {
      children.push(
        diffNode(
          left.properties?.[propKey],
          right.properties?.[propKey],
          propKey,
          `${path}.properties.${propKey}`,
          (left.required ?? []).includes(propKey),
          (right.required ?? []).includes(propKey),
        ),
      );
    }
  }

  if (left.items || right.items) {
    children.push(diffNode(left.items, right.items, "items", `${path}.items`));
  }

  let status: DiffStatus;
  if (typeChanged) {
    status = "type-changed";
  } else if (changes.length > 0) {
    status = "constraint-changed";
  } else {
    status = "unchanged";
  }

  const breaking =
    (typeChanged && isTypeChangeBreaking(leftTypes, rightTypes)) || constraintBreaking || parentRequiredBreaking;

  return { path, key, status, leftType: left.type, rightType: right.type, changes, breaking, children };
}

/**
 * Recursively mark an entire subtree as added or removed (used when a node
 * exists on only one side). These descendants are never independently
 * `breaking`: the single top-level added/removed node already captures
 * whether the containing property's (dis)appearance breaks the contract,
 * and that top-level node is not produced by this function -- see
 * `diffNode`'s `left === undefined` / `right === undefined` branches.
 */
function subtreeForOneSide(schema: MinimalSchema | undefined, status: "added" | "removed", path: string): DiffNode[] {
  if (!schema) return [];
  const children: DiffNode[] = [];

  if (schema.properties) {
    for (const [k, v] of Object.entries(schema.properties)) {
      const childPath = `${path}.properties.${k}`;
      children.push({
        path: childPath,
        key: k,
        status,
        leftType: status === "removed" ? v.type : undefined,
        rightType: status === "added" ? v.type : undefined,
        changes: [],
        breaking: false,
        children: subtreeForOneSide(v, status, childPath),
      });
    }
  }

  if (schema.items) {
    const childPath = `${path}.items`;
    children.push({
      path: childPath,
      key: "items",
      status,
      leftType: status === "removed" ? schema.items.type : undefined,
      rightType: status === "added" ? schema.items.type : undefined,
      changes: [],
      breaking: false,
      children: subtreeForOneSide(schema.items, status, childPath),
    });
  }

  return children;
}

/** Recursively count nodes by status -- handy for a top-of-page summary in the UI. */
export function summarizeDiff(root: DiffNode): Record<DiffStatus, number> {
  const counts: Record<DiffStatus, number> = {
    added: 0,
    removed: 0,
    "type-changed": 0,
    "constraint-changed": 0,
    unchanged: 0,
  };
  const visit = (node: DiffNode) => {
    counts[node.status] += 1;
    node.children.forEach(visit);
  };
  visit(root);
  return counts;
}

/**
 * Recursively collect every node whose *own* change is breaking (see
 * `DiffNode.breaking`), in document order. Useful for CI gating or for a
 * "breaking changes only" view.
 */
export function collectBreakingChanges(root: DiffNode): DiffNode[] {
  const found: DiffNode[] = [];
  const visit = (node: DiffNode) => {
    if (node.breaking) found.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return found;
}

/** Whether the diff tree contains at least one backward-incompatible change anywhere. */
export function isBreakingChange(root: DiffNode): boolean {
  if (root.breaking) return true;
  return root.children.some(isBreakingChange);
}

/** Count of breaking vs. non-breaking *changed* nodes across the whole tree (unchanged nodes are excluded from both). */
export function summarizeBreaking(root: DiffNode): { breaking: number; nonBreaking: number } {
  let breaking = 0;
  let nonBreaking = 0;
  const visit = (node: DiffNode) => {
    if (node.status !== "unchanged") {
      if (node.breaking) breaking += 1;
      else nonBreaking += 1;
    }
    node.children.forEach(visit);
  };
  visit(root);
  return { breaking, nonBreaking };
}

/**
 * Is a `type` change backward-incompatible? Treats a missing `type` as
 * "unconstrained" (broadest possible set, matches any value) rather than
 * an empty set, since JSON Schema treats an absent `type` keyword as
 * imposing no type restriction at all.
 *  - Unconstrained -> constrained, or a proper narrowing of an existing
 *    type set (e.g. `["string","number"]` -> `["string"]`): breaking.
 *  - Constrained -> unconstrained, or a proper widening (e.g. `"string"`
 *    -> `["string","number"]`): non-breaking.
 *  - Anything else (partial overlap or fully disjoint types, e.g.
 *    `"string"` -> `"integer"`): breaking, since some previously-valid
 *    values are no longer valid.
 */
function isTypeChangeBreaking(leftTypes: string[], rightTypes: string[]): boolean {
  if (leftTypes.length === 0) return rightTypes.length > 0; // was unconstrained
  if (rightTypes.length === 0) return false; // became unconstrained
  if (isSubset(rightTypes, leftTypes)) return true; // narrowed (proper subset, since sets already differ)
  if (isSubset(leftTypes, rightTypes)) return false; // widened
  return true; // disjoint or partial overlap
}

function isSubset(a: string[], b: string[]): boolean {
  return a.every((v) => b.includes(v));
}

/** Is a change to a single constraint keyword (other than `required`, handled separately) backward-incompatible? */
function isConstraintBreaking(key: string, leftValue: unknown, rightValue: unknown): boolean {
  switch (key) {
    case "minimum":
    case "exclusiveMinimum":
    case "minLength":
    case "minItems":
      return isStricterLowerBound(leftValue, rightValue);
    case "maximum":
    case "exclusiveMaximum":
    case "maxLength":
    case "maxItems":
      return isStricterUpperBound(leftValue, rightValue);
    case "pattern":
    case "format":
      // Adding or changing the pattern/format restricts which values pass;
      // removing it (rightValue undefined) relaxes the restriction.
      return rightValue !== undefined;
    case "uniqueItems":
      return rightValue === true && leftValue !== true;
    case "enum":
      return isEnumBreaking(leftValue, rightValue);
    case "const":
      // Adding/changing a const pins the value to exactly one option;
      // removing it (rightValue undefined) relaxes the restriction.
      return rightValue !== undefined;
    case "default":
    case "description":
      // Pure metadata/documentation -- never restricts which values validate.
      return false;
    default:
      return true;
  }
}

/** True if `right` raises the floor (or introduces one) relative to `left`, i.e. `minimum`/`minLength`/`minItems`/`exclusiveMinimum` getting stricter. */
function isStricterLowerBound(left: unknown, right: unknown): boolean {
  if (typeof right !== "number") return false; // bound removed or non-numeric: not a stricter lower bound
  if (typeof left !== "number") return true; // no previous bound -> now bounded
  return right > left;
}

/** True if `right` lowers the ceiling (or introduces one) relative to `left`, i.e. `maximum`/`maxLength`/`maxItems`/`exclusiveMaximum` getting stricter. */
function isStricterUpperBound(left: unknown, right: unknown): boolean {
  if (typeof right !== "number") return false;
  if (typeof left !== "number") return true;
  return right < left;
}

/**
 * Is an `enum` change backward-incompatible? An enum change is a *safe
 * relaxation* only when every previously-allowed value is still allowed
 * (i.e. the old enum is a subset of the new one, or the enum was removed
 * entirely). Anything that drops an option -- even while adding others --
 * can reject previously-valid documents, so it's treated as breaking.
 */
function isEnumBreaking(left: unknown, right: unknown): boolean {
  const leftArr = Array.isArray(left) ? left : undefined;
  const rightArr = Array.isArray(right) ? right : undefined;
  if (leftArr === undefined) return rightArr !== undefined; // enum newly introduced -> restricts
  if (rightArr === undefined) return false; // enum removed -> relaxes
  const leftStillAllowed = leftArr.every((lv) => rightArr.some((rv) => deepEqual(lv, rv)));
  return !leftStillAllowed;
}

function normalizeType(type: string | string[] | undefined): string[] {
  if (type === undefined) return [];
  return Array.isArray(type) ? [...type].sort() : [type];
}

function sameTypeSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function describeType(type: string | string[] | undefined): string {
  if (type === undefined) return "undefined";
  return Array.isArray(type) ? type.join("|") : type;
}

function describeValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    if (aKeys.length !== bKeys.length) return false;
    if (aKeys.some((k, i) => k !== bKeys[i])) return false;
    return aKeys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}
