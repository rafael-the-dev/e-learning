import { getDb } from "@/server/db";
import { buildSkipTake } from "@/shared/lib/pagination";
import type { Notification, NotificationFilters, CreateNotificationInput } from "@/modules/notifications/types";

type RawRow = {
  id: string;
  organizationId: string;
  recipientUserId: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  actionUrl: string | null;
  metadata: string | null;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(row: RawRow): Notification {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recipientUserId: row.recipientUserId,
    type: row.type,
    severity: row.severity as Notification["severity"],
    title: row.title,
    message: row.message,
    status: row.status as Notification["status"],
    actionUrl: row.actionUrl,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    readAt: row.readAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createNotification(
  organizationId: string,
  input: CreateNotificationInput
): Promise<Notification> {
  const db = await getDb();
  const row = await db.notification.create({
    data: {
      organizationId,
      recipientUserId: input.recipientUserId,
      type: input.type,
      severity: input.severity ?? "INFO",
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
  return mapRow(row);
}

/**
 * Dedupe window: same org + recipient + type + metadata.referenceId within
 * the last `windowMinutes` (defaults to 24h — the Phase 1 fixed window, still
 * used by call sites with no NotificationEventRule). SQL Server has no JSON
 * query support here, so the referenceId match is done in JS over the
 * (small, time-boxed) candidate set.
 */
export async function findRecentDuplicate(
  organizationId: string,
  recipientUserId: string,
  type: string,
  referenceId: string,
  windowMinutes = 1440
): Promise<boolean> {
  const db = await getDb();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const candidates = await db.notification.findMany({
    where: { organizationId, recipientUserId, type, createdAt: { gte: since } },
    select: { metadata: true },
  });

  return candidates.some((c) => {
    if (!c.metadata) return false;
    try {
      const parsed = JSON.parse(c.metadata) as Record<string, unknown>;
      return parsed.referenceId === referenceId;
    } catch {
      return false;
    }
  });
}

export async function findNotificationById(
  id: string,
  organizationId: string
): Promise<Notification | null> {
  const db = await getDb();
  const row = await db.notification.findFirst({ where: { id, organizationId } });
  return row ? mapRow(row) : null;
}

export async function countUnread(organizationId: string, recipientUserId: string): Promise<number> {
  const db = await getDb();
  return db.notification.count({
    where: { organizationId, recipientUserId, status: "UNREAD" },
  });
}

export async function findLatestForUser(
  organizationId: string,
  recipientUserId: string,
  limit: number
): Promise<Notification[]> {
  const db = await getDb();
  const rows = await db.notification.findMany({
    where: { organizationId, recipientUserId, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapRow);
}

export async function findManyForUser(
  organizationId: string,
  recipientUserId: string,
  filters: NotificationFilters
): Promise<{ data: Notification[]; total: number }> {
  const db = await getDb();
  const { skip, take } = buildSkipTake({ page: filters.page, pageSize: filters.pageSize });

  // No status filter -> default to UNREAD + READ (exclude archived).
  // status=ALL -> every status, including archived.
  // status=<specific> -> exactly that status.
  const statusClause =
    filters.status === "ALL"
      ? {}
      : filters.status
        ? { status: filters.status }
        : { status: { not: "ARCHIVED" } };

  const where = {
    organizationId,
    recipientUserId,
    ...statusClause,
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.notification.count({ where }),
  ]);

  return { data: rows.map(mapRow), total };
}

export async function markAsRead(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.notification.updateMany({
    where: { id, organizationId, status: { not: "ARCHIVED" } },
    data: { status: "READ", readAt: new Date() },
  });
}

export async function markAllAsRead(organizationId: string, recipientUserId: string): Promise<number> {
  const db = await getDb();
  const result = await db.notification.updateMany({
    where: { organizationId, recipientUserId, status: "UNREAD" },
    data: { status: "READ", readAt: new Date() },
  });
  return result.count;
}

export async function archiveNotification(id: string, organizationId: string): Promise<void> {
  const db = await getDb();
  await db.notification.update({
    where: { id, organizationId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}
