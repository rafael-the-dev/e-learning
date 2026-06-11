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
import {
  cancelStudentAssessmentResultSchema,
  type CancelStudentAssessmentResultSchema,
} from "@/modules/grades/schemas/grade.schema";

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
    await updateStudentAssessmentResult(
      this.input.resultId,
      this.context.organizationId,
      { status: "CANCELLED" }
    );

    await auditService.log(this.context, {
      entity: "StudentAssessmentResult",
      entityId: this.input.resultId,
      action: "grade.cancelled",
    });
  }
}
