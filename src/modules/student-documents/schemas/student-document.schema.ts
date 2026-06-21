import { z } from "zod";

const DOCUMENT_TYPES = [
  "IDENTIFICATION",
  "PASSPORT",
  "CERTIFICATE",
  "CONTRACT",
  "PAYMENT_PROOF",
  "PHOTO",
  "OTHER",
] as const;

export const createStudentDocumentSchema = z.object({
  studentId: z.string().min(1),
  documentType: z.enum(DOCUMENT_TYPES).default("OTHER"),
  fileName: z.string().min(1, "O nome do ficheiro é obrigatório"),
  fileUrl: z.string().url("URL inválida"),
  fileSize: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreateStudentDocumentSchema = z.infer<typeof createStudentDocumentSchema>;

export const deleteStudentDocumentSchema = z.object({
  documentId: z.string().min(1),
  studentId: z.string().min(1),
});

export type DeleteStudentDocumentSchema = z.infer<typeof deleteStudentDocumentSchema>;

export const verifyStudentDocumentSchema = z.object({
  documentId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["VERIFIED", "REJECTED"]),
  notes: z.string().optional().nullable(),
});

export type VerifyStudentDocumentSchema = z.infer<typeof verifyStudentDocumentSchema>;
