import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { teacherExaminationService } from "@/modules/teacher-examinations/services/teacher-examination.service";
import { TeacherUnlinkedState } from "@/modules/teacher-examinations/components/teacher-unlinked-state";
import { TeacherExamKpiCards } from "@/modules/teacher-examinations/components/teacher-exam-kpi-cards";
import {
  NextSessionHighlight,
  TodayShortList,
  RecentlyCompletedShortList,
} from "@/modules/teacher-examinations/components/teacher-exam-overview-panels";

export const metadata = { title: "Exames · Resumo" };

export default async function TeacherExamsOverviewPage() {
  // teacherId is NEVER read from the URL — resolved server-side from the session.
  const context = await requirePermissionOrRedirect(PERMISSIONS.TEACHER_PORTAL_VIEW);
  const teacher = await getTeacherByUserId(context.organizationId, context.userId);
  if (!teacher) return <TeacherUnlinkedState />;

  const overview = await teacherExaminationService.getOverview(context.organizationId, teacher.id);

  return (
    <div className="space-y-6">
      <TeacherExamKpiCards overview={overview} />

      {overview.nextSession && <NextSessionHighlight session={overview.nextSession} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TodayShortList items={overview.today} />
        <RecentlyCompletedShortList items={overview.recentlyCompleted} />
      </div>
    </div>
  );
}
