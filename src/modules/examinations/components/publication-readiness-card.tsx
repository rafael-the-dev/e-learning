"use client";

import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { ExamPublicationReadinessDto } from "@/modules/examinations/types/portal";
import { AllowedActionButton } from "./allowed-action-button";

// Publication readiness — blockers are ALWAYS shown (never hidden). Publish/Retract
// are gated purely by readiness.allowedActions (server-computed); the command remains
// the authority. No status branching here.
export function PublicationReadinessCard({ readiness }: { readiness: ExamPublicationReadinessDto }) {
  const id = readiness.examSessionId;
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

        {readiness.downstreamConsumed && (
          <Badge variant="info">Consumido a jusante (integrado)</Badge>
        )}

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
          />
        </div>
      </CardContent>
    </Card>
  );
}
