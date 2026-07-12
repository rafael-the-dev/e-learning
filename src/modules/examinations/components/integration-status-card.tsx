"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type {
  ExamGradeBindingDto,
  ExamIntegrationStatusDto,
} from "@/modules/examinations/types/portal";
import { ExaminationStatusBadge } from "./status-badges";
import { AllowedActionButton } from "./allowed-action-button";

// Grade binding + per-result integration state. Integrate/reconcile update THIS card's
// read model in place (directed refetch of the integration-status + binding endpoints) —
// no global reload, tab/scroll preserved. The server response is the source of truth.
export function IntegrationStatusCard({
  binding: initialBinding,
  status: initialStatus,
}: {
  binding: ExamGradeBindingDto;
  status: ExamIntegrationStatusDto;
}) {
  const [binding, setBinding] = useState(initialBinding);
  const [status, setStatus] = useState(initialStatus);
  const sessionId = status.examSessionId;

  async function refetch(): Promise<void> {
    const [s, b] = await Promise.all([
      fetch(`/api/examinations/sessions/${sessionId}/integration-status`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/examinations/sessions/${sessionId}/grade-binding`).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (s) setStatus(s as ExamIntegrationStatusDto);
    if (b) setBinding(b as ExamGradeBindingDto);
  }

  // Refetch on tab-enter (Radix remounts the tab): keeps this card fresh after a publish
  // or an integrate done elsewhere, without a global reload.
  useEffect(() => {
    void (async () => {
      await refetch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              <div className="capitalize text-muted-foreground">{k}</div>
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
                  onSuccess={refetch}
                />
                <AllowedActionButton
                  allowed={r.canReconcile}
                  url={`/api/examinations/results/${r.examResultId}/reconcile`}
                  body={{ dryRun: false }}
                  label="Reconciliar"
                  variant="secondary"
                  successMessage="Integração reconciliada"
                  onSuccess={refetch}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
