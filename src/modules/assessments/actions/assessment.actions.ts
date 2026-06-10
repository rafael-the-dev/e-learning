"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";

import { CreateAssessmentPolicyCommand } from "@/modules/assessments/commands/create-assessment-policy.command";
import { UpdateAssessmentPolicyCommand } from "@/modules/assessments/commands/update-assessment-policy.command";
import { ArchiveAssessmentPolicyCommand } from "@/modules/assessments/commands/archive-assessment-policy.command";
import { CreateAssessmentComponentCommand } from "@/modules/assessments/commands/create-assessment-component.command";
import { UpdateAssessmentComponentCommand } from "@/modules/assessments/commands/update-assessment-component.command";
import { ArchiveAssessmentComponentCommand } from "@/modules/assessments/commands/archive-assessment-component.command";
import { CreateAssessmentPeriodCommand } from "@/modules/assessments/commands/create-assessment-period.command";
import { UpdateAssessmentPeriodCommand } from "@/modules/assessments/commands/update-assessment-period.command";
import { ArchiveAssessmentPeriodCommand } from "@/modules/assessments/commands/archive-assessment-period.command";
import { CreateAssessmentCommand } from "@/modules/assessments/commands/create-assessment.command";
import { UpdateAssessmentCommand } from "@/modules/assessments/commands/update-assessment.command";
import { CancelAssessmentCommand } from "@/modules/assessments/commands/cancel-assessment.command";
import { BulkGradeAssessmentCommand } from "@/modules/assessments/commands/bulk-grade-assessment.command";
import { InvalidateAssessmentResultCommand } from "@/modules/assessments/commands/invalidate-assessment-result.command";
import { PublishAssessmentResultsCommand } from "@/modules/assessments/commands/publish-assessment-results.command";
import { CreateAssessmentRetakeCommand } from "@/modules/assessments/commands/create-assessment-retake.command";
import { ApproveAssessmentRetakeCommand } from "@/modules/assessments/commands/approve-assessment-retake.command";
import { GradeAssessmentRetakeCommand } from "@/modules/assessments/commands/grade-assessment-retake.command";
import { RecalculateStudentSubjectProgressCommand } from "@/modules/assessments/commands/recalculate-student-subject-progress.command";

import type {
  CreateAssessmentPolicySchema,
  UpdateAssessmentPolicySchema,
  CreateAssessmentComponentSchema,
  UpdateAssessmentComponentSchema,
  CreateAssessmentPeriodSchema,
  UpdateAssessmentPeriodSchema,
  CreateAssessmentSchema,
  UpdateAssessmentSchema,
  CancelAssessmentSchema,
  BulkGradeAssessmentSchema,
  InvalidateAssessmentResultSchema,
  PublishAssessmentResultsSchema,
  CreateAssessmentRetakeSchema,
  ApproveAssessmentRetakeSchema,
  GradeAssessmentRetakeSchema,
  RecalculateStudentSubjectProgressSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { ActionResult } from "@/shared/types/common";
import type {
  AssessmentPolicy,
  AssessmentComponent,
  AssessmentPeriod,
  Assessment,
  AssessmentResult,
  AssessmentRetake,
  StudentSubjectProgress,
} from "@/modules/assessments/types";

// ─── Assessment Policies ───────────────────────────────────────────────────────

export async function createAssessmentPolicyAction(
  input: CreateAssessmentPolicySchema
): Promise<ActionResult<AssessmentPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const policy = await new CreateAssessmentPolicyCommand(input, context).run();
    revalidatePath("/assessment-policies");
    return policy;
  });
}

export async function updateAssessmentPolicyAction(
  input: UpdateAssessmentPolicySchema
): Promise<ActionResult<AssessmentPolicy>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const policy = await new UpdateAssessmentPolicyCommand(input, context).run();
    revalidatePath("/assessment-policies");
    return policy;
  });
}

export async function archiveAssessmentPolicyAction(
  input: { assessmentPolicyId: string }
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new ArchiveAssessmentPolicyCommand({ policyId: input.assessmentPolicyId }, context).run();
    revalidatePath("/assessment-policies");
  });
}

// ─── Assessment Components ─────────────────────────────────────────────────────

export async function createAssessmentComponentAction(
  input: CreateAssessmentComponentSchema
): Promise<ActionResult<AssessmentComponent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const component = await new CreateAssessmentComponentCommand(input, context).run();
    revalidatePath("/assessment-policies");
    return component;
  });
}

export async function updateAssessmentComponentAction(
  input: UpdateAssessmentComponentSchema
): Promise<ActionResult<AssessmentComponent>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const component = await new UpdateAssessmentComponentCommand(input, context).run();
    revalidatePath("/assessment-policies");
    return component;
  });
}

export async function archiveAssessmentComponentAction(
  input: { componentId: string }
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new ArchiveAssessmentComponentCommand({ componentId: input.componentId }, context).run();
    revalidatePath("/assessment-policies");
  });
}

// ─── Assessment Periods ────────────────────────────────────────────────────────

export async function createAssessmentPeriodAction(
  input: CreateAssessmentPeriodSchema
): Promise<ActionResult<AssessmentPeriod>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const period = await new CreateAssessmentPeriodCommand(input, context).run();
    revalidatePath("/assessment-periods");
    return period;
  });
}

export async function updateAssessmentPeriodAction(
  input: UpdateAssessmentPeriodSchema
): Promise<ActionResult<AssessmentPeriod>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const period = await new UpdateAssessmentPeriodCommand(input, context).run();
    revalidatePath("/assessment-periods");
    return period;
  });
}

export async function archiveAssessmentPeriodAction(
  input: { assessmentPeriodId: string }
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new ArchiveAssessmentPeriodCommand({ periodId: input.assessmentPeriodId }, context).run();
    revalidatePath("/assessment-periods");
  });
}

// ─── Assessments ──────────────────────────────────────────────────────────────

export async function createAssessmentAction(
  input: CreateAssessmentSchema
): Promise<ActionResult<Assessment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const assessment = await new CreateAssessmentCommand(input, context).run();
    revalidatePath("/assessments");
    return assessment;
  });
}

export async function updateAssessmentAction(
  input: UpdateAssessmentSchema
): Promise<ActionResult<Assessment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const assessment = await new UpdateAssessmentCommand(input, context).run();
    revalidatePath("/assessments");
    revalidatePath(`/assessments/${input.assessmentId}`);
    return assessment;
  });
}

export async function cancelAssessmentAction(
  input: CancelAssessmentSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new CancelAssessmentCommand(input, context).run();
    revalidatePath("/assessments");
    revalidatePath(`/assessments/${input.assessmentId}`);
  });
}

// ─── Grading ──────────────────────────────────────────────────────────────────

export async function bulkGradeAssessmentAction(
  input: BulkGradeAssessmentSchema
): Promise<ActionResult<AssessmentResult[]>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const results = await new BulkGradeAssessmentCommand(input, context).run();
    revalidatePath(`/assessments/${input.assessmentId}/grade`);
    revalidatePath(`/assessments/${input.assessmentId}`);
    revalidatePath("/assessments");
    return results;
  });
}

export async function invalidateAssessmentResultAction(
  input: InvalidateAssessmentResultSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new InvalidateAssessmentResultCommand(input, context).run();
    revalidatePath("/assessments");
  });
}

export async function publishAssessmentResultsAction(
  input: PublishAssessmentResultsSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new PublishAssessmentResultsCommand(input, context).run();
    revalidatePath("/assessments");
    revalidatePath(`/assessments/${input.assessmentId}`);
    revalidatePath("/student-progress");
  });
}

// ─── Retakes ──────────────────────────────────────────────────────────────────

export async function createAssessmentRetakeAction(
  input: CreateAssessmentRetakeSchema
): Promise<ActionResult<AssessmentRetake>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const retake = await new CreateAssessmentRetakeCommand(input, context).run();
    revalidatePath("/assessments");
    return retake;
  });
}

export async function approveAssessmentRetakeAction(
  input: ApproveAssessmentRetakeSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new ApproveAssessmentRetakeCommand(input, context).run();
    revalidatePath("/assessments");
  });
}

export async function gradeAssessmentRetakeAction(
  input: GradeAssessmentRetakeSchema
): Promise<ActionResult<AssessmentRetake>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const retake = await new GradeAssessmentRetakeCommand(input, context).run();
    revalidatePath("/assessments");
    return retake;
  });
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function recalculateStudentSubjectProgressAction(
  input: RecalculateStudentSubjectProgressSchema
): Promise<ActionResult<StudentSubjectProgress>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const progress = await new RecalculateStudentSubjectProgressCommand(input, context).run();
    revalidatePath("/student-progress");
    revalidatePath(`/students/${input.studentId}`);
    return progress;
  });
}
