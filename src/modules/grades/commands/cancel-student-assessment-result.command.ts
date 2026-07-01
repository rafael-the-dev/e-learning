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
import type { AuthContext } from "@/server/auth/context";
import {
  findResultById,
  updateStudentAssessmentResult,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import {
  cancelStudentAssessmentResultSchema,
  type CancelStudentAssessmentResultSchema,
} from "@/modules/grades/schemas/grade.schema";
import { GRADE_CHANGE_SOURCE } from "@/modules/grades/types";

export class CancelStudentAssessmentResultCommand extends BaseCommand<
  CancelStudentAssessmentResultSchema,
  void
> {
  async validate(): Promise<void> {
    const result = cancelStudentAssessmentResultSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const gradeResult = await findResultById(this.input.resultId, this.context.organizationId);
    if (!gradeResult) throw new NotFoundError("Nota", this.input.resultId);
    if (gradeResult.status === "CANCELLED") {
      throw new BusinessRuleError("A nota já está cancelada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.GRADES_CANCEL)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const existing = await findResultById(this.input.resultId, this.context.organizationId);

    const gradeResult = await updateStudentAssessmentResult(
      this.input.resultId,
      this.context.organizationId,
      { status: "CANCELLED" }
    );

    await auditService.log(this.context, {
      entity: "StudentAssessmentResult",
      entityId: this.input.resultId,
      action: "grade.cancelled",
    });

    // Record the mutation and cascade. A CANCELLED result is excluded from the
    // calculation, so progression recomputes as if the grade was removed.
    await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
      result: gradeResult,
      previous: existing
        ? { grade: existing.grade, normalizedGrade: existing.normalizedGrade, status: existing.status }
        : null,
      source: GRADE_CHANGE_SOURCE.CANCEL,
      reason: this.input.reason,
    });
  }
}
