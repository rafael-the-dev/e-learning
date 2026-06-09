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
