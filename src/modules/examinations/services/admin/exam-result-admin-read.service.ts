import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import {
  findExamCandidateById,
  listRegisteredCandidatesBySession,
} from "@/modules/examinations/repositories/exam-candidate.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import {
  findExamResultById,
  findResultsBySession,
} from "@/modules/examinations/repositories/exam-result.repository";
import { listRevisionsByResult } from "@/modules/examinations/repositories/exam-result-revision.repository";
import {
  listCurrentRevisionsByResultIds,
  listStudentDisplayByIds,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import { resolveOfficialExamResult } from "@/modules/examinations/commands/appeals-shared";
import type {
  ExamAttendanceRecord,
  ExamResultRecord,
  ExamResultRevisionRecord,
} from "@/modules/examinations/types/repository";
import type {
  ExamOfficialResultDto,
  ExamResultAdminListFilters,
  ExamResultDetailDto,
  ExamResultListItemDto,
  PortalListResult,
} from "@/modules/examinations/types/portal";
import { computeResultAllowedActions, resolveResultCaps } from "./examination-portal.mapper";

// =============================================================================
// EXAM RESULT ADMIN READ SERVICE (Phase 12 §6) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Session-scoped result roster (marked + unmarked candidates) + single-result
// detail. The OFFICIAL result overlay is the Phase-10 resolver
// (`resolveOfficialExamResult`) — `normalizedScore` is the EXAM PERCENTAGE (0–100),
// NOT a final subject grade, and this service NEVER calculates a final grade or a
// pass/fail. Batched (no N+1). Requires `exams.view`. No writes.
// =============================================================================

/** Overlay the current official result (Phase-10 resolver). The list path avoids
 *  loading the full revision chain: it reconstructs the minimal fields the resolver
 *  reads (`revisedScore` overrides `score`; the % is recomputed from maxScore for a
 *  SCORED result) — single source of truth for the overlay math. */
function toOfficialDto(
  result: ExamResultRecord,
  currentRevision: ExamResultRevisionRecord | null
): ExamOfficialResultDto {
  const view = resolveOfficialExamResult({ result, currentRevision });
  return {
    source: view.hasRevision ? "REVISION" : "BASE",
    score: view.score,
    normalizedScore: view.normalizedScore,
    resultCode: view.resultCode,
  };
}

/** Build a minimal ExamResultRevisionRecord carrying only the fields the resolver
 *  reads, from the batched current-revision projection (list path). */
function reviveRevision(
  examResultId: string,
  proj: { revisionId: string; revisionNumber: number; revisedScore: number | null } | null
): ExamResultRevisionRecord | null {
  if (!proj) return null;
  return {
    id: proj.revisionId,
    organizationId: "",
    examResultId,
    revisionNumber: proj.revisionNumber,
    previousScore: null,
    revisedScore: proj.revisedScore,
    previousStatus: null,
    revisedStatus: null,
    reason: "",
    sourceType: "",
    status: "",
    isCurrent: true,
    createdById: null,
    approvedById: null,
    approvedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export class ExamResultAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async listBySession(
    context: AuthContext,
    examSessionId: string,
    filters: ExamResultAdminListFilters = {}
  ): Promise<PortalListResult<ExamResultListItemDto>> {
    this.assertCanView(context);
    const { organizationId } = context;
    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const [roster, results, attendance] = await Promise.all([
      listRegisteredCandidatesBySession({ organizationId, examSessionId }),
      findResultsBySession({ organizationId, examSessionId }),
      listAttendanceBySession({ organizationId, examSessionId }),
    ]);
    const resultByCandidate = new Map<string, ExamResultRecord>(results.map((r) => [r.examCandidateId, r]));
    const attendanceByCandidate = new Map<string, ExamAttendanceRecord>(
      attendance.map((a) => [a.examCandidateId, a])
    );

    // Batch the current revisions for the session's results (no N+1).
    const revProjections = await listCurrentRevisionsByResultIds(
      organizationId,
      results.map((r) => r.id)
    );
    const revByResult = new Map(revProjections.map((p) => [p.examResultId, p]));

    const studentIds = [...new Set(roster.map((c) => c.studentId))];
    const students = await listStudentDisplayByIds(organizationId, studentIds);
    const studentById = new Map(students.map((s) => [s.id, s]));

    const caps = resolveResultCaps(context);
    const search = filters.search?.trim().toLowerCase();

    const allItems = roster.map((candidate): ExamResultListItemDto => {
      const result = resultByCandidate.get(candidate.id) ?? null;
      const att = attendanceByCandidate.get(candidate.id) ?? null;
      const student = studentById.get(candidate.studentId) ?? null;
      const official = result
        ? toOfficialDto(result, reviveRevision(result.id, revByResult.get(result.id) ?? null))
        : null;
      return {
        examResultId: result?.id ?? null,
        examCandidateId: candidate.id,
        examSessionId,
        studentNumber: student?.code ?? null,
        studentName: student ? `${student.firstName} ${student.lastName}` : null,
        attendanceStatus: att?.status ?? null,
        resultStatus: result?.status ?? null,
        resultCode: result?.resultCode ?? null,
        score: result?.score ?? null,
        maxScore: result?.maxScore ?? null,
        normalizedScore: result?.normalizedScore ?? null,
        markerId: result?.markerId ?? null,
        reviewedById: result?.reviewedById ?? null,
        approvedById: result?.approvedById ?? null,
        submittedAt: result?.submittedAt ?? null,
        reviewedAt: result?.reviewedAt ?? null,
        approvedAt: result?.approvedAt ?? null,
        publishedAt: result?.publishedAt ?? null,
        currentRevisionId: result?.currentRevisionId ?? null,
        officialResult: official,
        allowedActions: computeResultAllowedActions(result?.status ?? null, session.status, caps),
      };
    });

    const filtered = allItems.filter((item) => {
      if (filters.status && item.resultStatus !== filters.status) return false;
      if (filters.resultCode && item.resultCode !== filters.resultCode) return false;
      if (filters.attendanceStatus && item.attendanceStatus !== filters.attendanceStatus) return false;
      if (filters.markerId && item.markerId !== filters.markerId) return false;
      if (filters.reviewerId && item.reviewedById !== filters.reviewerId) return false;
      if (filters.approverId && item.approvedById !== filters.approverId) return false;
      if (search) {
        const hay = `${item.studentName ?? ""} ${item.studentNumber ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const total = filtered.length;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
    const items = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    return { items, total, page, pageSize };
  }

  async getDetail(context: AuthContext, examResultId: string): Promise<ExamResultDetailDto | null> {
    this.assertCanView(context);
    const { organizationId } = context;
    const result = await findExamResultById({ organizationId, id: examResultId });
    if (!result) return null;

    const [candidate, revisions] = await Promise.all([
      findExamCandidateById({ organizationId, id: result.examCandidateId }),
      listRevisionsByResult({ organizationId, examResultId }),
    ]);
    const session = candidate
      ? await findExamSessionById({ organizationId, id: candidate.examSessionId })
      : null;
    const currentRevision = revisions.find((r) => r.isCurrent) ?? null;
    const student = candidate
      ? (await listStudentDisplayByIds(organizationId, [candidate.studentId]))[0] ?? null
      : null;

    const caps = resolveResultCaps(context);
    return {
      examResultId: result.id,
      examCandidateId: result.examCandidateId,
      examSessionId: candidate?.examSessionId ?? "",
      studentNumber: student?.code ?? null,
      studentName: student ? `${student.firstName} ${student.lastName}` : null,
      attendanceStatus: null,
      resultStatus: result.status,
      resultCode: result.resultCode,
      score: result.score,
      maxScore: result.maxScore,
      normalizedScore: result.normalizedScore,
      markerId: result.markerId,
      reviewedById: result.reviewedById,
      approvedById: result.approvedById,
      submittedAt: result.submittedAt,
      reviewedAt: result.reviewedAt,
      approvedAt: result.approvedAt,
      publishedAt: result.publishedAt,
      currentRevisionId: result.currentRevisionId,
      officialResult: toOfficialDto(result, currentRevision),
      allowedActions: computeResultAllowedActions(result.status, session?.status ?? "", caps),
      remarks: result.remarks,
      revisions: revisions.map((r) => ({
        revisionId: r.id,
        revisionNumber: r.revisionNumber,
        previousScore: r.previousScore,
        revisedScore: r.revisedScore,
        sourceType: r.sourceType,
        isCurrent: r.isCurrent,
        createdAt: r.createdAt,
      })),
      appeal: null,
    };
  }
}

export const examResultAdminReadService = new ExamResultAdminReadService();
