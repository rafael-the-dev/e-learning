"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";

import { CreateAssessmentPolicyCommand } from "@/modules/grades/commands/create-assessment-policy.command";
import { UpdateAssessmentPolicyCommand } from "@/modules/grades/commands/update-assessment-policy.command";
import { ArchiveAssessmentPolicyCommand } from "@/modules/grades/commands/archive-assessment-policy.command";
import { ActivateAssessmentPolicyCommand } from "@/modules/grades/commands/activate-assessment-policy.command";
import { CreateAssessmentComponentCommand } from "@/modules/grades/commands/create-assessment-component.command";
import { UpdateAssessmentComponentCommand } from "@/modules/grades/commands/update-assessment-component.command";
import { DeleteAssessmentComponentCommand } from "@/modules/grades/commands/delete-assessment-component.command";
import { CreateStudentAssessmentResultCommand } from "@/modules/grades/commands/create-student-assessment-result.command";
import { UpdateStudentAssessmentResultCommand } from "@/modules/grades/commands/update-student-assessment-result.command";
import { CancelStudentAssessmentResultCommand } from "@/modules/grades/commands/cancel-student-assessment-result.command";
import { RecalculateStudentSubjectProgressCommand } from "@/modules/assessments/commands/recalculate-student-subject-progress.command";
import { RecalculateSubjectGradesCommand } from "@/modules/grades/commands/recalculate-subject-grades.command";

import type {
  CreateSubjectPolicySchema,
  UpdateSubjectPolicySchema,
  ArchiveSubjectPolicySchema,
  ActivateSubjectPolicySchema,
  CreateGradeComponentSchema,
  UpdateGradeComponentSchema,
  DeleteGradeComponentSchema,
  CreateStudentAssessmentResultSchema,
  UpdateStudentAssessmentResultSchema,
  CancelStudentAssessmentResultSchema,
  RecalculateSubjectGradesSchema,
} from "@/modules/grades/schemas/grade.schema";
import type { RecalculateStudentSubjectProgressSchema } from "@/modules/assessments/schemas/assessment.schema";
import type { ActionResult } from "@/shared/types/common";
import type { StudentAssessmentResult } from "@/modules/grades/types";
import type { AssessmentPolicy, AssessmentComponent } from "@/modules/assessments/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";

// ─── Assessment Policies ───────────────────────────────────────────────────────

export async function createAssessmentPolicyAction(
  input: CreateSubjectPolicySchema
): Promise<ActionResult<AssessmentPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const policy = await new CreateAssessmentPolicyCommand(input, context).run();
    revalidatePath("/grades");
    return policy;
  });
}

export async function updateAssessmentPolicyAction(
  input: UpdateSubjectPolicySchema
): Promise<ActionResult<AssessmentPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const policy = await new UpdateAssessmentPolicyCommand(input, context).run();
    revalidatePath("/grades");
    return policy;
  });
}

export async function archiveAssessmentPolicyAction(
  input: ArchiveSubjectPolicySchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new ArchiveAssessmentPolicyCommand(input, context).run();
    revalidatePath("/grades");
  });
}

export async function activateAssessmentPolicyAction(
  input: ActivateSubjectPolicySchema
): Promise<ActionResult<AssessmentPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const policy = await new ActivateAssessmentPolicyCommand(input, context).run();
    revalidatePath("/grades");
    return policy;
  });
}

// ─── Assessment Components ─────────────────────────────────────────────────────

export async function createAssessmentComponentAction(
  input: CreateGradeComponentSchema
): Promise<ActionResult<AssessmentComponent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const component = await new CreateAssessmentComponentCommand(input, context).run();
    revalidatePath("/grades");
    return component;
  });
}

export async function updateAssessmentComponentAction(
  input: UpdateGradeComponentSchema
): Promise<ActionResult<AssessmentComponent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const component = await new UpdateAssessmentComponentCommand(input, context).run();
    revalidatePath("/grades");
    return component;
  });
}

export async function deleteAssessmentComponentAction(
  input: DeleteGradeComponentSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new DeleteAssessmentComponentCommand(input, context).run();
    revalidatePath("/grades");
  });
}

// ─── Student Grades ────────────────────────────────────────────────────────────

export async function createStudentAssessmentResultAction(
  input: CreateStudentAssessmentResultSchema
): Promise<ActionResult<StudentAssessmentResult>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const result = await new CreateStudentAssessmentResultCommand(input, context).run();
    revalidatePath("/grades");
    revalidatePath(`/students/${input.studentId}`);
    revalidatePath(`/enrollments/${input.enrollmentId}`);
    return result;
  });
}

export async function updateStudentAssessmentResultAction(
  input: UpdateStudentAssessmentResultSchema
): Promise<ActionResult<StudentAssessmentResult>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const result = await new UpdateStudentAssessmentResultCommand(input, context).run();
    revalidatePath("/grades");
    return result;
  });
}

export async function cancelStudentAssessmentResultAction(
  input: CancelStudentAssessmentResultSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new CancelStudentAssessmentResultCommand(input, context).run();
    revalidatePath("/grades");
  });
}

// ─── Progress Calculation ──────────────────────────────────────────────────────

export async function calculateStudentSubjectProgressAction(
  input: RecalculateStudentSubjectProgressSchema
): Promise<ActionResult<StudentSubjectProgress>> {
  return runAction(async () => {
    const context = await requireOrganization();
    // Unified: the single cascading recalculation command (subject -> level -> course).
    const progress = await new RecalculateStudentSubjectProgressCommand(input, context).run();
    revalidatePath("/grades");
    revalidatePath(`/students/${input.studentId}`);
    revalidatePath(`/enrollments/${input.enrollmentId}`);
    revalidatePath("/student-progress");
    return progress;
  });
}

export async function recalculateSubjectGradesAction(
  input: RecalculateSubjectGradesSchema
): Promise<ActionResult<number>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const count = await new RecalculateSubjectGradesCommand(input, context).run();
    revalidatePath("/grades");
    revalidatePath("/student-progress");
    return count;
  });
}

// ─── Fetch policy data for level subject drawer ───────────────────────────────

export type LevelSubjectPolicyData = {
  policy: AssessmentPolicy | null;
  components: AssessmentComponent[];
};

export async function fetchLevelSubjectPolicyAction(
  levelSubjectId: string
): Promise<ActionResult<LevelSubjectPolicyData>> {
  try {
    const context = await requireOrganization();
    const policy = await findActivePolicyForLevelSubject(levelSubjectId, context.organizationId);
    const components = policy
      ? await findActiveComponentsByPolicy(policy.id, context.organizationId)
      : [];
    return { success: true, data: { policy: policy ?? null, components } };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}
