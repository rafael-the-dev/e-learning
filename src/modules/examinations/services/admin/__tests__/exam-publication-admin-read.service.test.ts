import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({ findExamSessionById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-candidate.repository", () => ({ listRegisteredCandidatesBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result.repository", () => ({ findResultsBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-attendance.repository", () => ({ listAttendanceBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-publication.repository", () => ({ findActivePublicationBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({ isSessionConsumedRead: vi.fn() }));

import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import { findActivePublicationBySession } from "@/modules/examinations/repositories/exam-publication.repository";
import { isSessionConsumedRead } from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examPublicationAdminReadService } from "../exam-publication-admin-read.service";

function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => set.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
const caps = [PERMISSIONS.EXAMS_VIEW, PERMISSIONS.EXAMS_PUBLISH_RESULTS, PERMISSIONS.EXAMS_RETRACT_PUBLICATION];

beforeEach(() => vi.clearAllMocks());

describe("publication readiness — reuses the canonical helper", () => {
  it("a registered candidate without a result → not ready, canPublish false, blocker listed", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", status: "COMPLETED" } as never);
    vi.mocked(listRegisteredCandidatesBySession).mockResolvedValue([{ id: "c-1" }] as never);
    vi.mocked(findResultsBySession).mockResolvedValue([] as never);
    vi.mocked(listAttendanceBySession).mockResolvedValue([] as never);
    vi.mocked(findActivePublicationBySession).mockResolvedValue(null as never);
    vi.mocked(isSessionConsumedRead).mockResolvedValue(false);

    const r = await examPublicationAdminReadService.getReadiness(ctx(caps), "s-1");
    expect(r.ready).toBe(false);
    expect(r.missingCandidateIds).toEqual(["c-1"]);
    expect(r.blockers.some((b) => b.includes("sem resultado"))).toBe(true);
    expect(r.allowedActions.canPublish).toBe(false);
  });

  it("consumed publication → canRetract false", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", status: "PUBLISHED" } as never);
    vi.mocked(listRegisteredCandidatesBySession).mockResolvedValue([{ id: "c-1" }] as never);
    vi.mocked(findResultsBySession).mockResolvedValue([{ id: "r-1", examCandidateId: "c-1", status: "PUBLISHED", resultCode: "SCORED" }] as never);
    vi.mocked(listAttendanceBySession).mockResolvedValue([{ examCandidateId: "c-1", status: "PRESENT" }] as never);
    vi.mocked(findActivePublicationBySession).mockResolvedValue({ id: "pub-1", status: "PUBLISHED", reason: "x" } as never);
    vi.mocked(isSessionConsumedRead).mockResolvedValue(true);

    const r = await examPublicationAdminReadService.getReadiness(ctx(caps), "s-1");
    expect(r.downstreamConsumed).toBe(true);
    expect(r.allowedActions.canRetract).toBe(false);
  });

  it("throws without exams.view", async () => {
    await expect(examPublicationAdminReadService.getReadiness(ctx([]), "s-1")).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});
