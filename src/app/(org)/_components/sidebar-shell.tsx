"use client";

import Link from "next/link";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useSidebar } from "./sidebar-context";

interface Props {
  orgName: string;
  userName: string | null;
  userEmail: string | null;
  children: React.ReactNode;
}

export function SidebarShell({ orgName, userName, userEmail, children }: Props) {
  const { collapsed, toggle } = useSidebar();
  const userInitial = userName?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <aside
      className={cn(
        "shrink-0 border-r flex flex-col overflow-hidden",
        "transition-[width] duration-300 ease-in-out",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Brand */}
      <div className="h-14 flex items-center px-3.5 border-b shrink-0">
        {collapsed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/images/lectario-mark.svg"
            alt="Lectário"
            title={orgName ?? "Lectário"}
            className="size-7 rounded-lg shrink-0"
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/lectario-logo-horizontal-black-trim.png"
              alt="Lectário — Gestão Escolar"
              title={orgName ?? "Lectário"}
              className="h-6 w-auto dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/lectario-logo-horizontal-white-trim.png"
              alt="Lectário — Gestão Escolar"
              title={orgName ?? "Lectário"}
              className="hidden h-6 w-auto dark:block"
            />
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        <div className="px-2">
          {children}
        </div>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t px-2 py-2 shrink-0">
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {collapsed
            ? <PanelLeftOpen className="size-4 shrink-0" />
            : <PanelLeftClose className="size-4 shrink-0" />
          }
          <span
            className={cn(
              "whitespace-nowrap overflow-hidden transition-opacity duration-200",
              collapsed ? "opacity-0 w-0" : "opacity-100"
            )}
          >
            Recolher
          </span>
        </button>
      </div>

      {/* User */}
      <div className="border-t px-2 py-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md">
          <div
            className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold uppercase shrink-0"
            title={collapsed ? (userName ?? undefined) : undefined}
          >
            {userInitial}
          </div>
          <div
            className={cn(
              "flex-1 min-w-0 overflow-hidden transition-opacity duration-200",
              collapsed ? "opacity-0 w-0 pointer-events-none" : "opacity-100"
            )}
          >
            <p className="text-xs font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
          <Link
            href="/api/auth/signout"
            className={cn(
              "shrink-0 text-muted-foreground hover:text-foreground transition-[opacity,color] duration-200",
              collapsed ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100"
            )}
            title="Terminar sessão"
          >
            <LogOut className="size-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
