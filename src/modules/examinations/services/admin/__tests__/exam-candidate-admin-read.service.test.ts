import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-candidate.repository", () => ({
  listCandidatesBySession: vi.fn(),
  findExamCandidateById: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({
  findExamSessionById: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-attendance.repository", () => ({
  listAttendanceBySession: vi.fn(),
  findAttendanceByCandidateId: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-result.repository", () => ({
  findResultsBySession: vi.fn(),
  findResultByCandidateId: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({
  listStudentDisplayByIds: vi.fn(),
  listEnrollmentDisplayByIds: vi.fn(),
}));

import { listCandidatesBySession, findExamCandidateById } from "@/modules/examinations/repositories/exam-candidate.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listAttendanceBySession, findAttendanceByCandidateId } from "@/modules/examinations/repositories/exam-attendance.repository";
import { findResultsBySession, findResultByCandidateId } from "@/modules/examinations/repositories/exam-result.repository";
import { listStudentDisplayByIds, listEnrollmentDisplayByIds } from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examCandidateAdminReadService } from "../exam-candidate-admin-read.service";

const SECRET = "SUPER_SECRET_SNAPSHOT_BLOB";
function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => set.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
const session = { id: "s-1", organizationId: "org-1", status: "IN_PROGRESS" };
function candidate(over: Record<string, unknown> = {}) {
  return {
    id: "c-1", organizationId: "org-1", examSessionId: "s-1", examAttemptId: "a-1",
    studentId: "st-1", enrollmentId: "en-1", eligibilityStatus: "INELIGIBLE", status: "REGISTERED",
    assignedSeat: null, registeredAt: new Date(), registeredById: "u", withdrawnAt: null, withdrawnById: null,
    disqualifiedAt: null, disqualifiedById: null, disqualificationReason: null,
    overriddenById: "admin-1", overrideReason: "motivo do override",
    eligibilitySnapshot: JSON.stringify({ evaluated: { blockingReasons: ["ATTENDANCE_BELOW_REQUIRED"], warnings: ["FINANCIAL_CLEARANCE_UNKNOWN"], requiresApproval: true }, secret: SECRET }),
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("candidate read service — privacy + joins", () => {
  it("throws without exams.view", async () => {
    await expect(examCandidateAdminReadService.listBySession(ctx([]), "s-1")).rejects.toMatchObject({ name: "AuthorizationError" });
  });

  it("joins attendance + result with one query each (no N+1)", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue(session as never);
    vi.mocked(listCandidatesBySession).mockResolvedValue([candidate()] as never);
    vi.mocked(listAttendanceBySession).mockResolvedValue([{ examCandidateId: "c-1", status: "PRESENT" }] as never);
    vi.mocked(findResultsBySession).mockResolvedValue([{ examCandidateId: "c-1", status: "DRAFT" }] as never);
    vi.mocked(listStudentDisplayByIds).mockResolvedValue([{ id: "st-1", code: "A123", firstName: "Ana", lastName: "Silva" }] as never);
    vi.mocked(listEnrollmentDisplayByIds).mockResolvedValue([{ id: "en-1", enrollmentNumber: "EN-1" }] as never);

    const res = await examCandidateAdminReadService.listBySession(ctx([PERMISSIONS.EXAMS_VIEW]), "s-1");
    expect(vi.mocked(listAttendanceBySession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(findResultsBySession)).toHaveBeenCalledTimes(1);
    expect(res.items[0]).toMatchObject({ studentNumber: "A123", studentName: "Ana Silva", attendanceStatus: "PRESENT", resultStatus: "DRAFT", overridden: true, overrideReasonPresent: true });
  });

  it("detail NEVER exposes the raw eligibilitySnapshot; blockers/warnings are allowlisted", async () => {
    vi.mocked(findExamCandidateById).mockResolvedValue(candidate() as never);
    vi.mocked(findExamSessionById).mockResolvedValue(session as never);
    vi.mocked(findAttendanceByCandidateId).mockResolvedValue(null as never);
    vi.mocked(findResultByCandidateId).mockResolvedValue(null as never);
    vi.mocked(listStudentDisplayByIds).mockResolvedValue([{ id: "st-1", code: "A123", firstName: "Ana", lastName: "Silva" }] as never);
    vi.mocked(listEnrollmentDisplayByIds).mockResolvedValue([{ id: "en-1", enrollmentNumber: "EN-1" }] as never);

    const detail = await examCandidateAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "c-1");
    expect(detail).not.toBeNull();
    expect(JSON.stringify(detail)).not.toContain(SECRET);
    expect(detail!.eligibility.blockers).toEqual(["ATTENDANCE_BELOW_REQUIRED"]);
    expect(detail!.eligibility.warnings).toEqual(["FINANCIAL_CLEARANCE_UNKNOWN"]);
    expect(detail!.eligibility.requiresApproval).toBe(true);
    expect(detail!.eligibility.overridden).toBe(true);
    expect(detail!.eligibility.overrideReason).toBe("motivo do override");
  });

  it("cross-tenant / missing candidate → null", async () => {
    vi.mocked(findExamCandidateById).mockResolvedValue(null as never);
    const detail = await examCandidateAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "nope");
    expect(detail).toBeNull();
  });
});
