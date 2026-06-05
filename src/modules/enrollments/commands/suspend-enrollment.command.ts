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
  suspendEnrollmentSchema,
  type SuspendEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import { ENROLLMENT_TRANSITIONS } from "@/modules/enrollments/types";
import type { Enrollment } from "@/modules/enrollments/types";

export class SuspendEnrollmentCommand extends BaseCommand<SuspendEnrollmentSchema, Enrollment> {
  private _existing: Enrollment | null = null;

  async validate(): Promise<void> {
    const result = suspendEnrollmentSchema.safeParse(this.input);
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
    if (!allowed.includes("SUSPENDED")) {
      throw new BusinessRuleError(
        `Não é possível suspender uma matrícula com estado "${existing.status}".`
      );
    }
    this._existing = existing;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ENROLLMENTS_SUSPEND)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Enrollment> {
    const prev = this._existing!;
    const enrollment = await updateEnrollmentStatus(
      this.input.enrollmentId,
      this.context.organizationId,
      "SUSPENDED",
      this.context.userId
    );

    await createEnrollmentStatusHistory({
      enrollmentId: enrollment.id,
      fromStatus: prev.status,
      toStatus: "SUSPENDED",
      reason: this.input.reason,
      changedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Enrollment",
      entityId: enrollment.id,
      action: "enrollment.suspended",
      oldValues: { status: prev.status },
      newValues: { status: "SUSPENDED", reason: this.input.reason },
    });

    return enrollment;
  }
}
