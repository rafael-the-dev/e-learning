import { z } from "zod";

export const createLessonAttachmentSchema = z.object({
  lessonId: z.string().min(1),
  fileName: z.string().min(1, "O nome do ficheiro é obrigatório"),
  fileUrl: z.string().url("URL inválida"),
  fileType: z
    .enum(["PDF", "IMAGE", "DOCUMENT", "SPREADSHEET", "PRESENTATION", "AUDIO", "VIDEO", "OTHER"])
    .default("OTHER"),
  fileSize: z.number().int().min(0).optional().nullable(),
  isDownloadable: z.boolean().default(true),
});

export type CreateLessonAttachmentSchema = z.infer<typeof createLessonAttachmentSchema>;

export const deleteLessonAttachmentSchema = z.object({
  attachmentId: z.string().min(1),
  lessonId: z.string().min(1),
});

export type DeleteLessonAttachmentSchema = z.infer<typeof deleteLessonAttachmentSchema>;
