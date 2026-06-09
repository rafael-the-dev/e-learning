"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
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
  DialogFooter,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { getJustificationColumns } from "./justification-columns";
import {
  approveAttendanceJustificationAction,
  rejectAttendanceJustificationAction,
} from "@/modules/attendance/actions/attendance.actions";
import { toast } from "@/shared/hooks/use-toast";
import { FileCheck } from "lucide-react";
import { ATTENDANCE_JUSTIFICATION_STATUS_LABELS } from "@/modules/attendance/types";
import type { AttendanceJustification } from "@/modules/attendance/types";
import type { PaginatedResult } from "@/shared/types/common";

interface JustificationsTableProps {
  result: PaginatedResult<AttendanceJustification>;
  defaultSearch?: string;
  defaultStatus?: string;
  canApprove: boolean;
  canReject: boolean;
}

type DialogMode = "approve" | "reject" | null;
const ALL = "__all__";

export function JustificationsTable({
  result,
  defaultSearch,
  defaultStatus,
  canApprove,
  canReject,
}: JustificationsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(defaultSearch ?? "");
  const [status, setStatus] = React.useState(defaultStatus ?? ALL);
  const [dialog, setDialog] = React.useState<DialogMode>(null);
  const [selected, setSelected] = React.useState<AttendanceJustification | null>(null);
  const [reviewNotes, setReviewNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function push(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(overrides).forEach(([k, v]) => {
      if (v && v !== ALL) params.set(k, v);
      else params.delete(k);
    });
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  function handlePaginationChange(next: PaginationState) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next.pageIndex + 1));
    router.push(`?${params.toString()}`);
  }

  const searchRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => push({ search: value }), 400);
  }

  function openApprove(j: AttendanceJustification) {
    setSelected(j);
    setReviewNotes("");
    setDialog("approve");
  }
  function openReject(j: AttendanceJustification) {
    setSelected(j);
    setReviewNotes("");
    setDialog("reject");
  }
  function closeDialog() {
    setDialog(null);
    setSelected(null);
    setReviewNotes("");
  }

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    if (dialog === "approve") {
      const res = await approveAttendanceJustificationAction({
        justificationId: selected.id,
        reviewNotes,
      });
      if (res.success) toast({ title: "Justificação aprovada" });
      else toast({ title: "Erro", description: res.error, variant: "destructive" });
    } else if (dialog === "reject") {
      if (!reviewNotes || reviewNotes.trim().length < 5) {
        toast({ title: "Motivo de rejeição obrigatório (mín. 5 caracteres)", variant: "destructive" });
        setLoading(false);
        return;
      }
      const res = await rejectAttendanceJustificationAction({
        justificationId: selected.id,
        reviewNotes,
      });
      if (res.success) toast({ title: "Justificação rejeitada" });
      else toast({ title: "Erro", description: res.error, variant: "destructive" });
    }
    setLoading(false);
    closeDialog();
    router.refresh();
  }

  const columns = getJustificationColumns({
    onApprove: openApprove,
    onReject: openReject,
    canApprove,
    canReject,
  });

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Pesquisar justificações..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              push({ status: v });
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os estados</SelectItem>
              {Object.entries(ATTENDANCE_JUSTIFICATION_STATUS_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {result.data.length === 0 ? (
          <EmptyState
            icon={<FileCheck className="size-8" />}
            title="Nenhuma justificação encontrada"
            description="Não existem justificações de faltas para os filtros selecionados."
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
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "approve" ? "Aprovar Justificação" : "Rejeitar Justificação"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "approve"
                ? "A falta será marcada como justificada. Esta ação não pode ser desfeita."
                : "A justificação será rejeitada. Indique o motivo abaixo."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="reviewNotes">
                {dialog === "reject" ? "Motivo da rejeição *" : "Notas (opcional)"}
              </Label>
              <Textarea
                id="reviewNotes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  dialog === "reject"
                    ? "Indique o motivo da rejeição..."
                    : "Notas adicionais (opcional)..."
                }
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant={dialog === "reject" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={loading}
            >
              {dialog === "approve" ? "Aprovar" : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
