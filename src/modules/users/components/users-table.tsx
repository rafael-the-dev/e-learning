"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { getUserColumns } from "@/modules/users/components/user-columns";
import {
  disableOrgUserAction,
  enableOrgUserAction,
  removeUserFromOrgAction,
} from "@/modules/users/actions/user.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Users } from "lucide-react";
import type { OrgUser, AssignableRole } from "@/modules/users/types";
import { ROLE_LABELS } from "@/modules/users/types";
import type { PaginatedResult } from "@/shared/types/common";

interface UsersTableProps {
  result: PaginatedResult<OrgUser>;
  roles: AssignableRole[];
  defaultSearch?: string;
  defaultRole?: string;
  defaultStatus?: string;
}

export function UsersTable({
  result,
  roles,
  defaultSearch = "",
  defaultRole = "",
  defaultStatus = "",
}: UsersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch);
  const [disableTarget, setDisableTarget] = React.useState<OrgUser | null>(null);
  const [enableTarget, setEnableTarget] = React.useState<OrgUser | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<OrgUser | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  const columns = getUserColumns({
    onDisable: setDisableTarget,
    onEnable: setEnableTarget,
    onRemove: setRemoveTarget,
  });

  async function handleDisable() {
    if (!disableTarget) return;
    setIsProcessing(true);
    const res = await disableOrgUserAction(disableTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`${disableTarget.name} desativado`);
      setDisableTarget(null);
    } else {
      toast.error(res.error);
    }
  }

  async function handleEnable() {
    if (!enableTarget) return;
    setIsProcessing(true);
    const res = await enableOrgUserAction(enableTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`${enableTarget.name} ativado`);
      setEnableTarget(null);
    } else {
      toast.error(res.error);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsProcessing(true);
    const res = await removeUserFromOrgAction(removeTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`${removeTarget.name} removido da organização`);
      setRemoveTarget(null);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Pesquisar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams({ search });
          }}
        />
        <Select
          value={defaultRole || "all"}
          onValueChange={(v) => updateParams({ role: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos os papéis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.name}>
                {ROLE_LABELS[r.name] ?? r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defaultStatus || "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="DISABLED">Desativado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="Nenhum utilizador encontrado"
          description={
            defaultSearch || defaultRole || defaultStatus
              ? "Tente ajustar os filtros de pesquisa."
              : "Adicione o primeiro utilizador à organização."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={{
            pageIndex: result.page - 1,
            pageSize: result.pageSize,
          }}
          onPaginationChange={(p) =>
            updateParams({ page: String(p.pageIndex + 1) })
          }
        />
      )}

      <ConfirmDialog
        open={!!disableTarget}
        onOpenChange={(open) => !open && setDisableTarget(null)}
        title="Desativar Utilizador"
        description={`Tem a certeza que pretende desativar "${disableTarget?.name}"? O utilizador perderá o acesso imediatamente.`}
        confirmLabel="Desativar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDisable}
      />

      <ConfirmDialog
        open={!!enableTarget}
        onOpenChange={(open) => !open && setEnableTarget(null)}
        title="Ativar Utilizador"
        description={`Tem a certeza que pretende ativar "${enableTarget?.name}"?`}
        confirmLabel="Ativar"
        loading={isProcessing}
        onConfirm={handleEnable}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover da Organização"
        description={`Tem a certeza que pretende remover "${removeTarget?.name}" desta organização? O utilizador perderá todos os acessos.`}
        confirmLabel="Remover"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleRemove}
      />
    </>
  );
}
