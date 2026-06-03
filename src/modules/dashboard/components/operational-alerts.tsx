import { EmptyState } from "@/shared/components/layout/empty-state";
import { CheckCircle, AlertTriangle, Users, BookOpen, GraduationCap, Car } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { OperationalAlerts as OperationalAlertsData } from "@/modules/dashboard/types";

interface AlertItem {
  count: number;
  label: (count: number) => string;
  icon: React.ReactNode;
  severity: "warning" | "error";
}

interface OperationalAlertsProps {
  data: OperationalAlertsData;
}

export function OperationalAlerts({ data }: OperationalAlertsProps) {
  const alerts: AlertItem[] = [
    {
      count: data.overdueInvoicesCount,
      label: (n) => `${n} ${n === 1 ? "fatura em atraso" : "faturas em atraso"}`,
      icon: <AlertTriangle className="size-4" />,
      severity: "error",
    },
    {
      count: data.studentsWithoutEnrollmentCount,
      label: (n) => `${n} ${n === 1 ? "aluno ativo sem matrícula" : "alunos ativos sem matrícula"}`,
      icon: <Users className="size-4" />,
      severity: "warning",
    },
    {
      count: data.classesWithoutTeacherCount,
      label: (n) => `${n} ${n === 1 ? "turma sem professor atribuído" : "turmas sem professor atribuído"}`,
      icon: <GraduationCap className="size-4" />,
      severity: "warning",
    },
    {
      count: data.practicalLessonsWithoutVehicleCount,
      label: (n) => `${n} ${n === 1 ? "aula prática sem veículo" : "aulas práticas sem veículo"}`,
      icon: <Car className="size-4" />,
      severity: "warning",
    },
  ];

  const active = alerts.filter((a) => a.count > 0);

  return (
    <div className="rounded-xl border bg-card">
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">Alertas Operacionais</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Itens que requerem atenção</p>
      </div>
      {active.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="size-8 text-emerald-600" />}
          title="Sem alertas operacionais"
          description="Tudo parece estar em ordem."
          className="border-0 rounded-none"
        />
      ) : (
        <ul className="divide-y">
          {active.map((alert, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center gap-3 px-6 py-3.5",
                alert.severity === "error" ? "text-red-700" : "text-amber-700"
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  alert.severity === "error" ? "text-red-500" : "text-amber-500"
                )}
              >
                {alert.icon}
              </span>
              <span className="text-sm">{alert.label(alert.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
