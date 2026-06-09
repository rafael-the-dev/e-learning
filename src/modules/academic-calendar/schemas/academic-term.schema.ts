import { z } from "zod";

export const createAcademicTermSchema = z.object({
  academicYearId: z.string().min(1, "O ano letivo é obrigatório"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(200),
  code: z.string().min(1, "O código é obrigatório").max(50),
  startDate: z.string().min(1, "A data de início é obrigatória"),
  endDate: z.string().min(1, "A data de fim é obrigatória"),
  order: z.number().int().min(1, "A ordem deve ser no mínimo 1"),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
}).refine(
  (d) => new Date(d.startDate) < new Date(d.endDate),
  { message: "A data de início deve ser anterior à data de fim", path: ["endDate"] }
);

export type CreateAcademicTermSchema = z.infer<typeof createAcademicTermSchema>;

export const updateAcademicTermSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  code: z.string().min(1).max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  order: z.number().int().min(1).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export type UpdateAcademicTermSchema = z.infer<typeof updateAcademicTermSchema>;

export const archiveAcademicTermSchema = z.object({
  academicTermId: z.string().min(1),
});

export type ArchiveAcademicTermSchema = z.infer<typeof archiveAcademicTermSchema>;

export const deleteAcademicTermSchema = z.object({
  academicTermId: z.string().min(1),
});

export type DeleteAcademicTermSchema = z.infer<typeof deleteAcademicTermSchema>;
