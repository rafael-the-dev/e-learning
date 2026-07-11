"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

// Secondary navigation for the examination administration area.
const TABS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/examinations", label: "Dashboard", exact: true },
  { href: "/examinations/periods", label: "Períodos" },
  { href: "/examinations/rooms", label: "Salas" },
  { href: "/examinations/sessions", label: "Sessões" },
  { href: "/examinations/appeals", label: "Recursos" },
  { href: "/examinations/operations", label: "Operações" },
];

export function ExaminationNav() {
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
