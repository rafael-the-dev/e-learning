import { z } from "zod";

export const createClassroomResourceSchema = z.object({
  classroomId: z.string().min(1),
  name: z.string().min(1, "O nome é obrigatório").max(200),
  quantity: z.number().int().min(0, "A quantidade deve ser maior ou igual a 0"),
  description: z.string().max(1000).optional().nullable(),
});

export type CreateClassroomResourceSchema = z.infer<typeof createClassroomResourceSchema>;

export const updateClassroomResourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().int().min(0).optional(),
  description: z.string().max(1000).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

export type UpdateClassroomResourceSchema = z.infer<typeof updateClassroomResourceSchema>;

export const deleteClassroomResourceSchema = z.object({
  resourceId: z.string().min(1),
  classroomId: z.string().min(1),
});

export type DeleteClassroomResourceSchema = z.infer<typeof deleteClassroomResourceSchema>;
