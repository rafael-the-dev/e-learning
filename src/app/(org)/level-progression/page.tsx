import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { TrendingUp, ExternalLink, Clock } from "lucide-react";

export const metadata = { title: "Progressão por Nível" };

const LEVEL_PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  ELIGIBLE_TO_PROGRESS: "Elegível para Progressão",
  PROMOTED: "Promovido",
  PROMOTED_WITH_PENDING_SUBJECTS: "Promovido c/ Pendentes",
  BLOCKED: "Bloqueado",
  COMPLETED: "Concluído",
};

const LEVEL_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PASSED: "default", COMPLETED: "default", PROMOTED: "default",
  FAILED: "destructive", BLOCKED: "destructive",
  IN_PROGRESS: "secondary", PROMOTED_WITH_PENDING_SUBJECTS: "secondary",
  ELIGIBLE_TO_PROGRESS: "outline", NOT_STARTED: "outline",
};

const DECISION_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};

const DECISION_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
};

export default async function LevelProgressionPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.LEVEL_PROGRESSION_VIEW);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canManage = ability.can(PERMISSIONS.LEVEL_PROGRESSION_MANAGE);

  const db = await getDb();

  // Pending progression requests
  const pendingRequests = await db.levelProgressionRequest.findMany({
    where: { organizationId: context.organizationId, decision: "PENDING" },
    include: {
      student: { select: { firstName: true, lastName: true, code: true } },
      fromLevel: { select: { name: true } },
      toLevel: { select: { name: true } },
      course: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  // Students eligible to progress (ELIGIBLE_TO_PROGRESS status)
  const eligibleProgress = await db.studentLevelProgress.findMany({
    where: {
      organizationId: context.organizationId,
      status: "ELIGIBLE_TO_PROGRESS",
    },
    include: {
      courseLevel: { select: { name: true } },
      enrollment: {
        include: {
          student: { select: { firstName: true, lastName: true, code: true } },
          course: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <>
      <PageHeader
        title="Progressão por Nível"
        description="Pedidos de progressão manual e alunos elegíveis para progressão de nível"
      />

      <div className="p-8 space-y-8 max-w-4xl">
        {/* Pending Requests */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Pedidos de Progressão Pendentes</h2>
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="text-xs">{pendingRequests.length}</Badge>
            )}
          </div>

          {pendingRequests.length === 0 ? (
            <EmptyState
              title="Sem pedidos pendentes"
              description="Não existem pedidos de progressão manual a aguardar revisão."
            />
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="text-left px-5 py-3 font-medium">Aluno</th>
                    <th className="text-left px-5 py-3 font-medium">Curso</th>
                    <th className="text-left px-5 py-3 font-medium">De / Para</th>
                    <th className="text-left px-5 py-3 font-medium w-36">Estado</th>
                    <th className="text-left px-5 py-3 font-medium w-32">Pedido em</th>
                    {canManage && <th className="px-5 py-3 w-24" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pendingRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {[req.student.firstName, req.student.lastName].filter(Boolean).join(" ")}
                        </p>
                        {req.student.code && (
                          <p className="text-xs text-muted-foreground font-mono">{req.student.code}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{req.course.name}</td>
                      <td className="px-5 py-3">
                        <span className="text-muted-foreground">{req.fromLevel.name}</span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="font-medium">{req.toLevel.name}</span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={DECISION_BADGE_VARIANT[req.decision] ?? "outline"} className="text-xs">
                          {DECISION_LABELS[req.decision] ?? req.decision}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString("pt-PT")}
                      </td>
                      {canManage && (
                        <td className="px-5 py-3">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/enrollments/${req.enrollmentId}`}>
                              <ExternalLink className="size-3.5 mr-1" />
                              Ver
                            </Link>
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Eligible Students */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Alunos Elegíveis para Progressão</h2>
            {eligibleProgress.length > 0 && (
              <Badge variant="outline" className="text-xs">{eligibleProgress.length}</Badge>
            )}
          </div>

          {eligibleProgress.length === 0 ? (
            <EmptyState
              title="Nenhum aluno elegível"
              description="Nenhum aluno atingiu o critério de progressão neste momento."
            />
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="text-left px-5 py-3 font-medium">Aluno</th>
                    <th className="text-left px-5 py-3 font-medium">Curso</th>
                    <th className="text-left px-5 py-3 font-medium">Nível Atual</th>
                    <th className="text-right px-5 py-3 font-medium w-28">Média</th>
                    <th className="text-left px-5 py-3 font-medium w-36">Estado</th>
                    <th className="px-5 py-3 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {eligibleProgress.map((lp) => (
                    <tr key={lp.id} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {[lp.enrollment.student.firstName, lp.enrollment.student.lastName].filter(Boolean).join(" ")}
                        </p>
                        {lp.enrollment.student.code && (
                          <p className="text-xs text-muted-foreground font-mono">{lp.enrollment.student.code}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{lp.enrollment.course.name}</td>
                      <td className="px-5 py-3 font-medium">{lp.courseLevel.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-mono">
                        {lp.finalGrade != null
                          ? parseFloat(String(lp.finalGrade)).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={LEVEL_BADGE_VARIANT[lp.status] ?? "outline"} className="text-xs">
                          {LEVEL_PROGRESS_STATUS_LABELS[lp.status] ?? lp.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/enrollments/${lp.enrollmentId}`}>
                            <ExternalLink className="size-3.5 mr-1" />
                            Ver
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
