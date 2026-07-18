import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { UpcomingExamsTable } from "@/modules/student-examinations/components/upcoming-exams-table";

export const metadata = { title: "Exames · Próximos" };

export default async function StudentUpcomingExamsPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  const items = await studentExaminationService.listUpcoming(context.organizationId, student.id);

  return <UpcomingExamsTable items={items} />;
}
