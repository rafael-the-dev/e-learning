"use client";

import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ImportJobFilters } from "@/modules/import-jobs/components/import-job-filters";
import { ImportJobsTable } from "@/modules/import-jobs/components/import-jobs-table";
import {
  History,
  CalendarClock,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Percent,
} from "lucide-react";
import type {
  ImportJobKPIs,
  ImportJobListItem,
  ImportJobStatus,
  ImportJobType,
} from "@/modules/import-jobs/types";
import type { PaginatedResult } from "@/shared/types/common";

interface ImportJobsClientProps {
  result: PaginatedResult<ImportJobListItem>;
  kpis: ImportJobKPIs;
  users: { id: string; name: string }[];
  search?: string;
  type?: ImportJobType;
  status?: ImportJobStatus;
  uploadedById?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function ImportJobsClient({
  result,
  kpis,
  users,
  search,
  type,
  status,
  uploadedById,
  dateFrom,
  dateTo,
}: ImportJobsClientProps) {
  return (
    <>
      <PageHeader
        title="Histórico de Importações"
        description="Auditoria, troubleshooting e métricas de todas as importações realizadas na organização."
      />
      <div className="p-4 sm:p-8 space-y-6">
        <ExecutiveKpiGrid>
          <StatCard
            title="Total de Importações"
            value={kpis.totalImports}
            icon={<History className="size-4 text-muted-foreground" />}
          />
          <StatCard
            title="Importações Hoje"
            value={kpis.importsToday}
            icon={<CalendarClock className="size-4 text-blue-500" />}
          />
          <StatCard
            title="Bem-Sucedidas"
            value={kpis.successfulImports}
            icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          />
          <StatCard
            title="Falhadas"
            value={kpis.failedImports}
            icon={<XCircle className="size-4 text-red-500" />}
          />
          <StatCard
            title="Registos Importados"
            value={kpis.totalRecordsImported}
            icon={<FileSpreadsheet className="size-4 text-indigo-500" />}
          />
          <StatCard
            title="Taxa de Sucesso"
            value={`${kpis.successRate}%`}
            icon={<Percent className="size-4 text-amber-500" />}
          />
        </ExecutiveKpiGrid>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Importações</CardTitle>
            <ImportJobFilters
              users={users}
              defaultSearch={search}
              defaultType={type}
              defaultStatus={status}
              defaultUploadedById={uploadedById}
              defaultDateFrom={dateFrom}
              defaultDateTo={dateTo}
            />
          </CardHeader>
          <CardContent className="p-0 sm:px-4 sm:pb-4">
            <ImportJobsTable result={result} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
