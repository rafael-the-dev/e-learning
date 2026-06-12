"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronRight, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import {
  createPrerequisiteGroupAction,
  archivePrerequisiteGroupAction,
  createPrerequisiteItemAction,
  deletePrerequisiteItemAction,
} from "@/modules/prerequisites/actions/prerequisite.actions";
import {
  PREREQUISITE_LOGIC_TYPE_LABELS,
  PREREQUISITE_REQUIREMENT_TYPE_LABELS,
} from "@/modules/prerequisites/types";
import type { PrerequisiteGroup } from "@/modules/prerequisites/types";

interface PrerequisiteItemData {
  id: string;
  requirementType: string;
  minimumRequiredGrade: { toNumber(): number } | number | null;
  prerequisiteLevelSubject: {
    id: string;
    subject: { name: string };
    courseLevel: { name: string; course: { name: string } } | null;
  };
}

interface GroupWithItems {
  id: string;
  organizationId: string;
  levelSubjectId: string;
  logicType: string;
  name: string | null;
  description: string | null;
  status: string;
  items: PrerequisiteItemData[];
}

interface AvailableLevelSubject {
  id: string;
  subjectName: string;
  courseLevelName: string;
  courseName: string;
}

interface Props {
  levelSubjectId: string;
  groups: GroupWithItems[];
  availableLevelSubjects: AvailableLevelSubject[];
  canManage: boolean;
  onMutate?: () => void;
}

const LOGIC_TYPE_BADGE_CLASS: Record<string, string> = {
  ALL: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ANY: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const REQUIREMENT_BADGE_CLASS: Record<string, string> = {
  MUST_PASS: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  MUST_COMPLETE: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  MINIMUM_GRADE: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export function SubjectPrerequisitesPanel({
  levelSubjectId,
  groups,
  availableLevelSubjects,
  canManage,
  onMutate,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(groups.map((g) => g.id)));
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [deleteItemConfirmId, setDeleteItemConfirmId] = useState<string | null>(null);
  const [addingItemToGroup, setAddingItemToGroup] = useState<string | null>(null);
  const [newItemSubject, setNewItemSubject] = useState("");
  const [newItemRequirementType, setNewItemRequirementType] = useState("MUST_PASS");
  const [newItemMinGrade, setNewItemMinGrade] = useState("");

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleAddGroup(logicType: "ALL" | "ANY") {
    startTransition(async () => {
      const res = await createPrerequisiteGroupAction({ levelSubjectId, logicType });
      if (res.success) {
        toast.success("Grupo de pré-requisitos criado.");
        onMutate ? onMutate() : router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao criar grupo.");
      }
    });
  }

  async function handleArchiveGroup() {
    if (!archiveConfirmId) return;
    const res = await archivePrerequisiteGroupAction(archiveConfirmId);
    if (res.success) {
      toast.success("Grupo arquivado.");
      onMutate ? onMutate() : router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar grupo.");
    }
    setArchiveConfirmId(null);
  }

  function handleAddItem(groupId: string) {
    if (!newItemSubject) {
      toast.error("Selecione uma disciplina.");
      return;
    }
    startTransition(async () => {
      const res = await createPrerequisiteItemAction({
        prerequisiteGroupId: groupId,
        prerequisiteLevelSubjectId: newItemSubject,
        requirementType: newItemRequirementType,
        minimumRequiredGrade: newItemRequirementType === "MINIMUM_GRADE" && newItemMinGrade
          ? parseFloat(newItemMinGrade)
          : null,
      });
      if (res.success) {
        toast.success("Pré-requisito adicionado.");
        setAddingItemToGroup(null);
        setNewItemSubject("");
        setNewItemRequirementType("MUST_PASS");
        setNewItemMinGrade("");
        onMutate ? onMutate() : router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao adicionar pré-requisito.");
      }
    });
  }

  async function handleDeleteItem() {
    if (!deleteItemConfirmId) return;
    const res = await deletePrerequisiteItemAction(deleteItemConfirmId);
    if (res.success) {
      toast.success("Pré-requisito removido.");
      onMutate ? onMutate() : router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao remover pré-requisito.");
    }
    setDeleteItemConfirmId(null);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield className="size-4" />
          <span>Os grupos são avaliados com lógica <strong className="text-foreground">E</strong> (todos os grupos têm de ser satisfeitos)</span>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddGroup("ALL")}
              disabled={pending}
            >
              <Plus className="size-3.5 mr-1" />
              Grupo (TODOS)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAddGroup("ANY")}
              disabled={pending}
            >
              <Plus className="size-3.5 mr-1" />
              Grupo (ALGUM)
            </Button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="Sem pré-requisitos"
          description="Esta disciplina não tem pré-requisitos configurados. O acesso é permitido sem condições."
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group, index) => {
            const isExpanded = expandedGroups.has(group.id);
            return (
              <div key={group.id} className="rounded-lg border overflow-hidden">
                {/* Group header */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">Grupo {index + 1}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LOGIC_TYPE_BADGE_CLASS[group.logicType] ?? ""}`}>
                    {PREREQUISITE_LOGIC_TYPE_LABELS[group.logicType] ?? group.logicType}
                  </span>
                  {group.name && (
                    <span className="text-sm font-medium">{group.name}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {group.items.length} pré-requisito(s)
                  </span>
                  {canManage && (
                    <button
                      className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={(e) => { e.stopPropagation(); setArchiveConfirmId(group.id); }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </button>

                {/* Group items */}
                {isExpanded && (
                  <div className="divide-y">
                    {group.items.length === 0 ? (
                      <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="size-3.5 shrink-0" />
                        <span>Grupo vazio — adicione pelo menos um pré-requisito.</span>
                      </div>
                    ) : (
                      group.items.map((item) => (
                        <div key={item.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">
                              {item.prerequisiteLevelSubject.subject.name}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {item.prerequisiteLevelSubject.courseLevel?.course.name} · {item.prerequisiteLevelSubject.courseLevel?.name}
                            </span>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${REQUIREMENT_BADGE_CLASS[item.requirementType] ?? ""}`}>
                            {PREREQUISITE_REQUIREMENT_TYPE_LABELS[item.requirementType] ?? item.requirementType}
                            {item.requirementType === "MINIMUM_GRADE" && item.minimumRequiredGrade != null
                              ? ` ≥ ${typeof item.minimumRequiredGrade === "object" ? item.minimumRequiredGrade.toNumber() : item.minimumRequiredGrade}`
                              : ""}
                          </span>
                          {canManage && (
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={() => setDeleteItemConfirmId(item.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}

                    {/* Add item form */}
                    {canManage && (
                      <div className="px-4 py-3 bg-muted/10">
                        {addingItemToGroup === group.id ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <select
                              className="text-sm border rounded-md px-2 py-1.5 bg-background"
                              value={newItemSubject}
                              onChange={(e) => setNewItemSubject(e.target.value)}
                            >
                              <option value="">Selecione disciplina...</option>
                              {availableLevelSubjects.map((ls) => (
                                <option key={ls.id} value={ls.id}>
                                  {ls.subjectName} — {ls.courseName} / {ls.courseLevelName}
                                </option>
                              ))}
                            </select>
                            <select
                              className="text-sm border rounded-md px-2 py-1.5 bg-background"
                              value={newItemRequirementType}
                              onChange={(e) => setNewItemRequirementType(e.target.value)}
                            >
                              <option value="MUST_PASS">Aprovado</option>
                              <option value="MUST_COMPLETE">Concluído</option>
                              <option value="MINIMUM_GRADE">Nota Mínima</option>
                            </select>
                            {newItemRequirementType === "MINIMUM_GRADE" && (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                placeholder="Nota mín."
                                className="text-sm border rounded-md px-2 py-1.5 bg-background w-24"
                                value={newItemMinGrade}
                                onChange={(e) => setNewItemMinGrade(e.target.value)}
                              />
                            )}
                            <Button
                              size="sm"
                              onClick={() => handleAddItem(group.id)}
                              disabled={pending}
                            >
                              Adicionar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setAddingItemToGroup(null); setNewItemSubject(""); }}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
                            onClick={() => setAddingItemToGroup(group.id)}
                          >
                            <Plus className="size-3.5" />
                            Adicionar pré-requisito
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!archiveConfirmId}
        onOpenChange={(open) => { if (!open) setArchiveConfirmId(null); }}
        title="Arquivar Grupo"
        description="Este grupo de pré-requisitos será arquivado. A ação não pode ser revertida."
        confirmLabel="Arquivar"
        variant="destructive"
        onConfirm={handleArchiveGroup}
      />

      <ConfirmDialog
        open={!!deleteItemConfirmId}
        onOpenChange={(open) => { if (!open) setDeleteItemConfirmId(null); }}
        title="Remover Pré-requisito"
        description="Este pré-requisito será removido do grupo."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={handleDeleteItem}
      />
    </div>
  );
}
