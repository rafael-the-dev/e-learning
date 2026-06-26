import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessAssessment } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import {
  findAssessmentById,
  updateAssessment,
} from "@/modules/assessments/repositories/assessment.repository";
import {
  updateAssessmentSchema,
  type UpdateAssessmentSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { Assessment } from "@/modules/assessments/types";

export class UpdateAssessmentCommand extends BaseCommand<UpdateAssessmentSchema, Assessment> {
  async validate(): Promise<void> {
    const result = updateAssessmentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const { organizationId } = this.context;
    const assessment = await findAssessmentById(this.input.assessmentId, organizationId);
    if (!assessment) throw new NotFoundError("Avaliação", this.input.assessmentId);
    if (["CANCELLED", "ARCHIVED", "GRADED"].includes(assessment.status)) {
      throw new ValidationError("Dados inválidos", {
        assessmentId: ["Não é possível editar uma avaliação neste estado"],
      });
    }

    if (this.input.teacherId) {
      const db = await getDb();
      const teacher = await db.teacher.findFirst({
        where: { id: this.input.teacherId, organizationId, deletedAt: null },
      });
      if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENTS_UPDATE)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only update
    // an assessment they own (or for a class group they teach). No-op for admins.
    await assertTeacherCanAccessAssessment(this.context as AuthContext, this.input.assessmentId);
  }

  async execute(): Promise<Assessment> {
    const updateData: Record<string, unknown> = {};
    if (this.input.title !== undefined) updateData.title = this.input.title;
    if (this.input.description !== undefined) updateData.description = this.input.description;
    if (this.input.assessmentDate !== undefined) updateData.assessmentDate = new Date(this.input.assessmentDate);
    if (this.input.maxScore !== undefined) updateData.maxScore = this.input.maxScore;
    if (this.input.teacherId !== undefined) updateData.teacherId = this.input.teacherId;
    if (this.input.status !== undefined) updateData.status = this.input.status;

    const assessment = await updateAssessment(
      this.input.assessmentId,
      this.context.organizationId,
      updateData as any
    );

    await auditService.log(this.context, {
      entity: "Assessment",
      entityId: assessment.id,
      action: "assessment.updated",
      newValues: updateData,
    });

    return assessment;
  }
}
