import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getSessionFormOptions,
  getLevelSubjectsForCourseLevel,
} from "@/modules/attendance/services/attendance.service";
import { CreateSessionForm } from "@/modules/attendance/components/create-session-form";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Nova Sessão de Presença" };

export default async function NewAttendanceSessionPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ATTENDANCE_SESSIONS_CREATE);
  } catch {
    redirect("/forbidden");
  }

  const options = await getSessionFormOptions(context.organizationId);

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
