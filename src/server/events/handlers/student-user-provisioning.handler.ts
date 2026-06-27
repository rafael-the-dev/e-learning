import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import { ensureStudentPortalUser } from "@/modules/students/services/student-user-provisioning.service";

// =============================================================================
// STUDENT USER PROVISIONING HANDLER
// On enrollment.activated (manual activation path via ActivateEnrollmentCommand),
// ensures the student has a linked Portal login. The payment-driven activation
// path (EnrollmentActivationEventHandler) calls the same service directly, since
// it does not re-emit enrollment.activated.
//
// ensureStudentPortalUser swallows recoverable outcomes (missing email, email
// conflict, policy-disabled) and returns a status — so this handler only ever
// throws on genuine programming/data errors, which the dispatcher logs as a
// FAILED handler run without affecting the already-committed activation.
// =============================================================================

export class StudentUserProvisioningHandler implements DomainEventHandler {
  readonly handlerName = "StudentUserProvisioningHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return event.eventType === DomainEventType.ENROLLMENT_ACTIVATED;
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const studentId = payload.studentId as string | undefined;
    if (!studentId) return;

    await ensureStudentPortalUser({
      organizationId: event.organizationId,
      studentId,
      triggeredByUserId: event.actorId ?? null,
      reason: "ENROLLMENT_ACTIVATED",
    });
  }
}
