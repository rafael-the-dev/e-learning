import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// PHASE 12, INCREMENT 3 — UI ARCHITECTURE GUARDS (static source scans)
// -----------------------------------------------------------------------------
// The frontend decides NOTHING. It reads server-computed `allowedActions`, never a
// status string, to gate actions; and it never reaches data directly (no
// repositories / Prisma). These guards fail if a component/page compares a domain
// status literal (which would mean the UI is re-deriving a permission/lifecycle
// rule) or imports the data layer.
// =============================================================================

const COMPONENTS_DIR = join(process.cwd(), "src", "modules", "examinations", "components");
const PAGES_DIR = join(process.cwd(), "src", "app", "(org)", "examinations");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function tsxFiles(dir: string): Array<{ file: string; code: string }> {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) && !e.name.includes(".test."))
    .map((e) => join((e as unknown as { parentPath?: string; path?: string }).parentPath ?? (e as unknown as { path: string }).path, e.name))
    .map((p) => ({ file: p, code: stripComments(readFileSync(p, "utf8")) }));
}

const componentSrcs = tsxFiles(COMPONENTS_DIR);
const pageSrcs = tsxFiles(PAGES_DIR);
const uiSrcs = [...componentSrcs, ...pageSrcs];

// The status literal is legitimately mapped to a LABEL/variant in the badge registry
// (object-key lookup, no comparison). What is forbidden is COMPARING against it.
const STATUS_LITERALS =
  "DRAFT|OPEN|LOCKED|COMPLETED|CANCELLED|SCHEDULED|IN_PROGRESS|RESULTS_RECORDED|PUBLISHED|SUBMITTED|REVIEWED|APPROVED|INVALIDATED|PENDING|UNDER_REVIEW|REJECTED|WITHDRAWN|REGISTERED|DISQUALIFIED|PRESENT|ABSENT|LATE|EXCUSED|ELIGIBLE|INELIGIBLE|MISSING|STALE|UNSUPPORTED";
const STATUS_COMPARE = new RegExp(`(===|!==)\\s*["'](${STATUS_LITERALS})["']`);

describe("examination UI — decides nothing (allowedActions only)", () => {
  it("discovers UI sources", () => {
    expect(uiSrcs.length).toBeGreaterThan(0);
  });

  it("never compares a domain status literal to gate behaviour", () => {
    for (const { file, code } of uiSrcs) {
      expect(code, `${file} must not branch on a status string — use allowedActions`).not.toMatch(
        STATUS_COMPARE
      );
    }
  });

  it("imports no repositories / Prisma / DB client", () => {
    for (const { file, code } of uiSrcs) {
      expect(code, `${file} must not import a repository`).not.toMatch(/repositories\//);
      expect(code, `${file} must not import @/server/db`).not.toMatch(/@\/server\/db/);
      expect(code, `${file} must not call getDb`).not.toMatch(/getDb\(/);
    }
  });

  it("pages reach the data layer only through read services (no direct repo)", () => {
    for (const { file, code } of pageSrcs) {
      expect(code, `${file} must not import a repository`).not.toMatch(/repositories\//);
    }
  });
});
