import { z } from "zod";

export const createSchedulePeriodSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().min(1, "O código é obrigatório").max(50),
  description: z.string().max(500).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type CreateSchedulePeriodSchema = z.infer<typeof createSchedulePeriodSchema>;

export const updateSchedulePeriodSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type UpdateSchedulePeriodSchema = z.infer<typeof updateSchedulePeriodSchema>;

export const archiveSchedulePeriodSchema = z.object({
  schedulePeriodId: z.string().min(1),
});

export type ArchiveSchedulePeriodSchema = z.infer<typeof archiveSchedulePeriodSchema>;

export const deleteSchedulePeriodSchema = z.object({
  schedulePeriodId: z.string().min(1),
});

export type DeleteSchedulePeriodSchema = z.infer<typeof deleteSchedulePeriodSchema>;
