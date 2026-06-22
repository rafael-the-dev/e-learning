import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ListChecks, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getImportJobDetail } from "@/modules/import-jobs/repositories/import-job.repository";
import { getImportJobEventsTimeline } from "@/modules/import-jobs/services/import-job-history.service";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ImportJobEventsTimeline } from "@/modules/import-jobs/components/import-job-events-timeline";
import { IMPORT_JOB_TYPE_LABELS, IMPORT_JOB_STATUS_LABELS } from "@/modules/import-jobs/types";

export const metadata = { title: "Detalhe da Importação" };

export default async function ImportJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  let context;
  try {
    context = await requirePermission(PERMISSIONS.IMPORT_JOBS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { jobId } = await params;

  const job = await getImportJobDetail(jobId, context.organizationId);
  if (!job) notFound();

  const events = await getImportJobEventsTimeline(context.organizationId, jobId);

  const durationSeconds =
    job.executionSummary?.durationMs != null ? (job.executionSummary.durationMs / 1000).toFixed(1) : "—";

  return (
    <>
      <PageHeader
        title={job.uploadedFileName}
        description={`Importação de ${IMPORT_JOB_TYPE_LABELS[job.type]}`}
        breadcrumb={
          <Link
            href="/settings/import-jobs"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Histórico de Importações
          </Link>
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/30">
          <div>
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="text-sm font-medium mt-0.5">{IMPORT_JOB_TYPE_LABELS[job.type]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estado</p>
            <p className="text-sm font-medium mt-0.5">{IMPORT_JOB_STATUS_LABELS[job.status]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ficheiro</p>
            <p className="text-sm font-medium font-mono mt-0.5">{job.uploadedFileName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Importado Por</p>
            <p className="text-sm font-medium mt-0.5">{job.uploadedByName ?? "—"}</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Validação</CardTitle>
          </CardHeader>
          <CardContent>
            <ExecutiveKpiGrid>
              <StatCard
                title="Total de Linhas"
                value={job.validationSummary?.totalRows ?? job.totalRows}
                icon={<ListChecks className="size-4 text-muted-foreground" />}
              />
              <StatCard
                title="Válidas"
                value={job.validationSummary?.validRows ?? "—"}
                icon={<CheckCircle2 className="size-4 text-emerald-500" />}
              />
              <StatCard
                title="Avisos"
                value={job.validationSummary?.warningRows ?? "—"}
                icon={<AlertTriangle className="size-4 text-amber-500" />}
              />
              <StatCard
                title="Erros"
                value={job.validationSummary?.errorRows ?? "—"}
                icon={<XCircle className="size-4 text-red-500" />}
              />
            </ExecutiveKpiGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Execução</CardTitle>
          </CardHeader>
          <CardContent>
            <ExecutiveKpiGrid>
              <StatCard
                title="Sucesso"
                value={job.executionSummary?.successRows ?? job.successRows}
                icon={<CheckCircle2 className="size-4 text-emerald-500" />}
              />
              <StatCard
                title="Falhas"
                value={job.executionSummary?.failedRows ?? job.failedRows}
                icon={<XCircle className="size-4 text-red-500" />}
              />
              <StatCard
                title="Duração"
                value={`${durationSeconds}s`}
                icon={<Clock className="size-4 text-muted-foreground" />}
              />
            </ExecutiveKpiGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportJobEventsTimeline events={events} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
