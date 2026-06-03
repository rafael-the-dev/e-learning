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
import { getStudentColumns } from "@/modules/students/components/student-columns";
import {
  suspendStudentAction,
  deleteStudentAction,
} from "@/modules/students/actions/student.actions";
import { toast } from "@/shared/hooks/use-toast";
import { GraduationCap } from "lucide-react";
import { STUDENT_STATUS_LABELS } from "@/modules/students/types";
import type { Student, StudentBranch } from "@/modules/students/types";
import type { PaginatedResult } from "@/shared/types/common";

interface StudentsTableProps {
  result: PaginatedResult<Student>;
  branches: StudentBranch[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultBranchId?: string;
}

export function StudentsTable({
  result,
  branches,
  defaultSearch = "",
  defaultStatus = "",
  defaultBranchId = "",
}: StudentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(defaultSearch);
  const [suspendTarget, setSuspendTarget] = React.useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Student | null>(null);
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

  const columns = getStudentColumns({
    onSuspend: setSuspendTarget,
    onDelete: setDeleteTarget,
  });

  async function handleSuspend() {
    if (!suspendTarget) return;
    setIsProcessing(true);
    const res = await suspendStudentAction(suspendTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`${suspendTarget.fullName} suspenso`);
      setSuspendTarget(null);
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await deleteStudentAction(deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success(`${deleteTarget.fullName} arquivado`);
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
          placeholder="Pesquisar por nome, e-mail, telefone..."
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
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {branches.length > 0 && (
          <Select
            value={defaultBranchId || "all"}
            onValueChange={(v) =>
              updateParams({ branchId: v === "all" ? "" : v })
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todas as filiais" />
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
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-8" />}
          title="Nenhum aluno encontrado"
          description={
            defaultSearch || defaultStatus || defaultBranchId
              ? "Tente ajustar os filtros de pesquisa."
              : "Adicione o primeiro aluno à organização."
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
        open={!!suspendTarget}
        onOpenChange={(open) => !open && setSuspendTarget(null)}
        title="Suspender Aluno"
        description={`Tem a certeza que pretende suspender "${suspendTarget?.fullName}"? O aluno ficará sem acesso a novas inscrições.`}
        confirmLabel="Suspender"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleSuspend}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Arquivar Aluno"
        description={`Tem a certeza que pretende arquivar "${deleteTarget?.fullName}"? O registo ficará oculto mas poderá ser recuperado por um administrador.`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </>
  );
}
