import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  productionComponentResolver,
  productionGradeWritePort,
  productionProgressionConfirmPort,
} from "@/modules/examinations/integrations/production-ports";

// =============================================================================
// H2 — PRODUCTION INTEGRATION ADAPTER ARCHITECTURE GUARDS (§13 + §15)
// -----------------------------------------------------------------------------
// CI-runnable static + wiring guards for the SANCTIONED Grade/Progression adapter
// seam (`integrations/production-ports.ts`). The full behavioural proof that the
// adapter WRITES real grades + reaches progression lives in the live-DB script
// `__tests__/grade-integration-production.integration.ts` (run via `npx tsx`,
// excluded from CI). These guards lock the adapter's shape so it can never quietly
// bypass the canonical Grade writer or reach into a forbidden engine, and prove the
// integration commands default to the REAL production ports (not fakes).
//
// NOTE on §13 wording: the adapter DOES import the Grade result repository
// (`upsertStudentAssessmentResult` / `findResultByEnrollmentAndComponent`) and the
// Assessment component repository — that is part of the canonical write pattern it
// replicates 1:1 from BulkGradeAssessmentCommand, and the adapter must NOT be
// redesigned. So these guards enforce the real, load-bearing invariants: the write
// is ROUTED THROUGH the canonical `gradeMutationService` (single grade writer), and
// the adapter never imports a Progression repository, never writes a progression
// table, and never reaches the Transcript or Certificate engines.
// =============================================================================

const INTEGRATIONS_DIR = join(process.cwd(), "src", "modules", "examinations", "integrations");
const COMMANDS_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");

/** Strip block + line comments so prose (which names other engines) never false-positives. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PORTS_SRC = stripComments(
  readFileSync(join(INTEGRATIONS_DIR, "production-ports.ts"), "utf8")
);
const INTEGRATION_CMD_SRC = stripComments(
  readFileSync(join(COMMANDS_DIR, "integration.commands.ts"), "utf8")
);

describe("§13 — production adapter routes through the canonical Grade writer", () => {
  it("imports and calls the canonical grade MUTATION service (single grade writer)", () => {
    expect(PORTS_SRC).toMatch(/gradeMutationService/);
    expect(PORTS_SRC).toMatch(/\.handleGradeMutation\(/);
    // Uses the sanctioned EXAMINATION grade-change source (additive), not a raw write.
    expect(PORTS_SRC).toMatch(/GRADE_CHANGE_SOURCE\.EXAMINATION/);
  });
});

describe("§13 — production adapter never reaches a forbidden engine/repo", () => {
  it("never imports a Progression / prerequisites repository", () => {
    expect(PORTS_SRC).not.toMatch(/modules\/prerequisites\/repositories/);
    expect(PORTS_SRC).not.toMatch(/modules\/progression/);
  });

  it("never imports the Transcript engine", () => {
    expect(PORTS_SRC).not.toMatch(/modules\/transcripts/);
  });

  it("never imports the Certificate engine", () => {
    expect(PORTS_SRC).not.toMatch(/modules\/certificates/);
  });

  it("never WRITES a progression table (confirm is read-only)", () => {
    // A findFirst read of studentSubjectProgress is allowed (the confirm port); any
    // mutation of a progression table is not — the Progression Engine owns those.
    for (const table of ["studentSubjectProgress", "studentLevelProgress", "studentCourseProgress"]) {
      for (const op of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]) {
        expect(PORTS_SRC, `production-ports must not call ${table}.${op}`).not.toMatch(
          new RegExp(`\\.${table}\\.${op}\\(`)
        );
      }
    }
  });
});

describe("§15 — the integration commands use the REAL production ports (not fakes)", () => {
  it("integration.commands imports the three production ports from the sanctioned seam", () => {
    expect(INTEGRATION_CMD_SRC).toMatch(
      /from ["']@\/modules\/examinations\/integrations\/production-ports["']/
    );
    expect(INTEGRATION_CMD_SRC).toMatch(/productionComponentResolver/);
    expect(INTEGRATION_CMD_SRC).toMatch(/productionGradeWritePort/);
    expect(INTEGRATION_CMD_SRC).toMatch(/productionProgressionConfirmPort/);
  });

  it("defaults each injectable port to its production implementation", () => {
    // `ports.resolver ?? productionComponentResolver` (and the two peers): when the
    // caller omits `ports`, the production adapter is what runs.
    expect(INTEGRATION_CMD_SRC).toMatch(/\?\?\s*productionComponentResolver/);
    expect(INTEGRATION_CMD_SRC).toMatch(/\?\?\s*productionGradeWritePort/);
    expect(INTEGRATION_CMD_SRC).toMatch(/\?\?\s*productionProgressionConfirmPort/);
  });

  it("the exported production ports are real objects with the expected methods", () => {
    expect(typeof productionComponentResolver.resolve).toBe("function");
    expect(typeof productionGradeWritePort.apply).toBe("function");
    expect(typeof productionProgressionConfirmPort.confirm).toBe("function");
  });
});
