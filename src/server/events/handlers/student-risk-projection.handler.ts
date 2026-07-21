import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import { recalculateStudentRiskProjection } from "@/modules/students/services/student-risk-projection.service";

// =============================================================================
// STUDENT RISK PROJECTION HANDLER (M11.4)
// -----------------------------------------------------------------------------
// Keeps the persisted StudentRiskProjection fresh by recomputing it (via the SAME
// H6 engine — buildStudentRiskSummary, never re-implemented) whenever a fact that
// can change a student's risk is published. This is the "synchronous, consistent"
// update strategy: the recompute runs after the triggering command has committed
// (events are published post-commit), off the command's own transaction.
//
// Wired to the events that are actually emitted today AND carry a studentId:
//   • attendance.summary_recalculated  → attendance dimension
//   • payment.confirmed                → financial dimension
// Academic / progression / document changes do not yet emit a studentId-bearing
// domain event; those are covered by the periodic reconciliation
// (reconcileStudentRiskProjectionsForOrg) until their events land, at which point
// they are added here. Idempotent by construction — an unchanged classification is
// a no-op — and the dispatcher additionally skips an already-PROCESSED event.
//
// Never throws: a projection is a read-model convenience, so a recompute failure
// must not fail the dispatcher or the triggering operation. It is logged and the
// stale row is corrected by the next relevant event or the reconciliation job.
// =============================================================================

const HANDLED_EVENTS: string[] = [
  DomainEventType.ATTENDANCE_SUMMARY_RECALCULATED,
  DomainEventType.PAYMENT_CONFIRMED,
];

export class StudentRiskProjectionHandler implements DomainEventHandler {
  readonly handlerName = "StudentRiskProjectionHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.includes(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const studentId = typeof payload.studentId === "string" ? payload.studentId : null;
    if (!studentId) return; // nothing to scope the recompute to

    try {
      await recalculateStudentRiskProjection({
        organizationId: event.organizationId,
        studentId,
      });
    } catch (error) {
      // Read-model maintenance is best-effort — never fail the dispatch.
      console.error(
        `[StudentRiskProjectionHandler] failed to recalculate risk projection for student ${studentId}:`,
        error
      );
    }
  }
}
