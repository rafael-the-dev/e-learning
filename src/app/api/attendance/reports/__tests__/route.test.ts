import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/shared/lib/command";
import type { ClassGroupAttendanceReportEntry } from "@/modules/attendance/types";

// =============================================================================
// /api/attendance/reports — tests
//
// Two concerns are exercised here:
//
//   • Source of truth (Fix C1): the endpoint reads the persisted
//     StudentSubjectAttendanceSummary via the read-model service and NEVER calls
//     the retired legacy calculator. Missing summaries surface as
//     attendancePercentage: null / status: NOT_STARTED / needsRecalculation.
//
//   • Row-level authorization (Fix H1): the endpoint returns a class roster, so
//     it must resolve the caller's effective scope server-side and never trust
//     the classGroupId. Teacher → own class only; student/guardian → denied;
//     admin/secretary → org-wide. organizationId always comes from the auth
//     context, never the query (cross-tenant guard).
//
// The scope helpers are mocked at the route boundary (they are unit-tested in
// their own suites); these tests assert the route WIRES them correctly and
// honours their verdict BEFORE reading. The real AuthorizationError is used so
// the route's `instanceof` mapping to 403 is exercised for real.
// =============================================================================

const getReport = vi.fn();
const legacyCalc = vi.fn();
const requirePermission = vi.fn();
const isStudentScopedRoles = vi.fn();
const isGuardianScopedRoles = vi.fn();
const assertTeacherCanAccessClassGroup = vi.fn();

vi.mock("@/server/auth/context", () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));

vi.mock("@/server/auth/permissions", () => ({
  PERMISSIONS: { ATTENDANCE_SESSIONS_VIEW: "attendance.sessions.view" },
}));

vi.mock("@/server/auth/student-scope", () => ({
  isStudentScopedRoles: (...a: unknown[]) => isStudentScopedRoles(...a),
}));

vi.mock("@/server/auth/guardian-scope", () => ({
  isGuardianScopedRoles: (...a: unknown[]) => isGuardianScopedRoles(...a),
}));

vi.mock("@/server/auth/teacher-access", () => ({
  assertTeacherCanAccessClassGroup: (...a: unknown[]) => assertTeacherCanAccessClassGroup(...a),
}));

vi.mock("@/modules/attendance/services/attendance-read-model.service", () => ({
  getClassGroupSubjectAttendanceReport: (...a: unknown[]) => getReport(...a),
}));

// If the route ever imports the legacy calculator, this spy makes it visible.
vi.mock("@/modules/attendance/services/attendance-calculator.service", () => ({
  calculateStudentSubjectAttendance: (...a: unknown[]) => legacyCalc(...a),
  calculateEnrollmentAttendanceSummary: (...a: unknown[]) => legacyCalc(...a),
  checkMinimumAttendanceRequirement: (...a: unknown[]) => legacyCalc(...a),
}));

import { GET } from "../route";

function makeReq(url: string): Parameters<typeof GET>[0] {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof GET>[0];
}

const ORG = "org-A";

/** Sets the authenticated context returned by requirePermission. */
function authAs(roles: string[], organizationId = ORG) {
  requirePermission.mockResolvedValue({ organizationId, userId: "u-1", roles });
}

beforeEach(() => {
  getReport.mockReset();
  legacyCalc.mockClear();
  requirePermission.mockReset();
  isStudentScopedRoles.mockReset();
  isGuardianScopedRoles.mockReset();
  assertTeacherCanAccessClassGroup.mockReset();

  // Default: an org admin, no scoping, read returns empty.
  authAs(["ORG_ADMIN"]);
  isStudentScopedRoles.mockReturnValue(false);
  isGuardianScopedRoles.mockReturnValue(false);
  assertTeacherCanAccessClassGroup.mockResolvedValue(undefined);
  getReport.mockResolvedValue([]);
});

// ── Input / source of truth (Fix C1) ────────────────────────────────────────
describe("GET /api/attendance/reports — input & source of truth", () => {
  it("400s when classGroupId is missing", async () => {
    const res = await GET(makeReq("http://x/api/attendance/reports"));
    expect(res.status).toBe(400);
    expect(getReport).not.toHaveBeenCalled();
  });

  it("reads from the persisted-summary read-model service, scoped to the org", async () => {
    await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));

    expect(getReport).toHaveBeenCalledWith("cg-1", ORG);
    expect(legacyCalc).not.toHaveBeenCalled();
  });

  it("returns the read-model rows verbatim, including missing-summary cells", async () => {
    const report: ClassGroupAttendanceReportEntry[] = [
      {
        studentId: "stu-1",
        studentName: "Ana Silva",
        studentCode: "A-1",
        subjects: [
          {
            studentId: "stu-1",
            enrollmentId: "enr-1",
            levelSubjectId: "ls-1",
            subjectId: "subj-1",
            subjectName: "Matemática",
            totalSessions: 0,
            totalScheduledMinutes: 0,
            totalPresentMinutes: 0,
            totalAbsentMinutes: 0,
            totalLateMinutes: 0,
            totalExcusedMinutes: 0,
            attendancePercentage: null,
            minimumAttendancePercentage: 75,
            status: "NOT_STARTED",
            needsRecalculation: true,
            calculatedAt: null,
          },
        ],
      },
    ];
    getReport.mockResolvedValue(report);

    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].subjects[0]).toMatchObject({
      attendancePercentage: null,
      status: "NOT_STARTED",
      needsRecalculation: true,
    });
  });
});

// ── Row-level authorization (Fix H1) ─────────────────────────────────────────
describe("GET /api/attendance/reports — row-level authorization", () => {
  it("ORG_ADMIN reads any class group in the org", async () => {
    authAs(["ORG_ADMIN"]);
    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));
    expect(res.status).toBe(200);
    expect(getReport).toHaveBeenCalledWith("cg-1", ORG);
  });

  it("SECRETARY reads any class group in the org", async () => {
    authAs(["SECRETARY"]);
    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-9"));
    expect(res.status).toBe(200);
    expect(getReport).toHaveBeenCalledWith("cg-9", ORG);
  });

  it("scopes the read to the auth-context org, IGNORING an organizationId query param (cross-tenant guard)", async () => {
    authAs(["ORG_ADMIN"], ORG);
    await GET(
      makeReq("http://x/api/attendance/reports?classGroupId=cg-1&organizationId=org-EVIL")
    );
    // Never the client-supplied org.
    expect(getReport).toHaveBeenCalledWith("cg-1", ORG);
    expect(getReport).not.toHaveBeenCalledWith("cg-1", "org-EVIL");
  });

  it("TEACHER may read a class group they teach", async () => {
    authAs(["TEACHER"]);
    assertTeacherCanAccessClassGroup.mockResolvedValue(undefined); // owns it

    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-mine"));

    expect(assertTeacherCanAccessClassGroup).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      "cg-mine"
    );
    expect(res.status).toBe(200);
    expect(getReport).toHaveBeenCalledWith("cg-mine", ORG);
  });

  it("TEACHER may NOT read another teacher's class group (403, no read)", async () => {
    authAs(["TEACHER"]);
    assertTeacherCanAccessClassGroup.mockRejectedValue(
      new AuthorizationError("Não tem acesso a esta turma.")
    );

    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-foreign"));

    expect(res.status).toBe(403);
    expect(getReport).not.toHaveBeenCalled();
  });

  it("STUDENT is denied the roster entirely (403), before any teacher check or read", async () => {
    authAs(["STUDENT"]);
    isStudentScopedRoles.mockReturnValue(true);

    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-anything"));

    expect(res.status).toBe(403);
    expect(assertTeacherCanAccessClassGroup).not.toHaveBeenCalled();
    expect(getReport).not.toHaveBeenCalled();
  });

  it("STUDENT cannot read an arbitrary/foreign classGroupId (403, no read)", async () => {
    authAs(["STUDENT"]);
    isStudentScopedRoles.mockReturnValue(true);

    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-not-mine"));

    expect(res.status).toBe(403);
    expect(getReport).not.toHaveBeenCalled();
  });

  it("GUARDIAN is denied the roster entirely (403), even if granted the view permission", async () => {
    // Defence-in-depth: a guardian normally lacks the permission, but if it were
    // ever granted, guardian-scope must still deny the roster.
    authAs(["GUARDIAN"]);
    isGuardianScopedRoles.mockReturnValue(true);

    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));

    expect(res.status).toBe(403);
    expect(assertTeacherCanAccessClassGroup).not.toHaveBeenCalled();
    expect(getReport).not.toHaveBeenCalled();
  });

  it("403s when the permission check itself denies (AuthorizationError)", async () => {
    requirePermission.mockRejectedValue(new AuthorizationError("Sem permissão"));
    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));
    expect(res.status).toBe(403);
    expect(getReport).not.toHaveBeenCalled();
  });

  it("401s on an unexpected (non-authorization) failure", async () => {
    requirePermission.mockRejectedValue(new Error("session store unreachable"));
    const res = await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));
    expect(res.status).toBe(401);
  });

  it("never calls the retired legacy calculator on any authorized path", async () => {
    authAs(["SECRETARY"]);
    await GET(makeReq("http://x/api/attendance/reports?classGroupId=cg-1"));
    expect(legacyCalc).not.toHaveBeenCalled();
  });
});
