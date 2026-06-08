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
import { toast } from "@/shared/hooks/use-toast";
import {
  publishLessonAction,
  archiveLessonAction,
  deleteLessonAction,
} from "@/modules/lessons/actions/lesson.actions";
import { getLessonColumns } from "./lesson-columns";
import {
  LESSON_STATUS_LABELS,
  LESSON_TYPE_LABELS,
} from "@/modules/lessons/types";
import { Plus, Search, BookOpen } from "lucide-react";
import type { Lesson } from "@/modules/lessons/types";
import type { PaginatedResult } from "@/shared/types/common";

interface LessonsTableProps {
  result: PaginatedResult<Lesson>;
  defaultSearch?: string;
  defaultStatus?: string;
  defaultType?: string;
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function LessonsTable({
  result,
  defaultSearch,
  defaultStatus,
  defaultType,
  canCreate,
  canEdit,
  canPublish,
  canArchive,
  canDelete,
}: LessonsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch ?? "");
  const [publishTarget, setPublishTarget] = React.useState<Lesson | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Lesson | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Lesson | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);
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

  function handlePaginationChange(p: PaginationState) {
    updateParams({ page: String(p.pageIndex + 1) });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ search, page: "1" });
  }

  async function handlePublish() {
    if (!publishTarget) return;
    setIsPublishing(true);
    const res = await publishLessonAction(publishTarget.id);
    setIsPublishing(false);
    if (res.success) {
      toast.success("Lição publicada");
      setPublishTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsArchiving(true);
    const res = await archiveLessonAction(archiveTarget.id);
    setIsArchiving(false);
    if (res.success) {
      toast.success("Lição arquivada");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteLessonAction(deleteTarget.id);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Lição eliminada");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const columns = getLessonColumns({
    onView: (l) => router.push(`/lessons/${l.id}`),
    onEdit: (l) => router.push(`/lessons/${l.id}/edit`),
    onPublish: setPublishTarget,
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
    canEdit,
    canPublish,
    canArchive,
    canDelete,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 w-52"
                placeholder="Pesquisar lições…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-8">
              Filtrar
            </Button>
          </form>

          <Select
            defaultValue={defaultStatus ?? "ALL"}
            onValueChange={(v) => updateParams({ status: v === "ALL" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os estados</SelectItem>
              {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((s) => (
                <SelectItem key={s} value={s}>{LESSON_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            defaultValue={defaultType ?? "ALL"}
            onValueChange={(v) => updateParams({ type: v === "ALL" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os tipos</SelectItem>
              {Object.entries(LESSON_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => router.push("/lessons/new")}>
            <Plus className="size-4 mr-1.5" />
            Nova Lição
          </Button>
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Nenhuma lição encontrada"
          description={
            canCreate
              ? "Crie a primeira lição da biblioteca de conteúdo."
              : "Nenhuma lição disponível."
          }
          action={
            canCreate ? (
              <Button size="sm" onClick={() => router.push("/lessons/new")}>
                <Plus className="size-4 mr-1.5" />
                Nova Lição
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
          onPaginationChange={handlePaginationChange}
        />
      )}

      <ConfirmDialog
        open={!!publishTarget}
        onOpenChange={(open) => !open && setPublishTarget(null)}
        title="Publicar Lição"
        description={publishTarget ? `Tem a certeza que pretende publicar "${publishTarget.title}"? Ficará visível para os alunos.` : ""}
        confirmLabel="Publicar"
        loading={isPublishing}
        onConfirm={handlePublish}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Lição"
        description={archiveTarget ? `Tem a certeza que pretende arquivar "${archiveTarget.title}"?` : ""}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isArchiving}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Lição"
        description={deleteTarget ? `Tem a certeza que pretende eliminar "${deleteTarget.title}"? Esta ação não pode ser revertida.` : ""}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
