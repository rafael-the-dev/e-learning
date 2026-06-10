"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/shared/hooks/use-toast";
import { ClipboardEdit, Send, XCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
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
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_RESULT_STATUS_LABELS,
} from "@/modules/assessments/types";
import {
  cancelAssessmentAction,
  publishAssessmentResultsAction,
} from "@/modules/assessments/actions/assessment.actions";
import type { Assessment, AssessmentResult } from "@/modules/assessments/types";

interface Props {
  assessment: Assessment;
  results: AssessmentResult[];
  canEdit: boolean;
  canCancel: boolean;
  canPublish: boolean;
}

const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
  if (s === "GRADED") return "default";
  if (s === "SCHEDULED" || s === "DRAFT" || s === "OPEN") return "secondary";
  if (s === "CANCELLED") return "destructive";
  return "outline";
};

export function AssessmentDetail({ assessment, results, canEdit, canCancel, canPublish }: Props) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    const res = await cancelAssessmentAction({ assessmentId: assessment.id });
    setLoading(false);
    if (res.success) {
      toast.success("Avaliação cancelada.");
      setCancelOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao cancelar.");
    }
  }

  async function handlePublish() {
    setLoading(true);
    const res = await publishAssessmentResultsAction({ assessmentId: assessment.id });
    setLoading(false);
    if (res.success) {
      toast.success("Resultados publicados.");
      setPublishOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao publicar resultados.");
    }
  }

  const gradedCount = results.filter((r) => r.status === "GRADED").length;
  const totalCount = results.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{assessment.title}</h2>
          {assessment.description && (
            <p className="text-muted-foreground mt-1">{assessment.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusVariant(assessment.status)}>
            {ASSESSMENT_STATUS_LABELS[assessment.status] ?? assessment.status}
          </Badge>
          {canEdit && assessment.status === "GRADED" && canPublish && (
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              <Send className="size-4 mr-1.5" />
              Publicar Resultados
            </Button>
          )}
          {canEdit && ["DRAFT", "SCHEDULED"].includes(assessment.status) && (
            <Button size="sm" asChild>
              <Link href={`/assessments/${assessment.id}/grade`}>
                <ClipboardEdit className="size-4 mr-1.5" />
                Lançar Notas
              </Link>
            </Button>
          )}
          {canCancel && !["CANCELLED", "GRADED"].includes(assessment.status) && (
            <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="size-4 mr-1.5" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Política</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{assessment.assessmentPolicyName ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Componente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{assessment.componentName ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Turma</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{assessment.classGroupName ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Nota Máxima</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{assessment.maxScore}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">
            Resultados ({gradedCount}/{totalCount} classificados)
          </h3>
        </div>
        {results.length === 0 ? (
          <div className="rounded-md border p-10 text-center text-muted-foreground">
            Nenhum resultado registado.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Nota Normalizada</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.studentName ?? r.studentId}
                    </TableCell>
                    <TableCell>
                      {r.score != null ? `${Number(r.score).toFixed(1)} / ${assessment.maxScore}` : "—"}
                    </TableCell>
                    <TableCell>
                      {r.normalizedScore != null
                        ? `${Number(r.normalizedScore).toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "GRADED" ? "default" : "secondary"}>
                        {ASSESSMENT_RESULT_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={() => setCancelOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Avaliação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer cancelar esta avaliação? Esta ação não pode ser revertida.
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

      <AlertDialog open={publishOpen} onOpenChange={() => setPublishOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar Resultados</AlertDialogTitle>
            <AlertDialogDescription>
              Os resultados serão notificados a todos os alunos. Confirma a publicação?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={loading}>
              Publicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
