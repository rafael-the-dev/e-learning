import { z } from "zod";

// =============================================================================
// STUDENTS IMPORT — SCHEMAS
// Parsed CSV/XLSX cell values are normalized to trimmed strings (never
// undefined) before reaching this schema, so every field below can validate
// against "" instead of relying on zod's locale-dependent required_error.
// =============================================================================

export const studentImportRowSchema = z.object({
  firstName: z.string().trim().min(2, "O primeiro nome deve ter pelo menos 2 caracteres").max(100),
  lastName: z.string().trim().min(2, "O apelido deve ter pelo menos 2 caracteres").max(100),
  gender: z.string().trim().max(20),
  birthDate: z.string().trim().max(20),
  phone: z.string().trim().max(30),
  email: z.union([z.string().trim().email("Endereço de e-mail inválido").max(150), z.literal("")]),
  documentType: z.string().trim().max(30),
  documentNumber: z.string().trim().max(50),
  address: z.string().trim().max(500),
});

export const executeImportSchema = z.object({
  jobId: z.string().min(1, "jobId é obrigatório"),
});

export type ExecuteImportSchema = z.infer<typeof executeImportSchema>;
