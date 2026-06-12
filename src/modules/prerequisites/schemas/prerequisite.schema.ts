import { z } from "zod";

export const createPrerequisiteGroupSchema = z.object({
  levelSubjectId: z.string().min(1),
  name: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  logicType: z.enum(["ALL", "ANY"]),
});
export type CreatePrerequisiteGroupSchema = z.infer<typeof createPrerequisiteGroupSchema>;

export const updatePrerequisiteGroupSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().max(200).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  logicType: z.enum(["ALL", "ANY"]).optional(),
});
export type UpdatePrerequisiteGroupSchema = z.infer<typeof updatePrerequisiteGroupSchema>;

export const createPrerequisiteItemSchema = z.object({
  prerequisiteGroupId: z.string().min(1),
  prerequisiteLevelSubjectId: z.string().min(1),
  requirementType: z.enum(["MUST_PASS", "MUST_COMPLETE", "MINIMUM_GRADE"]),
  minimumRequiredGrade: z.number().min(0).max(100).nullable().optional(),
}).refine(
  (d) => d.requirementType !== "MINIMUM_GRADE" || (d.minimumRequiredGrade != null && d.minimumRequiredGrade > 0),
  { message: "Nota mínima obrigatória para tipo MINIMUM_GRADE", path: ["minimumRequiredGrade"] }
);
export type CreatePrerequisiteItemSchema = z.infer<typeof createPrerequisiteItemSchema>;

export const grantWaiverSchema = z.object({
  studentId: z.string().min(1),
  enrollmentId: z.string().min(1),
  levelSubjectId: z.string().min(1),
  prerequisiteGroupId: z.string().nullable().optional(),
  prerequisiteItemId: z.string().nullable().optional(),
  reason: z.string().min(5, "Motivo deve ter pelo menos 5 caracteres").max(2000),
});
export type GrantWaiverSchema = z.infer<typeof grantWaiverSchema>;

export const createProgressionPolicySchema = z.object({
  courseId: z.string().min(1),
  fromLevelId: z.string().min(1),
  toLevelId: z.string().min(1),
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  description: z.string().max(1000).nullable().optional(),
  progressionMode: z.enum(["STRICT", "CONDITIONAL", "CREDIT_BASED", "MANUAL_APPROVAL"]),
  minimumLevelAverage: z.number().min(0).max(100).nullable().optional(),
  maxFailedRequiredSubjects: z.number().int().min(0).nullable().optional(),
  maxPendingSubjects: z.number().int().min(0).nullable().optional(),
  requiredCredits: z.number().int().min(0).nullable().optional(),
  requireFinancialClearance: z.boolean().optional(),
  requireManualApproval: z.boolean().optional(),
});
export type CreateProgressionPolicySchema = z.infer<typeof createProgressionPolicySchema>;

export const evaluateProgressionSchema = z.object({
  enrollmentId: z.string().min(1),
  courseLevelId: z.string().min(1),
  autoPromote: z.boolean().optional(),
});
export type EvaluateProgressionSchema = z.infer<typeof evaluateProgressionSchema>;

export const reviewProgressionRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().max(2000).nullable().optional(),
});
export type ReviewProgressionRequestSchema = z.infer<typeof reviewProgressionRequestSchema>;
