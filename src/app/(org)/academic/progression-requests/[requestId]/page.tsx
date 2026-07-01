import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { findProgressionRequestById } from "@/modules/prerequisites/repositories/level-progression-request.repository";
import { findLevelProgressByEnrollment } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { evaluateLevelProgression } from "@/modules/prerequisites/engines/level-progression.engine";
import { ProgressionReviewActions } from "@/modules/prerequisites/components/progression-review-actions";
import {
  PROGRESSION_REQUEST_DECISION_LABELS,
  PROGRESSION_MODE_LABELS,
  STUDENT_LEVEL_PROGRESS_STATUS_LABELS,
} from "@/modules/prerequisites/types";
import {
  STUDENT_SUBJECT_PROGRESS_STATUS_LABELS,
} from "@/modules/assessments/types";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Rever Pedido de Progressão" };

const DECISION_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

const SUBJECT_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PASSED: "default",
  FAILED: "destructive",
  IN_PROGRESS: "secondary",
  INCOMPLETE: "secondary",
  BLOCKED: "destructive",
  NOT_STARTED: "outline",
};

function fmtDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("pt-PT") : "—";
}

function fmtGrade(g: number | null): string {
  return g != null ? g.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
}

export default async function ProgressionRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.LEVEL_PROGRESSION_REQUESTS_VIEW);
  await redirectIfTeacherScoped(context);

  const { requestId } = await params;
  const request = await findProgressionRequestById(requestId, context.organizationId);
  if (!request) notFound();

  const canApprove = context.ability.can(PERMISSIONS.LEVEL_PROGRESSION_REQUESTS_APPROVE);
  const canReject = context.ability.can(PERMISSIONS.LEVEL_PROGRESSION_REQUESTS_REJECT);
  const isPending = request.decision === "PENDING";

  const db = await getDb();

  // Subject results for the origin level.
  const levelSubjects = await db.levelSubject.findMany({
    where: { courseLevelId: request.fromLevelId, organizationId: context.organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, isRequired: true, subject: { select: { name: true } } },
  });
  const subjectProgress = await db.studentSubjectProgress.findMany({
    where: {
      enrollmentId: request.enrollmentId,
      organizationId: context.organizationId,
      levelSubjectId: { in: levelSubjects.map((ls) => ls.id) },
    },
    select: { levelSubjectId: true, status: true, finalGrade: true },
  });
  const progressMap = new Map(subjectProgress.map((p) => [p.levelSubjectId, p]));

  const subjectResults = levelSubjects.map((ls) => {
    const p = progressMap.get(ls.id);
    return {
      name: ls.subject.name,
      isRequired: ls.isRequired,
      status: p?.status ?? "NOT_STARTED",
      finalGrade: p?.finalGrade != null ? parseFloat(String(p.finalGrade)) : null,
    };
  });

  const failed = subjectResults.filter((s) => s.status === "FAILED");
  const recovery = subjectResults.filter((s) => s.status === "INCOMPLETE");
  const pending = subjectResults.filter((s) => s.status === "NOT_STARTED" || s.status === "IN_PROGRESS" || s.status === "BLOCKED");

  // Current engine recommendation for this transition (re-evaluated live).
  const engineResult = await evaluateLevelProgression(
    request.enrollmentId,
    request.fromLevelId,
    context.organizationId
  );

  // Transcript snapshot — per-level progress across the course.
  const transcript = await findLevelProgressByEnrollment(request.enrollmentId, context.organizationId);

  return (
    <>
      <PageHeader
        title={`Pedido de Progressão — ${request.studentName || "Aluno"}`}
        description={`${request.courseName} · ${request.fromLevelName} → ${request.toLevelName}`}
        actions={
          isPending ? (
            <ProgressionReviewActions requestId={request.id} canApprove={canApprove} canReject={canReject} />
          ) : undefined
        }
      />

      <div className="p-8 space-y-8 max-w-4xl">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/academic/progression-requests">
            <ArrowLeft className="size-4 mr-1.5" />
            Voltar à fila
          </Link>
        </Button>

        {/* Summary */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Aluno" value={request.studentName || "—"} sub={request.studentCode} />
          <Field label="Curso" value={request.courseName} />
          <Field label="Estado do pedido">
            <Badge variant={DECISION_BADGE_VARIANT[request.decision] ?? "outline"}>
              {PROGRESSION_REQUEST_DECISION_LABELS[request.decision] ?? request.decision}
            </Badge>
          </Field>
          <Field label="Nível atual" value={request.fromLevelName} />
          <Field label="Nível de destino" value={request.toLevelName} />
          <Field label="Modo de progressão" value={request.progressionMode ? PROGRESSION_MODE_LABELS[request.progressionMode] ?? request.progressionMode : "—"} />
          <Field label="Matrícula">
            <StatusBadge status={request.enrollmentStatus} />
          </Field>
          <Field label="Pedido em" value={fmtDate(request.requestedAt)} />
          <Field label="Revisto em" value={fmtDate(request.reviewedAt)} sub={request.reviewedByName} />
        </section>

        {/* Engine recommendation + reason */}
        <section className="rounded-xl border p-5 space-y-3 bg-muted/10">
          <h2 className="text-sm font-semibold">Recomendação do motor</h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{engineResult.outcome}</Badge>
            <span className="text-sm text-muted-foreground">{engineResult.reason}</span>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-1">
            <Stat label="Reprovadas (obrig.)" value={engineResult.failedRequiredSubjectsCount} />
            <Stat label="Pendentes" value={engineResult.pendingSubjectsCount} />
            <Stat label="Créditos obtidos" value={engineResult.earnedCredits} />
            <Stat label="Créditos exigidos" value={engineResult.requiredCredits ?? "—"} />
          </dl>
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">Motivo da aprovação manual</p>
            <p className="text-sm">{request.reason ?? "—"}</p>
          </div>
          {request.reviewNotes && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">Notas / motivo da revisão</p>
              <p className="text-sm">{request.reviewNotes}</p>
            </div>
          )}
        </section>

        {/* Subject results */}
        <section className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Resultados por disciplina</h2>
            <span className="text-xs text-muted-foreground">
              {failed.length} reprovada(s) · {pending.length} pendente(s) · {recovery.length} em recuperação
            </span>
          </div>
          {subjectResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem disciplinas registadas neste nível.</p>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="text-left px-5 py-3 font-medium">Disciplina</th>
                    <th className="text-left px-5 py-3 font-medium w-28">Tipo</th>
                    <th className="text-left px-5 py-3 font-medium w-36">Estado</th>
                    <th className="text-right px-5 py-3 font-medium w-24">Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subjectResults.map((s, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{s.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{s.isRequired ? "Obrigatória" : "Opcional"}</td>
                      <td className="px-5 py-3">
                        <Badge variant={SUBJECT_BADGE_VARIANT[s.status] ?? "outline"} className="text-xs">
                          {STUDENT_SUBJECT_PROGRESS_STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-mono">{fmtGrade(s.finalGrade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Transcript snapshot */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Histórico por nível</h2>
          {transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico de progresso por nível.</p>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="text-left px-5 py-3 font-medium">Nível</th>
                    <th className="text-left px-5 py-3 font-medium w-44">Estado</th>
                    <th className="text-right px-5 py-3 font-medium w-24">Média</th>
                    <th className="text-right px-5 py-3 font-medium w-28">Créditos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transcript.map((lp) => (
                    <tr key={lp.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{lp.courseLevelName ?? "—"}</td>
                      <td className="px-5 py-3">
                        <Badge variant="outline" className="text-xs">
                          {STUDENT_LEVEL_PROGRESS_STATUS_LABELS[lp.status] ?? lp.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-mono">{fmtGrade(lp.finalGrade)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-mono">{lp.earnedCredits ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value?: string;
  sub?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children ?? <p className="text-sm font-medium">{value}</p>}
      {sub && <p className="text-xs text-muted-foreground font-mono">{sub}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
