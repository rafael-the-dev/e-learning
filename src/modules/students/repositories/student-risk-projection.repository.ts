// =============================================================================
// STUDENT RISK PROJECTION — repository (M11)
//
// The ONLY write path is `upsertStudentRiskProjection` (called solely by the risk
// projection recalculation service). Read paths are the cheap aggregate/list queries
// the dashboards and watchlists consume — they read this persisted classification
// instead of re-deriving risk from grades/attendance/debt with their own thresholds.
//
// Every query is scoped by organizationId. Finance-blind consumers pass
// `financeAuthorized: false` so the aggregation uses the finance-excluded level
// (`levelWithoutFinance`) and financial reasons are never surfaced — the H6
// "no hidden financial-risk inference" rule, enforced at the data boundary.
// =============================================================================

import type { Prisma } from "@prisma/client";
import { getDb, type PrismaClientOrTx } from "@/server/db";
import {
  riskLevelRank,
  isRiskLevelAtRisk,
  CURRENT_STUDENT_RISK_SOURCE_VERSION,
  type StudentRiskLevel,
  type StudentRiskReason,
} from "@/modules/students/services/student-risk.service";
import type {
  StudentRiskProjection,
  StudentRiskEvaluationStatus,
  UpsertStudentRiskProjectionData,
  StudentRiskLevelCounts,
  StudentRiskWatchlistRow,
} from "@/modules/students/services/student-risk-projection.types";

const LOW_RANK = riskLevelRank("LOW");

/**
 * The canonical base filter for every KPI / watchlist / aggregate read (F-M2). A projection
 * only counts when its student is VISIBLE — belongs to this org AND is not soft-deleted. A
 * student soft-deleted after their row was written keeps the row (audit / restore / reconcile)
 * but disappears from all aggregates. The `student: { organizationId, deletedAt: null }`
 * relation filter also hardens tenant scoping (belt-and-suspenders over the projection's own
 * organizationId) and excludes orphan rows by construction (the required relation must match).
 */
function buildVisibleRiskProjectionWhere(organizationId: string): Prisma.StudentRiskProjectionWhereInput {
  return { organizationId, student: { organizationId, deletedAt: null } };
}

/**
 * The canonical base filter for aggregated dashboard/watchlist reads (F-M8). Composes the
 * F-M2 visible-where and ADDS `sourceVersion = CURRENT_STUDENT_RISK_SOURCE_VERSION`, so a row
 * written by an older rules version (a stale rollout, a bad import, a reconcile regression) is
 * excluded from every KPI/watchlist even if the coverage gate somehow let it through. Reads
 * that intentionally target OTHER versions (e.g. the stale-projection reconcile sweep) do NOT
 * use this — they build their own version filter.
 */
export function buildCurrentVisibleRiskProjectionWhere(
  organizationId: string
): Prisma.StudentRiskProjectionWhereInput {
  return {
    ...buildVisibleRiskProjectionWhere(organizationId),
    sourceVersion: CURRENT_STUDENT_RISK_SOURCE_VERSION,
  };
}

// ── Mapping ───────────────────────────────────────────────────────────────────

type ProjectionRow = {
  id: string;
  organizationId: string;
  studentId: string;
  level: string;
  levelRank: number;
  levelWithoutFinance: string;
  levelWithoutFinanceRank: number;
  isAtRisk: boolean;
  evaluationStatus: string;
  academicLevel: string;
  attendanceLevel: string;
  financialLevel: string;
  progressionLevel: string;
  documentsLevel: string;
  reasonsJson: string | null;
  recommendedAction: string | null;
  sourceVersion: string;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function parseReasons(json: string | null): StudentRiskReason[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as StudentRiskReason[]) : [];
  } catch {
    return [];
  }
}

function toProjection(row: ProjectionRow): StudentRiskProjection {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    level: row.level as StudentRiskLevel,
    levelRank: row.levelRank,
    levelWithoutFinance: row.levelWithoutFinance as StudentRiskLevel,
    levelWithoutFinanceRank: row.levelWithoutFinanceRank,
    isAtRisk: row.isAtRisk,
    evaluationStatus: row.evaluationStatus as StudentRiskEvaluationStatus,
    academicLevel: row.academicLevel as StudentRiskLevel,
    attendanceLevel: row.attendanceLevel as StudentRiskLevel,
    financialLevel: row.financialLevel as StudentRiskLevel,
    progressionLevel: row.progressionLevel as StudentRiskLevel,
    documentsLevel: row.documentsLevel as StudentRiskLevel,
    reasons: parseReasons(row.reasonsJson),
    recommendedAction: row.recommendedAction,
    sourceVersion: row.sourceVersion,
    evaluatedAt: row.evaluatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Write (single writer) ──────────────────────────────────────────────────────

/**
 * Upsert the projection for one student (unique per org+student). Numeric ranks are
 * derived here from the levels via `riskLevelRank`, so a persisted rank can never drift
 * from its level. Accepts an optional client so callers can run it in their own tx.
 */
export async function upsertStudentRiskProjection(
  data: UpsertStudentRiskProjectionData,
  client?: PrismaClientOrTx
): Promise<StudentRiskProjection> {
  const db = client ?? (await getDb());
  const writable = {
    level: data.level,
    levelRank: riskLevelRank(data.level),
    levelWithoutFinance: data.levelWithoutFinance,
    levelWithoutFinanceRank: riskLevelRank(data.levelWithoutFinance),
    isAtRisk: data.isAtRisk,
    evaluationStatus: data.evaluationStatus,
    academicLevel: data.academicLevel,
    attendanceLevel: data.attendanceLevel,
    financialLevel: data.financialLevel,
    progressionLevel: data.progressionLevel,
    documentsLevel: data.documentsLevel,
    reasonsJson: data.reasons.length > 0 ? JSON.stringify(data.reasons) : null,
    recommendedAction: data.recommendedAction,
    sourceVersion: data.sourceVersion,
    evaluatedAt: data.evaluatedAt,
  };
  const row = await db.studentRiskProjection.upsert({
    where: { organizationId_studentId: { organizationId: data.organizationId, studentId: data.studentId } },
    create: { organizationId: data.organizationId, studentId: data.studentId, ...writable },
    update: writable,
  });
  return toProjection(row);
}

// ── Reads ───────────────────────────────────────────────────────────────────────

export async function findStudentRiskProjection(
  studentId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentRiskProjection | null> {
  const db = client ?? (await getDb());
  const row = await db.studentRiskProjection.findUnique({
    where: { organizationId_studentId: { organizationId, studentId } },
  });
  return row ? toProjection(row) : null;
}

// NOTE (F-H1): the fragile `count(org) > 0` coverage gate that used to live here was
// replaced by `getStudentRiskProjectionCoverage` (student-risk-projection-coverage.service),
// which measures COMPLETENESS (every eligible student has a current-version projection) and
// is fail-closed — a single event-driven projection write can no longer flip a whole org
// onto an under-populated projection.

/**
 * Org-wide risk KPI counts. Finance-blind consumers pass `financeAuthorized: false` so the
 * buckets aggregate over the finance-excluded level.
 */
export async function getStudentRiskLevelCounts(
  organizationId: string,
  options: { financeAuthorized: boolean; studentIds?: string[] } = {
    financeAuthorized: true,
  }
): Promise<StudentRiskLevelCounts> {
  const db = await getDb();
  // Empty studentIds means "no students in scope" → all-zero counts (not "no filter").
  if (options.studentIds && options.studentIds.length === 0) {
    return { atRisk: 0, noRisk: 0, insufficientData: 0, byLevel: { UNKNOWN: 0, NONE: 0, LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 } };
  }
  // F-M8: always the current-version visible where — no version-agnostic reads.
  const where: Prisma.StudentRiskProjectionWhereInput = {
    ...buildCurrentVisibleRiskProjectionWhere(organizationId),
    ...(options.studentIds ? { studentId: { in: options.studentIds } } : {}),
  };

  const byLevel: Record<StudentRiskLevel, number> = {
    UNKNOWN: 0, NONE: 0, LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0,
  };

  const rows = options.financeAuthorized
    ? await db.studentRiskProjection.groupBy({ by: ["level"], where, _count: { _all: true } })
    : await db.studentRiskProjection.groupBy({ by: ["levelWithoutFinance"], where, _count: { _all: true } });

  for (const r of rows) {
    const level = (options.financeAuthorized
      ? (r as { level: string }).level
      : (r as { levelWithoutFinance: string }).levelWithoutFinance) as StudentRiskLevel;
    if (level in byLevel) byLevel[level] = r._count._all;
  }

  const atRisk = byLevel.LOW + byLevel.MODERATE + byLevel.HIGH + byLevel.CRITICAL;
  return {
    atRisk,
    noRisk: byLevel.NONE,
    insufficientData: byLevel.UNKNOWN,
    byLevel,
  };
}

const AT_RISK_LEVELS: StudentRiskLevel[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

/**
 * Per-dimension "students at risk" counts (dimension level ≥ LOW), for dashboards that
 * report a specific axis (e.g. "students with low attendance") without re-deriving it from
 * a flat 75/85 threshold on the legacy field. Finance is only counted when authorized.
 */
export async function getStudentRiskDimensionAtRiskCounts(
  organizationId: string,
  options: { financeAuthorized: boolean; studentIds?: string[] }
): Promise<{ academic: number; attendance: number; financial: number; progression: number; documents: number }> {
  const db = await getDb();
  if (options.studentIds && options.studentIds.length === 0) {
    return { academic: 0, attendance: 0, financial: 0, progression: 0, documents: 0 };
  }
  // F-M8: current-version visible where.
  const base: Prisma.StudentRiskProjectionWhereInput = {
    ...buildCurrentVisibleRiskProjectionWhere(organizationId),
    ...(options.studentIds ? { studentId: { in: options.studentIds } } : {}),
  };
  const atRisk = { in: AT_RISK_LEVELS };
  const [academic, attendance, financial, progression, documents] = await Promise.all([
    db.studentRiskProjection.count({ where: { ...base, academicLevel: atRisk } }),
    db.studentRiskProjection.count({ where: { ...base, attendanceLevel: atRisk } }),
    options.financeAuthorized
      ? db.studentRiskProjection.count({ where: { ...base, financialLevel: atRisk } })
      : Promise.resolve(0),
    db.studentRiskProjection.count({ where: { ...base, progressionLevel: atRisk } }),
    db.studentRiskProjection.count({ where: { ...base, documentsLevel: atRisk } }),
  ]);
  return { academic, attendance, financial, progression, documents };
}

/**
 * The set of the given students whose risk on a specific dimension is at-risk (level ≥ LOW),
 * from the canonical projection. Lets a scoped consumer (e.g. the teacher portal) decide
 * "attendance risk" with the SAME per-subject decision Student 360 uses, instead of a flat
 * 75/85 threshold on the legacy field. Bounded to the passed studentIds (their own scope).
 */
export async function getStudentIdsWithDimensionRisk(
  organizationId: string,
  dimension: "academic" | "attendance" | "financial" | "progression" | "documents",
  studentIds: string[]
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const db = await getDb();
  const rows = await db.studentRiskProjection.findMany({
    where: {
      ...buildCurrentVisibleRiskProjectionWhere(organizationId),
      studentId: { in: studentIds },
      [`${dimension}Level`]: { in: AT_RISK_LEVELS },
    },
    select: { studentId: true },
  });
  return new Set(rows.map((r) => r.studentId));
}

/**
 * The at-risk watchlist (level ≥ LOW), ordered by severity then recency, read straight
 * from the projection — no re-derivation, no per-student engine call. Finance-blind
 * consumers get the finance-excluded ranking and never see a financial primary reason.
 */
export async function findStudentRiskWatchlist(
  organizationId: string,
  options: { financeAuthorized: boolean; limit?: number; studentIds?: string[] }
): Promise<StudentRiskWatchlistRow[]> {
  const db = await getDb();
  const limit = options.limit ?? 20;
  // Empty studentIds means "no students in scope" → empty watchlist (not "no filter").
  if (options.studentIds && options.studentIds.length === 0) return [];
  // F-M2: soft-deleted students are excluded in the QUERY (before orderBy/take), so the list
  // never returns fewer than `limit` active students because of an in-memory post-filter.
  // F-M8: current rules version only.
  const base: Prisma.StudentRiskProjectionWhereInput = {
    ...buildCurrentVisibleRiskProjectionWhere(organizationId),
    ...(options.studentIds ? { studentId: { in: options.studentIds } } : {}),
  };

  const rows = options.financeAuthorized
    ? await db.studentRiskProjection.findMany({
        where: { ...base, levelRank: { gte: LOW_RANK } },
        orderBy: [{ levelRank: "desc" }, { evaluatedAt: "desc" }, { studentId: "asc" }],
        take: limit,
        include: { student: { select: { firstName: true, lastName: true } } },
      })
    : await db.studentRiskProjection.findMany({
        where: { ...base, levelWithoutFinanceRank: { gte: LOW_RANK } },
        orderBy: [{ levelWithoutFinanceRank: "desc" }, { evaluatedAt: "desc" }, { studentId: "asc" }],
        take: limit,
        include: { student: { select: { firstName: true, lastName: true } } },
      });

  return rows.map((row) => {
    const reasons = parseReasons(row.reasonsJson);
    // Finance-blind: never surface a financial reason or level.
    const visibleReasons = options.financeAuthorized ? reasons : reasons.filter((r) => r.dimension !== "financial");
    const primaryReason =
      [...visibleReasons].sort((a, b) => riskLevelRank(b.level) - riskLevelRank(a.level))[0] ?? null;
    const level = (options.financeAuthorized ? row.level : row.levelWithoutFinance) as StudentRiskLevel;
    return {
      studentId: row.studentId,
      studentName: `${row.student.firstName} ${row.student.lastName}`.trim(),
      level,
      academicLevel: row.academicLevel as StudentRiskLevel,
      attendanceLevel: row.attendanceLevel as StudentRiskLevel,
      financialLevel: options.financeAuthorized ? (row.financialLevel as StudentRiskLevel) : "NONE",
      progressionLevel: row.progressionLevel as StudentRiskLevel,
      documentsLevel: row.documentsLevel as StudentRiskLevel,
      primaryReason,
      // The recommended action must match the (possibly finance-filtered) primary reason.
      recommendedAction: primaryReason?.recommendedAction ?? null,
      evaluatedAt: row.evaluatedAt,
    };
  });
}

/**
 * Reconciliation helper (M11.4): projections written by an OLD rules version. Excludes
 * soft-deleted students (F-M2) so the version-stale sweep never tries to recompute a student
 * who is no longer eligible.
 */
export async function findStudentIdsWithStaleRiskProjection(
  organizationId: string,
  currentSourceVersion: string,
  limit: number
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.studentRiskProjection.findMany({
    where: {
      ...buildVisibleRiskProjectionWhere(organizationId),
      sourceVersion: { not: currentSourceVersion },
    },
    select: { studentId: true },
    take: limit,
  });
  return rows.map((r) => r.studentId);
}

export { isRiskLevelAtRisk };
