import { z } from "zod";
import { NotificationChannel } from "@/shared/types/common";

const channelEnum = z.enum(Object.values(NotificationChannel) as [NotificationChannel, ...NotificationChannel[]]);
const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

export const updateNotificationEventRuleSchema = z.object({
  ruleId: z.string().min(1),
  enabled: z.boolean().optional(),
  channels: z.array(channelEnum).min(1, "Selecione pelo menos um canal").optional(),
  dedupeWindowMinutes: z.number().int().min(0).max(43200).optional(),
  delayMinutes: z.number().int().min(0).max(43200).optional(),
  priority: priorityEnum.optional(),
});

export type UpdateNotificationEventRuleSchema = z.infer<typeof updateNotificationEventRuleSchema>;
