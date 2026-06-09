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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Input as ReasonInput } from "@/shared/components/ui/input";
import { getEnrollmentColumns } from "./enrollment-columns";
import {
  activateEnrollmentAction,
  suspendEnrollmentAction,
  cancelEnrollmentAction,
  completeEnrollmentAction,
  deleteEnrollmentAction,
} from "@/modules/enrollments/actions/enrollment.actions";
import { toast } from "@/shared/hooks/use-toast";
import { ClipboardList } from "lucide-react";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import type { Enrollment } from "@/modules/enrollments/types";
import type { PaginatedResult } from "@/shared/types/common";

interface FilterOption {
  id: string;
  name: string;
}

interface EnrollmentsTableProps {
  result: PaginatedResult<Enrollment>;
  courses: FilterOption[];
  branches: FilterOption[];
  classGroups: FilterOption[];
  academicYears: FilterOption[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultCourseId?: string;
  defaultBranchId?: string;
  defaultClassGroupId?: string;
  defaultAcademicYearId?: string;
  canEdit: boolean;
  canActivate: boolean;
  canSuspend: boolean;
  canCancel: boolean;
  canComplete: boolean;
  canDelete: boolean;
}

type ActionDialog = "activate" | "suspend" | "cancel" | "complete" | null;

const dialogConfig: Record<
  NonNullable<ActionDialog>,
  { title: string; description: string; reasonLabel: string; required: boolean; confirmLabel: string; variant: "default" | "destructive" }
> = {
  activate: {
    title: "Ativar Matrícula",
    description: "A matrícula será marcada como ativa.",
    reasonLabel: "Motivo (opcional)",
    required: false,
    confirmLabel: "Ativar",
    variant: "default",
  },
  suspend: {
    title: "Suspender Matrícula",
    description: "Indique o motivo da suspensão.",
    reasonLabel: "Motivo *",
    required: true,
    confirmLabel: "Suspender",
    variant: "destructive",
  },
  cancel: {
    title: "Cancelar Matrícula",
    description: "Esta ação não pode ser revertida. Indique o motivo.",
    reasonLabel: "Motivo *",
    required: true,
    confirmLabel: "Cancelar Matrícula",
    variant: "destructive",
  },
  complete: {
    title: "Concluir Matrícula",
    description: "A matrícula será marcada como concluída.",
    reasonLabel: "Nota (opcional)",
    required: false,
    confirmLabel: "Concluir",
    variant: "default",
  },
};

export function EnrollmentsTable({
  result,
  courses,
  branches,
  classGroups,
  academicYears,
  defaultSearch = "",
  defaultStatus = "",
  defaultCourseId = "",
  defaultBranchId = "",
  defaultClassGroupId = "",
  defaultAcademicYearId = "",
  canEdit,
  canActivate,
  canSuspend,
  canCancel,
  canComplete,
  canDelete,
}: EnrollmentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch);
  const [actionTarget, setActionTarget] = React.useState<Enrollment | null>(null);
  const [actionDialog, setActionDialog] = React.useState<ActionDialog>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Enrollment | null>(null);
  const [reason, setReason] = React.useState("");
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

  function openAction(type: NonNullable<ActionDialog>, enrollment: Enrollment) {
    setActionTarget(enrollment);
    setActionDialog(type);
    setReason("");
  }

  function closeAction() {
    setActionTarget(null);
    setActionDialog(null);
    setReason("");
  }

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function handlePaginationChange(p: PaginationState) {
    updateParams({ page: String(p.pageIndex + 1) });
  }

  const columns = getEnrollmentColumns({
    onActivate: (e) => openAction("activate", e),
    onSuspend: (e) => openAction("suspend", e),
    onCancel: (e) => openAction("cancel", e),
    onComplete: (e) => openAction("complete", e),
    onDelete: setDeleteTarget,
    canEdit,
    canActivate,
    canSuspend,
    canCancel,
    canComplete,
    canDelete,
  });

  async function handleStatusAction() {
    if (!actionTarget || !actionDialog) return;
    const cfg = dialogConfig[actionDialog];
    if (cfg.required && !reason.trim()) return;

    setIsProcessing(true);
    let result;
    if (actionDialog === "activate") result = await activateEnrollmentAction(actionTarget.id, reason || undefined);
    else if (actionDialog === "suspend") result = await suspendEnrollmentAction(actionTarget.id, reason);
    else if (actionDialog === "cancel") result = await cancelEnrollmentAction(actionTarget.id, reason);
    else result = await completeEnrollmentAction(actionTarget.id, reason || undefined);

    setIsProcessing(false);
    if (result.success) {
      const labels: Record<string, string> = {
        activate: "ativada",
        suspend: "suspensa",
        cancel: "cancelada",
        complete: "concluída",
      };
      toast.success(`Matrícula ${labels[actionDialog]} com sucesso`);
      closeAction();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await deleteEnrollmentAction(deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Matrícula eliminada");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const currentDialog = actionDialog ? dialogConfig[actionDialog] : null;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar aluno ou n.º matrícula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className="max-w-xs"
        />
        <Select
          value={defaultStatus || "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
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
        <Select
          value={defaultClassGroupId || "all"}
          onValueChange={(v) => updateParams({ classGroupId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Turma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as turmas</SelectItem>
            {classGroups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={defaultAcademicYearId || "all"}
          onValueChange={(v) => updateParams({ yearId: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Ano Letivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os anos</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="Nenhuma matrícula encontrada"
          description="Ajuste os filtros ou registe a primeira matrícula."
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

      {/* Status action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{currentDialog?.title}</DialogTitle>
            <DialogDescription>{currentDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="enroll-reason">{currentDialog?.reasonLabel}</Label>
              <ReasonInput
                id="enroll-reason"
                placeholder="Introduza o motivo..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction} disabled={isProcessing}>
              Cancelar
            </Button>
            <Button
              variant={currentDialog?.variant ?? "default"}
              onClick={handleStatusAction}
              disabled={isProcessing || (currentDialog?.required === true && !reason.trim())}
              loading={isProcessing}
            >
              {currentDialog?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canDelete && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Eliminar Matrícula"
          description={`Tem a certeza que pretende eliminar a matrícula de "${deleteTarget?.studentName}"? Esta ação não pode ser revertida.`}
          confirmLabel="Eliminar"
          variant="destructive"
          loading={isProcessing}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
