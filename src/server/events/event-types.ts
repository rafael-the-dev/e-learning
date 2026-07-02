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

  // Refunds
  REFUND_REQUESTED: "refund.requested",
  REFUND_APPROVED: "refund.approved",
  REFUND_REJECTED: "refund.rejected",
  REFUND_COMPLETED: "refund.completed",
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
