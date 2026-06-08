"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

const TABS = [
  { href: "/settings/billing/policies", label: "Políticas" },
  { href: "/settings/billing/fees", label: "Taxas" },
  { href: "/settings/billing/discounts", label: "Descontos" },
  { href: "/settings/billing/taxes", label: "Impostos" },
];

export function BillingTabs() {
  const pathname = usePathname();

  return (
    <nav className="border-b px-8 bg-background">
      <div className="flex gap-1">
        {TABS.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-4 py-3 text-sm border-b-2 transition-colors",
                isActive
                  ? "text-foreground border-foreground font-medium"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
