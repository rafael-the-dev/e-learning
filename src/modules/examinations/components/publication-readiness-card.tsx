"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { ExamPublicationReadinessDto } from "@/modules/examinations/types/portal";
import { AllowedActionButton } from "./allowed-action-button";

// Publication readiness — blockers are ALWAYS shown. Publish/Retract are gated purely by
// readiness.allowedActions (server-computed). Publish/retract change several projections at
// once, so on success we do a DIRECTED refetch of THIS card's readiness (never invent state,
// never global router.refresh). Cross-tab projections (results/integration) update via their
// own surfaces. No status branching here.
export function PublicationReadinessCard({ readiness: initial }: { readiness: ExamPublicationReadinessDto }) {
  const [readiness, setReadiness] = useState(initial);
  const id = readiness.examSessionId;

  async function refetch(): Promise<void> {
    const res = await fetch(`/api/examinations/sessions/${id}/publication-readiness`);
    if (res.ok) setReadiness((await res.json()) as ExamPublicationReadinessDto);
  }

  // Refetch on tab-enter — reflects result/session changes made in other tabs.
  useEffect(() => {
    void (async () => {
      await refetch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">Publicação</CardTitle>
        <Badge variant={readiness.ready ? "success" : "warning"}>
          {readiness.ready ? "Pronto a publicar" : "Não pronto"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Candidatos requeridos</span>
            <span className="font-medium">{readiness.requiredCandidateCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Resultados</span>
            <span className="font-medium">{readiness.resultCount}</span>
          </div>
        </div>

        {readiness.downstreamConsumed && <Badge variant="info">Consumido a jusante (integrado)</Badge>}

        {readiness.blockers.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">Bloqueios à publicação</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-amber-800">
              {readiness.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <AllowedActionButton
            allowed={readiness.allowedActions.canPublish}
            url={`/api/examinations/sessions/${id}/publish`}
            label="Publicar"
            successMessage="Resultados publicados"
            onSuccess={refetch}
          />
          <AllowedActionButton
            allowed={readiness.allowedActions.canRetract}
            url={`/api/examinations/sessions/${id}/retract`}
            label="Retirar publicação"
            variant="destructive"
            reasonRequired
            reasonLabel="Motivo da retração"
            confirmTitle="Retirar publicação"
            successMessage="Publicação retirada"
            onSuccess={refetch}
          />
        </div>
      </CardContent>
    </Card>
  );
}
