import { describe, it, expect, beforeEach, vi } from "vitest";

// Capture the Prisma args so we can assert every read is scoped by org + the
// teacher's ACTIVE assignment (invigilators.some.teacherId) — the visibility source.
const calls = vi.hoisted(() => ({
  sessionFindMany: [] as unknown[],
  sessionFindFirst: [] as unknown[],
  sessionCount: [] as unknown[],
  candidateFindMany: [] as unknown[],
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    examSession: {
      findMany: vi.fn(async (a: unknown) => { calls.sessionFindMany.push(a); return []; }),
      findFirst: vi.fn(async (a: unknown) => { calls.sessionFindFirst.push(a); return null; }),
      count: vi.fn(async (a: unknown) => { calls.sessionCount.push(a); return 0; }),
    },
    examCandidate: {
      findMany: vi.fn(async (a: unknown) => { calls.candidateFindMany.push(a); return []; }),
    },
  })),
}));

import {
  listAssignedSessions,
  countAssignedSessions,
  findAssignedSession,
  listSessionCandidates,
  loadSessionsProgress,
} from "@/modules/teacher-examinations/repositories/teacher-exam.repository";

const ORG = "org-1";
const T = "teacher-1";
const whereOf = (c: unknown) => (c as { where: Record<string, unknown> }).where;

beforeEach(() => {
  calls.sessionFindMany.length = 0;
  calls.sessionFindFirst.length = 0;
  calls.sessionCount.length = 0;
  calls.candidateFindMany.length = 0;
});

describe("teacher-exam.repository — assignment + org scoping (fail-closed by where-clause)", () => {
  it("list is scoped by org AND an active assignment for the teacher", async () => {
    await listAssignedSessions(ORG, T, {}, 0, 20);
    const w = whereOf(calls.sessionFindMany[0]);
    expect(w.organizationId).toBe(ORG);
    expect(w.invigilators).toEqual({ some: { teacherId: T } });
  });

  it("role filter narrows the assignment (invigilators.some.role)", async () => {
    await listAssignedSessions(ORG, T, { role: "MARKER" }, 0, 20);
    expect(whereOf(calls.sessionFindMany[0]).invigilators).toEqual({ some: { teacherId: T, role: "MARKER" } });
  });

  it("pending maps to operational statuses; explicit status overrides it", async () => {
    await listAssignedSessions(ORG, T, { pending: "true" }, 0, 20);
    expect(whereOf(calls.sessionFindMany[0]).status).toEqual({ in: ["LOCKED", "IN_PROGRESS", "COMPLETED"] });
    await listAssignedSessions(ORG, T, { pending: "true", status: "COMPLETED" }, 0, 20);
    expect(whereOf(calls.sessionFindMany[1]).status).toBe("COMPLETED");
  });

  it("subject + period filters keep the assignment scope", async () => {
    await listAssignedSessions(ORG, T, { subjectId: "sub-1", periodId: "per-1" }, 0, 20);
    const w = whereOf(calls.sessionFindMany[0]);
    expect(w.invigilators).toEqual({ some: { teacherId: T } });
    expect(w.levelSubject).toEqual({ subjectId: "sub-1" });
    expect(w.periodId).toBe("per-1");
  });

  it("count uses the same assignment+org scope as the list", async () => {
    await countAssignedSessions(ORG, T, {});
    const w = whereOf(calls.sessionCount[0]);
    expect(w.organizationId).toBe(ORG);
    expect(w.invigilators).toEqual({ some: { teacherId: T } });
  });

  it("detail is fail-closed: id + org + the teacher's assignment", async () => {
    const r = await findAssignedSession(ORG, T, "sess-1");
    const w = whereOf(calls.sessionFindFirst[0]);
    expect(w).toMatchObject({ id: "sess-1", organizationId: ORG, invigilators: { some: { teacherId: T } } });
    expect(r).toBeNull(); // mock returns null → the page will notFound()
  });

  it("candidate reads are org + session scoped (soft-deleted excluded)", async () => {
    await listSessionCandidates(ORG, "sess-1");
    expect(whereOf(calls.candidateFindMany[0])).toEqual({ organizationId: ORG, examSessionId: "sess-1", deletedAt: null });

    await loadSessionsProgress(ORG, ["s1", "s2"]);
    expect(whereOf(calls.candidateFindMany[1])).toEqual({ organizationId: ORG, examSessionId: { in: ["s1", "s2"] }, deletedAt: null });
  });
});
