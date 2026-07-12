import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExamAttendanceStatus, ExamResultStatus } from "@/modules/examinations/constants";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import { MarkExamCandidateAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import {
  CreateExamResultCommand,
  UpdateDraftExamResultCommand,
  SubmitExamResultCommand,
} from "@/modules/examinations/commands/result-entry.commands";
import {
  ReviewExamResultCommand,
  ApproveExamResultCommand,
} from "@/modules/examinations/commands/result-review.commands";
import { runBulk, type BulkSummary } from "@/modules/examinations/lib/bulk-runner";

/** One draft-result edit in a bulk upsert. `examResultId` present ⇒ update, else create. */
export interface BulkResultInput {
  examCandidateId: string;
  examResultId?: string | null;
  resultCode?: string;
  score?: number | null;
  maxScore: number;
  remarks?: string;
}

/** Target selection for a bulk lifecycle op: explicit ids, OR all eligible in-session. */
export interface BulkResultTarget {
  examResultIds?: string[];
  allMatching?: boolean;
}

// =============================================================================
// EXAMINATION BULK SERVICE (Sprint UX 2.1) — neutral portal orchestration
// -----------------------------------------------------------------------------
// One place that turns a "do this to many" request into a BulkOperationRunner run
// over the EXISTING single commands. No new domain rules. Each method only:
//   (1) fails fast on the coarse permission, (2) resolves the target set
//   server-side (NOT the UI's loaded page), (3) provides a command factory + ref
//   + skip-codes to runBulk. Attendance first; results / registration reuse the
//   identical shape.
// =============================================================================

export class ExaminationBulkService {
  /**
   * Mark EVERY registered candidate of a session in one status (default PRESENT).
   * Resolves the whole registered set server-side, so it is NOT limited to the
   * rows the UI happened to load. Already-marked candidates are SKIPPED (never
   * overwritten) — the single Mark command enforces that; here it just classifies.
   */
  async markAllAttendance(
    context: AuthContext,
    examSessionId: string,
    status: string = ExamAttendanceStatus.PRESENT
  ): Promise<BulkSummary> {
    if (!context.ability.can(PERMISSIONS.EXAMS_MARK_ATTENDANCE)) throw new AuthorizationError();
    const { organizationId } = context;

    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const candidates = await listRegisteredCandidatesBySession({ organizationId, examSessionId });

    return runBulk({
      items: candidates,
      ref: (c) => c.id,
      run: (c) =>
        new MarkExamCandidateAttendanceCommand({ examCandidateId: c.id, status }, context).run(),
      // Already-present candidates are a benign skip, not a failure ("já tinham presença").
      skipCodes: ["ATTENDANCE_ALREADY_MARKED"],
    });
  }

  // ── Results: bulk create/update DRAFT ──────────────────────────────────────
  /** Create or update DRAFT results in one call. Per item: examResultId ⇒ update, else
   *  create. Every failure is a real failure — nothing is skip-classified here (a bad
   *  score / mismatch is a genuine problem the secretary must see). */
  async bulkUpsertResults(
    context: AuthContext,
    examSessionId: string,
    items: BulkResultInput[]
  ): Promise<BulkSummary> {
    if (!context.ability.can(PERMISSIONS.EXAMS_ENTER_RESULTS)) throw new AuthorizationError();
    await this.assertSession(context, examSessionId);
    return runBulk<BulkResultInput, unknown>({
      items,
      ref: (it) => it.examResultId ?? it.examCandidateId,
      run: (it) =>
        it.examResultId
          ? new UpdateDraftExamResultCommand(
              { examResultId: it.examResultId, score: it.score ?? undefined, maxScore: it.maxScore, resultCode: it.resultCode, remarks: it.remarks },
              context
            ).run()
          : new CreateExamResultCommand(
              { examCandidateId: it.examCandidateId, score: it.score ?? undefined, maxScore: it.maxScore, resultCode: it.resultCode, remarks: it.remarks },
              context
            ).run(),
    });
  }

  // ── Results: bulk submit / review / approve ────────────────────────────────
  async bulkSubmitResults(context: AuthContext, examSessionId: string, target: BulkResultTarget): Promise<BulkSummary> {
    if (!context.ability.can(PERMISSIONS.EXAMS_SUBMIT_RESULTS)) throw new AuthorizationError();
    const ids = await this.resolveResultIds(context, examSessionId, target, ExamResultStatus.DRAFT);
    return runBulk({
      items: ids,
      ref: (id) => id,
      run: (id) => new SubmitExamResultCommand({ examResultId: id }, context).run(),
      // Already-past-DRAFT is a benign skip; incompleteness / no-attendance stay FAILED.
      skipCodes: ["RESULT_NOT_DRAFT"],
    });
  }

  async bulkReviewResults(context: AuthContext, examSessionId: string, target: BulkResultTarget): Promise<BulkSummary> {
    if (!context.ability.can(PERMISSIONS.EXAMS_REVIEW_RESULTS)) throw new AuthorizationError();
    const ids = await this.resolveResultIds(context, examSessionId, target, ExamResultStatus.SUBMITTED);
    return runBulk({
      items: ids,
      ref: (id) => id,
      run: (id) => new ReviewExamResultCommand({ examResultId: id }, context).run(),
      // Wrong-state is a skip; SELF_REVIEW_NOT_ALLOWED / MARKER_REQUIRED stay FAILED.
      skipCodes: ["RESULT_NOT_SUBMITTED"],
    });
  }

  async bulkApproveResults(context: AuthContext, examSessionId: string, target: BulkResultTarget): Promise<BulkSummary> {
    if (!context.ability.can(PERMISSIONS.EXAMS_APPROVE_RESULTS)) throw new AuthorizationError();
    const ids = await this.resolveResultIds(context, examSessionId, target, ExamResultStatus.REVIEWED);
    return runBulk({
      items: ids,
      ref: (id) => id,
      run: (id) => new ApproveExamResultCommand({ examResultId: id }, context).run(),
      // Wrong-state is a skip; APPROVER_IS_MARKER / APPROVER_IS_REVIEWER stay FAILED (two-eyes).
      skipCodes: ["RESULT_NOT_REVIEWED"],
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  private async assertSession(context: AuthContext, examSessionId: string): Promise<void> {
    const session = await findExamSessionById({ organizationId: context.organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);
  }

  /** Explicit ids win; otherwise "all matching" resolves the session's results in the
   *  operation's eligible state (server-side — NOT the UI's loaded page). */
  private async resolveResultIds(
    context: AuthContext,
    examSessionId: string,
    target: BulkResultTarget,
    eligibleStatus: string
  ): Promise<string[]> {
    if (target.examResultIds && target.examResultIds.length > 0) return target.examResultIds;
    if (!target.allMatching) return [];
    await this.assertSession(context, examSessionId);
    const results = await findResultsBySession({ organizationId: context.organizationId, examSessionId });
    return results.filter((r) => r.status === eligibleStatus).map((r) => r.id);
  }
}

export const examinationBulkService = new ExaminationBulkService();
