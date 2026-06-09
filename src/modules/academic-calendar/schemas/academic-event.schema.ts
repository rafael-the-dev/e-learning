import { z } from "zod";

export const createAcademicEventSchema = z.object({
  academicYearId: z.string().optional().nullable(),
  academicTermId: z.string().optional().nullable(),
  title: z.string().min(2, "O título deve ter pelo menos 2 caracteres").max(300),
  description: z.string().max(1000).optional().nullable(),
  eventType: z.enum([
    "GENERAL",
    "EXAM_PERIOD",
    "ENROLLMENT_PERIOD",
    "PAYMENT_DEADLINE",
    "HOLIDAY",
    "TEACHER_MEETING",
    "GRADUATION",
    "OTHER",
  ]).default("GENERAL"),
  startDate: z.string().min(1, "A data de início é obrigatória"),
  endDate: z.string().min(1, "A data de fim é obrigatória"),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
}).refine(
  (d) => new Date(d.startDate) <= new Date(d.endDate),
  { message: "A data de início deve ser anterior ou igual à data de fim", path: ["endDate"] }
);

export type CreateAcademicEventSchema = z.infer<typeof createAcademicEventSchema>;

export const updateAcademicEventSchema = z.object({
  academicYearId: z.string().optional().nullable(),
  academicTermId: z.string().optional().nullable(),
  title: z.string().min(2).max(300).optional(),
  description: z.string().max(1000).optional().nullable(),
  eventType: z.enum([
    "GENERAL",
    "EXAM_PERIOD",
    "ENROLLMENT_PERIOD",
    "PAYMENT_DEADLINE",
    "HOLIDAY",
    "TEACHER_MEETING",
    "GRADUATION",
    "OTHER",
  ]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export type UpdateAcademicEventSchema = z.infer<typeof updateAcademicEventSchema>;

export const archiveAcademicEventSchema = z.object({
  academicEventId: z.string().min(1),
});

export type ArchiveAcademicEventSchema = z.infer<typeof archiveAcademicEventSchema>;

export const deleteAcademicEventSchema = z.object({
  academicEventId: z.string().min(1),
});

export type DeleteAcademicEventSchema = z.infer<typeof deleteAcademicEventSchema>;
