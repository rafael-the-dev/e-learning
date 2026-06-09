import { getDb } from "@/server/db";
import type { StudentTimelineEvent, StudentTimelineFilters } from "@/modules/student-timeline/types";

// =============================================================================
// STUDENT TIMELINE REPOSITORY
// =============================================================================

type RawRow = {
  id: string;
  organizationId: string;
  studentId: string;
  eventType: string;
  title: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  sourceEventId: string | null;
  actorUserId: string | null;
  visibility: string;
  metadata: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function mapRow(row: RawRow, actorName?: string | null): StudentTimelineEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    studentId: row.studentId,
    eventType: row.eventType as StudentTimelineEvent["eventType"],
    title: row.title,
    description: row.description,
    referenceType: row.referenceType as StudentTimelineEvent["referenceType"],
    referenceId: row.referenceId,
    sourceEventId: row.sourceEventId,
    actorUserId: row.actorUserId,
    visibility: row.visibility as StudentTimelineEvent["visibility"],
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    actorName: actorName ?? null,
  };
}

async function enrichWithActorNames(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: RawRow[]
): Promise<Map<string, string>> {
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[])];
  if (actorIds.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name ?? ""]));
}

export async function findTimelineEvents(
  studentId: string,
  organizationId: string,
  filters: StudentTimelineFilters = {}
): Promise<{ events: StudentTimelineEvent[]; total: number }> {
  const db = await getDb();

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 30;
  const skip = (page - 1) * pageSize;

  const where = {
    studentId,
    organizationId,
    deletedAt: null,
    ...(filters.eventType?.length ? { eventType: { in: filters.eventType } } : {}),
    ...(filters.referenceType?.length ? { referenceType: { in: filters.referenceType } } : {}),
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search } },
            { description: { contains: filters.search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.studentTimelineEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.studentTimelineEvent.count({ where }),
  ]);

  const actorNames = await enrichWithActorNames(db, rows);
  return {
    events: rows.map((r) => mapRow(r, r.actorUserId ? actorNames.get(r.actorUserId) : null)),
    total,
  };
}

export async function findTimelineEventById(
  id: string,
  organizationId: string
): Promise<StudentTimelineEvent | null> {
  const db = await getDb();
  const row = await db.studentTimelineEvent.findFirst({
    where: { id, organizationId, deletedAt: null },
  });
  if (!row) return null;

  let actorName: string | null = null;
  if (row.actorUserId) {
    const user = await db.user.findFirst({
      where: { id: row.actorUserId },
      select: { name: true },
    });
    actorName = user?.name ?? null;
  }

  return mapRow(row, actorName);
}

export async function findTimelineEventBySourceAndType(
  sourceEventId: string,
  eventType: string,
  organizationId: string
): Promise<StudentTimelineEvent | null> {
  const db = await getDb();
  const row = await db.studentTimelineEvent.findFirst({
    where: { sourceEventId, eventType, organizationId },
  });
  return row ? mapRow(row) : null;
}

export async function createTimelineEvent(data: {
  organizationId: string;
  studentId: string;
  eventType: string;
  title: string;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  sourceEventId?: string | null;
  actorUserId?: string | null;
  visibility: string;
  metadata?: Record<string, unknown> | null;
  occurredAt: Date;
}): Promise<StudentTimelineEvent> {
  const db = await getDb();
  const row = await db.studentTimelineEvent.create({
    data: {
      organizationId: data.organizationId,
      studentId: data.studentId,
      eventType: data.eventType,
      title: data.title,
      description: data.description ?? null,
      referenceType: data.referenceType ?? null,
      referenceId: data.referenceId ?? null,
      sourceEventId: data.sourceEventId ?? null,
      actorUserId: data.actorUserId ?? null,
      visibility: data.visibility,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      occurredAt: data.occurredAt,
    },
  });
  return mapRow(row);
}

export async function softDeleteTimelineEvent(
  id: string,
  organizationId: string
): Promise<void> {
  const db = await getDb();
  await db.studentTimelineEvent.update({
    where: { id, organizationId },
    data: { deletedAt: new Date() },
  });
}

export async function findRecentTimelineEvents(
  studentId: string,
  organizationId: string,
  limit = 5
): Promise<StudentTimelineEvent[]> {
  const db = await getDb();
  const rows = await db.studentTimelineEvent.findMany({
    where: { studentId, organizationId, deletedAt: null },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
  const actorNames = await enrichWithActorNames(db, rows);
  return rows.map((r) => mapRow(r, r.actorUserId ? actorNames.get(r.actorUserId) : null));
}
