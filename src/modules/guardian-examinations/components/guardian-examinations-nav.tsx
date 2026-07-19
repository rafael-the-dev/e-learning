"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

// Secondary navigation for the guardian examination portal (supervision, read-only).
// Sprint 1 exposes only "Resumo"; Detalhe (Sprint 2) and Histórico (Sprint 3) are
// intentionally not added yet.
const TABS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/guardian/examinations", label: "Resumo", exact: true },
];

export function GuardianExaminationsNav() {
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
