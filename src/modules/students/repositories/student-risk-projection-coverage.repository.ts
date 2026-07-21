// =============================================================================
// STUDENT RISK PROJECTION COVERAGE — repository (M11 / F-H1)
//
// Owns (a) the SINGLE definition of an "eligible student" for the risk projection,
// (b) the completeness counts the coverage gate needs, and (c) the coverage-row CRUD.
// Everything is org-scoped. Completeness is measured over STUDENTS (not projection
// rows), so orphan projections (e.g. a soft-deleted student's leftover row) can never
// compensate for a missing eligible student.
// =============================================================================

import { getDb, type PrismaClientOrTx } from "@/server/db";
import type { Prisma } from "@prisma/client";
import type {
  StudentRiskProjectionCoverageRecord,
  StudentRiskProjectionCoverageStatus,
} from "@/modules/students/services/student-risk-projection-coverage.types";

// ─── The single "eligible student" definition ────────────────────────────────
// Decision (explicit): an eligible student is any NON-DELETED student of the org,
// regardless of enrollment/status. The projection is valid for every such student
// (a student with no active enrollment / data resolves to UNKNOWN via the engine),
// and the backfill/reconcile already process exactly this set — so `expected`,
// backfill scope, coverage and reconcile all share this one predicate and cannot
// diverge. (If the product later wants to exclude e.g. archived/completed students,
// change it HERE only.)
export function buildRiskProjectionEligibleStudentWhere(
  organizationId: string
): Prisma.StudentWhereInput {
  return { organizationId, deletedAt: null };
}

/** Expected: how many eligible students the org has. */
export async function countEligibleStudentsForRiskProjection(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.student.count({ where: buildRiskProjectionEligibleStudentWhere(organizationId) });
}

/**
 * Eligible students lacking a CURRENT-version projection (= missing rows + stale-version
 * rows). Counted over students via a relation `none` filter, so orphan/soft-deleted rows
 * are irrelevant. This is the authoritative "is the org fully covered?" number: 0 ⇒ complete.
 */
export async function countEligibleStudentsWithoutCurrentRiskProjection(
  organizationId: string,
  sourceVersion: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.student.count({
    where: {
      ...buildRiskProjectionEligibleStudentWhere(organizationId),
      studentRiskProjections: { none: { sourceVersion } },
    },
  });
}

/** Eligible students with NO projection row at all (the strict "missing" subset). */
export async function countEligibleStudentsWithoutAnyRiskProjection(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  return db.student.count({
    where: {
      ...buildRiskProjectionEligibleStudentWhere(organizationId),
      studentRiskProjections: { none: {} },
    },
  });
}

// ─── Coverage row CRUD ────────────────────────────────────────────────────────

type CoverageRow = {
  organizationId: string;
  sourceVersion: string;
  status: string;
  expectedStudentCount: number;
  projectedStudentCount: number;
  missingStudentCount: number;
  staleStudentCount: number;
  errorSummary: string | null;
  backfillStartedAt: Date | null;
  backfilledAt: Date | null;
  verifiedAt: Date | null;
};

function toRecord(row: CoverageRow): StudentRiskProjectionCoverageRecord {
  return {
    organizationId: row.organizationId,
    sourceVersion: row.sourceVersion,
    status: row.status as StudentRiskProjectionCoverageStatus,
    expectedStudentCount: row.expectedStudentCount,
    projectedStudentCount: row.projectedStudentCount,
    missingStudentCount: row.missingStudentCount,
    staleStudentCount: row.staleStudentCount,
    errorSummary: row.errorSummary,
    backfillStartedAt: row.backfillStartedAt,
    backfilledAt: row.backfilledAt,
    verifiedAt: row.verifiedAt,
  };
}

export async function findStudentRiskProjectionCoverage(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<StudentRiskProjectionCoverageRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.studentRiskProjectionCoverage.findUnique({ where: { organizationId } });
  return row ? toRecord(row) : null;
}

export interface UpsertCoverageData {
  organizationId: string;
  sourceVersion: string;
  status: StudentRiskProjectionCoverageStatus;
  expectedStudentCount?: number;
  projectedStudentCount?: number;
  missingStudentCount?: number;
  staleStudentCount?: number;
  errorSummary?: string | null;
  backfillStartedAt?: Date | null;
  backfilledAt?: Date | null;
  verifiedAt?: Date | null;
}

export async function upsertStudentRiskProjectionCoverage(
  data: UpsertCoverageData,
  client?: PrismaClientOrTx
): Promise<StudentRiskProjectionCoverageRecord> {
  const db = client ?? (await getDb());
  const writable = {
    sourceVersion: data.sourceVersion,
    status: data.status,
    expectedStudentCount: data.expectedStudentCount ?? 0,
    projectedStudentCount: data.projectedStudentCount ?? 0,
    missingStudentCount: data.missingStudentCount ?? 0,
    staleStudentCount: data.staleStudentCount ?? 0,
    errorSummary: data.errorSummary ?? null,
    backfillStartedAt: data.backfillStartedAt ?? null,
    backfilledAt: data.backfilledAt ?? null,
    verifiedAt: data.verifiedAt ?? null,
  };
  const row = await db.studentRiskProjectionCoverage.upsert({
    where: { organizationId: data.organizationId },
    create: { organizationId: data.organizationId, ...writable },
    update: writable,
  });
  return toRecord(row);
}
