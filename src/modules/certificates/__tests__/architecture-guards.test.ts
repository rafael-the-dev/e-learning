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

describe("certificate architecture guards — Phase-0 data model (test 25)", () => {
  it("adds NO Certificate Prisma model other than CertificateNumberCounter", () => {
    const schema = readFileSync(SCHEMA_FILE, "utf8");
    const models = [...schema.matchAll(/^model\s+(Certificate\w*)\s*\{/gm)].map((m) => m[1]);
    expect(models).toEqual(["CertificateNumberCounter"]);
  });
});
