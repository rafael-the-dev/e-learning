import Link from "next/link";
import { CheckSquare, CalendarDays, ClipboardCheck, UsersRound, Bell, BookUser } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export interface TeacherQuickAction {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
}

/**
 * /attendance/sessions, /assessments and /class-groups are org-wide, unfiltered
 * admin pages (no teacherId scoping) — never link a plain TEACHER there.
 * They anchor to the equivalent already-teacher-scoped section on this same
 * page instead. ORG_ADMIN/SUPER_ADMIN previewing the portal (canViewOrgWide)
 * get the real org-wide links, since they're allowed to see that data anyway.
 */
export function buildTeacherQuickActions(teacherId: string, canViewOrgWide: boolean): TeacherQuickAction[] {
  return [
    {
      key: "attendance",
      href: canViewOrgWide ? "/attendance/sessions" : "#today-schedule",
      label: "Lançar Presença",
      icon: <CheckSquare className="size-5" />,
    },
    { key: "schedule", href: "/schedules", label: "Ver Horário", icon: <CalendarDays className="size-5" /> },
    {
      key: "grading",
      href: canViewOrgWide ? "/assessments" : "#pending-work",
      label: "Corrigir Avaliações",
      icon: <ClipboardCheck className="size-5" />,
    },
    {
      key: "classes",
      href: canViewOrgWide ? "/class-groups" : "#my-classes",
      label: "Ver Turmas",
      icon: <UsersRound className="size-5" />,
    },
    { key: "notifications", href: "/notifications", label: "Ver Notificações", icon: <Bell className="size-5" /> },
    { key: "teacher360", href: `/teachers/${teacherId}`, label: "Abrir Teacher 360", icon: <BookUser className="size-5" /> },
  ];
}

interface Props {
  teacherId: string;
  canViewOrgWide: boolean;
}

export function TeacherQuickActions({ teacherId, canViewOrgWide }: Props) {
  const actions = buildTeacherQuickActions(teacherId, canViewOrgWide);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {actions.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/60 hover:border-primary/40"
          )}
        >
          <span className="rounded-lg bg-primary/10 p-2 text-primary">{action.icon}</span>
          <span className="text-xs font-medium">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
