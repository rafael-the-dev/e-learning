import { z } from "zod";

export const createAcademicYearSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().min(1, "O código é obrigatório").max(50),
  startDate: z.string().min(1, "A data de início é obrigatória"),
  endDate: z.string().min(1, "A data de fim é obrigatória"),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
  isDefault: z.boolean().optional(),
}).refine(
  (d) => new Date(d.startDate) < new Date(d.endDate),
  { message: "A data de início deve ser anterior à data de fim", path: ["endDate"] }
);

export type CreateAcademicYearSchema = z.infer<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  code: z.string().min(1).max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export type UpdateAcademicYearSchema = z.infer<typeof updateAcademicYearSchema>;

export const setDefaultAcademicYearSchema = z.object({
  academicYearId: z.string().min(1),
});

export type SetDefaultAcademicYearSchema = z.infer<typeof setDefaultAcademicYearSchema>;

export const archiveAcademicYearSchema = z.object({
  academicYearId: z.string().min(1),
});

export type ArchiveAcademicYearSchema = z.infer<typeof archiveAcademicYearSchema>;

export const deleteAcademicYearSchema = z.object({
  academicYearId: z.string().min(1),
});

export type DeleteAcademicYearSchema = z.infer<typeof deleteAcademicYearSchema>;
