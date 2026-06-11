"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/shared/hooks/use-toast";
import { MoreHorizontal, Pencil, Archive, Plus, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
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
import {
  ASSESSMENT_COMPONENT_TYPE_LABELS,
  ASSESSMENT_POLICY_STATUS_LABELS,
} from "@/modules/assessments/types";
import { archiveAssessmentComponentAction } from "@/modules/assessments/actions/assessment.actions";
import { AssessmentComponentDrawer } from "./assessment-component-drawer";
import type { AssessmentComponent } from "@/modules/assessments/types";

interface Props {
  components: AssessmentComponent[];
  policyId: string;
  canManage: boolean;
}

const statusVariant = (s: string) =>
  s === "ACTIVE" ? "default" : s === "INACTIVE" ? "secondary" : "destructive";

export function PolicyComponentsTable({ components, policyId, canManage }: Props) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AssessmentComponent | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AssessmentComponent | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleArchive() {
    if (!archiveTarget) return;
    setLoading(true);
    const res = await archiveAssessmentComponentAction({ componentId: archiveTarget.id });
    setLoading(false);
    if (res.success) {
      toast.success("Componente arquivado.");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao arquivar componente.");
    }
  }

  function openCreate() {
    setEditTarget(null);
    setDrawerOpen(true);
  }

  function openEdit(c: AssessmentComponent) {
    setEditTarget(c);
    setDrawerOpen(true);
  }

  const totalWeight = components
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + c.weight, 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Componentes de Avaliação</h2>
          {components.length > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Peso total (ativos):{" "}
              <span className={totalWeight > 100 ? "font-semibold text-destructive" : "font-medium"}>
                {totalWeight}%
              </span>
            </p>
          )}
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4 mr-2" />
            Novo Componente
          </Button>
        )}
      </div>

      {components.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          Nenhum componente definido. Adicione componentes para estruturar as avaliações.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Peso (%)</TableHead>
                <TableHead>Obrigatório</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground">{c.order}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    {ASSESSMENT_COMPONENT_TYPE_LABELS[c.componentType] ?? c.componentType}
                  </TableCell>
                  <TableCell>{c.weight}%</TableCell>
                  <TableCell>
                    {c.isRequired ? (
                      <CheckCircle className="size-4 text-green-600" />
                    ) : (
                      <XCircle className="size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>
                      {ASSESSMENT_POLICY_STATUS_LABELS[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>
                            <Pencil className="size-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          {c.status !== "ARCHIVED" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setArchiveTarget(c)}
                            >
                              <Archive className="size-4 mr-2" />
                              Arquivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!archiveTarget} onOpenChange={() => setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar Componente</AlertDialogTitle>
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

      <AssessmentComponentDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditTarget(null);
        }}
        policyId={policyId}
        component={editTarget ?? undefined}
      />
    </>
  );
}
