import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Badge } from "@/shared/components/ui/badge";
import { TimelineEventIcon } from "@/modules/student-timeline/components/timeline-event-icon";
import { GENDER_LABELS, ID_TYPE_LABELS } from "@/modules/students/types";
import { TIMELINE_EVENT_TYPE_LABELS } from "@/modules/student-timeline/types";
import {
  User,
  GraduationCap,
  BookOpen,
  CircleDollarSign,
  Activity,
  ShieldAlert,
  History,
} from "lucide-react";
import { resolveCurrentEnrollmentLevel } from "@/modules/students/student-360/services/student-360.service";
import type { Student360Core } from "@/modules/students/student-360/services/student-360.service";
import { StudentPortalAccountCard } from "@/modules/students/student-360/components/student-portal-account-card";
import type { StudentPortalAccountDto } from "@/modules/students/services/student-user-provisioning.service";
import { StudentGuardiansCard } from "@/modules/guardian-portal/components/student-guardians-card";
import type { StudentGuardianLinkDto } from "@/modules/guardian-portal/services/guardian-provisioning.service";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-PT", { style: "currency", currency: "MZN" });
}

export function StudentOverviewTab({
  core,
  portalAccount,
  canManagePortalAccount = false,
  guardianLinks = [],
  canManageGuardians = false,
}: {
  core: Student360Core;
  portalAccount?: StudentPortalAccountDto;
  canManagePortalAccount?: boolean;
  guardianLinks?: StudentGuardianLinkDto[];
  canManageGuardians?: boolean;
}) {
  const { student, currentEnrollment, statement, subjectProgress, levelProgress, attendanceSubjects, recentTimeline, documentCount } = core;
  const currentLevel = resolveCurrentEnrollmentLevel(currentEnrollment);

  const passed = subjectProgress.filter((p) => p.status === "PASSED").length;
  const failed = subjectProgress.filter((p) => p.status === "FAILED").length;
  const inProgress = subjectProgress.filter((p) => p.status === "IN_PROGRESS").length;
  const blocked = levelProgress.some((p) => p.status === "BLOCKED");

  const belowRequired = attendanceSubjects.filter((s) => s.status === "BELOW_REQUIRED");
  // attendancePercentage is null for NOT_STARTED subjects (no persisted summary
  // yet) — exclude those from the average rather than treating them as 0%.
  const attendancePercentages = attendanceSubjects
    .map((s) => s.attendancePercentage)
    .filter((p): p is number => p != null);
  const avgAttendance =
    attendancePercentages.length > 0
      ? attendancePercentages.reduce((sum, p) => sum + p, 0) / attendancePercentages.length
      : null;

  const academicRisk = failed > 0 || blocked;
  const financeRisk = (statement?.kpis.outstandingBalance ?? 0) > 0;
  const attendanceRisk = belowRequired.length > 0;
  const documentRisk = documentCount === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {portalAccount && (
        <StudentPortalAccountCard account={portalAccount} canManage={canManagePortalAccount} />
      )}

      <StudentGuardiansCard
        studentId={student.id}
        links={guardianLinks}
        canManage={canManageGuardians}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Informação Pessoal</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Nome" value={student.fullName} />
            <Row label="Género" value={student.gender ? GENDER_LABELS[student.gender] ?? student.gender : "—"} />
            <Row
              label="Data de Nasc."
              value={student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString("pt-PT") : "—"}
            />
            <Row label="E-mail" value={student.email ?? "—"} />
            <Row label="Telefone" value={student.phone ?? "—"} />
            <Row label="Morada" value={student.address ?? "—"} />
            <Row
              label="Documento"
              value={
                student.idNumber
                  ? `${student.idType ? (ID_TYPE_LABELS[student.idType] ?? student.idType) + " · " : ""}${student.idNumber}`
                  : "—"
              }
            />
            <Row label="Filial" value={student.branch?.name ?? "—"} />
            <Row label="Registado em" value={new Date(student.createdAt).toLocaleDateString("pt-PT")} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Matrícula Atual</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!currentEnrollment ? (
            <p className="text-sm text-muted-foreground">Sem matrículas registadas.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Row label="Curso" value={currentEnrollment.courseName ?? "—"} />
              <Row label="Nível Atual" value={currentLevel.name ?? "—"} />
              <Row label="Turma" value={currentEnrollment.classGroupName ?? "—"} />
              <Row label="Ano Letivo" value={currentEnrollment.academicYearName ?? "—"} />
              <Row label="Período" value={currentEnrollment.academicTermName ?? "—"} />
              <Row label="N.º Matrícula" value={currentEnrollment.enrollmentNumber ?? "—"} />
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground mb-1">Estado</dt>
                <dd>
                  <StatusBadge status={currentEnrollment.status} />
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Resumo Académico</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Disciplinas Aprovadas" value={String(passed)} />
            <Row label="Disciplinas Reprovadas" value={String(failed)} />
            <Row label="Disciplinas em Curso" value={String(inProgress)} />
            <Row label="Progressão Bloqueada" value={blocked ? "Sim" : "Não"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Resumo Financeiro</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Total Faturado" value={formatCurrency(statement?.kpis.totalInvoiced ?? 0)} />
            <Row label="Total Pago" value={formatCurrency(statement?.kpis.totalPaid ?? 0)} />
            <Row label="Saldo em Dívida" value={formatCurrency(statement?.kpis.outstandingBalance ?? 0)} />
            <Row label="Saldo da Carteira" value={formatCurrency(statement?.kpis.walletBalance ?? 0)} />
            <Row label="Reembolsos Pendentes" value={formatCurrency(statement?.kpis.totalRefunded ?? 0)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Resumo de Assiduidade</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Assiduidade Média" value={avgAttendance != null ? `${avgAttendance.toFixed(1)}%` : "—"} />
            <Row label="Disciplinas Abaixo do Mínimo" value={String(belowRequired.length)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Resumo de Risco</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <RiskRow label="Risco Académico" risk={academicRisk} />
            <RiskRow label="Risco Financeiro" risk={financeRisk} />
            <RiskRow label="Risco de Assiduidade" risk={attendanceRisk} />
            <RiskRow label="Risco Documental" risk={documentRisk} />
          </dl>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Atividade Recente</CardTitle>
            </div>
            <Link href={`/students/${student.id}/timeline`} className="text-xs text-primary hover:underline">
              Ver timeline completa
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentTimeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registado ainda.</p>
          ) : (
            <ul className="space-y-2">
              {recentTimeline.map((event) => (
                <li key={event.id} className="flex items-start gap-2.5">
                  <TimelineEventIcon eventType={event.eventType} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.occurredAt).toLocaleDateString("pt-PT")}
                      {" · "}
                      {TIMELINE_EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

function RiskRow({ label, risk }: { label: string; risk: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd>
        <Badge variant={risk ? "destructive" : "secondary"} className="text-xs">
          {risk ? "Em Risco" : "OK"}
        </Badge>
      </dd>
    </div>
  );
}
