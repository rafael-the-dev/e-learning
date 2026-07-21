// =============================================================================
// DOMAIN EVENT TYPES
// Dot-namespaced strings. Values travel through DB and logs — never translate.
// =============================================================================

export const DomainEventType = {
  // Enrollment
  ENROLLMENT_CREATED: "enrollment.created",
  ENROLLMENT_UPDATED: "enrollment.updated",
  ENROLLMENT_ACTIVATED: "enrollment.activated",
  ENROLLMENT_CANCELLED: "enrollment.cancelled",
  ENROLLMENT_COMPLETED: "enrollment.completed",

  // Invoice
  INVOICE_CREATED: "invoice.created",
  INVOICE_UPDATED: "invoice.updated",
  INVOICE_PAID: "invoice.paid",
  INVOICE_OVERDUE: "invoice.overdue",
  INVOICE_CANCELLED: "invoice.cancelled",

  // Billing Jobs
  BILLING_OVERDUE_DETECTED: "billing.overdue_detected",

  // Payment
  PAYMENT_REGISTERED: "payment.registered",
  PAYMENT_CONFIRMED: "payment.confirmed",
  PAYMENT_CANCELLED: "payment.cancelled",
  PAYMENT_REFUNDED: "payment.refunded",

  // Receipt
  RECEIPT_ISSUED: "receipt.issued",
  RECEIPT_CANCELLED: "receipt.cancelled",

  // Wallet
  WALLET_DEPOSIT_CREATED: "wallet.deposit_created",
  WALLET_CREDIT_APPLIED: "wallet.credit_applied",
  WALLET_OVERPAYMENT_CREATED: "wallet.overpayment_created",
  WALLET_REFUND_CREATED: "wallet.refund_created",

  // Lesson
  LESSON_PUBLISHED: "lesson.published",
  LESSON_COMPLETED: "lesson.completed",

  // Classroom
  CLASSROOM_BOOKING_CREATED: "classroom_booking.created",
  CLASSROOM_BOOKING_UPDATED: "classroom_booking.updated",
  CLASSROOM_BOOKING_CANCELLED: "classroom_booking.cancelled",

  // Communication
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_FAILED: "notification.failed",

  // Attendance — only business-significant events; operational records do not emit events
  ATTENDANCE_JUSTIFICATION_APPROVED: "attendance.justification_approved",
  ATTENDANCE_JUSTIFICATION_REJECTED: "attendance.justification_rejected",
  ATTENDANCE_STUDENT_AT_RISK: "attendance.student_at_risk",
  ATTENDANCE_STUDENT_BELOW_REQUIRED: "attendance.student_below_required",
  // Attendance Engine Phase 3 — summary read-model lifecycle. `summary_recalculated`
  // fires whenever a persisted summary's percentage/status actually changes; the
  // two transition events fire only on a SUFFICIENT⇄BELOW_REQUIRED crossing.
  // No notifications are wired to these yet (behaviour-neutral).
  ATTENDANCE_SUMMARY_RECALCULATED: "attendance.summary_recalculated",
  ATTENDANCE_STUDENT_RECOVERED_ATTENDANCE: "attendance.student_recovered_attendance",
  // Attendance Engine Phase 4 — period/year reporting read-model lifecycle.
  // Reporting-only (never drives academics). `period_summary_recalculated` fires
  // on any percentage/status change; the transition events only on a status
  // change. No notifications wired yet.
  ATTENDANCE_PERIOD_SUMMARY_RECALCULATED: "attendance.period_summary_recalculated",
  ATTENDANCE_PERIOD_BELOW_REQUIRED: "attendance.period_below_required",
  ATTENDANCE_PERIOD_AT_RISK: "attendance.period_at_risk",
  ATTENDANCE_PERIOD_RECOVERED: "attendance.period_recovered",
  // Attendance Engine Phase 5 — GATED academic wiring (opt-in). Emitted only when
  // enforcement is enabled and only on meaningful academic transitions.
  ATTENDANCE_ACADEMIC_GATE_ENABLED: "attendance.academic_gate_enabled",
  ATTENDANCE_ACADEMIC_IMPACT_APPLIED: "attendance.academic_impact_applied",
  ATTENDANCE_SUBJECT_MARKED_INCOMPLETE: "attendance.subject_marked_incomplete",
  ATTENDANCE_SUBJECT_RECOVERED_FROM_INCOMPLETE: "attendance.subject_recovered_from_incomplete",

  // Assessments
  ASSESSMENT_RESULTS_PUBLISHED: "assessment.results_published",
  STUDENT_SUBJECT_PASSED: "student_subject.passed",
  STUDENT_SUBJECT_FAILED: "student_subject.failed",

  // Progression — course completion lifecycle. Future modules (certificates,
  // alumni, CRM, analytics) subscribe to these. `invalidated` / `restored` are
  // reserved for flows that explicitly annul or reinstate a completion; they are
  // not emitted by the passive recompute path yet.
  STUDENT_COURSE_COMPLETED: "student_course.completed",
  STUDENT_COURSE_REOPENED: "student_course.reopened",
  STUDENT_COURSE_INVALIDATED: "student_course.invalidated",
  STUDENT_COURSE_RESTORED: "student_course.restored",

  // Transcript lifecycle — Academic Transcript Engine (Phase 0 declares these;
  // emission is wired in a later phase). A transcript is GENERATED as a draft,
  // ISSUED (number allocated, per D9), and may be SUPERSEDED by a regeneration,
  // REVOKED, REGENERATED, or MARKED_STALE when upstream academic data changes.
  TRANSCRIPT_GENERATED: "transcript.generated",
  TRANSCRIPT_ISSUED: "transcript.issued",
  TRANSCRIPT_SUPERSEDED: "transcript.superseded",
  TRANSCRIPT_REVOKED: "transcript.revoked",
  TRANSCRIPT_REGENERATED: "transcript.regenerated",
  TRANSCRIPT_MARKED_STALE: "transcript.marked_stale",

  // Promoted academic transitions — previously audit-only action strings, now
  // promoted to real domain events so the transcript engine (and future
  // subscribers) can react to genuine academic transitions. DECLARED ONLY in
  // Phase 0: not emitted yet, and still written as auditLog actions by the
  // existing grade/assessment/progression commands. Emission wiring (transition-
  // only, on real state changes) lands in a later phase.
  GRADE_UPDATED: "grade.updated",
  ASSESSMENT_RESULT_INVALIDATED: "assessment_result.invalidated",
  LEVEL_PROGRESSION_APPROVED: "level_progression.approved",
  LEVEL_PROGRESSION_BLOCKED: "level_progression.blocked",

  // Certificate lifecycle — Certificate Engine (Phase 0 declares these; emission is
  // wired in a later phase). The Certificate Engine is a downstream consumer of the
  // Transcript Engine (ADR-002): it certifies frozen transcript facts and never
  // recalculates academics. A certificate is GENERATED as a draft, optionally
  // APPROVED, ISSUED (number allocated on issue), and may be SUSPENDED, RESTORED,
  // REVOKED (terminal), MARKED_STALE (when the linked transcript version is
  // superseded/revoked), EXPORTED, or VERIFIED. DECLARED ONLY in Phase 0 — not
  // emitted yet, and no handlers are wired.
  CERTIFICATE_GENERATED: "certificate.generated",
  CERTIFICATE_APPROVED: "certificate.approved",
  CERTIFICATE_ISSUED: "certificate.issued",
  CERTIFICATE_REVOKED: "certificate.revoked",
  CERTIFICATE_SUSPENDED: "certificate.suspended",
  CERTIFICATE_RESTORED: "certificate.restored",
  CERTIFICATE_MARKED_STALE: "certificate.marked_stale",
  CERTIFICATE_EXPORTED: "certificate.exported",
  CERTIFICATE_VERIFIED: "certificate.verified",

  // Refunds
  REFUND_REQUESTED: "refund.requested",
  REFUND_APPROVED: "refund.approved",
  REFUND_REJECTED: "refund.rejected",
  REFUND_COMPLETED: "refund.completed",

  // Student risk-relevant direct mutations (F-H2). Final-state facts emitted post-commit,
  // each carrying organizationId + studentId, so the StudentRiskProjectionHandler can keep
  // the canonical projection fresh. Emitted ONLY on a real state change (never on a no-op
  // recompute). Temporal / policy-fan-out / recovery cases stay with reconciliation (F-H3).
  STUDENT_LEVEL_PROGRESSION_CHANGED: "student_level_progression.changed",
  STUDENT_DOCUMENT_STATUS_CHANGED: "student_document.status_changed",
  STUDENT_PREREQUISITE_WAIVER_CHANGED: "student_prerequisite_waiver.changed",
} as const;

export type DomainEventType = (typeof DomainEventType)[keyof typeof DomainEventType];

export const DomainAggregateType = {
  ENROLLMENT: "ENROLLMENT",
  INVOICE: "INVOICE",
  PAYMENT: "PAYMENT",
  RECEIPT: "RECEIPT",
  WALLET: "WALLET",
  LESSON: "LESSON",
  CLASS_GROUP: "CLASS_GROUP",
  CLASSROOM_BOOKING: "CLASSROOM_BOOKING",
  NOTIFICATION: "NOTIFICATION",
  STUDENT: "STUDENT",
  ATTENDANCE_JUSTIFICATION: "ATTENDANCE_JUSTIFICATION",
  ATTENDANCE: "ATTENDANCE",
  ASSESSMENT: "ASSESSMENT",
  BILLING_JOB: "BILLING_JOB",
  REFUND: "REFUND",
  TRANSCRIPT: "TRANSCRIPT",
  CERTIFICATE: "CERTIFICATE",
  STUDENT_LEVEL_PROGRESS: "STUDENT_LEVEL_PROGRESS",
  STUDENT_DOCUMENT: "STUDENT_DOCUMENT",
  PREREQUISITE_WAIVER: "PREREQUISITE_WAIVER",
} as const;

export type DomainAggregateType = (typeof DomainAggregateType)[keyof typeof DomainAggregateType];

export const DomainEventStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type DomainEventStatus = (typeof DomainEventStatus)[keyof typeof DomainEventStatus];

export const DomainEventHandlerStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export type DomainEventHandlerStatus = (typeof DomainEventHandlerStatus)[keyof typeof DomainEventHandlerStatus];
