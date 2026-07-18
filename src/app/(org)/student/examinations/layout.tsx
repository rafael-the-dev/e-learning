import type { ReactNode } from "react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StudentExaminationsNav } from "@/modules/student-examinations/components/student-examinations-nav";

export const metadata = { title: "Exames" };

// Student Examination Portal area. Gate the whole area on `studentPortal.view`;
// each page re-resolves the authenticated student server-side (never from the URL)
// and scopes its reads to that studentId.
export default async function StudentExaminationsLayout({ children }: { children: ReactNode }) {
  await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  return (
    <>
      <PageHeader
        title="Exames"
        description="Os teus exames agendados, resultados e informações de exame."
      />
      <div className="space-y-6 p-4 sm:p-8">
        <StudentExaminationsNav />
        {children}
      </div>
    </>
  );
}
