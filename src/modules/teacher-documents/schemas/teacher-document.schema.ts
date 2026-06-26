import { z } from "zod";

const TEACHER_DOCUMENT_TYPES = [
  "CONTRACT",
  "CV",
  "CERTIFICATE",
  "IDENTIFICATION",
  "LICENSE",
  "OTHER",
] as const;

export const createTeacherDocumentSchema = z.object({
  teacherId: z.string().min(1),
  type: z.enum(TEACHER_DOCUMENT_TYPES).default("OTHER"),
  name: z.string().min(1, "O nome do documento é obrigatório"),
  url: z.string().url("URL inválida"),
  mimeType: z.string().optional().nullable(),
  size: z.number().int().min(0).optional().nullable(),
});

export type CreateTeacherDocumentSchema = z.infer<typeof createTeacherDocumentSchema>;

export const deleteTeacherDocumentSchema = z.object({
  documentId: z.string().min(1),
  teacherId: z.string().min(1),
});

export type DeleteTeacherDocumentSchema = z.infer<typeof deleteTeacherDocumentSchema>;
