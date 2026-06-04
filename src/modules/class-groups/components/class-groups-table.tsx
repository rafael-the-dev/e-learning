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
import { getClassGroupColumns } from "./class-group-columns";
import {
  archiveClassGroupAction,
  deleteClassGroupAction,
} from "@/modules/class-groups/actions/class-group.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Users } from "lucide-react";
import { CLASS_GROUP_STATUS_LABELS } from "@/modules/class-groups/types";
import type { ClassGroup } from "@/modules/class-groups/types";
import type { PaginatedResult } from "@/shared/types/common";

interface CourseFilterOption {
  id: string;
  name: string;
}

interface BranchFilterOption {
  id: string;
  name: string;
}

interface ClassGroupsTableProps {
  result: PaginatedResult<ClassGroup>;
  courses: CourseFilterOption[];
  branches: BranchFilterOption[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultCourseId?: string;
  defaultBranchId?: string;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function ClassGroupsTable({
  result,
  courses,
  branches,
  defaultSearch = "",
  defaultStatus = "",
  defaultCourseId = "",
  defaultBranchId = "",
  canEdit,
  canArchive,
  canDelete,
}: ClassGroupsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch);
  const [archiveTarget, setArchiveTarget] = React.useState<ClassGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ClassGroup | null>(null);
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

  const columns = getClassGroupColumns({
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
    canEdit,
    canArchive,
    canDelete,
  });

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveClassGroupAction(archiveTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`"${archiveTarget.name}" arquivada`);
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await deleteClassGroupAction(deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`"${deleteTarget.name}" eliminada`);
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar turma..."
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
            {Object.entries(CLASS_GROUP_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defaultCourseId || "all"}
          onValueChange={(v) => updateParams({ courseId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Curso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cursos</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
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
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" />}
          title="Nenhuma turma encontrada"
          description="Ajuste os filtros ou crie a primeira turma."
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
          title="Arquivar Turma"
          description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"?`}
          confirmLabel="Arquivar"
          variant="destructive"
          loading={isProcessing}
          onConfirm={handleArchive}
        />
      )}
      {canDelete && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Eliminar Turma"
          description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Esta ação não pode ser revertida.`}
          confirmLabel="Eliminar"
          variant="destructive"
          loading={isProcessing}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
