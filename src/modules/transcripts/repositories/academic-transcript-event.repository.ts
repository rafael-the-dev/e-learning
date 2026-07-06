import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { TranscriptEventRecord } from "@/modules/transcripts/types";

// =============================================================================
// ACADEMIC TRANSCRIPT EVENT REPOSITORY (Phase 2)
//
// The transcript's own append-only history (distinct from the platform
// auditLog). CREATE and READ ONLY — no update, no delete. Org-scoped.
// =============================================================================

const eventSelect = {
  id: true,
  organizationId: true,
  transcriptId: true,
  transcriptVersionId: true,
  eventType: true,
  previousStatus: true,
  newStatus: true,
  reason: true,
  actorId: true,
  metadata: true,
  createdAt: true,
} as const;

type EventRow = { [K in keyof typeof eventSelect]: unknown };

function toEventRecord(row: EventRow): TranscriptEventRecord {
  return {
    id: row.id as string,
    organizationId: row.organizationId as string,
    transcriptId: row.transcriptId as string,
    transcriptVersionId: (row.transcriptVersionId as string | null) ?? null,
    eventType: row.eventType as string,
    previousStatus: (row.previousStatus as string | null) ?? null,
    newStatus: (row.newStatus as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    actorId: (row.actorId as string | null) ?? null,
    metadata: (row.metadata as string | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

export interface CreateTranscriptEventParams {
  organizationId: string;
  transcriptId: string;
  transcriptVersionId?: string | null;
  eventType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  actorId?: string | null;
  metadata?: string | null;
}

export async function createTranscriptEvent(
  params: CreateTranscriptEventParams,
  client?: PrismaClientOrTx
): Promise<TranscriptEventRecord> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptEvent.create({
    data: {
      organizationId: params.organizationId,
      transcriptId: params.transcriptId,
      transcriptVersionId: params.transcriptVersionId ?? null,
      eventType: params.eventType,
      previousStatus: params.previousStatus ?? null,
      newStatus: params.newStatus ?? null,
      reason: params.reason ?? null,
      actorId: params.actorId ?? null,
      metadata: params.metadata ?? null,
    },
    select: eventSelect,
  });
  return toEventRecord(row);
}

export interface FindTranscriptEventByIdParams {
  id: string;
  organizationId: string;
}

export async function findTranscriptEventById(
  params: FindTranscriptEventByIdParams,
  client?: PrismaClientOrTx
): Promise<TranscriptEventRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.academicTranscriptEvent.findFirst({
    where: { id: params.id, organizationId: params.organizationId },
    select: eventSelect,
  });
  return row ? toEventRecord(row) : null;
}

export interface ListTranscriptEventsParams {
  organizationId: string;
  transcriptId: string;
  transcriptVersionId?: string;
  eventType?: string;
}

export async function listTranscriptEvents(
  params: ListTranscriptEventsParams,
  client?: PrismaClientOrTx
): Promise<TranscriptEventRecord[]> {
  const db = client ?? (await getDb());
  const rows = await db.academicTranscriptEvent.findMany({
    where: {
      organizationId: params.organizationId,
      transcriptId: params.transcriptId,
      ...(params.transcriptVersionId ? { transcriptVersionId: params.transcriptVersionId } : {}),
      ...(params.eventType ? { eventType: params.eventType } : {}),
    },
    select: eventSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toEventRecord);
}
