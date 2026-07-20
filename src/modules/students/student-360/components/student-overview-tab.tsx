import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { GENDER_LABELS, ID_TYPE_LABELS } from "@/modules/students/types";
import { User, GraduationCap } from "lucide-react";
import type { Student360Core } from "@/modules/students/student-360/services/student-360.service";
import { StudentPortalAccountCard } from "@/modules/students/student-360/components/student-portal-account-card";
import type { StudentPortalAccountDto } from "@/modules/students/services/student-user-provisioning.service";
import { StudentGuardiansCard } from "@/modules/guardian-portal/components/student-guardians-card";
import type { StudentGuardianLinkDto } from "@/modules/guardian-portal/services/guardian-provisioning.service";

// Visão Geral (H7): IDENTITY + enrolment + portal account + guardians only. The at-a-glance
// metrics live once in the page-level status band + operational cards, and the full tables
// live in the domain tabs — this tab no longer duplicates any of them.
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
  const { student, currentEnrollment, academicSummary } = core;
  // Current level comes from the canonical academic summary (M1) — not re-resolved here.
  const currentLevel = academicSummary.currentLevel;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {portalAccount && (
        <StudentPortalAccountCard account={portalAccount} canManage={canManagePortalAccount} />
      )}

      <StudentGuardiansCard studentId={student.id} links={guardianLinks} canManage={canManageGuardians} />

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
