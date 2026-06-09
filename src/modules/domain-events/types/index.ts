export interface DomainEventRecord {
  id: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: string;
  status: string;
  occurredAt: Date;
  processedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  handlerLogs?: DomainEventHandlerLogRecord[];
}

export interface DomainEventHandlerLogRecord {
  id: string;
  organizationId: string;
  eventId: string;
  handlerName: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDomainEventsParams {
  page: number;
  pageSize: number;
  search?: string;
  eventType?: string;
  status?: string;
  aggregateType?: string;
}

export const DOMAIN_EVENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "A processar",
  PROCESSED: "Processado",
  FAILED: "Com erro",
  CANCELLED: "Cancelado",
};

export const DOMAIN_EVENT_HANDLER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "A processar",
  PROCESSED: "Processado",
  FAILED: "Com erro",
  SKIPPED: "Ignorado",
};

export const DOMAIN_EVENT_TYPE_LABELS: Record<string, string> = {
  "enrollment.created": "Matrícula criada",
  "enrollment.updated": "Matrícula atualizada",
  "enrollment.activated": "Matrícula ativada",
  "enrollment.cancelled": "Matrícula cancelada",
  "enrollment.completed": "Matrícula concluída",
  "invoice.created": "Fatura criada",
  "invoice.updated": "Fatura atualizada",
  "invoice.paid": "Fatura paga",
  "invoice.overdue": "Fatura em atraso",
  "invoice.cancelled": "Fatura cancelada",
  "payment.registered": "Pagamento registado",
  "payment.confirmed": "Pagamento confirmado",
  "payment.cancelled": "Pagamento cancelado",
  "payment.refunded": "Pagamento reembolsado",
  "receipt.issued": "Recibo emitido",
  "wallet.deposit_created": "Depósito criado",
  "wallet.credit_applied": "Crédito aplicado",
  "wallet.overpayment_created": "Excesso de pagamento criado",
  "wallet.refund_created": "Reembolso criado",
  "lesson.published": "Lição publicada",
  "lesson.completed": "Lição concluída",
  "classroom_booking.created": "Reserva de sala criada",
  "classroom_booking.updated": "Reserva de sala atualizada",
  "classroom_booking.cancelled": "Reserva de sala cancelada",
  "notification.created": "Notificação criada",
  "notification.sent": "Notificação enviada",
  "notification.failed": "Notificação falhada",
};

export const DOMAIN_AGGREGATE_TYPE_LABELS: Record<string, string> = {
  ENROLLMENT: "Matrícula",
  INVOICE: "Fatura",
  PAYMENT: "Pagamento",
  RECEIPT: "Recibo",
  WALLET: "Carteira",
  LESSON: "Lição",
  CLASS_GROUP: "Turma",
  CLASSROOM_BOOKING: "Reserva de Sala",
  NOTIFICATION: "Notificação",
  STUDENT: "Aluno",
};
