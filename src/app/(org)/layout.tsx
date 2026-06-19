import * as React from "react";
import { redirect } from "next/navigation";
import { getOrgSession } from "@/server/auth/session";
import { Toaster } from "@/shared/components/ui/toaster";
import { NavLinks } from "./_components/nav-links";
import { QueryProvider } from "./_components/query-provider";
import { SidebarProvider } from "./_components/sidebar-context";
import { SidebarShell } from "./_components/sidebar-shell";

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof getOrgSession>>;

  try {
    session = await getOrgSession();
  } catch {
    redirect("/login");
  }

  const { user, org } = session;

  return (
    <QueryProvider>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <SidebarShell
            orgName={org.name}
            userName={user.name ?? null}
            userEmail={user.email ?? null}
          >
            <NavLinks />
          </SidebarShell>

          {/* Main */}
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto">{children}</div>
          </main>
        </div>

        <Toaster />
      </SidebarProvider>
    </QueryProvider>
  );
}
