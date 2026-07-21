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

import { getDb, type PrismaClientOrTx } from "@/server/db";
import {
  riskLevelRank,
  isRiskLevelAtRisk,
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

const ALL_LEVELS: StudentRiskLevel[] = ["UNKNOWN", "NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"];
const LOW_RANK = riskLevelRank("LOW");

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

/**
 * Org-wide risk KPI counts. Finance-blind consumers pass `financeAuthorized: false` so the
 * buckets aggregate over the finance-excluded level.
 */
export async function getStudentRiskLevelCounts(
  organizationId: string,
  options: { financeAuthorized: boolean; sourceVersion?: string } = { financeAuthorized: true }
): Promise<StudentRiskLevelCounts> {
  const db = await getDb();
  const where = {
    organizationId,
    ...(options.sourceVersion ? { sourceVersion: options.sourceVersion } : {}),
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

/**
 * The at-risk watchlist (level ≥ LOW), ordered by severity then recency, read straight
 * from the projection — no re-derivation, no per-student engine call. Finance-blind
 * consumers get the finance-excluded ranking and never see a financial primary reason.
 */
export async function findStudentRiskWatchlist(
  organizationId: string,
  options: { financeAuthorized: boolean; limit?: number; sourceVersion?: string }
): Promise<StudentRiskWatchlistRow[]> {
  const db = await getDb();
  const limit = options.limit ?? 20;
  const base = {
    organizationId,
    ...(options.sourceVersion ? { sourceVersion: options.sourceVersion } : {}),
  };

  const rows = options.financeAuthorized
    ? await db.studentRiskProjection.findMany({
        where: { ...base, levelRank: { gte: LOW_RANK } },
        orderBy: [{ levelRank: "desc" }, { evaluatedAt: "desc" }],
        take: limit,
        include: { student: { select: { firstName: true, lastName: true } } },
      })
    : await db.studentRiskProjection.findMany({
        where: { ...base, levelWithoutFinanceRank: { gte: LOW_RANK } },
        orderBy: [{ levelWithoutFinanceRank: "desc" }, { evaluatedAt: "desc" }],
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

/** Reconciliation helper (M11.4): projections written by an OLD rules version. */
export async function findStudentIdsWithStaleRiskProjection(
  organizationId: string,
  currentSourceVersion: string,
  limit: number
): Promise<string[]> {
  const db = await getDb();
  const rows = await db.studentRiskProjection.findMany({
    where: { organizationId, sourceVersion: { not: currentSourceVersion } },
    select: { studentId: true },
    take: limit,
  });
  return rows.map((r) => r.studentId);
}

export { isRiskLevelAtRisk };
