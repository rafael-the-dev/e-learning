import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findRetakeById,
  updateAssessmentRetake,
} from "@/modules/assessments/repositories/assessment-retake.repository";
import {
  approveAssessmentRetakeSchema,
  type ApproveAssessmentRetakeSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class ApproveAssessmentRetakeCommand extends BaseCommand<ApproveAssessmentRetakeSchema, void> {
  async validate(): Promise<void> {
    const result = approveAssessmentRetakeSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const retake = await findRetakeById(this.input.retakeId, this.context.organizationId);
    if (!retake) throw new NotFoundError("Recuperação", this.input.retakeId);
    if (retake.status !== "REQUESTED") {
      throw new ValidationError("Dados inválidos", {
        retakeId: ["A recuperação não está no estado SOLICITADO"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateAssessmentRetake(this.input.retakeId, this.context.organizationId, {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedByUserId: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "AssessmentRetake",
      entityId: this.input.retakeId,
      action: "assessment_retake.approved",
    });
  }
}
