import { z } from "zod";

// ─── Subject Assessment Policy ────────────────────────────────────────────────

export const createSubjectPolicySchema = z.object({
  levelSubjectId: z.string().min(1, "A configuração de disciplina é obrigatória"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  calculationMethod: z.enum(["WEIGHTED_AVERAGE", "SIMPLE_AVERAGE"], {
    message: "Método de cálculo inválido",
  }),
  roundingMethod: z.enum(["NONE", "ROUND", "FLOOR", "CEIL"], {
    message: "Método de arredondamento inválido",
  }),
  minimumPassingGrade: z
    .number({ message: "A nota mínima deve ser um número" })
    .min(0, "A nota mínima deve ser >= 0")
    .max(100, "A nota mínima deve ser <= 100"),
  allowRecovery: z.boolean().default(false),
});
export type CreateSubjectPolicySchema = z.infer<typeof createSubjectPolicySchema>;

export const updateSubjectPolicySchema = z.object({
  policyId: z.string().min(1),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").optional(),
  description: z.string().optional(),
  calculationMethod: z
    .enum(["WEIGHTED_AVERAGE", "SIMPLE_AVERAGE"], { message: "Método de cálculo inválido" })
    .optional(),
  roundingMethod: z
    .enum(["NONE", "ROUND", "FLOOR", "CEIL"], { message: "Método de arredondamento inválido" })
    .optional(),
  minimumPassingGrade: z
    .number({ message: "A nota mínima deve ser um número" })
    .min(0)
    .max(100)
    .optional(),
  allowRecovery: z.boolean().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateSubjectPolicySchema = z.infer<typeof updateSubjectPolicySchema>;

export const archiveSubjectPolicySchema = z.object({
  policyId: z.string().min(1),
});
export type ArchiveSubjectPolicySchema = z.infer<typeof archiveSubjectPolicySchema>;

export const activateSubjectPolicySchema = z.object({
  policyId: z.string().min(1),
});
export type ActivateSubjectPolicySchema = z.infer<typeof activateSubjectPolicySchema>;

// ─── Assessment Component ─────────────────────────────────────────────────────

export const createGradeComponentSchema = z.object({
  assessmentPolicyId: z.string().min(1, "A política é obrigatória"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  type: z.enum(
    ["TEST", "EXAM", "PROJECT", "ASSIGNMENT", "PRACTICAL", "ORAL", "PARTICIPATION", "RECOVERY"],
    { message: "Tipo de componente inválido" }
  ),
  weight: z
    .number({ message: "O peso deve ser um número" })
    .gt(0, "O peso deve ser maior que 0")
    .max(100, "O peso deve ser <= 100"),
  maxGrade: z
    .number({ message: "A nota máxima deve ser um número" })
    .gt(0, "A nota máxima deve ser maior que 0"),
  order: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(true),
});
export type CreateGradeComponentSchema = z.infer<typeof createGradeComponentSchema>;

export const updateGradeComponentSchema = z.object({
  componentId: z.string().min(1),
  name: z.string().min(2).optional(),
  type: z
    .enum(["TEST", "EXAM", "PROJECT", "ASSIGNMENT", "PRACTICAL", "ORAL", "PARTICIPATION", "RECOVERY"])
    .optional(),
  weight: z.number().gt(0).max(100).optional(),
  maxGrade: z.number().gt(0).optional(),
  order: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});
export type UpdateGradeComponentSchema = z.infer<typeof updateGradeComponentSchema>;

export const deleteGradeComponentSchema = z.object({
  componentId: z.string().min(1),
});
export type DeleteGradeComponentSchema = z.infer<typeof deleteGradeComponentSchema>;

// ─── Student Assessment Result ────────────────────────────────────────────────

export const createStudentAssessmentResultSchema = z.object({
  enrollmentId: z.string().min(1, "A matrícula é obrigatória"),
  studentId: z.string().min(1, "O aluno é obrigatório"),
  assessmentComponentId: z.string().min(1, "O componente é obrigatório"),
  grade: z.number({ message: "A nota deve ser um número" }).min(0, "A nota deve ser >= 0"),
  notes: z.string().optional(),
});
export type CreateStudentAssessmentResultSchema = z.infer<typeof createStudentAssessmentResultSchema>;

export const updateStudentAssessmentResultSchema = z.object({
  resultId: z.string().min(1),
  grade: z
    .number({ message: "A nota deve ser um número" })
    .min(0, "A nota deve ser >= 0")
    .optional(),
  notes: z.string().optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "GRADED", "CANCELLED"]).optional(),
});
export type UpdateStudentAssessmentResultSchema = z.infer<typeof updateStudentAssessmentResultSchema>;

export const cancelStudentAssessmentResultSchema = z.object({
  resultId: z.string().min(1),
});
export type CancelStudentAssessmentResultSchema = z.infer<typeof cancelStudentAssessmentResultSchema>;

export const bulkGradeSchema = z.object({
  enrollmentId: z.string().min(1),
  subjectId: z.string().min(1),
  assessmentComponentId: z.string().min(1),
  grades: z.array(
    z.object({
      studentId: z.string().min(1),
      grade: z.number().min(0),
      notes: z.string().optional(),
    })
  ).min(1, "Pelo menos uma nota é obrigatória"),
});
export type BulkGradeSchema = z.infer<typeof bulkGradeSchema>;

// ─── Progress Calculation ─────────────────────────────────────────────────────

export const calculateStudentSubjectProgressSchema = z.object({
  studentId: z.string().min(1),
  enrollmentId: z.string().min(1),
  levelSubjectId: z.string().min(1),
});
export type CalculateStudentSubjectProgressSchema = z.infer<typeof calculateStudentSubjectProgressSchema>;

export const recalculateSubjectGradesSchema = z.object({
  levelSubjectId: z.string().min(1),
  classGroupId: z.string().min(1).optional(),
});
export type RecalculateSubjectGradesSchema = z.infer<typeof recalculateSubjectGradesSchema>;
