"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  ClipboardList,
  UsersRound,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  BarChart3,
  BookUser,
  CreditCard,
  FileText,
  Receipt,
  Wallet,
  BookOpen,
  Library,
  Video,
  DoorOpen,
  CalendarCheck,
  CalendarRange,
  Tags,
  Settings,
  SlidersHorizontal,
  Calendar,
  Users,
  Activity,
  PenLine,
  TrendingUp,
  Upload,
  History,
  Bell,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useSidebar } from "./sidebar-context";
import type { NavIconName, NavigationGroup } from "./nav-config";

const ICONS: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  GraduationCap,
  ClipboardList,
  UsersRound,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  BarChart3,
  BookUser,
  CreditCard,
  FileText,
  Receipt,
  Wallet,
  BookOpen,
  Library,
  Video,
  DoorOpen,
  CalendarCheck,
  CalendarRange,
  Tags,
  Settings,
  SlidersHorizontal,
  Calendar,
  Users,
  Activity,
  PenLine,
  TrendingUp,
  Upload,
  History,
  Bell,
};

const STORAGE_KEY = "elearning-nav-collapsed";

interface Props {
  groups: NavigationGroup[];
}

export function NavLinksClient({ groups }: Props) {
  const pathname = usePathname();
  const { collapsed: sidebarCollapsed } = useSidebar();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const loadedRef = useRef(false);

  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const activeGroupId = groups.find((g) =>
    g.items.some((item) => activeHref === item.href)
  )?.id;

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored: string[] = raw ? JSON.parse(raw) : [];
      setCollapsed(new Set(stored.filter((id) => id !== activeGroupId)));
    } catch {}
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeGroupId) return;
    setCollapsed((prev) => {
      if (!prev.has(activeGroupId)) return prev;
      const next = new Set(prev);
      next.delete(activeGroupId);
      return next;
    });
  }, [activeGroupId]);

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const isCollapsible = Boolean(group.label);
        // When sidebar is collapsed, ignore group collapse state — show all items
        const isGroupCollapsed = !sidebarCollapsed && isCollapsible && collapsed.has(group.id);

        return (
          <div key={group.id}>
            {/* Section header — hidden smoothly when sidebar is collapsed */}
            {isCollapsible && (
              <div
                className={cn(
                  "overflow-hidden transition-[max-height,opacity] duration-200",
                  sidebarCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-10 opacity-100"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="group/header flex w-full items-center justify-between px-3 mb-1 py-0.5"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 group-hover/header:text-muted-foreground/75 transition-colors select-none">
                    {group.label}
                  </span>
                  <ChevronRight
                    className={cn(
                      "size-3 text-muted-foreground/35 group-hover/header:text-muted-foreground/60 transition-all duration-200 shrink-0",
                      !isGroupCollapsed && "rotate-90"
                    )}
                  />
                </button>
              </div>
            )}

            {/* Items */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: isGroupCollapsed ? "0fr" : "1fr",
                transition: "grid-template-rows 200ms ease",
              }}
            >
              <div className="overflow-hidden">
                <div className="space-y-0.5">
                  {group.items.map(({ href, label, iconName }) => {
                    const Icon = ICONS[iconName];
                    const isActive = activeHref === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        title={sidebarCollapsed ? label : undefined}
                        className={cn(
                          "flex items-center rounded-md py-2 text-sm transition-colors",
                          sidebarCollapsed ? "justify-center px-0 gap-0" : "gap-3 px-3",
                          isActive
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span
                          className={cn(
                            "whitespace-nowrap overflow-hidden transition-opacity duration-200",
                            sidebarCollapsed ? "opacity-0 w-0" : "opacity-100"
                          )}
                        >
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
