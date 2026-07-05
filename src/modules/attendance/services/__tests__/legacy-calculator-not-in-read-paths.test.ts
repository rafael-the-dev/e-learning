import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// =============================================================================
// Guard: the retired legacy attendance calculator must NEVER be imported by a
// live read path (Fix C1). Attendance numbers shown in reports, Student 360 and
// the risk service must all come from the persisted StudentSubjectAttendanceSummary.
//
// This is a static import check — it fails loudly the moment someone re-wires
// `attendance-calculator.service.ts` into a read path.
// =============================================================================

const here = dirname(fileURLToPath(import.meta.url));
// __tests__ → services → attendance → modules → src → <repo root>
const repoRoot = resolve(here, "..", "..", "..", "..", "..");

// Every file that renders/derives attendance shown to a human or used for risk.
const LIVE_READ_PATHS = [
  "src/app/api/attendance/reports/route.ts",
  "src/modules/attendance/services/attendance-read-model.service.ts",
  "src/modules/attendance/services/attendance-risk.service.ts",
  "src/modules/students/student-360/services/student-360.service.ts",
];

// Matches an ES import that pulls from the legacy calculator module, regardless
// of how the path is spelled (relative or aliased). Comments mentioning the file
// by name are intentionally NOT matched.
const LEGACY_IMPORT = /import[\s\S]*?from\s+["'][^"']*attendance-calculator\.service["']/;

describe("legacy attendance calculator is retired from live read paths", () => {
  it.each(LIVE_READ_PATHS)("%s does not import attendance-calculator.service", (relPath) => {
    const source = readFileSync(resolve(repoRoot, relPath), "utf8");
    expect(LEGACY_IMPORT.test(source)).toBe(false);
  });
});
