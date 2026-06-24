import { z } from "zod";
import { NotificationEmailProviderType } from "@/shared/types/common";

const providerTypeEnum = z.enum(
  Object.values(NotificationEmailProviderType) as [NotificationEmailProviderType, ...NotificationEmailProviderType[]]
);

const emailField = z.string().trim().min(1, "Obrigatório").email("Email inválido");

export const upsertNotificationEmailSettingsSchema = z.object({
  providerType: providerTypeEnum.optional(),
  fromName: z.string().trim().min(1, "O nome do remetente é obrigatório").max(200),
  fromEmail: emailField,
  replyTo: z.union([emailField, z.literal("")]).optional(),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUsername: z.string().trim().max(255).optional(),
  smtpPassword: z.string().max(500).optional(),
  smtpSecure: z.boolean().optional(),
});

export type UpsertNotificationEmailSettingsSchema = z.infer<typeof upsertNotificationEmailSettingsSchema>;

export const testNotificationEmailSettingsSchema = z.object({
  providerType: providerTypeEnum.optional(),
  fromName: z.string().trim().min(1, "O nome do remetente é obrigatório").max(200),
  fromEmail: emailField,
  replyTo: z.union([emailField, z.literal("")]).optional(),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUsername: z.string().trim().max(255).optional(),
  smtpPassword: z.string().max(500).optional(),
  smtpSecure: z.boolean().optional(),
  recipientEmail: emailField,
});

export type TestNotificationEmailSettingsSchema = z.infer<typeof testNotificationEmailSettingsSchema>;
