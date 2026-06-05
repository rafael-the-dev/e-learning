import { z } from "zod";

export const paymentSplitSchema = z.object({
  method: z.enum(["CASH", "MPESA", "EMOLA", "BANK_TRANSFER", "CARD", "POS", "CHEQUE", "OTHER"]),
  amount: z.number().positive("Valor deve ser maior que zero"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

export const registerPaymentSchema = z.object({
  invoiceId: z.string().min(1, "Fatura é obrigatória"),
  installmentId: z.string().optional(),
  walletCreditAmount: z.number().min(0).optional(),
  splits: z.array(paymentSplitSchema).min(1, "Pelo menos um método de pagamento é obrigatório"),
  paymentDate: z.string().optional(),
  notes: z.string().optional(),
});

export const confirmPaymentSchema = z.object({
  paymentId: z.string().min(1),
});

export const cancelPaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().optional(),
});

export type PaymentSplitInput = z.infer<typeof paymentSplitSchema>;
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;
