import { describe, expect, it } from "vitest";
import { parseNginxAccessLine, parseNginxTime } from "../src/parsers/nginxAccess.js";

describe("parseNginxAccessLine", () => {
  it("parses a standard combined-format line", () => {
    const line =
      '127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"';
    const entry = parseNginxAccessLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.ip).toBe("127.0.0.1");
    expect(entry?.remoteUser).toBe("frank");
    expect(entry?.method).toBe("GET");
    expect(entry?.path).toBe("/apache_pb.gif");
    expect(entry?.protocol).toBe("HTTP/1.0");
    expect(entry?.status).toBe(200);
    expect(entry?.bodyBytesSent).toBe(2326);
    expect(entry?.referer).toBe("http://www.example.com/start.html");
    expect(entry?.userAgent).toContain("Mozilla");
  });

  it("parses a 4xx and 5xx line correctly", () => {
    const notFound = parseNginxAccessLine(
      '10.0.0.5 - - [10/Oct/2023:14:00:00 +0000] "GET /missing HTTP/1.1" 404 0 "-" "-"',
    );
    expect(notFound?.status).toBe(404);

    const serverError = parseNginxAccessLine(
      '10.0.0.6 - - [10/Oct/2023:14:00:05 +0000] "POST /api/orders HTTP/1.1" 500 12 "-" "-"',
    );
    expect(serverError?.status).toBe(500);
  });

  it("handles a dash body_bytes_sent as undefined", () => {
    const entry = parseNginxAccessLine('1.1.1.1 - - [10/Oct/2023:14:00:00 +0000] "GET / HTTP/1.1" 200 - "-" "-"');
    expect(entry?.bodyBytesSent).toBeUndefined();
  });

  it("returns null for lines that do not match the combined format", () => {
    expect(parseNginxAccessLine("not a log line")).toBeNull();
    expect(parseNginxAccessLine("2024-01-01 ERROR something broke")).toBeNull();
  });
});

describe("parseNginxTime", () => {
  it("converts $time_local (with UTC offset) into a Date", () => {
    const date = parseNginxTime("10/Oct/2023:13:55:36 -0700");
    expect(date).toBeInstanceOf(Date);
    // 13:55:36 -0700 == 20:55:36 UTC
    expect(date?.toISOString()).toBe("2023-10-10T20:55:36.000Z");
  });

  it("handles a positive UTC offset", () => {
    const date = parseNginxTime("01/Jan/2024:00:00:00 +0200");
    expect(date?.toISOString()).toBe("2023-12-31T22:00:00.000Z");
  });

  it("returns undefined for malformed timestamps", () => {
    expect(parseNginxTime("not a timestamp")).toBeUndefined();
  });
});
