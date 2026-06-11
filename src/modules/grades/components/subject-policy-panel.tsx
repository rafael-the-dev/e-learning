"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Archive, CheckCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Separator } from "@/shared/components/ui/separator";
import { toast } from "@/shared/hooks/use-toast";
import { GradePolicyDrawer } from "@/modules/grades/components/grade-policy-drawer";
import { GradeComponentsList } from "@/modules/grades/components/grade-components-list";
import {
  archiveAssessmentPolicyAction,
  activateAssessmentPolicyAction,
} from "@/modules/grades/actions/grade.actions";
import {
  SUBJECT_POLICY_STATUS_LABELS,
  GRADE_CALCULATION_METHOD_LABELS,
  GRADE_ROUNDING_METHOD_LABELS,
} from "@/modules/grades/types";
import type { SubjectAssessmentPolicy, SubjectAssessmentComponent } from "@/modules/grades/types";

interface Props {
  levelSubjectId: string;
  policy: SubjectAssessmentPolicy | null;
  components: SubjectAssessmentComponent[];
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canManageComponents: boolean;
}

export function SubjectPolicyPanel({
  levelSubjectId,
  policy,
  components,
  canCreate,
  canEdit,
  canArchive,
  canManageComponents,
}: Props) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [activating, setActivating] = useState(false);

  async function handleArchive() {
    if (!policy) return;
    const res = await archiveAssessmentPolicyAction({ policyId: policy.id });
    if (res.success) {
      toast.success("Política arquivada.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar política.");
    }
    setArchiving(false);
  }

  async function handleActivate() {
    if (!policy) return;
    const res = await activateAssessmentPolicyAction({ policyId: policy.id });
    if (res.success) {
      toast.success("Política ativada.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao ativar política.");
    }
    setActivating(false);
  }

  if (!policy) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Sem política de avaliação"
          description="Crie uma política de avaliação para definir os componentes e o método de cálculo da nota final."
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setDrawerOpen(true)}>
                <Plus className="size-4 mr-2" />
                Criar Política
              </Button>
            ) : undefined
          }
        />
        <GradePolicyDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          levelSubjectId={levelSubjectId}
        />
      </div>
    );
  }

  const statusVariant =
    policy.status === "ACTIVE"
      ? "default"
      : policy.status === "DRAFT"
        ? "secondary"
        : "outline";

  return (
    <div className="space-y-6">
      {/* Policy header */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{policy.name}</h3>
              <Badge variant={statusVariant}>
                {SUBJECT_POLICY_STATUS_LABELS[policy.status] ?? policy.status}
              </Badge>
            </div>
            {policy.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{policy.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canEdit && policy.status !== "ARCHIVED" && (
              <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
                <Pencil className="size-3.5 mr-1.5" />
                Editar
              </Button>
            )}
            {canEdit && policy.status === "DRAFT" && (
              <Button variant="outline" size="sm" onClick={() => setActivating(true)}>
                <CheckCircle className="size-3.5 mr-1.5" />
                Ativar
              </Button>
            )}
            {canArchive && policy.status !== "ARCHIVED" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setArchiving(true)}
              >
                <Archive className="size-3.5 mr-1.5" />
                Arquivar
              </Button>
            )}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Método de Cálculo</div>
            <div className="font-medium">
              {GRADE_CALCULATION_METHOD_LABELS[policy.calculationMethod] ?? policy.calculationMethod}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Arredondamento</div>
            <div className="font-medium">
              {GRADE_ROUNDING_METHOD_LABELS[policy.roundingMethod] ?? policy.roundingMethod}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Nota Mínima</div>
            <div className="font-medium">{policy.minimumPassingGrade}%</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Recuperação</div>
            <div className="font-medium">{policy.allowRecovery ? "Sim" : "Não"}</div>
          </div>
        </div>
      </div>

      {/* Components */}
      <GradeComponentsList
        policy={policy}
        components={components}
        canManage={canManageComponents}
      />

      <GradePolicyDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        levelSubjectId={levelSubjectId}
        policy={policy}
      />

      <ConfirmDialog
        open={archiving}
        onOpenChange={(v) => { if (!v) setArchiving(false); }}
        onConfirm={handleArchive}
        title="Arquivar Política"
        description="Tem a certeza que pretende arquivar esta política de avaliação?"
        confirmLabel="Arquivar"
      />

      <ConfirmDialog
        open={activating}
        onOpenChange={(v) => { if (!v) setActivating(false); }}
        onConfirm={handleActivate}
        title="Ativar Política"
        description="Tem a certeza que pretende ativar esta política? Certifique-se de que o peso total dos componentes é 100%."
        confirmLabel="Ativar"
      />
    </div>
  );
}
