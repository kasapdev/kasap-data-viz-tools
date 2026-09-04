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
): DiffNode {
  if (left === undefined && right === undefined) {
    return { path, key, status: "unchanged", changes: [], children: [] };
  }
  if (left === undefined) {
    return {
      path,
      key,
      status: "added",
      rightType: right?.type,
      changes: [],
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

  for (const constraintKey of CONSTRAINT_KEYS) {
    const lv = left[constraintKey];
    const rv = right[constraintKey];
    if (!deepEqual(lv, rv)) {
      changes.push(`${constraintKey}: ${describeValue(lv)} -> ${describeValue(rv)}`);
    }
  }

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

  return { path, key, status, leftType: left.type, rightType: right.type, changes, children };
}

/** Recursively mark an entire subtree as added or removed (used when a node exists on only one side). */
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
