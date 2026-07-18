import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { StudentHistoryTable } from "@/modules/student-examinations/components/student-history-table";
import { getStudentExamStatusLabel } from "@/modules/student-examinations/components/student-exam-status-labels";
import { ExaminationFilterBar } from "@/modules/examinations/components/examination-filter-bar";

export const metadata = { title: "Exames · Histórico" };

// The candidate-status values a student may filter their own history by. Values
// stay English (they travel in the URL); PT-PT comes from the render-layer registry.
const CANDIDATE_STATUS_OPTIONS = [
  "PENDING_ELIGIBILITY",
  "ELIGIBLE",
  "INELIGIBLE",
  "REGISTERED",
  "WITHDRAWN",
  "DISQUALIFIED",
] as const;

export default async function StudentExamHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; subjectId?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  const yearNum = sp.year ? Number(sp.year) : undefined;
  const pageNum = sp.page ? Number(sp.page) : 1;

  const [page, facets] = await Promise.all([
    studentExaminationService.listHistory(context.organizationId, student.id, {
      year: Number.isFinite(yearNum) ? yearNum : undefined,
      subjectId: sp.subjectId || undefined,
      status: sp.status || undefined,
      page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
    }),
    studentExaminationService.getHistoryFacets(context.organizationId, student.id),
  ]);

  return (
    <div className="space-y-4">
      <ExaminationFilterBar
        showSearch={false}
        selects={[
          {
            param: "year",
            label: "Ano",
            options: facets.years.map((y) => ({ value: String(y), label: String(y) })),
          },
          {
            param: "subjectId",
            label: "Disciplina",
            options: facets.subjects.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            param: "status",
            label: "Estado",
            options: CANDIDATE_STATUS_OPTIONS.map((value) => ({
              value,
              label: getStudentExamStatusLabel("candidate", value),
            })),
          },
        ]}
      />
      <StudentHistoryTable page={page} />
    </div>
  );
}
