import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ImportWizard } from "@/modules/students/import/components/import-wizard";

export const metadata = { title: "Importar Alunos" };

export default async function StudentsImportPage() {
  await requirePermissionOrRedirect(PERMISSIONS.STUDENTS_IMPORT);

  return (
    <>
      <PageHeader
        title="Importar Alunos"
        description="Importe alunos em massa a partir de um ficheiro CSV ou XLSX, com validação e pré-visualização antes da importação."
      />
      <div className="p-4 sm:p-8">
        <ImportWizard />
      </div>
    </>
  );
}
