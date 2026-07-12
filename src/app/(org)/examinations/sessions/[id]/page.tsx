import { notFound } from "next/navigation";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { examSessionAdminReadService } from "@/modules/examinations/services/admin/exam-session-admin-read.service";
import { examCandidateAdminReadService } from "@/modules/examinations/services/admin/exam-candidate-admin-read.service";
import { examAttendanceAdminReadService } from "@/modules/examinations/services/admin/exam-attendance-admin-read.service";
import { examResultAdminReadService } from "@/modules/examinations/services/admin/exam-result-admin-read.service";
import { examPublicationAdminReadService } from "@/modules/examinations/services/admin/exam-publication-admin-read.service";
import { examIntegrationAdminReadService } from "@/modules/examinations/services/admin/exam-integration-admin-read.service";
import { examInvigilatorAdminReadService } from "@/modules/examinations/services/admin/exam-invigilator-admin-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { ExaminationStatusBadge } from "@/modules/examinations/components/status-badges";
import { ExaminationSummaryCard, ExaminationKpiCard } from "@/modules/examinations/components/examination-cards";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import { AllowedActionButton } from "@/modules/examinations/components/allowed-action-button";
import { CandidatesTab } from "@/modules/examinations/components/candidates-tab";
import { AttendanceTab } from "@/modules/examinations/components/attendance-tab";
import { ResultsTab } from "@/modules/examinations/components/results-tab";
import { PublicationReadinessCard } from "@/modules/examinations/components/publication-readiness-card";
import { IntegrationStatusCard } from "@/modules/examinations/components/integration-status-card";
import { InvigilatorsTab } from "@/modules/examinations/components/invigilators-tab";

export const metadata = { title: "Exames — Sessão" };

const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" }) : "—";

export default async function ExamSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const { id } = await params;
  const { tab } = await searchParams;

  const session = await examSessionAdminReadService.getDetail(context, id);
  if (!session) notFound();

  // Session-scoped reads, batched. Each read service re-asserts view access + tenant scope.
  const [candidates, roster, results, readiness, binding, integration, invigilators] = await Promise.all([
    examCandidateAdminReadService.listBySession(context, id, {}),
    // Load the whole roster (up to the page cap) so inline marking rarely paginates.
    examAttendanceAdminReadService.getRoster(context, id, { pageSize: 100 }),
    examResultAdminReadService.listBySession(context, id, {}),
    examPublicationAdminReadService.getReadiness(context, id),
    examIntegrationAdminReadService.getBinding(context, id),
    examIntegrationAdminReadService.getIntegrationStatus(context, id),
    examInvigilatorAdminReadService.getPanel(context, id),
  ]);

  const VALID_TABS = ["overview", "candidates", "attendance", "results", "publication", "integration", "invigilators", "activity"];
  const activeTab = tab && VALID_TABS.includes(tab) ? tab : "overview";

  const a = session.allowedActions;

  return (
    <div className="space-y-4">
      <ExaminationPageHeader
        title={session.title}
        description="Gestão completa da sessão de exame."
        actions={<ExaminationStatusBadge kind="session" status={session.status} />}
      />

      <Tabs defaultValue={activeTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="candidates">Candidatos</TabsTrigger>
          <TabsTrigger value="attendance">Assiduidade</TabsTrigger>
          <TabsTrigger value="results">Resultados</TabsTrigger>
          <TabsTrigger value="invigilators">Vigilantes</TabsTrigger>
          <TabsTrigger value="publication">Publicação</TabsTrigger>
          <TabsTrigger value="integration">Integração</TabsTrigger>
          <TabsTrigger value="activity">Atividade</TabsTrigger>
        </TabsList>

        {/* ── Overview + lifecycle actions (gated purely by allowedActions) ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ExaminationSummaryCard
              title="Detalhes da sessão"
              items={[
                { label: "Estado", value: <ExaminationStatusBadge kind="session" status={session.status} /> },
                { label: "Início", value: fmt(session.startsAt) },
                { label: "Fim", value: fmt(session.endsAt) },
                { label: "Capacidade", value: session.capacity },
                { label: "Bloqueada em", value: fmt(session.lockedAt) },
                { label: "Publicada em", value: fmt(session.publishedAt) },
              ]}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ExaminationKpiCard label="Candidatos" value={session.registeredCandidateCount} />
              <ExaminationKpiCard label="Assiduidade" value={session.attendanceMarkedCount} />
              <ExaminationKpiCard label="Resultados" value={session.resultCount} />
            </div>
          </div>

          <ExaminationSummaryCard title="Ciclo de vida">
            <div className="flex flex-wrap gap-2">
              <AllowedActionButton allowed={a.canSchedule} url={`/api/examinations/sessions/${id}/schedule`} label="Agendar" hideWhenDisallowed successMessage="Sessão agendada" />
              <AllowedActionButton allowed={a.canLock} url={`/api/examinations/sessions/${id}/lock`} label="Bloquear" variant="secondary" hideWhenDisallowed successMessage="Sessão bloqueada" />
              <AllowedActionButton allowed={a.canStart} url={`/api/examinations/sessions/${id}/start`} label="Iniciar" variant="secondary" hideWhenDisallowed successMessage="Sessão iniciada" />
              <AllowedActionButton allowed={a.canComplete} url={`/api/examinations/sessions/${id}/complete`} label="Concluir" hideWhenDisallowed confirm confirmTitle="Concluir sessão" successMessage="Sessão concluída" />
              <AllowedActionButton allowed={a.canCancel} url={`/api/examinations/sessions/${id}/cancel`} label="Cancelar" variant="destructive" hideWhenDisallowed reasonRequired reasonLabel="Motivo do cancelamento" confirmTitle="Cancelar sessão" successMessage="Sessão cancelada" />
            </div>
          </ExaminationSummaryCard>
        </TabsContent>

        <TabsContent value="candidates">
          <CandidatesTab
            sessionId={id}
            levelSubjectId={session.levelSubjectId}
            items={candidates.items}
            page={candidates.page}
            pageSize={candidates.pageSize}
            total={candidates.total}
          />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab sessionId={id} roster={roster} />
        </TabsContent>

        <TabsContent value="results">
          <ResultsTab sessionId={id} items={results.items} page={results.page} pageSize={results.pageSize} total={results.total} />
        </TabsContent>

        <TabsContent value="invigilators">
          <InvigilatorsTab sessionId={id} panel={invigilators} />
        </TabsContent>

        <TabsContent value="publication">
          <PublicationReadinessCard readiness={readiness} />
        </TabsContent>

        <TabsContent value="integration">
          <IntegrationStatusCard binding={binding} status={integration} />
        </TabsContent>

        {/* No backend activity read service exists (engine frozen) — honest empty state. */}
        <TabsContent value="activity">
          <ExaminationEmptyState
            title="Registo de atividade indisponível"
            description="O histórico de eventos da sessão não está exposto neste portal."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
