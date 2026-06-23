import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ImportWizard } from "@/modules/teachers/import/components/import-wizard";

export const metadata = { title: "Importar Professores" };

export default async function TeachersImportPage() {
  await requirePermissionOrRedirect(PERMISSIONS.TEACHERS_IMPORT);

  return (
    <>
      <PageHeader
        title="Importar Professores"
        description="Importe professores em massa a partir de um ficheiro CSV ou XLSX, com validação e pré-visualização antes da importação."
      />
      <div className="p-4 sm:p-8">
        <ImportWizard />
      </div>
    </>
  );
}
