import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { CertificateEventRecord } from "@/modules/certificates/types/repository";

// =============================================================================
// CERTIFICATE EVENT REPOSITORY (Phase 2B) — append-only, persistence only
// -----------------------------------------------------------------------------
// The domain-level append-only history for a certificate. This module exposes
// CREATE + READ only — NO update, NO delete, NO soft delete (rows are immutable
// once written). It publishes nothing and decides nothing; a command writes the
// event describing a transition it has already performed. Org-scoped throughout.
// =============================================================================

const eventSelect = {
  id: true,
  organizationId: true,
  certificateId: true,
  eventType: true,
  previousStatus: true,
  newStatus: true,
  actorId: true,
  reason: true,
  metadata: true,
  createdAt: true,
} as const;

type Row = Record<string, unknown>;

function toRecord(row: Row): CertificateEventRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    certificateId: row.certificateId as string,
    eventType: row.eventType as string,
    previousStatus: (row.previousStatus as string | null) ?? null,
    newStatus: (row.newStatus as string | null) ?? null,
    actorId: (row.actorId as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    metadata: (row.metadata as string | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

export interface CreateCertificateEventParams {
  organizationId: string;
  certificateId: string;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorId?: string | null;
  reason?: string | null;
  metadata?: string | null;
}

export async function createCertificateEvent(
  params: CreateCertificateEventParams,
  client?: PrismaClientOrTx
): Promise<CertificateEventRecord> {
  const db = client ?? (await getDb());
  const row = await db.certificateEvent.create({
    data: {
      organizationId: params.organizationId,
      certificateId: params.certificateId,
      eventType: params.eventType,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      actorId: params.actorId ?? null,
      reason: params.reason ?? null,
      metadata: params.metadata ?? null,
    },
    select: eventSelect,
  });
  return toRecord(row);
}

export interface FindCertificateEventByIdParams {
  id: string;
  organizationId: string;
}

export async function findCertificateEventById(
  params: FindCertificateEventByIdParams,
  client?: PrismaClientOrTx
): Promise<CertificateEventRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateEvent.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: eventSelect,
  });
  return row ? toRecord(row) : null;
}

export interface ListCertificateEventsParams {
  organizationId: string;
  certificateId?: string;
  eventType?: string;
  skip?: number;
  take?: number;
}

/** Chronological (createdAt asc, id asc) history, org-scoped. */
export async function listCertificateEvents(
  params: ListCertificateEventsParams,
  client?: PrismaClientOrTx
): Promise<CertificateEventRecord[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = { organizationId: params.organizationId };
  if (params.certificateId !== undefined) where.certificateId = params.certificateId;
  if (params.eventType !== undefined) where.eventType = params.eventType;

  const rows = await db.certificateEvent.findMany({
    where,
    select: eventSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: params.skip,
    take: params.take,
  });
  return rows.map(toRecord);
}

// ─── Operational read helper (Phase 14) — READ ONLY, org-scoped ───────────────

export interface CertificateEventTimestamp {
  eventType: string;
  createdAt: Date;
}

/** The `{ eventType, createdAt }` of certificate events since `since`, optionally
 *  restricted to `eventTypes` (§7 metrics: issue/revoke/suspend/restore sources).
 *  ONE scan of the append-only event log; the metrics service buckets in memory. */
export async function listCertificateEventTimestamps(
  params: { organizationId: string; since: Date; eventTypes?: string[] },
  client?: PrismaClientOrTx
): Promise<CertificateEventTimestamp[]> {
  const db = client ?? (await getDb());
  const where: Record<string, unknown> = {
    organizationId: params.organizationId,
    createdAt: { gte: params.since },
  };
  if (params.eventTypes && params.eventTypes.length > 0) {
    where.eventType = { in: params.eventTypes };
  }
  const rows = await db.certificateEvent.findMany({
    where,
    select: { eventType: true, createdAt: true },
  });
  return rows.map((r) => ({ eventType: r.eventType as string, createdAt: r.createdAt as Date }));
}
