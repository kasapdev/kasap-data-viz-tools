import { describe, expect, it } from "vitest";
import { inferShape, isLikelySchema, mergeShapes, toSchema } from "../src/lib/shape.js";

describe("isLikelySchema", () => {
  it("recognizes objects with schema marker keys", () => {
    expect(isLikelySchema({ type: "object" })).toBe(true);
    expect(isLikelySchema({ properties: {} })).toBe(true);
    expect(isLikelySchema({ $schema: "http://json-schema.org/draft-07/schema#" })).toBe(true);
  });

  it("rejects plain JSON documents", () => {
    expect(isLikelySchema({ name: "Ada", age: 36 })).toBe(false);
    expect(isLikelySchema([1, 2, 3])).toBe(false);
    expect(isLikelySchema("hello")).toBe(false);
    expect(isLikelySchema(null)).toBe(false);
  });
});

describe("inferShape", () => {
  it("infers primitive types", () => {
    expect(inferShape("hi")).toEqual({ type: "string" });
    expect(inferShape(42)).toEqual({ type: "integer" });
    expect(inferShape(3.14)).toEqual({ type: "number" });
    expect(inferShape(true)).toEqual({ type: "boolean" });
    expect(inferShape(null)).toEqual({ type: "null" });
  });

  it("infers an object shape with properties and required keys", () => {
    const shape = inferShape({ name: "Ada", age: 36 });
    expect(shape.type).toBe("object");
    expect(shape.properties?.name).toEqual({ type: "string" });
    expect(shape.properties?.age).toEqual({ type: "integer" });
    expect(shape.required).toEqual(["name", "age"]);
  });

  it("infers nested object shapes recursively", () => {
    const shape = inferShape({ user: { id: 1, tags: ["a", "b"] } });
    expect(shape.properties?.user?.type).toBe("object");
    expect(shape.properties?.user?.properties?.id).toEqual({ type: "integer" });
    expect(shape.properties?.user?.properties?.tags).toEqual({ type: "array", items: { type: "string" } });
  });

  it("infers array item shape from array elements", () => {
    const shape = inferShape([1, 2, 3]);
    expect(shape).toEqual({ type: "array", items: { type: "integer" } });
  });

  it("unifies mixed-type array elements into a type union", () => {
    const shape = inferShape([1, "two", 3]);
    expect(shape.type).toBe("array");
    expect(new Set(shape.items?.type)).toEqual(new Set(["integer", "string"]));
  });

  it("handles an empty array", () => {
    expect(inferShape([])).toEqual({ type: "array" });
  });
});

describe("mergeShapes", () => {
  it("merges object properties and intersects required keys", () => {
    const a = { type: "object", properties: { x: { type: "number" } }, required: ["x"] };
    const b = { type: "object", properties: { y: { type: "string" } }, required: ["y"] };
    const merged = mergeShapes(a, b);
    expect(merged.properties?.x).toEqual({ type: "number" });
    expect(merged.properties?.y).toEqual({ type: "string" });
    expect(merged.required).toEqual([]); // neither key is required in both
  });
});

describe("toSchema", () => {
  it("passes an existing schema through unchanged", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    expect(toSchema(schema)).toBe(schema);
  });

  it("infers a shape for plain JSON", () => {
    const shape = toSchema({ a: 1 });
    expect(shape.type).toBe("object");
    expect(shape.properties?.a).toEqual({ type: "integer" });
  });
});
