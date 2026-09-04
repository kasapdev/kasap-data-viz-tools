/**
 * RFC4180-aware CSV parser.
 *
 * Handles quoted fields with embedded commas, newlines, and escaped
 * double-quotes ("") without ever naive-splitting on commas. Supports
 * CRLF, LF, and lone-CR line endings, and skips fully blank lines.
 */

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

/**
 * Parse raw CSV text into a headers array and a matrix of string rows.
 * The first non-blank row is treated as the header row.
 */
export function parseCSV(text: string): ParsedCSV {
  const rawRows = parseCSVRows(text);
  const nonEmptyRows = rawRows.filter((r) => !(r.length === 1 && r[0] === ""));

  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headers, ...dataRows] = nonEmptyRows as [string[], ...string[][]];
  return { headers, rows: dataRows };
}

/**
 * Parse raw CSV text into a matrix of string rows (including the header
 * row, if any, as the first row). Lower-level primitive used by parseCSV.
 */
export function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        // Embedded newline or comma inside a quoted field is literal data.
        field += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      pushField();
      i += 1;
    } else if (ch === "\r") {
      pushRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else if (ch === "\n") {
      pushRow();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  // Flush a trailing field/row that wasn't terminated by a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/**
 * Convenience helper: parse CSV text into an array of plain objects keyed
 * by header name.
 */
export function parseCSVToObjects(text: string): Record<string, string>[] {
  const { headers, rows } = parseCSV(text);
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] ?? "";
    });
    return record;
  });
}
