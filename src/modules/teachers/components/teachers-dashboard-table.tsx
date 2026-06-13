"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/shared/hooks/use-toast";
import { MoreHorizontal, Eye, Pencil, Ban, Archive } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { PaginationControls } from "@/shared/components/layout/pagination-controls";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { TEACHER_STATUS_LABELS } from "@/modules/teachers/types";
import {
  suspendTeacherAction,
  deleteTeacherAction,
} from "@/modules/teachers/actions/teacher.actions";
import { Users } from "lucide-react";
import type { TeacherDashboardRow } from "@/modules/teachers/services/teacher-metrics.service";
import type { TeacherBranch } from "@/modules/teachers/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  SUSPENDED: "destructive",
  INACTIVE: "outline",
};

interface Props {
  result: PaginatedResult<TeacherDashboardRow>;
  branches: TeacherBranch[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultBranchId?: string;
  canEdit: boolean;
  canSuspend: boolean;
  canDelete: boolean;
}

export function TeachersDashboardTable({
  result,
  branches,
  defaultSearch,
  defaultStatus,
  defaultBranchId,
  canEdit,
  canSuspend,
  canDelete,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; fullName: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fullName: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (defaultStatus) params.set("status", defaultStatus);
    if (defaultBranchId) params.set("branchId", defaultBranchId);
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  async function handleSuspend() {
    if (!suspendTarget) return;
    setLoading(true);
    const res = await suspendTeacherAction(suspendTarget.id);
    setLoading(false);
    if (res.success) {
      toast.success(`${suspendTarget.fullName} suspenso.`);
      setSuspendTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao suspender professor.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setLoading(true);
    const res = await deleteTeacherAction(deleteTarget.id);
    setLoading(false);
    if (res.success) {
      toast.success(`${deleteTarget.fullName} arquivado.`);
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar professor.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 pb-3">
        <Input
          placeholder="Pesquisar por nome, especialização..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters({ search })}
          className="max-w-xs h-8 text-sm"
        />
        <Select
          value={defaultStatus || "ALL"}
          onValueChange={(v) => applyFilters({ status: v === "ALL" ? "" : v })}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(TEACHER_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {branches.length > 0 && (
          <Select
            value={defaultBranchId || "ALL"}
            onValueChange={(v) => applyFilters({ branchId: v === "ALL" ? "" : v })}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as filiais</SelectItem>
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
          icon={<Users className="size-8" />}
          title="Nenhum professor encontrado"
          description="Ajuste os filtros ou adicione o primeiro professor."
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-center">Disciplinas</TableHead>
                <TableHead className="text-center">Turmas Ativas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Aval. em Curso</TableHead>
                <TableHead>Criado Em</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1 min-w-0">
                      <Link
                        href={`/teachers/${t.id}`}
                        className="font-medium hover:underline truncate"
                      >
                        {t.fullName}
                      </Link>
                      <div className="flex flex-wrap gap-1">
                        {t.subjectCount === 0 && t.status === "ACTIVE" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-200">
                            Sem Disciplina
                          </span>
                        )}
                        {t.activeClassGroupCount === 0 && t.status === "ACTIVE" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                            Sem Turma
                          </span>
                        )}
                        {t.pendingGradingAssessmentCount > 0 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                            A Classificar
                          </span>
                        )}
                        {t.overdueAssessmentCount > 0 && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                            Em Atraso
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.branchName ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`text-xs font-mono tabular-nums font-medium ${
                        t.subjectCount === 0 ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {t.subjectCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`text-xs font-mono tabular-nums font-medium ${
                        t.activeClassGroupCount === 0 && t.status === "ACTIVE"
                          ? "text-amber-600"
                          : "text-foreground"
                      }`}
                    >
                      {t.activeClassGroupCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                      {TEACHER_STATUS_LABELS[t.status] ?? t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`text-xs font-mono tabular-nums font-medium ${
                        t.openAssessmentCount > 0 ? "text-indigo-600" : "text-muted-foreground"
                      }`}
                    >
                      {t.openAssessmentCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("pt-PT")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/teachers/${t.id}`}>
                            <Eye className="size-4 mr-2" />
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem asChild>
                            <Link href={`/teachers/${t.id}/edit`}>
                              <Pencil className="size-4 mr-2" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {(canSuspend || canDelete) && <DropdownMenuSeparator />}
                        {canSuspend && t.status === "ACTIVE" && (
                          <DropdownMenuItem
                            className="text-amber-600 focus:text-amber-600"
                            onClick={() => setSuspendTarget({ id: t.id, fullName: t.fullName })}
                          >
                            <Ban className="size-4 mr-2" />
                            Suspender
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ id: t.id, fullName: t.fullName })}
                          >
                            <Archive className="size-4 mr-2" />
                            Arquivar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls meta={result} />

      <AlertDialog open={!!suspendTarget} onOpenChange={() => setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspender Professor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende suspender &quot;{suspendTarget?.fullName}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Suspender
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar Professor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende arquivar &quot;{deleteTarget?.fullName}&quot;? O registo
              ficará oculto mas pode ser recuperado por um administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
