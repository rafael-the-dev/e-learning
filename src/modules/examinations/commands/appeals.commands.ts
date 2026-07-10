import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import {
  ExamAppealStatus,
  ExamEventAggregateType,
  ExamEventType,
  ExamResultRevisionSourceType,
  ExamResultRevisionStatus,
  ExamResultStatus,
} from "@/modules/examinations/constants";
import {
  approveExamAppealSchema,
  createExamAppealSchema,
  rejectExamAppealSchema,
  reviewExamAppealSchema,
  withdrawExamAppealSchema,
  type ApproveExamAppealInput,
  type CreateExamAppealCommandInput,
  type RejectExamAppealInput,
  type ReviewExamAppealInput,
  type WithdrawExamAppealInput,
} from "@/modules/examinations/schemas/appeal.schema";
import {
  createExamAppeal,
  findActiveAppealByResult,
  findExamAppealById,
  markAppealApproved,
  markAppealRejected,
  markAppealUnderReview,
  markAppealWithdrawn,
} from "@/modules/examinations/repositories/exam-appeal.repository";
import {
  findExamResultById,
  updateExamResultCurrentRevision,
} from "@/modules/examinations/repositories/exam-result.repository";
import {
  clearCurrentRevisionForResult,
  createExamResultRevision,
  listRevisionsByResult,
} from "@/modules/examinations/repositories/exam-result-revision.repository";
import { recordExamTransition } from "./scheduling-shared";
import type {
  ApproveAppealResult,
  CreateAppealResult,
  RejectAppealResult,
  ReviewAppealResult,
  WithdrawAppealResult,
} from "./appeals-shared";

// =============================================================================
// EXAMINATION ENGINE — APPEALS & RESULT-REVISION COMMANDS (Phase 10)
// -----------------------------------------------------------------------------
// The post-publication recourse workflow (D4 / D14). An appeal NEVER edits an
// ExamResult in place: every accepted correction is an APPEND-ONLY ExamResultRevision
// and there is exactly ONE CURRENT revision per result (a filtered-unique index in the
// migration). The OFFICIAL result is the projection ExamResult + currentRevision — the
// only mutation Phase 10 makes on ExamResult is repointing `currentRevisionId`; its
// score / maxScore / normalizedScore / resultCode / status / publishedAt / marker /
// reviewer / approver columns are left exactly as approved. This layer does NOT
// calculate a final subject grade, decide pass/fail, touch StudentSubject / Level /
// Course progress, write a Transcript / Certificate, or (re)publish a session. Every
// mutation follows the BaseCommand pattern (validate → authorize → execute in ONE
// db.$transaction) and writes ExamEvent + AuditLog INSIDE the tx via
// `recordExamTransition` — there is NO domain-event bus / Outbox (Phase 14).
//
// • Create (perm exams.createAppeal): a PUBLISHED result may be appealed once at a
//   time. A linked Student may appeal only their OWN result (ownership resolved from
//   the acting Student, never from input); a non-student admin skips the ownership
//   pin. A second active (PENDING | UNDER_REVIEW) appeal is blocked.
// • Review (perm exams.reviewAppeal): PENDING → UNDER_REVIEW (admin triage).
// • Approve (perm exams.approveAppeal): UNDER_REVIEW → APPROVED. Creates the next
//   append-only CURRENT ExamResultRevision (clear-then-create under the filtered-unique
//   index), repoints the result's currentRevisionId, and stamps the decision — all in
//   one tx. Revision creation is INTERNAL to approve (there is NO standalone
//   route-exposed revision command).
// • Reject (perm exams.rejectAppeal): UNDER_REVIEW → REJECTED. NO revision, NO result
//   mutation — the official result is unchanged.
// • Withdraw (perm exams.withdrawAppeal): PENDING → WITHDRAWN. Student-owned (same
//   ownership pin as create); only before review opens.
//
// Concurrency: every mark is a CONDITIONAL updateMany pinning the expected status, so
// a concurrently-moved row matches zero rows (APPEAL_ / RESULT_CONCURRENTLY_CHANGED).
// Actor / student ids come only from the ServiceContext — never from input.
// =============================================================================

const APPEAL = ExamEventAggregateType.EXAM_APPEAL;
const REVISION = ExamEventAggregateType.EXAM_RESULT_REVISION;
const APPEAL_ENTITY = "ExamAppeal";
const REVISION_ENTITY = "ExamResultRevision";
const RESULT_ENTITY = "ExamResult";

async function authorize(
  userId: string,
  organizationId: string,
  permission: Permission
): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(permission)) {
    throw new AuthorizationError();
  }
}

/** The acting Student's id when the current user is a linked student, else null.
 *  `null` means the caller is not a student (an admin) — ownership is then skipped. */
async function resolveActingStudentId(
  organizationId: string,
  userId: string
): Promise<string | null> {
  return (await getStudentByUserId(organizationId, userId))?.id ?? null;
}

// ─── Create ────────────────────────────────────────────────────────────────────

export class CreateExamAppealCommand extends BaseCommand<
  CreateExamAppealCommandInput,
  CreateAppealResult
> {
  async validate(): Promise<void> {
    const parsed = createExamAppealSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_CREATE_APPEAL);
  }

  async execute(): Promise<CreateAppealResult> {
    const { organizationId, userId } = this.context;
    const input = createExamAppealSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Result (org-scoped) — missing / cross-tenant is NotFound.
      const result = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      if (!result) throw new NotFoundError(RESULT_ENTITY, input.examResultId);

      // 2. Ownership: a linked Student may appeal only their OWN result. A non-student
      //    admin has actingStudentId === null and skips this pin.
      const actingStudentId = await resolveActingStudentId(organizationId, userId);
      if (actingStudentId !== null && result.studentId !== actingStudentId) {
        throw new AuthorizationError();
      }

      // 3. Only a PUBLISHED result is appealable.
      if (result.status !== ExamResultStatus.PUBLISHED) {
        throw new BusinessRuleError("APPEAL_RESULT_NOT_PUBLISHED", { resultStatus: result.status });
      }

      // 4. A single active appeal at a time (PENDING | UNDER_REVIEW).
      const active = await findActiveAppealByResult(
        { organizationId, examResultId: input.examResultId },
        tx
      );
      if (active) {
        throw new BusinessRuleError("APPEAL_ALREADY_EXISTS", { appealId: active.id });
      }

      // 5. Create the PENDING appeal. studentId / requestedById are NEVER from input —
      //    the student is the result owner, the requester is the acting user.
      const appeal = await createExamAppeal(
        {
          organizationId,
          examResultId: input.examResultId,
          studentId: result.studentId,
          requestedById: userId,
          reason: input.reason,
          status: ExamAppealStatus.PENDING,
        },
        tx
      );

      // 6. ExamEvent + audit inside the tx (no bus).
      await recordExamTransition(this.context, tx, {
        aggregateType: APPEAL,
        aggregateId: appeal.id,
        eventType: ExamEventType.EXAM_APPEAL_CREATED,
        entity: APPEAL_ENTITY,
        previousStatus: "",
        newStatus: ExamAppealStatus.PENDING,
        reason: input.reason,
        extraNew: {
          appealId: appeal.id,
          examResultId: input.examResultId,
          studentId: result.studentId,
          requestedById: userId,
          reason: input.reason,
        },
      });

      return {
        appealId: appeal.id,
        status: ExamAppealStatus.PENDING,
        reason: input.reason,
        createdAt: appeal.createdAt,
      };
    });
  }
}

// ─── Review ────────────────────────────────────────────────────────────────────

export class ReviewExamAppealCommand extends BaseCommand<ReviewExamAppealInput, ReviewAppealResult> {
  async validate(): Promise<void> {
    const parsed = reviewExamAppealSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_REVIEW_APPEAL);
  }

  async execute(): Promise<ReviewAppealResult> {
    const { organizationId } = this.context;
    const input = reviewExamAppealSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Appeal (org-scoped) — missing / cross-tenant is NotFound.
      const appeal = await findExamAppealById({ organizationId, id: input.appealId }, tx);
      if (!appeal) throw new NotFoundError(APPEAL_ENTITY, input.appealId);

      // 2. Only a PENDING appeal may open review.
      if (appeal.status !== ExamAppealStatus.PENDING) {
        throw new BusinessRuleError("APPEAL_NOT_PENDING", { appealStatus: appeal.status });
      }

      // 3. Conditional PENDING → UNDER_REVIEW.
      const marked = await markAppealUnderReview({ organizationId, id: appeal.id }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError("APPEAL_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamAppealStatus.PENDING,
        });
      }

      // 4. ExamEvent + audit inside the tx (no bus).
      const reviewedAt = new Date();
      await recordExamTransition(this.context, tx, {
        aggregateType: APPEAL,
        aggregateId: appeal.id,
        eventType: ExamEventType.EXAM_APPEAL_REVIEWED,
        entity: APPEAL_ENTITY,
        previousStatus: ExamAppealStatus.PENDING,
        newStatus: ExamAppealStatus.UNDER_REVIEW,
        reason: input.reason ?? null,
        extraNew: { appealId: appeal.id, examResultId: appeal.examResultId, reviewedAt },
      });

      return { appealId: appeal.id, status: ExamAppealStatus.UNDER_REVIEW, reviewedAt };
    });
  }
}

// ─── Approve ─────────────────────────────────────────────────────────────────

export class ApproveExamAppealCommand extends BaseCommand<
  ApproveExamAppealInput,
  ApproveAppealResult
> {
  async validate(): Promise<void> {
    const parsed = approveExamAppealSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_APPROVE_APPEAL);
  }

  async execute(): Promise<ApproveAppealResult> {
    const { organizationId, userId } = this.context;
    const input = approveExamAppealSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Appeal (org-scoped) — missing / cross-tenant is NotFound.
      const appeal = await findExamAppealById({ organizationId, id: input.appealId }, tx);
      if (!appeal) throw new NotFoundError(APPEAL_ENTITY, input.appealId);
      if (appeal.status !== ExamAppealStatus.UNDER_REVIEW) {
        throw new BusinessRuleError("APPEAL_NOT_UNDER_REVIEW", { appealStatus: appeal.status });
      }

      // 2. Result (org-scoped) — must still be PUBLISHED to append a correction.
      const result = await findExamResultById({ organizationId, id: appeal.examResultId }, tx);
      if (!result) throw new NotFoundError(RESULT_ENTITY, appeal.examResultId);
      if (result.status !== ExamResultStatus.PUBLISHED) {
        throw new BusinessRuleError("APPEAL_RESULT_NOT_PUBLISHED", { resultStatus: result.status });
      }

      // 3. Bound the revised score by the result's own maxScore.
      if (!(result.maxScore > 0)) {
        throw new BusinessRuleError("MAX_SCORE_INVALID", { maxScore: result.maxScore });
      }
      if (input.revisedScore < 0 || input.revisedScore > result.maxScore) {
        throw new BusinessRuleError("SCORE_OUT_OF_RANGE", {
          revisedScore: input.revisedScore,
          maxScore: result.maxScore,
        });
      }

      // 4. Resolve the append-only chain: previous score is the current revision's
      //    revised score (if any) else the base result's score; the next number is
      //    max(existing) + 1 (so numbering is 1-based, monotonic, never reused).
      const revisions = await listRevisionsByResult(
        { organizationId, examResultId: result.id },
        tx
      );
      const currentRevision = revisions.find((r) => r.isCurrent) ?? null;
      const previousScore = currentRevision?.revisedScore ?? result.score;
      const revisionNumber = revisions.reduce((m, r) => Math.max(m, r.revisionNumber), 0) + 1;

      // 5. Clear any existing CURRENT before creating the new one — the single-CURRENT
      //    filtered-unique index forbids two `isCurrent = true` rows per result.
      await clearCurrentRevisionForResult({ organizationId, examResultId: result.id }, tx);

      // 6. Append the new CURRENT revision (SCORE correction only — the model has no
      //    normalizedScore / resultCode columns; revisedStatus mirrors the result's
      //    unchanged lifecycle status).
      const revision = await createExamResultRevision(
        {
          organizationId,
          examResultId: result.id,
          revisionNumber,
          reason: input.reason,
          sourceType: ExamResultRevisionSourceType.APPEAL,
          previousScore,
          revisedScore: input.revisedScore,
          previousStatus: result.status,
          revisedStatus: result.status,
          status: ExamResultRevisionStatus.CURRENT,
          isCurrent: true,
          createdById: userId,
        },
        tx
      );

      // 7. Repoint the result's currentRevisionId (the ONLY ExamResult mutation).
      const updated = await updateExamResultCurrentRevision(
        { organizationId, id: result.id, currentRevisionId: revision.id },
        tx
      );
      if (updated.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", { examResultId: result.id });
      }

      // 8. Conditional UNDER_REVIEW → APPROVED (stamps the decision).
      const marked = await markAppealApproved(
        {
          organizationId,
          id: appeal.id,
          decidedById: userId,
          decidedAt: new Date(),
          decisionReason: input.reason,
        },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("APPEAL_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamAppealStatus.UNDER_REVIEW,
        });
      }

      // 9. ExamEvents + audit inside the tx (no bus): the revision creation, then the
      //    appeal decision.
      await recordExamTransition(this.context, tx, {
        aggregateType: REVISION,
        aggregateId: revision.id,
        eventType: ExamEventType.EXAM_RESULT_REVISION_CREATED,
        entity: REVISION_ENTITY,
        previousStatus: "",
        newStatus: ExamResultRevisionStatus.CURRENT,
        reason: input.reason,
        extraNew: {
          revisionId: revision.id,
          examResultId: result.id,
          revisionNumber,
          previousScore,
          revisedScore: input.revisedScore,
          sourceType: ExamResultRevisionSourceType.APPEAL,
          createdById: userId,
        },
      });

      await recordExamTransition(this.context, tx, {
        aggregateType: APPEAL,
        aggregateId: appeal.id,
        eventType: ExamEventType.EXAM_APPEAL_APPROVED,
        entity: APPEAL_ENTITY,
        previousStatus: ExamAppealStatus.UNDER_REVIEW,
        newStatus: ExamAppealStatus.APPROVED,
        reason: input.reason,
        extraNew: {
          appealId: appeal.id,
          examResultId: result.id,
          revisionId: revision.id,
          decidedById: userId,
          reason: input.reason,
        },
      });

      return { appealId: appeal.id, revisionId: revision.id, status: ExamAppealStatus.APPROVED };
    });
  }
}

// ─── Reject ────────────────────────────────────────────────────────────────────

export class RejectExamAppealCommand extends BaseCommand<RejectExamAppealInput, RejectAppealResult> {
  async validate(): Promise<void> {
    const parsed = rejectExamAppealSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_REJECT_APPEAL);
  }

  async execute(): Promise<RejectAppealResult> {
    const { organizationId, userId } = this.context;
    const input = rejectExamAppealSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Appeal (org-scoped) — missing / cross-tenant is NotFound.
      const appeal = await findExamAppealById({ organizationId, id: input.appealId }, tx);
      if (!appeal) throw new NotFoundError(APPEAL_ENTITY, input.appealId);
      if (appeal.status !== ExamAppealStatus.UNDER_REVIEW) {
        throw new BusinessRuleError("APPEAL_NOT_UNDER_REVIEW", { appealStatus: appeal.status });
      }

      // 2. Conditional UNDER_REVIEW → REJECTED. NO revision, NO result mutation — the
      //    official result is unchanged.
      const marked = await markAppealRejected(
        {
          organizationId,
          id: appeal.id,
          decidedById: userId,
          decidedAt: new Date(),
          decisionReason: input.reason,
        },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("APPEAL_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamAppealStatus.UNDER_REVIEW,
        });
      }

      // 3. ExamEvent + audit inside the tx (no bus).
      await recordExamTransition(this.context, tx, {
        aggregateType: APPEAL,
        aggregateId: appeal.id,
        eventType: ExamEventType.EXAM_APPEAL_REJECTED,
        entity: APPEAL_ENTITY,
        previousStatus: ExamAppealStatus.UNDER_REVIEW,
        newStatus: ExamAppealStatus.REJECTED,
        reason: input.reason,
        extraNew: {
          appealId: appeal.id,
          examResultId: appeal.examResultId,
          decidedById: userId,
          reason: input.reason,
        },
      });

      return { appealId: appeal.id, status: ExamAppealStatus.REJECTED };
    });
  }
}

// ─── Withdraw ────────────────────────────────────────────────────────────────

export class WithdrawExamAppealCommand extends BaseCommand<
  WithdrawExamAppealInput,
  WithdrawAppealResult
> {
  async validate(): Promise<void> {
    const parsed = withdrawExamAppealSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_WITHDRAW_APPEAL);
  }

  async execute(): Promise<WithdrawAppealResult> {
    const { organizationId, userId } = this.context;
    const input = withdrawExamAppealSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Appeal (org-scoped) — missing / cross-tenant is NotFound.
      const appeal = await findExamAppealById({ organizationId, id: input.appealId }, tx);
      if (!appeal) throw new NotFoundError(APPEAL_ENTITY, input.appealId);

      // 2. Ownership: a linked Student may withdraw only their OWN appeal. A non-student
      //    admin has actingStudentId === null and skips this pin.
      const actingStudentId = await resolveActingStudentId(organizationId, userId);
      if (actingStudentId !== null && appeal.studentId !== actingStudentId) {
        throw new AuthorizationError();
      }

      // 3. Only a PENDING appeal may be withdrawn (before review opens).
      if (appeal.status !== ExamAppealStatus.PENDING) {
        throw new BusinessRuleError("APPEAL_NOT_PENDING", { appealStatus: appeal.status });
      }

      // 4. Conditional PENDING → WITHDRAWN (stamps closedAt).
      const closedAt = new Date();
      const marked = await markAppealWithdrawn({ organizationId, id: appeal.id, closedAt }, tx);
      if (marked.count !== 1) {
        throw new BusinessRuleError("APPEAL_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamAppealStatus.PENDING,
        });
      }

      // 5. ExamEvent + audit inside the tx (no bus).
      await recordExamTransition(this.context, tx, {
        aggregateType: APPEAL,
        aggregateId: appeal.id,
        eventType: ExamEventType.EXAM_APPEAL_WITHDRAWN,
        entity: APPEAL_ENTITY,
        previousStatus: ExamAppealStatus.PENDING,
        newStatus: ExamAppealStatus.WITHDRAWN,
        reason: input.reason ?? null,
        extraNew: {
          appealId: appeal.id,
          examResultId: appeal.examResultId,
          studentId: appeal.studentId,
          closedAt,
          reason: input.reason ?? null,
        },
      });

      return { appealId: appeal.id, status: ExamAppealStatus.WITHDRAWN };
    });
  }
}
