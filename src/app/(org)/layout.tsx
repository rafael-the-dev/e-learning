import * as React from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgSession } from "@/server/auth/session";
import { Toaster } from "@/shared/components/ui/toaster";
import { LayoutDashboard, Users, GraduationCap, LogOut } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Utilizadores", icon: Users },
  { href: "/students", label: "Alunos", icon: GraduationCap },
];

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof getOrgSession>>;

  try {
    session = await getOrgSession();
  } catch {
    redirect("/login");
  }

  const { user, org } = session;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r flex flex-col">
        {/* Brand / org name */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b">
          <div className="size-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <LayoutDashboard className="size-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm tracking-tight truncate">{org.name}</span>
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
            <div className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold uppercase shrink-0">
              {user.name?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
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
