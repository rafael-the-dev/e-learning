import { z } from "zod";

// Zod v4: use z.union([]) instead of .or()

export const createTeacherSchema = z.object({
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
  licenseNumber: z.string().max(100).optional(),
  specialization: z.string().max(200).optional(),
  branchId: z.string().optional(),
  notes: z.string().optional(),
});

export const updateTeacherSchema = z.object({
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
  licenseNumber: z.string().max(100).optional(),
  specialization: z.string().max(200).optional(),
  branchId: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
});

export const suspendTeacherSchema = z.object({
  teacherId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const softDeleteTeacherSchema = z.object({
  teacherId: z.string().min(1),
});

export const assignTeacherSubjectSchema = z.object({
  teacherId: z.string().min(1),
  subjectId: z.string().min(1),
});

export const removeTeacherSubjectSchema = z.object({
  teacherId: z.string().min(1),
  subjectId: z.string().min(1),
});

export type CreateTeacherSchema = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherSchema = z.infer<typeof updateTeacherSchema>;
export type SuspendTeacherSchema = z.infer<typeof suspendTeacherSchema>;
export type SoftDeleteTeacherSchema = z.infer<typeof softDeleteTeacherSchema>;
export type AssignTeacherSubjectSchema = z.infer<typeof assignTeacherSubjectSchema>;
export type RemoveTeacherSubjectSchema = z.infer<typeof removeTeacherSubjectSchema>;
