import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findEnrollmentByIdInOrganization,
  softDeleteEnrollment,
} from "@/modules/enrollments/repositories/enrollment.repository";
import {
  deleteEnrollmentSchema,
  type DeleteEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import type { Enrollment } from "@/modules/enrollments/types";
import { getDb } from "@/server/db";

export class SoftDeleteEnrollmentCommand extends BaseCommand<DeleteEnrollmentSchema, void> {
  private _existing: Enrollment | null = null;

  async validate(): Promise<void> {
    const result = deleteEnrollmentSchema.safeParse(this.input);
    if (!result.success) {
      throw new BusinessRuleError(result.error.issues[0]?.message ?? "Dados inválidos");
    }

    const existing = await findEnrollmentByIdInOrganization(
      this.input.enrollmentId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Matrícula", this.input.enrollmentId);

    if (existing.status === "ACTIVE") {
      throw new BusinessRuleError(
        "Não é possível eliminar uma matrícula ativa. Cancele-a primeiro."
      );
    }
    this._existing = existing;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ENROLLMENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const prev = this._existing!;

    // Release class group seat if still assigned and not yet released
    if (prev.classGroupId && prev.status !== "CANCELLED" && prev.status !== "COMPLETED") {
      const db = await getDb();
      await db.classGroup.update({
        where: { id: prev.classGroupId },
        data: { currentCount: { decrement: 1 } },
      });
    }

    await softDeleteEnrollment(this.input.enrollmentId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "Enrollment",
      entityId: this.input.enrollmentId,
      action: "enrollment.deleted",
      oldValues: {
        enrollmentNumber: prev.enrollmentNumber,
        studentId: prev.studentId,
        courseId: prev.courseId,
        status: prev.status,
      },
    });
  }
}
