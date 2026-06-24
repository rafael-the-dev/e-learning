import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import {
  createNotificationFromEvent,
  createManyNotificationsFromEvent,
} from "@/modules/notifications/services/notification.service";
import type { CreateNotificationFromEventInput } from "@/modules/notifications/services/notification.service";

// =============================================================================
// NOTIFICATIONS CENTER — PHASE 2 EVENT HANDLER
// Re-fetches data from DB — payload IDs are trusted for lookup only.
// Title/body/severity/actionUrl/dedupe window all come from the org's
// NotificationEventRule + NotificationTemplate via createNotificationFromEvent
// (the rule engine falls back to the event catalog's hardcoded defaults when
// no org-specific template exists, and skips entirely when no rule exists).
//
// Note: DomainEventType.INVOICE_OVERDUE has no current publisher in this
// codebase (the daily billing job only emits the aggregated
// BILLING_OVERDUE_DETECTED event with counts, not per-invoice events). The
// case below is wired correctly but stays dormant until that gap is closed —
// see docs/notifications-center.md "Known Limitations".
// =============================================================================

const HANDLED_EVENTS = new Set<string>([
  DomainEventType.PAYMENT_CONFIRMED,
  DomainEventType.INVOICE_OVERDUE,
  DomainEventType.ASSESSMENT_RESULTS_PUBLISHED,
  DomainEventType.ATTENDANCE_STUDENT_AT_RISK,
]);

export class NotificationEventHandler implements DomainEventHandler {
  readonly handlerName = "NotificationEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.has(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    switch (event.eventType) {
      case DomainEventType.PAYMENT_CONFIRMED:
        await this.handlePaymentConfirmed(event, payload);
        break;
      case DomainEventType.INVOICE_OVERDUE:
        await this.handleInvoiceOverdue(event, payload);
        break;
      case DomainEventType.ASSESSMENT_RESULTS_PUBLISHED:
        await this.handleAssessmentPublished(event, payload);
        break;
      case DomainEventType.ATTENDANCE_STUDENT_AT_RISK:
        await this.handleAttendanceAtRisk(event, payload);
        break;
    }
  }

  private async resolveStudentUserId(studentId: string, organizationId: string): Promise<string | null> {
    const db = await getDb();
    const student = await db.student.findFirst({
      where: { id: studentId, organizationId },
      select: { email: true },
    });
    if (!student?.email) return null;
    const user = await db.user.findFirst({ where: { email: student.email }, select: { id: true } });
    return user?.id ?? null;
  }

  private async handlePaymentConfirmed(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const studentId = payload.studentId as string | undefined;
    const paymentId = payload.paymentId as string | undefined;
    if (!studentId || !paymentId) return;

    const recipientUserId = await this.resolveStudentUserId(studentId, event.organizationId);
    if (!recipientUserId) return;

    const db = await getDb();
    const payment = await db.payment.findFirst({
      where: { id: paymentId, organizationId: event.organizationId },
      select: { paymentNumber: true },
    });
    if (!payment) return;

    await createNotificationFromEvent(event.organizationId, {
      eventType: DomainEventType.PAYMENT_CONFIRMED,
      recipientUserId,
      variables: { paymentId, paymentNumber: payment.paymentNumber },
      referenceId: paymentId,
    });
  }

  private async handleInvoiceOverdue(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const studentId = payload.studentId as string | undefined;
    const invoiceId = payload.invoiceId as string | undefined;
    if (!studentId || !invoiceId) return;

    const recipientUserId = await this.resolveStudentUserId(studentId, event.organizationId);
    if (!recipientUserId) return;

    const db = await getDb();
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: event.organizationId },
      select: { invoiceNumber: true },
    });
    if (!invoice) return;

    await createNotificationFromEvent(event.organizationId, {
      eventType: DomainEventType.INVOICE_OVERDUE,
      recipientUserId,
      variables: { invoiceId, invoiceNumber: invoice.invoiceNumber },
      referenceId: invoiceId,
    });
  }

  private async handleAssessmentPublished(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const assessmentId = payload.assessmentId as string | undefined;
    if (!assessmentId) return;

    const db = await getDb();
    const [results, assessment] = await Promise.all([
      db.assessmentResult.findMany({
        where: { assessmentId, organizationId: event.organizationId, deletedAt: null, status: "GRADED" },
        select: { studentId: true },
      }),
      db.assessment.findFirst({
        where: { id: assessmentId, organizationId: event.organizationId },
        select: { title: true },
      }),
    ]);
    if (!assessment) return;

    const studentIds = [...new Set(results.map((r) => r.studentId))];
    const inputs: CreateNotificationFromEventInput[] = [];
    for (const studentId of studentIds) {
      const recipientUserId = await this.resolveStudentUserId(studentId, event.organizationId);
      if (!recipientUserId) continue;
      inputs.push({
        eventType: DomainEventType.ASSESSMENT_RESULTS_PUBLISHED,
        recipientUserId,
        variables: { assessmentId, assessmentTitle: assessment.title },
        referenceId: assessmentId,
      });
    }

    await createManyNotificationsFromEvent(event.organizationId, inputs);
  }

  private async handleAttendanceAtRisk(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const studentId = payload.studentId as string | undefined;
    if (!studentId) return;

    const recipientUserId = await this.resolveStudentUserId(studentId, event.organizationId);
    if (!recipientUserId) return;

    const levelSubjectId = payload.levelSubjectId as string | undefined;
    const referenceId = levelSubjectId ? `${studentId}:${levelSubjectId}` : studentId;

    await createNotificationFromEvent(event.organizationId, {
      eventType: DomainEventType.ATTENDANCE_STUDENT_AT_RISK,
      recipientUserId,
      variables: { studentId },
      referenceId,
    });
  }
}
