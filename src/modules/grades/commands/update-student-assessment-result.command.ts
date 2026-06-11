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
import {
  updateStudentAssessmentResultSchema,
  type UpdateStudentAssessmentResultSchema,
} from "@/modules/grades/schemas/grade.schema";
import type { StudentAssessmentResult } from "@/modules/grades/types";

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

    return gradeResult;
  }
}
