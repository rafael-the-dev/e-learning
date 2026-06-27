import Link from "next/link";
import {
  CalendarDays,
  PenLine,
  CalendarCheck,
  Wallet,
  FileText,
  Bell,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

// Every target is either an in-page anchor on /student (fully self-scoped) or a
// route that scopes itself to the current user (/notifications by
// recipientUserId). Deliberately NO links to org-wide pages — a student must
// never be routed somewhere their own guard would redirect away from.
const ACTIONS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "#aulas", label: "Ver Horário", icon: <CalendarDays className="size-4" /> },
  { href: "#notas", label: "Ver Notas", icon: <PenLine className="size-4" /> },
  { href: "#frequencia", label: "Ver Frequência", icon: <CalendarCheck className="size-4" /> },
  { href: "#pagamentos", label: "Ver Pagamentos", icon: <Wallet className="size-4" /> },
  { href: "#documentos", label: "Ver Documentos", icon: <FileText className="size-4" /> },
  { href: "/notifications", label: "Ver Notificações", icon: <Bell className="size-4" /> },
  { href: "#resumo", label: "Abrir Perfil", icon: <UserRound className="size-4" /> },
];

export function StudentQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center text-xs font-medium transition-colors hover:bg-muted/60"
        >
          <span className="text-muted-foreground">{action.icon}</span>
          {action.label}
        </Link>
      ))}
    </div>
  );
}
