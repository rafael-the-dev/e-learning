import type { ReactNode } from "react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExaminationNav } from "@/modules/examinations/components/examination-nav";

// Examination administration area. Gate the whole area on `exams.view`; each page
// re-checks its own permission via the read service / command (defence in depth).
export default async function ExaminationsLayout({ children }: { children: ReactNode }) {
  await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  return (
    <div className="space-y-6">
      <ExaminationNav />
      {children}
    </div>
  );
}
