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
import { getDb } from "@/server/db";
import { eventPublisher } from "@/server/events/event-publisher";
import type { DomainEvent } from "@/server/events/domain-event";
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

    // Atomic boundary: cancellation + GradeChangeLog + derived cascade commit
    // together. Events are published only after commit.
    const db = await getDb();
    const events: DomainEvent[] = [];
    await db.$transaction(async (tx) => {
      const gradeResult = await updateStudentAssessmentResult(
        this.input.resultId,
        this.context.organizationId,
        { status: "CANCELLED" },
        tx
      );

      await auditService.log(this.context, {
        entity: "StudentAssessmentResult",
        entityId: this.input.resultId,
        action: "grade.cancelled",
      }, tx);

      // Record the mutation and cascade. A CANCELLED result is excluded from the
      // calculation, so progression recomputes as if the grade was removed.
      await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
        result: gradeResult,
        previous: existing
          ? { grade: existing.grade, normalizedGrade: existing.normalizedGrade, status: existing.status }
          : null,
        source: GRADE_CHANGE_SOURCE.CANCEL,
        reason: this.input.reason,
        client: tx,
        events,
      });
    });

    for (const event of events) await eventPublisher.publish(event);
  }
}
