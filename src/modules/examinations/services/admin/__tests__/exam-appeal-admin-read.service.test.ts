import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-appeal.repository", () => ({ countExamAppeals: vi.fn(), findExamAppealById: vi.fn(), listExamAppeals: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result.repository", () => ({ findExamResultById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result-revision.repository", () => ({ listRevisionsByResult: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({ listResultsByIds: vi.fn(), listStudentDisplayByIds: vi.fn(), listSubjectNamesByLevelSubjectIds: vi.fn() }));

import { countExamAppeals, findExamAppealById, listExamAppeals } from "@/modules/examinations/repositories/exam-appeal.repository";
import { findExamResultById } from "@/modules/examinations/repositories/exam-result.repository";
import { listRevisionsByResult } from "@/modules/examinations/repositories/exam-result-revision.repository";
import { listResultsByIds, listStudentDisplayByIds, listSubjectNamesByLevelSubjectIds } from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examAppealAdminReadService } from "../exam-appeal-admin-read.service";

function ctx(g: Permission[]): AuthContext {
  const s = new Set<string>(g);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => s.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
const appeal = { id: "ap-1", organizationId: "org-1", examResultId: "r-1", studentId: "st-1", requestedById: "st-1", reason: "Reavaliação por favor", status: "UNDER_REVIEW", decision: null, decisionReason: null, decidedById: null, decidedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date() };
const result = { id: "r-1", organizationId: "org-1", examCandidateId: "c-1", examAttemptId: "a", studentId: "st-1", enrollmentId: "en-1", levelSubjectId: "ls-1", score: 15, maxScore: 20, normalizedScore: 75, status: "PUBLISHED", resultCode: "SCORED", markerId: null, reviewedById: null, approvedById: null, submittedAt: null, reviewedAt: null, approvedAt: null, publishedAt: new Date(), invalidatedAt: null, invalidationReason: null, remarks: null, resultChecksum: null, currentRevisionId: "rev-1", createdAt: new Date(), updatedAt: new Date() };
beforeEach(() => vi.clearAllMocks());

describe("appeal read service", () => {
  it("lists org-scoped appeals with subject/student enrichment + allowedActions", async () => {
    vi.mocked(listExamAppeals).mockResolvedValue([appeal] as never);
    vi.mocked(countExamAppeals).mockResolvedValue(1);
    vi.mocked(listResultsByIds).mockResolvedValue([{ id: "r-1", examCandidateId: "c-1", levelSubjectId: "ls-1", status: "PUBLISHED", resultCode: "SCORED", score: 15, maxScore: 20, normalizedScore: 75, currentRevisionId: "rev-1" }] as never);
    vi.mocked(listStudentDisplayByIds).mockResolvedValue([{ id: "st-1", code: "A1", firstName: "Ana", lastName: "S" }] as never);
    vi.mocked(listSubjectNamesByLevelSubjectIds).mockResolvedValue([{ levelSubjectId: "ls-1", subjectName: "Matemática" }] as never);

    const res = await examAppealAdminReadService.list(
      ctx([PERMISSIONS.EXAMS_VIEW, PERMISSIONS.EXAMS_REVIEW_APPEAL, PERMISSIONS.EXAMS_APPROVE_APPEAL, PERMISSIONS.EXAMS_REJECT_APPEAL]),
      {}
    );
    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({ appealId: "ap-1", subjectName: "Matemática", studentName: "Ana S", status: "UNDER_REVIEW" });
    // UNDER_REVIEW + approve/reject perms → approve/reject available, review not.
    expect(res.items[0]!.allowedActions).toMatchObject({ canReview: false, canApprove: true, canReject: true });
  });

  it("detail shows original vs current official + revisions; no raw metadata", async () => {
    vi.mocked(findExamAppealById).mockResolvedValue(appeal as never);
    vi.mocked(findExamResultById).mockResolvedValue(result as never);
    vi.mocked(listRevisionsByResult).mockResolvedValue([
      { id: "rev-1", examResultId: "r-1", revisionNumber: 1, previousScore: 15, revisedScore: 18, sourceType: "APPEAL", isCurrent: true, createdAt: new Date() },
    ] as never);

    const detail = await examAppealAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "ap-1");
    expect(detail!.originalResult).toMatchObject({ source: "BASE", score: 15 });
    expect(detail!.currentOfficialResult).toMatchObject({ source: "REVISION", score: 18 });
    expect(detail!.revisions).toHaveLength(1);
    expect(detail!.ownership).toEqual({ studentId: "st-1", requestedById: "st-1" });
    expect(JSON.stringify(detail)).not.toMatch(/metadata|oldValues|newValues/);
  });

  it("cross-tenant → null; throws without exams.view", async () => {
    vi.mocked(findExamAppealById).mockResolvedValue(null as never);
    expect(await examAppealAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "x")).toBeNull();
    await expect(examAppealAdminReadService.list(ctx([]), {})).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});
