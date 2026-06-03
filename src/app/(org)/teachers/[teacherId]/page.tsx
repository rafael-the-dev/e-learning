import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Separator } from "@/shared/components/ui/separator";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getTeacherWithSubjects } from "@/modules/teachers/services/teacher.service";
import { TeacherDetailActions } from "@/modules/teachers/components/teacher-detail-actions";
import { NotFoundError } from "@/shared/lib/command";
import { GENDER_LABELS, ID_TYPE_LABELS } from "@/modules/teachers/types";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Building2,
  Pencil,
  BookOpen,
  Users,
  ClipboardList,
  Award,
} from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export default async function TeacherDetailPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.TEACHERS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { teacherId } = await params;

  let teacher;
  try {
    teacher = await getTeacherWithSubjects(teacherId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/teachers" className="hover:text-foreground transition-colors">
        Professores
      </Link>
      <span>/</span>
      <span className="text-foreground">{teacher.fullName}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={teacher.fullName}
        description={teacher.email ?? teacher.phone ?? ""}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/teachers/${teacher.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Link>
            </Button>
            <TeacherDetailActions teacher={teacher} />
          </div>
        }
      />

      <div className="p-8 space-y-6 max-w-2xl">
        {/* Status + branch */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={teacher.status} />
          {teacher.branch && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
              <Building2 className="size-3" />
              {teacher.branch.name}
            </span>
          )}
          {teacher.code && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">
              #{teacher.code}
            </span>
          )}
          {teacher.specialization && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
              <Award className="size-3" />
              {teacher.specialization}
            </span>
          )}
        </div>

        <Separator />

        {/* Contact info */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Informações de Contacto</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow icon={<Phone className="size-3.5" />} label="Telefone" value={teacher.phone ?? "—"} />
            <DetailRow icon={<Mail className="size-3.5" />} label="E-mail" value={teacher.email ?? "—"} />
            <DetailRow icon={<MapPin className="size-3.5" />} label="Morada" value={teacher.address ?? "—"} />
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
                teacher.dateOfBirth
                  ? new Date(teacher.dateOfBirth).toLocaleDateString("pt-PT")
                  : "—"
              }
            />
            <DetailRow
              label="Género"
              value={teacher.gender ? (GENDER_LABELS[teacher.gender] ?? teacher.gender) : "—"}
            />
            <DetailRow
              icon={<CreditCard className="size-3.5" />}
              label="Documento"
              value={
                teacher.idNumber
                  ? `${teacher.idType ? (ID_TYPE_LABELS[teacher.idType] ?? teacher.idType) + " · " : ""}${teacher.idNumber}`
                  : "—"
              }
            />
          </dl>
        </div>

        {/* Professional info */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Informação Profissional</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Award className="size-3.5" />}
              label="Licença"
              value={teacher.licenseNumber ?? "—"}
            />
            <DetailRow
              icon={<BookOpen className="size-3.5" />}
              label="Especialização"
              value={teacher.specialization ?? "—"}
            />
          </dl>
        </div>

        {/* Assigned subjects */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Disciplinas Atribuídas</h3>
          {teacher.teacherSubjects.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma disciplina atribuída. As disciplinas podem ser atribuídas após configurar os cursos.
            </p>
          ) : (
            <ul className="space-y-2">
              {teacher.teacherSubjects.map((ts) => (
                <li key={ts.id} className="text-sm flex items-start gap-2">
                  <BookOpen className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{ts.subjectName}</span>
                    {ts.subjectCode && (
                      <span className="text-muted-foreground ml-1">({ts.subjectCode})</span>
                    )}
                    <span className="text-muted-foreground"> — {ts.courseName} · {ts.courseLevelName}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Timestamps */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Registo</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Registado a"
              value={new Date(teacher.createdAt).toLocaleDateString("pt-PT")}
            />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Atualizado a"
              value={new Date(teacher.updatedAt).toLocaleDateString("pt-PT")}
            />
          </dl>
        </div>

        {/* Class groups placeholder */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <h3 className="text-sm font-semibold">Turmas</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {/* TODO: implement class groups module */}
            Nenhuma turma atribuída.
          </p>
        </div>

        {/* Practical lessons placeholder */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="size-4" />
            <h3 className="text-sm font-semibold">Aulas Práticas</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {/* TODO: implement practical lessons module */}
            Nenhuma aula prática registada.
          </p>
        </div>

        {/* Attendance placeholder */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="size-4" />
            <h3 className="text-sm font-semibold">Presenças</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {/* TODO: implement attendance module */}
            Nenhum registo de presença.
          </p>
        </div>
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
      <dd className="font-medium wrap-break-word">{value}</dd>
    </div>
  );
}
