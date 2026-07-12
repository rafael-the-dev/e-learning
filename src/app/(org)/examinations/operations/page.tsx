import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { examinationOperationsReadService } from "@/modules/examinations/services/admin/examination-operations-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { OperationsView } from "@/modules/examinations/components/operations-view";

export const metadata = { title: "Exames — Operações" };

export default async function ExamOperationsPage() {
  // Operations is a distinct, higher-privilege surface (detection only — no mutations here).
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_OPERATIONS_VIEW);
  const [conflicts, health] = await Promise.all([
    examinationOperationsReadService.getConflicts(context),
    examinationOperationsReadService.getIntegrationHealth(context),
  ]);

  return (
    <div className="space-y-4">
      <ExaminationPageHeader
        title="Operações de Exame"
        description="Deteção de conflitos e saúde da integração. Apenas leitura."
      />
      <OperationsView conflicts={conflicts} health={health} />
    </div>
  );
}
