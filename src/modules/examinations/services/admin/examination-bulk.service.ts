import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExamAttendanceStatus } from "@/modules/examinations/constants";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { MarkExamCandidateAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import { runBulk, type BulkSummary } from "@/modules/examinations/lib/bulk-runner";

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
}

export const examinationBulkService = new ExaminationBulkService();
