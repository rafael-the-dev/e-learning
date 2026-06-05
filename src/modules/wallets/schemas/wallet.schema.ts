import { z } from "zod";

export const createWalletSchema = z.object({
  studentId: z.string().min(1, "Aluno é obrigatório"),
});

export const createDepositSchema = z.object({
  walletId: z.string().min(1, "Carteira é obrigatória"),
  amount: z.number().positive("O valor deve ser maior que zero"),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  description: z.string().optional(),
});

export const applyWalletCreditSchema = z.object({
  walletId: z.string().min(1, "Carteira é obrigatória"),
  invoiceId: z.string().min(1, "Fatura é obrigatória"),
  amount: z.number().positive("O valor deve ser maior que zero"),
  notes: z.string().optional(),
});

export const createWalletAdjustmentSchema = z.object({
  walletId: z.string().min(1, "Carteira é obrigatória"),
  amount: z.number().refine((v) => v !== 0, "O valor não pode ser zero"),
  description: z.string().min(1, "Descrição é obrigatória"),
});

export const refundWalletSchema = z.object({
  walletId: z.string().min(1, "Carteira é obrigatória"),
  amount: z.number().positive("O valor deve ser maior que zero"),
  description: z.string().optional(),
});

export const processOverpaymentSchema = z.object({
  studentId: z.string().min(1, "Aluno é obrigatório"),
  paymentId: z.string().min(1, "Pagamento é obrigatório"),
  amount: z.number().positive("O valor deve ser maior que zero"),
  invoiceId: z.string().optional(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type CreateDepositInput = z.infer<typeof createDepositSchema>;
export type ApplyWalletCreditInput = z.infer<typeof applyWalletCreditSchema>;
export type CreateWalletAdjustmentInput = z.infer<typeof createWalletAdjustmentSchema>;
export type RefundWalletInput = z.infer<typeof refundWalletSchema>;
export type ProcessOverpaymentInput = z.infer<typeof processOverpaymentSchema>;
