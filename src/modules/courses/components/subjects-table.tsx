"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  CreateSubjectDrawer,
  EditSubjectDrawer,
} from "@/modules/courses/components/subject-form";
import {
  archiveSubjectAction,
  softDeleteSubjectAction,
} from "@/modules/courses/actions/subject.actions";
import { toast } from "@/shared/hooks/use-toast";
import { SUBJECT_STATUS_LABELS } from "@/modules/courses/types";
import {
  BookOpen,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Plus,
  Search,
} from "lucide-react";
import type { Subject } from "@/modules/courses/types";

interface SubjectsTableProps {
  subjects: Subject[];
  canManage: boolean;
}

export function SubjectsTable({ subjects, canManage }: SubjectsTableProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");
  const [showCreate, setShowCreate] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Subject | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Subject | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const filtered = subjects.filter((s) => {
    const matchesSearch =
      search === "" ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveSubjectAction(archiveTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Disciplina arquivada");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await softDeleteSubjectAction(deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Disciplina eliminada");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome ou código..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(SUBJECT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button onClick={() => setShowCreate(true)} className="shrink-0">
            <Plus className="size-4 mr-1.5" />
            Nova Disciplina
          </Button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Nenhuma disciplina encontrada"
          description={
            search || statusFilter !== "ALL"
              ? "Tente ajustar os filtros."
              : "Crie a primeira disciplina da organização."
          }
        />
      ) : (
        <div className="rounded-xl border divide-y">
          {filtered.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{subject.name}</p>
                {subject.code && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {subject.code}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={subject.status} />
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditTarget(subject)}>
                        <Pencil className="size-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {subject.status !== "ARCHIVED" && (
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(subject)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Archive className="size-4" />
                          Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(subject)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <CreateSubjectDrawer
          open={showCreate}
          onOpenChange={setShowCreate}
          onSuccess={() => router.refresh()}
        />
      )}

      {editTarget && canManage && (
        <EditSubjectDrawer
          subject={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Disciplina"
        description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Disciplina"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Esta ação não pode ser revertida.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </div>
  );
}
