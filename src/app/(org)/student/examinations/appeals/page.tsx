import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { AppealsTable } from "@/modules/student-examinations/components/appeals-table";

export const metadata = { title: "Exames · Recursos" };

export default async function StudentExamAppealsPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  const items = await studentExaminationService.listAppeals(context.organizationId, student.id);

  return <AppealsTable items={items} />;
}
