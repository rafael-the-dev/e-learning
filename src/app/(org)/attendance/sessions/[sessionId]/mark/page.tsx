import { redirect, notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { assertTeacherCanAccessAttendanceSession } from "@/server/auth/teacher-access";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";
import { findAttendanceSessionById } from "@/modules/attendance/repositories/attendance-session.repository";
import { findRecordsBySession } from "@/modules/attendance/repositories/attendance-record.repository";
import {
  getEnrolledStudentsForSession,
} from "@/modules/attendance/services/attendance.service";
import { MarkAttendanceForm } from "@/modules/attendance/components/mark-attendance-form";

export const metadata = { title: "Marcar Presenças" };

export default async function MarkAttendancePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ATTENDANCE_RECORDS_MARK);

  const { sessionId } = await params;
  // Teacher-scoped users may only mark a session they teach (IDOR guard). 404 so
  // we don't disclose existence. See docs/teacher-access-scope.md.
  try {
    await assertTeacherCanAccessAttendanceSession(context, sessionId);
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }

  const session = await findAttendanceSessionById(sessionId, context.organizationId);
  if (!session) notFound();

  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    redirect(`/attendance/sessions/${sessionId}`);
  }

  const [students, existingRecords] = await Promise.all([
    getEnrolledStudentsForSession(
      session.classGroupId,
      session.academicYearId,
      session.academicTermId,
      context.organizationId
    ),
    findRecordsBySession(sessionId, context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Marcar Presenças"
        description={`${session.subject?.name ?? "—"} · ${session.classGroup?.name ?? "—"} · ${new Date(session.sessionDate).toLocaleDateString("pt-PT")}`}
      />
      <div className="p-8">
        {students.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Não existem alunos matriculados nesta turma para o período académico desta sessão.
          </p>
        ) : (
          <MarkAttendanceForm
            sessionId={sessionId}
            sessionDurationMinutes={session.durationMinutes}
            students={students}
            existingRecords={existingRecords}
          />
        )}
      </div>
    </>
  );
}
