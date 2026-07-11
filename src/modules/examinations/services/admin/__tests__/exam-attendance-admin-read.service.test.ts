import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({ findExamSessionById: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-candidate.repository", () => ({ listRegisteredCandidatesBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-attendance.repository", () => ({ listAttendanceBySession: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({ listStudentDisplayByIds: vi.fn() }));

import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import { listStudentDisplayByIds } from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examAttendanceAdminReadService } from "../exam-attendance-admin-read.service";

function ctx(g: Permission[]): AuthContext {
  const s = new Set<string>(g);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => s.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
beforeEach(() => vi.clearAllMocks());

describe("attendance roster", () => {
  it("includes marked + unmarked, computes summary, exposes no class-attendance field", async () => {
    vi.mocked(findExamSessionById).mockResolvedValue({ id: "s-1", organizationId: "org-1", status: "IN_PROGRESS" } as never);
    vi.mocked(listRegisteredCandidatesBySession).mockResolvedValue([
      { id: "c-1", studentId: "st-1", status: "REGISTERED" },
      { id: "c-2", studentId: "st-2", status: "REGISTERED" },
    ] as never);
    vi.mocked(listAttendanceBySession).mockResolvedValue([
      { id: "att-1", examCandidateId: "c-1", status: "PRESENT", checkedInAt: null, markedAt: new Date(), markedById: "u", remarks: null },
    ] as never);
    vi.mocked(listStudentDisplayByIds).mockResolvedValue([
      { id: "st-1", code: "A1", firstName: "Ana", lastName: "S" },
      { id: "st-2", code: "A2", firstName: "Rui", lastName: "P" },
    ] as never);

    const roster = await examAttendanceAdminReadService.getRoster(ctx([PERMISSIONS.EXAMS_VIEW]), "s-1");
    expect(roster.items).toHaveLength(2);
    expect(roster.items.find((i) => i.examCandidateId === "c-1")!.hasAttendance).toBe(true);
    expect(roster.items.find((i) => i.examCandidateId === "c-2")!.hasAttendance).toBe(false);
    expect(roster.summary).toMatchObject({ totalRegistered: 2, marked: 1, unmarked: 1, present: 1, completionPercentage: 50 });
    // No class-attendance concepts leak into the exam roster item.
    const keys = Object.keys(roster.items[0]!);
    expect(keys.some((k) => /class|lesson|session_attendance/i.test(k))).toBe(false);
  });

  it("throws without exams.view", async () => {
    await expect(examAttendanceAdminReadService.getRoster(ctx([]), "s-1")).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});
