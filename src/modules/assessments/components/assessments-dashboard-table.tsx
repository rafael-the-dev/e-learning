"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/shared/hooks/use-toast";
import { MoreHorizontal, Eye, ClipboardEdit, XCircle } from "lucide-react";
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
import {
  ASSESSMENT_STATUS,
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_COMPONENT_TYPE_LABELS,
  ASSESSMENT_PUBLICATION_STATUS_LABELS,
} from "@/modules/assessments/types";
import { cancelAssessmentAction } from "@/modules/assessments/actions/assessment.actions";
import { ClipboardList } from "lucide-react";
import type { AssessmentDashboardRow } from "@/modules/assessments/services/assessment-metrics.service";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  GRADED: "default",
  OPEN: "secondary",
  SCHEDULED: "secondary",
  DRAFT: "outline",
  CANCELLED: "destructive",
  ARCHIVED: "outline",
};

const PUB_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PUBLISHED: "default",
  READY: "secondary",
  DRAFT: "outline",
  ARCHIVED: "outline",
};

interface Props {
  result: PaginatedResult<AssessmentDashboardRow>;
  defaultSearch?: string;
  defaultStatus?: string;
  canEdit: boolean;
  canCancel: boolean;
}

export function AssessmentsDashboardTable({
  result,
  defaultSearch,
  defaultStatus,
  canEdit,
  canCancel,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [status, setStatus] = useState(defaultStatus ?? "");
  const [cancelTarget, setCancelTarget] = useState<{ id: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function applyFilters(s: string, st: string) {
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    if (st) params.set("status", st);
    router.push(`?${params.toString()}`);
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setLoading(true);
    const res = await cancelAssessmentAction({ assessmentId: cancelTarget.id });
    setLoading(false);
    if (res.success) {
      toast.success("Avaliação cancelada.");
      setCancelTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao cancelar avaliação.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 pb-3">
        <Input
          placeholder="Pesquisar avaliações..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters(search, status)}
          className="max-w-xs h-8 text-sm"
        />
        <Select
          value={status || "ALL"}
          onValueChange={(v) => {
            const next = v === "ALL" ? "" : v;
            setStatus(next);
            applyFilters(search, next);
          }}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.values(ASSESSMENT_STATUS).map((s) => (
              <SelectItem key={s} value={s}>
                {ASSESSMENT_STATUS_LABELS[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title="Nenhuma avaliação encontrada"
          description="Ajuste os filtros ou crie a primeira avaliação."
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Turma</TableHead>
                <TableHead>Professor</TableHead>
                <TableHead>Componente</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Progresso</TableHead>
                <TableHead>Publicação</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((a) => {
                const gradeColor =
                  a.totalResultsCount > 0 && a.gradedResultsCount >= a.totalResultsCount
                    ? "text-emerald-600"
                    : a.gradedResultsCount > 0
                    ? "text-amber-600"
                    : "text-muted-foreground";

                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium max-w-48 truncate">{a.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.classGroupName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.teacherName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {a.componentName ? (
                        <div>
                          <div className="text-sm">{a.componentName}</div>
                          {a.componentType && (
                            <div className="text-xs text-muted-foreground">
                              {ASSESSMENT_COMPONENT_TYPE_LABELS[a.componentType] ?? a.componentType}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.periodName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(a.assessmentDate).toLocaleDateString("pt-PT")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[a.status] ?? "outline"} className="text-xs">
                        {ASSESSMENT_STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs font-mono tabular-nums font-medium ${gradeColor}`}>
                        {a.gradedResultsCount} / {a.totalResultsCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.publicationStatus ? (
                        <Badge
                          variant={PUB_STATUS_VARIANT[a.publicationStatus] ?? "outline"}
                          className="text-xs"
                        >
                          {ASSESSMENT_PUBLICATION_STATUS_LABELS[a.publicationStatus] ??
                            a.publicationStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
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
                            <Link href={`/assessments/${a.id}`}>
                              <Eye className="size-4 mr-2" />
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && ["DRAFT", "SCHEDULED", "OPEN"].includes(a.status) && (
                            <DropdownMenuItem asChild>
                              <Link href={`/assessments/${a.id}/grade`}>
                                <ClipboardEdit className="size-4 mr-2" />
                                Lançar notas
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {canCancel && !["CANCELLED", "GRADED"].includes(a.status) && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setCancelTarget({ id: a.id, title: a.title })}
                            >
                              <XCircle className="size-4 mr-2" />
                              Cancelar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls meta={result} />

      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Avaliação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer cancelar &quot;{cancelTarget?.title}&quot;? Esta ação não pode
              ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={loading}
              className="bg-destructive hover:bg-destructive/90"
            >
              Cancelar Avaliação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
