import { z } from "zod";

// ─── Assessment Policy ────────────────────────────────────────────────────────

export const createAssessmentPolicySchema = z.object({
  levelSubjectId: z.string().min(1, "A configuração de disciplina é obrigatória"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  calculationMethod: z.enum(["WEIGHTED_AVERAGE", "SIMPLE_AVERAGE"]),
  roundingMethod: z.enum(["NONE", "NEAREST_INTEGER", "ONE_DECIMAL", "TWO_DECIMALS"]),
  minimumPassingGrade: z
    .number({ message: "A nota mínima deve ser um número" })
    .min(0, "A nota mínima deve ser >= 0")
    .max(100, "A nota mínima deve ser <= 100"),
  allowRetake: z.boolean().default(true),
  maxRetakes: z.number().int().min(0, "O número máximo de recuperações deve ser >= 0"),
});
export type CreateAssessmentPolicySchema = z.infer<typeof createAssessmentPolicySchema>;

export const updateAssessmentPolicySchema = z.object({
  policyId: z.string().min(1),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").optional(),
  description: z.string().optional(),
  calculationMethod: z.enum(["WEIGHTED_AVERAGE", "SIMPLE_AVERAGE"]).optional(),
  roundingMethod: z.enum(["NONE", "NEAREST_INTEGER", "ONE_DECIMAL", "TWO_DECIMALS"]).optional(),
  minimumPassingGrade: z
    .number()
    .min(0)
    .max(100)
    .optional(),
  allowRetake: z.boolean().optional(),
  maxRetakes: z.number().int().min(0).optional(),
});
export type UpdateAssessmentPolicySchema = z.infer<typeof updateAssessmentPolicySchema>;

export const archiveAssessmentPolicySchema = z.object({
  policyId: z.string().min(1),
});
export type ArchiveAssessmentPolicySchema = z.infer<typeof archiveAssessmentPolicySchema>;

// ─── Assessment Component ─────────────────────────────────────────────────────

export const createAssessmentComponentSchema = z.object({
  assessmentPolicyId: z.string().min(1, "A política de avaliação é obrigatória"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  componentType: z.enum([
    "TEST", "QUIZ", "EXAM", "ASSIGNMENT", "PROJECT",
    "ORAL", "PRACTICAL", "PARTICIPATION", "FINAL_EXAM", "OTHER",
  ]),
  weight: z
    .number({ message: "O peso deve ser um número" })
    .min(0, "O peso deve ser >= 0")
    .max(100, "O peso deve ser <= 100"),
  order: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(true),
});
export type CreateAssessmentComponentSchema = z.infer<typeof createAssessmentComponentSchema>;

export const updateAssessmentComponentSchema = z.object({
  componentId: z.string().min(1),
  name: z.string().min(2).optional(),
  componentType: z.enum([
    "TEST", "QUIZ", "EXAM", "ASSIGNMENT", "PROJECT",
    "ORAL", "PRACTICAL", "PARTICIPATION", "FINAL_EXAM", "OTHER",
  ]).optional(),
  weight: z.number().min(0).max(100).optional(),
  order: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});
export type UpdateAssessmentComponentSchema = z.infer<typeof updateAssessmentComponentSchema>;

export const archiveAssessmentComponentSchema = z.object({
  componentId: z.string().min(1),
});
export type ArchiveAssessmentComponentSchema = z.infer<typeof archiveAssessmentComponentSchema>;

// ─── Assessment Period ────────────────────────────────────────────────────────

export const createAssessmentPeriodSchema = z.object({
  academicYearId: z.string().min(1, "O ano letivo é obrigatório"),
  academicTermId: z.string().optional(),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  code: z.string().min(1, "O código é obrigatório").max(20, "O código deve ter no máximo 20 caracteres"),
  startDate: z.string().min(1, "A data de início é obrigatória"),
  endDate: z.string().min(1, "A data de fim é obrigatória"),
  order: z.number().int().min(0).default(0),
});
export type CreateAssessmentPeriodSchema = z.infer<typeof createAssessmentPeriodSchema>;

export const updateAssessmentPeriodSchema = z.object({
  periodId: z.string().min(1),
  name: z.string().min(2).optional(),
  code: z.string().min(1).max(20).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateAssessmentPeriodSchema = z.infer<typeof updateAssessmentPeriodSchema>;

export const archiveAssessmentPeriodSchema = z.object({
  periodId: z.string().min(1),
});
export type ArchiveAssessmentPeriodSchema = z.infer<typeof archiveAssessmentPeriodSchema>;

// ─── Assessment ───────────────────────────────────────────────────────────────

export const createAssessmentSchema = z.object({
  assessmentPolicyId: z.string().min(1, "A política de avaliação é obrigatória"),
  assessmentComponentId: z.string().min(1, "O componente de avaliação é obrigatório"),
  assessmentPeriodId: z.string().min(1, "O período de avaliação é obrigatório"),
  academicYearId: z.string().min(1, "O ano letivo é obrigatório"),
  academicTermId: z.string().optional(),
  classGroupId: z.string().min(1, "A turma é obrigatória"),
  courseId: z.string().min(1, "O curso é obrigatório"),
  courseLevelId: z.string().min(1, "O nível é obrigatório"),
  levelSubjectId: z.string().min(1, "A configuração de disciplina é obrigatória"),
  subjectId: z.string().min(1, "A disciplina é obrigatória"),
  teacherId: z.string().optional(),
  title: z.string().min(2, "O título deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  assessmentDate: z.string().min(1, "A data de avaliação é obrigatória"),
  maxScore: z
    .number({ message: "A pontuação máxima deve ser um número" })
    .positive("A pontuação máxima deve ser > 0"),
});
export type CreateAssessmentSchema = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  assessmentDate: z.string().optional(),
  maxScore: z.number().positive().optional(),
  teacherId: z.string().optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "OPEN"]).optional(),
});
export type UpdateAssessmentSchema = z.infer<typeof updateAssessmentSchema>;

export const cancelAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  reason: z.string().optional(),
});
export type CancelAssessmentSchema = z.infer<typeof cancelAssessmentSchema>;

// ─── Grading ──────────────────────────────────────────────────────────────────

export const gradeAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  studentId: z.string().min(1, "O aluno é obrigatório"),
  score: z
    .number({ message: "A pontuação deve ser um número" })
    .min(0, "A pontuação deve ser >= 0"),
  feedback: z.string().optional(),
});
export type GradeAssessmentSchema = z.infer<typeof gradeAssessmentSchema>;

export const bulkGradeAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  grades: z.array(
    z.object({
      studentId: z.string().min(1),
      enrollmentId: z.string().optional(),
      score: z.number().min(0).nullable(),
      feedback: z.string().optional(),
      status: z.enum(["GRADED", "MISSING", "EXCUSED"]).default("GRADED"),
    })
  ).min(1, "Pelo menos uma classificação é obrigatória"),
});
export type BulkGradeAssessmentSchema = z.infer<typeof bulkGradeAssessmentSchema>;

export const invalidateAssessmentResultSchema = z.object({
  resultId: z.string().min(1),
  reason: z.string().min(2, "O motivo é obrigatório"),
});
export type InvalidateAssessmentResultSchema = z.infer<typeof invalidateAssessmentResultSchema>;

// ─── Publication ──────────────────────────────────────────────────────────────

export const publishAssessmentResultsSchema = z.object({
  assessmentId: z.string().min(1),
});
export type PublishAssessmentResultsSchema = z.infer<typeof publishAssessmentResultsSchema>;

// ─── Retakes ──────────────────────────────────────────────────────────────────

export const createAssessmentRetakeSchema = z.object({
  originalAssessmentResultId: z.string().min(1, "O resultado original é obrigatório"),
  assessmentId: z.string().min(1),
  studentId: z.string().min(1),
  enrollmentId: z.string().optional(),
});
export type CreateAssessmentRetakeSchema = z.infer<typeof createAssessmentRetakeSchema>;

export const approveAssessmentRetakeSchema = z.object({
  retakeId: z.string().min(1),
});
export type ApproveAssessmentRetakeSchema = z.infer<typeof approveAssessmentRetakeSchema>;

export const gradeAssessmentRetakeSchema = z.object({
  retakeId: z.string().min(1),
  score: z
    .number({ message: "A pontuação deve ser um número" })
    .min(0, "A pontuação deve ser >= 0"),
  feedback: z.string().optional(),
});
export type GradeAssessmentRetakeSchema = z.infer<typeof gradeAssessmentRetakeSchema>;

// ─── Progress ─────────────────────────────────────────────────────────────────

export const recalculateStudentSubjectProgressSchema = z.object({
  studentId: z.string().min(1),
  enrollmentId: z.string().min(1),
  levelSubjectId: z.string().min(1),
});
export type RecalculateStudentSubjectProgressSchema = z.infer<typeof recalculateStudentSubjectProgressSchema>;
