import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findResultById,
  updateStudentAssessmentResult,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { gradeCalculationService } from "@/modules/grades/services/grade-calculation.service";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import type { AuthContext } from "@/server/auth/context";
import {
  updateStudentAssessmentResultSchema,
  type UpdateStudentAssessmentResultSchema,
} from "@/modules/grades/schemas/grade.schema";
import { GRADE_CHANGE_SOURCE, type StudentAssessmentResult } from "@/modules/grades/types";

export class UpdateStudentAssessmentResultCommand extends BaseCommand<
  UpdateStudentAssessmentResultSchema,
  StudentAssessmentResult
> {
  async validate(): Promise<void> {
    const result = updateStudentAssessmentResultSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const gradeResult = await findResultById(this.input.resultId, this.context.organizationId);
    if (!gradeResult) throw new NotFoundError("Nota", this.input.resultId);
    if (gradeResult.status === "CANCELLED") {
      throw new BusinessRuleError("Não é possível editar uma nota cancelada");
    }

    // Editing an already-graded result requires a justification.
    const gradeChanging = this.input.grade !== undefined && this.input.grade !== gradeResult.grade;
    if (gradeResult.status === "GRADED" && gradeChanging && !this.input.reason?.trim()) {
      throw new ValidationError("Dados inválidos", {
        reason: ["O motivo é obrigatório ao alterar uma nota já classificada"],
      });
    }

    if (this.input.grade !== undefined) {
      const component = await findComponentById(
        gradeResult.assessmentComponentId,
        this.context.organizationId
      );
      if (component && this.input.grade > component.maxGrade) {
        throw new ValidationError("Dados inválidos", {
          grade: [`A nota (${this.input.grade}) excede o máximo do componente (${component.maxGrade})`],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<StudentAssessmentResult> {
    const { resultId, grade, ...rest } = this.input;
    const existing = await findResultById(resultId, this.context.organizationId);

    let normalizedGrade: number | undefined;
    if (grade !== undefined && existing) {
      const component = await findComponentById(
        existing.assessmentComponentId,
        this.context.organizationId
      );
      normalizedGrade = gradeCalculationService.normalizeGrade(grade, component?.maxGrade ?? existing.maxGrade);
    }

    const gradeResult = await updateStudentAssessmentResult(
      resultId,
      this.context.organizationId,
      {
        ...(grade !== undefined ? { grade, normalizedGrade } : {}),
        ...(rest.notes !== undefined ? { notes: rest.notes } : {}),
        ...(rest.status !== undefined ? { status: rest.status } : {}),
        gradedBy: this.context.userId,
        gradedAt: new Date(),
      }
    );

    await auditService.log(this.context, {
      entity: "StudentAssessmentResult",
      entityId: gradeResult.id,
      action: "grade.updated",
      oldValues: {
        grade: existing?.grade ?? null,
        normalizedGrade: existing?.normalizedGrade ?? null,
        status: existing?.status ?? null,
        notes: existing?.notes ?? null,
        gradedBy: existing?.gradedBy ?? null,
      },
      newValues: {
        grade: gradeResult.grade,
        normalizedGrade: gradeResult.normalizedGrade,
        status: gradeResult.status,
        notes: gradeResult.notes,
        gradedBy: gradeResult.gradedBy,
      },
    });

    // Skip the audit entry when nothing actually changed (avoid GradeChangeLog noise),
    // but still cascade so derived progress stays consistent.
    const changed =
      !existing ||
      gradeResult.grade !== existing.grade ||
      gradeResult.normalizedGrade !== existing.normalizedGrade ||
      gradeResult.status !== existing.status;

    // Record the mutation (GradeChangeLog) and cascade progression.
    await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
      result: gradeResult,
      previous: existing
        ? { grade: existing.grade, normalizedGrade: existing.normalizedGrade, status: existing.status }
        : null,
      source: GRADE_CHANGE_SOURCE.UPDATE,
      reason: this.input.reason?.trim() || "Atualização de nota",
      logChange: changed,
    });

    return gradeResult;
  }
}
