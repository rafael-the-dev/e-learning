import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  ExamAppealStatus,
  ExamPeriodStatus,
  ExamResultStatus,
  ExamSessionStatus,
} from "@/modules/examinations/constants";
import { countExamPeriods } from "@/modules/examinations/repositories/exam-period.repository";
import { countExamSessions } from "@/modules/examinations/repositories/exam-session.repository";
import { countExamResults } from "@/modules/examinations/repositories/exam-result.repository";
import { countExamAppeals } from "@/modules/examinations/repositories/exam-appeal.repository";
import type { ExaminationOverviewDto } from "@/modules/examinations/types/portal";

// =============================================================================
// EXAMINATION ADMIN OVERVIEW SERVICE (Phase 12 §5) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// The admin dashboard KPIs. Each KPI is a tenant-scoped COUNT over an existing
// status column (a bounded, fixed set of parallel counts — NOT an N+1 over rows).
// Requires `exams.view`. It recalculates NO domain rule — it only counts facts the
// engine already persisted. The derived watchlists (room/invigilator conflicts,
// stale integrations, missing attendance) that need cross-entity scans belong to
// the dedicated Operations read service (a later increment), not here.
// =============================================================================

export class ExaminationAdminOverviewService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async getOverview(context: AuthContext): Promise<ExaminationOverviewDto> {
    this.assertCanView(context);
    const { organizationId } = context;
    const countPeriod = (status: string) => countExamPeriods({ organizationId, status });
    const countSession = (status: string) => countExamSessions({ organizationId, status });
    const countResult = (status: string) => countExamResults({ organizationId, status });
    const countAppeal = (status: string) => countExamAppeals({ organizationId, status });

    const [
      pDraft, pOpen, pLocked, pCompleted,
      sScheduled, sLocked, sInProgress, sCompleted, sRecorded, sPublished,
      rDraft, rSubmitted, rReviewed, rApproved, rPublished,
      aPending, aUnderReview,
    ] = await Promise.all([
      countPeriod(ExamPeriodStatus.DRAFT),
      countPeriod(ExamPeriodStatus.OPEN),
      countPeriod(ExamPeriodStatus.LOCKED),
      countPeriod(ExamPeriodStatus.COMPLETED),
      countSession(ExamSessionStatus.SCHEDULED),
      countSession(ExamSessionStatus.LOCKED),
      countSession(ExamSessionStatus.IN_PROGRESS),
      countSession(ExamSessionStatus.COMPLETED),
      countSession(ExamSessionStatus.RESULTS_RECORDED),
      countSession(ExamSessionStatus.PUBLISHED),
      countResult(ExamResultStatus.DRAFT),
      countResult(ExamResultStatus.SUBMITTED),
      countResult(ExamResultStatus.REVIEWED),
      countResult(ExamResultStatus.APPROVED),
      countResult(ExamResultStatus.PUBLISHED),
      countAppeal(ExamAppealStatus.PENDING),
      countAppeal(ExamAppealStatus.UNDER_REVIEW),
    ]);

    return {
      periods: { draft: pDraft, open: pOpen, locked: pLocked, completed: pCompleted },
      sessions: {
        scheduled: sScheduled,
        locked: sLocked,
        inProgress: sInProgress,
        completed: sCompleted,
        resultsRecorded: sRecorded,
        published: sPublished,
      },
      results: {
        draft: rDraft,
        submitted: rSubmitted,
        reviewed: rReviewed,
        approved: rApproved,
        published: rPublished,
      },
      appeals: { pending: aPending, underReview: aUnderReview },
    };
  }
}

export const examinationAdminOverviewService = new ExaminationAdminOverviewService();
