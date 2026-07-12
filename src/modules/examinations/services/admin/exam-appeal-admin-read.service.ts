import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import { findExamAppealById } from "@/modules/examinations/repositories/exam-appeal.repository";
import { findExamResultById } from "@/modules/examinations/repositories/exam-result.repository";
import { listRevisionsByResult } from "@/modules/examinations/repositories/exam-result-revision.repository";
import {
  listResultsByIds,
  listStudentDisplayByIds,
  listSubjectNamesByLevelSubjectIds,
  listAppealsForPortal,
  countAppealsForPortal,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import { resolveOfficialExamResult } from "@/modules/examinations/commands/appeals-shared";
import type { ExamOfficialResultDto } from "@/modules/examinations/types/portal";
import type {
  ExamAppealAdminListFilters,
  ExamAppealDetailDto,
  ExamAppealListItemDto,
  PortalListResult,
} from "@/modules/examinations/types/portal";
import { computeAppealAllowedActions, resolveAppealCaps } from "./examination-portal.mapper";

// =============================================================================
// EXAM APPEAL ADMIN READ SERVICE (Phase 12 §8) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Appeal list (org-wide) + detail with the ORIGINAL vs CURRENT-OFFICIAL result
// overlay (Phase-10 resolver) and the append-only revision chain. Requires
// `exams.view`. Exposes NO raw ExamEvent metadata, NO document numbers, NO Grade
// entities. No writes — review/approve/reject go through the commands.
//
// Filter push-down: `status` + `studentId` + `search` are DB-filtered + paginated via the
// portal read (search = one OR across student name/number + subject + session title, a
// single query + matching count). `examSessionId` / `levelSubjectId` / `createdFrom` /
// `createdTo` are accepted for forward-compatibility but not yet DB-pushed.
// =============================================================================

const reasonSummary = (reason: string): string =>
  reason.length > 140 ? `${reason.slice(0, 137)}…` : reason;

export class ExamAppealAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async list(
    context: AuthContext,
    filters: ExamAppealAdminListFilters = {}
  ): Promise<PortalListResult<ExamAppealListItemDto>> {
    this.assertCanView(context);
    const { organizationId } = context;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    const repoFilters = { organizationId, status: filters.status, studentId: filters.studentId, search: filters.search };
    const [appeals, total] = await Promise.all([
      listAppealsForPortal({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countAppealsForPortal(repoFilters),
    ]);

    // Batch the result → levelSubject → subject + student display + current scores.
    const resultIds = [...new Set(appeals.map((a) => a.examResultId))];
    const studentIds = [...new Set(appeals.map((a) => a.studentId))];
    const results = await listResultsByIds(organizationId, resultIds);
    const resultById = new Map(results.map((r) => [r.id, r]));
    const levelSubjectIds = [...new Set(results.map((r) => r.levelSubjectId))];
    const [students, subjects] = await Promise.all([
      listStudentDisplayByIds(organizationId, studentIds),
      listSubjectNamesByLevelSubjectIds(organizationId, levelSubjectIds),
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const subjectByLevelSubject = new Map(subjects.map((s) => [s.levelSubjectId, s.subjectName]));

    const caps = resolveAppealCaps(context);
    const items = appeals.map((a): ExamAppealListItemDto => {
      const result = resultById.get(a.examResultId) ?? null;
      const student = studentById.get(a.studentId) ?? null;
      const subjectName = result ? subjectByLevelSubject.get(result.levelSubjectId) ?? null : null;
      // Current official score: the result's own score (base). Revision overlay is
      // shown on the detail view; the list surfaces the base official score.
      const currentOfficialScore = result?.score ?? null;
      return {
        appealId: a.id,
        examResultId: a.examResultId,
        examSessionId: null,
        studentId: a.studentId,
        studentNumber: student?.code ?? null,
        studentName: student ? `${student.firstName} ${student.lastName}` : null,
        subjectName,
        status: a.status,
        reasonSummary: reasonSummary(a.reason),
        createdAt: a.createdAt,
        decidedAt: a.decidedAt,
        currentOfficialScore,
        allowedActions: computeAppealAllowedActions(a.status, caps),
      };
    });

    return { items, total, page, pageSize };
  }

  async getDetail(context: AuthContext, appealId: string): Promise<ExamAppealDetailDto | null> {
    this.assertCanView(context);
    const { organizationId } = context;
    const appeal = await findExamAppealById({ organizationId, id: appealId });
    if (!appeal) return null;

    const [result, revisions] = await Promise.all([
      findExamResultById({ organizationId, id: appeal.examResultId }),
      listRevisionsByResult({ organizationId, examResultId: appeal.examResultId }),
    ]);
    const currentRevision = revisions.find((r) => r.isCurrent) ?? null;

    let originalResult: ExamOfficialResultDto | null = null;
    let currentOfficialResult: ExamOfficialResultDto | null = null;
    if (result) {
      const base = resolveOfficialExamResult({ result, currentRevision: null });
      const current = resolveOfficialExamResult({ result, currentRevision });
      originalResult = { source: "BASE", score: base.score, normalizedScore: base.normalizedScore, resultCode: base.resultCode };
      currentOfficialResult = {
        source: current.hasRevision ? "REVISION" : "BASE",
        score: current.score,
        normalizedScore: current.normalizedScore,
        resultCode: current.resultCode,
      };
    }

    const caps = resolveAppealCaps(context);
    return {
      appealId: appeal.id,
      examResultId: appeal.examResultId,
      status: appeal.status,
      reason: appeal.reason,
      decision: appeal.decision,
      decisionReason: appeal.decisionReason,
      createdAt: appeal.createdAt,
      decidedAt: appeal.decidedAt,
      closedAt: appeal.closedAt,
      originalResult,
      currentOfficialResult,
      revisions: revisions.map((r) => ({
        revisionId: r.id,
        revisionNumber: r.revisionNumber,
        previousScore: r.previousScore,
        revisedScore: r.revisedScore,
        sourceType: r.sourceType,
        isCurrent: r.isCurrent,
        createdAt: r.createdAt,
      })),
      ownership: { studentId: appeal.studentId, requestedById: appeal.requestedById },
      allowedActions: computeAppealAllowedActions(appeal.status, caps),
    };
  }
}

export const examAppealAdminReadService = new ExamAppealAdminReadService();
