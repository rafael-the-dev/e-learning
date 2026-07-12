import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";

vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({ countExamSessions: vi.fn(), listExamSessions: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-result.repository", () => ({ countExamResults: vi.fn(), listExamResults: vi.fn() }));
vi.mock("@/modules/examinations/repositories/exam-admin-read.repository", () => ({
  countActiveCandidatesBySessionIds: vi.fn(),
  isSessionConsumedRead: vi.fn(),
  listActiveBindingsBySessionIds: vi.fn(),
  listIntegrationEventsByResultIds: vi.fn(),
  listInvigilatorAssignmentsBySessionIds: vi.fn(),
  listPeriodWindowsByIds: vi.fn(),
  listSessionsForConflicts: vi.fn(),
  listRoomNamesByIds: vi.fn(),
  listInvigilatorNamesByIds: vi.fn(),
}));

import {
  countActiveCandidatesBySessionIds,
  listInvigilatorAssignmentsBySessionIds,
  listPeriodWindowsByIds,
  listSessionsForConflicts,
  listRoomNamesByIds,
  listInvigilatorNamesByIds,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import { examinationOperationsReadService } from "../examination-operations-read.service";

function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return { userId: "u", organizationId: "org-1", roles: [], ability: { can: (p: Permission) => set.has(p), canAll: () => false, canAny: () => false } } as AuthContext;
}
const d = (h: number) => new Date(`2026-07-10T${String(h).padStart(2, "0")}:00:00Z`);

beforeEach(() => vi.clearAllMocks());

describe("operations conflict detection (detection only, org-scoped)", () => {
  it("detects room overlap, missing room, over-capacity, outside-window", async () => {
    vi.mocked(listSessionsForConflicts).mockResolvedValue([
      { id: "sA", title: "A", status: "SCHEDULED", startsAt: d(9), endsAt: d(11), roomId: "room-1", capacity: 30, periodId: "p-1" },
      { id: "sB", title: "B", status: "SCHEDULED", startsAt: d(10), endsAt: d(12), roomId: "room-1", capacity: 30, periodId: "p-1" }, // overlaps sA in room-1
      { id: "sC", title: "C", status: "SCHEDULED", startsAt: d(9), endsAt: d(10), roomId: null, capacity: 1, periodId: "p-1" }, // no room, over capacity
      { id: "sD", title: "D", status: "SCHEDULED", startsAt: d(1), endsAt: d(2), roomId: "room-2", capacity: 30, periodId: "p-1" }, // outside window
    ] as never);
    vi.mocked(listInvigilatorAssignmentsBySessionIds).mockResolvedValue([] as never);
    vi.mocked(countActiveCandidatesBySessionIds).mockResolvedValue([{ examSessionId: "sC", activeCount: 5 }] as never);
    vi.mocked(listPeriodWindowsByIds).mockResolvedValue([{ id: "p-1", startsAt: d(8), endsAt: d(20) }] as never);
    vi.mocked(listRoomNamesByIds).mockResolvedValue(new Map([["room-1", "Sala 1"]]));
    vi.mocked(listInvigilatorNamesByIds).mockResolvedValue(new Map());

    const c = await examinationOperationsReadService.getConflicts(ctx([PERMISSIONS.EXAMS_OPERATIONS_VIEW]));
    expect(c.roomConflicts).toHaveLength(1);
    expect(c.roomConflicts[0]!.sessions.map((s) => s.sessionId).sort()).toEqual(["sA", "sB"]);
    expect(c.sessionsWithoutRoom.map((s) => s.sessionId)).toEqual(["sC"]);
    expect(c.sessionsWithoutInvigilators.map((s) => s.sessionId).sort()).toEqual(["sA", "sB", "sC", "sD"]);
    expect(c.overCapacitySessions.map((s) => s.sessionId)).toEqual(["sC"]);
    expect(c.sessionsOutsidePeriodWindow.map((s) => s.sessionId)).toEqual(["sD"]);
    expect(c.counts.roomConflicts).toBe(1);
  });

  it("requires exams.operationsView (not just exams.view)", async () => {
    await expect(examinationOperationsReadService.getConflicts(ctx([PERMISSIONS.EXAMS_VIEW]))).rejects.toMatchObject({
      name: "AuthorizationError",
    });
  });
});
