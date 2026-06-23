import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { findAttendanceSessionById } from "@/modules/attendance/repositories/attendance-session.repository";
import { findRecordsBySession } from "@/modules/attendance/repositories/attendance-record.repository";
import { getSessionRecordsSummary } from "@/modules/attendance/services/attendance.service";
import { ATTENDANCE_RECORD_STATUS_LABELS, ATTENDANCE_RECORD_STATUS_COLORS } from "@/modules/attendance/types";
import { ClipboardList, Calendar, Clock, User, Building } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export const metadata = { title: "Sessão de Presença" };

export default async function AttendanceSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);

  const { sessionId } = await params;
  const [session, records, summary] = await Promise.all([
    findAttendanceSessionById(sessionId, context.organizationId),
    findRecordsBySession(sessionId, context.organizationId),
    getSessionRecordsSummary(sessionId, context.organizationId),
  ]);

  if (!session) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canMark = ability.can(PERMISSIONS.ATTENDANCE_RECORDS_MARK);
  const canComplete = ability.can(PERMISSIONS.ATTENDANCE_SESSIONS_COMPLETE);
  const isTerminal = session.status === "COMPLETED" || session.status === "CANCELLED";

  return (
    <>
      <PageHeader
        title={session.title ?? `Sessão de ${session.subject?.name ?? "—"}`}
        description={`${session.classGroup?.name ?? "—"} · ${new Date(session.sessionDate).toLocaleDateString("pt-PT")}`}
        actions={
          <div className="flex gap-2">
            {canMark && !isTerminal && (
              <Button asChild size="sm">
                <Link href={`/attendance/sessions/${sessionId}/mark`}>
                  <ClipboardList className="size-4 mr-1.5" />
                  Marcar Presenças
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Info card */}
        <div className="rounded-xl border bg-card p-6 grid sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="size-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Data:</span>
            <span className="font-medium">
              {new Date(session.sessionDate).toLocaleDateString("pt-PT")}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="size-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Horário:</span>
            <span className="font-medium font-mono">
              {session.startTime} – {session.endTime} ({session.durationMinutes} min)
            </span>
          </div>
          {session.teacher && (
            <div className="flex items-center gap-3 text-sm">
              <User className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Professor:</span>
              <span className="font-medium">
                {session.teacher.firstName} {session.teacher.lastName}
              </span>
            </div>
          )}
          {session.classroom && (
            <div className="flex items-center gap-3 text-sm">
              <Building className="size-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Sala:</span>
              <span className="font-medium">{session.classroom.name}</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Estado:</span>
            <StatusBadge status={session.status} />
          </div>
        </div>

        {/* Attendance summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {(["PRESENT", "ABSENT", "LATE", "EXCUSED", "REMOTE"] as const).map((s) => (
            <div key={s} className="rounded-lg border bg-card p-4 text-center">
              <p className={cn("text-2xl font-bold", ATTENDANCE_RECORD_STATUS_COLORS[s].replace("bg-", "text-").split(" ")[1])}>
                {summary[s] ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {ATTENDANCE_RECORD_STATUS_LABELS[s]}
              </p>
            </div>
          ))}
        </div>

        {/* Records table */}
        {records.length > 0 && (
          <div className="rounded-xl border">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-medium">Registos de Presença</p>
            </div>
            <div className="divide-y">
              {records.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {rec.student?.firstName} {rec.student?.lastName}
                    </p>
                    {rec.student?.code && (
                      <p className="text-xs text-muted-foreground font-mono">{rec.student.code}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {rec.minutesAttended} min
                    </span>
                    <StatusBadge status={rec.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
