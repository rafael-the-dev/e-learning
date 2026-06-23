import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentsByOrganization } from "@/modules/students/services/student.service";
import { CreateInvoiceForm } from "@/modules/finance/components/create-invoice-form";

export const metadata = { title: "Nova Fatura" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.INVOICES_CREATE);

  const { studentId } = await searchParams;

  const result = await getStudentsByOrganization(context.organizationId, {
    page: 1,
    pageSize: 500,
  });

  const students = result.data.map((s) => ({ id: s.id, fullName: s.fullName }));

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/invoices" className="hover:text-foreground transition-colors">
        Faturas
      </Link>
      <span>/</span>
      <span className="text-foreground">Nova Fatura</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Nova Fatura"
        description="Criar uma nova fatura para um aluno."
        breadcrumb={breadcrumb}
      />
      <div className="p-8">
        <CreateInvoiceForm students={students} defaultStudentId={studentId} />
      </div>
    </>
  );
}
