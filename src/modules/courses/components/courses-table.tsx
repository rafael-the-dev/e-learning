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
import { getCourseColumns } from "@/modules/courses/components/course-columns";
import {
  archiveCourseAction,
  deleteCourseAction,
} from "@/modules/courses/actions/course.actions";
import { toast } from "@/shared/hooks/use-toast";
import { BookOpen } from "lucide-react";
import { COURSE_STATUS_LABELS } from "@/modules/courses/types";
import type { Course, CourseCategory } from "@/modules/courses/types";
import type { PaginatedResult } from "@/shared/types/common";

interface CoursesTableProps {
  result: PaginatedResult<Course>;
  categories: CourseCategory[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultCategoryId?: string;
}

export function CoursesTable({
  result,
  categories,
  defaultSearch = "",
  defaultStatus = "",
  defaultCategoryId = "",
}: CoursesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch);
  const [archiveTarget, setArchiveTarget] = React.useState<Course | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Course | null>(null);
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

  const columns = getCourseColumns({
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
  });

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveCourseAction(archiveTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`"${archiveTarget.name}" arquivado`);
      setArchiveTarget(null);
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await deleteCourseAction(deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`"${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
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
          placeholder="Pesquisar por nome, código..."
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
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(COURSE_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defaultCategoryId || "all"}
          onValueChange={(v) =>
            updateParams({ categoryId: v === "all" ? "" : v })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Nenhum curso encontrado"
          description={
            defaultSearch || defaultStatus || defaultCategoryId
              ? "Tente ajustar os filtros de pesquisa."
              : "Crie o primeiro curso da organização."
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
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Curso"
        description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"? O curso ficará inativo mas poderá ser recuperado.`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Curso"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Esta ação é irreversível.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </>
  );
}
