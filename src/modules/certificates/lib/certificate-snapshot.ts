// =============================================================================
// CERTIFICATE SNAPSHOT HELPERS — pure, READ-ONLY
// -----------------------------------------------------------------------------
// Shared readers over a certificate's FROZEN JSON snapshot columns
// (`studentSnapshot` / `courseSnapshot`). They only parse and copy stored identity
// facts — no academic read, no recomputation, no reshaping. Consolidated here so the
// portal mapper, the public-verification service, and the export commands share ONE
// implementation (previously copied verbatim in each), and a display rule can never
// drift between them.
//
// `parseSnapshot` is intentionally lenient (malformed/empty → `{}`), matching how
// display/read paths must never throw on a stored blob. A command that needs strict
// parsing (e.g. issue-time integrity) parses on its own.
// =============================================================================

/** Parse a stored JSON snapshot column. Empty/malformed → `{}` (never throws). */
export function parseSnapshot(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Holder name from the frozen student snapshot (`fullName`, else `firstName` +
 *  `lastName`). Returns `null` when neither is present. */
export function readStudentFullName(studentSnapshot: string | null): string | null {
  const parsed = parseSnapshot(studentSnapshot);
  const full = typeof parsed.fullName === "string" ? parsed.fullName.trim() : "";
  if (full) return full;
  const composed = [parsed.firstName, parsed.lastName]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" ")
    .trim();
  return composed || null;
}

/** Course name from the frozen course snapshot (`null` when absent). */
export function readCourseName(courseSnapshot: string | null): string | null {
  const parsed = parseSnapshot(courseSnapshot);
  return typeof parsed.courseName === "string" ? parsed.courseName : null;
}
