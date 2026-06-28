import Link from "next/link";
import {
  ClipboardList,
  GraduationCap,
  CreditCard,
  FileText,
  ClipboardCheck,
  Wallet,
  Bell,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { SecretaryQuickAction } from "@/modules/secretary-portal/types";

// String → component map (iconName stays serializable in the data layer).
const ICONS: Record<string, LucideIcon> = {
  ClipboardList,
  GraduationCap,
  CreditCard,
  FileText,
  ClipboardCheck,
  Wallet,
  Bell,
  Upload,
};

interface Props {
  actions: SecretaryQuickAction[];
}

export function SecretaryQuickActions({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {actions.map((action) => {
        const Icon = ICONS[action.iconName] ?? ClipboardList;
        return (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/60 hover:border-primary/40"
            )}
          >
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="text-xs font-medium">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
