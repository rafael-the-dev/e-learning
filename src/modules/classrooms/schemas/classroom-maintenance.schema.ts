import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (AAAA-MM-DD)");

export const createClassroomMaintenanceSchema = z.object({
  classroomId: z.string().min(1),
  title: z.string().min(2, "O título deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(2000).optional().nullable(),
  startDate: isoDate,
  endDate: isoDate,
});

export type CreateClassroomMaintenanceSchema = z.infer<typeof createClassroomMaintenanceSchema>;

export const updateClassroomMaintenanceSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

export type UpdateClassroomMaintenanceSchema = z.infer<typeof updateClassroomMaintenanceSchema>;

export const cancelClassroomMaintenanceSchema = z.object({
  maintenanceId: z.string().min(1),
  classroomId: z.string().min(1),
});

export type CancelClassroomMaintenanceSchema = z.infer<typeof cancelClassroomMaintenanceSchema>;
