"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { CreateAcademicTermDrawer, EditAcademicTermDrawer } from "./academic-term-form";
import { toast } from "@/shared/hooks/use-toast";
import {
  archiveAcademicTermAction,
  deleteAcademicTermAction,
} from "@/modules/academic-calendar/actions/academic-term.actions";
import { getAcademicTermColumns } from "./academic-term-columns";
import { ACADEMIC_STATUS_LABELS } from "@/modules/academic-calendar/types";
import { Plus, Search, CalendarClock } from "lucide-react";
import type { AcademicTerm, AcademicYear } from "@/modules/academic-calendar/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<AcademicTerm>;
  years: AcademicYear[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultYearId?: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  showYear?: boolean;
}

export function AcademicTermsTable({
  result,
  years,
  defaultSearch,
  defaultStatus,
  defaultYearId,
  canCreate,
  canEdit,
  canArchive,
  canDelete,
  showYear = true,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch ?? "");
  const [showCreate, setShowCreate] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AcademicTerm | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<AcademicTerm | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AcademicTerm | null>(null);
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsArchiving(true);
    const res = await archiveAcademicTermAction(archiveTarget.id);
    setIsArchiving(false);
    if (res.success) {
      toast.success("Período arquivado");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteAcademicTermAction(deleteTarget.id);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Período eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const columns = getAcademicTermColumns({
    onEdit: setEditTarget,
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
    canEdit,
    canArchive,
    canDelete,
    showYear,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => { e.preventDefault(); updateParams({ search, page: "1" }); }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 w-48"
                placeholder="Pesquisar…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-8">Filtrar</Button>
          </form>

          {showYear && (
            <Select
              defaultValue={defaultYearId ?? "ALL"}
              onValueChange={(v) => updateParams({ yearId: v === "ALL" ? "" : v, page: "1" })}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Ano Letivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os anos</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            defaultValue={defaultStatus ?? "ALL"}
            onValueChange={(v) => updateParams({ status: v === "ALL" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED", "ARCHIVED"] as const).map((s) => (
                <SelectItem key={s} value={s}>{ACADEMIC_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1.5" />
            Novo Período
          </Button>
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-8" />}
          title="Nenhum período encontrado"
          description={canCreate ? "Crie o primeiro período letivo." : "Nenhum período definido."}
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="size-4 mr-1.5" />
                Novo Período
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={(p) => updateParams({ page: String(p.pageIndex + 1) })}
        />
      )}

      {canCreate && (
        <CreateAcademicTermDrawer
          years={years}
          defaultYearId={defaultYearId}
          open={showCreate}
          onOpenChange={setShowCreate}
          onSuccess={() => router.refresh()}
        />
      )}

      {editTarget && (
        <EditAcademicTermDrawer
          term={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Período"
        description={archiveTarget ? `Tem a certeza que pretende arquivar "${archiveTarget.name}"?` : ""}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isArchiving}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Período"
        description={deleteTarget ? `Tem a certeza que pretende eliminar "${deleteTarget.name}"? Esta ação não pode ser revertida.` : ""}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
