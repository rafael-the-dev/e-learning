import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// PHASE 0 — ARCHITECTURE GUARDS (tests 21–25)
// -----------------------------------------------------------------------------
// Static guards over the certificate module source. The Certificate Engine is a
// downstream consumer of the Transcript Engine (ADR-002): it must never import the
// Grade or Attendance engines, never import Transcript WRITE commands, and never
// import UI/React. Phase 0 must also add NO Certificate Prisma model other than
// CertificateNumberCounter. A future edit that violates any of these fails here.
// =============================================================================

const MODULE_DIR = join(process.cwd(), "src", "modules", "certificates");
const SCHEMA_FILE = join(process.cwd(), "prisma", "schema.prisma");

/** Recursively collect non-test .ts source files under the certificate module. */
function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectSources(full));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const SOURCE_FILES = collectSources(MODULE_DIR);

function read(file: string): string {
  return readFileSync(file, "utf8");
}

const FORBIDDEN: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Grade Engine (test 21)",
    patterns: [/GradeCalculation/, /grade-calculation/, /modules\/grades/],
  },
  {
    label: "Attendance Engine (test 22)",
    patterns: [/AttendanceCalculation/, /attendance-calculation/, /modules\/attendance/],
  },
  {
    label: "Transcript WRITE commands (test 23)",
    patterns: [
      /transcripts\/commands/,
      /IssueTranscript/,
      /RevokeTranscript/,
      /GenerateTranscript/,
    ],
  },
  {
    label: "UI / React (test 24)",
    patterns: [/from ["']react["']/, /from ["']react-dom["']/, /@\/components\//, /"use client"/, /\.tsx["']/],
  },
];

describe("certificate architecture guards — forbidden imports", () => {
  it("discovers the Phase-0 source files", () => {
    // constants, index, schema, 2× lib, types = at least 6 non-test sources.
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  for (const spec of FORBIDDEN) {
    it(`no certificate source imports/references ${spec.label}`, () => {
      for (const file of SOURCE_FILES) {
        const content = read(file);
        for (const pattern of spec.patterns) {
          expect(
            content,
            `${file} must not reference ${spec.label} (${pattern})`
          ).not.toMatch(pattern);
        }
      }
    });
  }
});

describe("certificate architecture guards — Phase-1 data model (test 25)", () => {
  // Phase 1 introduces the 7 certificate entity models alongside the Phase-0
  // CertificateNumberCounter. This guard freezes that exact set so a future edit
  // that adds an unexpected Certificate* model (or removes one) fails fast.
  const EXPECTED_MODELS = [
    "Certificate",
    "CertificateEvent",
    "CertificateExport",
    "CertificateNumberCounter",
    "CertificatePolicy",
    "CertificateRequest",
    "CertificateTemplate",
    "CertificateVerification",
  ];

  it("defines exactly the expected Certificate* Prisma models", () => {
    const schema = readFileSync(SCHEMA_FILE, "utf8");
    const models = [...schema.matchAll(/^model\s+(Certificate\w*)\s*\{/gm)].map((m) => m[1]);
    expect([...models].sort()).toEqual([...EXPECTED_MODELS].sort());
  });

  /** The Certificate* model blocks, with `//` comment text stripped so prose (e.g.
   *  "POINTER to the exact issued AcademicTranscriptVersion") never trips a guard. */
  function certificateModelBlocks(): string[] {
    const schema = readFileSync(SCHEMA_FILE, "utf8");
    const blocks = schema.match(/^model\s+Certificate\w*\s*\{[\s\S]*?^\}/gm) ?? [];
    return blocks.map((b) => b.replace(/\/\/[^\n]*/g, ""));
  }

  it("no Certificate model relates to a Grade/Attendance/StudentProgress source table", () => {
    const blocks = certificateModelBlocks();
    expect(blocks.length).toBe(EXPECTED_MODELS.length);
    const forbidden = [
      /StudentAssessmentResult/,
      /StudentSubjectProgress/,
      /StudentLevelProgress/,
      /StudentCourseProgress/,
      /\bAssessmentResult\b/,
      /AttendanceRecord/,
      /StudentSubjectAttendanceSummary/,
      /StudentPeriodAttendanceSummary/,
      // The transcript is a POINTER only — no Prisma relation to the version model.
      /AcademicTranscriptVersion/,
    ];
    for (const block of blocks) {
      for (const pattern of forbidden) {
        expect(block, `a Certificate model must not relate to ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("transcriptVersionId is a pointer column, never a Prisma relation", () => {
    // Within the certificate models, no @relation attribute may bind
    // transcriptVersionId (or the request's optional transcript pointer) to a model.
    for (const block of certificateModelBlocks()) {
      expect(block).not.toMatch(/@relation\([^)]*[Tt]ranscriptVersionId/);
    }
  });
});
