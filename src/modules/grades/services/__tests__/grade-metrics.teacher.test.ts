import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// GRADE METRICS — TEACHER SUBJECT-LEVEL SCOPE (strict, fail-closed)
//
// Ownership: a result is visible iff
//   (A) assessmentEvent.teacherId = me  (authored event, any class group), OR
//   (B) enrollment.classGroup.teacherId = me AND subjectId ∈ ownedSubjectIds.
// No owned subjects → branch B disabled (fail closed): authored events only,
// NEVER bare class-group access.
//
// We capture the EXACT `where` listGradeResults builds and evaluate fixture rows
// through a faithful matcher (each OR-branch ANDs all its keys).
// =============================================================================

const { findMany, count, groupBy, aggregate } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    studentAssessmentResult: { findMany, count, groupBy, aggregate },
    studentSubjectProgress: { findMany },
  }),
}));

import { listGradeResults, getTeacherGradeKPIs } from "../grade-metrics.service";

const ORG = "org-1";
const A = "teacher-A";
const B = "teacher-B";
const SUBJ_A = "subject-A";
const SUBJ_B = "subject-B";

type Row = {
  organizationId: string;
  status: string;
  subjectId: string;
  enrollment: { classGroupId: string; classGroup: { teacherId: string } };
  assessmentEvent: { teacherId: string } | null;
};

// CG = shared class group whose homeroom is A; CG3 = unrelated group (teacher C).
const RESULT_A: Row = {
  organizationId: ORG, status: "GRADED", subjectId: SUBJ_A,
  enrollment: { classGroupId: "CG", classGroup: { teacherId: A } },
  assessmentEvent: null, // continuous, A's subject in A's class group
};
const RESULT_B: Row = {
  organizationId: ORG, status: "GRADED", subjectId: SUBJ_B,
  enrollment: { classGroupId: "CG", classGroup: { teacherId: A } }, // SAME class group
  assessmentEvent: { teacherId: B }, // B authored the Subject B assessment
};
const RESULT_A_OTHER_CG: Row = {
  organizationId: ORG, status: "GRADED", subjectId: SUBJ_A,
  enrollment: { classGroupId: "CG2", classGroup: { teacherId: "teacher-C" } },
  assessmentEvent: { teacherId: A }, // A authored it, different class group
};
const RESULT_A_UNRELATED: Row = {
  organizationId: ORG, status: "GRADED", subjectId: SUBJ_A,
  enrollment: { classGroupId: "CG3", classGroup: { teacherId: "teacher-C" } },
  assessmentEvent: null, // A's subject but NOT A's class group, no event
};

// ── Faithful matcher: an OR-branch ANDs every key it carries ──────────────────
function matchKey(key: string, val: unknown, row: Row): boolean {
  if (key === "assessmentEvent") return row.assessmentEvent?.teacherId === (val as { teacherId: string }).teacherId;
  if (key === "subjectId") return (val as { in: string[] }).in.includes(row.subjectId);
  if (key === "enrollment") {
    const enr = val as Record<string, unknown>;
    if ("classGroup" in enr) return row.enrollment.classGroup.teacherId === (enr.classGroup as { teacherId: string }).teacherId;
    if ("classGroupId" in enr) return row.enrollment.classGroupId === enr.classGroupId;
  }
  throw new Error(`unhandled key ${key}`);
}
function matchBranch(branch: Record<string, unknown>, row: Row): boolean {
  return Object.entries(branch).every(([k, v]) => matchKey(k, v, row));
}
function matchesWhere(where: Record<string, unknown>, row: Row): boolean {
  if (where.organizationId && where.organizationId !== row.organizationId) return false;
  if (typeof where.status === "string" && where.status !== row.status) return false;
  if (where.status && typeof where.status === "object" && (where.status as { not?: string }).not === row.status) return false;
  if (typeof where.subjectId === "string" && where.subjectId !== row.subjectId) return false;
  if (where.enrollment && !matchBranch({ enrollment: where.enrollment }, row)) return false;
  if (Array.isArray(where.AND)) {
    for (const clause of where.AND as Record<string, unknown>[]) {
      const branches = clause.OR as Record<string, unknown>[];
      if (!branches.some((b) => matchBranch(b, row))) return false;
    }
  }
  return true;
}

async function capturedWhere(params: Parameters<typeof listGradeResults>[1]): Promise<Record<string, unknown>> {
  findMany.mockClear();
  await listGradeResults(ORG, params);
  return findMany.mock.calls.find((c) => c[0]?.skip !== undefined)![0].where;
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
  groupBy.mockResolvedValue([]);
  aggregate.mockResolvedValue({ _avg: { normalizedGrade: null } });
});

describe("listGradeResults — subject-level isolation", () => {
  it("Teacher A sees own-subject Result A but NOT co-teacher Result B in the shared class group", async () => {
    const where = await capturedWhere({ page: 1, pageSize: 20, teacherId: A, ownedSubjectIds: [SUBJ_A] });
    expect(matchesWhere(where, RESULT_A)).toBe(true);
    expect(matchesWhere(where, RESULT_B)).toBe(false);
  });

  it("Teacher A does NOT see their subject in an unrelated class group (class-group bound required)", async () => {
    const where = await capturedWhere({ page: 1, pageSize: 20, teacherId: A, ownedSubjectIds: [SUBJ_A] });
    expect(matchesWhere(where, RESULT_A_UNRELATED)).toBe(false);
  });

  it("Teacher A sees an authored-event result even in another teacher's class group", async () => {
    const where = await capturedWhere({ page: 1, pageSize: 20, teacherId: A, ownedSubjectIds: [SUBJ_A] });
    expect(matchesWhere(where, RESULT_A_OTHER_CG)).toBe(true);
  });

  it("Teacher B sees own Result B but NOT Result A", async () => {
    const where = await capturedWhere({ page: 1, pageSize: 20, teacherId: B, ownedSubjectIds: [SUBJ_B] });
    expect(matchesWhere(where, RESULT_B)).toBe(true);
    expect(matchesWhere(where, RESULT_A)).toBe(false);
  });

  it("FAIL CLOSED: no owned subjects → only authored events, never class-group access", async () => {
    const where = await capturedWhere({ page: 1, pageSize: 20, teacherId: A, ownedSubjectIds: [] });
    expect(matchesWhere(where, RESULT_A)).toBe(false); // continuous in A's class group — NOT visible
    expect(matchesWhere(where, RESULT_B)).toBe(false);
    expect(matchesWhere(where, RESULT_A_OTHER_CG)).toBe(true); // authored event still visible
  });

  it("a classGroupId query param cannot widen scope", async () => {
    const where = await capturedWhere({
      page: 1, pageSize: 20, teacherId: A, ownedSubjectIds: [SUBJ_A], classGroupId: "CG2",
    });
    expect(matchesWhere(where, RESULT_A)).toBe(false); // filtered out (different group)
    expect(matchesWhere(where, RESULT_B)).toBe(false);
    expect(matchesWhere(where, RESULT_A_OTHER_CG)).toBe(true); // own authored event, in CG2
  });

  it("a forged subjectId query param cannot reach another teacher's subject", async () => {
    const where = await capturedWhere({
      page: 1, pageSize: 20, teacherId: A, ownedSubjectIds: [SUBJ_A], subjectId: SUBJ_B,
    });
    expect(matchesWhere(where, RESULT_B)).toBe(false);
  });

  it("ORG_ADMIN path (no teacherId) applies no teacher predicate — sees both", async () => {
    const where = await capturedWhere({ page: 1, pageSize: 20 });
    expect(where.AND).toBeUndefined();
    expect(matchesWhere(where, RESULT_A)).toBe(true);
    expect(matchesWhere(where, RESULT_B)).toBe(true);
  });
});

describe("getTeacherGradeKPIs — subject-ownership scope + counts", () => {
  it("scopes results by the subject predicate and at-risk by class group AND subject", async () => {
    await getTeacherGradeKPIs(ORG, A, [SUBJ_A]);
    const groupByWhere = groupBy.mock.calls[0][0].where;
    const branches = (groupByWhere.AND as Record<string, unknown>[])[0].OR as Record<string, unknown>[];
    expect(branches).toContainEqual({
      enrollment: { classGroup: { teacherId: A } },
      subjectId: { in: [SUBJ_A] },
    });
    const riskWhere = findMany.mock.calls[0][0].where;
    expect(riskWhere).toMatchObject({
      status: "FAILED",
      enrollment: { classGroup: { teacherId: A } },
      levelSubject: { subjectId: { in: [SUBJ_A] } },
    });
  });

  it("FAIL CLOSED: no owned subjects → at-risk is 0 and runs no progress query", async () => {
    await getTeacherGradeKPIs(ORG, A, []);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("derives the KPI counts from scoped data only", async () => {
    groupBy.mockResolvedValue([
      { status: "DRAFT", _count: { _all: 3 } },
      { status: "SUBMITTED", _count: { _all: 2 } },
      { status: "GRADED", _count: { _all: 10 } },
    ]);
    aggregate.mockResolvedValue({ _avg: { normalizedGrade: 73.456 } });
    findMany.mockResolvedValue([{ studentId: "s1" }, { studentId: "s2" }]);

    const kpis = await getTeacherGradeKPIs(ORG, A, [SUBJ_A]);
    expect(kpis.toGradeCount).toBe(5);
    expect(kpis.gradedCount).toBe(10);
    expect(kpis.avgNormalizedGrade).toBe(73.5);
    expect(kpis.atRiskStudentCount).toBe(2);
  });
});
