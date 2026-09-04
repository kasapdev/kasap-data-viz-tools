/**
 * Minimal JSON Schema representation used internally by the diff algorithm,
 * plus shape inference for plain JSON documents that aren't already schemas.
 */

export interface MinimalSchema {
  type?: string | string[];
  properties?: Record<string, MinimalSchema>;
  items?: MinimalSchema;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  format?: string;
  [key: string]: unknown;
}

const SCHEMA_MARKER_KEYS = ["type", "properties", "$schema", "items", "enum", "const", "anyOf", "oneOf", "allOf"];

/** Heuristic: does this JSON value look like a JSON Schema already? */
export function isLikelySchema(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return false;
  const obj = doc as Record<string, unknown>;
  return SCHEMA_MARKER_KEYS.some((k) => k in obj);
}

/**
 * Infer a minimal schema shape from an arbitrary JSON value: objects
 * become `{ type: "object", properties, required }`, arrays become
 * `{ type: "array", items }` (items inferred by merging the shapes of all
 * elements), and primitives map to their JSON Schema type name.
 */
export function inferShape(value: unknown): MinimalSchema {
  if (value === null) return { type: "null" };

  if (Array.isArray(value)) {
    if (value.length === 0) return { type: "array" };
    const itemShapes = value.map(inferShape);
    const items = itemShapes.reduce((a, b) => mergeShapes(a, b));
    return { type: "array", items };
  }

  const jsType = typeof value;
  if (jsType === "object") {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, MinimalSchema> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      properties[k] = inferShape(v);
      if (v !== undefined) required.push(k);
    }
    return { type: "object", properties, required };
  }

  if (jsType === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }
  if (jsType === "string") return { type: "string" };
  if (jsType === "boolean") return { type: "boolean" };
  return { type: "unknown" };
}

/** Merge two inferred shapes (used to unify array element shapes). */
export function mergeShapes(a: MinimalSchema, b: MinimalSchema): MinimalSchema {
  const typesA = typeArray(a.type);
  const typesB = typeArray(b.type);
  const types = [...new Set([...typesA, ...typesB])];
  const merged: MinimalSchema = { type: types.length <= 1 ? types[0] : types };

  if (a.properties || b.properties) {
    const properties: Record<string, MinimalSchema> = { ...a.properties };
    for (const [k, v] of Object.entries(b.properties ?? {})) {
      const existing = properties[k];
      properties[k] = existing ? mergeShapes(existing, v) : v;
    }
    merged.properties = properties;

    const requiredB = new Set(b.required ?? []);
    merged.required = (a.required ?? []).filter((k) => requiredB.has(k));
  }

  if (a.items || b.items) {
    merged.items = a.items && b.items ? mergeShapes(a.items, b.items) : (a.items ?? b.items);
  }

  return merged;
}

function typeArray(type: string | string[] | undefined): string[] {
  if (type === undefined) return [];
  return Array.isArray(type) ? type : [type];
}

/** Convert a JSON document into a MinimalSchema: pass through if it already looks like a schema, otherwise infer its shape. */
export function toSchema(doc: unknown): MinimalSchema {
  if (isLikelySchema(doc)) return doc as MinimalSchema;
  return inferShape(doc);
}
