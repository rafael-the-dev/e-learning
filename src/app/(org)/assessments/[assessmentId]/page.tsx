import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { findAllResultsByAssessment } from "@/modules/assessments/repositories/assessment-result.repository";
import { AssessmentDetail } from "@/modules/assessments/components/assessment-detail";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Detalhes da Avaliação" };

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { assessmentId } = await params;

  const [assessment, results] = await Promise.all([
    findAssessmentById(assessmentId, context.organizationId),
    findAllResultsByAssessment(assessmentId, context.organizationId),
  ]);

  if (!assessment) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canEdit = ability.can(PERMISSIONS.ASSESSMENTS_UPDATE);
  const canCancel = ability.can(PERMISSIONS.ASSESSMENTS_CANCEL);
  const canPublish = ability.can(PERMISSIONS.ASSESSMENT_PUBLICATIONS_PUBLISH);

  return (
    <>
      <PageHeader
        title={assessment.title}
        description={assessment.assessmentPolicyName ? `Política: ${assessment.assessmentPolicyName}` : undefined}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/assessments">
              <ChevronLeft className="size-4 mr-1" />
              Avaliações
            </Link>
          </Button>
        }
      />
      <div className="p-8">
        <AssessmentDetail
          assessment={assessment}
          results={results}
          canEdit={canEdit}
          canCancel={canCancel}
          canPublish={canPublish}
        />
      </div>
    </>
  );
}
