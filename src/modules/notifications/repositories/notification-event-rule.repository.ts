import { getDb } from "@/server/db";
import type { NotificationEventRule, UpdateNotificationEventRuleInput } from "@/modules/notifications/types";

type RawRow = {
  id: string;
  organizationId: string;
  eventType: string;
  enabled: boolean;
  channels: string;
  dedupeWindowMinutes: number;
  delayMinutes: number;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function mapRow(row: RawRow): NotificationEventRule {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventType: row.eventType,
    enabled: row.enabled,
    channels: row.channels ? (JSON.parse(row.channels) as NotificationEventRule["channels"]) : [],
    dedupeWindowMinutes: row.dedupeWindowMinutes,
    delayMinutes: row.delayMinutes,
    priority: row.priority as NotificationEventRule["priority"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function createEventRule(
  organizationId: string,
  input: {
    eventType: string;
    enabled: boolean;
    channels: string[];
    dedupeWindowMinutes: number;
    delayMinutes: number;
    priority: string;
  }
): Promise<NotificationEventRule> {
  const db = await getDb();
  const row = await db.notificationEventRule.create({
    data: {
      organizationId,
      eventType: input.eventType,
      enabled: input.enabled,
      channels: JSON.stringify(input.channels),
      dedupeWindowMinutes: input.dedupeWindowMinutes,
      delayMinutes: input.delayMinutes,
      priority: input.priority,
    },
  });
  return mapRow(row);
}

export async function findEventRule(organizationId: string, eventType: string): Promise<NotificationEventRule | null> {
  const db = await getDb();
  const row = await db.notificationEventRule.findFirst({
    where: { organizationId, eventType, deletedAt: null },
  });
  return row ? mapRow(row) : null;
}

export async function findRuleById(id: string, organizationId: string): Promise<NotificationEventRule | null> {
  const db = await getDb();
  const row = await db.notificationEventRule.findFirst({ where: { id, organizationId, deletedAt: null } });
  return row ? mapRow(row) : null;
}

export async function findManyRules(organizationId: string): Promise<NotificationEventRule[]> {
  const db = await getDb();
  const rows = await db.notificationEventRule.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { eventType: "asc" },
  });
  return rows.map(mapRow);
}

export async function updateEventRule(
  id: string,
  organizationId: string,
  data: UpdateNotificationEventRuleInput
): Promise<NotificationEventRule> {
  const db = await getDb();
  const { channels, ...rest } = data;
  const row = await db.notificationEventRule.update({
    where: { id, organizationId },
    data: {
      ...rest,
      ...(channels ? { channels: JSON.stringify(channels) } : {}),
    },
  });
  return mapRow(row);
}
