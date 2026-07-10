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
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  ExamCandidateStatus,
  ExamEventAggregateType,
  ExamEventType,
} from "@/modules/examinations/constants";
import {
  disqualifyExamCandidateSchema,
  withdrawExamCandidateSchema,
  type DisqualifyExamCandidateInput,
  type WithdrawExamCandidateInput,
} from "@/modules/examinations/schemas/registration.schema";
import {
  findExamCandidateById,
  markExamCandidateDisqualified,
  markExamCandidateWithdrawn,
} from "@/modules/examinations/repositories/exam-candidate.repository";
import { recordExamTransition } from "./scheduling-shared";

// =============================================================================
// EXAMINATION ENGINE — CANDIDATE STATUS COMMANDS (Phase 5)
// -----------------------------------------------------------------------------
// Withdraw / disqualify a REGISTERED candidate. Both authorize
// `exams.registerCandidates`, load the candidate org-scoped (→ NotFound), and mark
// it via a CONDITIONAL `updateMany` pinning `status = 'REGISTERED'`; the command
// asserts `count === 1` (a double-op / concurrently-moved row ⇒ `count 0` ⇒
// BusinessRuleError). ExamEvent + audit are written INSIDE the tx (no bus). No
// eligibility engine runs here — a status change is not an eligibility decision.
// =============================================================================

const CANDIDATE = ExamEventAggregateType.EXAM_CANDIDATE;
const ENTITY = "ExamCandidate";

/** DTO returned by the withdraw / disqualify commands. */
export interface CandidateStatusResult {
  examCandidateId: string;
  status: string;
}

async function authorizeRegister(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_REGISTER_CANDIDATES)) {
    throw new AuthorizationError();
  }
}

// ─── Withdraw ────────────────────────────────────────────────────────────────

export class WithdrawExamCandidateCommand extends BaseCommand<
  WithdrawExamCandidateInput,
  CandidateStatusResult
> {
  async validate(): Promise<void> {
    const parsed = withdrawExamCandidateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeRegister(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<CandidateStatusResult> {
    const { organizationId, userId } = this.context;
    const { examCandidateId, reason } = withdrawExamCandidateSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const candidate = await findExamCandidateById({ organizationId, id: examCandidateId }, tx);
      if (!candidate) throw new NotFoundError(ENTITY, examCandidateId);

      const marked = await markExamCandidateWithdrawn(
        { organizationId, id: examCandidateId, withdrawnById: userId },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a REGISTERED candidate can be withdrawn (current status: ${candidate.status}).`,
          { candidateStatus: candidate.status }
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: CANDIDATE,
        aggregateId: examCandidateId,
        eventType: ExamEventType.EXAM_CANDIDATE_WITHDRAWN,
        entity: ENTITY,
        previousStatus: candidate.status,
        newStatus: ExamCandidateStatus.WITHDRAWN,
        reason: reason ?? null,
        extraNew: { candidateId: examCandidateId, studentId: candidate.studentId, reason: reason ?? null },
      });

      return { examCandidateId, status: ExamCandidateStatus.WITHDRAWN };
    });
  }
}

// ─── Disqualify ────────────────────────────────────────────────────────────────

export class DisqualifyExamCandidateCommand extends BaseCommand<
  DisqualifyExamCandidateInput,
  CandidateStatusResult
> {
  async validate(): Promise<void> {
    const parsed = disqualifyExamCandidateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeRegister(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<CandidateStatusResult> {
    const { organizationId, userId } = this.context;
    const { examCandidateId, reason } = disqualifyExamCandidateSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx) => {
      const candidate = await findExamCandidateById({ organizationId, id: examCandidateId }, tx);
      if (!candidate) throw new NotFoundError(ENTITY, examCandidateId);

      const marked = await markExamCandidateDisqualified(
        { organizationId, id: examCandidateId, disqualifiedById: userId, disqualificationReason: reason },
        tx
      );
      if (marked.count !== 1) {
        throw new BusinessRuleError(
          `Only a REGISTERED candidate can be disqualified (current status: ${candidate.status}).`,
          { candidateStatus: candidate.status }
        );
      }

      await recordExamTransition(this.context, tx, {
        aggregateType: CANDIDATE,
        aggregateId: examCandidateId,
        eventType: ExamEventType.EXAM_CANDIDATE_DISQUALIFIED,
        entity: ENTITY,
        previousStatus: candidate.status,
        newStatus: ExamCandidateStatus.DISQUALIFIED,
        reason,
        extraNew: { candidateId: examCandidateId, studentId: candidate.studentId, reason },
      });

      return { examCandidateId, status: ExamCandidateStatus.DISQUALIFIED };
    });
  }
}
