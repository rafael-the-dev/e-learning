import { redirect, notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getInvoiceById } from "@/modules/finance/services/invoice.service";
import { getPaymentPlanByInvoice } from "@/modules/finance/services/payment-plan.service";
import { INVOICE_STATUS_LABELS, PAYMENT_PLAN_STATUS_LABELS, INSTALLMENT_STATUS_LABELS } from "@/modules/finance/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Detalhes da Fatura" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.INVOICES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { invoiceId } = await params;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCancel = ability.can(PERMISSIONS.INVOICES_CANCEL);
  const canCreatePlan = ability.can(PERMISSIONS.PAYMENT_PLANS_CREATE);

  const [invoice, plan] = await Promise.all([
    getInvoiceById(invoiceId, context.organizationId).catch(() => null),
    getPaymentPlanByInvoice(invoiceId, context.organizationId),
  ]);

  if (!invoice) notFound();

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PENDING: "secondary",
    PARTIALLY_PAID: "outline",
    PAID: "default",
    OVERDUE: "destructive",
    CANCELLED: "destructive",
  };

  return (
    <>
      <PageHeader
        title={`Fatura ${invoice.invoiceNumber}`}
        description={invoice.studentName ?? ""}
        actions={
          <div className="flex gap-2">
            {canCreatePlan && !plan && invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
              <Button variant="outline" size="sm" asChild>
                <a href={`/invoices/${invoice.id}/payment-plan`}>Criar Plano</a>
              </Button>
            )}
            {canCancel && invoice.status !== "CANCELLED" && invoice.paidAmount === 0 && (
              <Button variant="destructive" size="sm" asChild>
                <a href={`/invoices/${invoice.id}?action=cancel`}>Cancelar</a>
              </Button>
            )}
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {/* Header info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Estado</p>
            <Badge variant={statusVariant[invoice.status] ?? "secondary"} className="mt-1">
              {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data de Emissão</p>
            <p className="font-medium">{invoice.issueDate.toLocaleDateString("pt-PT")}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Vencimento</p>
            <p className="font-medium">{invoice.dueDate?.toLocaleDateString("pt-PT") ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Matrícula</p>
            <p className="font-medium">{invoice.enrollmentNumber ?? "—"}</p>
          </div>
        </div>

        {/* Items */}
        <div>
          <h3 className="font-semibold mb-3">Itens</h3>
          <div className="rounded-md border divide-y">
            {invoice.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center px-4 py-3">
                <div>
                  <p className="font-medium">{item.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quantity.toLocaleString("pt-PT")} × {item.unitPrice.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <p className="font-medium">
                  {item.totalPrice.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{invoice.subtotal.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Desconto</span>
                <span>-{invoice.discountAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {invoice.taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taxa</span>
                <span>{invoice.taxAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Total</span>
              <span>{invoice.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pago</span>
              <span>{invoice.paidAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between font-semibold text-primary">
              <span>Saldo</span>
              <span>{invoice.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Payment Plan */}
        {plan && (
          <div>
            <h3 className="font-semibold mb-3">Plano de Pagamento — {plan.name}</h3>
            <div className="rounded-md border divide-y">
              <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground font-medium">
                <span>Prestação</span>
                <span>Vencimento</span>
                <span>Valor</span>
                <span>Pago</span>
                <span>Estado</span>
              </div>
              {plan.installments.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>#{inst.installmentNumber}</span>
                  <span>{inst.dueDate.toLocaleDateString("pt-PT")}</span>
                  <span>{inst.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
                  <span>{inst.paidAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</span>
                  <Badge variant={inst.status === "PAID" ? "default" : inst.status === "OVERDUE" ? "destructive" : "secondary"}>
                    {INSTALLMENT_STATUS_LABELS[inst.status] ?? inst.status}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Estado do plano: {PAYMENT_PLAN_STATUS_LABELS[plan.status] ?? plan.status}
            </p>
          </div>
        )}

        {invoice.notes && (
          <div>
            <h3 className="font-semibold mb-1">Notas</h3>
            <p className="text-sm text-muted-foreground">{invoice.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}
