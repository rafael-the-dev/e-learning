import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getSubjectsByOrganization } from "@/modules/courses/services/course.service";
import { SubjectsTable } from "@/modules/courses/components/subjects-table";

export async function generateMetadata() {
  return { title: "Disciplinas" };
}

export default async function SubjectsPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.SUBJECTS_VIEW);

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
