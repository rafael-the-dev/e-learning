// =============================================================================
// STUDENT TIMELINE — TYPES
// =============================================================================

export const TIMELINE_EVENT_TYPE = {
  ENROLLMENT_CREATED: "ENROLLMENT_CREATED",
  ENROLLMENT_ACTIVATED: "ENROLLMENT_ACTIVATED",
  ENROLLMENT_CANCELLED: "ENROLLMENT_CANCELLED",
  INVOICE_CREATED: "INVOICE_CREATED",
  INVOICE_PAID: "INVOICE_PAID",
  PAYMENT_CONFIRMED: "PAYMENT_CONFIRMED",
  RECEIPT_ISSUED: "RECEIPT_ISSUED",
  WALLET_DEPOSIT_CREATED: "WALLET_DEPOSIT_CREATED",
  WALLET_CREDIT_APPLIED: "WALLET_CREDIT_APPLIED",
  WALLET_OVERPAYMENT_CREATED: "WALLET_OVERPAYMENT_CREATED",
  LESSON_COMPLETED: "LESSON_COMPLETED",
  CLASS_GROUP_ASSIGNED: "CLASS_GROUP_ASSIGNED",
  CLASSROOM_BOOKING_CHANGED: "CLASSROOM_BOOKING_CHANGED",
  NOTIFICATION_SENT: "NOTIFICATION_SENT",
  MANUAL_NOTE: "MANUAL_NOTE",
} as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPE)[keyof typeof TIMELINE_EVENT_TYPE];

export const TIMELINE_REFERENCE_TYPE = {
  ENROLLMENT: "ENROLLMENT",
  INVOICE: "INVOICE",
  PAYMENT: "PAYMENT",
  RECEIPT: "RECEIPT",
  WALLET: "WALLET",
  LESSON: "LESSON",
  CLASS_GROUP: "CLASS_GROUP",
  CLASSROOM_BOOKING: "CLASSROOM_BOOKING",
  NOTIFICATION: "NOTIFICATION",
  USER: "USER",
  SYSTEM: "SYSTEM",
} as const;

export type TimelineReferenceType = (typeof TIMELINE_REFERENCE_TYPE)[keyof typeof TIMELINE_REFERENCE_TYPE];

export const TIMELINE_VISIBILITY = {
  INTERNAL: "INTERNAL",
  STUDENT_VISIBLE: "STUDENT_VISIBLE",
} as const;

export type TimelineVisibility = (typeof TIMELINE_VISIBILITY)[keyof typeof TIMELINE_VISIBILITY];

export interface StudentTimelineEvent {
  id: string;
  organizationId: string;
  studentId: string;
  eventType: TimelineEventType;
  title: string;
  description: string | null;
  referenceType: TimelineReferenceType | null;
  referenceId: string | null;
  sourceEventId: string | null;
  actorUserId: string | null;
  visibility: TimelineVisibility;
  metadata: Record<string, unknown> | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  actorName?: string | null;
}

export interface StudentTimelineFilters {
  search?: string;
  eventType?: TimelineEventType[];
  referenceType?: TimelineReferenceType[];
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ——— display config ———

export const TIMELINE_EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  ENROLLMENT_CREATED: "Matrícula Criada",
  ENROLLMENT_ACTIVATED: "Matrícula Ativada",
  ENROLLMENT_CANCELLED: "Matrícula Cancelada",
  INVOICE_CREATED: "Fatura Criada",
  INVOICE_PAID: "Fatura Paga",
  PAYMENT_CONFIRMED: "Pagamento Confirmado",
  RECEIPT_ISSUED: "Recibo Emitido",
  WALLET_DEPOSIT_CREATED: "Depósito em Carteira",
  WALLET_CREDIT_APPLIED: "Crédito Aplicado",
  WALLET_OVERPAYMENT_CREATED: "Excedente Criado",
  LESSON_COMPLETED: "Lição Concluída",
  CLASS_GROUP_ASSIGNED: "Turma Atribuída",
  CLASSROOM_BOOKING_CHANGED: "Reserva de Sala",
  NOTIFICATION_SENT: "Notificação Enviada",
  MANUAL_NOTE: "Nota Manual",
};

export const TIMELINE_REFERENCE_TYPE_LABELS: Record<TimelineReferenceType, string> = {
  ENROLLMENT: "Matrícula",
  INVOICE: "Fatura",
  PAYMENT: "Pagamento",
  RECEIPT: "Recibo",
  WALLET: "Carteira",
  LESSON: "Lição",
  CLASS_GROUP: "Turma",
  CLASSROOM_BOOKING: "Reserva de Sala",
  NOTIFICATION: "Notificação",
  USER: "Utilizador",
  SYSTEM: "Sistema",
};

export const TIMELINE_VISIBILITY_LABELS: Record<TimelineVisibility, string> = {
  INTERNAL: "Interno",
  STUDENT_VISIBLE: "Visível ao Aluno",
};

// Default visibility per event type
export const TIMELINE_EVENT_DEFAULT_VISIBILITY: Record<TimelineEventType, TimelineVisibility> = {
  ENROLLMENT_CREATED: "INTERNAL",
  ENROLLMENT_ACTIVATED: "STUDENT_VISIBLE",
  ENROLLMENT_CANCELLED: "STUDENT_VISIBLE",
  INVOICE_CREATED: "INTERNAL",
  INVOICE_PAID: "INTERNAL",
  PAYMENT_CONFIRMED: "INTERNAL",
  RECEIPT_ISSUED: "INTERNAL",
  WALLET_DEPOSIT_CREATED: "INTERNAL",
  WALLET_CREDIT_APPLIED: "INTERNAL",
  WALLET_OVERPAYMENT_CREATED: "INTERNAL",
  LESSON_COMPLETED: "STUDENT_VISIBLE",
  CLASS_GROUP_ASSIGNED: "STUDENT_VISIBLE",
  CLASSROOM_BOOKING_CHANGED: "INTERNAL",
  NOTIFICATION_SENT: "INTERNAL",
  MANUAL_NOTE: "INTERNAL",
};

// Source module label per event type
export const TIMELINE_EVENT_MODULE: Record<TimelineEventType, string> = {
  ENROLLMENT_CREATED: "Matrículas",
  ENROLLMENT_ACTIVATED: "Matrículas",
  ENROLLMENT_CANCELLED: "Matrículas",
  INVOICE_CREATED: "Faturação",
  INVOICE_PAID: "Faturação",
  PAYMENT_CONFIRMED: "Pagamentos",
  RECEIPT_ISSUED: "Recibos",
  WALLET_DEPOSIT_CREATED: "Carteira",
  WALLET_CREDIT_APPLIED: "Carteira",
  WALLET_OVERPAYMENT_CREATED: "Carteira",
  LESSON_COMPLETED: "Lições",
  CLASS_GROUP_ASSIGNED: "Turmas",
  CLASSROOM_BOOKING_CHANGED: "Salas",
  NOTIFICATION_SENT: "Comunicações",
  MANUAL_NOTE: "Notas",
};
