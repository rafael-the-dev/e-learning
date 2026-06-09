"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, GraduationCap, BookUser, BookOpen, Tags, Library, UsersRound, CalendarDays, ClipboardList, FileText, CreditCard, Receipt, Wallet, Settings, Video, CalendarRange, DoorOpen, CalendarCheck, Activity, CheckSquare, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Utilizadores", icon: Users },
  { href: "/students", label: "Alunos", icon: GraduationCap },
  { href: "/teachers", label: "Professores", icon: BookUser },
  { href: "/courses", label: "Cursos", icon: BookOpen },
  { href: "/courses/categories", label: "Categorias", icon: Tags },
  { href: "/subjects", label: "Disciplinas", icon: Library },
  { href: "/lessons", label: "Lições", icon: Video },
  { href: "/class-groups", label: "Turmas", icon: UsersRound },
  { href: "/schedules", label: "Horários", icon: CalendarDays },
  { href: "/academic-calendar", label: "Calendário Académico", icon: CalendarRange },
  { href: "/classrooms", label: "Salas", icon: DoorOpen },
  { href: "/classroom-bookings", label: "Reservas de Sala", icon: CalendarCheck },
  { href: "/enrollments", label: "Matrículas", icon: ClipboardList },
  { href: "/invoices", label: "Faturas", icon: FileText },
  { href: "/payments", label: "Pagamentos", icon: CreditCard },
  { href: "/receipts", label: "Recibos", icon: Receipt },
  { href: "/student-wallets", label: "Carteiras", icon: Wallet },
  { href: "/settings/billing", label: "Políticas de Faturação", icon: Settings },
  { href: "/attendance", label: "Presenças", icon: CheckSquare },
  { href: "/system/events", label: "Eventos de Sistema", icon: Activity },
];

export function NavLinks() {
  const pathname = usePathname();
  const items = NAV;

  const activeHref = items
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            activeHref === href
              ? "bg-accent text-foreground font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
      ))}
    </>
  );
}
