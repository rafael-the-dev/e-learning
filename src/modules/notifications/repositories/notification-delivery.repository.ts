import { getDb } from "@/server/db";
import { buildSkipTake } from "@/shared/lib/pagination";
import { ConcurrencyError } from "@/shared/lib/command";
import type {
  NotificationDelivery,
  NotificationDeliveryFilters,
  CreateNotificationDeliveryInput,
} from "@/modules/notifications/types";

type RawRow = {
  id: string;
  organizationId: string;
  notificationId: string;
  channel: string;
  recipient: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  failureReason: string | null;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
  notification?: { title: string } | null;
};

function mapRow(row: RawRow): NotificationDelivery {
  return {
    id: row.id,
    organizationId: row.organizationId,
    notificationId: row.notificationId,
    channel: row.channel as NotificationDelivery["channel"],
    recipient: row.recipient,
    status: row.status as NotificationDelivery["status"],
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastAttemptAt: row.lastAttemptAt,
    nextAttemptAt: row.nextAttemptAt,
    sentAt: row.sentAt,
    deliveredAt: row.deliveredAt,
    failedAt: row.failedAt,
    cancelledAt: row.cancelledAt,
    failureReason: row.failureReason,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notificationTitle: row.notification?.title,
  };
}

export async function createDelivery(
  organizationId: string,
  input: CreateNotificationDeliveryInput
): Promise<NotificationDelivery> {
  const db = await getDb();
  const row = await db.notificationDelivery.create({
    data: {
      organizationId,
      notificationId: input.notificationId,
      channel: input.channel,
      recipient: input.recipient,
      status: input.status ?? "PENDING",
      failureReason: input.failureReason ?? null,
      failedAt: input.failureReason ? new Date() : null,
      sentAt: input.sentAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
    },
  });
  return mapRow(row);
}

export async function createManyDeliveries(
  organizationId: string,
  inputs: CreateNotificationDeliveryInput[]
): Promise<NotificationDelivery[]> {
  const created: NotificationDelivery[] = [];
  for (const input of inputs) {
    created.push(await createDelivery(organizationId, input));
  }
  return created;
}

export async function findDeliveryById(
  id: string,
  organizationId: string
): Promise<NotificationDelivery | null> {
  const db = await getDb();
  const row = await db.notificationDelivery.findFirst({ where: { id, organizationId } });
  return row ? mapRow(row) : null;
}

export async function findByNotification(
  notificationId: string,
  organizationId: string
): Promise<NotificationDelivery[]> {
  const db = await getDb();
  const rows = await db.notificationDelivery.findMany({
    where: { notificationId, organizationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapRow);
}

export async function listDeliveries(
  organizationId: string,
  filters: NotificationDeliveryFilters
): Promise<{ data: NotificationDelivery[]; total: number }> {
  const db = await getDb();
  const { skip, take } = buildSkipTake({ page: filters.page, pageSize: filters.pageSize });

  const where = {
    organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.recipient ? { recipient: { contains: filters.recipient } } : {}),
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
    db.notificationDelivery.findMany({
      where,
      include: { notification: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.notificationDelivery.count({ where }),
  ]);

  return { data: rows.map(mapRow), total };
}

export async function countByStatus(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.notificationDelivery.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { _all: true },
  });
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}

/**
 * Every status-transition write below is a conditional `updateMany` guarded
 * by the status the caller observed when it read the row (`expectedStatus`).
 * If another process already moved the row away from that status, the
 * WHERE clause matches zero rows and we throw ConcurrencyError instead of
 * silently overwriting a state we never actually observed — closes the
 * read-then-write race between the service's read and this write.
 */
function assertSingleRowUpdated(count: number, id: string): void {
  if (count !== 1) {
    throw new ConcurrencyError("NotificationDelivery", id);
  }
}

export async function markProcessing(id: string, organizationId: string, expectedStatus: string): Promise<void> {
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id, organizationId, status: expectedStatus },
    data: {
      status: "PROCESSING",
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  assertSingleRowUpdated(result.count, id);
}

export async function markSent(
  id: string,
  organizationId: string,
  expectedStatus: string,
  providerMessageId?: string,
  provider?: string
): Promise<void> {
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id, organizationId, status: expectedStatus },
    data: {
      status: "SENT",
      sentAt: new Date(),
      ...(providerMessageId ? { providerMessageId } : {}),
      ...(provider ? { provider } : {}),
    },
  });
  assertSingleRowUpdated(result.count, id);
}

export async function markDelivered(
  id: string,
  organizationId: string,
  expectedStatus: string,
  providerMessageId?: string,
  provider?: string
): Promise<void> {
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id, organizationId, status: expectedStatus },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      ...(providerMessageId ? { providerMessageId } : {}),
      ...(provider ? { provider } : {}),
    },
  });
  assertSingleRowUpdated(result.count, id);
}

export async function markFailed(
  id: string,
  organizationId: string,
  expectedStatus: string,
  reason: string,
  nextAttemptAt?: Date | null,
  provider?: string
): Promise<void> {
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id, organizationId, status: expectedStatus },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      failureReason: reason,
      nextAttemptAt: nextAttemptAt ?? null,
      ...(provider ? { provider } : {}),
    },
  });
  assertSingleRowUpdated(result.count, id);
}

export async function markRetryPending(id: string, organizationId: string, expectedStatus: string): Promise<void> {
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id, organizationId, status: expectedStatus },
    data: {
      status: "PENDING",
      failureReason: null,
      nextAttemptAt: new Date(),
    },
  });
  assertSingleRowUpdated(result.count, id);
}

export async function cancelDelivery(id: string, organizationId: string, expectedStatus: string): Promise<void> {
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id, organizationId, status: expectedStatus },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  assertSingleRowUpdated(result.count, id);
}

export async function findDueDeliveries(
  organizationId: string,
  now: Date,
  limit?: number
): Promise<NotificationDelivery[]> {
  const db = await getDb();
  const rows = await db.notificationDelivery.findMany({
    where: {
      organizationId,
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });
  return rows.map(mapRow);
}

/**
 * Eligibility per spec: status FAILED, nextAttemptAt null-or-due, and
 * attempts < maxAttempts — the last comparison is between two columns of
 * the same row, which Prisma's `where` cannot express, so it's filtered in
 * JS after the DB-side filters narrow the candidate set (same "fetch then
 * filter" pattern as daily-billing.job.ts's installment→invoice batching).
 */
export async function findRetryEligibleDeliveries(
  organizationId: string | undefined,
  now: Date
): Promise<NotificationDelivery[]> {
  const db = await getDb();
  const rows = await db.notificationDelivery.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      status: "FAILED",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
  });
  return rows.map(mapRow).filter((delivery) => delivery.attempts < delivery.maxAttempts);
}

/**
 * Bulk PENDING transition for the retry job — re-checks `status: "FAILED"`
 * in the WHERE clause so any row that moved away from FAILED between the
 * scan (findRetryEligibleDeliveries) and this write is simply skipped
 * rather than overwritten; the caller reports the difference as `skipped`.
 */
export async function bulkRetryDeliveries(ids: string[], now: Date): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const result = await db.notificationDelivery.updateMany({
    where: { id: { in: ids }, status: "FAILED" },
    data: { status: "PENDING", failureReason: null, nextAttemptAt: now, cancelledAt: null },
  });
  return result.count;
}
