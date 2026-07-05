import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// =============================================================================
// Static guard — Fix H2 (end-to-end).
//
// The justification review workflow (approve / reject) must NEVER mutate the
// factual AttendanceRecord. The moment someone re-introduces a record write
// (e.g. overwriting status to EXCUSED or zeroing minutesAttended on approval),
// the pure H2 weighting fix becomes unreachable in production again. This guard
// fails loudly on that regression.
//
// It is a SOURCE check (comments are stripped first, so the explanatory prose in
// the commands that legitimately mentions "EXCUSED" is NOT matched).
// =============================================================================

const here = dirname(fileURLToPath(import.meta.url));
// __tests__ → commands → attendance → modules → src → <repo root>
const repoRoot = resolve(here, "..", "..", "..", "..", "..");

const REVIEW_COMMANDS = [
  "src/modules/attendance/commands/approve-attendance-justification.command.ts",
  "src/modules/attendance/commands/reject-attendance-justification.command.ts",
];

/** Remove block + line comments so prose mentioning EXCUSED never trips a match. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("justification review commands never mutate the attendance record (Fix H2)", () => {
  it.each(REVIEW_COMMANDS)("%s does not write status EXCUSED", (relPath) => {
    const code = stripComments(readFileSync(resolve(repoRoot, relPath), "utf8"));
    // No `status: "EXCUSED"` assignment (single or double quoted).
    expect(/status\s*:\s*["']EXCUSED["']/.test(code)).toBe(false);
  });

  it.each(REVIEW_COMMANDS)("%s does not zero/reset minutesAttended", (relPath) => {
    const code = stripComments(readFileSync(resolve(repoRoot, relPath), "utf8"));
    expect(/minutesAttended\s*:/.test(code)).toBe(false);
  });

  it.each(REVIEW_COMMANDS)("%s does not mutate the attendance record directly", (relPath) => {
    const code = stripComments(readFileSync(resolve(repoRoot, relPath), "utf8"));
    // No `attendanceRecord.update` / `.updateMany` / `.upsert` on the review path.
    expect(/attendanceRecord\s*\.\s*(update|updateMany|upsert)\b/.test(code)).toBe(false);
  });
});
