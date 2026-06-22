"use client";

import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle2, MinusCircle, XCircle, Clock, FileDown, RotateCcw } from "lucide-react";
import { buildErrorReportCsv } from "@/modules/students/import/services/error-report.service";
import type { ImportReport } from "@/modules/students/import/types";

interface ImportSummaryProps {
  report: ImportReport;
  onReset: () => void;
}

export function ImportSummary({ report, onReset }: ImportSummaryProps) {
  const durationSeconds = report.durationMs != null ? (report.durationMs / 1000).toFixed(1) : "—";
  const hasFailures = report.skippedCount + report.failedCount > 0;

  function downloadErrorReport() {
    const csv = buildErrorReportCsv(report.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-erros-importacao.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard
          title="Importados"
          value={report.importedCount}
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
        />
        <StatCard
          title="Ignorados"
          value={report.skippedCount}
          icon={<MinusCircle className="size-4 text-amber-500" />}
          description="não validados"
        />
        <StatCard
          title="Falhados"
          value={report.failedCount}
          icon={<XCircle className="size-4 text-red-500" />}
          description="erro ao gravar"
        />
        <StatCard
          title="Tempo Total"
          value={`${durationSeconds}s`}
          icon={<Clock className="size-4 text-muted-foreground" />}
        />
      </ExecutiveKpiGrid>

      <div className="flex items-center gap-2">
        {hasFailures && (
          <Button size="sm" variant="outline" onClick={downloadErrorReport}>
            <FileDown className="size-4 mr-1.5" />
            Descarregar Relatório de Erros
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onReset}>
          <RotateCcw className="size-4 mr-1.5" />
          Importar Outro Ficheiro
        </Button>
      </div>
    </div>
  );
}
