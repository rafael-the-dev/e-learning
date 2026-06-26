import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { resolveTeacherScope } from "@/server/auth/teacher-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getSessionFormOptions,
  getLevelSubjectsForCourseLevel,
} from "@/modules/attendance/services/attendance.service";
import { CreateSessionForm } from "@/modules/attendance/components/create-session-form";

export const metadata = { title: "Nova Sessão de Presença" };

export default async function NewAttendanceSessionPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ATTENDANCE_SESSIONS_CREATE);

  // Teacher-scoped users only see their own class groups in the dropdown; an
  // unlinked teacher (teacherId undefined) sees none. See docs/teacher-access-scope.md.
  const scope = await resolveTeacherScope(context);
  const classGroupTeacherId = scope.isTeacherScoped ? (scope.teacherId ?? "__none__") : undefined;

  const options = await getSessionFormOptions(context.organizationId, classGroupTeacherId);

  async function fetchLevelSubjects(courseLevelId: string) {
    "use server";
    return getLevelSubjectsForCourseLevel(courseLevelId, context.organizationId);
  }

  return (
    <>
      <PageHeader
        title="Nova Sessão de Presença"
        description="Criar uma nova sessão para marcar presenças."
      />
      <div className="p-8">
        <CreateSessionForm
          academicYears={options.academicYears}
          classGroups={options.classGroups}
          teachers={options.teachers}
          classrooms={options.classrooms}
          getLevelSubjects={fetchLevelSubjects}
        />
      </div>
    </>
  );
}
