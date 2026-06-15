import { BusinessRuleError } from "@/shared/lib/command";
import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

function formatNumber(num: number, prefix: string): string {
  return `${prefix}-${String(num).padStart(6, "0")}`;
}

function toNumber(raw: bigint | null | undefined): number {
  return raw != null ? Number(raw) : 0;
}

export async function getNextInvoiceNumber(tx: TxClient): Promise<string> {
  try {
    const result = await tx.$queryRaw<Array<{ nextVal: bigint }>>`SELECT NEXT VALUE FOR [dbo].[InvoiceSequence] AS nextVal`;
    const num = toNumber(result[0]?.nextVal);
    if (!num) throw new Error("Sequência retornou valor inválido");
    return formatNumber(num, "FAT");
  } catch (err) {
    if (err instanceof BusinessRuleError) throw err;
    throw new BusinessRuleError(`Falha ao gerar número de fatura: ${(err as Error).message}`);
  }
}

export async function getNextPaymentNumber(tx: TxClient): Promise<string> {
  try {
    const result = await tx.$queryRaw<Array<{ nextVal: bigint }>>`SELECT NEXT VALUE FOR [dbo].[PaymentSequence] AS nextVal`;
    const num = toNumber(result[0]?.nextVal);
    if (!num) throw new Error("Sequência retornou valor inválido");
    return formatNumber(num, "PAG");
  } catch (err) {
    if (err instanceof BusinessRuleError) throw err;
    throw new BusinessRuleError(`Falha ao gerar número de pagamento: ${(err as Error).message}`);
  }
}

export async function getNextReceiptNumber(tx: TxClient): Promise<string> {
  try {
    const result = await tx.$queryRaw<Array<{ nextVal: bigint }>>`SELECT NEXT VALUE FOR [dbo].[ReceiptSequence] AS nextVal`;
    const num = toNumber(result[0]?.nextVal);
    if (!num) throw new Error("Sequência retornou valor inválido");
    return formatNumber(num, "REC");
  } catch (err) {
    if (err instanceof BusinessRuleError) throw err;
    throw new BusinessRuleError(`Falha ao gerar número de recibo: ${(err as Error).message}`);
  }
}

export async function getNextTransactionNumber(tx: TxClient): Promise<string> {
  try {
    const result = await tx.$queryRaw<Array<{ nextVal: bigint }>>`SELECT NEXT VALUE FOR [dbo].[FinancialTransactionSequence] AS nextVal`;
    const num = toNumber(result[0]?.nextVal);
    if (!num) throw new Error("Sequência retornou valor inválido");
    return formatNumber(num, "TXN");
  } catch (err) {
    if (err instanceof BusinessRuleError) throw err;
    throw new BusinessRuleError(`Falha ao gerar número de transação: ${(err as Error).message}`);
  }
}

export async function getNextRefundNumber(tx: TxClient): Promise<string> {
  try {
    const result = await tx.$queryRaw<Array<{ nextVal: bigint }>>`SELECT NEXT VALUE FOR [dbo].[RefundSequence] AS nextVal`;
    const num = toNumber(result[0]?.nextVal);
    if (!num) throw new Error("Sequência retornou valor inválido");
    return formatNumber(num, "REF");
  } catch (err) {
    if (err instanceof BusinessRuleError) throw err;
    throw new BusinessRuleError(`Falha ao gerar número de reembolso: ${(err as Error).message}`);
  }
}
