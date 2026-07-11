import Link from "next/link";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { Button } from "@/shared/components/ui/button";
import { examinationAdminOverviewService } from "@/modules/examinations/services/admin/examination-admin-overview.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { ExaminationKpiCard, ExaminationSummaryCard } from "@/modules/examinations/components/examination-cards";

export const metadata = { title: "Exames — Painel" };

// Admin dashboard: consumes ONLY the overview read service (no recalculation).
export default async function ExaminationsDashboardPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const o = await examinationAdminOverviewService.getOverview(context);

  const alerts: string[] = [];
  if (o.results.submitted > 0) alerts.push(`${o.results.submitted} resultado(s) a aguardar revisão.`);
  if (o.results.reviewed > 0) alerts.push(`${o.results.reviewed} resultado(s) a aguardar aprovação.`);
  if (o.sessions.completed > 0) alerts.push(`${o.sessions.completed} sessão(ões) a aguardar publicação.`);
  if (o.appeals.pending + o.appeals.underReview > 0) {
    alerts.push(`${o.appeals.pending + o.appeals.underReview} recurso(s) por decidir.`);
  }

  return (
    <div className="space-y-6">
      <ExaminationPageHeader
        title="Painel de Exames"
        description="Visão geral da administração de exames."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm"><Link href="/examinations/sessions">Sessões</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href="/examinations/appeals">Recursos</Link></Button>
            <Button asChild size="sm"><Link href="/examinations/periods">Períodos</Link></Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <ExaminationKpiCard label="Períodos abertos" value={o.periods.open} />
        <ExaminationKpiCard label="Sessões agendadas" value={o.sessions.scheduled} />
        <ExaminationKpiCard label="Em curso" value={o.sessions.inProgress} />
        <ExaminationKpiCard label="A aguardar publicação" value={o.sessions.completed} />
        <ExaminationKpiCard label="Resultados publicados" value={o.results.published} />
        <ExaminationKpiCard label="Recursos pendentes" value={o.appeals.pending + o.appeals.underReview} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <ExaminationSummaryCard
          title="Períodos"
          items={[
            { label: "Rascunho", value: o.periods.draft },
            { label: "Abertos", value: o.periods.open },
            { label: "Bloqueados", value: o.periods.locked },
            { label: "Concluídos", value: o.periods.completed },
          ]}
        />
        <ExaminationSummaryCard
          title="Resultados"
          items={[
            { label: "Rascunho", value: o.results.draft },
            { label: "Submetidos", value: o.results.submitted },
            { label: "Revistos", value: o.results.reviewed },
            { label: "Aprovados", value: o.results.approved },
            { label: "Publicados", value: o.results.published },
          ]}
        />
        <ExaminationSummaryCard title="Alertas">
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem alertas.</p>
          ) : (
            <ul className="list-disc pl-4 text-sm">
              {alerts.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </ExaminationSummaryCard>
      </div>
    </div>
  );
}
