import { getDb } from "@/server/db";
import { computeNewInstallmentStatus } from "@/modules/finance/utils/status-computation";
import type { PaymentPlan, Installment } from "@/modules/finance/types";

type DecimalLike = { toNumber(): number };

// =============================================================================
// PAYMENT PLAN REPOSITORY — all queries scoped to organizationId
// =============================================================================

const installmentSelect = {
  id: true,
  organizationId: true,
  paymentPlanId: true,
  invoiceId: true,
  installmentNumber: true,
  dueDate: true,
  amount: true,
  paidAmount: true,
  balanceAmount: true,
  status: true,
  paidAt: true,
} as const;

const paymentPlanSelect = {
  id: true,
  organizationId: true,
  invoiceId: true,
  name: true,
  numberOfInstallments: true,
  totalAmount: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  installmentList: { select: installmentSelect, orderBy: { installmentNumber: "asc" as const } },
} as const;

type InstallmentRow = {
  id: string;
  organizationId: string;
  paymentPlanId: string;
  invoiceId: string;
  installmentNumber: number;
  dueDate: Date;
  amount: DecimalLike;
  paidAmount: DecimalLike;
  balanceAmount: DecimalLike;
  status: string;
  paidAt: Date | null;
};

type PaymentPlanRow = {
  id: string;
  organizationId: string;
  invoiceId: string;
  name: string;
  numberOfInstallments: number;
  totalAmount: DecimalLike;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  installmentList: InstallmentRow[];
};

function mapInstallment(row: InstallmentRow): Installment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    paymentPlanId: row.paymentPlanId,
    invoiceId: row.invoiceId,
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    amount: row.amount.toNumber(),
    paidAmount: row.paidAmount.toNumber(),
    balanceAmount: row.balanceAmount.toNumber(),
    status: row.status as Installment["status"],
    paidAt: row.paidAt,
  };
}

function mapToPaymentPlan(row: PaymentPlanRow): PaymentPlan {
  return {
    id: row.id,
    organizationId: row.organizationId,
    invoiceId: row.invoiceId,
    name: row.name,
    numberOfInstallments: row.numberOfInstallments,
    totalAmount: row.totalAmount.toNumber(),
    status: row.status as PaymentPlan["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    installments: row.installmentList.map(mapInstallment),
  };
}

export async function findPaymentPlanByInvoice(
  invoiceId: string,
  organizationId: string
): Promise<PaymentPlan | null> {
  const db = await getDb();
  const row = await db.paymentPlan.findFirst({
    where: { invoiceId, organizationId },
    select: paymentPlanSelect,
  });
  return row ? mapToPaymentPlan(row) : null;
}

export async function findPaymentPlanById(
  id: string,
  organizationId: string
): Promise<PaymentPlan | null> {
  const db = await getDb();
  const row = await db.paymentPlan.findFirst({
    where: { id, organizationId },
    select: paymentPlanSelect,
  });
  return row ? mapToPaymentPlan(row) : null;
}

export async function createPaymentPlan(data: {
  organizationId: string;
  invoiceId: string;
  name: string;
  numberOfInstallments: number;
  totalAmount: number;
  installments: { invoiceId: string; installmentNumber: number; dueDate: Date; amount: number }[];
}): Promise<PaymentPlan> {
  const db = await getDb();
  const row = await db.paymentPlan.create({
    data: {
      organizationId: data.organizationId,
      invoiceId: data.invoiceId,
      name: data.name,
      numberOfInstallments: data.numberOfInstallments,
      totalAmount: data.totalAmount,
      installmentList: {
        create: data.installments.map((inst) => ({
          organizationId: data.organizationId,
          invoiceId: inst.invoiceId,
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate,
          amount: inst.amount,
          balanceAmount: inst.amount,
        })),
      },
    },
    select: paymentPlanSelect,
  });
  return mapToPaymentPlan(row);
}

export async function updatePaymentPlan(
  id: string,
  organizationId: string,
  data: { name?: string; status?: string }
): Promise<PaymentPlan> {
  const db = await getDb();
  const row = await db.paymentPlan.update({
    where: { id, organizationId },
    data,
    select: paymentPlanSelect,
  });
  return mapToPaymentPlan(row);
}

export async function applyPaymentToInstallment(
  installmentId: string,
  organizationId: string,
  amount: number
): Promise<void> {
  const db = await getDb();
  const inst = await db.installment.findUniqueOrThrow({
    where: { id: installmentId },
    select: { paidAmount: true, amount: true, status: true },
  });
  const newPaid = inst.paidAmount.toNumber() + amount;
  const newBalance = inst.amount.toNumber() - newPaid;
  await db.installment.update({
    where: { id: installmentId, organizationId },
    data: {
      paidAmount: newPaid,
      balanceAmount: newBalance,
      status: computeNewInstallmentStatus(inst.status, newBalance),
      paidAt: newBalance <= 0 ? new Date() : null,
    },
  });
}
