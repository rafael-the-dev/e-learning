// =============================================================================
// STUDENT RISK PROJECTION RECONCILE RUN — types (M11 / F-H4)
//
// A resumable, cursor-based reconcile execution. Pure operational infra: it does
// not touch the risk engine, the coverage semantics, or any consumer.
// =============================================================================

import type { ReconcileMode } from "@/modules/students/services/student-risk-projection.service";

export const STUDENT_RISK_RECONCILE_RUN_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  COMPLETED_WITH_ERRORS: "COMPLETED_WITH_ERRORS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type StudentRiskProjectionReconcileRunStatus =
  (typeof STUDENT_RISK_RECONCILE_RUN_STATUS)[keyof typeof STUDENT_RISK_RECONCILE_RUN_STATUS];

/** The reconcile run row as a domain DTO. */
export interface StudentRiskProjectionReconcileRun {
  id: string;
  organizationId: string;
  mode: ReconcileMode;
  sourceVersion: string;
  status: StudentRiskProjectionReconcileRunStatus;
  cursorStudentId: string | null;
  batchSize: number;
  processedCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: Date;
  lastCheckpointAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
}

// Batch size bounds (F-H4). The CLI/env may request a value; it is always clamped.
export const STUDENT_RISK_RECONCILE_BATCH_SIZE_MIN = 10;
export const STUDENT_RISK_RECONCILE_BATCH_SIZE_MAX = 500;
export const STUDENT_RISK_RECONCILE_BATCH_SIZE_DEFAULT = 100;

/** Statuses from which a run may be (re)acquired and advanced. */
export const RESUMABLE_RECONCILE_STATUSES: StudentRiskProjectionReconcileRunStatus[] = [
  STUDENT_RISK_RECONCILE_RUN_STATUS.PENDING,
  STUDENT_RISK_RECONCILE_RUN_STATUS.RUNNING, // only when its lease has expired
  STUDENT_RISK_RECONCILE_RUN_STATUS.PAUSED,
  STUDENT_RISK_RECONCILE_RUN_STATUS.FAILED,
];
