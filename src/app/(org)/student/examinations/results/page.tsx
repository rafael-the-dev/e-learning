import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { StudentResultsTable } from "@/modules/student-examinations/components/student-results-table";

export const metadata = { title: "Exames · Resultados" };

export default async function StudentExamResultsPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  const items = await studentExaminationService.listResults(context.organizationId, student.id);

  return <StudentResultsTable items={items} />;
}
