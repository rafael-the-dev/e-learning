import { PageHeader } from "@/shared/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getSchedulePeriodsByOrganization,
  getScheduleSlotsByOrganization,
  getAllSchedulePeriods,
  getActiveSlotsCount,
} from "@/modules/schedules/services/schedule.service";
import { SchedulePeriodsTable } from "@/modules/schedules/components/schedule-periods-table";
import { ScheduleSlotsTable } from "@/modules/schedules/components/schedule-slots-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { StatCard } from "@/shared/components/layout/stat-card";
import { CalendarDays } from "lucide-react";

export const metadata = { title: "Horários" };

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    search?: string;
    status?: string;
    periodId?: string;
    dayOfWeek?: string;
    slotStatus?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.SCHEDULE_PERIODS_VIEW);
  // Teacher-scoped users never see this org-wide page — routed to their scoped Portal. See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);

  const sp = await searchParams;
  const activeTab = sp.tab === "slots" ? "slots" : "periods";
  const pagination = normalizePaginationParams(sp.page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const canCreatePeriod = ability.can(PERMISSIONS.SCHEDULE_PERIODS_CREATE);
  const canEditPeriod = ability.can(PERMISSIONS.SCHEDULE_PERIODS_UPDATE);
  const canArchivePeriod = ability.can(PERMISSIONS.SCHEDULE_PERIODS_ARCHIVE);
  const canDeletePeriod = ability.can(PERMISSIONS.SCHEDULE_PERIODS_DELETE);

  const canCreateSlot = ability.can(PERMISSIONS.SCHEDULE_SLOTS_CREATE);
  const canEditSlot = ability.can(PERMISSIONS.SCHEDULE_SLOTS_UPDATE);
  const canArchiveSlot = ability.can(PERMISSIONS.SCHEDULE_SLOTS_ARCHIVE);
  const canDeleteSlot = ability.can(PERMISSIONS.SCHEDULE_SLOTS_DELETE);

  const [periodsResult, slotsResult, allPeriods, activeSlotsCount] = await Promise.all([
    getSchedulePeriodsByOrganization(context.organizationId, {
      ...pagination,
      search: sp.search,
      status: sp.status,
    }),
    getScheduleSlotsByOrganization(context.organizationId, {
      ...pagination,
      schedulePeriodId: sp.periodId,
      dayOfWeek: sp.dayOfWeek,
      status: sp.slotStatus,
    }),
    getAllSchedulePeriods(context.organizationId),
    getActiveSlotsCount(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Horários"
        description="Gerir períodos e slots de horário reutilizáveis."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Períodos" value={periodsResult.total} />
          <StatCard title="Slots" value={slotsResult.total} />
          <StatCard title="Períodos Ativos" value={allPeriods.length} />
          <StatCard title="Slots Ativos" value={activeSlotsCount} />
        </div>

        <Tabs defaultValue={activeTab}>
          <TabsList>
            <TabsTrigger value="periods">Períodos</TabsTrigger>
            <TabsTrigger value="slots">Slots</TabsTrigger>
          </TabsList>

          <TabsContent value="periods" className="mt-4">
            <SchedulePeriodsTable
              result={periodsResult}
              defaultSearch={sp.search}
              defaultStatus={sp.status}
              canCreate={canCreatePeriod}
              canEdit={canEditPeriod}
              canArchive={canArchivePeriod}
              canDelete={canDeletePeriod}
            />
          </TabsContent>

          <TabsContent value="slots" className="mt-4">
            <ScheduleSlotsTable
              result={slotsResult}
              periods={allPeriods}
              defaultPeriodId={sp.periodId}
              defaultDayOfWeek={sp.dayOfWeek}
              defaultStatus={sp.slotStatus}
              canCreate={canCreateSlot}
              canEdit={canEditSlot}
              canArchive={canArchiveSlot}
              canDelete={canDeleteSlot}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
