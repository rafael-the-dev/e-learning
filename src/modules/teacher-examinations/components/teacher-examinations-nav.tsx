"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

// Secondary navigation for the teacher examination portal. Mirrors the student
// `student-examinations-nav.tsx` style. Kept minimal: the "Próximos / Em execução
// / Por submeter / Concluídos" views are FILTERS over the Sessões list, not tabs.
const TABS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/teacher/examinations", label: "Resumo", exact: true },
  { href: "/teacher/examinations/sessions", label: "Sessões" },
];

export function TeacherExaminationsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
