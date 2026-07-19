import type { ReactNode } from "react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/shared/components/layout/page-header";
import { GuardianExaminationsNav } from "@/modules/guardian-examinations/components/guardian-examinations-nav";

export const metadata = { title: "Exames" };

// Guardian Examination Portal area (supervision, READ-ONLY). Gate the whole area on
// `guardianPortal.view`; each page re-resolves the authenticated guardian server-side
// (context.userId — NEVER from the URL) and scopes reads to the guardian's ACTIVE links.
export default async function GuardianExaminationsLayout({ children }: { children: ReactNode }) {
  await requirePermissionOrRedirect(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
  return (
    <>
      <PageHeader
        title="Exames"
        description="Acompanhe os exames agendados, resultados e recursos dos seus educandos."
      />
      <div className="space-y-6 p-4 sm:p-8">
        <GuardianExaminationsNav />
        {children}
      </div>
    </>
  );
}
