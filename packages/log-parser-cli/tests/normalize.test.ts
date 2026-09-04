import { describe, expect, it } from "vitest";
import { normalizeMessage } from "../src/normalize.js";

describe("normalizeMessage", () => {
  it("replaces bare numbers so similar messages group together", () => {
    expect(normalizeMessage("user 123 not found")).toBe(normalizeMessage("user 456 not found"));
    expect(normalizeMessage("user 123 not found")).toBe("user <num> not found");
  });

  it("replaces UUIDs", () => {
    const a = normalizeMessage("order 550e8400-e29b-41d4-a716-446655440000 failed");
    const b = normalizeMessage("order 6ba7b810-9dad-11d1-80b4-00c04fd430c8 failed");
    expect(a).toBe(b);
    expect(a).toBe("order <uuid> failed");
  });

  it("replaces IP addresses", () => {
    const a = normalizeMessage("connection from 192.168.1.10 refused");
    const b = normalizeMessage("connection from 10.0.0.42 refused");
    expect(a).toBe(b);
    expect(a).toBe("connection from <ip> refused");
  });

  it("handles messages with multiple variable parts", () => {
    const normalized = normalizeMessage("request 42 from 10.0.0.1 took 300 ms");
    expect(normalized).toBe("request <num> from <ip> took <num> ms");
  });

  it("leaves messages with no variable parts unchanged", () => {
    expect(normalizeMessage("connection refused")).toBe("connection refused");
  });
});
