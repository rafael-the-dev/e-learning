import { getDb } from "@/server/db";
import { buildSkipTake } from "@/shared/lib/pagination";
import { extractTemplateVariables } from "@/modules/notifications/services/notification-template-renderer";
import type {
  NotificationTemplate,
  NotificationTemplateFilters,
  CreateNotificationTemplateInput,
  UpdateNotificationTemplateInput,
} from "@/modules/notifications/types";

type RawRow = {
  id: string;
  organizationId: string;
  eventType: string;
  channel: string;
  name: string;
  subject: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  variables: string;
  language: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function mapRow(row: RawRow): NotificationTemplate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventType: row.eventType,
    channel: row.channel as NotificationTemplate["channel"],
    name: row.name,
    subject: row.subject,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate,
    variables: row.variables ? (JSON.parse(row.variables) as string[]) : [],
    language: row.language,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function extractVariablesJson(titleTemplate: string, bodyTemplate: string): string {
  const variables = new Set([
    ...extractTemplateVariables(titleTemplate),
    ...extractTemplateVariables(bodyTemplate),
  ]);
  return JSON.stringify([...variables]);
}

export async function createTemplate(
  organizationId: string,
  input: CreateNotificationTemplateInput
): Promise<NotificationTemplate> {
  const db = await getDb();
  const row = await db.notificationTemplate.create({
    data: {
      organizationId,
      eventType: input.eventType,
      channel: input.channel,
      name: input.name,
      subject: input.subject ?? null,
      titleTemplate: input.titleTemplate,
      bodyTemplate: input.bodyTemplate,
      variables: extractVariablesJson(input.titleTemplate, input.bodyTemplate),
      language: input.language ?? "pt-PT",
    },
  });
  return mapRow(row);
}

export async function updateTemplate(
  id: string,
  organizationId: string,
  data: UpdateNotificationTemplateInput
): Promise<NotificationTemplate> {
  const db = await getDb();
  const updateData: Record<string, unknown> = { ...data };

  if (data.titleTemplate !== undefined || data.bodyTemplate !== undefined) {
    const current = await db.notificationTemplate.findFirst({ where: { id, organizationId } });
    const titleTemplate = data.titleTemplate ?? current?.titleTemplate ?? "";
    const bodyTemplate = data.bodyTemplate ?? current?.bodyTemplate ?? "";
    updateData.variables = extractVariablesJson(titleTemplate, bodyTemplate);
  }

  const row = await db.notificationTemplate.update({
    where: { id, organizationId },
    data: updateData,
  });
  return mapRow(row);
}

export async function findTemplateById(id: string, organizationId: string): Promise<NotificationTemplate | null> {
  const db = await getDb();
  const row = await db.notificationTemplate.findFirst({ where: { id, organizationId, deletedAt: null } });
  return row ? mapRow(row) : null;
}

/** Most recently updated active template for the (eventType, channel) pair — the rule engine's primary lookup. */
export async function findActiveTemplate(
  organizationId: string,
  eventType: string,
  channel: string
): Promise<NotificationTemplate | null> {
  const db = await getDb();
  const row = await db.notificationTemplate.findFirst({
    where: { organizationId, eventType, channel, isActive: true, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  return row ? mapRow(row) : null;
}

export async function templateExistsForEvent(organizationId: string, eventType: string, channel: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.notificationTemplate.count({ where: { organizationId, eventType, channel } });
  return count > 0;
}

export async function findManyTemplates(
  organizationId: string,
  filters: NotificationTemplateFilters
): Promise<{ data: NotificationTemplate[]; total: number }> {
  const db = await getDb();
  const { skip, take } = buildSkipTake({ page: filters.page, pageSize: filters.pageSize ?? 50 });

  const where = {
    organizationId,
    deletedAt: null,
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
  };

  const [rows, total] = await Promise.all([
    db.notificationTemplate.findMany({ where, orderBy: [{ eventType: "asc" }, { updatedAt: "desc" }], skip, take }),
    db.notificationTemplate.count({ where }),
  ]);

  return { data: rows.map(mapRow), total };
}

export async function setTemplateActive(id: string, organizationId: string, isActive: boolean): Promise<NotificationTemplate> {
  const db = await getDb();
  const row = await db.notificationTemplate.update({
    where: { id, organizationId },
    data: { isActive },
  });
  return mapRow(row);
}

/** Keeps "one active template wins" simple: deactivate every sibling sharing (eventType, channel, language) except `excludeId`. */
export async function deactivateSiblingTemplates(
  organizationId: string,
  eventType: string,
  channel: string,
  language: string,
  excludeId: string
): Promise<void> {
  const db = await getDb();
  await db.notificationTemplate.updateMany({
    where: { organizationId, eventType, channel, language, id: { not: excludeId }, isActive: true },
    data: { isActive: false },
  });
}
