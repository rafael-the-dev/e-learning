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
import { getCategoryColumns } from "@/modules/courses/components/category-columns";
import { EditCategoryDrawer } from "@/modules/courses/components/category-form";
import {
  archiveCourseCategoryAction,
  deleteCourseCategoryAction,
} from "@/modules/courses/actions/category.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Tags } from "lucide-react";
import { COURSE_CATEGORY_STATUS_LABELS } from "@/modules/courses/types";
import type { CourseCategoryWithCount } from "@/modules/courses/types";

interface CategoriesTableProps {
  categories: CourseCategoryWithCount[];
  defaultSearch?: string;
  defaultStatus?: string;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function CategoriesTable({
  categories,
  defaultSearch = "",
  defaultStatus = "",
  canUpdate,
  canArchive,
  canDelete,
}: CategoriesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch);
  const [editTarget, setEditTarget] = React.useState<CourseCategoryWithCount | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<CourseCategoryWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CourseCategoryWithCount | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`?${params.toString()}`);
  }

  const filtered = React.useMemo(() => {
    let data = categories;
    if (defaultSearch) {
      const q = defaultSearch.toLowerCase();
      data = data.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q)
      );
    }
    if (defaultStatus) {
      data = data.filter((c) => c.status === defaultStatus);
    }
    return data;
  }, [categories, defaultSearch, defaultStatus]);

  const columns = getCategoryColumns({
    onEdit: setEditTarget,
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
    canUpdate,
    canArchive,
    canDelete,
  });

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveCourseCategoryAction(archiveTarget.id);
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
    const res = await deleteCourseCategoryAction(deleteTarget.id);
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
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Pesquisar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParams({ search });
          }}
        />
        <Select
          value={defaultStatus || "all"}
          onValueChange={(v) =>
            updateParams({ status: v === "all" ? "" : v })
          }
        >
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(COURSE_CATEGORY_STATUS_LABELS).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Tags className="size-8" />}
          title="Nenhuma categoria encontrada"
          description={
            defaultSearch || defaultStatus
              ? "Tente ajustar os filtros de pesquisa."
              : "Crie a primeira categoria de cursos da organização."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          totalRows={filtered.length}
          pagination={{ pageIndex: 0, pageSize: filtered.length }}
          onPaginationChange={() => {}}
        />
      )}

      {editTarget && (
        <EditCategoryDrawer
          category={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Categoria"
        description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"? A categoria ficará inativa mas pode ser recuperada.`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Categoria"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Esta ação é irreversível. Cursos associados não serão afetados mas perderão a referência à categoria.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </>
  );
}
