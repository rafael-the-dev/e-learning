import { z } from "zod";
import { NotificationChannel } from "@/shared/types/common";

const channelEnum = z.enum(Object.values(NotificationChannel) as [NotificationChannel, ...NotificationChannel[]]);

export const createNotificationTemplateSchema = z.object({
  eventType: z.string().min(1),
  channel: channelEnum,
  name: z.string().min(1, "O nome é obrigatório").max(150, "O nome não pode ter mais de 150 caracteres"),
  subject: z.string().max(200).optional(),
  titleTemplate: z.string().min(1, "O título é obrigatório").max(200, "O título não pode ter mais de 200 caracteres"),
  bodyTemplate: z.string().min(1, "A mensagem é obrigatória").max(2000, "A mensagem não pode ter mais de 2000 caracteres"),
  language: z.string().min(2).max(10).optional(),
});

export type CreateNotificationTemplateSchema = z.infer<typeof createNotificationTemplateSchema>;

export const updateNotificationTemplateSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1).max(150).optional(),
  subject: z.string().max(200).nullable().optional(),
  titleTemplate: z.string().min(1).max(200).optional(),
  bodyTemplate: z.string().min(1).max(2000).optional(),
  language: z.string().min(2).max(10).optional(),
});

export type UpdateNotificationTemplateSchema = z.infer<typeof updateNotificationTemplateSchema>;

export const templateIdSchema = z.object({
  templateId: z.string().min(1),
});

export type TemplateIdSchema = z.infer<typeof templateIdSchema>;

export const previewNotificationTemplateSchema = z.object({
  templateId: z.string().min(1),
  sampleVariables: z.record(z.string(), z.unknown()).optional(),
});

export type PreviewNotificationTemplateSchema = z.infer<typeof previewNotificationTemplateSchema>;
