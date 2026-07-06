import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as snapshotRepo from "../academic-transcript-snapshot.repository";

// =============================================================================
// ARCHITECTURE GUARDS (Phase 2, §12)
//
// The Transcript repositories are the ONLY Prisma layer and must stay thin:
// no academic calculation, no event publishing, no audit, no UI. These static
// guards read the repository source directly so a future edit that pulls in a
// forbidden dependency fails fast, long before it can reach a command/service.
// =============================================================================

const REPO_DIR = join(process.cwd(), "src", "modules", "transcripts", "repositories");

const REPO_FILES = readdirSync(REPO_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);

function read(file: string): string {
  return readFileSync(join(REPO_DIR, file), "utf8");
}

// Forbidden dependencies — matched as substrings against real symbol / path names.
const FORBIDDEN: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "GradeCalculationService", patterns: [/GradeCalculationService/, /grade-calculation\.service/] },
  {
    label: "AttendanceCalculationEngine",
    patterns: [/AttendanceCalculation/, /attendance-calculation/, /RecalculateAttendance/],
  },
  { label: "CourseCompletionEngine", patterns: [/CourseCompletion/, /course-completion/] },
  { label: "eventPublisher", patterns: [/eventPublisher/, /EventPublisher/, /publishDomainEvent/] },
  { label: "auditService", patterns: [/auditService/, /AuditService/, /recordAudit/, /writeAudit/] },
  {
    label: "React / UI",
    patterns: [/from ["']react["']/, /from ["']react-dom["']/, /@\/components\//, /"use client"/, /\.tsx["']/],
  },
];

describe("architecture guards — repositories carry no business logic (§12)", () => {
  it("discovers the seven repository source files", () => {
    expect(REPO_FILES.length).toBe(7);
  });

  for (const label of FORBIDDEN.map((f) => f.label)) {
    const spec = FORBIDDEN.find((f) => f.label === label)!;
    it(`no repository imports/references ${label}`, () => {
      for (const file of REPO_FILES) {
        const content = read(file);
        for (const pattern of spec.patterns) {
          expect(content, `${file} must not reference ${label} (${pattern})`).not.toMatch(pattern);
        }
      }
    });
  }

  it("no repository publishes events, writes audit, or mutates via raw SQL", () => {
    for (const file of REPO_FILES) {
      const content = read(file);
      expect(content, `${file} must not use $queryRaw`).not.toMatch(/\$queryRaw|\$executeRaw/);
    }
  });
});

describe("architecture guards — snapshot repository is append-only (§12)", () => {
  it("exposes no update/delete/upsert method at its module surface", () => {
    const fns = Object.keys(snapshotRepo).filter(
      (k) => typeof (snapshotRepo as Record<string, unknown>)[k] === "function"
    );
    expect(fns.length).toBeGreaterThan(0);
    for (const name of fns) {
      expect(name).not.toMatch(/update|delete|upsert|remove|destroy/i);
    }
  });

  it("its source contains no .update/.delete/.upsert Prisma calls", () => {
    const content = read("academic-transcript-snapshot.repository.ts");
    expect(content).not.toMatch(/\.update\(/);
    expect(content).not.toMatch(/\.updateMany\(/);
    expect(content).not.toMatch(/\.delete\(/);
    expect(content).not.toMatch(/\.deleteMany\(/);
    expect(content).not.toMatch(/\.upsert\(/);
  });
});
