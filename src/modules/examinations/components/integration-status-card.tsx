"use client";

import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type {
  ExamGradeBindingDto,
  ExamIntegrationStatusDto,
} from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { AllowedActionButton } from "./allowed-action-button";

// Grade binding + per-result integration state. Binding is EXPLICIT (no heuristic);
// maxScore/maxGrade mismatch + non-scored UNSUPPORTED are shown honestly. Integrate/
// reconcile are gated by each row's server-computed flags. No Transcript/Certificate.
export function IntegrationStatusCard({
  binding,
  status,
}: {
  binding: ExamGradeBindingDto;
  status: ExamIntegrationStatusDto;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Integração com as Notas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Componente associado</span>
            <span className="font-medium">{binding.componentName ?? "— (não associado)"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pontuação máx. exame / componente</span>
            <span className="font-medium tabular-nums">
              {binding.examMaxScore ?? "—"} / {binding.componentMaxGrade ?? "—"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={binding.compatible ? "success" : "secondary"}>
              {binding.compatible ? "Compatível" : "Sem associação compatível"}
            </Badge>
            {binding.consumed && <Badge variant="info">Consumido (imutável)</Badge>}
          </div>
          {binding.blockers.length > 0 && (
            <ul className="list-disc pl-4 text-xs text-amber-800">
              {binding.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {(["current", "missing", "stale", "unsupported", "failed"] as const).map((k) => (
            <div key={k} className="rounded border p-2 text-center">
              <div className="text-lg font-semibold tabular-nums">{status.summary[k]}</div>
              <div className="text-muted-foreground capitalize">{k}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {status.results.map((r) => (
            <div key={r.examResultId} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
              <div className="flex items-center gap-2">
                <ExaminationStatusBadge kind="gradeState" status={r.gradeState} />
                <span className="text-xs text-muted-foreground">{r.progressionState}</span>
              </div>
              <div className="flex gap-2">
                <AllowedActionButton
                  allowed={r.canIntegrate}
                  url={`/api/examinations/results/${r.examResultId}/integrate`}
                  label="Integrar"
                  successMessage="Resultado integrado"
                />
                <AllowedActionButton
                  allowed={r.canReconcile}
                  url={`/api/examinations/results/${r.examResultId}/reconcile`}
                  body={{ dryRun: false }}
                  label="Reconciliar"
                  variant="secondary"
                  successMessage="Integração reconciliada"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
