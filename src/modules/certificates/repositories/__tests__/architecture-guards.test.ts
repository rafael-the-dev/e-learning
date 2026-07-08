import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as sourceRepo from "../certificate-transcript-source.repository";

// =============================================================================
// CERTIFICATE REPOSITORIES — ARCHITECTURE GUARDS (Phase 2, §14 + Phase 2B §12–13)
// -----------------------------------------------------------------------------
// Two kinds of repository live here:
//   • the ACL — `certificate-transcript-source.repository.ts` — the ONLY file that
//     may read Transcript tables, and it is strictly READ-ONLY;
//   • the certificate-model repositories — tenant-safe persistence for the seven
//     Certificate models. They may write, but must stay free of transcript reads,
//     other engines, events/audit/checksum/numbering, hard deletes, and lifecycle.
// These static guards read the sources directly so a forbidden edit fails fast.
// =============================================================================

const REPO_DIR = join(process.cwd(), "src", "modules", "certificates", "repositories");
const ACL_FILE = "certificate-transcript-source.repository.ts";
const EVENT_FILE = "certificate-event.repository.ts";

const ALL_FILES = readdirSync(REPO_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);
const MODEL_FILES = ALL_FILES.filter((f) => f !== ACL_FILE);

function read(file: string): string {
  return readFileSync(join(REPO_DIR, file), "utf8");
}

// Forbidden dependencies — matched as substrings against real symbol / path names.
const FORBIDDEN: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Grade Engine (test 38)",
    patterns: [/GradeCalculation/, /grade-calculation/, /modules\/grades/],
  },
  {
    label: "Attendance Engine (test 38)",
    patterns: [/AttendanceCalculation/, /attendance-calculation/, /modules\/attendance/],
  },
  {
    label: "Course completion engine",
    patterns: [/CourseCompletion/, /course-completion/],
  },
  {
    label: "Certificate commands",
    patterns: [/certificates\/commands/],
  },
  {
    label: "Event publisher (test 39)",
    patterns: [/eventPublisher/, /EventPublisher/, /publishDomainEvent/],
  },
  {
    label: "Audit service (test 39)",
    patterns: [/auditService/, /AuditService/, /recordAudit/, /writeAudit/],
  },
  {
    label: "Checksum utilities (test 39)",
    patterns: [/certificate-checksum/, /certificateContentChecksum/, /contentChecksum/, /shared\/lib\/checksum/],
  },
  {
    label: "Certificate number allocator (test 39)",
    patterns: [/certificate-number/, /allocateCertificateNumber/, /formatCertificateNumber/],
  },
  {
    label: "React / UI",
    patterns: [/from ["']react["']/, /from ["']react-dom["']/, /@\/components\//, /"use client"/, /\.tsx["']/],
  },
];

describe("certificate repository guards — forbidden dependencies (§12, tests 38–39)", () => {
  it("discovers the ACL + the certificate-model / projection repositories", () => {
    expect(ALL_FILES).toContain(ACL_FILE);
    // Seven per-model repositories (Phase 2B) + the Phase 7 public-verification
    // projection repository (cross-model read + expiry sweep, still persistence-only).
    expect(MODEL_FILES.length).toBe(8);
    expect(MODEL_FILES).toContain("certificate-public-verification.repository.ts");
  });

  for (const spec of FORBIDDEN) {
    it(`no repository imports/references ${spec.label}`, () => {
      for (const file of ALL_FILES) {
        const content = read(file);
        for (const pattern of spec.patterns) {
          expect(content, `${file} must not reference ${spec.label} (${pattern})`).not.toMatch(pattern);
        }
      }
    });
  }
});

describe("certificate model repositories are isolated from the Transcript (test 37)", () => {
  it("no model repository reads a Transcript table", () => {
    for (const file of MODEL_FILES) {
      expect(read(file), `${file} must not reference AcademicTranscript*`).not.toMatch(/AcademicTranscript/);
    }
  });

  it("no model repository imports the Transcript source ACL", () => {
    for (const file of MODEL_FILES) {
      expect(read(file), `${file} must not import the ACL`).not.toMatch(/certificate-transcript-source/);
    }
  });
});

describe("the ACL is read-only (§14, tests 15/37)", () => {
  it("its source contains no create/update/delete/upsert Prisma calls or raw SQL", () => {
    const content = read(ACL_FILE);
    expect(content).not.toMatch(/\.create\(/);
    expect(content).not.toMatch(/\.createMany\(/);
    expect(content).not.toMatch(/\.update\(/);
    expect(content).not.toMatch(/\.updateMany\(/);
    expect(content).not.toMatch(/\.delete\(/);
    expect(content).not.toMatch(/\.deleteMany\(/);
    expect(content).not.toMatch(/\.upsert\(/);
    expect(content).not.toMatch(/\$queryRaw|\$executeRaw/);
  });

  it("exposes no write-shaped function at the module surface", () => {
    const fns = Object.keys(sourceRepo).filter(
      (k) => typeof (sourceRepo as Record<string, unknown>)[k] === "function"
    );
    expect(fns.length).toBeGreaterThan(0);
    for (const name of fns) {
      expect(name, `${name} looks like a write method`).not.toMatch(
        /^(create|update|delete|upsert|remove|destroy|issue|revoke|suspend|restore|mark|save|write|insert|put|patch|set)/i
      );
    }
  });
});

describe("no repository exposes a hard delete (test 40)", () => {
  it("no repository source calls .delete( / .deleteMany(", () => {
    for (const file of ALL_FILES) {
      const content = read(file);
      expect(content, `${file} must not hard-delete`).not.toMatch(/\.delete\(/);
      expect(content, `${file} must not hard-delete`).not.toMatch(/\.deleteMany\(/);
    }
  });
});

describe("the event repository is append-only (test 41)", () => {
  it("its source contains no update/delete/upsert Prisma calls", () => {
    const content = read(EVENT_FILE);
    expect(content).not.toMatch(/\.update\(/);
    expect(content).not.toMatch(/\.updateMany\(/);
    expect(content).not.toMatch(/\.delete\(/);
    expect(content).not.toMatch(/\.deleteMany\(/);
    expect(content).not.toMatch(/\.upsert\(/);
  });
});

describe("no repository contains a lifecycle-transition helper (test 42)", () => {
  it("no source defines issue/revoke/suspend/restore/approve Certificate helpers", () => {
    for (const file of ALL_FILES) {
      expect(read(file), `${file} must not contain a lifecycle helper`).not.toMatch(
        /issueCertificate|revokeCertificate|suspendCertificate|restoreCertificate|approveCertificate/
      );
    }
  });
});
