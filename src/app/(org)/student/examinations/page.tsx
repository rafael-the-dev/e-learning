import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { StudentExamKpiCards } from "@/modules/student-examinations/components/student-exam-kpi-cards";
import {
  NextExamHighlight,
  UpcomingShortList,
  LatestResultsShortList,
  ExamAlertsCard,
} from "@/modules/student-examinations/components/student-exam-overview-panels";

export const metadata = { title: "Exames · Resumo" };

export default async function StudentExamsOverviewPage() {
  // studentId is NEVER read from the URL — resolved server-side from the session.
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  const overview = await studentExaminationService.getOverview(context.organizationId, student.id);

  return (
    <div className="space-y-6">
      <StudentExamKpiCards overview={overview} />

      {overview.nextExam && <NextExamHighlight exam={overview.nextExam} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingShortList items={overview.upcoming} />
        <LatestResultsShortList items={overview.latestResults} />
      </div>

      <ExamAlertsCard alerts={overview.alerts} />
    </div>
  );
}
