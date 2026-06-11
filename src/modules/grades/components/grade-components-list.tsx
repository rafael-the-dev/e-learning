"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { toast } from "@/shared/hooks/use-toast";
import { GradeComponentDrawer } from "@/modules/grades/components/grade-component-drawer";
import { deleteAssessmentComponentAction } from "@/modules/grades/actions/grade.actions";
import {
  GRADE_COMPONENT_TYPE_LABELS,
  GRADE_COMPONENT_STATUS_LABELS,
} from "@/modules/grades/types";
import type { SubjectAssessmentComponent, SubjectAssessmentPolicy } from "@/modules/grades/types";

interface Props {
  policy: SubjectAssessmentPolicy;
  components: SubjectAssessmentComponent[];
  canManage: boolean;
}

export function GradeComponentsList({ policy, components, canManage }: Props) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SubjectAssessmentComponent | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeComponents = components.filter((c) => c.status !== "ARCHIVED");
  const totalWeight = activeComponents.reduce((s, c) => s + c.weight, 0);
  const remainingWeight = Math.max(0, 100 - totalWeight);
  const weightOk = policy.calculationMethod !== "WEIGHTED_AVERAGE" || Math.round(totalWeight) === 100;

  function openCreate() {
    setEditingComponent(undefined);
    setDrawerOpen(true);
  }

  function openEdit(comp: SubjectAssessmentComponent) {
    setEditingComponent(comp);
    setDrawerOpen(true);
  }

  async function handleDelete(id: string) {
    const res = await deleteAssessmentComponentAction({ componentId: id });
    if (res.success) {
      toast.success("Componente removido.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao remover componente.");
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-sm">Componentes</h3>
          {policy.calculationMethod === "WEIGHTED_AVERAGE" && (
            <Badge variant={weightOk ? "default" : "destructive"} className="text-xs">
              {totalWeight.toFixed(1)}% / 100%
            </Badge>
          )}
        </div>
        {canManage && policy.status !== "ARCHIVED" && (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="size-3.5 mr-1.5" />
            Adicionar
          </Button>
        )}
      </div>

      {!weightOk && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          O peso total dos componentes deve ser 100% para ativar a política.
          Faltam {remainingWeight.toFixed(1)}% para completar.
        </div>
      )}

      {activeComponents.length === 0 ? (
        <EmptyState
          title="Sem componentes"
          description="Adicione componentes de avaliação para esta política."
        />
      ) : (
        <div className="rounded-md border divide-y">
          {activeComponents.map((comp) => (
            <div key={comp.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs w-5 text-right">{comp.order}</span>
                <div>
                  <div className="font-medium">{comp.name}</div>
                  <div className="text-muted-foreground text-xs flex items-center gap-2">
                    <span>{GRADE_COMPONENT_TYPE_LABELS[comp.componentType] ?? comp.componentType}</span>
                    <span>·</span>
                    <span>Nota máx: {comp.maxGrade}</span>
                    {comp.isRequired && (
                      <>
                        <span>·</span>
                        <span className="text-orange-600">Obrigatório</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {policy.calculationMethod === "WEIGHTED_AVERAGE" && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {comp.weight}%
                  </Badge>
                )}
                {canManage && policy.status !== "ARCHIVED" && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openEdit(comp)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={() => setDeletingId(comp.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <GradeComponentDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        assessmentPolicyId={policy.id}
        component={editingComponent}
        remainingWeight={
          editingComponent
            ? remainingWeight + editingComponent.weight
            : remainingWeight
        }
      />

      <ConfirmDialog
        open={!!deletingId}
        onOpenChange={(v) => { if (!v) setDeletingId(null); }}
        onConfirm={() => { if (deletingId) handleDelete(deletingId); }}
        title="Remover Componente"
        description="Tem a certeza que pretende remover este componente? Esta ação não pode ser revertida."
        confirmLabel="Remover"
      />
    </div>
  );
}
