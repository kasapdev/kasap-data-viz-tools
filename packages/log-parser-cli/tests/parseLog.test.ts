import { describe, expect, it } from "vitest";
import { detectFormat, parseLogLines } from "../src/parseLog.js";

const ACCESS_LINE =
  '127.0.0.1 - - [10/Oct/2023:13:55:36 -0700] "GET / HTTP/1.1" 200 100 "-" "-"';
const ERROR_LINE = '2023/10/10 13:55:36 [error] 1#0: *1 something failed, client: 1.2.3.4';
const GENERIC_LINE = "2024-01-01T00:00:00Z INFO server started";

describe("detectFormat", () => {
  it("detects nginx-access format", () => {
    expect(detectFormat([ACCESS_LINE])).toBe("nginx-access");
  });

  it("detects nginx-error format", () => {
    expect(detectFormat([ERROR_LINE])).toBe("nginx-error");
  });

  it("falls back to generic for anything else", () => {
    expect(detectFormat([GENERIC_LINE])).toBe("generic");
  });

  it("skips leading blank lines when detecting", () => {
    expect(detectFormat(["", "   ", ACCESS_LINE])).toBe("nginx-access");
  });
});

describe("parseLogLines", () => {
  it("auto-detects and parses nginx access lines into normalized entries", () => {
    const { format, entries } = parseLogLines([ACCESS_LINE]);
    expect(format).toBe("nginx-access");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe(200);
    expect(entries[0]?.ip).toBe("127.0.0.1");
  });

  it("auto-detects and parses nginx error lines into normalized entries", () => {
    const { format, entries } = parseLogLines([ERROR_LINE]);
    expect(format).toBe("nginx-error");
    expect(entries[0]?.level).toBe("error");
    expect(entries[0]?.ip).toBe("1.2.3.4");
  });

  it("respects an explicitly-provided format", () => {
    const { format, entries } = parseLogLines([GENERIC_LINE], "generic");
    expect(format).toBe("generic");
    expect(entries[0]?.level).toBe("INFO");
  });

  it("skips blank lines", () => {
    const { entries } = parseLogLines(["", ACCESS_LINE, "  ", ACCESS_LINE]);
    expect(entries).toHaveLength(2);
  });

  it("falls back to generic parsing for a line that doesn't match the resolved format", () => {
    const { entries } = parseLogLines([ACCESS_LINE, "some unrelated free-text line"], "nginx-access");
    expect(entries).toHaveLength(2);
    expect(entries[1]?.status).toBeUndefined();
    expect(entries[1]?.message).toBe("some unrelated free-text line");
  });
});
