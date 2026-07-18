import type { ReactNode } from "react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/shared/components/layout/page-header";
import { TeacherExaminationsNav } from "@/modules/teacher-examinations/components/teacher-examinations-nav";

export const metadata = { title: "Exames" };

// Teacher Examination Portal area. Gate the whole area on `teacherPortal.view`;
// each page re-resolves the authenticated teacher server-side (never from the URL)
// and scopes its reads to that teacherId. Sprint 1 = READS ONLY.
export default async function TeacherExaminationsLayout({ children }: { children: ReactNode }) {
  await requirePermissionOrRedirect(PERMISSIONS.TEACHER_PORTAL_VIEW);
  return (
    <>
      <PageHeader
        title="Exames"
        description="As sessões de exame que te foram atribuídas, o teu papel e o estado do trabalho."
      />
      <div className="space-y-6 p-4 sm:p-8">
        <TeacherExaminationsNav />
        {children}
      </div>
    </>
  );
}
