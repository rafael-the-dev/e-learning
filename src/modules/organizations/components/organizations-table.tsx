"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EditOrganizationForm } from "@/modules/organizations/components/organization-form";
import { getOrganizationColumns } from "@/modules/organizations/components/organization-columns";
import { suspendOrganizationAction } from "@/modules/organizations/actions/organization.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Building2 } from "lucide-react";
import type { Organization } from "@prisma/client";
import type { PaginatedResult } from "@/shared/types/common";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

interface OrganizationsTableProps {
  result: PaginatedResult<Organization>;
  defaultSearch?: string;
  defaultStatus?: string;
}

export function OrganizationsTable({
  result,
  defaultSearch = "",
  defaultStatus = "",
}: OrganizationsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [editTarget, setEditTarget] = React.useState<Organization | null>(null);
  const [suspendTarget, setSuspendTarget] = React.useState<Organization | null>(null);
  const [isSuspending, setIsSuspending] = React.useState(false);
  const [search, setSearch] = React.useState(defaultSearch);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  const columns = getOrganizationColumns({
    onEdit: setEditTarget,
    onSuspend: setSuspendTarget,
  });

  async function handleSuspend() {
    if (!suspendTarget) return;
    setIsSuspending(true);
    const result = await suspendOrganizationAction(suspendTarget.id);
    setIsSuspending(false);
    if (result.success) {
      toast.success(`${suspendTarget.name} suspensa`);
      setSuspendTarget(null);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <>
      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <Input
          className="max-w-xs"
          placeholder="Pesquisar organizações..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams({ search });
          }}
        />
        <Select
          value={defaultStatus || "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="TRIAL">Experimental</SelectItem>
            <SelectItem value="ACTIVE">Ativa</SelectItem>
            <SelectItem value="SUSPENDED">Suspensa</SelectItem>
            <SelectItem value="CANCELLED">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-8" />}
          title="Nenhuma organização encontrada"
          description={
            defaultSearch || defaultStatus
              ? "Tente ajustar os filtros."
              : "Crie a sua primeira organização para começar."
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

      {editTarget && (
        <EditOrganizationForm
          open={true}
          onOpenChange={(open) => !open && setEditTarget(null)}
          organization={editTarget}
          onSuccess={() => setEditTarget(null)}
        />
      )}

      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
        title="Suspender Organização"
        description={`Tem a certeza que pretende suspender "${suspendTarget?.name}"? Os utilizadores perderão o acesso imediatamente.`}
        confirmLabel="Suspender"
        variant="destructive"
        loading={isSuspending}
        onConfirm={handleSuspend}
      />
    </>
  );
}
