import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import {
  countExamSessions,
  findExamSessionById,
  listExamSessions,
} from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import { findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import type {
  ExamSessionAdminListFilters,
  ExamSessionDetailDto,
  ExamSessionListItemDto,
  PortalListResult,
} from "@/modules/examinations/types/portal";
import {
  resolveSessionCaps,
  toSessionDetailDto,
  toSessionListItemDto,
} from "./examination-portal.mapper";

// =============================================================================
// EXAM SESSION ADMIN READ SERVICE (Phase 12) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Lists + details exam sessions IN THE CALLER'S TENANT, with server-computed
// allowedActions. Requires `exams.view`. The list carries NO per-row roster counts
// (avoids N+1); the detail loads the single session's roster/attendance/result
// counts (bounded by session capacity). NO business decision, NO write.
// =============================================================================

export class ExamSessionAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async list(
    context: AuthContext,
    filters: ExamSessionAdminListFilters = {}
  ): Promise<PortalListResult<ExamSessionListItemDto>> {
    this.assertCanView(context);
    const { organizationId } = context;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    const repoFilters = {
      organizationId,
      periodId: filters.periodId,
      levelSubjectId: filters.levelSubjectId,
      roomId: filters.roomId,
      status: filters.status,
    };

    const [rows, total] = await Promise.all([
      listExamSessions({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countExamSessions(repoFilters),
    ]);

    const caps = resolveSessionCaps(context);
    return { items: rows.map((r) => toSessionListItemDto(r, caps)), total, page, pageSize };
  }

  async getDetail(context: AuthContext, sessionId: string): Promise<ExamSessionDetailDto | null> {
    this.assertCanView(context);
    const { organizationId } = context;
    const record = await findExamSessionById({ organizationId, id: sessionId });
    if (!record) return null;

    // Bounded, single-session counters (no N+1 — one session's roster).
    const [registered, attendance, results] = await Promise.all([
      listRegisteredCandidatesBySession({ organizationId, examSessionId: sessionId }),
      listAttendanceBySession({ organizationId, examSessionId: sessionId }),
      findResultsBySession({ organizationId, examSessionId: sessionId }),
    ]);

    return toSessionDetailDto(
      record,
      {
        registeredCandidateCount: registered.length,
        attendanceMarkedCount: attendance.length,
        resultCount: results.length,
      },
      resolveSessionCaps(context)
    );
  }
}

export const examSessionAdminReadService = new ExamSessionAdminReadService();
