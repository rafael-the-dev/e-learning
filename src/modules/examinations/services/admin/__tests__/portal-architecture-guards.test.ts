import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// PHASE 12 — PORTAL ARCHITECTURE GUARDS (static source scans)
// -----------------------------------------------------------------------------
// Enforce the portal contract: routes are thin (no repositories, no Prisma), read
// services own data access but NO commands and NO writes, the mapper is pure, and
// the whole portal layer never reaches Transcript/Certificate or leaks raw
// eligibilitySnapshot / ExamEvent metadata.
// =============================================================================

const ROUTES_DIR = join(process.cwd(), "src", "app", "api", "examinations");
const ADMIN_DIR = join(process.cwd(), "src", "modules", "examinations", "services", "admin");
const LIB_FILE = join(process.cwd(), "src", "modules", "examinations", "lib", "portal-http.ts");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function tsFiles(dir: string, opts: { includeTests?: boolean } = {}): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => join(e.parentPath ?? (e as unknown as { path: string }).path, e.name))
    .filter((p) => opts.includeTests || !p.includes("__tests__"));
}

const routeSrcs = tsFiles(ROUTES_DIR).map((f) => ({ file: f, code: stripComments(readFileSync(f, "utf8")) }));
const adminSrcs = tsFiles(ADMIN_DIR).map((f) => ({ file: f, code: stripComments(readFileSync(f, "utf8")) }));
const libCode = stripComments(readFileSync(LIB_FILE, "utf8"));

describe("portal routes are thin transport shells", () => {
  it("discovers examination route files", () => {
    expect(routeSrcs.length).toBeGreaterThan(0);
  });

  it("import no repositories", () => {
    for (const { file, code } of routeSrcs) {
      expect(code, `${file} must not import a repository`).not.toMatch(/repositories\//);
    }
  });

  it("import no Prisma / db client directly", () => {
    for (const { file, code } of routeSrcs) {
      expect(code, `${file} must not import @/server/db`).not.toMatch(/@\/server\/db/);
      expect(code, `${file} must not call getDb`).not.toMatch(/getDb\(/);
    }
  });

  it("run no eligibility engine and reach no other engine", () => {
    for (const { file, code } of routeSrcs) {
      expect(code, file).not.toMatch(/EligibilityEngine|evaluateExaminationEligibility/);
      expect(code, file).not.toMatch(/modules\/(transcripts|certificates|grades|prerequisites)/);
    }
  });
});

describe("portal read services own data access but no writes / commands", () => {
  it("invoke no command classes (pure *-shared helpers under commands/ are allowed)", () => {
    // The read services may reuse PURE helpers that happen to live under commands/
    // (e.g. evaluatePublicationReadiness, latestIntegratedVersion). What they must
    // NOT do is import a command CLASS module (`*.commands`) — that would mean the
    // read layer drives a mutation / duplicates command orchestration.
    for (const { file, code } of adminSrcs) {
      expect(code, `${file} must not import a *.commands module`).not.toMatch(/\.commands["']/);
      expect(code, `${file} must not construct a Command`).not.toMatch(/new \w+Command\(/);
    }
  });

  it("import @/server/db for nothing (data access goes through repositories only)", () => {
    for (const { file, code } of adminSrcs) {
      expect(code, `${file} must not import @/server/db directly`).not.toMatch(/@\/server\/db/);
    }
  });

  it("perform no Prisma writes", () => {
    for (const { file, code } of adminSrcs) {
      for (const op of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]) {
        expect(code, `${file} must not call db.*.${op}`).not.toMatch(new RegExp(`\\.${op}\\(`));
      }
    }
  });

  it("reach no Transcript / Certificate / Grade-write engine", () => {
    for (const { file, code } of adminSrcs) {
      expect(code, file).not.toMatch(/modules\/(transcripts|certificates)/);
      expect(code, file).not.toMatch(/gradeMutationService|upsertStudentAssessmentResult/);
    }
  });
});

describe("portal layer never leaks raw internals", () => {
  it("no route/service EXPOSES eligibilitySnapshot as a DTO field (parsing it for an", () => {
    // allowlisted provenance is allowed — reading `candidate.eligibilitySnapshot` and
    // JSON.parsing it is fine; what's forbidden is surfacing it as an outward property
    // (`eligibilitySnapshot:` in a returned object) or a raw metadata blob.
    for (const { file, code } of [...routeSrcs, ...adminSrcs]) {
      expect(code, `${file} must not surface eligibilitySnapshot as a field`).not.toMatch(
        /eligibilitySnapshot\s*:/
      );
    }
  });

  it("the mapper is pure (no db, no repositories, no commands)", () => {
    const mapper = adminSrcs.find((s) => s.file.endsWith("examination-portal.mapper.ts"));
    expect(mapper).toBeTruthy();
    expect(mapper!.code).not.toMatch(/@\/server\/db|repositories\/|\/commands\//);
  });

  it("the http lib maps ConcurrencyError to 409 (lifecycle/conflict)", () => {
    expect(libCode).toMatch(/ConcurrencyError/);
    expect(libCode).toMatch(/status:\s*409/);
  });
});
