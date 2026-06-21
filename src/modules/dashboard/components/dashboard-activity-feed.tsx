import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  Activity, ClipboardList, CreditCard, FileText, RefreshCcw, Award, ThumbsDown, ArrowUpCircle,
} from "lucide-react";
import type { ActivityFeedEventType, ActivityFeedItem } from "@/modules/dashboard/types";

const EVENT_ICONS: Record<ActivityFeedEventType, React.ReactNode> = {
  ENROLLMENT_CREATED: <ClipboardList className="size-4" />,
  PAYMENT_CONFIRMED: <CreditCard className="size-4" />,
  INVOICE_CREATED: <FileText className="size-4" />,
  INVOICE_PAID: <FileText className="size-4" />,
  REFUND_COMPLETED: <RefreshCcw className="size-4" />,
  ASSESSMENT_RESULTS_PUBLISHED: <Award className="size-4" />,
  SUBJECT_PASSED: <Award className="size-4" />,
  SUBJECT_FAILED: <ThumbsDown className="size-4" />,
  LEVEL_PROMOTED: <ArrowUpCircle className="size-4" />,
};

const EVENT_COLORS: Record<ActivityFeedEventType, string> = {
  ENROLLMENT_CREATED: "text-blue-600 bg-blue-50",
  PAYMENT_CONFIRMED: "text-emerald-600 bg-emerald-50",
  INVOICE_CREATED: "text-slate-600 bg-slate-100",
  INVOICE_PAID: "text-emerald-600 bg-emerald-50",
  REFUND_COMPLETED: "text-amber-600 bg-amber-50",
  ASSESSMENT_RESULTS_PUBLISHED: "text-indigo-600 bg-indigo-50",
  SUBJECT_PASSED: "text-emerald-600 bg-emerald-50",
  SUBJECT_FAILED: "text-red-600 bg-red-50",
  LEVEL_PROMOTED: "text-violet-600 bg-violet-50",
};

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia(s)`;
  return new Date(date).toLocaleDateString("pt-PT");
}

interface Props {
  items: ActivityFeedItem[];
}

export function DashboardActivityFeed({ items }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="size-8" />}
        title="Sem atividade recente"
        description="As ações realizadas na organização aparecerão aqui."
        className="border-0"
      />
    );
  }

  return (
    <ul className="divide-y max-h-[480px] overflow-y-auto">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-1 py-2.5">
          <span className={`rounded-md p-1.5 shrink-0 ${EVENT_COLORS[item.eventType]}`}>
            {EVENT_ICONS[item.eventType]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              {item.title}
              {item.studentName && <span className="text-muted-foreground"> — {item.studentName}</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatRelativeTime(item.occurredAt)}
              {item.actorName && ` · por ${item.actorName}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
