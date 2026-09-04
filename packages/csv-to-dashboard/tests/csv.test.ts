import { describe, expect, it } from "vitest";
import { parseCSV, parseCSVRows, parseCSVToObjects } from "../src/lib/csv.js";

describe("parseCSV", () => {
  it("parses a simple comma-separated file", () => {
    const text = "a,b,c\n1,2,3\n4,5,6\n";
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields containing embedded commas", () => {
    const text = 'name,city\n"Doe, John",Springfield\n';
    const { rows } = parseCSV(text);
    expect(rows).toEqual([["Doe, John", "Springfield"]]);
  });

  it("handles quoted fields containing embedded newlines", () => {
    const text = 'name,note\n"Doe, John","line one\nline two"\nJane,short\n';
    const { rows } = parseCSV(text);
    expect(rows).toEqual([
      ["Doe, John", "line one\nline two"],
      ["Jane", "short"],
    ]);
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const text = 'quote\n"She said ""hi"" to me"\n';
    const { rows } = parseCSV(text);
    expect(rows).toEqual([['She said "hi" to me']]);
  });

  it("supports CRLF line endings", () => {
    const text = "a,b\r\n1,2\r\n3,4\r\n";
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("does not naive-split quoted commas even when adjacent to unquoted fields", () => {
    const text = 'a,b,c\n1,"2,2b",3\n';
    const { rows } = parseCSV(text);
    expect(rows[0]).toEqual(["1", "2,2b", "3"]);
  });

  it("skips fully blank lines", () => {
    const text = "a,b\n1,2\n\n3,4\n";
    const { rows } = parseCSV(text);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles a file with no trailing newline", () => {
    const text = "a,b\n1,2";
    const { rows } = parseCSV(text);
    expect(rows).toEqual([["1", "2"]]);
  });

  it("returns empty headers/rows for empty input", () => {
    expect(parseCSV("")).toEqual({ headers: [], rows: [] });
  });

  it("parseCSVRows includes the header row as plain data", () => {
    const rows = parseCSVRows("a,b\n1,2\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("parseCSVToObjects maps rows to header-keyed records", () => {
    const records = parseCSVToObjects("name,age\nAda,36\nGrace,85\n");
    expect(records).toEqual([
      { name: "Ada", age: "36" },
      { name: "Grace", age: "85" },
    ]);
  });

  it("pads missing trailing fields with empty strings via parseCSVToObjects", () => {
    const records = parseCSVToObjects("a,b,c\n1,2\n");
    expect(records).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});
