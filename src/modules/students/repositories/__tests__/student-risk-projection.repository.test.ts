import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// M11.1 — StudentRiskProjection repository: persistence contract. The repo is the
// SINGLE write path and the cheap read surface the dashboards consume. These tests
// assert scoping, rank-from-level derivation, reasons JSON round-trip, the KPI
// buckets, and the finance-blind read variant (no hidden financial-risk inference).
// =============================================================================

const { upsert, findUnique, groupBy, findMany, count } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  groupBy: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({
    studentRiskProjection: { upsert, findUnique, groupBy, findMany, count },
  })),
}));

import {
  upsertStudentRiskProjection,
  findStudentRiskProjection,
  getStudentRiskLevelCounts,
  findStudentRiskWatchlist,
  getStudentRiskDimensionAtRiskCounts,
  getStudentIdsWithDimensionRisk,
} from "@/modules/students/repositories/student-risk-projection.repository";
import type { UpsertStudentRiskProjectionData } from "@/modules/students/services/student-risk-projection.types";
import type { StudentRiskReason } from "@/modules/students/services/student-risk.service";

const ORG = "org-1";

function reason(over: Partial<StudentRiskReason> = {}): StudentRiskReason {
  return {
    id: "failed-subject",
    dimension: "academic",
    level: "CRITICAL",
    message: "1 disciplina reprovada.",
    recommendedAction: "Agendar apoio académico.",
    ...over,
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    organizationId: ORG,
    studentId: "s1",
    level: "HIGH",
    levelRank: 3,
    levelWithoutFinance: "MODERATE",
    levelWithoutFinanceRank: 2,
    isAtRisk: true,
    evaluationStatus: "EVALUATED",
    academicLevel: "NONE",
    attendanceLevel: "MODERATE",
    financialLevel: "HIGH",
    progressionLevel: "NONE",
    documentsLevel: "NONE",
    reasonsJson: null,
    recommendedAction: null,
    sourceVersion: "student-risk-v1",
    evaluatedAt: new Date("2026-07-21T10:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-21T10:00:00Z"),
    ...over,
  };
}

function upsertData(over: Partial<UpsertStudentRiskProjectionData> = {}): UpsertStudentRiskProjectionData {
  return {
    organizationId: ORG,
    studentId: "s1",
    level: "HIGH",
    levelWithoutFinance: "MODERATE",
    isAtRisk: true,
    evaluationStatus: "EVALUATED",
    academicLevel: "NONE",
    attendanceLevel: "MODERATE",
    financialLevel: "HIGH",
    progressionLevel: "NONE",
    documentsLevel: "NONE",
    reasons: [],
    recommendedAction: null,
    sourceVersion: "student-risk-v1",
    evaluatedAt: new Date("2026-07-21T10:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  upsert.mockReset();
  findUnique.mockReset();
  groupBy.mockReset();
  findMany.mockReset();
  count.mockReset();
});

describe("upsertStudentRiskProjection", () => {
  it("keys the upsert by org+student and derives numeric ranks from the levels", async () => {
    upsert.mockResolvedValue(row());
    await upsertStudentRiskProjection(upsertData({ level: "CRITICAL", levelWithoutFinance: "LOW" }));

    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ organizationId_studentId: { organizationId: ORG, studentId: "s1" } });
    // Ranks are derived, never taken from the caller (CRITICAL=4, LOW=1).
    expect(arg.create.levelRank).toBe(4);
    expect(arg.create.levelWithoutFinanceRank).toBe(1);
    expect(arg.update.levelRank).toBe(4);
  });

  it("stringifies reasons to JSON, or NULL when empty", async () => {
    upsert.mockResolvedValue(row());
    await upsertStudentRiskProjection(upsertData({ reasons: [reason()] }));
    expect(JSON.parse(upsert.mock.calls[0][0].create.reasonsJson)[0].id).toBe("failed-subject");

    upsert.mockClear();
    upsert.mockResolvedValue(row());
    await upsertStudentRiskProjection(upsertData({ reasons: [] }));
    expect(upsert.mock.calls[0][0].create.reasonsJson).toBeNull();
  });

  it("runs on the provided transaction client when given (no getDb)", async () => {
    const txUpsert = vi.fn().mockResolvedValue(row());
    const tx = { studentRiskProjection: { upsert: txUpsert } } as never;
    await upsertStudentRiskProjection(upsertData(), tx);
    expect(txUpsert).toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("findStudentRiskProjection", () => {
  it("reads by the org+student unique key and parses the reasons JSON", async () => {
    findUnique.mockResolvedValue(row({ reasonsJson: JSON.stringify([reason()]) }));
    const p = await findStudentRiskProjection("s1", ORG);
    expect(findUnique.mock.calls[0][0].where).toEqual({
      organizationId_studentId: { organizationId: ORG, studentId: "s1" },
    });
    expect(p?.reasons[0].id).toBe("failed-subject");
    expect(p?.level).toBe("HIGH");
  });

  it("returns null when there is no projection", async () => {
    findUnique.mockResolvedValue(null);
    expect(await findStudentRiskProjection("s1", ORG)).toBeNull();
  });

  it("tolerates malformed reasons JSON (→ empty array)", async () => {
    findUnique.mockResolvedValue(row({ reasonsJson: "{not json" }));
    const p = await findStudentRiskProjection("s1", ORG);
    expect(p?.reasons).toEqual([]);
  });
});

describe("getStudentRiskLevelCounts", () => {
  it("buckets atRisk / noRisk / insufficientData over the full level when finance-authorized", async () => {
    groupBy.mockResolvedValue([
      { level: "CRITICAL", _count: { _all: 3 } },
      { level: "HIGH", _count: { _all: 5 } },
      { level: "NONE", _count: { _all: 140 } },
      { level: "UNKNOWN", _count: { _all: 12 } },
    ]);
    const counts = await getStudentRiskLevelCounts(ORG, { financeAuthorized: true });
    expect(groupBy.mock.calls[0][0].by).toEqual(["level"]);
    expect(counts.atRisk).toBe(8);
    expect(counts.noRisk).toBe(140);
    expect(counts.insufficientData).toBe(12);
    expect(counts.byLevel.CRITICAL).toBe(3);
  });

  it("aggregates over the finance-excluded level when NOT finance-authorized", async () => {
    groupBy.mockResolvedValue([{ levelWithoutFinance: "MODERATE", _count: { _all: 2 } }]);
    const counts = await getStudentRiskLevelCounts(ORG, { financeAuthorized: false });
    expect(groupBy.mock.calls[0][0].by).toEqual(["levelWithoutFinance"]);
    expect(counts.atRisk).toBe(2);
  });

  it("filters by sourceVersion when provided", async () => {
    groupBy.mockResolvedValue([]);
    await getStudentRiskLevelCounts(ORG, { financeAuthorized: true, sourceVersion: "student-risk-v1" });
    expect(groupBy.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, sourceVersion: "student-risk-v1" });
  });
});

describe("findStudentRiskWatchlist", () => {
  it("filters by the full-level rank ≥ LOW and orders by severity then recency (finance-authorized)", async () => {
    findMany.mockResolvedValue([
      row({ studentId: "s1", student: { firstName: "Ana", lastName: "Silva" }, reasonsJson: JSON.stringify([reason()]) }),
    ]);
    const rows = await findStudentRiskWatchlist(ORG, { financeAuthorized: true, limit: 10 });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.levelRank).toEqual({ gte: 1 });
    expect(arg.orderBy).toEqual([{ levelRank: "desc" }, { evaluatedAt: "desc" }, { studentId: "asc" }]);
    // F-M2: soft-deleted students are excluded in the query (before orderBy/take).
    expect(arg.where.student).toEqual({ organizationId: ORG, deletedAt: null });
    expect(arg.take).toBe(10);
    expect(rows[0].studentName).toBe("Ana Silva");
    expect(rows[0].primaryReason?.id).toBe("failed-subject");
    expect(rows[0].level).toBe("HIGH");
    expect(rows[0].financialLevel).toBe("HIGH");
  });

  it("finance-blind: ranks by levelWithoutFinance, hides financial level and never picks a financial primary reason", async () => {
    findMany.mockResolvedValue([
      row({
        studentId: "s2",
        student: { firstName: "Rui", lastName: "Costa" },
        // A financial CRITICAL reason and an academic MODERATE reason.
        reasonsJson: JSON.stringify([
          reason({ id: "overdue-balance", dimension: "financial", level: "CRITICAL" }),
          reason({ id: "incomplete-assessments", dimension: "academic", level: "MODERATE", recommendedAction: "Concluir avaliações." }),
        ]),
      }),
    ]);
    const rows = await findStudentRiskWatchlist(ORG, { financeAuthorized: false });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.levelWithoutFinanceRank).toEqual({ gte: 1 });
    expect(arg.orderBy).toEqual([{ levelWithoutFinanceRank: "desc" }, { evaluatedAt: "desc" }, { studentId: "asc" }]);
    // F-M2: the finance-blind path applies the SAME soft-delete exclusion.
    expect(arg.where.student).toEqual({ organizationId: ORG, deletedAt: null });
    // The finance CRITICAL reason must NOT leak; the academic reason wins.
    expect(rows[0].primaryReason?.dimension).toBe("academic");
    expect(rows[0].recommendedAction).toBe("Concluir avaliações.");
    expect(rows[0].level).toBe("MODERATE"); // levelWithoutFinance
    expect(rows[0].financialLevel).toBe("NONE"); // hidden
  });

  it("scopes counts and watchlist to studentIds; empty scope short-circuits with no query", async () => {
    // Empty scope → no query, empty/zero result (not "no filter").
    const counts = await getStudentRiskLevelCounts(ORG, { financeAuthorized: true, studentIds: [] });
    expect(counts.atRisk).toBe(0);
    const wl = await findStudentRiskWatchlist(ORG, { financeAuthorized: true, studentIds: [] });
    expect(wl).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("M11.3 read-through fallback + dimension reads", () => {
  it("getStudentRiskDimensionAtRiskCounts counts each dimension at level ≥ LOW; finance 0 when unauthorized", async () => {
    count.mockResolvedValue(4);
    const dims = await getStudentRiskDimensionAtRiskCounts(ORG, { financeAuthorized: false });
    expect(dims.academic).toBe(4);
    expect(dims.attendance).toBe(4);
    expect(dims.financial).toBe(0); // not authorized → not counted
    // The academic count filters on academicLevel in the at-risk set.
    const academicCall = count.mock.calls.find((c) => c[0].where.academicLevel);
    expect(academicCall?.[0].where.academicLevel).toEqual({ in: ["LOW", "MODERATE", "HIGH", "CRITICAL"] });
  });

  it("getStudentIdsWithDimensionRisk returns the scoped student set for a dimension", async () => {
    findMany.mockResolvedValue([{ studentId: "s1" }, { studentId: "s3" }]);
    const ids = await getStudentIdsWithDimensionRisk(ORG, "attendance", ["s1", "s2", "s3"]);
    expect(ids).toEqual(new Set(["s1", "s3"]));
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      studentId: { in: ["s1", "s2", "s3"] },
      attendanceLevel: { in: ["LOW", "MODERATE", "HIGH", "CRITICAL"] },
    });
  });

  it("getStudentIdsWithDimensionRisk short-circuits on an empty student list", async () => {
    const ids = await getStudentIdsWithDimensionRisk(ORG, "academic", []);
    expect(ids.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("F-M2 — soft-deleted students excluded from every aggregate read", () => {
  const VISIBLE = { organizationId: ORG, deletedAt: null };

  it("level counts (both finance-authorized and finance-blind) filter by a visible student", async () => {
    groupBy.mockResolvedValue([]);
    await getStudentRiskLevelCounts(ORG, { financeAuthorized: true });
    expect(groupBy.mock.calls[0][0].where.student).toEqual(VISIBLE);

    groupBy.mockClear();
    groupBy.mockResolvedValue([]);
    await getStudentRiskLevelCounts(ORG, { financeAuthorized: false });
    expect(groupBy.mock.calls[0][0].where.student).toEqual(VISIBLE);
  });

  it("per-dimension counts filter by a visible student", async () => {
    count.mockResolvedValue(0);
    await getStudentRiskDimensionAtRiskCounts(ORG, { financeAuthorized: true });
    for (const call of count.mock.calls) {
      expect(call[0].where.student).toEqual(VISIBLE);
    }
  });

  it("getStudentIdsWithDimensionRisk filters by a visible student", async () => {
    findMany.mockResolvedValue([]);
    await getStudentIdsWithDimensionRisk(ORG, "attendance", ["s1"]);
    expect(findMany.mock.calls[0][0].where.student).toEqual(VISIBLE);
  });

  it("the visible-student filter hardens tenant scoping (student.organizationId = the org)", async () => {
    groupBy.mockResolvedValue([]);
    await getStudentRiskLevelCounts(ORG, { financeAuthorized: true });
    // The relation filter requires the student to belong to the SAME org — a projection whose
    // student row is in another org (inconsistent data) can never be counted.
    expect(groupBy.mock.calls[0][0].where.student.organizationId).toBe(ORG);
  });
});
