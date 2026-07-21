import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import { recalculateStudentRiskProjection } from "@/modules/students/services/student-risk-projection.service";

// =============================================================================
// STUDENT RISK PROJECTION HANDLER (M11.4 + F-H2)
// -----------------------------------------------------------------------------
// Keeps the persisted StudentRiskProjection fresh by recomputing it (via the SAME
// H6 engine — buildStudentRiskSummary, never re-implemented) whenever a DIRECT
// mutation that can change a student's risk is published. The recompute runs after
// the triggering command has committed (events are published post-commit), off the
// command's own transaction, and can never roll it back (it is best-effort and
// never throws).
//
// The subscribed set is the SINGLE source of truth below. Every one of these events
// is emitted post-commit and carries organizationId + studentId, so identity needs
// no extra query. Only the FINAL canonical fact of an operation is subscribed, to
// avoid duplicate recomputes (e.g. we take the attendance SUMMARY event, not the
// BELOW_REQUIRED/RECOVERED transition events that co-fire with it). Where two
// legitimate final facts co-fire for one operation (e.g. STUDENT_SUBJECT_PASSED +
// STUDENT_COURSE_COMPLETED, or a justification + a summary recalc), the extra run is
// an idempotent no-op (recalc skips the write when the classification is unchanged).
//
// Time-driven INVOICE_OVERDUE is now included (F-H3): the daily billing job emits it per
// affected student when an invoice crosses its dueDate. Still NOT here (handled by the
// periodic reconcile — reconcileStudentRiskProjectionsForOrg): document expiry, policy
// fan-out (min grade / min attendance %), and lost/failed-event recovery.
// =============================================================================

export const STUDENT_RISK_RECALCULATION_EVENTS: readonly string[] = [
  // Academic
  DomainEventType.STUDENT_SUBJECT_PASSED,
  DomainEventType.STUDENT_SUBJECT_FAILED,
  // Attendance (summary = the canonical % / status fact; justifications drive the
  // pending-justification count, which the summary event does NOT cover on a rejection
  // that leaves the % unchanged — so both are needed).
  DomainEventType.ATTENDANCE_SUMMARY_RECALCULATED,
  DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
  DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED,
  // Financial
  DomainEventType.PAYMENT_CONFIRMED,
  DomainEventType.PAYMENT_CANCELLED,
  DomainEventType.REFUND_REQUESTED,
  DomainEventType.REFUND_REJECTED,
  DomainEventType.REFUND_COMPLETED,
  // Time-driven: emitted per affected student by the daily billing job when an invoice
  // crosses its dueDate (F-H3). The daily reconcile is the backstop for any missed here.
  DomainEventType.INVOICE_OVERDUE,
  // Progression / enrollment lifecycle
  DomainEventType.ENROLLMENT_CREATED,
  DomainEventType.ENROLLMENT_ACTIVATED,
  DomainEventType.ENROLLMENT_CANCELLED,
  DomainEventType.ENROLLMENT_COMPLETED,
  DomainEventType.STUDENT_COURSE_COMPLETED,
  DomainEventType.STUDENT_COURSE_REOPENED,
  DomainEventType.STUDENT_LEVEL_PROGRESSION_CHANGED,
  // Documents
  DomainEventType.STUDENT_DOCUMENT_STATUS_CHANGED,
  // Prerequisite waivers (per-student)
  DomainEventType.STUDENT_PREREQUISITE_WAIVER_CHANGED,
];

const HANDLED = new Set<string>(STUDENT_RISK_RECALCULATION_EVENTS);

/** The (organizationId, studentId) a recompute is scoped to. Null → skip (nothing to do). */
export function resolveStudentRiskProjectionIdentity(
  event: PersistedDomainEvent
): { organizationId: string; studentId: string } | null {
  const payload = event.payload as Record<string, unknown>;
  const studentId = typeof payload.studentId === "string" ? payload.studentId : null;
  if (!studentId || !event.organizationId) return null;
  return { organizationId: event.organizationId, studentId };
}

export class StudentRiskProjectionHandler implements DomainEventHandler {
  readonly handlerName = "StudentRiskProjectionHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED.has(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const identity = resolveStudentRiskProjectionIdentity(event);
    if (!identity) return; // no reliable student to scope the recompute to

    try {
      await recalculateStudentRiskProjection(identity);
    } catch (error) {
      // Read-model maintenance is best-effort — never fail the dispatch or the mutation.
      // The reconciliation sweep (F-H3) heals a row left stale by a failed recompute.
      console.error(
        `[StudentRiskProjectionHandler] recompute failed for student ${identity.studentId} on ${event.eventType}:`,
        error
      );
    }
  }
}
