import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { ListChecks, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ValidationResult } from "@/modules/teachers/import/types";

interface ValidationResultsProps {
  result: ValidationResult;
}

export function ValidationResults({ result }: ValidationResultsProps) {
  return (
    <ExecutiveKpiGrid>
      <StatCard
        title="Total de Linhas"
        value={result.totalRows}
        icon={<ListChecks className="size-4 text-muted-foreground" />}
      />
      <StatCard
        title="Válidas"
        value={result.validRows}
        icon={<CheckCircle2 className="size-4 text-emerald-500" />}
        description="prontas para importar"
      />
      <StatCard
        title="Com Avisos"
        value={result.warningRows}
        icon={<AlertTriangle className="size-4 text-amber-500" />}
        description="importáveis, a rever"
      />
      <StatCard
        title="Com Erros"
        value={result.errorRows}
        icon={<XCircle className="size-4 text-red-500" />}
        description="não serão importadas"
      />
    </ExecutiveKpiGrid>
  );
}
