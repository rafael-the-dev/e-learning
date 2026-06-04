import { z } from "zod";

const timeRegex = /^\d{2}:\d{2}$/;

const DAY_VALUES = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export const createScheduleSlotSchema = z
  .object({
    schedulePeriodId: z.string().min(1, "O período é obrigatório"),
    dayOfWeek: z.enum(DAY_VALUES, { message: "O dia da semana é obrigatório" }),
    startTime: z.string().regex(timeRegex, "Hora inválida (HH:MM)"),
    endTime: z.string().regex(timeRegex, "Hora inválida (HH:MM)"),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "A hora de início deve ser anterior à hora de fim",
    path: ["endTime"],
  });

export type CreateScheduleSlotSchema = z.infer<typeof createScheduleSlotSchema>;

export const updateScheduleSlotSchema = z
  .object({
    dayOfWeek: z.enum(DAY_VALUES).optional(),
    startTime: z.string().regex(timeRegex, "Hora inválida (HH:MM)").optional(),
    endTime: z.string().regex(timeRegex, "Hora inválida (HH:MM)").optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine(
    (d) => {
      if (d.startTime && d.endTime) return d.startTime < d.endTime;
      return true;
    },
    {
      message: "A hora de início deve ser anterior à hora de fim",
      path: ["endTime"],
    }
  );

export type UpdateScheduleSlotSchema = z.infer<typeof updateScheduleSlotSchema>;

export const archiveScheduleSlotSchema = z.object({
  scheduleSlotId: z.string().min(1),
});

export type ArchiveScheduleSlotSchema = z.infer<typeof archiveScheduleSlotSchema>;

export const deleteScheduleSlotSchema = z.object({
  scheduleSlotId: z.string().min(1),
});

export type DeleteScheduleSlotSchema = z.infer<typeof deleteScheduleSlotSchema>;
