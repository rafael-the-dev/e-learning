import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import { findExamPeriodById } from "@/modules/examinations/repositories/exam-period.repository";
import { countExamSessions } from "@/modules/examinations/repositories/exam-session.repository";
import {
  listPeriodsForPortal,
  countPeriodsForPortal,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import type {
  ExamPeriodAdminListFilters,
  ExamPeriodDetailDto,
  ExamPeriodListItemDto,
  PortalListResult,
} from "@/modules/examinations/types/portal";
import {
  resolvePeriodCaps,
  toPeriodDetailDto,
  toPeriodListItemDto,
} from "./examination-portal.mapper";

// =============================================================================
// EXAM PERIOD ADMIN READ SERVICE (Phase 12) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Lists + details exam periods IN THE CALLER'S TENANT, with server-computed
// allowedActions. Requires `exams.view`. Makes NO business decision (no lifecycle,
// no eligibility), performs NO write, and reads only the ExamPeriod's own columns.
// =============================================================================

export class ExamPeriodAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async list(
    context: AuthContext,
    filters: ExamPeriodAdminListFilters = {}
  ): Promise<PortalListResult<ExamPeriodListItemDto>> {
    this.assertCanView(context);
    const { organizationId } = context;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    const repoFilters = {
      organizationId,
      status: filters.status,
      academicYear: filters.academicYear,
      search: filters.search,
    };

    const [rows, total] = await Promise.all([
      listPeriodsForPortal({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countPeriodsForPortal(repoFilters),
    ]);

    const caps = resolvePeriodCaps(context);
    return { items: rows.map((r) => toPeriodListItemDto(r, caps)), total, page, pageSize };
  }

  async getDetail(context: AuthContext, periodId: string): Promise<ExamPeriodDetailDto | null> {
    this.assertCanView(context);
    const { organizationId } = context;
    const record = await findExamPeriodById({ organizationId, id: periodId });
    if (!record) return null;
    const sessionCount = await countExamSessions({ organizationId, periodId });
    return toPeriodDetailDto(record, sessionCount, resolvePeriodCaps(context));
  }
}

export const examPeriodAdminReadService = new ExamPeriodAdminReadService();
