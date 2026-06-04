import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getClassGroupById } from "@/modules/class-groups/services/class-group.service";
import {
  getSchedulesByClassGroup,
  getActiveSlotsByOrganization,
} from "@/modules/schedules/services/schedule.service";
import { ClassGroupSchedulePanel } from "@/modules/schedules/components/class-group-schedule-panel";
import { NotFoundError } from "@/shared/lib/command";
import {
  BookOpen,
  Pencil,
  Users,
  Calendar,
  Clock,
  GraduationCap,
  Building2,
  CreditCard,
} from "lucide-react";
import { CLASS_GROUP_STATUS_LABELS } from "@/modules/class-groups/types";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Detalhes da Turma" };
}

export default async function ClassGroupDetailPage({
  params,
}: {
  params: Promise<{ classGroupId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASS_GROUPS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { classGroupId } = await params;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canEdit = ability.can(PERMISSIONS.CLASS_GROUPS_UPDATE);
  const canAssignSchedule = ability.can(PERMISSIONS.CLASS_GROUP_SCHEDULES_ASSIGN);
  const canRemoveSchedule = ability.can(PERMISSIONS.CLASS_GROUP_SCHEDULES_REMOVE);

  let group;
  try {
    group = await getClassGroupById(classGroupId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const [schedules, availableSlots] = await Promise.all([
    getSchedulesByClassGroup(classGroupId, context.organizationId),
    canAssignSchedule
      ? getActiveSlotsByOrganization(context.organizationId)
      : Promise.resolve([]),
  ]);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/class-groups" className="hover:text-foreground transition-colors">
        Turmas
      </Link>
      <span>/</span>
      <span className="text-foreground">{group.name}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={group.name}
        description={`${group.courseName}${group.courseLevelName ? ` · ${group.courseLevelName}` : ""}`}
        breadcrumb={breadcrumb}
        actions={
          canEdit ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/class-groups/${group.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 max-w-3xl space-y-6">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={group.status} />
          {group.code && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">
              {group.code}
            </span>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetaCard
            icon={<Users className="size-4 text-muted-foreground" />}
            label="Capacidade"
            value={String(group.capacity)}
          />
          <MetaCard
            icon={<Users className="size-4 text-muted-foreground" />}
            label="Inscritos"
            value="0"
          />
          <MetaCard
            icon={<Clock className="size-4 text-muted-foreground" />}
            label="Horários"
            value={String(schedules.length)}
          />
          <MetaCard
            icon={<BookOpen className="size-4 text-muted-foreground" />}
            label="Estado"
            value={CLASS_GROUP_STATUS_LABELS[group.status] ?? group.status}
          />
        </div>

        {/* Details */}
        <div className="rounded-xl border p-5 space-y-3">
          <h3 className="text-sm font-semibold">Informação</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<BookOpen className="size-3.5" />}
              label="Curso"
              value={group.courseName ?? "—"}
            />
            {group.courseLevelName && (
              <DetailRow
                icon={<GraduationCap className="size-3.5" />}
                label="Nível"
                value={group.courseLevelName}
              />
            )}
            {group.teacherName && (
              <DetailRow
                icon={<GraduationCap className="size-3.5" />}
                label="Professor"
                value={group.teacherName}
              />
            )}
            {group.branchName && (
              <DetailRow
                icon={<Building2 className="size-3.5" />}
                label="Filial"
                value={group.branchName}
              />
            )}
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Data de Início"
              value={
                group.startDate
                  ? new Date(group.startDate).toLocaleDateString("pt-PT")
                  : "—"
              }
            />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Data de Fim"
              value={
                group.endDate
                  ? new Date(group.endDate).toLocaleDateString("pt-PT")
                  : "—"
              }
            />
          </dl>
        </div>

        {/* Schedules */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Horários</h3>
          </div>
          <ClassGroupSchedulePanel
            classGroupId={group.id}
            schedules={schedules}
            availableSlots={availableSlots}
            canAssign={canAssignSchedule}
            canRemove={canRemoveSchedule}
          />
        </div>

        {/* Placeholder: Enrollments */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <h3 className="text-sm font-semibold">Matrículas</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de matrículas em desenvolvimento.
          </p>
        </div>

        {/* Placeholder: Payments */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="size-4" />
            <h3 className="text-sm font-semibold">Pagamentos</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de pagamentos em desenvolvimento.
          </p>
        </div>

        {/* Timestamps */}
        <div className="rounded-xl border p-5 space-y-2">
          <h3 className="text-sm font-semibold">Registo</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Criado a"
              value={new Date(group.createdAt).toLocaleDateString("pt-PT")}
            />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Atualizado a"
              value={new Date(group.updatedAt).toLocaleDateString("pt-PT")}
            />
          </dl>
        </div>
      </div>
    </>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium truncate">{value}</dd>
    </div>
  );
}
