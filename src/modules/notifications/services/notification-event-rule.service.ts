import {
  findRuleById,
  findManyRules,
  updateEventRule as updateEventRuleRow,
} from "@/modules/notifications/repositories/notification-event-rule.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { NotificationEventRule, UpdateNotificationEventRuleInput } from "@/modules/notifications/types";

export async function listRules(organizationId: string): Promise<NotificationEventRule[]> {
  return findManyRules(organizationId);
}

export async function getRule(organizationId: string, id: string): Promise<NotificationEventRule> {
  const rule = await findRuleById(id, organizationId);
  if (!rule) throw new NotFoundError("NotificationEventRule", id);
  return rule;
}

export async function updateRule(
  organizationId: string,
  id: string,
  input: UpdateNotificationEventRuleInput
): Promise<NotificationEventRule> {
  await getRule(organizationId, id);
  return updateEventRuleRow(id, organizationId, input);
}
