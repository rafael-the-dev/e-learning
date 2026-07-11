import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import {
  findExamCandidateById,
  listCandidatesBySession,
} from "@/modules/examinations/repositories/exam-candidate.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import {
  findAttendanceByCandidateId,
  listAttendanceBySession,
} from "@/modules/examinations/repositories/exam-attendance.repository";
import {
  findResultByCandidateId,
  findResultsBySession,
} from "@/modules/examinations/repositories/exam-result.repository";
import {
  listEnrollmentDisplayByIds,
  listStudentDisplayByIds,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import type {
  ExamAttendanceRecord,
  ExamCandidateRecord,
  ExamResultRecord,
} from "@/modules/examinations/types/repository";
import type {
  ExamCandidateAdminListFilters,
  ExamCandidateDetailDto,
  ExamCandidateEligibilityProvenanceDto,
  ExamCandidateListItemDto,
  PortalListResult,
} from "@/modules/examinations/types/portal";
import {
  computeCandidateAllowedActions,
  resolveCandidateCaps,
  type ExamCandidateActionCaps,
} from "./examination-portal.mapper";

// =============================================================================
// EXAM CANDIDATE ADMIN READ SERVICE (Phase 12, Increment 2) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Session-scoped candidate roster (list) + single-candidate detail with batched
// attendance/result joins (bounded roster → NO N+1) and display enrichment
// (student number/name + enrollment number). Filtering + pagination happen
// in-memory over the bounded roster. The raw `eligibilitySnapshot` is NEVER
// exposed: detail parses it defensively and surfaces ONLY an allowlisted
// provenance (blockers / warnings / requiresApproval / override facts). Requires
// `exams.view`. No writes, no lifecycle/eligibility decision — the commands own
// those; `allowedActions` are conservative UI flags.
// =============================================================================

interface EligibilityEvaluated {
  blockingReasons?: unknown;
  warnings?: unknown;
  requiresApproval?: unknown;
}
interface ParsedEligibilitySnapshot {
  evaluated?: EligibilityEvaluated;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** Parse the raw eligibilitySnapshot and project ONLY the allowlisted provenance —
 *  the raw JSON string never leaves this function. Malformed → empty/defaults. */
function toEligibilityProvenance(
  candidate: ExamCandidateRecord
): ExamCandidateEligibilityProvenanceDto {
  let parsed: ParsedEligibilitySnapshot = {};
  if (candidate.eligibilitySnapshot) {
    try {
      parsed = JSON.parse(candidate.eligibilitySnapshot) as ParsedEligibilitySnapshot;
    } catch {
      parsed = {};
    }
  }
  const evaluated = parsed.evaluated ?? {};
  return {
    blockers: toStringArray(evaluated.blockingReasons),
    warnings: toStringArray(evaluated.warnings),
    requiresApproval: evaluated.requiresApproval === true,
    overridden: candidate.overriddenById != null,
    overriddenById: candidate.overriddenById,
    overrideReason: candidate.overrideReason,
    overriddenAt: null,
  };
}

export class ExamCandidateAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async listBySession(
    context: AuthContext,
    examSessionId: string,
    filters: ExamCandidateAdminListFilters = {}
  ): Promise<PortalListResult<ExamCandidateListItemDto>> {
    this.assertCanView(context);
    const { organizationId } = context;

    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    // Bounded, session-scoped reads — one query each, NO N+1.
    const [roster, attendance, results] = await Promise.all([
      listCandidatesBySession({ organizationId, examSessionId }),
      listAttendanceBySession({ organizationId, examSessionId }),
      findResultsBySession({ organizationId, examSessionId }),
    ]);

    const attendanceByCandidateId = new Map<string, ExamAttendanceRecord>(
      attendance.map((a) => [a.examCandidateId, a])
    );
    const resultByCandidateId = new Map<string, ExamResultRecord>(
      results.map((r) => [r.examCandidateId, r])
    );

    // Batched display enrichment.
    const studentIds = [...new Set(roster.map((c) => c.studentId))];
    const enrollmentIds = [...new Set(roster.map((c) => c.enrollmentId))];
    const [students, enrollments] = await Promise.all([
      listStudentDisplayByIds(organizationId, studentIds),
      listEnrollmentDisplayByIds(organizationId, enrollmentIds),
    ]);
    const studentById = new Map(students.map((s) => [s.id, s]));
    const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));

    const caps = resolveCandidateCaps(context);
    const search = filters.search?.trim().toLowerCase();

    // In-memory filter over the bounded roster, then paginate.
    const filtered = roster.filter((candidate) => {
      if (filters.eligibilityStatus && candidate.eligibilityStatus !== filters.eligibilityStatus) {
        return false;
      }
      if (filters.candidateStatus && candidate.status !== filters.candidateStatus) return false;
      const att = attendanceByCandidateId.get(candidate.id) ?? null;
      const res = resultByCandidateId.get(candidate.id) ?? null;
      if (filters.attendanceStatus && (att?.status ?? null) !== filters.attendanceStatus) {
        return false;
      }
      if (filters.resultStatus && (res?.status ?? null) !== filters.resultStatus) return false;
      if (filters.overridden !== undefined && (candidate.overriddenById != null) !== filters.overridden) {
        return false;
      }
      if (search) {
        const student = studentById.get(candidate.studentId);
        const name = student ? `${student.firstName} ${student.lastName}` : "";
        const number = student?.code ?? "";
        const hay = `${name} ${number}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const total = filtered.length;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
    const pageRows = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const items = pageRows.map((candidate) =>
      this.toListItemDto(
        candidate,
        session.status,
        studentById.get(candidate.studentId) ?? null,
        enrollmentById.get(candidate.enrollmentId) ?? null,
        attendanceByCandidateId.get(candidate.id) ?? null,
        resultByCandidateId.get(candidate.id) ?? null,
        caps
      )
    );

    return { items, total, page, pageSize };
  }

  async getDetail(
    context: AuthContext,
    examCandidateId: string
  ): Promise<ExamCandidateDetailDto | null> {
    this.assertCanView(context);
    const { organizationId } = context;

    const candidate = await findExamCandidateById({ organizationId, id: examCandidateId });
    if (!candidate) return null;

    const [session, attendance, result, students, enrollments] = await Promise.all([
      findExamSessionById({ organizationId, id: candidate.examSessionId }),
      findAttendanceByCandidateId({ organizationId, examCandidateId }),
      findResultByCandidateId({ organizationId, examCandidateId }),
      listStudentDisplayByIds(organizationId, [candidate.studentId]),
      listEnrollmentDisplayByIds(organizationId, [candidate.enrollmentId]),
    ]);

    const caps = resolveCandidateCaps(context);
    const sessionStatus = session?.status ?? "";
    const base = this.toListItemDto(
      candidate,
      sessionStatus,
      students[0] ?? null,
      enrollments[0] ?? null,
      attendance,
      result,
      caps
    );

    return {
      ...base,
      eligibility: toEligibilityProvenance(candidate),
      attendance: attendance
        ? {
            status: attendance.status,
            checkedInAt: attendance.checkedInAt,
            markedAt: attendance.markedAt,
            remarks: attendance.remarks,
          }
        : null,
      result: result
        ? {
            status: result.status,
            resultCode: result.resultCode,
            score: result.score,
            maxScore: result.maxScore,
            normalizedScore: result.normalizedScore,
          }
        : null,
    };
  }

  private toListItemDto(
    candidate: ExamCandidateRecord,
    sessionStatus: string,
    student: { code: string | null; firstName: string; lastName: string } | null,
    enrollment: { enrollmentNumber: string | null } | null,
    attendance: ExamAttendanceRecord | null,
    result: ExamResultRecord | null,
    caps: ExamCandidateActionCaps
  ): ExamCandidateListItemDto {
    const hasAttendance = attendance != null;
    const hasResult = result != null;
    return {
      examCandidateId: candidate.id,
      examSessionId: candidate.examSessionId,
      studentId: candidate.studentId,
      studentNumber: student?.code ?? null,
      studentName: student ? `${student.firstName} ${student.lastName}` : null,
      enrollmentId: candidate.enrollmentId,
      enrollmentNumber: enrollment?.enrollmentNumber ?? null,
      examAttemptId: candidate.examAttemptId,
      attemptNumber: null,
      eligibilityStatus: candidate.eligibilityStatus,
      candidateStatus: candidate.status,
      assignedSeat: candidate.assignedSeat,
      attendanceStatus: attendance?.status ?? null,
      resultStatus: result?.status ?? null,
      overridden: candidate.overriddenById != null,
      overrideReasonPresent: !!candidate.overrideReason,
      registeredAt: candidate.registeredAt,
      allowedActions: computeCandidateAllowedActions(
        candidate.status,
        sessionStatus,
        hasAttendance,
        hasResult,
        caps
      ),
    };
  }
}

export const examCandidateAdminReadService = new ExamCandidateAdminReadService();
