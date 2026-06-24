import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";
import { buildSkipTake } from "@/shared/lib/pagination";
import type {
  ChannelHealthPoint,
  DeliveryStatusDistributionPoint,
  DeliveryVolumePoint,
  EventVolumePoint,
  FailureReasonPoint,
  ProblemDeliveryFilters,
  ProblemDeliveryRow,
} from "@/modules/notifications/types";

// =============================================================================
// NOTIFICATION OPERATIONS REPOSITORY — PHASE 3.3
// Every function here is a single SQL-aggregated query (Prisma `groupBy` /
// `aggregate` / `count`, or `$queryRaw` for the handful of cases Prisma's
// query builder cannot express — comparing two columns of the same row, or
// grouping by a truncated date). Nothing fetches raw NotificationDelivery
// rows to count/group them in JS. A few functions below sort or merge an
// already-aggregated, small result set (at most a handful of channels,
// statuses, or distinct failure-reason strings) in JS — that is bounded
// post-processing of aggregates, not "JS grouping over raw rows".
// =============================================================================

// Local-date formatting, deliberately not toISOString() — daysInRange()
// constructs its cursor from local Date components, so the key must be
// derived the same way or the range can shift by a day near midnight.
function dayKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysInRange(dateFrom: Date, dateTo: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate());
  const end = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate());
  while (cursor <= end) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// =============================================================================
// KPIs — period-scoped counts (queue-state KPIs reuse notification-delivery
// .repository.ts#countByStatus directly from the service layer instead of
// duplicating that query here).
// =============================================================================

export async function getStatusCountsInRange(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.notificationDelivery.groupBy({
    by: ["status"],
    where: { organizationId, createdAt: { gte: dateFrom, lte: dateTo } },
    _count: { _all: true },
  });
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count._all;
    return acc;
  }, {});
}

/**
 * Average `attempts` across every delivery created in the period —
 * deliberately includes never-attempted PENDING rows (attempts: 0), not just
 * terminal/retried ones. This is an unweighted "how many attempts does an
 * average delivery in this window carry" snapshot, not a "how many retries
 * does a failure typically need" metric (the spec marks this KPI optional
 * and doesn't define a formula). See docs/notifications-center.md.
 */
export async function getAverageAttempts(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<number> {
  const db = await getDb();
  const result = await db.notificationDelivery.aggregate({
    where: { organizationId, createdAt: { gte: dateFrom, lte: dateTo } },
    _avg: { attempts: true },
  });
  return result._avg.attempts ?? 0;
}

/**
 * Retry backlog: FAILED, still retryable (attempts < maxAttempts), and due
 * now (nextAttemptAt null or in the past). `attempts < maxAttempts` compares
 * two columns of the same row, which Prisma's `where` cannot express — hence
 * `$queryRaw`. Always current-state (no date filter), per spec §13.
 */
export async function getRetryBacklogCount(organizationId: string, now: Date): Promise<number> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS cnt
    FROM notification_deliveries
    WHERE organizationId = ${organizationId}
      AND status = 'FAILED'
      AND attempts < maxAttempts
      AND (nextAttemptAt IS NULL OR nextAttemptAt <= ${now})
  `);
  return Number(rows[0]?.cnt ?? 0);
}

/** FAILED with attempts exhausted — permanently stuck, no automatic retry coming. Current-state. */
export async function getTerminalFailureCount(organizationId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS cnt
    FROM notification_deliveries
    WHERE organizationId = ${organizationId}
      AND status = 'FAILED'
      AND attempts >= maxAttempts
  `);
  return Number(rows[0]?.cnt ?? 0);
}

/** FAILED, still retryable, but older than `cutoff` — retries are stalling, not just queued. */
export async function getStaleRetryableFailureCount(organizationId: string, cutoff: Date): Promise<number> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ cnt: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS cnt
    FROM notification_deliveries
    WHERE organizationId = ${organizationId}
      AND status = 'FAILED'
      AND attempts < maxAttempts
      AND createdAt < ${cutoff}
  `);
  return Number(rows[0]?.cnt ?? 0);
}

/** PROCESSING for longer than `cutoff` allows — a single-column comparison, no raw SQL needed. */
export async function getStuckProcessingCount(organizationId: string, cutoff: Date): Promise<number> {
  const db = await getDb();
  return db.notificationDelivery.count({
    where: {
      organizationId,
      status: "PROCESSING",
      OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: cutoff } }],
    },
  });
}

export async function getEmailFailureCountByExactReason(organizationId: string, reason: string): Promise<number> {
  const db = await getDb();
  return db.notificationDelivery.count({
    where: { organizationId, channel: "EMAIL", status: "FAILED", failureReason: reason },
  });
}

/** EMAIL/FAILED rows whose reason matches an auth/TLS/config keyword, excluding the dedicated "not configured" bucket. */
export async function getEmailFailureCountByKeywords(
  organizationId: string,
  keywords: string[],
  excludeExactReason: string
): Promise<number> {
  const db = await getDb();
  return db.notificationDelivery.count({
    where: {
      organizationId,
      channel: "EMAIL",
      status: "FAILED",
      NOT: { failureReason: excludeExactReason },
      OR: keywords.map((keyword) => ({ failureReason: { contains: keyword } })),
    },
  });
}

export async function getRecentEmailFailureCount(organizationId: string, since: Date): Promise<number> {
  const db = await getDb();
  return db.notificationDelivery.count({
    where: { organizationId, channel: "EMAIL", status: "FAILED", createdAt: { gte: since } },
  });
}

// =============================================================================
// CHARTS
// =============================================================================

async function getDailyCountsByColumn(
  organizationId: string,
  column: "createdAt" | "sentAt" | "deliveredAt" | "failedAt",
  dateFrom: Date,
  dateTo: Date
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ day: string; cnt: number | bigint }>>(Prisma.sql`
    SELECT FORMAT(${Prisma.raw(column)}, 'yyyy-MM-dd') AS day, COUNT(*) AS cnt
    FROM notification_deliveries
    WHERE organizationId = ${organizationId}
      AND ${Prisma.raw(column)} >= ${dateFrom}
      AND ${Prisma.raw(column)} <= ${dateTo}
    GROUP BY FORMAT(${Prisma.raw(column)}, 'yyyy-MM-dd')
  `);
  return new Map(rows.map((r) => [r.day, Number(r.cnt)]));
}

export async function getDailyVolume(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<DeliveryVolumePoint[]> {
  const [createdByDay, sentByDay, deliveredByDay, failedByDay] = await Promise.all([
    getDailyCountsByColumn(organizationId, "createdAt", dateFrom, dateTo),
    getDailyCountsByColumn(organizationId, "sentAt", dateFrom, dateTo),
    getDailyCountsByColumn(organizationId, "deliveredAt", dateFrom, dateTo),
    getDailyCountsByColumn(organizationId, "failedAt", dateFrom, dateTo),
  ]);

  return daysInRange(dateFrom, dateTo).map((date) => ({
    date,
    pendingCreated: createdByDay.get(date) ?? 0,
    sent: sentByDay.get(date) ?? 0,
    delivered: deliveredByDay.get(date) ?? 0,
    failed: failedByDay.get(date) ?? 0,
  }));
}

export async function getStatusDistribution(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<DeliveryStatusDistributionPoint[]> {
  const db = await getDb();
  const rows = await db.notificationDelivery.groupBy({
    by: ["status"],
    where: { organizationId, createdAt: { gte: dateFrom, lte: dateTo } },
    _count: { _all: true },
  });
  return rows.map((row) => ({
    status: row.status as DeliveryStatusDistributionPoint["status"],
    count: row._count._all,
  }));
}

const SUCCESS_STATUSES = new Set(["SENT", "DELIVERED"]);
const FAILURE_STATUSES = new Set(["FAILED"]);

export async function getChannelHealth(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<ChannelHealthPoint[]> {
  const db = await getDb();
  const rows = await db.notificationDelivery.groupBy({
    by: ["channel", "status"],
    where: { organizationId, createdAt: { gte: dateFrom, lte: dateTo } },
    _count: { _all: true },
  });

  // Reduces an already-aggregated, channel-bounded (<= 5) result set — not raw rows.
  const byChannel = new Map<string, { successCount: number; failureCount: number }>();
  for (const row of rows) {
    const entry = byChannel.get(row.channel) ?? { successCount: 0, failureCount: 0 };
    if (SUCCESS_STATUSES.has(row.status)) entry.successCount += row._count._all;
    if (FAILURE_STATUSES.has(row.status)) entry.failureCount += row._count._all;
    byChannel.set(row.channel, entry);
  }

  return Array.from(byChannel.entries()).map(([channel, { successCount, failureCount }]) => {
    const total = successCount + failureCount;
    return {
      channel: channel as ChannelHealthPoint["channel"],
      successCount,
      failureCount,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
    };
  });
}

const TOP_FAILURE_REASONS_LIMIT = 10;

export async function getFailureReasons(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<FailureReasonPoint[]> {
  const db = await getDb();
  const rows = await db.notificationDelivery.groupBy({
    by: ["failureReason"],
    where: { organizationId, status: "FAILED", createdAt: { gte: dateFrom, lte: dateTo }, failureReason: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { failureReason: "desc" } },
    take: TOP_FAILURE_REASONS_LIMIT,
  });

  return rows.map((row) => ({ failureReason: row.failureReason as string, count: row._count._all }));
}

const TOP_EVENTS_LIMIT = 10;

export async function getTopEvents(
  organizationId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<EventVolumePoint[]> {
  const db = await getDb();
  const rows = await db.notification.groupBy({
    by: ["type"],
    where: { organizationId, createdAt: { gte: dateFrom, lte: dateTo } },
    _count: { _all: true },
    orderBy: { _count: { type: "desc" } },
    take: TOP_EVENTS_LIMIT,
  });

  return rows.map((row) => ({ type: row.type, count: row._count._all }));
}

// =============================================================================
// TABLE — Recent Problem Deliveries
// =============================================================================

const DEFAULT_PROBLEM_STATUSES = ["FAILED", "PENDING", "PROCESSING"];

export async function getProblemDeliveries(
  organizationId: string,
  filters: ProblemDeliveryFilters
): Promise<{ data: ProblemDeliveryRow[]; total: number }> {
  const db = await getDb();
  const { skip, take } = buildSkipTake({ page: filters.page, pageSize: filters.pageSize });

  const where = {
    organizationId,
    status: filters.status ? filters.status : { in: DEFAULT_PROBLEM_STATUSES },
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.failureReason ? { failureReason: { contains: filters.failureReason } } : {}),
    ...(filters.eventType ? { notification: { type: filters.eventType } } : {}),
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
      include: { notification: { select: { title: true, type: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.notificationDelivery.count({ where }),
  ]);

  const data: ProblemDeliveryRow[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    notificationTitle: row.notification?.title ?? null,
    notificationType: row.notification?.type ?? null,
    channel: row.channel as ProblemDeliveryRow["channel"],
    recipient: row.recipient,
    status: row.status as ProblemDeliveryRow["status"],
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: row.nextAttemptAt,
    failureReason: row.failureReason,
  }));

  return { data, total };
}
