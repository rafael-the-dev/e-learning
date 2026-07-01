import * as React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { Toaster } from "@/shared/components/ui/toaster";
import { Building2, Users, LogOut } from "lucide-react";

const NAV = [
  { href: "/organizations", label: "Organizações", icon: Building2 },
  { href: "/users", label: "Utilizadores", icon: Users },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r flex flex-col">
        {/* Brand */}
        <div className="h-14 flex items-center px-5 border-b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/lectario-logo-horizontal-black-trim.png"
            alt="Lectário — Gestão Escolar"
            className="h-6 w-auto dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/lectario-logo-horizontal-white-trim.png"
            alt="Lectário — Gestão Escolar"
            className="hidden h-6 w-auto dark:block"
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="border-t px-3 py-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md">
            <div className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold uppercase">
              {session.user.name?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </div>
            <Link
              href="/api/auth/signout"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Terminar sessão"
            >
              <LogOut className="size-4" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>

      <Toaster />
    </div>
  );
}
