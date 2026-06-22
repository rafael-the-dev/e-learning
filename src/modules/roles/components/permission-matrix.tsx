"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronsUpDown, ChevronsDownUp } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Badge } from "@/shared/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/shared/components/ui/accordion";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { useToast } from "@/shared/hooks/use-toast";
import { updateRolePermissionsAction } from "@/modules/roles/actions/role.actions";
import type { PermissionMatrix as PermissionMatrixData } from "@/modules/roles/types";

interface Props {
  roleId: string;
  matrix: PermissionMatrixData;
  readOnly: boolean;
  readOnlyReason?: string;
}

export function PermissionMatrix({ roleId, matrix, readOnly, readOnlyReason }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(matrix.groups.flatMap((g) => g.permissions.filter((p) => p.granted).map((p) => p.id)))
  );
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);

  const initialSelected = useMemo(
    () => new Set(matrix.groups.flatMap((g) => g.permissions.filter((p) => p.granted).map((p) => p.id))),
    [matrix]
  );

  const isDirty = useMemo(() => {
    if (selected.size !== initialSelected.size) return true;
    for (const id of selected) if (!initialSelected.has(id)) return true;
    return false;
  }, [selected, initialSelected]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return matrix.groups;
    return matrix.groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (p) =>
            p.label.toLowerCase().includes(term) ||
            p.code.toLowerCase().includes(term) ||
            group.label.toLowerCase().includes(term)
        ),
      }))
      .filter((group) => group.permissions.length > 0 || group.label.toLowerCase().includes(term));
  }, [matrix.groups, search]);

  function togglePermission(id: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupModule: string, allSelected: boolean) {
    if (readOnly) return;
    const group = matrix.groups.find((g) => g.module === groupModule);
    if (!group) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  function selectAll() {
    if (readOnly) return;
    setSelected(new Set(matrix.groups.flatMap((g) => g.permissions.map((p) => p.id))));
  }

  function clearAll() {
    if (readOnly) return;
    setSelected(new Set());
  }

  function handleSave() {
    if (selected.size === 0) {
      setConfirmEmptyOpen(true);
      return;
    }
    persist();
  }

  function persist() {
    startTransition(async () => {
      const result = await updateRolePermissionsAction(roleId, Array.from(selected));
      if (result.success) {
        toast({ title: "Permissões atualizadas." });
        setConfirmEmptyOpen(false);
        router.refresh();
      } else {
        toast({ title: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {readOnly && readOnlyReason && (
        <div className="rounded-md border border-dashed bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          {readOnlyReason}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar permissão..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {selected.size} de {matrix.totalPermissions} selecionadas
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpenGroups(filteredGroups.map((g) => g.module))}
          >
            <ChevronsUpDown className="size-3.5 mr-1.5" />
            Expandir tudo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpenGroups([])}>
            <ChevronsDownUp className="size-3.5 mr-1.5" />
            Recolher tudo
          </Button>
          {!readOnly && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                Selecionar tudo
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                Remover tudo
              </Button>
            </>
          )}
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <EmptyState title="Nenhuma permissão encontrada" description="Tente outro termo de pesquisa." />
      ) : (
        <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups} className="rounded-md border">
          {filteredGroups.map((group) => {
            const groupSelectedCount = group.permissions.filter((p) => selected.has(p.id)).length;
            const allSelected = groupSelectedCount === group.permissions.length && group.permissions.length > 0;
            const someSelected = groupSelectedCount > 0 && !allSelected;

            return (
              <AccordionItem key={group.module} value={group.module} className="px-4 last:border-b-0">
                <div className="flex items-center gap-3">
                  {!readOnly && (
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={() => toggleGroup(group.module, allSelected)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <AccordionTrigger className="flex-1 py-3">
                    <span className="flex items-center gap-2">
                      {group.label}
                      <Badge variant="outline" className="text-xs">
                        {groupSelectedCount}/{group.permissions.length}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                </div>
                <AccordionContent>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {group.permissions.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex items-start gap-2.5 rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(permission.id)}
                          onCheckedChange={() => togglePermission(permission.id)}
                          disabled={readOnly}
                          className="mt-0.5"
                        />
                        <span className="space-y-0.5">
                          <span className="block text-sm font-medium">{permission.label}</span>
                          <span className="block text-xs text-muted-foreground font-mono">{permission.code}</span>
                          {permission.description && permission.description !== permission.code && (
                            <span className="block text-xs text-muted-foreground">{permission.description}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {!readOnly && (
        <div className="flex justify-end gap-2">
          <Button type="button" disabled={!isDirty} loading={pending} onClick={handleSave}>
            Guardar Alterações
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmEmptyOpen}
        onOpenChange={setConfirmEmptyOpen}
        title="Remover todas as permissões"
        description="Esta role ficará sem nenhuma permissão atribuída. Tem a certeza que pretende continuar?"
        confirmLabel="Continuar"
        variant="destructive"
        onConfirm={persist}
        loading={pending}
      />
    </div>
  );
}
