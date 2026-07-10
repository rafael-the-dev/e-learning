import type { PrismaClientOrTx } from "@/server/db";
import type { ServiceContext } from "@/shared/types/common";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createExamEvent } from "@/modules/examinations/repositories/exam-event.repository";

// =============================================================================
// EXAMINATION SCHEDULING — SHARED COMMAND HELPERS (Phase 4)
// -----------------------------------------------------------------------------
// Small, side-effect-scoped helpers reused by the Phase-4 scheduling commands.
// `recordExamTransition` writes the append-only ExamEvent AND the audit-log row
// for a status transition INSIDE the caller's transaction — so a rolled-back
// transaction discards both (no orphan history). There is NO domain-event bus /
// Outbox here (deferred to Phase 14): the durable trail is the ExamEvent + audit
// pair only. The helper decides nothing; the command has already performed the
// race-safe conditional write and asserted `count === 1` before calling it.
// =============================================================================

/** DTO returned by the ExamPeriod lifecycle commands. */
export interface PeriodCommandResult {
  periodId: string;
  status: string;
}

/** DTO returned by the ExamRoom commands. */
export interface RoomCommandResult {
  roomId: string;
  status: string;
}

/** DTO returned by the ExamSession lifecycle commands. */
export interface SessionCommandResult {
  sessionId: string;
  status: string;
}

/** DTO returned by `AssignExamInvigilatorCommand`. */
export interface InvigilatorAssignmentResult {
  assignmentId: string;
  examSessionId: string;
  role: string;
}

export interface ExamTransition {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  /** Audit-log entity label (English, mirrors the model name). */
  entity: string;
  previousStatus: string;
  newStatus: string;
  reason?: string | null;
  /** Extra columns to record in the audit `oldValues` / `newValues` payloads. */
  extraOld?: Record<string, unknown>;
  extraNew?: Record<string, unknown>;
  /** Structured payload persisted on the append-only ExamEvent's `metadata` column
   *  (JSON). Used by the Phase-11 integration ledger to read back the integrated
   *  `officialVersion` from the durable event stream (no separate ledger table). */
  metadata?: Record<string, unknown>;
}

/** Append the transition's ExamEvent + audit-log row inside the given tx. */
export async function recordExamTransition(
  context: ServiceContext,
  tx: PrismaClientOrTx,
  t: ExamTransition
): Promise<void> {
  await createExamEvent(
    {
      organizationId: context.organizationId,
      aggregateType: t.aggregateType,
      aggregateId: t.aggregateId,
      eventType: t.eventType,
      previousStatus: t.previousStatus,
      newStatus: t.newStatus,
      actorId: context.userId,
      reason: t.reason ?? null,
      metadata: t.metadata ? JSON.stringify(t.metadata) : null,
    },
    tx
  );

  await auditService.log(
    context,
    {
      entity: t.entity,
      entityId: t.aggregateId,
      action: t.eventType,
      oldValues: { status: t.previousStatus, ...(t.extraOld ?? {}) },
      newValues: { status: t.newStatus, reason: t.reason ?? null, ...(t.extraNew ?? {}) },
    },
    tx
  );
}
