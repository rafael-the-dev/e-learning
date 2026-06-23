import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { RegisterPaymentForm } from "@/modules/finance/components/register-payment-form";
import { getOpenInvoicesForPaymentForm } from "@/modules/finance/services/invoice.service";

export const metadata = { title: "Registar Pagamento" };

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ invoiceId?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.PAYMENTS_CREATE);

  const { invoiceId } = await searchParams;
  const rawInvoices = await getOpenInvoicesForPaymentForm(context.organizationId);

  const invoices = rawInvoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    studentName: inv.studentName,
    balanceAmount: inv.balanceAmount,
    studentId: inv.studentId,
  }));

  return (
    <>
      <PageHeader
        title="Registar Pagamento"
        description="Registar um novo pagamento para uma fatura."
      />
      <div className="p-8">
        <RegisterPaymentForm invoices={invoices} defaultInvoiceId={invoiceId} />
      </div>
    </>
  );
}
