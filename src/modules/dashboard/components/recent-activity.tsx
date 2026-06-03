import { EmptyState } from "@/shared/components/layout/empty-state";
import { Activity } from "lucide-react";
import type { RecentActivityItem } from "@/modules/dashboard/types";

const ENTITY_LABELS: Record<string, string> = {
  Student: "Aluno",
  Enrollment: "Matrícula",
  Payment: "Pagamento",
  ClassGroup: "Turma",
  Teacher: "Professor",
  Organization: "Organização",
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: "criado(a)",
  UPDATED: "atualizado(a)",
  DELETED: "eliminado(a)",
  STATUS_CHANGED: "estado alterado",
  CANCELLED: "cancelado(a)",
  APPROVED: "aprovado(a)",
  SUSPENDED: "suspenso(a)",
};

function formatDate(date: Date) {
  return new Date(date).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RecentActivityProps {
  items: RecentActivityItem[];
}

export function RecentActivity({ items }: RecentActivityProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">Atividade Recente</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Últimas ações registadas na organização</p>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title="Sem atividade recente"
          description="As ações realizadas na plataforma aparecerão aqui."
          className="border-0 rounded-none"
        />
      ) : (
        <ul className="divide-y">
          {items.map((item) => {
            const entity = ENTITY_LABELS[item.entity] ?? item.entity;
            const action = ACTION_LABELS[item.action] ?? item.action.toLowerCase();
            return (
              <li key={item.id} className="flex items-start gap-3 px-6 py-3">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-primary/60 mt-2" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{entity}</span>{" "}
                    <span className="text-muted-foreground">{action}</span>
                    {item.actorName && (
                      <span className="text-muted-foreground"> por {item.actorName}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(item.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
