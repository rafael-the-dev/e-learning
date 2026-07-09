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
const EVENT_FILE = "exam-event.repository.ts";

const REPO_FILES = readdirSync(REPO_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);

function read(file: string): string {
  return readFileSync(join(REPO_DIR, file), "utf8");
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
  it("finds exactly the 13 Exam* repository files", () => {
    expect(REPO_FILES.length).toBe(13);
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
