import {
  listStudentCandidacies,
  findStudentCandidacy,
  countPendingAppeals,
  type StudentCandidacyRow,
} from "@/modules/student-examinations/repositories/student-exam.repository";
import type {
  StudentExamDetailDto,
  StudentExamEligibilityDto,
  StudentExamListItemDto,
  StudentExamOverviewDto,
  StudentExamResultListItemDto,
  StudentExamResultSummaryDto,
  StudentExamTimelineDto,
} from "@/modules/student-examinations/types";

// =============================================================================
// STUDENT EXAMINATION SERVICE — student-scoped read model (READ-ONLY)
// -----------------------------------------------------------------------------
// Maps the repository's candidacy rows into the student-facing DTOs. It performs
// the two hard rules of this module: (1) ownership — every read is for an explicit
// server-resolved studentId (the page resolves it from the session, never the URL);
// (2) masking — a result is surfaced ONLY when its status is PUBLISHED. No
// lifecycle actions, no pass/fail, no admin DTO. Callers (pages) enforce
// STUDENT_PORTAL_VIEW; this service assumes an already-authorized studentId.
// =============================================================================

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INACTIVE = new Set(["WITHDRAWN", "DISQUALIFIED"]);

function durationMinutes(startsAt: Date, endsAt: Date): number | null {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

function isPublished(row: StudentCandidacyRow): boolean {
  return row.result?.status === "PUBLISHED";
}

function toListItem(row: StudentCandidacyRow): StudentExamListItemDto {
  return {
    examCandidateId: row.examCandidateId,
    examSessionId: row.examSessionId,
    title: row.session.title,
    subjectName: row.session.subjectName,
    startsAt: row.session.startsAt,
    endsAt: row.session.endsAt,
    durationMinutes: durationMinutes(row.session.startsAt, row.session.endsAt),
    roomName: row.session.roomName,
    sessionStatus: row.session.status,
    candidateStatus: row.candidateStatus,
    eligibilityStatus: row.eligibilityStatus,
    hasPublishedResult: isPublished(row),
  };
}

function toResultSummary(row: StudentCandidacyRow): StudentExamResultSummaryDto | null {
  if (!isPublished(row) || !row.result) return null;
  const r = row.result;
  return {
    examResultId: r.examResultId,
    score: r.score,
    maxScore: r.maxScore,
    normalizedScore: r.normalizedScore,
    resultCode: r.resultCode,
    publishedAt: r.publishedAt,
  };
}

function toResultListItem(row: StudentCandidacyRow): StudentExamResultListItemDto | null {
  const summary = toResultSummary(row);
  if (!summary) return null;
  return {
    examResultId: summary.examResultId,
    examCandidateId: row.examCandidateId,
    examSessionId: row.examSessionId,
    subjectName: row.session.subjectName,
    score: summary.score,
    maxScore: summary.maxScore,
    normalizedScore: summary.normalizedScore,
    resultCode: summary.resultCode,
    publishedAt: summary.publishedAt,
  };
}

// The raw eligibilitySnapshot JSON never leaves this module — only allowlisted
// blocker codes are projected (translated to PT-PT at the render layer).
interface ParsedSnapshot {
  evaluated?: { blockingReasons?: unknown };
}
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
function toEligibility(row: StudentCandidacyRow): StudentExamEligibilityDto {
  let blockers: string[] = [];
  if (row.eligibilityStatus === "INELIGIBLE" && row.eligibilitySnapshot) {
    try {
      const parsed = JSON.parse(row.eligibilitySnapshot) as ParsedSnapshot;
      blockers = toStringArray(parsed.evaluated?.blockingReasons);
    } catch {
      blockers = [];
    }
  }
  return {
    eligible: row.eligibilityStatus === "ELIGIBLE" || row.overridden,
    status: row.eligibilityStatus,
    blockers,
    overridden: row.overridden,
  };
}

function toTimeline(row: StudentCandidacyRow, now: Date): StudentExamTimelineDto {
  const attended = row.attendanceStatus === "PRESENT" || row.attendanceStatus === "LATE";
  return {
    registered: row.registeredAt != null || row.candidateStatus === "REGISTERED",
    eligible: row.eligibilityStatus === "ELIGIBLE" || row.overridden,
    sat: attended || (new Date(row.session.startsAt).getTime() < now.getTime() && row.result != null),
    resultPublished: isPublished(row),
  };
}

function isUpcoming(row: StudentCandidacyRow, now: Date): boolean {
  return (
    !INACTIVE.has(row.candidateStatus) &&
    row.session.status !== "CANCELLED" &&
    new Date(row.session.startsAt).getTime() >= now.getTime()
  );
}

const byStartsAtAsc = (a: StudentCandidacyRow, b: StudentCandidacyRow): number =>
  new Date(a.session.startsAt).getTime() - new Date(b.session.startsAt).getTime();

/** Upcoming candidacies, soonest first — the service guarantees the order (never
 *  relies on the repository's ordering). */
function upcomingSorted(rows: StudentCandidacyRow[], now: Date): StudentCandidacyRow[] {
  return rows.filter((r) => isUpcoming(r, now)).sort(byStartsAtAsc);
}

export class StudentExaminationService {
  /** Attention-only KPIs + the module home lists. */
  async getOverview(
    organizationId: string,
    studentId: string,
    now: Date = new Date()
  ): Promise<StudentExamOverviewDto> {
    const [rows, pendingAppeals] = await Promise.all([
      listStudentCandidacies(organizationId, studentId),
      countPendingAppeals(organizationId, studentId),
    ]);

    const upcomingRows = upcomingSorted(rows, now);
    const upcoming = upcomingRows.map(toListItem);
    const nextExam = upcoming[0] ?? null;

    const weekEnd = now.getTime() + WEEK_MS;
    const examsThisWeek = upcomingRows.filter(
      (r) => new Date(r.session.startsAt).getTime() <= weekEnd
    ).length;

    // Sat but not yet published: the exam is in the past, the student was an active
    // candidate, and no PUBLISHED result exists yet.
    const resultsPendingPublication = rows.filter(
      (r) =>
        !INACTIVE.has(r.candidateStatus) &&
        new Date(r.session.startsAt).getTime() < now.getTime() &&
        !isPublished(r)
    ).length;

    const latestResults = rows
      .map(toResultListItem)
      .filter((r): r is StudentExamResultListItemDto => r !== null)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, 5);

    const alerts: string[] = [];
    if (nextExam) {
      alerts.push(
        `Próximo exame: ${nextExam.subjectName ?? nextExam.title} em ${new Date(
          nextExam.startsAt
        ).toLocaleDateString("pt-PT")}.`
      );
    }
    if (resultsPendingPublication > 0) {
      alerts.push(`${resultsPendingPublication} resultado(s) por publicar.`);
    }
    if (pendingAppeals > 0) alerts.push(`${pendingAppeals} recurso(s) pendente(s).`);

    return {
      nextExam,
      examsThisWeek,
      resultsPendingPublication,
      pendingAppeals,
      upcoming: upcoming.slice(0, 5),
      latestResults,
      alerts,
    };
  }

  /** Full upcoming list (future sittings, active candidacy). */
  async listUpcoming(
    organizationId: string,
    studentId: string,
    now: Date = new Date()
  ): Promise<StudentExamListItemDto[]> {
    const rows = await listStudentCandidacies(organizationId, studentId);
    return upcomingSorted(rows, now).map(toListItem);
  }

  /** The student's PUBLISHED results, most recent first. */
  async listResults(
    organizationId: string,
    studentId: string
  ): Promise<StudentExamResultListItemDto[]> {
    const rows = await listStudentCandidacies(organizationId, studentId);
    return rows
      .map(toResultListItem)
      .filter((r): r is StudentExamResultListItemDto => r !== null)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  }

  /** Single exam detail, ownership-enforced. Returns null when the id is not the
   *  student's own (the page renders notFound()). */
  async getExamDetail(
    organizationId: string,
    studentId: string,
    examCandidateId: string,
    now: Date = new Date()
  ): Promise<StudentExamDetailDto | null> {
    const row = await findStudentCandidacy(organizationId, studentId, examCandidateId);
    if (!row) return null;

    return {
      examCandidateId: row.examCandidateId,
      examSessionId: row.examSessionId,
      title: row.session.title,
      subjectName: row.session.subjectName,
      levelName: row.session.levelName,
      courseName: row.session.courseName,
      periodName: row.session.periodName,
      academicYear: row.session.academicYear,
      term: row.session.term,
      startsAt: row.session.startsAt,
      endsAt: row.session.endsAt,
      durationMinutes: durationMinutes(row.session.startsAt, row.session.endsAt),
      roomName: row.session.roomName,
      instructions: row.session.instructions,
      sessionStatus: row.session.status,
      candidateStatus: row.candidateStatus,
      eligibility: toEligibility(row),
      timeline: toTimeline(row, now),
      result: toResultSummary(row),
    };
  }
}

export const studentExaminationService = new StudentExaminationService();
