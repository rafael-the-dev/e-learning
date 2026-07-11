import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import type { ExamPeriodRecord } from "@/modules/examinations/types/repository";

vi.mock("@/modules/examinations/repositories/exam-period.repository", () => ({
  listExamPeriods: vi.fn(),
  countExamPeriods: vi.fn(),
  findExamPeriodById: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-session.repository", () => ({
  countExamSessions: vi.fn(),
}));

import {
  listExamPeriods,
  countExamPeriods,
  findExamPeriodById,
} from "@/modules/examinations/repositories/exam-period.repository";
import { countExamSessions } from "@/modules/examinations/repositories/exam-session.repository";
import { examPeriodAdminReadService } from "../exam-period-admin-read.service";

const listMock = vi.mocked(listExamPeriods);
const countMock = vi.mocked(countExamPeriods);
const findMock = vi.mocked(findExamPeriodById);
const sessionCountMock = vi.mocked(countExamSessions);

function ctx(granted: Permission[]): AuthContext {
  const set = new Set<string>(granted);
  return {
    userId: "u-1",
    organizationId: "org-1",
    roles: [],
    ability: {
      can: (p: Permission) => set.has(p),
      canAll: (ps: Permission[]) => ps.every((p) => set.has(p)),
      canAny: (ps: Permission[]) => ps.some((p) => set.has(p)),
    },
  } as AuthContext;
}

function periodRecord(over: Partial<ExamPeriodRecord> = {}): ExamPeriodRecord {
  const now = new Date("2026-07-01T00:00:00Z");
  return {
    id: "p-1",
    organizationId: "org-1",
    branchId: null,
    name: "Época 1",
    academicYear: "2026",
    term: null,
    status: "DRAFT",
    startsAt: now,
    endsAt: now,
    lockedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdById: null,
    lockedById: null,
    completedById: null,
    cancelledById: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExamPeriodAdminReadService.list", () => {
  it("throws AuthorizationError without exams.view", async () => {
    await expect(examPeriodAdminReadService.list(ctx([]))).rejects.toMatchObject({
      name: "AuthorizationError",
    });
    expect(listMock).not.toHaveBeenCalled();
  });

  it("is tenant-scoped and paginates (skip/take from page)", async () => {
    listMock.mockResolvedValue([periodRecord()]);
    countMock.mockResolvedValue(1);

    const result = await examPeriodAdminReadService.list(ctx([PERMISSIONS.EXAMS_VIEW]), {
      page: 2,
      pageSize: 10,
      status: "DRAFT",
    });

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", status: "DRAFT", skip: 10, take: 10 })
    );
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.items[0]?.id).toBe("p-1");
  });

  it("attaches server-computed allowedActions (DRAFT + exams.schedule → canOpen)", async () => {
    listMock.mockResolvedValue([periodRecord({ status: "DRAFT" })]);
    countMock.mockResolvedValue(1);

    const result = await examPeriodAdminReadService.list(
      ctx([PERMISSIONS.EXAMS_VIEW, PERMISSIONS.EXAMS_SCHEDULE])
    );
    expect(result.items[0]?.allowedActions).toMatchObject({ canOpen: true, canLock: false });
  });

  it("viewer without exams.schedule sees no lifecycle actions", async () => {
    listMock.mockResolvedValue([periodRecord({ status: "DRAFT" })]);
    countMock.mockResolvedValue(1);
    const result = await examPeriodAdminReadService.list(ctx([PERMISSIONS.EXAMS_VIEW]));
    expect(result.items[0]?.allowedActions.canOpen).toBe(false);
  });

  it("clamps pageSize to the max", async () => {
    listMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    await examPeriodAdminReadService.list(ctx([PERMISSIONS.EXAMS_VIEW]), { pageSize: 9999 });
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});

describe("ExamPeriodAdminReadService.getDetail", () => {
  it("returns null when the period is not found / cross-tenant", async () => {
    findMock.mockResolvedValue(null);
    const detail = await examPeriodAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "nope");
    expect(detail).toBeNull();
    expect(findMock).toHaveBeenCalledWith({ organizationId: "org-1", id: "nope" });
  });

  it("includes the batched session count", async () => {
    findMock.mockResolvedValue(periodRecord({ status: "OPEN" }));
    sessionCountMock.mockResolvedValue(3);
    const detail = await examPeriodAdminReadService.getDetail(ctx([PERMISSIONS.EXAMS_VIEW]), "p-1");
    expect(detail?.sessionCount).toBe(3);
    expect(sessionCountMock).toHaveBeenCalledWith({ organizationId: "org-1", periodId: "p-1" });
  });
});
