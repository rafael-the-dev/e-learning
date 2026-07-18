import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import {
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  assertExamWriteCapability,
  enforceExamSessionWriteScope,
  RESULT_WRITE_ROLES,
} from "./execution-scope-shared";
import {
  ExamCandidateStatus,
  ExamEventAggregateType,
  ExamEventType,
  ExamResultCode,
  ExamResultStatus,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import {
  bulkCreateExamResultsSchema,
  bulkSubmitExamResultsSchema,
  createExamResultSchema,
  submitExamResultSchema,
  updateDraftExamResultSchema,
  type BulkCreateExamResultsInput,
  type BulkSubmitExamResultsInput,
  type CreateExamResultCommandInput,
  type SubmitExamResultInput,
  type UpdateDraftExamResultInput,
} from "@/modules/examinations/schemas/result-entry.schema";
import {
  findExamCandidateById,
  listCandidatesBySession,
} from "@/modules/examinations/repositories/exam-candidate.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { findAttendanceByCandidateId } from "@/modules/examinations/repositories/exam-attendance.repository";
import {
  createExamResult,
  findExamResultById,
  findResultByCandidateId,
  findResultsBySession,
  markExamResultSubmitted,
  updateDraftExamResultConditionally,
} from "@/modules/examinations/repositories/exam-result.repository";
import { recordExamTransition } from "./scheduling-shared";
import {
  deriveResultFacts,
  resultCodeForAttendance,
  toResultItemError,
  type BulkResultItemOutcome,
} from "./result-entry-shared";

// =============================================================================
// EXAMINATION ENGINE — EXAM RESULT-ENTRY COMMANDS (Phase 7)
// -----------------------------------------------------------------------------
// Records the OFFICIAL EXAM RESULT for a candidate up to DRAFT/SUBMITTED ONLY.
// This layer records exam FACTS — it does NOT calculate a final subject grade,
// decide pass/fail, touch StudentSubject/Level/Course progress, write a
// Transcript/Certificate, publish, review, approve, or run appeals (all later /
// out of scope). Every mutation follows the BaseCommand pattern (validate →
// authorize → execute in ONE db.$transaction) and writes ExamEvent + audit INSIDE
// the tx via `recordExamTransition` — there is NO domain-event bus / Outbox.
//
// • Create (perm exams.enterResults): the candidate must be REGISTERED and the
//   session IN_PROGRESS | COMPLETED, and attendance MUST already be marked (it is
//   never inferred). The attendance fact drives the resultCode; a duplicate is
//   rejected (RESULT_ALREADY_EXISTS, backed by the @unique examCandidateId — the
//   find-guard AND a P2002 both map to it). The row is created DRAFT.
// • Update-draft (perm exams.enterResults): edits a DRAFT result; re-derives the
//   resultCode / score / normalizedScore from the CURRENT attendance and writes
//   via a CONDITIONAL updateMany pinning status = 'DRAFT' (count === 1).
// • Submit (perm exams.submitResults): DRAFT → SUBMITTED; requires a COMPLETED
//   session and an internally-consistent row; conditional on status = 'DRAFT'.
// • Bulk create / submit: authorized ONCE up-front; a SELF-CONTAINED sequential
//   runner delegating the single command once per item, each in its OWN tx.
//
// Post-DRAFT immutability: the update/submit conditional writes pin status DRAFT,
// so a SUBMITTED/REVIEWED/APPROVED/PUBLISHED/INVALIDATED row is rejected (count 0).
// No ExamResultRevision logic here. NEVER mutates candidate/session status.
// Teacher assignment-scoped entry is DEFERRED (admin-only in Phase 7).
// =============================================================================

const RESULT = ExamEventAggregateType.EXAM_RESULT;
const ENTITY = "ExamResult";
const CANDIDATE_ENTITY = "ExamCandidate";
const SESSION_ENTITY = "ExamSession";

/** Sessions in which a result may be created / edited. */
const RESULT_OPEN_STATUSES: string[] = [
  ExamSessionStatus.IN_PROGRESS,
  ExamSessionStatus.COMPLETED,
];

/** True for a Prisma unique-constraint violation (the @unique examCandidateId). */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// ─── Create ──────────────────────────────────────────────────────────────────

/** DTO returned by `CreateExamResultCommand`. */
export interface CreateExamResultResult {
  examResultId: string;
  examCandidateId: string;
  examSessionId: string;
  status: string;
  resultCode: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
}

export class CreateExamResultCommand extends BaseCommand<
  CreateExamResultCommandInput,
  CreateExamResultResult
> {
  async validate(): Promise<void> {
    const parsed = createExamResultSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_ENTER_RESULTS);
  }

  async execute(): Promise<CreateExamResultResult> {
    const { organizationId, userId } = this.context;
    const input = createExamResultSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Candidate (org-scoped) — a missing / cross-tenant candidate is NotFound.
      const candidate = await findExamCandidateById(
        { organizationId, id: input.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, input.examCandidateId);

      // 2. Only a REGISTERED candidate receives a result.
      if (candidate.status !== ExamCandidateStatus.REGISTERED) {
        throw new BusinessRuleError("CANDIDATE_NOT_REGISTERED", {
          candidateStatus: candidate.status,
        });
      }

      // 3. Session-state gate (IN_PROGRESS | COMPLETED).
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      if (!RESULT_OPEN_STATUSES.includes(session.status)) {
        throw new BusinessRuleError("SESSION_NOT_OPEN_FOR_RESULTS", {
          sessionStatus: session.status,
        });
      }

      // 3b. Assignment-scoped write gate (ADR-017) — in-tx on the RESOLVED session.
      //     Admin (exams.enterResults) unchanged; a teacher must hold
      //     exams.executeAssignedSessions AND an active assignment on this session in
      //     a result-authorizing role (CHIEF | MARKER).
      await enforceExamSessionWriteScope(this.context, tx, {
        examSessionId: session.id,
        adminPermission: PERMISSIONS.EXAMS_ENTER_RESULTS,
        allowedRoles: RESULT_WRITE_ROLES,
      });

      // 4. Attendance MUST already be marked — never inferred / written here.
      const attendance = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: input.examCandidateId },
        tx
      );
      if (!attendance) throw new BusinessRuleError("ATTENDANCE_NOT_MARKED");

      // 5. Attendance fact drives the resultCode + score/normalization.
      const facts = deriveResultFacts({
        attendanceStatus: attendance.status,
        score: input.score,
        maxScore: input.maxScore,
        resultCode: input.resultCode,
        reason: input.reason,
      });

      // 6. One result per candidate — a duplicate is rejected, never overwritten.
      const existing = await findResultByCandidateId(
        { organizationId, examCandidateId: input.examCandidateId },
        tx
      );
      if (existing) {
        throw new BusinessRuleError("RESULT_ALREADY_EXISTS", { examResultId: existing.id });
      }

      // 7. Persist DRAFT. A racing insert (P2002 on the @unique) maps to the same rule.
      let result;
      try {
        result = await createExamResult(
          {
            organizationId,
            examCandidateId: input.examCandidateId,
            examAttemptId: candidate.examAttemptId,
            studentId: candidate.studentId,
            enrollmentId: candidate.enrollmentId,
            levelSubjectId: session.levelSubjectId,
            status: ExamResultStatus.DRAFT,
            resultCode: facts.resultCode,
            score: facts.score,
            maxScore: facts.maxScore,
            normalizedScore: facts.normalizedScore,
            markerId: userId,
            remarks: input.remarks ?? null,
          },
          tx
        );
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new BusinessRuleError("RESULT_ALREADY_EXISTS");
        }
        throw err;
      }

      // 8. ExamEvent + audit inside the tx (no bus). NO candidate/session mutation.
      await recordExamTransition(this.context, tx, {
        aggregateType: RESULT,
        aggregateId: result.id,
        eventType: ExamEventType.EXAM_RESULT_CREATED,
        entity: ENTITY,
        previousStatus: "",
        newStatus: ExamResultStatus.DRAFT,
        reason: input.reason ?? null,
        extraNew: {
          examResultId: result.id,
          candidateId: candidate.id,
          sessionId: session.id,
          studentId: candidate.studentId,
          resultCode: facts.resultCode,
          score: facts.score,
          maxScore: facts.maxScore,
          normalizedScore: facts.normalizedScore,
          markerId: userId,
          markedBy: userId,
          remarks: input.remarks ?? null,
        },
      });

      return {
        examResultId: result.id,
        examCandidateId: input.examCandidateId,
        examSessionId: session.id,
        status: ExamResultStatus.DRAFT,
        resultCode: facts.resultCode,
        score: facts.score,
        maxScore: facts.maxScore,
        normalizedScore: facts.normalizedScore,
      };
    });
  }
}

// ─── Update draft ────────────────────────────────────────────────────────────

/** DTO returned by `UpdateDraftExamResultCommand`. */
export interface UpdateDraftExamResultResult {
  examResultId: string;
  status: string;
  resultCode: string;
  score: number | null;
  maxScore: number;
  normalizedScore: number | null;
  updatedAt: Date;
}

export class UpdateDraftExamResultCommand extends BaseCommand<
  UpdateDraftExamResultInput,
  UpdateDraftExamResultResult
> {
  async validate(): Promise<void> {
    const parsed = updateDraftExamResultSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_ENTER_RESULTS);
  }

  async execute(): Promise<UpdateDraftExamResultResult> {
    const { organizationId } = this.context;
    const input = updateDraftExamResultSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Result (org-scoped) — a missing / cross-tenant result is NotFound.
      const result = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      if (!result) throw new NotFoundError(ENTITY, input.examResultId);

      // 2. Only a DRAFT result is editable here (post-DRAFT is immutable in Phase 7).
      if (result.status !== ExamResultStatus.DRAFT) {
        throw new BusinessRuleError("RESULT_NOT_DRAFT", { resultStatus: result.status });
      }

      // 2b. Assignment-scoped write gate (ADR-017): resolve the CANONICAL session via
      //     result → candidate → session (never a client-supplied sessionId), then
      //     enforce in-tx.
      const candidate = await findExamCandidateById(
        { organizationId, id: result.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, result.examCandidateId);
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      await enforceExamSessionWriteScope(this.context, tx, {
        examSessionId: session.id,
        adminPermission: PERMISSIONS.EXAMS_ENTER_RESULTS,
        allowedRoles: RESULT_WRITE_ROLES,
      });

      // 3. Re-load the CURRENT attendance fact — a correction may have changed it.
      const attendance = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: result.examCandidateId },
        tx
      );
      if (!attendance) throw new BusinessRuleError("ATTENDANCE_NOT_MARKED");

      // 4. Re-derive + validate against the resolved (patched-or-existing) values.
      const resolvedMaxScore = input.maxScore ?? result.maxScore;
      const resolvedScore = input.score ?? result.score;
      const resolvedRemarks = input.remarks ?? result.remarks;
      const facts = deriveResultFacts({
        attendanceStatus: attendance.status,
        score: resolvedScore,
        maxScore: resolvedMaxScore,
        resultCode: input.resultCode,
        reason: input.reason,
      });

      // 5. Conditional write pinning status = 'DRAFT' (race-safe / post-DRAFT lock).
      const updated = await updateDraftExamResultConditionally(
        {
          organizationId,
          id: input.examResultId,
          patch: {
            score: facts.score,
            maxScore: facts.maxScore,
            normalizedScore: facts.normalizedScore,
            resultCode: facts.resultCode,
            remarks: resolvedRemarks,
          },
        },
        tx
      );
      if (updated.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamResultStatus.DRAFT,
        });
      }

      // 6. ExamEvent + audit inside the tx — before/after values preserved.
      await recordExamTransition(this.context, tx, {
        aggregateType: RESULT,
        aggregateId: result.id,
        eventType: ExamEventType.EXAM_RESULT_UPDATED,
        entity: ENTITY,
        previousStatus: ExamResultStatus.DRAFT,
        newStatus: ExamResultStatus.DRAFT,
        reason: input.reason ?? null,
        extraOld: {
          score: result.score,
          maxScore: result.maxScore,
          normalizedScore: result.normalizedScore,
          resultCode: result.resultCode,
          remarks: result.remarks,
        },
        extraNew: {
          examResultId: result.id,
          score: facts.score,
          maxScore: facts.maxScore,
          normalizedScore: facts.normalizedScore,
          resultCode: facts.resultCode,
          remarks: resolvedRemarks,
        },
      });

      const after = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      return {
        examResultId: result.id,
        status: ExamResultStatus.DRAFT,
        resultCode: facts.resultCode,
        score: facts.score,
        maxScore: facts.maxScore,
        normalizedScore: facts.normalizedScore,
        updatedAt: after?.updatedAt ?? result.updatedAt,
      };
    });
  }
}

// ─── Submit ────────────────────────────────────────────────────────────────────

/** DTO returned by `SubmitExamResultCommand`. */
export interface SubmitExamResultResult {
  examResultId: string;
  status: string;
  submittedAt: Date;
}

export class SubmitExamResultCommand extends BaseCommand<
  SubmitExamResultInput,
  SubmitExamResultResult
> {
  async validate(): Promise<void> {
    const parsed = submitExamResultSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_SUBMIT_RESULTS);
  }

  async execute(): Promise<SubmitExamResultResult> {
    const { organizationId, userId } = this.context;
    const input = submitExamResultSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      // 1. Result (org-scoped) — missing / cross-tenant is NotFound.
      const result = await findExamResultById({ organizationId, id: input.examResultId }, tx);
      if (!result) throw new NotFoundError(ENTITY, input.examResultId);

      // 2. The owning session must be COMPLETED (resolved via the candidate).
      const candidate = await findExamCandidateById(
        { organizationId, id: result.examCandidateId },
        tx
      );
      if (!candidate) throw new NotFoundError(CANDIDATE_ENTITY, result.examCandidateId);
      const session = await findExamSessionById(
        { organizationId, id: candidate.examSessionId },
        tx
      );
      if (!session) throw new NotFoundError(SESSION_ENTITY, candidate.examSessionId);
      if (session.status !== ExamSessionStatus.COMPLETED) {
        throw new BusinessRuleError("SESSION_NOT_COMPLETED", { sessionStatus: session.status });
      }

      // 2b. Assignment-scoped write gate (ADR-017) — in-tx on the RESOLVED session.
      await enforceExamSessionWriteScope(this.context, tx, {
        examSessionId: session.id,
        adminPermission: PERMISSIONS.EXAMS_SUBMIT_RESULTS,
        allowedRoles: RESULT_WRITE_ROLES,
      });

      // 3. Internal-consistency check (no re-derivation — the row must already agree).
      const isScored = result.resultCode === ExamResultCode.SCORED;
      const consistent = isScored
        ? result.score !== null && result.maxScore !== null && result.normalizedScore !== null
        : result.score === null && result.normalizedScore === null;
      if (!consistent) {
        throw new BusinessRuleError("RESULT_INCOMPLETE", { resultCode: result.resultCode });
      }

      // 4. Staleness gate — submit FREEZES; it VALIDATES against the current
      //    attendance fact but NEVER re-derives / mutates the draft. If attendance
      //    was corrected after the draft was recorded (e.g. PRESENT→ABSENT) and the
      //    draft was not re-edited, the frozen resultCode would contradict the
      //    authoritative attendance fact — that submit is rejected (RESULT_STALE),
      //    forcing an explicit update-draft first. Attendance is never inferred.
      const attendance = await findAttendanceByCandidateId(
        { organizationId, examCandidateId: result.examCandidateId },
        tx
      );
      if (!attendance) throw new BusinessRuleError("ATTENDANCE_NOT_MARKED");
      const expectedResultCode = resultCodeForAttendance(attendance.status);
      if (expectedResultCode !== result.resultCode) {
        throw new BusinessRuleError("RESULT_STALE", {
          attendanceStatus: attendance.status,
          expectedResultCode,
          currentResultCode: result.resultCode,
        });
      }

      // 5. Conditional DRAFT → SUBMITTED (markerId preserved — not overwritten).
      const submittedAt = new Date();
      const marked = await markExamResultSubmitted(
        { organizationId, id: input.examResultId, submittedAt },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError("RESULT_CONCURRENTLY_CHANGED", {
          expectedStatus: ExamResultStatus.DRAFT,
        });
      }

      // 6. ExamEvent + audit inside the tx. The submitter is recorded in the
      //    metadata (the schema has no `submittedById` column).
      await recordExamTransition(this.context, tx, {
        aggregateType: RESULT,
        aggregateId: result.id,
        eventType: ExamEventType.EXAM_RESULT_SUBMITTED,
        entity: ENTITY,
        previousStatus: ExamResultStatus.DRAFT,
        newStatus: ExamResultStatus.SUBMITTED,
        reason: input.reason ?? null,
        extraNew: {
          examResultId: result.id,
          candidateId: candidate.id,
          sessionId: session.id,
          studentId: candidate.studentId,
          submittedAt,
          submittedBy: userId,
          markerId: result.markerId,
        },
      });

      return {
        examResultId: result.id,
        status: ExamResultStatus.SUBMITTED,
        submittedAt,
      };
    });
  }
}

// ─── Bulk (self-contained sequential runners) ────────────────────────────────

/** Per-item outcome of a bulk-create run (keyed by candidate). */
export interface BulkCreateResultItem extends BulkResultItemOutcome {
  examCandidateId: string;
}

/** DTO returned by `BulkCreateExamResultsCommand`. Invariant:
 *  `total === succeeded + failed + skipped`. */
export interface BulkCreateExamResultsResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkCreateResultItem[];
}

export class BulkCreateExamResultsCommand extends BaseCommand<
  BulkCreateExamResultsInput,
  BulkCreateExamResultsResult
> {
  async validate(): Promise<void> {
    const parsed = bulkCreateExamResultsSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    // Authorized ONCE up-front; each delegated command also re-checks (defence in depth).
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_ENTER_RESULTS);
  }

  async execute(): Promise<BulkCreateExamResultsResult> {
    const { organizationId } = this.context;
    const input = bulkCreateExamResultsSchema.parse(this.input);
    const items: BulkCreateResultItem[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let stop = false;

    // Session-membership set — every item MUST belong to the indicated session
    // (the `examSessionId` contract is enforced, not decorative). A candidate from
    // another session (or a missing / soft-deleted one) is not a valid target and
    // is failed per-item as CANDIDATE_NOT_IN_SESSION — it never reaches the single
    // command. Loaded once for the whole batch (org-scoped, live candidates only).
    const sessionCandidateIds = new Set(
      (await listCandidatesBySession({ organizationId, examSessionId: input.examSessionId })).map(
        (c) => c.id
      )
    );

    for (const item of input.items) {
      if (stop) {
        items.push({
          examCandidateId: item.examCandidateId,
          ok: false,
          code: "SKIPPED",
          message: "Ignorado após uma falha anterior (stopOnFailure).",
        });
        skipped += 1;
        continue;
      }

      if (!sessionCandidateIds.has(item.examCandidateId)) {
        items.push({
          examCandidateId: item.examCandidateId,
          ok: false,
          code: "CANDIDATE_NOT_IN_SESSION",
          message: "O candidato não pertence à sessão indicada.",
        });
        failed += 1;
        if (input.stopOnFailure) stop = true;
        continue;
      }

      try {
        // Re-use the single command; it opens its OWN transaction (no shared tx).
        await new CreateExamResultCommand(
          {
            examCandidateId: item.examCandidateId,
            score: item.score,
            maxScore: item.maxScore,
            resultCode: item.resultCode,
            remarks: item.remarks,
            reason: item.reason,
          },
          this.context
        ).run();
        items.push({ examCandidateId: item.examCandidateId, ok: true });
        succeeded += 1;
      } catch (err) {
        const { code, message } = toResultItemError(err);
        items.push({ examCandidateId: item.examCandidateId, ok: false, code, message });
        failed += 1;
        if (input.stopOnFailure) stop = true;
      }
    }

    return { total: input.items.length, succeeded, failed, skipped, items };
  }
}

/** Per-item outcome of a bulk-submit run (keyed by result). */
export interface BulkSubmitResultItem extends BulkResultItemOutcome {
  examResultId: string;
}

/** DTO returned by `BulkSubmitExamResultsCommand`. Invariant:
 *  `total === succeeded + failed + skipped`. */
export interface BulkSubmitExamResultsResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  items: BulkSubmitResultItem[];
}

export class BulkSubmitExamResultsCommand extends BaseCommand<
  BulkSubmitExamResultsInput,
  BulkSubmitExamResultsResult
> {
  async validate(): Promise<void> {
    const parsed = bulkSubmitExamResultsSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await assertExamWriteCapability(this.context, PERMISSIONS.EXAMS_SUBMIT_RESULTS);
  }

  async execute(): Promise<BulkSubmitExamResultsResult> {
    const { organizationId } = this.context;
    const input = bulkSubmitExamResultsSchema.parse(this.input);
    const items: BulkSubmitResultItem[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let stop = false;

    // Session-membership set — every result MUST belong to the indicated session
    // (via its candidate). A result from another session (or a missing one) is
    // failed per-item as RESULT_NOT_IN_SESSION and never reaches the single command.
    // Loaded once for the whole batch (org-scoped; live candidates of the session).
    const sessionResultIds = new Set(
      (await findResultsBySession({ organizationId, examSessionId: input.examSessionId })).map(
        (r) => r.id
      )
    );

    for (const item of input.items) {
      if (stop) {
        items.push({
          examResultId: item.examResultId,
          ok: false,
          code: "SKIPPED",
          message: "Ignorado após uma falha anterior (stopOnFailure).",
        });
        skipped += 1;
        continue;
      }

      if (!sessionResultIds.has(item.examResultId)) {
        items.push({
          examResultId: item.examResultId,
          ok: false,
          code: "RESULT_NOT_IN_SESSION",
          message: "O resultado não pertence à sessão indicada.",
        });
        failed += 1;
        if (input.stopOnFailure) stop = true;
        continue;
      }

      try {
        await new SubmitExamResultCommand(
          { examResultId: item.examResultId, reason: item.reason },
          this.context
        ).run();
        items.push({ examResultId: item.examResultId, ok: true });
        succeeded += 1;
      } catch (err) {
        const { code, message } = toResultItemError(err);
        items.push({ examResultId: item.examResultId, ok: false, code, message });
        failed += 1;
        if (input.stopOnFailure) stop = true;
      }
    }

    return { total: input.items.length, succeeded, failed, skipped, items };
  }
}
