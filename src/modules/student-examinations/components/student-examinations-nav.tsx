"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

// Secondary navigation for the student examination portal. Mirrors the admin
// `examination-nav.tsx` style. Appeals + History are Phase 2 — not listed yet.
const TABS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/student/examinations", label: "Resumo", exact: true },
  { href: "/student/examinations/upcoming", label: "Próximos" },
  { href: "/student/examinations/results", label: "Resultados" },
];

export function StudentExaminationsNav() {
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
