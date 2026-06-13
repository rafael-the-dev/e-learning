"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { getStudentColumns } from "@/modules/students/components/student-columns";
import {
  suspendStudentAction,
  deleteStudentAction,
} from "@/modules/students/actions/student.actions";
import { toast } from "@/shared/hooks/use-toast";
import { GraduationCap } from "lucide-react";
import type { Student } from "@/modules/students/types";
import type { PaginatedResult } from "@/shared/types/common";

interface StudentsTableProps {
  result: PaginatedResult<Student>;
}

export function StudentsTable({ result }: StudentsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [suspendTarget, setSuspendTarget] = React.useState<Student | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Student | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  function goToPage(pageIndex: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(pageIndex + 1));
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
      {result.data.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-8" />}
          title="Nenhum aluno encontrado"
          description="Ajuste os filtros ou registe o primeiro aluno."
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
          onPaginationChange={(p) => goToPage(p.pageIndex)}
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
