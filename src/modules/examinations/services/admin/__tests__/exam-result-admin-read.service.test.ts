import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({ findExamSessionById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-candidate.repository", () => ({ listRegisteredCandidatesBySession: vi.fn(), findExamCandidateById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-attendance.repository", () => ({ listAttendanceBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result.repository", () => ({ findResultsBySession: vi.fn(), findExamResultById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result-revision.repository", () => ({ listRevisionsByResult: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({ listCurrentRevisionsByResultIds: vi.fn(), listStudentDisplayByIds: vi.fn() }));

import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession, findExamCandidateById } from "@/modules/examinations/repositories/exam-candidate.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import { findResultsBySession, findExamResultById } from "@/modules/examinations/repositories/exam-result.repository";
import { listRevisionsByResult } from "@/modules/examinations/repositories/exam-result-revision.repository";
import { listCurrentRevisionsByResultIds, listStudentDisplayByIds } from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examResultAdminReadService } from "../exam-result-admin-read.service";

function ctx(g: Permission[]): AuthContext {
  const s = new Set<string>(g);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => s.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
const scoredResult = { id: "r-1", examCandidateId: "c-1", examAttemptId: "a-1", studentId: "st-1", enrollmentId: "en-1", levelSubjectId: "ls-1", score: 15, maxScore: 20, normalizedScore: 75, status: "PUBLISHED", resultCode: "SCORED", markerId: "m", reviewedById: "rv", approvedById: "ap", submittedAt: new Date(), reviewedAt: new Date(), approvedAt: new Date(), publishedAt: new Date(), remarks: null, currentRevisionId: null };
beforeEach(() => vi.clearAllMocks());

describe("result read service", () => {
  it("list overlays the official result (BASE) and exposes exam percentage — no final grade field", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", status: "PUBLISHED" } as never);
    vi.mocked(listRegisteredCandidatesBySession).mockResolvedValue([{ id: "c-1", studentId: "st-1" }] as never);
    vi.mocked(findResultsBySession).mockResolvedValue([scoredResult] as never);
    vi.mocked(listAttendanceBySession).mockResolvedValue([{ examCandidateId: "c-1", status: "PRESENT" }] as never);
    vi.mocked(listCurrentRevisionsByResultIds).mockResolvedValue([] as never);
    vi.mocked(listStudentDisplayByIds).mockResolvedValue([{ id: "st-1", code: "A1", firstName: "Ana", lastName: "S" }] as never);

    const res = await examResultAdminReadService.listBySession(ctx([PERMISSIONS.EXAMS_VIEW]), "s-1");
    const item = res.items[0]!;
    expect(item.officialResult).toMatchObject({ source: "BASE", score: 15, resultCode: "SCORED" });
    expect(item).toHaveProperty("normalizedScore");
    const keys = Object.keys(item);
    expect(keys.some((k) => /finalGrade|passFail|isPass|grade\b/i.test(k))).toBe(false);
  });

  it("detail overlays a REVISION when a current revision exists", async () => {
    vi.mocked(findExamResultById).mockResolvedValue({ ...scoredResult, currentRevisionId: "rev-1" } as never);
    vi.mocked(findExamCandidateById).mockResolvedValue({ id: "c-1", examSessionId: "s-1", studentId: "st-1" } as never);
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", status: "PUBLISHED" } as never);
    vi.mocked(listRevisionsByResult).mockResolvedValue([
      { id: "rev-1", examResultId: "r-1", revisionNumber: 1, previousScore: 15, revisedScore: 18, sourceType: "APPEAL", isCurrent: true, createdAt: new Date() },
    ] as never);
    vi.mocked(listStudentDisplayByIds).mockResolvedValue([{ id: "st-1", code: "A1", firstName: "Ana", lastName: "S" }] as never);

    const detail = await examResultAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "r-1");
    expect(detail!.officialResult).toMatchObject({ source: "REVISION", score: 18 });
    expect(detail!.revisions).toHaveLength(1);
  });

  it("cross-tenant / missing → null; throws without exams.view", async () => {
    vi.mocked(findExamResultById).mockResolvedValue(null as never);
    expect(await examResultAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "x")).toBeNull();
    await expect(examResultAdminReadService.listBySession(ctx([]), "s-1")).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});
