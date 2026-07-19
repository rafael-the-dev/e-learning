import {
  findGuardianLinks,
  type GuardianLinkRow,
} from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import {
  listStudentCandidacies,
  countPendingAppeals,
  type StudentCandidacyRow,
} from "@/modules/student-examinations/repositories/student-exam.repository";
import type {
  GuardianExamOverviewDto,
  GuardianExamResultBriefDto,
  GuardianExamStudentSummaryDto,
  GuardianLinkedStudentDto,
  GuardianUpcomingExamDto,
} from "@/modules/guardian-examinations/types";

// =============================================================================
// GUARDIAN EXAMINATION SERVICE — supervision read model (READ-ONLY)
// -----------------------------------------------------------------------------
// Reads the guardian's ACTIVE linked students (findGuardianLinks — never a studentId
// from input) and, for each link, surfaces a supervision summary. Exam ACADEMIC data
// (schedule/results/appeals) is withheld unless the link's `canViewAcademic` is set.
// The data source is the tested student-exam repository (studentId-scoped reads) —
// the studentId is always the guardian's OWN linked student. No writes; no actions.
// =============================================================================

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INACTIVE = new Set(["WITHDRAWN", "DISQUALIFIED"]);

function toLinkedStudent(link: GuardianLinkRow): GuardianLinkedStudentDto {
  return {
    studentId: link.studentId,
    studentName: `${link.student.firstName} ${link.student.lastName}`,
    studentNumber: link.student.code,
    relationshipType: link.relationshipType,
    isPrimary: link.isPrimary,
    canViewAcademic: link.canViewAcademic,
    canViewAttendance: link.canViewAttendance,
  };
}

function isPublished(row: StudentCandidacyRow): boolean {
  return row.result?.status === "PUBLISHED";
}

function isUpcoming(row: StudentCandidacyRow, now: Date): boolean {
  return (
    !INACTIVE.has(row.candidateStatus) &&
    row.session.status !== "CANCELLED" &&
    new Date(row.session.startsAt).getTime() >= now.getTime()
  );
}

function toUpcoming(row: StudentCandidacyRow): GuardianUpcomingExamDto {
  return {
    examCandidateId: row.examCandidateId,
    subjectName: row.session.subjectName,
    startsAt: row.session.startsAt,
    endsAt: row.session.endsAt,
    roomName: row.session.roomName,
    sessionStatus: row.session.status,
  };
}

function toResultBrief(row: StudentCandidacyRow): GuardianExamResultBriefDto {
  return {
    examResultId: row.result!.examResultId,
    subjectName: row.session.subjectName,
    normalizedScore: row.result!.normalizedScore,
    resultCode: row.result!.resultCode,
    publishedAt: row.result!.publishedAt,
  };
}

export class GuardianExaminationService {
  /** One supervision summary per ACTIVE linked student. */
  async getOverview(
    organizationId: string,
    guardianUserId: string,
    now: Date = new Date()
  ): Promise<GuardianExamOverviewDto> {
    const links = await findGuardianLinks(organizationId, guardianUserId);
    const students = await Promise.all(
      links.map((link) => this.studentSummary(organizationId, link, now))
    );
    return { hasLinks: links.length > 0, students };
  }

  private async studentSummary(
    organizationId: string,
    link: GuardianLinkRow,
    now: Date
  ): Promise<GuardianExamStudentSummaryDto> {
    const student = toLinkedStudent(link);

    // Flag gate: exam academic data is withheld without canViewAcademic.
    if (!link.canViewAcademic) {
      return {
        student,
        academicVisible: false,
        nextExam: null,
        examsThisWeek: 0,
        latestResults: [],
        pendingAppeals: 0,
        alerts: ["Sem visibilidade académica para este educando."],
      };
    }

    const [rows, pendingAppeals] = await Promise.all([
      listStudentCandidacies(organizationId, link.studentId),
      countPendingAppeals(organizationId, link.studentId),
    ]);

    const upcoming = rows
      .filter((r) => isUpcoming(r, now))
      .sort((a, b) => new Date(a.session.startsAt).getTime() - new Date(b.session.startsAt).getTime());
    const nextExam = upcoming[0] ? toUpcoming(upcoming[0]) : null;
    const weekEnd = now.getTime() + WEEK_MS;
    const examsThisWeek = upcoming.filter(
      (r) => new Date(r.session.startsAt).getTime() <= weekEnd
    ).length;

    const latestResults = rows
      .filter(isPublished)
      .map(toResultBrief)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, 3);

    const alerts: string[] = [];
    if (nextExam) {
      alerts.push(
        `Próximo exame: ${nextExam.subjectName ?? "Exame"} em ${new Date(
          nextExam.startsAt
        ).toLocaleDateString("pt-PT")}.`
      );
    }
    if (pendingAppeals > 0) alerts.push(`${pendingAppeals} recurso(s) por decidir.`);

    return {
      student,
      academicVisible: true,
      nextExam,
      examsThisWeek,
      latestResults,
      pendingAppeals,
      alerts,
    };
  }
}

export const guardianExaminationService = new GuardianExaminationService();
