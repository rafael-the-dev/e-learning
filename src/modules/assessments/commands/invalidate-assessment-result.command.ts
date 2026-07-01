import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findResultById,
  updateAssessmentResult,
} from "@/modules/assessments/repositories/assessment-result.repository";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import {
  findResultByEnrollmentAndComponent,
  updateStudentAssessmentResult,
} from "@/modules/grades/repositories/student-assessment-result.repository";
import { gradeMutationService } from "@/modules/grades/services/grade-mutation.service";
import { GRADE_CHANGE_SOURCE } from "@/modules/grades/types";
import {
  invalidateAssessmentResultSchema,
  type InvalidateAssessmentResultSchema,
} from "@/modules/assessments/schemas/assessment.schema";

export class InvalidateAssessmentResultCommand extends BaseCommand<
  InvalidateAssessmentResultSchema,
  void
> {
  async validate(): Promise<void> {
    const result = invalidateAssessmentResultSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const assessmentResult = await findResultById(this.input.resultId, this.context.organizationId);
    if (!assessmentResult) throw new NotFoundError("Resultado de avaliação", this.input.resultId);
    if (assessmentResult.status === "INVALIDATED") {
      throw new ValidationError("Dados inválidos", {
        resultId: ["O resultado já está invalidado"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_RESULTS_INVALIDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const { organizationId } = this.context;

    // 1) Mark the participation sidecar as invalidated (event-level record).
    const assessmentResult = await findResultById(this.input.resultId, organizationId);
    await updateAssessmentResult(this.input.resultId, organizationId, {
      status: "INVALIDATED",
      feedback: this.input.reason,
    });

    await auditService.log(this.context, {
      entity: "AssessmentResult",
      entityId: this.input.resultId,
      action: "assessment_result.invalidated",
      newValues: { reason: this.input.reason },
    });

    // 2) Invalidation must also affect the canonical grade. Locate the
    // StudentAssessmentResult for this event's component and CANCEL it so it
    // drops out of the calculation, then log the change and cascade.
    // (StudentResultStatus has no INVALIDATED value; CANCELLED is the terminal
    // "not counted" state and is excluded from progress reads.)
    if (!assessmentResult?.enrollmentId) return;

    const assessment = await findAssessmentById(assessmentResult.assessmentId, organizationId);
    if (!assessment?.assessmentComponentId) return;

    const canonical = await findResultByEnrollmentAndComponent(
      assessmentResult.enrollmentId,
      assessment.assessmentComponentId,
      organizationId
    );
    if (!canonical || canonical.status === "CANCELLED") return;

    const cancelled = await updateStudentAssessmentResult(canonical.id, organizationId, {
      status: "CANCELLED",
    });

    await gradeMutationService.handleGradeMutation(this.context as AuthContext, {
      result: cancelled,
      previous: {
        grade: canonical.grade,
        normalizedGrade: canonical.normalizedGrade,
        status: canonical.status,
      },
      source: GRADE_CHANGE_SOURCE.INVALIDATE,
      reason: this.input.reason,
    });
  }
}
