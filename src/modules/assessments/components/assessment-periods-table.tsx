"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/shared/hooks/use-toast";
import { MoreHorizontal, Pencil, Archive } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
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
import { ASSESSMENT_PERIOD_STATUS_LABELS } from "@/modules/assessments/types";
import { archiveAssessmentPeriodAction } from "@/modules/assessments/actions/assessment.actions";
import { AssessmentPeriodDrawer } from "./assessment-period-drawer";
import type { AssessmentPeriod } from "@/modules/assessments/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<AssessmentPeriod>;
  defaultSearch?: string;
  canEdit: boolean;
  canArchive: boolean;
}

const statusVariant = (s: string) =>
  s === "ACTIVE" ? "default" : s === "UPCOMING" ? "secondary" : "outline";

export function AssessmentPeriodsTable({ result, defaultSearch, canEdit, canArchive }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [archiveTarget, setArchiveTarget] = useState<AssessmentPeriod | null>(null);
  const [editTarget, setEditTarget] = useState<AssessmentPeriod | null>(null);
  const [loading, setLoading] = useState(false);

  function applyFilters(s: string) {
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    router.push(`?${params.toString()}`);
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setLoading(true);
    const res = await archiveAssessmentPeriodAction({ assessmentPeriodId: archiveTarget.id });
    setLoading(false);
    if (res.success) {
      toast.success("Período arquivado.");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar período.");
    }
  }

  return (
    <>
      <div className="flex gap-3">
        <Input
          placeholder="Pesquisar períodos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters(search)}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={() => applyFilters(search)}>
          Filtrar
        </Button>
      </div>

      {result.data.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          Nenhum período de avaliação encontrado.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12.5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((period) => (
                <TableRow key={period.id}>
                  <TableCell className="font-medium">{period.name}</TableCell>
                  <TableCell className="font-mono text-sm">{period.code}</TableCell>
                  <TableCell>
                    {new Date(period.startDate).toLocaleDateString("pt-PT")}
                  </TableCell>
                  <TableCell>
                    {new Date(period.endDate).toLocaleDateString("pt-PT")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(period.status)}>
                      {ASSESSMENT_PERIOD_STATUS_LABELS[period.status] ?? period.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(canEdit || canArchive) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setEditTarget(period)}>
                              <Pencil className="size-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {canArchive && period.status !== "ARCHIVED" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setArchiveTarget(period)}
                            >
                              <Archive className="size-4 mr-2" />
                              Arquivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls meta={result} />

      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar Período</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer arquivar &quot;{archiveTarget?.name}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={loading}>
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editTarget && (
        <AssessmentPeriodDrawer
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          period={editTarget}
        />
      )}
    </>
  );
}
