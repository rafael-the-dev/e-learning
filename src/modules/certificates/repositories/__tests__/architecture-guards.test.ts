import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as sourceRepo from "../certificate-transcript-source.repository";

// =============================================================================
// CERTIFICATE REPOSITORIES — ARCHITECTURE GUARDS (Phase 2, Part A, §14)
// -----------------------------------------------------------------------------
// The Transcript source repository is an Anti-Corruption Layer: read-only, and
// free of any engine it must not depend on. These static guards read the
// repository source directly so a future edit that pulls in a forbidden
// dependency — or a write call — fails fast, long before it reaches a command.
//
// Covers the required tests 12–15: no Grade Engine (12), no Attendance Engine
// (13), no Certificate model repositories/commands (14), no write methods (15).
// =============================================================================

const REPO_DIR = join(process.cwd(), "src", "modules", "certificates", "repositories");

const REPO_FILES = readdirSync(REPO_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);

function read(file: string): string {
  return readFileSync(join(REPO_DIR, file), "utf8");
}

// Forbidden dependencies — matched as substrings against real symbol / path names.
const FORBIDDEN: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Grade Engine (test 12)",
    patterns: [/GradeCalculation/, /grade-calculation/, /modules\/grades/],
  },
  {
    label: "Attendance Engine (test 13)",
    patterns: [/AttendanceCalculation/, /attendance-calculation/, /modules\/attendance/],
  },
  {
    label: "Course completion engine",
    patterns: [/CourseCompletion/, /course-completion/],
  },
  {
    label: "Certificate model repositories / commands (test 14)",
    patterns: [/certificates\/commands/, /certificates\/repositories\/certificate-(policy|template|event|export|verification|request)/],
  },
  {
    label: "Event publisher",
    patterns: [/eventPublisher/, /EventPublisher/, /publishDomainEvent/],
  },
  {
    label: "Audit service",
    patterns: [/auditService/, /AuditService/, /recordAudit/, /writeAudit/],
  },
  {
    label: "React / UI",
    patterns: [/from ["']react["']/, /from ["']react-dom["']/, /@\/components\//, /"use client"/, /\.tsx["']/],
  },
];

describe("certificate repository guards — forbidden dependencies (§14)", () => {
  it("discovers the Transcript source repository source file", () => {
    expect(REPO_FILES).toContain("certificate-transcript-source.repository.ts");
  });

  for (const spec of FORBIDDEN) {
    it(`no certificate repository imports/references ${spec.label}`, () => {
      for (const file of REPO_FILES) {
        const content = read(file);
        for (const pattern of spec.patterns) {
          expect(content, `${file} must not reference ${spec.label} (${pattern})`).not.toMatch(
            pattern
          );
        }
      }
    });
  }
});

describe("certificate repository guards — read-only (test 15)", () => {
  it("its source contains no create/update/delete/upsert Prisma calls", () => {
    for (const file of REPO_FILES) {
      const content = read(file);
      expect(content, `${file} must not call .create(`).not.toMatch(/\.create\(/);
      expect(content, `${file} must not call .createMany(`).not.toMatch(/\.createMany\(/);
      expect(content, `${file} must not call .update(`).not.toMatch(/\.update\(/);
      expect(content, `${file} must not call .updateMany(`).not.toMatch(/\.updateMany\(/);
      expect(content, `${file} must not call .delete(`).not.toMatch(/\.delete\(/);
      expect(content, `${file} must not call .deleteMany(`).not.toMatch(/\.deleteMany\(/);
      expect(content, `${file} must not call .upsert(`).not.toMatch(/\.upsert\(/);
      expect(content, `${file} must not use raw SQL`).not.toMatch(/\$queryRaw|\$executeRaw/);
    }
  });

  it("exposes no write-shaped function at the module surface", () => {
    const fns = Object.keys(sourceRepo).filter(
      (k) => typeof (sourceRepo as Record<string, unknown>)[k] === "function"
    );
    expect(fns.length).toBeGreaterThan(0);
    // Anchored to the leading verb: a read name like `findIssued…` is fine, only a
    // mutating verb at the START of the export name is a violation.
    for (const name of fns) {
      expect(name, `${name} looks like a write method`).not.toMatch(
        /^(create|update|delete|upsert|remove|destroy|issue|revoke|suspend|restore|mark|save|write|insert|put|patch|set)/i
      );
    }
  });
});
