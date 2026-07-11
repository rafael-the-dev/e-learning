import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({ findExamSessionById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result.repository", () => ({ findResultsBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result-revision.repository", () => ({ listRevisionsByResult: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-grade-component-binding.repository", () => ({ findActiveBindingBySession: vi.fn() }));
vi.mock("@/modules/assessments/repositories/assessment-component.repository", () => ({ findComponentById: vi.fn() }));
vi.mock("@/modules/assessments/repositories/assessment-policy.repository", () => ({ findAssessmentPolicyById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({
  isSessionConsumedRead: vi.fn(),
  listIntegrationEventsByResultIds: vi.fn(),
}));

import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import { findActiveBindingBySession } from "@/modules/examinations/repositories/exam-grade-component-binding.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import { isSessionConsumedRead, listIntegrationEventsByResultIds } from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examIntegrationAdminReadService } from "../exam-integration-admin-read.service";

function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => set.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
const view = [PERMISSIONS.EXAMS_VIEW, PERMISSIONS.EXAMS_INTEGRATE_RESULTS];

beforeEach(() => vi.clearAllMocks());

describe("integration binding — explicit only, mismatch honest", () => {
  it("flags maxScore ≠ component maxGrade as a blocker (never rescales/guesses)", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", levelSubjectId: "ls-1" } as never);
    vi.mocked(findActiveBindingBySession).mockResolvedValue({ id: "b-1", assessmentComponentId: "comp-1" } as never);
    vi.mocked(findResultsBySession).mockResolvedValue([{ id: "r-1", maxScore: 100 }] as never);
    vi.mocked(isSessionConsumedRead).mockResolvedValue(false);
    vi.mocked(findComponentById).mockResolvedValue({ id: "comp-1", name: "Exame", maxGrade: 20, assessmentPolicyId: "pol-1" } as never);
    vi.mocked(findAssessmentPolicyById).mockResolvedValue({ id: "pol-1", levelSubjectId: "ls-1" } as never);

    const dto = await examIntegrationAdminReadService.getBinding(ctx(view), "s-1");
    expect(dto.assessmentComponentId).toBe("comp-1");
    expect(dto.componentMaxGrade).toBe(20);
    expect(dto.examMaxScore).toBe(100);
    expect(dto.compatible).toBe(true);
    expect(dto.blockers.some((b) => b.includes("nota máxima"))).toBe(true);
    expect(dto.canBind).toBe(false); // already bound
    expect(dto.canRebind).toBe(true);
  });

  it("unbound session → no component, canBind true (no heuristic fallback)", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", levelSubjectId: "ls-1" } as never);
    vi.mocked(findActiveBindingBySession).mockResolvedValue(null as never);
    vi.mocked(findResultsBySession).mockResolvedValue([] as never);
    vi.mocked(isSessionConsumedRead).mockResolvedValue(false);
    const dto = await examIntegrationAdminReadService.getBinding(ctx(view), "s-1");
    expect(dto.assessmentComponentId).toBeNull();
    expect(dto.compatible).toBe(false);
    expect(dto.canBind).toBe(true);
  });
});

describe("integration status — gradeState honest", () => {
  it("SCORED published + no ledger → MISSING (integrate); non-scored → UNSUPPORTED", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", levelSubjectId: "ls-1" } as never);
    vi.mocked(findResultsBySession).mockResolvedValue([
      { id: "r-scored", status: "PUBLISHED", resultCode: "SCORED", score: 15, maxScore: 20, normalizedScore: 75, currentRevisionId: null },
      { id: "r-absent", status: "PUBLISHED", resultCode: "ABSENT", score: null, maxScore: 20, normalizedScore: null, currentRevisionId: null },
    ] as never);
    vi.mocked(listIntegrationEventsByResultIds).mockResolvedValue([] as never);

    const dto = await examIntegrationAdminReadService.getIntegrationStatus(ctx(view), "s-1");
    const scored = dto.results.find((r) => r.examResultId === "r-scored")!;
    const absent = dto.results.find((r) => r.examResultId === "r-absent")!;
    expect(scored.gradeState).toBe("MISSING");
    expect(scored.supported).toBe(true);
    expect(scored.canIntegrate).toBe(true);
    expect(scored.canReconcile).toBe(false);
    expect(absent.gradeState).toBe("UNSUPPORTED");
    expect(absent.supported).toBe(false);
    expect(absent.canIntegrate).toBe(false);
    expect(dto.summary).toMatchObject({ total: 2, missing: 1, unsupported: 1, failed: 0 });
  });

  it("throws without exams.view", async () => {
    await expect(examIntegrationAdminReadService.getIntegrationStatus(ctx([]), "s-1")).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});
