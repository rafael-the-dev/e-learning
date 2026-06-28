import Link from "next/link";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { CalendarClock, FileText, GraduationCap, ClipboardCheck, CalendarDays, PlayCircle } from "lucide-react";
import type { SecretaryDeadline, SecretaryDeadlineType } from "@/modules/secretary-portal/types";

const TYPE_ICONS: Record<SecretaryDeadlineType, React.ReactNode> = {
  INVOICE_DUE: <FileText className="size-4 text-orange-600" />,
  CLASS_GROUP_START: <PlayCircle className="size-4 text-emerald-600" />,
  CLASS_GROUP_END: <GraduationCap className="size-4 text-blue-600" />,
  ASSESSMENT: <ClipboardCheck className="size-4 text-indigo-600" />,
  ACADEMIC_EVENT: <CalendarDays className="size-4 text-violet-600" />,
};

interface Props {
  deadlines: SecretaryDeadline[];
}

export function SecretaryUpcomingDeadlines({ deadlines }: Props) {
  if (deadlines.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-8" />}
        title="Sem prazos próximos"
        description="Não há prazos nos próximos 14 dias."
        className="border-0"
      />
    );
  }

  return (
    <ul className="divide-y">
      {deadlines.map((item) => (
        <li key={item.id}>
          <Link href={item.link} className="flex items-center gap-3 px-1 py-2.5 hover:bg-muted/40 rounded-md -mx-1">
            <span className="shrink-0">{TYPE_ICONS[item.type]}</span>
            <span className="flex-1 min-w-0 text-sm truncate">{item.title}</span>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {new Date(item.date).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
