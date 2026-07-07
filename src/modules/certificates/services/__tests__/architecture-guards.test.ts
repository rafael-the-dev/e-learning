import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as source from "../certificate-eligibility-source.service";

// =============================================================================
// CERTIFICATE SERVICES — ARCHITECTURE GUARDS (Phase 3A, tests 16–23)
// -----------------------------------------------------------------------------
// `CertificateEligibilitySource` is a read-aggregation façade. It may depend ONLY
// on the Certificate Policy repository and the Transcript source ACL, must import
// no other engine, no transcript Prisma model, no event/audit, no command, no UI/
// PDF/storage, and must never write. These static guards read the service source
// so a forbidden edit fails fast.
// =============================================================================

const SERVICES_DIR = join(process.cwd(), "src", "modules", "certificates", "services");

const SERVICE_FILES = readdirSync(SERVICES_DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts"
);

function read(file: string): string {
  return readFileSync(join(SERVICES_DIR, file), "utf8");
}

const FORBIDDEN: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Grade Engine (test 17)",
    patterns: [/GradeCalculation/, /grade-calculation/, /modules\/grades/],
  },
  {
    label: "Attendance Engine (test 18)",
    patterns: [/AttendanceCalculation/, /attendance-calculation/, /modules\/attendance/],
  },
  {
    label: "Course completion engine (test 19)",
    patterns: [/CourseCompletion/, /course-completion/],
  },
  {
    label: "Transcript Prisma models / repositories (test 20)",
    patterns: [/AcademicTranscript/, /modules\/transcripts\/repositories/, /transcripts\/commands/],
  },
  {
    label: "Event publisher",
    patterns: [/eventPublisher/, /EventPublisher/, /publishDomainEvent/],
  },
  {
    label: "Audit service",
    patterns: [/auditService/, /AuditService/, /recordAudit/],
  },
  {
    label: "Certificate commands",
    patterns: [/certificates\/commands/],
  },
  {
    label: "PDF / storage",
    patterns: [/react-pdf/, /puppeteer/, /generatePdf/i, /uploadthing/i, /infrastructure\/storage/],
  },
  {
    label: "React / UI",
    patterns: [/from ["']react["']/, /from ["']react-dom["']/, /@\/components\//, /"use client"/, /\.tsx["']/],
  },
];

describe("eligibility source guards — forbidden dependencies (tests 17–20)", () => {
  it("discovers the eligibility source service file", () => {
    expect(SERVICE_FILES).toContain("certificate-eligibility-source.service.ts");
  });

  for (const spec of FORBIDDEN) {
    it(`no service imports/references ${spec.label}`, () => {
      for (const file of SERVICE_FILES) {
        const content = read(file);
        for (const pattern of spec.patterns) {
          expect(content, `${file} must not reference ${spec.label} (${pattern})`).not.toMatch(pattern);
        }
      }
    });
  }
});

describe("eligibility source guards — only allowed repositories (test 16)", () => {
  it("imports only the Policy repository and the Transcript source ACL", () => {
    for (const file of SERVICE_FILES) {
      const content = read(file);
      // No certificate-MODEL repositories other than policy may be imported.
      expect(content).not.toMatch(/repositories\/certificate\.repository/);
      expect(content).not.toMatch(/repositories\/certificate-(event|export|verification|request)\.repository/);
      expect(content).not.toMatch(/repositories\/certificate-template\.repository/);
    }
    // Positive: the source actually depends on the two allowed repositories.
    const svc = read("certificate-eligibility-source.service.ts");
    expect(svc).toMatch(/repositories\/certificate-policy\.repository/);
    expect(svc).toMatch(/repositories\/certificate-transcript-source\.repository/);
  });
});

describe("eligibility source guards — read-only, no lifecycle (tests 21–23)", () => {
  it("performs no database writes / raw SQL", () => {
    for (const file of SERVICE_FILES) {
      const content = read(file);
      expect(content).not.toMatch(/\.create\(/);
      expect(content).not.toMatch(/\.createMany\(/);
      expect(content).not.toMatch(/\.update\(/);
      expect(content).not.toMatch(/\.updateMany\(/);
      expect(content).not.toMatch(/\.delete\(/);
      expect(content).not.toMatch(/\.deleteMany\(/);
      expect(content).not.toMatch(/\.upsert\(/);
      expect(content).not.toMatch(/\$queryRaw|\$executeRaw/);
    }
  });

  it("exposes no write-shaped or lifecycle function at the module surface", () => {
    const fns = Object.keys(source).filter((k) => typeof (source as Record<string, unknown>)[k] === "function");
    expect(fns.length).toBeGreaterThan(0);
    for (const name of fns) {
      expect(name, `${name} looks like a write/lifecycle method`).not.toMatch(
        /^(create|update|delete|upsert|remove|destroy|issue|revoke|suspend|restore|approve|mark|save|write|generate)/i
      );
    }
  });

  it("defines no lifecycle-transition helper", () => {
    for (const file of SERVICE_FILES) {
      expect(read(file)).not.toMatch(
        /issueCertificate|revokeCertificate|suspendCertificate|restoreCertificate|approveCertificate|generateCertificate/
      );
    }
  });
});
