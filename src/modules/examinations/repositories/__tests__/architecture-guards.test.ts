import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// EXAMINATION REPOSITORIES — ARCHITECTURE GUARDS (Phase 2)
// -----------------------------------------------------------------------------
// The 13 Exam* repositories are tenant-safe persistence only. They may write, but
// must stay free of: commands / services, other domain engines, event
// publishing / audit, React/UI, hard deletes, findUnique, and (for ExamEvent) any
// mutation at all. These static guards read the sources directly so a forbidden
// edit fails fast. `organizationId` presence is asserted on every write file.
// =============================================================================

const REPO_DIR = join(process.cwd(), "src", "modules", "examinations", "repositories");
const CMD_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");
const EVENT_FILE = "exam-event.repository.ts";

const REPO_FILES = readdirSync(REPO_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);

const CMD_FILES = readdirSync(CMD_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);

function read(file: string): string {
  return readFileSync(join(REPO_DIR, file), "utf8");
}

/** Strip block and line comments so only executable code is scanned. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// Forbidden dependencies — matched as substrings against real symbol / path names.
const FORBIDDEN: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Commands layer", patterns: [/\/commands/] },
  { label: "Services layer", patterns: [/\/services/] },
  { label: "Event publisher", patterns: [/eventPublisher/, /EventPublisher/, /publishDomainEvent/] },
  { label: "Audit service", patterns: [/auditService/, /AuditService/, /recordAudit/, /writeAudit/] },
  {
    label: "React / UI",
    patterns: [/from ["']react["']/, /from ["']react-dom["']/, /@\/components\//, /"use client"/, /\.tsx["']/],
  },
  {
    label: "Other domain engines",
    patterns: [/modules\/(grades|attendance|assessments|academic|transcripts|certificates)/],
  },
];

describe("examination repositories — discovery", () => {
  it("finds exactly the 14 Exam* repository files", () => {
    // 13 Phase-1/2 models + the Phase-11B ExamGradeComponentBinding (ADR-014).
    expect(REPO_FILES.length).toBe(14);
    expect(REPO_FILES).toContain(EVENT_FILE);
  });
});

describe("examination repositories — forbidden dependencies", () => {
  for (const spec of FORBIDDEN) {
    it(`no repository imports/references ${spec.label}`, () => {
      for (const file of REPO_FILES) {
        const content = read(file);
        for (const pattern of spec.patterns) {
          expect(content, `${file} must not reference ${spec.label} (${pattern})`).not.toMatch(pattern);
        }
      }
    });
  }
});

describe("examination repositories — no hard delete / upsert / findUnique", () => {
  it("no repository source calls .delete( / .deleteMany( / .upsert(", () => {
    for (const file of REPO_FILES) {
      const content = read(file);
      expect(content, `${file} must not hard-delete`).not.toMatch(/\.delete\(/);
      expect(content, `${file} must not hard-delete`).not.toMatch(/\.deleteMany\(/);
      expect(content, `${file} must not upsert`).not.toMatch(/\.upsert\(/);
    }
  });

  it("no repository source calls findUnique", () => {
    for (const file of REPO_FILES) {
      expect(read(file), `${file} must not use findUnique`).not.toMatch(/findUnique\(/);
    }
  });
});

describe("the ExamEvent repository is append-only", () => {
  it("its source contains no update/delete/upsert Prisma calls", () => {
    const content = read(EVENT_FILE);
    expect(content).not.toMatch(/\.update\(/);
    expect(content).not.toMatch(/\.updateMany\(/);
    expect(content).not.toMatch(/\.delete\(/);
    expect(content).not.toMatch(/\.deleteMany\(/);
    expect(content).not.toMatch(/\.upsert\(/);
  });
});

// =============================================================================
// H1 hardening (ADR-013): the metadata helpers must never be a lifecycle back door.
// No command may import or call any `update*Metadata` helper — lifecycle transitions
// belong exclusively to the dedicated conditional-write marks. This guard scans EVERY
// command source (comments stripped so doc-comments naming these helpers don't false-
// positive) and fails if any of the five surfaces the review flagged is referenced.
// =============================================================================
const FORBIDDEN_METADATA_HELPERS = [
  "updateExamPeriodMetadata",
  "updateExamSessionMetadata",
  "updateExamCandidateMetadata",
  "updateExamResultMetadata",
  "updateExamAppealMetadata",
] as const;

describe("no command reaches a metadata helper (H1)", () => {
  it("discovers the command sources to scan", () => {
    expect(CMD_FILES.length).toBeGreaterThan(0);
  });

  for (const helper of FORBIDDEN_METADATA_HELPERS) {
    it(`no command imports or calls ${helper}`, () => {
      for (const file of CMD_FILES) {
        const code = stripComments(readFileSync(join(CMD_DIR, file), "utf8"));
        expect(code, `${file} must not reference ${helper}`).not.toMatch(
          new RegExp(`\\b${helper}\\b`)
        );
      }
    });
  }
});

describe("every write is tenant-scoped", () => {
  it("each repo source that creates or updates also mentions organizationId", () => {
    for (const file of REPO_FILES) {
      const content = read(file);
      if (/\.create\(/.test(content) || /\.updateMany\(/.test(content)) {
        expect(content, `${file} writes but never scopes by organizationId`).toMatch(
          /organizationId/
        );
      }
    }
  });
});
