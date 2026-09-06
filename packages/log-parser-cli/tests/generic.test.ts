import { describe, expect, it } from "vitest";
import { parseGenericLine } from "../src/parsers/generic.js";

describe("parseGenericLine", () => {
  it("extracts an ISO timestamp and level word", () => {
    const entry = parseGenericLine("2024-01-15T10:30:00.123Z ERROR Failed to connect to database: connection refused");
    expect(entry.level).toBe("ERROR");
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.message).toBe("Failed to connect to database: connection refused");
  });

  it("extracts a bracketed level with a space-separated timestamp", () => {
    const entry = parseGenericLine("2024-01-15 10:30:00 [WARN] Cache miss for key abc123");
    expect(entry.level).toBe("WARN");
    expect(entry.message).toBe("Cache miss for key abc123");
  });

  it("falls back to the whole line as the message when nothing matches", () => {
    const entry = parseGenericLine("this is just plain text with no structure");
    expect(entry.level).toBeUndefined();
    expect(entry.timestamp).toBeUndefined();
    expect(entry.message).toBe("this is just plain text with no structure");
  });

  it("recognizes all supported level words", () => {
    for (const level of ["TRACE", "DEBUG", "INFO", "WARN", "WARNING", "ERROR", "FATAL"]) {
      const entry = parseGenericLine(`2024-01-01T00:00:00Z ${level} something happened`);
      expect(entry.level).toBe(level);
    }
  });

  it("still extracts the timestamp when no level word is present", () => {
    const entry = parseGenericLine("2024-01-01T00:00:00Z server started successfully");
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.level).toBeUndefined();
    expect(entry.message).toBe("server started successfully");
  });

  it("still extracts the timestamp when the separator has no level word", () => {
    const entry = parseGenericLine("2024-01-01T00:00:00Z - something happened");
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.level).toBeUndefined();
    expect(entry.message).toBe("something happened");
  });

  it("does not mistake a word merely prefixed by a level word for that level", () => {
    const entry = parseGenericLine("2024-01-01T00:00:00Z ERRORS occurred while doing X");
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.level).toBeUndefined();
    expect(entry.message).toBe("ERRORS occurred while doing X");
  });
});
