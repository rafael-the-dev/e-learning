import type { FinancialAuditEventType } from "@/shared/types/common";

// =============================================================================
// DOMAIN TYPES
// =============================================================================

export interface FinancialAuditEntry {
  id: string;
  organizationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  performedBy: string | null;
  performedAt: Date;
  amount: number | null;
  currency: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// =============================================================================
// SERVICE INPUT
// =============================================================================

export interface FinancialAuditLogInput {
  eventType: FinancialAuditEventType;
  /** The domain model name, e.g. "Invoice", "Payment", "Receipt" */
  entityType: string;
  entityId: string;
  /** The financial amount involved in this event (if applicable). */
  amount?: number | null;
  /** Snapshot of the entity's state before the mutation. */
  beforeData?: Record<string, unknown> | null;
  /** Snapshot of the entity's state after the mutation. */
  afterData?: Record<string, unknown> | null;
  /** Cross-entity context: paymentId, invoiceId, studentId, etc. */
  metadata?: Record<string, unknown> | null;
}

// =============================================================================
// QUERY PARAMS
// =============================================================================

export interface ListFinancialAuditParams {
  organizationId: string;
  entityType?: string;
  entityId?: string;
  eventType?: string;
  performedBy?: string;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  pageSize?: number;
}

export interface FinancialAuditSummaryByEvent {
  eventType: string;
  count: number;
  totalAmount: number | null;
}

export type { FinancialAuditEventType };
