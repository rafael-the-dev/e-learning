import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  ExamEventAggregateType,
  ExamEventType,
} from "@/modules/examinations/constants";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import {
  archiveExamGradeComponentBinding,
  createExamGradeComponentBinding,
  findActiveBindingBySession,
  findExamGradeComponentBindingById,
} from "@/modules/examinations/repositories/exam-grade-component-binding.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  archiveExamSessionGradeComponentBindingSchema,
  bindExamSessionToGradeComponentSchema,
} from "@/modules/examinations/schemas/binding.schema";
import { recordExamTransition } from "./scheduling-shared";
import { isSessionConsumed } from "./integration-shared";

// =============================================================================
// EXAMINATION ENGINE — EXAM→GRADE-COMPONENT BINDING COMMANDS (Phase 11B; ADR-014)
// -----------------------------------------------------------------------------
// Manage the EXPLICIT canonical mapping from an ExamSession to a Grade Engine
// `assessmentComponentId`. The bind command validates the component against the
// real AssessmentComponent + its AssessmentPolicy.levelSubjectId (compatibility,
// NO heuristic), refuses to (re)bind a session whose results were already
// integrated (consumed), enforces one active binding per session, and records an
// EVENT-ONLY transition (no ExamSession status write). Actor ids come from the
// ServiceContext only. This layer NEVER writes a grade — it only records the
// mapping the Phase-11 integration boundary later reads through the resolver.
// =============================================================================

const EXAM_SESSION = ExamEventAggregateType.EXAM_SESSION;
const SESSION_ENTITY = "ExamSession";

export interface BindExamSessionToGradeComponentResult {
  bindingId: string;
  examSessionId: string;
  assessmentComponentId: string;
}

export interface ArchiveExamSessionGradeComponentBindingResult {
  bindingId: string;
  examSessionId: string;
  archived: boolean;
}

async function authorizeBinding(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_INTEGRATE_RESULTS)) {
    throw new AuthorizationError();
  }
}

// ─── Bind a session to a grade component ──────────────────────────────────────

export class BindExamSessionToGradeComponentCommand extends BaseCommand<
  unknown,
  BindExamSessionToGradeComponentResult
> {
  async validate(): Promise<void> {
    const parsed = bindExamSessionToGradeComponentSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeBinding(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<BindExamSessionToGradeComponentResult> {
    const { organizationId, userId } = this.context;
    const input = bindExamSessionToGradeComponentSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. The session must exist for this org.
      const session = await findExamSessionById({ organizationId, id: input.examSessionId }, tx);
      if (!session) {
        throw new BusinessRuleError("EXAM_SESSION_NOT_FOUND", { examSessionId: input.examSessionId });
      }

      // 2. The component must exist for this org.
      const component = await findComponentById(input.assessmentComponentId, organizationId);
      if (!component) {
        throw new BusinessRuleError("ASSESSMENT_COMPONENT_NOT_FOUND", {
          assessmentComponentId: input.assessmentComponentId,
        });
      }

      // 3. Compatibility (NO heuristic): the component's policy levelSubject must
      //    equal the session's levelSubject.
      const policy = await findAssessmentPolicyById(component.assessmentPolicyId, organizationId);
      if (!policy || policy.levelSubjectId !== session.levelSubjectId) {
        throw new BusinessRuleError("ASSESSMENT_COMPONENT_NOT_COMPATIBLE", {
          assessmentComponentId: input.assessmentComponentId,
          componentLevelSubjectId: policy?.levelSubjectId ?? null,
          sessionLevelSubjectId: session.levelSubjectId,
        });
      }

      // 4. Consumed guard — a session whose results were integrated cannot be (re)bound.
      if (await isSessionConsumed({ organizationId, examSessionId: input.examSessionId }, tx)) {
        throw new BusinessRuleError("EXAM_GRADE_BINDING_ALREADY_CONSUMED", {
          examSessionId: input.examSessionId,
        });
      }

      // 5. One active binding per session.
      const existing = await findActiveBindingBySession(
        { organizationId, examSessionId: input.examSessionId },
        tx
      );
      if (existing) {
        throw new BusinessRuleError("EXAM_GRADE_BINDING_ALREADY_EXISTS", {
          bindingId: existing.id,
          examSessionId: input.examSessionId,
        });
      }

      // 6. Create the binding (actor from the ServiceContext only).
      const binding = await createExamGradeComponentBinding(
        {
          organizationId,
          examSessionId: input.examSessionId,
          assessmentComponentId: input.assessmentComponentId,
          createdById: userId,
        },
        tx
      );

      // 7. Event-only transition (no ExamSession status write).
      await recordExamTransition(this.context, tx, {
        aggregateType: EXAM_SESSION,
        aggregateId: input.examSessionId,
        eventType: ExamEventType.EXAM_SESSION_GRADE_COMPONENT_BOUND,
        entity: SESSION_ENTITY,
        previousStatus: "",
        newStatus: "BOUND",
        reason: input.reason ?? null,
        extraNew: {
          bindingId: binding.id,
          examSessionId: input.examSessionId,
          assessmentComponentId: input.assessmentComponentId,
          levelSubjectId: session.levelSubjectId,
        },
        metadata: {
          bindingId: binding.id,
          examSessionId: input.examSessionId,
          assessmentComponentId: input.assessmentComponentId,
          levelSubjectId: session.levelSubjectId,
        },
      });

      return {
        bindingId: binding.id,
        examSessionId: input.examSessionId,
        assessmentComponentId: input.assessmentComponentId,
      };
    });
  }
}

// ─── Archive a session's grade-component binding ──────────────────────────────

export class ArchiveExamSessionGradeComponentBindingCommand extends BaseCommand<
  unknown,
  ArchiveExamSessionGradeComponentBindingResult
> {
  async validate(): Promise<void> {
    const parsed = archiveExamSessionGradeComponentBindingSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeBinding(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<ArchiveExamSessionGradeComponentBindingResult> {
    const { organizationId } = this.context;
    const input = archiveExamSessionGradeComponentBindingSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Load the binding (org-scoped).
      const binding = await findExamGradeComponentBindingById(
        { organizationId, id: input.bindingId },
        tx
      );
      if (!binding) {
        throw new BusinessRuleError("EXAM_GRADE_BINDING_NOT_FOUND", { bindingId: input.bindingId });
      }

      // 2. Consumed guard — cannot archive once the session's results were integrated.
      if (await isSessionConsumed({ organizationId, examSessionId: binding.examSessionId }, tx)) {
        throw new BusinessRuleError("EXAM_GRADE_BINDING_ALREADY_CONSUMED", {
          examSessionId: binding.examSessionId,
        });
      }

      // 3. Conditional soft delete (only an active row matches → count 1).
      const { count } = await archiveExamGradeComponentBinding(
        { organizationId, id: input.bindingId },
        tx
      );
      if (count !== 1) {
        throw new BusinessRuleError("EXAM_GRADE_BINDING_CONCURRENTLY_CHANGED", {
          bindingId: input.bindingId,
        });
      }

      // 4. Event-only transition.
      await recordExamTransition(this.context, tx, {
        aggregateType: EXAM_SESSION,
        aggregateId: binding.examSessionId,
        eventType: ExamEventType.EXAM_SESSION_GRADE_COMPONENT_BINDING_ARCHIVED,
        entity: SESSION_ENTITY,
        previousStatus: "BOUND",
        newStatus: "UNBOUND",
        reason: input.reason,
        extraNew: {
          bindingId: binding.id,
          examSessionId: binding.examSessionId,
          assessmentComponentId: binding.assessmentComponentId,
        },
        metadata: {
          bindingId: binding.id,
          examSessionId: binding.examSessionId,
          assessmentComponentId: binding.assessmentComponentId,
        },
      });

      return {
        bindingId: binding.id,
        examSessionId: binding.examSessionId,
        archived: true,
      };
    });
  }
}
