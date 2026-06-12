import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getSubjectsByOrganization } from "@/modules/courses/services/course.service";
import { SubjectsTable } from "@/modules/courses/components/subjects-table";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Disciplinas" };
}

export default async function SubjectsPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.SUBJECTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canManage = ability.can(PERMISSIONS.SUBJECTS_CREATE);

  const subjects = await getSubjectsByOrganization(context.organizationId);

  return (
    <>
      <PageHeader
        title="Disciplinas"
        description="Gerir as disciplinas globais da organização."
      />
      <div className="p-6">
        <SubjectsTable subjects={subjects} canManage={canManage} />
      </div>
    </>
  );
}
