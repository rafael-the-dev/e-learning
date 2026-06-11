import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import { AssessmentPolicyDetailClient } from "@/modules/assessments/components/assessment-policy-detail-client";
import { PolicyComponentsTable } from "@/modules/assessments/components/policy-components-table";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Política de Avaliação` };
}

export default async function AssessmentPolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENT_POLICIES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;

  const [policy, components, perms] = await Promise.all([
    findAssessmentPolicyById(id, context.organizationId),
    findComponentsByPolicy(id, context.organizationId),
    getUserPermissions(context.userId, context.organizationId),
  ]);

  if (!policy) notFound();

  const ability = createAbility(perms);
  const canEdit = ability.can(PERMISSIONS.ASSESSMENT_POLICIES_UPDATE);
  const canManage = ability.can(PERMISSIONS.ASSESSMENT_COMPONENTS_MANAGE);

  return (
    <>
      <PageHeader
        title={policy.name}
        description={
          [policy.subjectName, policy.courseLevelName].filter(Boolean).join(" · ") ||
          "Política de avaliação"
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/assessment-policies">
              <ArrowLeft className="size-4 mr-2" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        <AssessmentPolicyDetailClient policy={policy} canEdit={canEdit} />

        <PolicyComponentsTable
          components={components}
          policyId={id}
          canManage={canManage}
        />
      </div>
    </>
  );
}
