import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCalendarDashboardData,
  getAcademicYearsByOrganization,
  getAcademicHolidaysByOrganization,
  getAcademicEventsByOrganization,
} from "@/modules/academic-calendar/services/academic-calendar.service";
import { ACADEMIC_STATUS_LABELS, ACADEMIC_EVENT_TYPE_LABELS } from "@/modules/academic-calendar/types";
import { CalendarRange, CalendarClock, Palmtree, CalendarCheck, ArrowRight } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Calendário Académico" };

export default async function AcademicCalendarPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ACADEMIC_CALENDAR_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const [dashboard, yearsResult, holidaysResult, eventsResult] = await Promise.all([
    getCalendarDashboardData(context.organizationId),
    getAcademicYearsByOrganization(context.organizationId, { page: 1, pageSize: 1 }),
    getAcademicHolidaysByOrganization(context.organizationId, { page: 1, pageSize: 1 }),
    getAcademicEventsByOrganization(context.organizationId, { page: 1, pageSize: 1 }),
  ]);

  const { defaultYear, activeTerm, upcomingHolidays, upcomingEvents } = dashboard;

  return (
    <>
      <PageHeader
        title="Calendário Académico"
        description="Visão geral do ano letivo, períodos, feriados e eventos."
      />

      <div className="p-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Anos Letivos" value={yearsResult.total} />
          <StatCard title="Ano Predefinido" value={defaultYear?.name ?? "—"} />
          <StatCard title="Período Ativo" value={activeTerm?.name ?? "—"} />
          <StatCard title="Feriados" value={holidaysResult.total} />
        </div>

        {/* Current year banner */}
        {defaultYear && (
          <div className="rounded-lg border bg-muted/40 p-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CalendarRange className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Ano Letivo Predefinido
                </span>
              </div>
              <h2 className="text-xl font-semibold">{defaultYear.name}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date(defaultYear.startDate).toLocaleDateString("pt-PT")}
                {" — "}
                {new Date(defaultYear.endDate).toLocaleDateString("pt-PT")}
              </p>
              <Badge className="mt-2" variant="outline">
                {ACADEMIC_STATUS_LABELS[defaultYear.status] ?? defaultYear.status}
              </Badge>
            </div>
            {activeTerm && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Período em Curso
                  </span>
                </div>
                <h3 className="text-lg font-medium">{activeTerm.name}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {new Date(activeTerm.startDate).toLocaleDateString("pt-PT")}
                  {" — "}
                  {new Date(activeTerm.endDate).toLocaleDateString("pt-PT")}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Holidays */}
          <div className="rounded-lg border">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Palmtree className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Próximos Feriados</h3>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                <Link href="/academic-calendar/holidays">
                  Ver todos <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
            <div className="divide-y">
              {upcomingHolidays.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-6 text-center">
                  Nenhum feriado próximo.
                </p>
              ) : (
                upcomingHolidays.map((h) => (
                  <div key={h.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{h.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.startDate).toLocaleDateString("pt-PT")}
                        {h.startDate.toString() !== h.endDate.toString() &&
                          ` — ${new Date(h.endDate).toLocaleDateString("pt-PT")}`}
                      </p>
                    </div>
                    {h.isRecurring && (
                      <Badge variant="outline" className="text-xs shrink-0">Recorrente</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="rounded-lg border">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <CalendarCheck className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Próximos Eventos</h3>
              </div>
              <Button variant="ghost" size="sm" asChild className="text-xs gap-1">
                <Link href="/academic-calendar/events">
                  Ver todos <ArrowRight className="size-3" />
                </Link>
              </Button>
            </div>
            <div className="divide-y">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground px-4 py-6 text-center">
                  Nenhum evento próximo.
                </p>
              ) : (
                upcomingEvents.map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(e.startDate).toLocaleDateString("pt-PT")}
                        {e.startDate.toString() !== e.endDate.toString() &&
                          ` — ${new Date(e.endDate).toLocaleDateString("pt-PT")}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {ACADEMIC_EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick nav */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/academic-calendar/years", icon: CalendarRange, label: "Anos Letivos" },
            { href: "/academic-calendar/terms", icon: CalendarClock, label: "Períodos" },
            { href: "/academic-calendar/holidays", icon: Palmtree, label: "Feriados" },
            { href: "/academic-calendar/events", icon: CalendarCheck, label: "Eventos" },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg border p-4 flex flex-col items-start gap-3 hover:bg-accent transition-colors"
            >
              <Icon className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
