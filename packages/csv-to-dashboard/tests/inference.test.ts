import { describe, expect, it } from "vitest";
import { inferColumnType, inferColumns, isDateLike, isNumberLike } from "../src/lib/inference.js";

describe("isNumberLike", () => {
  it("accepts integers, decimals, negatives, and scientific notation", () => {
    expect(isNumberLike("42")).toBe(true);
    expect(isNumberLike("-3.14")).toBe(true);
    expect(isNumberLike("0.5")).toBe(true);
    expect(isNumberLike("1e10")).toBe(true);
    expect(isNumberLike("  7  ")).toBe(true);
  });

  it("rejects non-numeric text", () => {
    expect(isNumberLike("abc")).toBe(false);
    expect(isNumberLike("")).toBe(false);
    expect(isNumberLike("12abc")).toBe(false);
  });
});

describe("isDateLike", () => {
  it("accepts ISO dates and date-times", () => {
    expect(isDateLike("2024-01-31")).toBe(true);
    expect(isDateLike("2024-01-31T10:20:30Z")).toBe(true);
  });

  it("accepts common slash/dash formats", () => {
    expect(isDateLike("2024/01/31")).toBe(true);
    expect(isDateLike("01/31/2024")).toBe(true);
  });

  it("rejects plain numbers and arbitrary text", () => {
    expect(isDateLike("2024")).toBe(false);
    expect(isDateLike("hello")).toBe(false);
  });
});

describe("inferColumnType", () => {
  it("classifies a numeric column", () => {
    const result = inferColumnType(["1", "2", "3", "4.5", "-6"]);
    expect(result.type).toBe("number");
  });

  it("classifies a date column", () => {
    const result = inferColumnType(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(result.type).toBe("date");
  });

  it("classifies a low-cardinality text column as categorical", () => {
    const values = Array.from({ length: 20 }, (_, i) => (i % 3 === 0 ? "red" : i % 3 === 1 ? "green" : "blue"));
    const result = inferColumnType(values);
    expect(result.type).toBe("categorical");
    expect(result.distinctCount).toBe(3);
  });

  it("classifies a high-cardinality text column as text", () => {
    const values = Array.from({ length: 20 }, (_, i) => `unique-value-${i}`);
    const result = inferColumnType(values);
    expect(result.type).toBe("text");
  });

  it("tolerates a small fraction of malformed values", () => {
    const values = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "oops"];
    const result = inferColumnType(values);
    expect(result.type).toBe("number");
  });

  it("treats an entirely empty column as text with zero counts", () => {
    const result = inferColumnType(["", "", ""]);
    expect(result).toEqual({ type: "text", distinctCount: 0, nonEmptyCount: 0 });
  });
});

describe("inferColumns", () => {
  it("infers a type per column across a row matrix", () => {
    const headers = ["id", "signup_date", "plan"];
    const rows = [
      ["1", "2024-01-01", "pro"],
      ["2", "2024-01-02", "free"],
      ["3", "2024-01-03", "pro"],
      ["4", "2024-01-04", "free"],
    ];
    const columns = inferColumns(headers, rows);
    expect(columns.map((c) => c.type)).toEqual(["number", "date", "categorical"]);
    expect(columns[0]?.nullCount).toBe(0);
  });

  it("counts nulls for missing/empty values", () => {
    const headers = ["value"];
    const rows = [["1"], [""], ["3"], [""]];
    const columns = inferColumns(headers, rows);
    expect(columns[0]?.nullCount).toBe(2);
  });
});
