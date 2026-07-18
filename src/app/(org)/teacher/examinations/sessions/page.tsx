import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { teacherExaminationService } from "@/modules/teacher-examinations/services/teacher-examination.service";
import { TeacherUnlinkedState } from "@/modules/teacher-examinations/components/teacher-unlinked-state";
import { TeacherSessionsTable } from "@/modules/teacher-examinations/components/teacher-sessions-table";
import { getTeacherExamStatusOptions } from "@/modules/teacher-examinations/components/teacher-exam-status-labels";
import {
  ExaminationFilterBar,
  type FilterSelectConfig,
} from "@/modules/examinations/components/examination-filter-bar";

export const metadata = { title: "Exames · Sessões" };

// A single URL search param → string, ignoring array/duplicate values.
function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function TeacherExamSessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.TEACHER_PORTAL_VIEW);
  const teacher = await getTeacherByUserId(context.organizationId, context.userId);
  if (!teacher) return <TeacherUnlinkedState />;

  const sp = await searchParams;
  const page = Math.max(1, Number(param(sp.page)) || 1);

  const [facets, sessions] = await Promise.all([
    teacherExaminationService.getSessionFacets(context.organizationId, teacher.id),
    teacherExaminationService.listSessions(context.organizationId, teacher.id, {
      status: param(sp.status),
      subjectId: param(sp.subjectId),
      periodId: param(sp.periodId),
      role: param(sp.role),
      pending: param(sp.pending),
      page,
    }),
  ]);

  const selects: FilterSelectConfig[] = [
    { param: "status", label: "Estado", options: getTeacherExamStatusOptions("session") },
    {
      param: "subjectId",
      label: "Disciplina",
      options: facets.subjects.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      param: "periodId",
      label: "Período",
      options: facets.periods.map((p) => ({ value: p.id, label: p.name })),
    },
    { param: "role", label: "Papel", options: getTeacherExamStatusOptions("role") },
    {
      param: "pending",
      label: "Pendência",
      options: [{ value: "true", label: "Com trabalho pendente" }],
    },
  ];

  return (
    <div className="space-y-4">
      <ExaminationFilterBar showSearch={false} selects={selects} />
      <TeacherSessionsTable
        items={sessions.items}
        page={sessions.page}
        pageSize={sessions.pageSize}
        total={sessions.total}
      />
    </div>
  );
}
