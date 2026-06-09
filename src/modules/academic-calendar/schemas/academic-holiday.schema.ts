import { z } from "zod";

export const createAcademicHolidaySchema = z.object({
  academicYearId: z.string().optional().nullable(),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(1000).optional().nullable(),
  startDate: z.string().min(1, "A data de início é obrigatória"),
  endDate: z.string().min(1, "A data de fim é obrigatória"),
  isRecurring: z.boolean().optional(),
  status: z.enum(["ACTIVE", "DRAFT"]).optional(),
}).refine(
  (d) => new Date(d.startDate) <= new Date(d.endDate),
  { message: "A data de início deve ser anterior ou igual à data de fim", path: ["endDate"] }
);

export type CreateAcademicHolidaySchema = z.infer<typeof createAcademicHolidaySchema>;

export const updateAcademicHolidaySchema = z.object({
  academicYearId: z.string().optional().nullable(),
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isRecurring: z.boolean().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export type UpdateAcademicHolidaySchema = z.infer<typeof updateAcademicHolidaySchema>;

export const archiveAcademicHolidaySchema = z.object({
  academicHolidayId: z.string().min(1),
});

export type ArchiveAcademicHolidaySchema = z.infer<typeof archiveAcademicHolidaySchema>;

export const deleteAcademicHolidaySchema = z.object({
  academicHolidayId: z.string().min(1),
});

export type DeleteAcademicHolidaySchema = z.infer<typeof deleteAcademicHolidaySchema>;
