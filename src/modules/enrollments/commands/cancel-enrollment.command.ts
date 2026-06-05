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
  findEnrollmentByIdInOrganization,
  updateEnrollmentStatus,
  createEnrollmentStatusHistory,
} from "@/modules/enrollments/repositories/enrollment.repository";
import {
  cancelEnrollmentSchema,
  type CancelEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import { ENROLLMENT_TRANSITIONS } from "@/modules/enrollments/types";
import type { Enrollment } from "@/modules/enrollments/types";
import { getDb } from "@/server/db";

export class CancelEnrollmentCommand extends BaseCommand<CancelEnrollmentSchema, Enrollment> {
  private _existing: Enrollment | null = null;

  async validate(): Promise<void> {
    const result = cancelEnrollmentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findEnrollmentByIdInOrganization(
      this.input.enrollmentId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Matrícula", this.input.enrollmentId);

    const allowed = ENROLLMENT_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes("CANCELLED")) {
      throw new BusinessRuleError(
        `Não é possível cancelar uma matrícula com estado "${existing.status}".`
      );
    }
    this._existing = existing;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ENROLLMENTS_CANCEL)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Enrollment> {
    const prev = this._existing!;
    const enrollment = await updateEnrollmentStatus(
      this.input.enrollmentId,
      this.context.organizationId,
      "CANCELLED",
      this.context.userId
    );

    // Release class group seat if assigned
    if (prev.classGroupId) {
      const db = await getDb();
      await db.classGroup.update({
        where: { id: prev.classGroupId },
        data: { currentCount: { decrement: 1 } },
      });
    }

    await createEnrollmentStatusHistory({
      enrollmentId: enrollment.id,
      fromStatus: prev.status,
      toStatus: "CANCELLED",
      reason: this.input.reason,
      changedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Enrollment",
      entityId: enrollment.id,
      action: "enrollment.cancelled",
      oldValues: { status: prev.status },
      newValues: { status: "CANCELLED", reason: this.input.reason },
    });

    return enrollment;
  }
}
