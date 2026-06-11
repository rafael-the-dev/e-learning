"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  ASSESSMENT_POLICY_STATUS_LABELS,
  ASSESSMENT_CALCULATION_METHOD_LABELS,
  ASSESSMENT_ROUNDING_METHOD_LABELS,
} from "@/modules/assessments/types";
import { AssessmentPolicyDrawer } from "./assessment-policy-drawer";
import type { AssessmentPolicy } from "@/modules/assessments/types";

interface Props {
  policy: AssessmentPolicy;
  canEdit: boolean;
}

const statusVariant = (s: string) =>
  s === "ACTIVE" ? "default" : s === "INACTIVE" ? "secondary" : "destructive";

export function AssessmentPolicyDetailClient({ policy, canEdit }: Props) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Regras da Política</CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4 mr-2" />
              Editar Política
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Disciplina</dt>
              <dd className="font-medium mt-0.5">{policy.subjectName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nível</dt>
              <dd className="font-medium mt-0.5">{policy.courseLevelName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="mt-0.5">
                <Badge variant={statusVariant(policy.status)}>
                  {ASSESSMENT_POLICY_STATUS_LABELS[policy.status] ?? policy.status}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Método de Cálculo</dt>
              <dd className="font-medium mt-0.5">
                {ASSESSMENT_CALCULATION_METHOD_LABELS[policy.calculationMethod] ??
                  policy.calculationMethod}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Arredondamento</dt>
              <dd className="font-medium mt-0.5">
                {ASSESSMENT_ROUNDING_METHOD_LABELS[policy.roundingMethod] ??
                  policy.roundingMethod}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nota Mínima de Aprovação</dt>
              <dd className="font-medium mt-0.5">{policy.minimumPassingGrade}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Permite Recuperação</dt>
              <dd className="font-medium mt-0.5">{policy.allowRetake ? "Sim" : "Não"}</dd>
            </div>
            {policy.allowRetake && (
              <div>
                <dt className="text-muted-foreground">Máx. Recuperações</dt>
                <dd className="font-medium mt-0.5">{policy.maxRetakes}</dd>
              </div>
            )}
            {policy.description && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-muted-foreground">Descrição</dt>
                <dd className="mt-0.5">{policy.description}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <AssessmentPolicyDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        policy={policy}
      />
    </>
  );
}
