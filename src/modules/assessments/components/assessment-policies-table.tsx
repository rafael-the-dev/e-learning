"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/shared/hooks/use-toast";
import { MoreHorizontal, Pencil, Archive, ExternalLink } from "lucide-react";
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
import {
  ASSESSMENT_POLICY_STATUS_LABELS,
  ASSESSMENT_CALCULATION_METHOD_LABELS,
} from "@/modules/assessments/types";
import { archiveAssessmentPolicyAction } from "@/modules/assessments/actions/assessment.actions";
import { AssessmentPolicyDrawer } from "./assessment-policy-drawer";
import type { AssessmentPolicy } from "@/modules/assessments/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<AssessmentPolicy>;
  defaultSearch?: string;
  canEdit: boolean;
  canArchive: boolean;
}

const statusVariant = (s: string) =>
  s === "ACTIVE" ? "default" : s === "INACTIVE" ? "secondary" : "destructive";

export function AssessmentPoliciesTable({ result, defaultSearch, canEdit, canArchive }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [archiveTarget, setArchiveTarget] = useState<AssessmentPolicy | null>(null);
  const [editTarget, setEditTarget] = useState<AssessmentPolicy | null>(null);
  const [loading, setLoading] = useState(false);

  function applyFilters(newSearch: string) {
    const params = new URLSearchParams();
    if (newSearch) params.set("search", newSearch);
    router.push(`?${params.toString()}`);
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setLoading(true);
    const res = await archiveAssessmentPolicyAction({ assessmentPolicyId: archiveTarget.id });
    setLoading(false);
    if (res.success) {
      toast.success("Política arquivada.");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar política.");
    }
  }

  return (
    <>
      <div className="flex gap-3">
        <Input
          placeholder="Pesquisar políticas..."
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
          Nenhuma política de avaliação encontrada.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Disciplina / Nível</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Nota Mínima</TableHead>
                <TableHead>Componentes</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12.5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/assessment-policies/${policy.id}`}
                      className="hover:underline"
                    >
                      {policy.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {policy.subjectName && (
                      <span>
                        {policy.subjectName}
                        {policy.courseLevelName && (
                          <span className="text-muted-foreground ml-1">
                            · {policy.courseLevelName}
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {ASSESSMENT_CALCULATION_METHOD_LABELS[policy.calculationMethod] ??
                      policy.calculationMethod}
                  </TableCell>
                  <TableCell>{policy.minimumPassingGrade}</TableCell>
                  <TableCell>{policy.componentsCount ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(policy.status)}>
                      {ASSESSMENT_POLICY_STATUS_LABELS[policy.status] ?? policy.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {true && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/assessment-policies/${policy.id}`}>
                              <ExternalLink className="size-4 mr-2" />
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem onClick={() => setEditTarget(policy)}>
                              <Pencil className="size-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {canArchive && policy.status !== "ARCHIVED" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setArchiveTarget(policy)}
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
            <AlertDialogTitle>Arquivar Política</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer arquivar &quot;{archiveTarget?.name}&quot;? Esta ação pode ser
              revertida.
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
        <AssessmentPolicyDrawer
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          policy={editTarget}
        />
      )}
    </>
  );
}
