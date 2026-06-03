import { z } from "zod";

// Zod v4: use z.union([]) instead of .or()

export const createStudentSchema = z.object({
  firstName: z.string().min(2, "O primeiro nome deve ter pelo menos 2 caracteres").max(100),
  lastName: z.string().min(2, "O apelido deve ter pelo menos 2 caracteres").max(100),
  gender: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
  idType: z.string().max(30).optional(),
  idNumber: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  email: z
    .union([z.string().email("Endereço de e-mail inválido").max(150), z.literal("")])
    .optional(),
  address: z.string().max(500).optional(),
  branchId: z.string().optional(),
  notes: z.string().optional(),
});

export const updateStudentSchema = z.object({
  firstName: z.string().min(2, "O primeiro nome deve ter pelo menos 2 caracteres").max(100),
  lastName: z.string().min(2, "O apelido deve ter pelo menos 2 caracteres").max(100),
  gender: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
  idType: z.string().max(30).optional(),
  idNumber: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  email: z
    .union([z.string().email("Endereço de e-mail inválido").max(150), z.literal("")])
    .optional(),
  address: z.string().max(500).optional(),
  branchId: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().max(30).optional(),
});

export const suspendStudentSchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const deleteStudentSchema = z.object({
  studentId: z.string().min(1),
});

export type CreateStudentSchema = z.infer<typeof createStudentSchema>;
export type UpdateStudentSchema = z.infer<typeof updateStudentSchema>;
export type SuspendStudentSchema = z.infer<typeof suspendStudentSchema>;
export type DeleteStudentSchema = z.infer<typeof deleteStudentSchema>;
