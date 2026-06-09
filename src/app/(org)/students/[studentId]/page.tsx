import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Separator } from "@/shared/components/ui/separator";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentById } from "@/modules/students/services/student.service";
import { StudentDetailActions } from "@/modules/students/components/student-detail-actions";
import { NotFoundError } from "@/shared/lib/command";
import { GENDER_LABELS, ID_TYPE_LABELS } from "@/modules/students/types";
import { getWalletByStudentId, getRecentTransactions } from "@/modules/wallets/services/wallet.service";
import { StudentWalletCard } from "@/modules/wallets/components/student-wallet-card";
import { getRecentTimelineEvents } from "@/modules/student-timeline/services/student-timeline.service";
import { StudentTimelinePreview } from "@/modules/student-timeline/components/student-timeline-preview";
import { getDb } from "@/server/db";
import { calculateEnrollmentAttendanceSummary } from "@/modules/attendance/services/attendance-calculator.service";
import type { StudentSubjectAttendance } from "@/modules/attendance/types";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Building2,
  Pencil,
  GraduationCap,
  ClipboardList,
} from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.STUDENTS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { studentId } = await params;

  let student;
  try {
    student = await getStudentById(studentId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const canViewAttendance = context.ability.can(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);

  const [wallet, recentTimeline] = await Promise.all([
    getWalletByStudentId(studentId, context.organizationId),
    context.ability.can(PERMISSIONS.STUDENT_TIMELINE_VIEW)
      ? getRecentTimelineEvents(studentId, context.organizationId, 5)
      : Promise.resolve([]),
  ]);
  const recentWalletTxs = wallet
    ? await getRecentTransactions(wallet.id, context.organizationId, 3)
    : [];
  const canManageWallet = context.ability.can(PERMISSIONS.WALLET_TRANSACTIONS_DEPOSIT);

  type EnrollmentAttendance = {
    enrollmentId: string;
    classGroupName: string;
    subjects: StudentSubjectAttendance[];
  };
  let attendanceByEnrollment: EnrollmentAttendance[] = [];
  if (canViewAttendance) {
    const db = await getDb();
    const enrollments = await db.enrollment.findMany({
      where: { studentId, organizationId: context.organizationId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        classGroupId: true,
        classGroup: { select: { name: true } },
      },
    });
    attendanceByEnrollment = (
      await Promise.all(
        enrollments
          .filter((e) => e.classGroupId)
          .map(async (e) => ({
            enrollmentId: e.id,
            classGroupName: e.classGroup?.name ?? "",
            subjects: await calculateEnrollmentAttendanceSummary(
              studentId,
              e.id,
              e.classGroupId!,
              context.organizationId
            ).catch(() => []),
          }))
      )
    ).filter((e) => e.subjects.length > 0);
  }

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/students" className="hover:text-foreground transition-colors">
        Alunos
      </Link>
      <span>/</span>
      <span className="text-foreground">{student.fullName}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={student.fullName}
        description={student.email ?? student.phone ?? ""}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/students/${student.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Link>
            </Button>
            <StudentDetailActions student={student} />
          </div>
        }
      />

      <div className="p-8 space-y-6 max-w-2xl">
        {/* Status + branch */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={student.status} />
          {student.branch && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
              <Building2 className="size-3" />
              {student.branch.name}
            </span>
          )}
          {student.code && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">
              #{student.code}
            </span>
          )}
        </div>

        <Separator />

        {/* Contact info */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Informações de Contacto</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow icon={<Phone className="size-3.5" />} label="Telefone" value={student.phone ?? "—"} />
            <DetailRow icon={<Mail className="size-3.5" />} label="E-mail" value={student.email ?? "—"} />
            <DetailRow icon={<MapPin className="size-3.5" />} label="Morada" value={student.address ?? "—"} />
          </dl>
        </div>

        {/* Personal info */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Informação Pessoal</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Data de Nasc."
              value={
                student.dateOfBirth
                  ? new Date(student.dateOfBirth).toLocaleDateString("pt-PT")
                  : "—"
              }
            />
            <DetailRow
              label="Género"
              value={student.gender ? (GENDER_LABELS[student.gender] ?? student.gender) : "—"}
            />
            <DetailRow
              icon={<CreditCard className="size-3.5" />}
              label="Documento"
              value={
                student.idNumber
                  ? `${student.idType ? (ID_TYPE_LABELS[student.idType] ?? student.idType) + " · " : ""}${student.idNumber}`
                  : "—"
              }
            />
          </dl>
        </div>

        {/* Timestamps */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Registo</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Registado a"
              value={new Date(student.createdAt).toLocaleDateString("pt-PT")}
            />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Atualizado a"
              value={new Date(student.updatedAt).toLocaleDateString("pt-PT")}
            />
          </dl>
        </div>

        {/* Enrollments */}
        <div className="rounded-xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Matrículas</h3>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/enrollments?studentId=${studentId}`}>
                Ver matrículas
              </Link>
            </Button>
          </div>
        </div>

        {/* Wallet */}
        <StudentWalletCard
          wallet={wallet}
          recentTransactions={recentWalletTxs}
          canDeposit={canManageWallet}
          studentId={studentId}
        />

        {/* Timeline preview */}
        {context.ability.can(PERMISSIONS.STUDENT_TIMELINE_VIEW) && (
          <StudentTimelinePreview events={recentTimeline} studentId={studentId} />
        )}

        {/* Attendance summary */}
        {canViewAttendance && (
          <div className="rounded-xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Presenças</h3>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/attendance/sessions?studentId=${studentId}`}>
                  Ver sessões
                </Link>
              </Button>
            </div>
            {attendanceByEnrollment.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum registo de presença disponível.</p>
            ) : (
              attendanceByEnrollment.map((enrollment) => (
                <div key={enrollment.enrollmentId} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{enrollment.classGroupName}</p>
                  <div className="space-y-1.5">
                    {enrollment.subjects.map((s) => (
                      <div key={s.levelSubjectId} className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[55%]">{s.subjectName}</span>
                        <span className={
                          s.status === "BELOW_REQUIRED"
                            ? "text-destructive font-semibold"
                            : s.status === "AT_RISK"
                            ? "text-yellow-600 font-semibold"
                            : "text-green-600 font-semibold"
                        }>
                          {s.attendancePercentage.toFixed(1)}%
                          {s.minimumAttendancePercentage != null && (
                            <span className="text-muted-foreground font-normal ml-1">
                              (mín. {s.minimumAttendancePercentage}%)
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
