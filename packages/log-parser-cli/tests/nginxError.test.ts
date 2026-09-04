import { describe, expect, it } from "vitest";
import { parseNginxErrorLine, parseNginxErrorTime } from "../src/parsers/nginxError.js";

describe("parseNginxErrorLine", () => {
  it("parses a standard error log line with a connection id", () => {
    const line =
      '2023/10/10 13:55:36 [error] 1234#0: *5 open() "/var/www/html/favicon.ico" failed (2: No such file or directory), client: 127.0.0.1, server: localhost, request: "GET /favicon.ico HTTP/1.1", host: "localhost"';
    const entry = parseNginxErrorLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.level).toBe("error");
    expect(entry?.pid).toBe(1234);
    expect(entry?.tid).toBe(0);
    expect(entry?.connectionId).toBe(5);
    expect(entry?.ip).toBe("127.0.0.1");
    expect(entry?.requestPath).toBe("/favicon.ico");
    expect(entry?.message).toContain("favicon.ico");
  });

  it("parses a line without a connection id", () => {
    const line = "2023/10/10 13:56:00 [warn] 1234#0: worker process exiting";
    const entry = parseNginxErrorLine(line);
    expect(entry?.connectionId).toBeUndefined();
    expect(entry?.level).toBe("warn");
    expect(entry?.message).toBe("worker process exiting");
  });

  it("returns null for non-matching lines", () => {
    expect(parseNginxErrorLine("just some text")).toBeNull();
  });
});

describe("parseNginxErrorTime", () => {
  it("parses the error-log timestamp format as local time", () => {
    const date = parseNginxErrorTime("2023/10/10 13:55:36");
    expect(date).toBeInstanceOf(Date);
    expect(date?.getFullYear()).toBe(2023);
    expect(date?.getMonth()).toBe(9); // October is month index 9
    expect(date?.getDate()).toBe(10);
    expect(date?.getHours()).toBe(13);
    expect(date?.getMinutes()).toBe(55);
    expect(date?.getSeconds()).toBe(36);
  });

  it("returns undefined for malformed timestamps", () => {
    expect(parseNginxErrorTime("nope")).toBeUndefined();
  });
});
