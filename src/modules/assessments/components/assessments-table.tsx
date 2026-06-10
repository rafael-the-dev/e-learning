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
import {
  ASSESSMENT_STATUS,
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_COMPONENT_TYPE_LABELS,
} from "@/modules/assessments/types";
import { cancelAssessmentAction } from "@/modules/assessments/actions/assessment.actions";
import type { Assessment } from "@/modules/assessments/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<Assessment>;
  defaultSearch?: string;
  defaultStatus?: string;
  canEdit: boolean;
  canCancel: boolean;
}

const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
  if (s === "GRADED") return "default";
  if (s === "SCHEDULED" || s === "DRAFT" || s === "OPEN") return "secondary";
  if (s === "CANCELLED") return "destructive";
  return "outline";
};

export function AssessmentsTable({ result, defaultSearch, defaultStatus, canEdit, canCancel }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [status, setStatus] = useState(defaultStatus ?? "");
  const [cancelTarget, setCancelTarget] = useState<Assessment | null>(null);
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
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar avaliações..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters(search, status)}
          className="max-w-sm"
        />
        <Select
          value={status || "ALL"}
          onValueChange={(v) => {
            const newStatus = v === "ALL" ? "" : v;
            setStatus(newStatus);
            applyFilters(search, newStatus);
          }}
        >
          <SelectTrigger className="w-45">
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
        <Button variant="outline" onClick={() => applyFilters(search, status)}>
          Filtrar
        </Button>
      </div>

      {result.data.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          Nenhuma avaliação encontrada.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Componente</TableHead>
                <TableHead>Turma</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Nota Máx.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12.5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((assessment) => (
                <TableRow key={assessment.id}>
                  <TableCell className="font-medium">{assessment.title}</TableCell>
                  <TableCell>
                    {assessment.componentName && (
                      <span className="text-sm">
                        {assessment.componentName}
                        {assessment.componentType && (
                          <span className="text-muted-foreground ml-1">
                            ({ASSESSMENT_COMPONENT_TYPE_LABELS[assessment.componentType] ?? assessment.componentType})
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{assessment.classGroupName ?? "—"}</TableCell>
                  <TableCell>{assessment.periodName ?? "—"}</TableCell>
                  <TableCell>
                    {assessment.assessmentDate
                      ? new Date(assessment.assessmentDate).toLocaleDateString("pt-PT")
                      : "—"}
                  </TableCell>
                  <TableCell>{assessment.maxScore}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(assessment.status)}>
                      {ASSESSMENT_STATUS_LABELS[assessment.status] ?? assessment.status}
                    </Badge>
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
                          <Link href={`/assessments/${assessment.id}`}>
                            <Eye className="size-4 mr-2" />
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        {canEdit && ["DRAFT", "SCHEDULED"].includes(assessment.status) && (
                          <DropdownMenuItem asChild>
                            <Link href={`/assessments/${assessment.id}/grade`}>
                              <ClipboardEdit className="size-4 mr-2" />
                              Lançar notas
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canCancel && !["CANCELLED", "GRADED"].includes(assessment.status) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setCancelTarget(assessment)}
                          >
                            <XCircle className="size-4 mr-2" />
                            Cancelar
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
