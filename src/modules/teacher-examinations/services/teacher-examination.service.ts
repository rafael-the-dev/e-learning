import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import {
  listAssignedSessions,
  countAssignedSessions,
  findAssignedSession,
  loadSessionsProgress,
  listSessionCandidates,
  listAssignedSessionFacets,
  type TeacherSessionRow,
  type TeacherSessionProgressRow,
  type TeacherSessionFacets,
} from "@/modules/teacher-examinations/repositories/teacher-exam.repository";
import { resultCodeForAttendance } from "@/modules/examinations/commands/result-entry-shared";
import type {
  TeacherCandidateRow,
} from "@/modules/teacher-examinations/repositories/teacher-exam.repository";
import type {
  TeacherExamAttendanceViewDto,
  TeacherExamCapabilitiesDto,
  TeacherExamOverviewDto,
  TeacherExamResultsViewDto,
  TeacherExamSessionDetailDto,
  TeacherExamSessionFilters,
  TeacherExamSessionListItemDto,
  TeacherExamSessionPageDto,
  TeacherResultCandidateCapabilitiesDto,
  TeacherResultRowDto,
} from "@/modules/teacher-examinations/types";

// =============================================================================
// TEACHER EXAMINATION SERVICE — assignment-scoped read model (READ-ONLY)
// -----------------------------------------------------------------------------
// Maps the repository's assignment-scoped rows into the teacher-facing DTOs and
// computes the portal's OWN capabilities from (assignment role + session state +
// engine rules) — mirroring the hardened engine gates (ADR-017). These are UI
// hints only; the engine remains the sole authority (the commands re-check in-tx).
// The page enforces TEACHER_PORTAL_VIEW and resolves teacherId server-side; this
// service assumes an already-resolved, already-authorized teacherId. Sprint 1 =
// reads only.
// =============================================================================

// Role/state sets kept in lockstep with the hardened commands (ADR-017).
const ATTENDANCE_ROLES = new Set(["CHIEF", "INVIGILATOR", "MARKER"]);
const RESULT_ROLES = new Set(["CHIEF", "MARKER"]);
const MARK_STATES = new Set(["LOCKED", "IN_PROGRESS"]);
const CORRECT_STATES = new Set(["LOCKED", "IN_PROGRESS", "COMPLETED"]);
const RESULT_STATES = new Set(["IN_PROGRESS", "COMPLETED"]);
const RECENT_STATES = new Set(["COMPLETED", "RESULTS_RECORDED", "PUBLISHED"]);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Capabilities from role + session state + engine rules (NOT admin allowedActions).
 *  The counts gate the bulk affordances (bulk is only offered when there is something
 *  to act on): `pendingAttendance` = candidates without a recorded attendance;
 *  `eligibleResultCreate` = candidates eligible to create a result;
 *  `draftResults` = DRAFT results available to submit. */
export function computeTeacherCapabilities(
  role: string,
  sessionStatus: string,
  counts: { pendingAttendance?: number; eligibleResultCreate?: number; draftResults?: number } = {}
): TeacherExamCapabilitiesDto {
  const attendanceRole = ATTENDANCE_ROLES.has(role);
  const resultRole = RESULT_ROLES.has(role);

  const canMarkAttendance = attendanceRole && MARK_STATES.has(sessionStatus);
  const canCorrectAttendance = attendanceRole && CORRECT_STATES.has(sessionStatus);
  const canBulkMarkAttendance = canMarkAttendance && (counts.pendingAttendance ?? 0) > 0;
  const canEnterResults = resultRole && RESULT_STATES.has(sessionStatus);
  const canUpdateResults = resultRole && RESULT_STATES.has(sessionStatus);
  const canSubmitResults = resultRole && sessionStatus === "COMPLETED";
  const canBulkEnterResults = canEnterResults && (counts.eligibleResultCreate ?? 0) > 0;
  const canBulkSubmitResults = canSubmitResults && (counts.draftResults ?? 0) > 0;

  let attendanceBlockReason: string | null = null;
  if (!attendanceRole) attendanceBlockReason = "O teu papel nesta sessão não permite registar presenças.";
  else if (!canMarkAttendance && !canCorrectAttendance)
    attendanceBlockReason = "A sessão ainda não está aberta para registo de presenças.";

  let resultsBlockReason: string | null = null;
  if (!resultRole) resultsBlockReason = "O teu papel nesta sessão não permite lançar resultados.";
  else if (!canEnterResults && !canSubmitResults)
    resultsBlockReason = "A sessão ainda não está na fase de resultados.";

  return {
    canMarkAttendance,
    canCorrectAttendance,
    canBulkMarkAttendance,
    canEnterResults,
    canUpdateResults,
    canSubmitResults,
    canBulkEnterResults,
    canBulkSubmitResults,
    attendanceBlockReason,
    resultsBlockReason,
  };
}

function nextAction(caps: TeacherExamCapabilitiesDto, p: TeacherSessionProgressRow): string | null {
  if (caps.canMarkAttendance && p.attendanceMarked < p.candidateCount) return "Marcar presença";
  if (caps.canEnterResults && p.resultsDraft + p.resultsSubmitted < p.candidateCount) return "Lançar resultados";
  if (caps.canSubmitResults && p.resultsDraft > 0) return "Submeter resultados";
  return null;
}

function toListItem(row: TeacherSessionRow, p: TeacherSessionProgressRow): TeacherExamSessionListItemDto {
  const caps = computeTeacherCapabilities(row.role, row.sessionStatus, {
    pendingAttendance: p.candidateCount - p.attendanceMarked,
  });
  return {
    examSessionId: row.examSessionId,
    title: row.title,
    subjectName: row.subjectName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    roomName: row.roomName,
    sessionStatus: row.sessionStatus,
    role: row.role,
    candidateCount: p.candidateCount,
    attendanceMarked: p.attendanceMarked,
    resultsSubmitted: p.resultsSubmitted,
    nextAction: nextAction(caps, p),
  };
}

function durationMinutes(startsAt: Date, endsAt: Date): number | null {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

const RESULT_MSG = {
  role: "O teu papel nesta sessão não permite lançar resultados.",
  phase: "A sessão ainda não está na fase de resultados.",
  notRegistered: "O candidato não está inscrito.",
  attendance: "Marca a presença antes de lançar o resultado.",
  notCompleted: "A sessão tem de estar concluída para submeter.",
  notDraft: "O resultado já não é um rascunho e não pode ser alterado pelo docente.",
} as const;

/** Per-candidate result capabilities from role + session state + candidate/attendance/
 *  result state + engine rules. UI hints only — the hardened Create/Update/Submit
 *  commands remain the final authority. */
function resultRowCapabilities(
  role: string,
  sessionStatus: string,
  c: TeacherCandidateRow
): TeacherResultCandidateCapabilitiesDto {
  const resultRole = RESULT_ROLES.has(role);
  const inResultsPhase = RESULT_STATES.has(sessionStatus);
  const isCompleted = sessionStatus === "COMPLETED";
  const registered = c.candidateStatus === "REGISTERED";
  const attendanceMarked = c.attendanceStatus != null;
  const hasResult = c.resultId != null;
  const isDraft = c.resultStatus === "DRAFT";

  const canCreateResult = resultRole && inResultsPhase && registered && attendanceMarked && !hasResult;
  let createBlockReason: string | null = null;
  if (canCreateResult || hasResult) createBlockReason = null;
  else if (!resultRole) createBlockReason = RESULT_MSG.role;
  else if (!inResultsPhase) createBlockReason = RESULT_MSG.phase;
  else if (!registered) createBlockReason = RESULT_MSG.notRegistered;
  else if (!attendanceMarked) createBlockReason = RESULT_MSG.attendance;

  const canUpdateDraft = resultRole && inResultsPhase && hasResult && isDraft;
  let updateBlockReason: string | null = null;
  if (canUpdateDraft || !hasResult) updateBlockReason = null;
  else if (!resultRole) updateBlockReason = RESULT_MSG.role;
  else if (!isDraft) updateBlockReason = RESULT_MSG.notDraft;
  else if (!inResultsPhase) updateBlockReason = RESULT_MSG.phase;

  const canSubmitResult = resultRole && isCompleted && hasResult && isDraft;
  let submitBlockReason: string | null = null;
  if (canSubmitResult || !hasResult) submitBlockReason = null;
  else if (!resultRole) submitBlockReason = RESULT_MSG.role;
  else if (!isDraft) submitBlockReason = RESULT_MSG.notDraft;
  else if (!isCompleted) submitBlockReason = RESULT_MSG.notCompleted;

  return {
    canCreateResult,
    canUpdateDraft,
    canSubmitResult,
    createBlockReason,
    updateBlockReason,
    submitBlockReason,
  };
}

function toResultRow(role: string, sessionStatus: string, c: TeacherCandidateRow): TeacherResultRowDto {
  return {
    examCandidateId: c.examCandidateId,
    studentNumber: c.studentNumber,
    studentName: c.studentName,
    candidateStatus: c.candidateStatus,
    attendanceStatus: c.attendanceStatus,
    // The engine-derived code the attendance dictates (never a free choice).
    expectedResultCode: c.attendanceStatus ? resultCodeForAttendance(c.attendanceStatus) : null,
    result:
      c.resultId != null && c.resultStatus != null
        ? {
            examResultId: c.resultId,
            score: c.score,
            maxScore: c.maxScore,
            normalizedScore: c.normalizedScore,
            resultCode: c.resultCode,
            status: c.resultStatus,
          }
        : null,
    capabilities: resultRowCapabilities(role, sessionStatus, c),
  };
}

export class TeacherExaminationService {
  /** Operational overview — teacher-scoped, no admin/global metrics. */
  async getOverview(
    organizationId: string,
    teacherId: string,
    now: Date = new Date()
  ): Promise<TeacherExamOverviewDto> {
    // Bounded load of the teacher's assigned sessions + batched progress.
    const rows = await listAssignedSessions(organizationId, teacherId, {}, 0, MAX_PAGE_SIZE * 5);
    const progress = await loadSessionsProgress(organizationId, rows.map((r) => r.examSessionId));
    const items = rows.map((r) => {
      const p = progress.get(r.examSessionId)!;
      return {
        row: r,
        item: toListItem(r, p),
        caps: computeTeacherCapabilities(r.role, r.sessionStatus, {
          pendingAttendance: p.candidateCount - p.attendanceMarked,
        }),
        p,
      };
    });

    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const dayEnd = dayStart + DAY_MS;
    const nowMs = now.getTime();

    const today = items
      .filter((x) => {
        const t = new Date(x.row.startsAt).getTime();
        return t >= dayStart && t < dayEnd && x.row.sessionStatus !== "CANCELLED";
      })
      .map((x) => x.item);

    const nextSession =
      items
        .filter((x) => new Date(x.row.startsAt).getTime() >= nowMs && x.row.sessionStatus !== "CANCELLED")
        .sort((a, b) => new Date(a.row.startsAt).getTime() - new Date(b.row.startsAt).getTime())
        .map((x) => x.item)[0] ?? null;

    const attendancePendingCount = items.filter(
      (x) => x.caps.canMarkAttendance && x.p.attendanceMarked < x.p.candidateCount
    ).length;
    const resultsToEnterCount = items.filter(
      (x) => x.caps.canEnterResults && x.p.resultsDraft + x.p.resultsSubmitted < x.p.candidateCount
    ).length;
    const resultsToSubmitCount = items.filter(
      (x) => x.caps.canSubmitResults && x.p.resultsDraft > 0
    ).length;

    const recentlyCompleted = items
      .filter((x) => RECENT_STATES.has(x.row.sessionStatus) && new Date(x.row.startsAt).getTime() < nowMs)
      .sort((a, b) => new Date(b.row.startsAt).getTime() - new Date(a.row.startsAt).getTime())
      .slice(0, 5)
      .map((x) => x.item);

    return {
      nextSession,
      today,
      todayCount: today.length,
      attendancePendingCount,
      resultsToEnterCount,
      resultsToSubmitCount,
      recentlyCompleted,
    };
  }

  /** Assigned sessions, filtered + server-side paginated. */
  async listSessions(
    organizationId: string,
    teacherId: string,
    filters: TeacherExamSessionFilters = {}
  ): Promise<TeacherExamSessionPageDto> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
    const [rows, total] = await Promise.all([
      listAssignedSessions(organizationId, teacherId, filters, (page - 1) * pageSize, pageSize),
      countAssignedSessions(organizationId, teacherId, filters),
    ]);
    const progress = await loadSessionsProgress(organizationId, rows.map((r) => r.examSessionId));
    return {
      items: rows.map((r) => toListItem(r, progress.get(r.examSessionId)!)),
      total,
      page,
      pageSize,
    };
  }

  /** Single assigned-session detail — fail-closed to null (page → notFound()). */
  async getSessionDetail(
    organizationId: string,
    teacherId: string,
    examSessionId: string
  ): Promise<TeacherExamSessionDetailDto | null> {
    const row = await findAssignedSession(organizationId, teacherId, examSessionId);
    if (!row) return null;

    const candidates = await listSessionCandidates(organizationId, examSessionId);
    const progress: TeacherSessionProgressRow = {
      examSessionId,
      candidateCount: candidates.filter((c) => c.candidateStatus === "REGISTERED").length,
      attendanceMarked: candidates.filter((c) => c.attendanceStatus != null).length,
      resultsDraft: candidates.filter((c) => c.resultStatus === "DRAFT").length,
      resultsSubmitted: candidates.filter((c) => c.resultStatus === "SUBMITTED").length,
    };

    return {
      examSessionId: row.examSessionId,
      title: row.title,
      subjectName: row.subjectName,
      levelName: row.levelName,
      courseName: row.courseName,
      periodName: row.periodName,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      durationMinutes: durationMinutes(row.startsAt, row.endsAt),
      roomName: row.roomName,
      instructions: row.instructions,
      sessionStatus: row.sessionStatus,
      role: row.role,
      progress: {
        candidateCount: progress.candidateCount,
        attendanceMarked: progress.attendanceMarked,
        resultsDraft: progress.resultsDraft,
        resultsSubmitted: progress.resultsSubmitted,
      },
      capabilities: computeTeacherCapabilities(row.role, row.sessionStatus, {
        pendingAttendance: progress.candidateCount - progress.attendanceMarked,
      }),
      candidates,
    };
  }

  /** The interactive attendance view (roster + gating), fail-closed to null when the
   *  teacher is not assigned to the session. Used by the roster GET endpoint so the
   *  client can revalidate after each mutation with fresh capabilities/progress. */
  async getSessionAttendanceView(
    organizationId: string,
    teacherId: string,
    examSessionId: string
  ): Promise<TeacherExamAttendanceViewDto | null> {
    const row = await findAssignedSession(organizationId, teacherId, examSessionId);
    if (!row) return null;

    const candidates = await listSessionCandidates(organizationId, examSessionId);
    const progress = {
      candidateCount: candidates.filter((c) => c.candidateStatus === "REGISTERED").length,
      attendanceMarked: candidates.filter((c) => c.attendanceStatus != null).length,
      resultsDraft: candidates.filter((c) => c.resultStatus === "DRAFT").length,
      resultsSubmitted: candidates.filter((c) => c.resultStatus === "SUBMITTED").length,
    };
    return {
      examSessionId: row.examSessionId,
      sessionStatus: row.sessionStatus,
      role: row.role,
      capabilities: computeTeacherCapabilities(row.role, row.sessionStatus, {
        pendingAttendance: progress.candidateCount - progress.attendanceMarked,
      }),
      progress,
      candidates,
    };
  }

  /** The interactive results view (roster + per-candidate + session gating), fail-
   *  closed to null when the teacher is not assigned. */
  async getSessionResultsView(
    organizationId: string,
    teacherId: string,
    examSessionId: string
  ): Promise<TeacherExamResultsViewDto | null> {
    const row = await findAssignedSession(organizationId, teacherId, examSessionId);
    if (!row) return null;

    const candidates = await listSessionCandidates(organizationId, examSessionId);
    const rows = candidates.map((c) => toResultRow(row.role, row.sessionStatus, c));

    const eligibleResultCreate = candidates.filter(
      (c) => c.candidateStatus === "REGISTERED" && c.attendanceStatus != null && c.resultId == null
    ).length;
    const draftResults = candidates.filter((c) => c.resultStatus === "DRAFT").length;
    const maxScore = candidates.find((c) => c.maxScore != null)?.maxScore ?? null;

    return {
      examSessionId: row.examSessionId,
      sessionStatus: row.sessionStatus,
      role: row.role,
      capabilities: computeTeacherCapabilities(row.role, row.sessionStatus, {
        eligibleResultCreate,
        draftResults,
      }),
      maxScore,
      rows,
    };
  }

  /** Filter facets (distinct subjects + periods across assigned sessions). */
  async getSessionFacets(organizationId: string, teacherId: string): Promise<TeacherSessionFacets> {
    return listAssignedSessionFacets(organizationId, teacherId);
  }
}

export const teacherExaminationService = new TeacherExaminationService();
