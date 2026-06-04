import { z } from "zod";

const timeRegex = /^\d{2}:\d{2}$/;

export const createClassScheduleSchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(0, "Dia inválido")
    .max(6, "Dia inválido"),
  startTime: z
    .string()
    .regex(timeRegex, "Hora inválida (HH:MM)"),
  endTime: z
    .string()
    .regex(timeRegex, "Hora inválida (HH:MM)"),
  room: z.string().max(100).optional(),
}).refine((d) => d.startTime < d.endTime, {
  message: "A hora de início deve ser anterior à hora de fim",
  path: ["endTime"],
});

export type CreateClassScheduleSchema = z.infer<typeof createClassScheduleSchema>;

export const updateClassScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(timeRegex, "Hora inválida (HH:MM)").optional(),
  endTime: z.string().regex(timeRegex, "Hora inválida (HH:MM)").optional(),
  room: z.string().max(100).optional().nullable(),
});

export type UpdateClassScheduleSchema = z.infer<typeof updateClassScheduleSchema>;

export const deleteClassScheduleSchema = z.object({
  scheduleId: z.string().min(1),
});

export type DeleteClassScheduleSchema = z.infer<typeof deleteClassScheduleSchema>;
