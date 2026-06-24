import { z } from "zod";

export const createNotificationSchema = z.object({
  recipientUserId: z.string().min(1),
  type: z.string().min(1),
  severity: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]).optional(),
  title: z.string().min(1, "O título é obrigatório").max(200, "O título não pode ter mais de 200 caracteres"),
  message: z.string().min(1, "A mensagem é obrigatória"),
  actionUrl: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateNotificationSchema = z.infer<typeof createNotificationSchema>;

export const markNotificationReadSchema = z.object({
  notificationId: z.string().min(1),
});

export type MarkNotificationReadSchema = z.infer<typeof markNotificationReadSchema>;

export const archiveNotificationSchema = z.object({
  notificationId: z.string().min(1),
});

export type ArchiveNotificationSchema = z.infer<typeof archiveNotificationSchema>;
