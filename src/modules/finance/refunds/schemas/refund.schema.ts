import { z } from "zod";

export const createRefundRequestSchema = z.object({
  paymentId: z.string().min(1, "O pagamento é obrigatório"),
  amount: z.number().positive("O valor deve ser superior a zero"),
  reason: z.string().min(2, "A razão deve ter pelo menos 2 caracteres"),
  // RefundMethod: CASH_RETURN | WALLET_CREDIT
  refundMethod: z.enum(["CASH_RETURN", "WALLET_CREDIT"], {
    message: "Método de reembolso inválido",
  }),
  notes: z.string().optional(),
});

export type CreateRefundRequestInput = z.infer<typeof createRefundRequestSchema>;

export const approveRefundSchema = z.object({
  refundId: z.string().min(1, "O ID do reembolso é obrigatório"),
  notes: z.string().optional(),
});

export type ApproveRefundInput = z.infer<typeof approveRefundSchema>;

export const rejectRefundSchema = z.object({
  refundId: z.string().min(1, "O ID do reembolso é obrigatório"),
  rejectionReason: z.string().min(2, "A razão de rejeição deve ter pelo menos 2 caracteres"),
});

export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;

export const completeRefundSchema = z.object({
  refundId: z.string().min(1, "O ID do reembolso é obrigatório"),
  notes: z.string().optional(),
});

export type CompleteRefundInput = z.infer<typeof completeRefundSchema>;
