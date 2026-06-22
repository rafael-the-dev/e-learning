import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ImportWizard } from "@/modules/teachers/import/components/import-wizard";

export const metadata = { title: "Importar Professores" };

export default async function TeachersImportPage() {
  try {
    await requirePermission(PERMISSIONS.TEACHERS_IMPORT);
  } catch {
    redirect("/forbidden");
  }

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
