import { z } from "zod";

export const assignScheduleSlotToClassGroupSchema = z.object({
  classGroupId: z.string().min(1, "A turma é obrigatória"),
  scheduleSlotId: z.string().min(1, "O slot é obrigatório"),
});

export type AssignScheduleSlotToClassGroupSchema = z.infer<
  typeof assignScheduleSlotToClassGroupSchema
>;

export const removeScheduleSlotFromClassGroupSchema = z.object({
  classGroupScheduleId: z.string().min(1),
});

export type RemoveScheduleSlotFromClassGroupSchema = z.infer<
  typeof removeScheduleSlotFromClassGroupSchema
>;
