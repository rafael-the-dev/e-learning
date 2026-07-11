import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import { ExamAttendanceStatus } from "@/modules/examinations/constants";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import { listStudentDisplayByIds } from "@/modules/examinations/repositories/exam-admin-read.repository";
import type {
  ExamAttendanceAdminListFilters,
  ExamAttendanceRosterDto,
  ExamAttendanceRosterItemDto,
  ExamAttendanceSummaryDto,
} from "@/modules/examinations/types/portal";
import { computeAttendanceAllowedActions, resolveAttendanceCaps } from "./examination-portal.mapper";

// =============================================================================
// EXAM ATTENDANCE ADMIN READ SERVICE (Phase 12 §Increment 2) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// The exam-day attendance ROSTER for one session: one row per registered
// candidate (marked AND unmarked), each carrying the recorded exam-attendance
// fact (or null) plus a server-computed `allowedActions`. The `summary` is always
// computed over the FULL roster; only the returned `items` are filtered/paginated.
// Batches student display by ids (no N+1). Requires `exams.view`. No writes, no
// rules. This is an EXAMINATION fact only — it never touches the class Attendance
// Engine and carries no class-attendance field or terminology.
// =============================================================================

export class ExamAttendanceAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async getRoster(
    context: AuthContext,
    examSessionId: string,
    filters: ExamAttendanceAdminListFilters = {}
  ): Promise<ExamAttendanceRosterDto> {
    this.assertCanView(context);
    const { organizationId } = context;

    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    // The roster = every registered candidate (marked + unmarked).
    const [candidates, attendance] = await Promise.all([
      listRegisteredCandidatesBySession({ organizationId, examSessionId }),
      listAttendanceBySession({ organizationId, examSessionId }),
    ]);

    const attendanceByCandidate = new Map(attendance.map((a) => [a.examCandidateId, a]));

    const studentIds = [...new Set(candidates.map((c) => c.studentId))];
    const students = await listStudentDisplayByIds(organizationId, studentIds);
    const studentById = new Map(students.map((s) => [s.id, s]));

    const caps = resolveAttendanceCaps(context);

    // Build one DTO per candidate over the FULL roster.
    const allItems = candidates.map((candidate): ExamAttendanceRosterItemDto => {
      const row = attendanceByCandidate.get(candidate.id) ?? null;
      const hasAttendance = row !== null;
      const student = studentById.get(candidate.studentId);
      const studentName = student
        ? [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || null
        : null;
      return {
        attendanceId: row?.id ?? null,
        examCandidateId: candidate.id,
        examSessionId,
        studentNumber: student?.code ?? null,
        studentName,
        candidateStatus: candidate.status,
        attendanceStatus: row?.status ?? null,
        checkedInAt: row?.checkedInAt ?? null,
        markedAt: row?.markedAt ?? null,
        markedById: row?.markedById ?? null,
        remarks: row?.remarks ?? null,
        hasAttendance,
        allowedActions: computeAttendanceAllowedActions(
          candidate.status,
          session.status,
          hasAttendance,
          caps
        ),
      };
    });

    const summary = buildSummary(allItems);

    // Filter (status + name/number search) then paginate the ITEMS only.
    const filtered = applyFilters(allItems, filters);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return { examSessionId, summary, items, total, page, pageSize };
  }
}

function buildSummary(items: ExamAttendanceRosterItemDto[]): ExamAttendanceSummaryDto {
  const totalRegistered = items.length;
  let marked = 0;
  let present = 0;
  let absent = 0;
  let late = 0;
  let excused = 0;
  let disqualified = 0;
  for (const item of items) {
    if (!item.hasAttendance) continue;
    marked += 1;
    switch (item.attendanceStatus) {
      case ExamAttendanceStatus.PRESENT:
        present += 1;
        break;
      case ExamAttendanceStatus.ABSENT:
        absent += 1;
        break;
      case ExamAttendanceStatus.LATE:
        late += 1;
        break;
      case ExamAttendanceStatus.EXCUSED:
        excused += 1;
        break;
      case ExamAttendanceStatus.DISQUALIFIED:
        disqualified += 1;
        break;
      default:
        break;
    }
  }
  return {
    totalRegistered,
    marked,
    unmarked: totalRegistered - marked,
    present,
    absent,
    late,
    excused,
    disqualified,
    completionPercentage: totalRegistered > 0 ? Math.round((marked / totalRegistered) * 100) : 0,
  };
}

function applyFilters(
  items: ExamAttendanceRosterItemDto[],
  filters: ExamAttendanceAdminListFilters
): ExamAttendanceRosterItemDto[] {
  const status = filters.status;
  const search = filters.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (status && item.attendanceStatus !== status) return false;
    if (search) {
      const haystack = [item.studentName, item.studentNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export const examAttendanceAdminReadService = new ExamAttendanceAdminReadService();
