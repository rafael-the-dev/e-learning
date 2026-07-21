import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// IDOR guard — the student transcript page ("Boletim de Notas") must resolve a
// scoped access check BEFORE reading any transcript data, so no user can open
// another student's transcript by changing the studentId in the URL. The guard
// behaviour (teacher-owns-student, org-scoped, out-of-scope throws, no-op for
// admin/secretary/student) is covered by teacher-access.test.ts; this pins the
// PAGE wiring against regression. `getStudentTranscript` is the only surface that
// reads this transcript (no API/PDF/export endpoint), so guarding the page suffices.
// =============================================================================

const SRC = readFileSync(
  join(process.cwd(), "src/app/(org)/students/[studentId]/transcript/page.tsx"),
  "utf8"
);

describe("student transcript page — IDOR guard", () => {
  it("requires the TRANSCRIPTS_VIEW permission", () => {
    expect(SRC).toContain("requirePermissionOrRedirect(PERMISSIONS.TRANSCRIPTS_VIEW)");
  });

  it("routes student-scoped users away (they use their own portal)", () => {
    expect(SRC).toContain("redirectIfStudentScoped(context)");
  });

  it("resolves the scoped student access via the shared contract (no duplicated scope logic)", () => {
    expect(SRC).toContain("assertTeacherCanAccessStudent(context, studentId)");
    // Reuses the canonical guard rather than re-implementing teacher/guardian joins.
    expect(SRC).toContain('from "@/server/auth/teacher-access"');
  });

  it("runs the access guard BEFORE reading the transcript (no read before authorization)", () => {
    const guardAt = SRC.indexOf("assertTeacherCanAccessStudent(context, studentId)");
    const readAt = SRC.indexOf("getStudentTranscript(");
    const studentLookupAt = SRC.indexOf("db.student.findFirst");
    expect(guardAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(studentLookupAt);
    expect(guardAt).toBeLessThan(readAt);
  });

  it("returns 404 (not 403) on an out-of-scope access, to avoid id enumeration", () => {
    expect(SRC).toMatch(/catch[\s\S]*AuthorizationError[\s\S]*notFound\(\)/);
  });

  it("scopes both the student lookup and the transcript read by organizationId (no cross-org bypass)", () => {
    expect(SRC).toContain("organizationId: context.organizationId");
    expect(SRC).toContain("getStudentTranscript(studentId, context.organizationId)");
  });
});
