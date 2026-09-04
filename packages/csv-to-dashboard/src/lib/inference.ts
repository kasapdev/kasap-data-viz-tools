/**
 * Column type inference for parsed CSV data.
 *
 * Scans sample values for each column and classifies it as one of
 * 'number' | 'date' | 'categorical' | 'text' using simple, explainable
 * heuristics (not a fully general type system, but real logic that scans
 * real sample values rather than guessing from the header name alone).
 */

export type ColumnType = "number" | "date" | "categorical" | "text";

export interface ColumnInference {
  name: string;
  type: ColumnType;
  distinctCount: number;
  nonEmptyCount: number;
  nullCount: number;
  sampleSize: number;
}

const MAX_SAMPLE = 500;

/** Fraction of sampled values that must match a type for it to be assigned. */
const TYPE_MATCH_THRESHOLD = 0.9;

/** Categorical columns must have low cardinality relative to sample size. */
const CATEGORICAL_MAX_DISTINCT = 50;
const CATEGORICAL_MAX_RATIO = 0.5;

const NUMBER_PATTERN = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

const DATE_PATTERNS: RegExp[] = [
  // ISO 8601 date or date-time, with optional time/zone.
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  // 2024/01/31
  /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  // 01/31/2024 or 31/01/2024
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  // 01-31-2024 or 31-01-2024
  /^\d{1,2}-\d{1,2}-\d{4}$/,
];

export function isNumberLike(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return NUMBER_PATTERN.test(trimmed);
}

export function isDateLike(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  // Plain numbers (e.g. "2024") should not be treated as dates even though
  // Date.parse would happily accept them.
  if (NUMBER_PATTERN.test(trimmed)) return false;
  const matchesPattern = DATE_PATTERNS.some((re) => re.test(trimmed));
  if (!matchesPattern) return false;
  return !Number.isNaN(Date.parse(trimmed));
}

interface TypeAssessment {
  type: ColumnType;
  distinctCount: number;
  nonEmptyCount: number;
}

export function inferColumnType(values: string[]): TypeAssessment {
  const nonEmpty = values.map((v) => v.trim()).filter((v) => v !== "");
  const distinct = new Set(nonEmpty);

  if (nonEmpty.length === 0) {
    return { type: "text", distinctCount: 0, nonEmptyCount: 0 };
  }

  const sample = nonEmpty.slice(0, MAX_SAMPLE);

  const numberMatches = sample.filter(isNumberLike).length;
  if (numberMatches / sample.length >= TYPE_MATCH_THRESHOLD) {
    return { type: "number", distinctCount: distinct.size, nonEmptyCount: nonEmpty.length };
  }

  const dateMatches = sample.filter(isDateLike).length;
  if (dateMatches / sample.length >= TYPE_MATCH_THRESHOLD) {
    return { type: "date", distinctCount: distinct.size, nonEmptyCount: nonEmpty.length };
  }

  const cardinalityRatio = distinct.size / nonEmpty.length;
  if (distinct.size <= CATEGORICAL_MAX_DISTINCT && cardinalityRatio <= CATEGORICAL_MAX_RATIO) {
    return { type: "categorical", distinctCount: distinct.size, nonEmptyCount: nonEmpty.length };
  }

  return { type: "text", distinctCount: distinct.size, nonEmptyCount: nonEmpty.length };
}

export function inferColumns(headers: string[], rows: string[][]): ColumnInference[] {
  return headers.map((name, colIdx) => {
    const values = rows.map((row) => row[colIdx] ?? "");
    const assessment = inferColumnType(values);
    return {
      name,
      type: assessment.type,
      distinctCount: assessment.distinctCount,
      nonEmptyCount: assessment.nonEmptyCount,
      nullCount: values.length - assessment.nonEmptyCount,
      sampleSize: values.length,
    };
  });
}
