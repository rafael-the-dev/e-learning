// =============================================================================
// STUDENT RISK PROJECTION — recalculation service (M11.2)
//
// Recomputes the canonical per-student risk classification and persists it. It uses
// the SAME H6 engine (buildStudentRiskSummary) and the SAME input assembler
// (assembleStudentRiskInput) that Student 360 uses — the risk RULES are not copied,
// only invoked. The projection is an org-internal artifact, so it is always computed
// with finance INCLUDED; the engine is run twice (with and without the financial
// dimension) to persist both `level` and `levelWithoutFinance` — the H6 permission-aware
// pair — so a finance-blind dashboard can never infer a hidden financial reason.
//
// Idempotent: if the recomputed classification is identical to what is stored (same
// rules version), the write is skipped. Runs in its own path — a projection failure must
// never roll back the primary mutation that triggered it.
// =============================================================================

import { getStudentById } from "@/modules/students/services/student.service";
import { getEnrollmentsByOrganization } from "@/modules/enrollments/services/enrollment.service";
import { getStudentFinanceSummary } from "@/modules/reports/finance/services/financial-reports.service";
import { findProgressByOrganization } from "@/modules/assessments/repositories/student-subject-progress.repository";
import {
  getStudentSubjectAttendanceViews,
  getStudentAttendanceSummary,
} from "@/modules/attendance/services/attendance-read-model.service";
import { findJustificationsByOrganization } from "@/modules/attendance/repositories/attendance-justification.repository";
import { getStudentDocumentCount } from "@/modules/student-documents/services/student-document.service";
import { findLevelProgressByStudent } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { findCourseProgressByStudent } from "@/modules/prerequisites/repositories/student-course-progress.repository";
import { buildStudentAcademicSummary } from "@/modules/students/services/student-academic-summary.service";
import {
  buildStudentRiskSummary,
  assembleStudentRiskInput,
  isRiskLevelAtRisk,
  riskLevelRank,
  STUDENT_RISK_SOURCE_VERSION,
  type StudentRiskReason,
  type StudentRiskSignals,
} from "@/modules/students/services/student-risk.service";
import { getDb } from "@/server/db";
import {
  upsertStudentRiskProjection,
  findStudentRiskProjection,
  findStudentIdsWithStaleRiskProjection,
} from "@/modules/students/repositories/student-risk-projection.repository";
import {
  buildRiskProjectionEligibleStudentWhere,
  countEligibleStudentsForRiskProjection,
  listEligibleStudentIdsWithoutRiskProjection,
} from "@/modules/students/repositories/student-risk-projection-coverage.repository";
import {
  markRiskProjectionCoverageRunning,
  markRiskProjectionCoverageReady,
  markRiskProjectionCoverageIncomplete,
  markRiskProjectionCoverageFailed,
  verifyStudentRiskProjectionCoverage,
} from "@/modules/students/services/student-risk-projection-coverage.service";
import type {
  StudentRiskProjection,
  StudentRiskEvaluationStatus,
  UpsertStudentRiskProjectionData,
} from "@/modules/students/services/student-risk-projection.types";

export interface RecalculateStudentRiskProjectionResult {
  changed: boolean;
  projection: StudentRiskProjection;
}

/**
 * Gather the raw risk signals for one student, with finance ALWAYS included (the projection
 * is org-internal). Mirrors what Student 360 gathers, minus the presentation — the only
 * risk-relevant reads. Failures in optional read models degrade to the safe empty shape,
 * exactly like Student 360.
 */
async function loadStudentRiskSignals(studentId: string, organizationId: string): Promise<StudentRiskSignals> {
  const [
    enrollmentsResult,
    subjectProgressResult,
    levelProgress,
    courseProgress,
    documentCount,
    justificationsResult,
    financeSummary,
  ] = await Promise.all([
    getEnrollmentsByOrganization(organizationId, { studentId, page: 1, pageSize: 50 }),
    findProgressByOrganization(organizationId, { studentId, page: 1, pageSize: 200 }),
    findLevelProgressByStudent(studentId, organizationId),
    findCourseProgressByStudent(studentId, organizationId),
    getStudentDocumentCount(studentId, organizationId),
    findJustificationsByOrganization(organizationId, { studentId, status: "PENDING", page: 1, pageSize: 1 }),
    getStudentFinanceSummary(studentId, organizationId),
  ]);

  const enrollments = enrollmentsResult.data;
  const activeEnrollments = enrollments.filter((e) => e.status === "ACTIVE");
  const currentEnrollment = activeEnrollments[0] ?? enrollments[0] ?? null;

  const [attendanceSubjects, attendanceSummary] = await Promise.all([
    getStudentSubjectAttendanceViews(
      studentId,
      activeEnrollments.map((e) => ({ id: e.id, classGroupId: e.classGroupId ?? null })),
      organizationId
    ).catch(() => []),
    getStudentAttendanceSummary(studentId, organizationId).catch(() => ({
      totalSessions: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, remoteCount: 0,
      attendancePercentage: null as number | null, attendedSessions: 0,
    })),
  ]);

  const academicSummary = buildStudentAcademicSummary({
    subjectProgress: subjectProgressResult.data,
    levelProgress,
    courseProgress,
    currentEnrollment,
  });

  return {
    enrollmentCount: enrollments.length,
    activeEnrollmentCount: activeEnrollments.length,
    blockedLevelCount: levelProgress.filter((p) => p.status === "BLOCKED").length,
    recoveryRequiredCount: levelProgress.filter((p) => p.status === "RECOVERY_REQUIRED").length,
    failedSubjectCount: academicSummary.failedSubjects,
    incompleteAssessmentCount: academicSummary.incompleteSubjects,
    gradedSubjectCount: academicSummary.gradedSubjects,
    subjectProgressCount: subjectProgressResult.data.length,
    belowRequiredAttendanceCount: attendanceSubjects.filter((s) => s.status === "BELOW_REQUIRED").length,
    pendingJustificationCount: justificationsResult.total,
    documentCount,
    attendancePercentage: attendanceSummary.attendancePercentage,
    // Finance always included — the projection is org-internal (the READ layer redacts it).
    financial: {
      overdueInvoiceCount: financeSummary.overdueInvoiceCount,
      pendingRefundCount: financeSummary.pendingRefundCount,
    },
  };
}

/** Build the persistence payload from the engine's two passes (with / without finance). */
export function buildStudentRiskProjectionData(
  organizationId: string,
  studentId: string,
  signals: StudentRiskSignals,
  now: Date
): UpsertStudentRiskProjectionData {
  // Full pass: finance included → global `level`, per-dimension levels, reasons, action.
  const full = buildStudentRiskSummary(assembleStudentRiskInput(signals), now);
  // Finance-excluded pass → `levelWithoutFinance` (same rules, financial dimension dropped).
  const withoutFinance = buildStudentRiskSummary(
    assembleStudentRiskInput({ ...signals, financial: null }),
    now
  );

  // Persist reasons severity-ordered so the read layer's "primary reason" is reasons[0].
  const reasons: StudentRiskReason[] = [...full.reasons].sort(
    (a, b) => riskLevelRank(b.level) - riskLevelRank(a.level)
  );

  const evaluationStatus: StudentRiskEvaluationStatus =
    full.level === "UNKNOWN" ? "INSUFFICIENT_DATA" : "EVALUATED";

  return {
    organizationId,
    studentId,
    level: full.level,
    levelWithoutFinance: withoutFinance.level,
    isAtRisk: isRiskLevelAtRisk(full.level),
    evaluationStatus,
    academicLevel: full.academic?.level ?? "NONE",
    attendanceLevel: full.attendance?.level ?? "NONE",
    financialLevel: full.financial?.level ?? "NONE",
    progressionLevel: full.progression?.level ?? "NONE",
    documentsLevel: full.documents?.level ?? "NONE",
    reasons,
    recommendedAction: full.recommendedAction,
    sourceVersion: STUDENT_RISK_SOURCE_VERSION,
    evaluatedAt: now,
  };
}

/** True when the stored projection already matches the freshly-computed classification. */
function isUnchanged(existing: StudentRiskProjection | null, next: UpsertStudentRiskProjectionData): boolean {
  if (!existing) return false;
  return (
    existing.sourceVersion === next.sourceVersion &&
    existing.level === next.level &&
    existing.levelWithoutFinance === next.levelWithoutFinance &&
    existing.isAtRisk === next.isAtRisk &&
    existing.evaluationStatus === next.evaluationStatus &&
    existing.academicLevel === next.academicLevel &&
    existing.attendanceLevel === next.attendanceLevel &&
    existing.financialLevel === next.financialLevel &&
    existing.progressionLevel === next.progressionLevel &&
    existing.documentsLevel === next.documentsLevel &&
    existing.recommendedAction === next.recommendedAction &&
    JSON.stringify(existing.reasons) === JSON.stringify(next.reasons)
  );
}

/**
 * Recompute and persist the risk projection for one student. Idempotent: skips the write
 * when the classification is unchanged (the row's `evaluatedAt` then reflects the last
 * change, not the last check). Safe to call after any relevant mutation commits.
 */
export async function recalculateStudentRiskProjection(params: {
  organizationId: string;
  studentId: string;
  now?: Date;
}): Promise<RecalculateStudentRiskProjectionResult> {
  const { organizationId, studentId } = params;
  const now = params.now ?? new Date();

  // Guard: the student must belong to this org (tenant isolation) — throws NotFound otherwise.
  await getStudentById(studentId, organizationId);

  const signals = await loadStudentRiskSignals(studentId, organizationId);
  const data = buildStudentRiskProjectionData(organizationId, studentId, signals, now);

  const existing = await findStudentRiskProjection(studentId, organizationId);
  if (isUnchanged(existing, data)) {
    return { changed: false, projection: existing! };
  }

  const projection = await upsertStudentRiskProjection(data);
  return { changed: true, projection };
}

// ─── Batch recompute (F-M4) ─────────────────────────────────────────────────────
// The canonical primitive for recomputing MANY students at once (bulk attendance /
// session recompute, the scheduler flush, targeted ops). Deduplicates, caps concurrency,
// chunks, isolates per-student failure, and returns counters — so a bulk operation triggers
// ONE controlled batch instead of hundreds of independent synchronous recomputes.

export interface RiskProjectionBatchResult {
  requested: number;
  unique: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

const RECOMPUTE_CONCURRENCY_DEFAULT = 5;
const RECOMPUTE_CONCURRENCY_MIN = 1;
const RECOMPUTE_CONCURRENCY_MAX = 20;
const RECOMPUTE_CHUNK_DEFAULT = 50;
const RECOMPUTE_CHUNK_MIN = 10;
const RECOMPUTE_CHUNK_MAX = 200;

function clamp(value: number | undefined, def: number, min: number, max: number): number {
  const v = value ?? def;
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

export function resolveRecomputeConcurrency(requested?: number): number {
  const envDefault = Number(process.env.STUDENT_RISK_RECOMPUTE_CONCURRENCY);
  return clamp(
    requested ?? (Number.isFinite(envDefault) ? envDefault : undefined),
    RECOMPUTE_CONCURRENCY_DEFAULT,
    RECOMPUTE_CONCURRENCY_MIN,
    RECOMPUTE_CONCURRENCY_MAX
  );
}

/** Run `worker` over `items` with at most `limit` in flight (never an unbounded Promise.all). */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Recompute the projection for a set of students, deduped, with bounded concurrency and
 * chunking. Empty/duplicate input is handled; each student is tenant-guarded (recalc calls
 * getStudentById) and isolated (one failure never aborts the batch). Post-commit only — never
 * call inside a domain mutation's transaction.
 */
export async function recalculateStudentRiskProjectionsBatch(params: {
  organizationId: string;
  studentIds: string[];
  concurrency?: number;
  batchSize?: number;
  now?: Date;
}): Promise<RiskProjectionBatchResult> {
  const requested = params.studentIds.length;
  const unique = [...new Set(params.studentIds)];
  if (unique.length === 0) {
    return { requested, unique: 0, succeeded: 0, failed: 0, skipped: 0 };
  }
  const now = params.now ?? new Date();
  const concurrency = resolveRecomputeConcurrency(params.concurrency);
  const chunkSize = clamp(params.batchSize, RECOMPUTE_CHUNK_DEFAULT, RECOMPUTE_CHUNK_MIN, RECOMPUTE_CHUNK_MAX);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    await runWithConcurrency(chunk, concurrency, async (studentId) => {
      try {
        const r = await recalculateStudentRiskProjection({ organizationId: params.organizationId, studentId, now });
        if (r.changed) succeeded++;
        else skipped++;
      } catch {
        // Per-student failure is isolated (no PII persisted); the reconcile sweep heals it.
        failed++;
      }
    });
  }

  // Metrics: proves the F-M4 collapse (requested vs unique) + the outcome split.
  console.info(
    `[risk-recompute-batch] org=${params.organizationId} requested=${requested} unique=${unique.length} ` +
      `succeeded=${succeeded} skipped=${skipped} failed=${failed} concurrency=${concurrency} chunk=${chunkSize}`
  );

  return { requested, unique: unique.length, succeeded, failed, skipped };
}

export interface ReconcileStudentRiskProjectionsResult {
  processed: number;
  changed: number;
  failed: number;
  failures: Array<{ studentId: string; error: string }>;
}

/**
 * The scope of a reconcile pass (F-H3). Explicit, so we never promise a factual-drift
 * detection we can't prove:
 *   - "all"           — every eligible student. The ONLY mode that owns the coverage rollout
 *                       state (marks RUNNING → READY/INCOMPLETE). Use for the periodic sweep.
 *   - "missing"       — only eligible students with NO projection row at all (targeted repair).
 *   - "version-stale" — only students whose row was written by an OLDER rules version
 *                       (after a STUDENT_RISK_SOURCE_VERSION bump). NOT factual-drift.
 * The partial modes never touch coverage: they cannot prove completeness (they don't visit
 * every student), so they must not be able to promote an org to READY.
 */
export type ReconcileMode = "all" | "missing" | "version-stale";

/**
 * Recompute the risk projection for a scoped set of an org's students — the backfill and the
 * periodic reconciliation both use this. One student failing never aborts the sweep (its error
 * is recorded and the sweep continues). Idempotent: a student whose classification is unchanged
 * is a no-op (counted in `processed`, not `changed`).
 */
export async function reconcileStudentRiskProjectionsForOrg(
  organizationId: string,
  options: { mode?: ReconcileMode; batchSize?: number; now?: Date } = {}
): Promise<ReconcileStudentRiskProjectionsResult> {
  const batchSize = options.batchSize ?? 500;
  const now = options.now ?? new Date();
  const mode: ReconcileMode = options.mode ?? "all";
  // Only a FULL sweep owns the coverage rollout state — a partial mode cannot prove
  // completeness, so it must never be able to mark READY.
  const isFullSweep = mode === "all";

  if (isFullSweep) {
    try {
      const expected = await countEligibleStudentsForRiskProjection(organizationId);
      await markRiskProjectionCoverageRunning({ organizationId, expectedStudentCount: expected, now });
    } catch (e) {
      await markRiskProjectionCoverageFailed({
        organizationId,
        errorSummary: `coverage-running-failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      throw e;
    }
  }

  const studentIds =
    mode === "version-stale"
      ? await findStudentIdsWithStaleRiskProjection(organizationId, STUDENT_RISK_SOURCE_VERSION, batchSize)
      : mode === "missing"
        ? await listEligibleStudentIdsWithoutRiskProjection(organizationId, batchSize)
        : await listStudentIdsForOrg(organizationId);

  const result: ReconcileStudentRiskProjectionsResult = { processed: 0, changed: 0, failed: 0, failures: [] };
  for (const studentId of studentIds) {
    result.processed++;
    try {
      const r = await recalculateStudentRiskProjection({ organizationId, studentId, now });
      if (r.changed) result.changed++;
    } catch (e) {
      result.failed++;
      result.failures.push({ studentId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (isFullSweep) {
    const v = await verifyStudentRiskProjectionCoverage({ organizationId });
    // READY only when nothing is missing/stale AND no student failed to recompute.
    if (v.withoutCurrentCount === 0 && result.failed === 0) {
      await markRiskProjectionCoverageReady({
        organizationId,
        expectedStudentCount: v.expectedStudentCount,
        projectedStudentCount: v.projectedStudentCount,
        now,
      });
    } else {
      await markRiskProjectionCoverageIncomplete({
        organizationId,
        expectedStudentCount: v.expectedStudentCount,
        projectedStudentCount: v.projectedStudentCount,
        missingStudentCount: v.missingStudentCount,
        staleStudentCount: v.staleStudentCount,
        now,
      });
    }
  }

  return result;
}

/** Count how many ELIGIBLE students an org has (for the backfill dry-run report). */
export async function countStudentsForOrg(organizationId: string): Promise<number> {
  return countEligibleStudentsForRiskProjection(organizationId);
}

async function listStudentIdsForOrg(organizationId: string): Promise<string[]> {
  const db = await getDb();
  // Same "eligible student" predicate the coverage gate and expected-count use, so the
  // backfill scope and the completeness measurement can never diverge (F-H1).
  const rows = await db.student.findMany({
    where: buildRiskProjectionEligibleStudentWhere(organizationId),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
