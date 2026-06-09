"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
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
import { getClassroomColumns } from "./classroom-columns";
import { archiveClassroomAction } from "@/modules/classrooms/actions/classroom.actions";
import { toast } from "@/shared/hooks/use-toast";
import { DoorOpen } from "lucide-react";
import {
  CLASSROOM_STATUS_LABELS,
  CLASSROOM_TYPE_LABELS,
  type Classroom,
} from "@/modules/classrooms/types";
import type { PaginatedResult } from "@/shared/types/common";

interface ClassroomsTableProps {
  result: PaginatedResult<Classroom>;
  branches: Array<{ id: string; name: string }>;
  defaultSearch?: string;
  defaultStatus?: string;
  defaultType?: string;
  defaultBranchId?: string;
  canEdit: boolean;
  canArchive: boolean;
}

export function ClassroomsTable({
  result,
  branches,
  defaultSearch = "",
  defaultStatus = "",
  defaultType = "",
  defaultBranchId = "",
  canEdit,
  canArchive,
}: ClassroomsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(defaultSearch);
  const [archiveTarget, setArchiveTarget] = React.useState<Classroom | null>(null);
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

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") updateParams({ search });
  }

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function handlePaginationChange(p: PaginationState) {
    updateParams({ page: String(p.pageIndex + 1) });
  }

  const columns = getClassroomColumns({ onArchive: setArchiveTarget, canEdit, canArchive });

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveClassroomAction(archiveTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`"${archiveTarget.name}" arquivada`);
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar sala..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="max-w-xs"
        />
        <Select
          value={defaultStatus || "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(CLASSROOM_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defaultType || "all"}
          onValueChange={(v) => updateParams({ type: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(CLASSROOM_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defaultBranchId || "all"}
          onValueChange={(v) => updateParams({ branchId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filial" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as filiais</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="size-8" />}
          title="Nenhuma sala encontrada"
          description="Ajuste os filtros ou crie a primeira sala."
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={handlePaginationChange}
        />
      )}

      {canArchive && (
        <ConfirmDialog
          open={!!archiveTarget}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
          title="Arquivar Sala"
          description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"?`}
          confirmLabel="Arquivar"
          variant="destructive"
          loading={isProcessing}
          onConfirm={handleArchive}
        />
      )}
    </div>
  );
}
