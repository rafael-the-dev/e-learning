import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessAssessment } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { upsertAssessmentPublication } from "@/modules/assessments/repositories/assessment-publication.repository";
import {
  publishAssessmentResultsSchema,
  type PublishAssessmentResultsSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class PublishAssessmentResultsCommand extends BaseCommand<
  PublishAssessmentResultsSchema,
  void
> {
  async validate(): Promise<void> {
    const result = publishAssessmentResultsSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const assessment = await findAssessmentById(this.input.assessmentId, this.context.organizationId);
    if (!assessment) throw new NotFoundError("Avaliação", this.input.assessmentId);
    if (assessment.status !== "GRADED") {
      throw new BusinessRuleError(
        "Apenas avaliações classificadas podem ter os resultados publicados."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_PUBLICATIONS_PUBLISH)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only publish
    // an assessment they own (or for a class group they teach). No-op for admins.
    await assertTeacherCanAccessAssessment(this.context as AuthContext, this.input.assessmentId);
  }

  async execute(): Promise<void> {
    const now = new Date();

    await upsertAssessmentPublication({
      organizationId: this.context.organizationId,
      assessmentId: this.input.assessmentId,
      publicationStatus: "PUBLISHED",
      publishedAt: now,
      publishedByUserId: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Assessment",
      entityId: this.input.assessmentId,
      action: "assessment_results.published",
      newValues: { publishedAt: now },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.ASSESSMENT_RESULTS_PUBLISHED,
      aggregateType: DomainAggregateType.ASSESSMENT,
      aggregateId: this.input.assessmentId,
      actorId: this.context.userId,
      payload: {
        assessmentId: this.input.assessmentId,
        publishedAt: now.toISOString(),
      },
    });
  }
}
