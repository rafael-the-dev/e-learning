import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ImportWizard } from "@/modules/students/import/components/import-wizard";

export const metadata = { title: "Importar Alunos" };

export default async function StudentsImportPage() {
  try {
    await requirePermission(PERMISSIONS.STUDENTS_IMPORT);
  } catch {
    redirect("/forbidden");
  }

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
