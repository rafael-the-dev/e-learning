import { getDb } from "@/server/db";
import { randomUUID } from "crypto";
import type {
  FinancialAuditEntry,
  FinancialAuditLogInput,
  ListFinancialAuditParams,
  FinancialAuditSummaryByEvent,
} from "../types";

// =============================================================================
// HELPERS
// =============================================================================

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = parseFloat(v); return isNaN(n) ? null : n; }
  if (typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return null;
}

// =============================================================================
// WRITE — append-only; never call update/delete on this table
// =============================================================================

export async function appendFinancialAuditLog(
  organizationId: string,
  performedBy: string | null,
  ipAddress: string | null | undefined,
  userAgent: string | null | undefined,
  input: FinancialAuditLogInput
): Promise<string> {
  const db = await getDb();
  const id = randomUUID();

  await db.financialAuditLog.create({
    data: {
      id,
      organizationId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      performedBy: performedBy ?? null,
      amount: input.amount ?? null,
      beforeData: input.beforeData ? JSON.stringify(input.beforeData) : null,
      afterData: input.afterData ? JSON.stringify(input.afterData) : null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    },
  });

  return id;
}

// =============================================================================
// READ
// =============================================================================

export async function findFinancialAuditById(
  id: string,
  organizationId: string
): Promise<FinancialAuditEntry | null> {
  const db = await getDb();
  const row = await db.financialAuditLog.findFirst({
    where: { id, organizationId },
  });
  if (!row) return null;
  return mapRow(row);
}

export async function listFinancialAuditLogs(
  params: ListFinancialAuditParams
): Promise<{ entries: FinancialAuditEntry[]; total: number }> {
  const db = await getDb();
  const {
    organizationId,
    entityType,
    entityId,
    eventType,
    performedBy,
    fromDate,
    toDate,
    page = 1,
    pageSize = 50,
  } = params;

  const where = {
    organizationId,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(performedBy ? { performedBy } : {}),
    ...(fromDate || toDate
      ? {
          performedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.financialAuditLog.findMany({
      where,
      orderBy: { performedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.financialAuditLog.count({ where }),
  ]);

  return { entries: rows.map(mapRow), total };
}

export async function summarizeAuditByEvent(
  organizationId: string,
  entityType?: string,
  entityId?: string
): Promise<FinancialAuditSummaryByEvent[]> {
  const db = await getDb();

  const rows = await db.financialAuditLog.groupBy({
    by: ["eventType"],
    where: {
      organizationId,
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
    },
    _count: { id: true },
    _sum: { amount: true },
    orderBy: { _count: { id: "desc" } },
  });

  return rows.map((r) => ({
    eventType: r.eventType,
    count: r._count.id,
    totalAmount: toNum(r._sum.amount),
  }));
}

// =============================================================================
// MAPPER
// =============================================================================

type DbRow = {
  id: string;
  organizationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  performedBy: string | null;
  performedAt: Date;
  amount: unknown;
  currency: string;
  beforeData: string | null;
  afterData: string | null;
  metadata: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

function mapRow(row: DbRow): FinancialAuditEntry {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    performedBy: row.performedBy,
    performedAt: row.performedAt,
    amount: toNum(row.amount),
    currency: row.currency,
    beforeData: parseJson(row.beforeData),
    afterData: parseJson(row.afterData),
    metadata: parseJson(row.metadata),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  };
}
