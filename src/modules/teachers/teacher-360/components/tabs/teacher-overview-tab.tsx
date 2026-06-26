import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Building2,
  BookOpen,
  Users,
  Clock,
  ClipboardList,
  Activity,
  TrendingUp,
  History,
} from "lucide-react";
import { GENDER_LABELS, ID_TYPE_LABELS } from "@/modules/teachers/types";
import type { Teacher360Core } from "@/modules/teachers/teacher-360/services/teacher-360.service";

function DetailRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium wrap-break-word">{value}</dd>
    </div>
  );
}

export function TeacherOverviewTab({ core }: { core: Teacher360Core }) {
  const { teacher } = core;
  const passRate =
    core.qualityRaw.passedCount + core.qualityRaw.failedCount > 0
      ? Math.round((core.qualityRaw.passedCount / (core.qualityRaw.passedCount + core.qualityRaw.failedCount)) * 100)
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <DetailRow icon={<Phone className="size-3.5" />} label="Telefone" value={teacher.phone ?? "—"} />
            <DetailRow icon={<Mail className="size-3.5" />} label="E-mail" value={teacher.email ?? "—"} />
            <DetailRow icon={<MapPin className="size-3.5" />} label="Morada" value={teacher.address ?? "—"} />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Data de Nasc."
              value={teacher.dateOfBirth ? new Date(teacher.dateOfBirth).toLocaleDateString("pt-PT") : "—"}
            />
            <DetailRow label="Género" value={teacher.gender ? GENDER_LABELS[teacher.gender] ?? teacher.gender : "—"} />
            <DetailRow
              icon={<CreditCard className="size-3.5" />}
              label="Documento"
              value={
                teacher.idNumber
                  ? `${teacher.idType ? (ID_TYPE_LABELS[teacher.idType] ?? teacher.idType) + " · " : ""}${teacher.idNumber}`
                  : "—"
              }
            />
            <DetailRow
              icon={<Building2 className="size-3.5" />}
              label="Filial"
              value={teacher.branch?.name ?? "—"}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Resumo Académico</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<BookOpen className="size-3.5" />}
              label="Disciplinas"
              value={String(core.counts.subjectCount)}
            />
            <DetailRow
              icon={<Users className="size-3.5" />}
              label="Turmas Ativas"
              value={String(core.counts.activeClassGroupCount)}
            />
            <DetailRow
              icon={<Users className="size-3.5" />}
              label="Total de Alunos"
              value={String(core.workload.distinctActiveStudentCount)}
            />
            <DetailRow
              icon={<Clock className="size-3.5" />}
              label="Horas Semanais"
              value={`${core.workload.weeklyHours}h`}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Estado Operacional</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<ClipboardList className="size-3.5" />}
              label="Av. Pendentes"
              value={String(core.assessmentMetrics.openCount)}
            />
            <DetailRow
              icon={<Activity className="size-3.5" />}
              label="Presença Média"
              value={core.qualityRaw.avgAttendance != null ? `${core.qualityRaw.avgAttendance.toFixed(1)}%` : "—"}
            />
            <DetailRow
              icon={<TrendingUp className="size-3.5" />}
              label="Taxa Aprovação"
              value={passRate != null ? `${passRate}%` : "—"}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="size-4" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {core.recentTimeline.length === 0 ? (
            <EmptyState icon={<History className="size-8" />} title="Sem atividade recente" />
          ) : (
            <ul className="space-y-3">
              {core.recentTimeline.map((event) => (
                <li key={event.id} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.occurredAt).toLocaleDateString("pt-PT")}
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
