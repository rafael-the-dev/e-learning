import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  ExamAttemptStatus,
  ExamCandidateStatus,
  ExamEventAggregateType,
  ExamEventType,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import { loadExaminationEligibilityFacts } from "@/modules/examinations/services/examination-eligibility-source.service";
import { evaluateExaminationEligibility } from "@/modules/examinations/services/examination-eligibility.engine";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import {
  createExamAttempt,
  getNextAttemptNumberCandidate,
} from "@/modules/examinations/repositories/exam-attempt.repository";
import {
  countActiveCandidatesBySession,
  createExamCandidate,
  findActiveCandidateBySessionSeat,
  findActiveCandidateBySessionStudent,
} from "@/modules/examinations/repositories/exam-candidate.repository";
import { recordExamTransition } from "./scheduling-shared";

// =============================================================================
// EXAMINATION CANDIDATE REGISTRATION — SHARED COMMAND CORE (Phase 5)
// -----------------------------------------------------------------------------
// The single register/override path both `RegisterExamCandidateCommand` and
// `OverrideExamCandidateEligibilityCommand` run inside ONE db.$transaction. It:
//   1. loads the session (org-scoped) → NotFound if missing/cross-tenant;
//   2. gates on session state (register: SCHEDULED only; override: SCHEDULED|LOCKED);
//   3. loads facts (Phase 3A) and runs the PURE engine (Phase 3B) — it NEVER
//      re-implements an eligibility rule; register rejects on !eligible /
//      requiresApproval, override bypasses ELIGIBILITY ONLY and records provenance;
//   4. enforces the OPERATIONAL blockers for BOTH modes (duplicate / capacity /
//      seat) — override does NOT bypass these (E-3a; capacity + seat are documented
//      read-check race windows, backstopped by the DB filtered-unique indexes);
//   5. creates the ExamAttempt (status OPEN, attemptNumber via getNext…; a
//      filtered-unique violation maps to ATTEMPT_NUMBER_CONFLICT — never reused);
//   6. creates the ExamCandidate with the REAL engine verdict as eligibilityStatus
//      (never falsified) + the eligibilitySnapshot provenance;
//   7. writes ExamEvent + audit INSIDE the tx via `recordExamTransition` (override
//      emits eligibility_overridden THEN registered) — NO domain-event bus (Phase 14).
// =============================================================================

const CANDIDATE = ExamEventAggregateType.EXAM_CANDIDATE;
const ENTITY = "ExamCandidate";

/** Registration mode — normal vs eligibility-override. */
export type RegistrationMode = "REGISTER" | "OVERRIDE";

/** Shared input both register + override resolve (server-owned ids excluded). */
export interface RegistrationCoreInput {
  examSessionId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  assignedSeat?: string;
  reason?: string;
}

/** DTO returned by the register / override commands. Carries the engine verdict
 *  and provenance flags — NO raw facts and NO stored snapshot string. */
export interface RegisterExamCandidateResult {
  examCandidateId: string;
  examAttemptId: string;
  attemptNumber: number;
  examSessionId: string;
  status: string;
  eligibilityStatus: string;
  requiresApproval: boolean;
  blockingReasons: string[];
  warnings: string[];
  overridden: boolean;
}

/** True for a Prisma unique-constraint violation (filtered-unique attemptNumber). */
function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Session states in which a registration may open, by mode. Override allows LOCKED
 *  (late registration); a normal register requires an open SCHEDULED session. */
function openStatusesFor(mode: RegistrationMode): string[] {
  return mode === "OVERRIDE"
    ? [ExamSessionStatus.SCHEDULED, ExamSessionStatus.LOCKED]
    : [ExamSessionStatus.SCHEDULED];
}

export async function runRegistration(
  context: ServiceContext,
  input: RegistrationCoreInput,
  mode: RegistrationMode
): Promise<RegisterExamCandidateResult> {
  const { organizationId, userId } = context;
  const overridden = mode === "OVERRIDE";
  const db = await getDb();

  return db.$transaction(async (tx: PrismaClientOrTx) => {
    // 1. Session (org-scoped) — a missing / cross-tenant session is NotFound.
    const session = await findExamSessionById({ id: input.examSessionId, organizationId }, tx);
    if (!session) throw new NotFoundError("ExamSession", input.examSessionId);

    // 2. Session-state gate (register: SCHEDULED; override: SCHEDULED|LOCKED).
    if (!openStatusesFor(mode).includes(session.status)) {
      throw new BusinessRuleError("SESSION_NOT_OPEN_FOR_REGISTRATION", {
        sessionStatus: session.status,
      });
    }

    // 3. Eligibility — Phase 3A facts + Phase 3B pure engine (rules NOT re-implemented).
    const facts = await loadExaminationEligibilityFacts(
      {
        organizationId,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        levelSubjectId: input.levelSubjectId,
        examSessionId: input.examSessionId,
        examPeriodId: session.periodId,
      },
      tx
    );
    const result = evaluateExaminationEligibility(facts);

    if (!overridden) {
      if (!result.eligible) {
        throw new BusinessRuleError("ELIGIBILITY_BLOCKED", {
          blockingReasons: result.blockingReasons,
          warnings: result.warnings,
        });
      }
      if (result.requiresApproval) {
        throw new BusinessRuleError("MANUAL_APPROVAL_REQUIRED", {
          warnings: result.warnings,
        });
      }
    }

    // 4. Operational blockers — BOTH modes (override bypasses ELIGIBILITY ONLY).
    const duplicate = await findActiveCandidateBySessionStudent(
      { organizationId, examSessionId: input.examSessionId, studentId: input.studentId },
      tx
    );
    if (duplicate) {
      throw new BusinessRuleError("ALREADY_REGISTERED", { candidateId: duplicate.id });
    }

    // Capacity is a read-then-write check → a NARROW read-race window (two concurrent
    // registrations could both pass); the DB is the backstop (ADR-013 E-3a / §6).
    const activeCount = await countActiveCandidatesBySession(
      { organizationId, examSessionId: input.examSessionId },
      tx
    );
    if (activeCount >= session.capacity) {
      throw new BusinessRuleError("SESSION_FULL", {
        capacity: session.capacity,
        activeCount,
      });
    }

    if (input.assignedSeat) {
      // Seat uniqueness is likewise a documented read-check race window.
      const seatHolder = await findActiveCandidateBySessionSeat(
        { organizationId, examSessionId: input.examSessionId, assignedSeat: input.assignedSeat },
        tx
      );
      if (seatHolder) {
        throw new BusinessRuleError("SEAT_UNAVAILABLE", { assignedSeat: input.assignedSeat });
      }
    }

    // 5. ExamAttempt (status OPEN). attemptNumber is a candidate suggestion; a
    //    filtered-unique collision is mapped to a typed error — never silently reused.
    const attemptNumber = await getNextAttemptNumberCandidate(
      { organizationId, enrollmentId: input.enrollmentId, levelSubjectId: input.levelSubjectId },
      tx
    );
    let attempt;
    try {
      attempt = await createExamAttempt(
        {
          organizationId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
          levelSubjectId: input.levelSubjectId,
          attemptNumber,
          status: ExamAttemptStatus.OPEN,
          source: overridden ? "REGISTRATION_OVERRIDE" : "REGISTRATION",
        },
        tx
      );
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new BusinessRuleError("ATTEMPT_NUMBER_CONFLICT", { attemptNumber });
      }
      throw err;
    }

    // 6. eligibilitySnapshot — the engine verdict verbatim + (override) the provenance.
    const eligibilitySnapshot = JSON.stringify({
      evaluated: {
        eligible: result.eligible,
        blockingReasons: result.blockingReasons,
        warnings: result.warnings,
        requiresApproval: result.requiresApproval,
        evaluatedAt: result.evaluatedAt,
        engineVersion: result.metadata.engineVersion,
      },
      override: overridden
        ? {
            overridden: true,
            overriddenBy: userId,
            overrideReason: input.reason,
            originalBlockingReasons: result.blockingReasons,
            originalRequiresApproval: result.requiresApproval,
          }
        : null,
    });

    // The engine verdict is NEVER falsified: an overridden candidate keeps its real
    // ELIGIBLE/INELIGIBLE eligibilityStatus; only the operational status is REGISTERED.
    const eligibilityStatus = result.eligible
      ? ExamCandidateStatus.ELIGIBLE
      : ExamCandidateStatus.INELIGIBLE;

    const candidate = await createExamCandidate(
      {
        organizationId,
        examSessionId: input.examSessionId,
        examAttemptId: attempt.id,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        eligibilityStatus,
        status: ExamCandidateStatus.REGISTERED,
        assignedSeat: input.assignedSeat ?? null,
        registeredAt: new Date(),
        registeredById: userId,
        overriddenById: overridden ? userId : null,
        overrideReason: overridden ? input.reason ?? null : null,
        eligibilitySnapshot,
      },
      tx
    );

    // 7. ExamEvent + audit (inside the tx). Override emits eligibility_overridden
    //    THEN registered; a rollback discards both events + the audit rows.
    const auditNew = {
      candidateId: candidate.id,
      sessionId: session.id,
      attemptId: attempt.id,
      attemptNumber,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      levelSubjectId: input.levelSubjectId,
      blockingReasons: result.blockingReasons,
      warnings: result.warnings,
      overridden,
      reason: input.reason ?? null,
      assignedSeat: input.assignedSeat ?? null,
    };

    if (overridden) {
      await recordExamTransition(context, tx, {
        aggregateType: CANDIDATE,
        aggregateId: candidate.id,
        eventType: ExamEventType.EXAM_CANDIDATE_ELIGIBILITY_OVERRIDDEN,
        entity: ENTITY,
        previousStatus: eligibilityStatus,
        newStatus: ExamCandidateStatus.REGISTERED,
        reason: input.reason ?? null,
        extraNew: auditNew,
      });
    }

    await recordExamTransition(context, tx, {
      aggregateType: CANDIDATE,
      aggregateId: candidate.id,
      eventType: ExamEventType.EXAM_CANDIDATE_REGISTERED,
      entity: ENTITY,
      previousStatus: "",
      newStatus: ExamCandidateStatus.REGISTERED,
      reason: input.reason ?? null,
      extraNew: auditNew,
    });

    return {
      examCandidateId: candidate.id,
      examAttemptId: attempt.id,
      attemptNumber,
      examSessionId: session.id,
      status: candidate.status,
      eligibilityStatus: candidate.eligibilityStatus,
      requiresApproval: result.requiresApproval,
      blockingReasons: result.blockingReasons,
      warnings: result.warnings,
      overridden,
    };
  });
}
