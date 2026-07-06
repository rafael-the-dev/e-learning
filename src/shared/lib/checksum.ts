import { createHash } from "node:crypto";

// =============================================================================
// CONTENT-ONLY CHECKSUM
// -----------------------------------------------------------------------------
// Deterministic canonical serialization + SHA-256 of arbitrary JSON-like
// payloads. Used by the Academic Transcript Engine to detect whether the
// CONTENT of a transcript has changed (staleness / supersede decisions).
//
// This is CONTENT-ONLY: it never mixes in a secret, an org signature, a
// timestamp, or any transport concern. A signed/exportable digest is a
// separate Phase-4 export concern and must not reuse this helper's output as if
// it were tamper-evident.
// =============================================================================

// Number normalization rule:
//   Every finite number (and every Decimal-like object) is normalized through
//   JavaScript's Number, then serialized with its default `String(Number(x))`
//   form. This collapses trailing-zero / notation differences so that 1.50,
//   1.5 and "1.5" all canonicalize to the string "1.5", and 1.0 / 1 both
//   canonicalize to "1". Non-finite numbers (NaN, ±Infinity) are serialized as
//   "null" (mirroring JSON.stringify) so they never produce an unstable form.
function normalizeNumber(n: number): string {
  if (!Number.isFinite(n)) return "null";
  return String(n);
}

// A Decimal-like value is any non-null object exposing a numeric `toString`
// (Prisma.Decimal, big.js, etc.). We route it through its string form and then
// through Number normalization so 1.50 and 1.5 hash identically.
function isDecimalLike(value: object): boolean {
  const maybe = value as { toFixed?: unknown; toString?: unknown };
  return typeof maybe.toFixed === "function" && typeof maybe.toString === "function";
}

/**
 * Deterministic canonical string form of a JSON-like value.
 *
 * - objects: keys sorted lexicographically, recursively; keys whose value is
 *   `undefined` are omitted (treated as absent).
 * - arrays: order is PRESERVED (order is significant).
 * - numbers / Decimal-like: normalized (see {@link normalizeNumber}).
 * - Date: ISO-8601 string.
 * - null: serialized explicitly as `null`.
 * - undefined (top-level): serialized as the empty marker `undefined`.
 * - strings / booleans: as-is.
 */
export function canonicalize(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";

  const type = typeof value;

  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") return normalizeNumber(value as number);
  if (type === "bigint") return `${(value as bigint).toString()}`;

  if (value instanceof Date) return JSON.stringify(value.toISOString());

  if (Array.isArray(value)) {
    // Order preserved: `undefined` slots become explicit null to keep positions
    // (mirrors JSON.stringify array semantics).
    return `[${value.map((item) => (item === undefined ? "null" : canonicalize(item))).join(",")}]`;
  }

  if (type === "object") {
    const obj = value as object;

    if (isDecimalLike(obj)) {
      // Route through Number normalization so 1.50 === 1.5 in the digest.
      return normalizeNumber(Number(obj.toString()));
    }

    const record = obj as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined) // omit undefined-valued keys
      .sort();

    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
    return `{${parts.join(",")}}`;
  }

  // Functions / symbols are not valid content — fail loud rather than hash a
  // non-deterministic form.
  throw new TypeError(`canonicalize: unsupported value of type "${type}"`);
}

/**
 * Lowercase hex SHA-256 of the canonical form of `payload`. CONTENT-ONLY.
 */
export function contentChecksum(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload), "utf8").digest("hex");
}
