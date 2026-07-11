import { NextResponse } from "next/server";
import {
  AuthorizationError,
  BusinessRuleError,
  ConcurrencyError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import type {
  ExamAppealAdminListFilters,
  ExamAttendanceAdminListFilters,
  ExamCandidateAdminListFilters,
  ExamPeriodAdminListFilters,
  ExamResultAdminListFilters,
  ExamRoomAdminListFilters,
  ExamSessionAdminListFilters,
} from "@/modules/examinations/types/portal";

// =============================================================================
// EXAMINATION PORTAL — HTTP HELPERS (Phase 12)
// -----------------------------------------------------------------------------
// Thin transport helpers for the authenticated examination portal routes: a typed
// error → HTTP status mapping and admin list-query parsing. NO business logic —
// routes stay a shell over the read services + commands. Messages are generic
// (no Prisma error / SQL / stack / raw metadata leak).
// =============================================================================

/** BusinessRuleError codes that denote a lifecycle/concurrency/conflict (→ 409),
 *  as opposed to a validation / business-readiness failure (→ 422). Matched on the
 *  code substring (BusinessRuleError.message IS the code). */
const CONFLICT_CODE_PATTERN =
  /(CONCURRENTLY_CHANGED|ALREADY_EXISTS|ALREADY_CONSUMED|ALREADY_MARKED|ALREADY_REGISTERED|SEAT_UNAVAILABLE|SESSION_FULL|ATTEMPT_NUMBER_CONFLICT|ROOM_TIME_CONFLICT|INVIGILATOR_CONFLICT|OFFICIAL_RESULT_CHANGED)/;

/** Map a command/service typed error to a JSON response.
 *  401 is handled at the route (auth failure) before this is reached.
 *  403 AuthorizationError · 404 NotFound/cross-tenant · 409 lifecycle/concurrency ·
 *  422 validation/business-readiness · 500 anything else (sanitised). */
export function mapExaminationError(err: unknown): NextResponse {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message, fieldErrors: err.fieldErrors }, { status: 422 });
  }
  if (err instanceof ConcurrencyError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof BusinessRuleError) {
    const status = CONFLICT_CODE_PATTERN.test(err.message) ? 409 : 422;
    return NextResponse.json({ error: err.message, details: err.details }, { status });
  }
  if (err instanceof AuthorizationError) {
    return NextResponse.json({ error: "Sem permissão para executar esta ação" }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
}

function parseIntParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse the ExamPeriod admin list filters. Unknown params are ignored. */
export function parseExamPeriodListFilters(searchParams: URLSearchParams): ExamPeriodAdminListFilters {
  return {
    status: searchParams.get("status") ?? undefined,
    academicYear: searchParams.get("academicYear") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the ExamSession admin list filters. Unknown params are ignored. */
export function parseExamSessionListFilters(searchParams: URLSearchParams): ExamSessionAdminListFilters {
  return {
    periodId: searchParams.get("periodId") ?? undefined,
    levelSubjectId: searchParams.get("levelSubjectId") ?? undefined,
    roomId: searchParams.get("roomId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function parseBoolParam(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/** Parse the ExamRoom admin list filters. */
export function parseExamRoomListFilters(searchParams: URLSearchParams): ExamRoomAdminListFilters {
  return {
    branchId: searchParams.get("branchId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    minCapacity: parseIntParam(searchParams.get("minCapacity")),
    maxCapacity: parseIntParam(searchParams.get("maxCapacity")),
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the ExamCandidate admin list filters (session-scoped). */
export function parseExamCandidateListFilters(searchParams: URLSearchParams): ExamCandidateAdminListFilters {
  return {
    eligibilityStatus: searchParams.get("eligibilityStatus") ?? undefined,
    candidateStatus: searchParams.get("candidateStatus") ?? undefined,
    attendanceStatus: searchParams.get("attendanceStatus") ?? undefined,
    resultStatus: searchParams.get("resultStatus") ?? undefined,
    overridden: parseBoolParam(searchParams.get("overridden")),
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the ExamAttendance roster filters (session-scoped). */
export function parseExamAttendanceListFilters(searchParams: URLSearchParams): ExamAttendanceAdminListFilters {
  return {
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the ExamResult admin list filters (session-scoped). */
export function parseExamResultListFilters(searchParams: URLSearchParams): ExamResultAdminListFilters {
  return {
    status: searchParams.get("status") ?? undefined,
    resultCode: searchParams.get("resultCode") ?? undefined,
    attendanceStatus: searchParams.get("attendanceStatus") ?? undefined,
    markerId: searchParams.get("markerId") ?? undefined,
    reviewerId: searchParams.get("reviewerId") ?? undefined,
    approverId: searchParams.get("approverId") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the ExamAppeal admin list filters (org-wide). */
export function parseExamAppealListFilters(searchParams: URLSearchParams): ExamAppealAdminListFilters {
  return {
    status: searchParams.get("status") ?? undefined,
    examSessionId: searchParams.get("examSessionId") ?? undefined,
    levelSubjectId: searchParams.get("levelSubjectId") ?? undefined,
    studentId: searchParams.get("studentId") ?? undefined,
    createdFrom: parseDateParam(searchParams.get("createdFrom")),
    createdTo: parseDateParam(searchParams.get("createdTo")),
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}
