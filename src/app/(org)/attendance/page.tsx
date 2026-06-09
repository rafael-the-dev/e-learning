import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import {
  getAttendanceSessionStats,
  getJustificationStats,
} from "@/modules/attendance/services/attendance.service";
import { Plus, ClipboardList, FileCheck, BarChart3 } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Presenças" };

export default async function AttendancePage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ATTENDANCE_SESSIONS_CREATE);
  const canViewJustifications = ability.can(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_VIEW);

  const [sessionStats, justStats] = await Promise.all([
    getAttendanceSessionStats(context.organizationId),
    canViewJustifications
      ? getJustificationStats(context.organizationId)
      : Promise.resolve({} as Record<string, number>),
  ]);

  const totalSessions = Object.values(sessionStats).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Presenças"
        description="Gerir sessões de presença, registos e justificações."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/attendance/sessions/new">
                <Plus className="size-4 mr-1.5" />
                Nova Sessão
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 space-y-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total de Sessões" value={totalSessions} />
          <StatCard title="Abertas" value={sessionStats["OPEN"] ?? 0} />
          <StatCard title="Concluídas" value={sessionStats["COMPLETED"] ?? 0} />
          {canViewJustifications && (
            <StatCard title="Justificações Pendentes" value={justStats["PENDING"] ?? 0} />
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Link
            href="/attendance/sessions"
            className="group rounded-xl border bg-card p-6 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <ClipboardList className="size-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Sessões</p>
                <p className="text-sm text-muted-foreground">Ver todas as sessões de presença</p>
              </div>
            </div>
          </Link>

          <Link
            href="/attendance/reports"
            className="group rounded-xl border bg-card p-6 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3">
                <BarChart3 className="size-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Relatórios</p>
                <p className="text-sm text-muted-foreground">Taxas de presença por aluno</p>
              </div>
            </div>
          </Link>

          {canViewJustifications && (
            <Link
              href="/attendance/justifications"
              className="group rounded-xl border bg-card p-6 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-primary/10 p-3">
                  <FileCheck className="size-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Justificações</p>
                  <p className="text-sm text-muted-foreground">Aprovar ou rejeitar faltas</p>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
