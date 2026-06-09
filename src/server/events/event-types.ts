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

  // Payment
  PAYMENT_REGISTERED: "payment.registered",
  PAYMENT_CONFIRMED: "payment.confirmed",
  PAYMENT_CANCELLED: "payment.cancelled",
  PAYMENT_REFUNDED: "payment.refunded",

  // Receipt
  RECEIPT_ISSUED: "receipt.issued",

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
