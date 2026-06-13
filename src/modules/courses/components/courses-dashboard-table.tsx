"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/shared/hooks/use-toast";
import { MoreHorizontal, Eye, Pencil, Archive } from "lucide-react";
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
import { COURSE_STATUS_LABELS } from "@/modules/courses/types";
import { archiveCourseAction } from "@/modules/courses/actions/course.actions";
import { BookMarked } from "lucide-react";
import type { CourseDashboardRow } from "@/modules/courses/services/course-metrics.service";
import type { CourseCategory } from "@/modules/courses/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  DRAFT: "secondary",
  INACTIVE: "outline",
  ARCHIVED: "outline",
};

interface Props {
  result: PaginatedResult<CourseDashboardRow>;
  categories: CourseCategory[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultCategoryId?: string;
  canEdit: boolean;
  canArchive: boolean;
}

export function CoursesDashboardTable({
  result,
  categories,
  defaultSearch,
  defaultStatus,
  defaultCategoryId,
  canEdit,
  canArchive,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (defaultStatus) params.set("status", defaultStatus);
    if (defaultCategoryId) params.set("categoryId", defaultCategoryId);
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setLoading(true);
    const res = await archiveCourseAction(archiveTarget.id);
    setLoading(false);
    if (res.success) {
      toast.success(`"${archiveTarget.name}" arquivado.`);
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar curso.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 pb-3">
        <Input
          placeholder="Pesquisar por nome ou código..."
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
            {Object.entries(COURSE_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categories.length > 0 && (
          <Select
            value={defaultCategoryId || "ALL"}
            onValueChange={(v) => applyFilters({ categoryId: v === "ALL" ? "" : v })}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as categorias</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<BookMarked className="size-8" />}
          title="Nenhum curso encontrado"
          description="Ajuste os filtros ou crie o primeiro curso."
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Níveis</TableHead>
                <TableHead className="text-center">Disciplinas</TableHead>
                <TableHead className="text-center">Turmas Ativas</TableHead>
                <TableHead className="text-center">Matrículas Ativas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Criado Em</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((c) => {
                const isOperational =
                  c.status === "ACTIVE" &&
                  c.levelCount > 0 &&
                  c.subjectCount > 0 &&
                  c.activeClassGroupCount > 0 &&
                  c.activeEnrollmentCount > 0;

                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1 min-w-0">
                        <Link
                          href={`/courses/${c.id}`}
                          className="font-medium hover:underline truncate"
                        >
                          {c.name}
                        </Link>
                        {c.code && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {c.code}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {isOperational && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Operacional
                            </span>
                          )}
                          {c.levelCount === 0 && c.status === "ACTIVE" && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                              Sem Nível
                            </span>
                          )}
                          {c.subjectCount === 0 && c.status === "ACTIVE" && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-orange-50 text-orange-700 border-orange-200">
                              Sem Disciplina
                            </span>
                          )}
                          {c.activeClassGroupCount === 0 &&
                            c.status === "ACTIVE" &&
                            !isOperational && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                                Sem Turma
                              </span>
                            )}
                          {c.activeEnrollmentCount === 0 &&
                            c.status === "ACTIVE" &&
                            c.activeClassGroupCount > 0 && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                                Sem Matrículas
                              </span>
                            )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`text-xs font-mono tabular-nums font-medium ${
                          c.levelCount === 0 && c.status === "ACTIVE"
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        {c.levelCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`text-xs font-mono tabular-nums font-medium ${
                          c.subjectCount === 0 && c.status === "ACTIVE"
                            ? "text-orange-600"
                            : "text-foreground"
                        }`}
                      >
                        {c.subjectCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`text-xs font-mono tabular-nums font-medium ${
                          c.activeClassGroupCount === 0 && c.status === "ACTIVE" && !isOperational
                            ? "text-amber-600"
                            : "text-foreground"
                        }`}
                      >
                        {c.activeClassGroupCount}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`text-xs font-mono tabular-nums font-medium ${
                          c.activeEnrollmentCount === 0 &&
                          c.status === "ACTIVE" &&
                          c.activeClassGroupCount > 0
                            ? "text-blue-600"
                            : c.activeEnrollmentCount > 0
                            ? "text-indigo-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {c.activeEnrollmentCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status] ?? "outline"} className="text-xs">
                        {COURSE_STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString("pt-PT")}
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
                            <Link href={`/courses/${c.id}`}>
                              <Eye className="size-4 mr-2" />
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem asChild>
                              <Link href={`/courses/${c.id}/edit`}>
                                <Pencil className="size-4 mr-2" />
                                Editar
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {canArchive && c.status !== "ARCHIVED" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setArchiveTarget({ id: c.id, name: c.name })}
                              >
                                <Archive className="size-4 mr-2" />
                                Arquivar
                              </DropdownMenuItem>
                            </>
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

      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar Curso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende arquivar &quot;{archiveTarget?.name}&quot;? O curso ficará
              inativo mas os registos existentes serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
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
