import { z } from "zod";

export const issueReceiptSchema = z.object({
  paymentId: z.string().min(1, "Pagamento é obrigatório"),
});

export const cancelReceiptSchema = z.object({
  receiptId: z.string().min(1),
  reason: z.string().optional(),
});

export type IssueReceiptInput = z.infer<typeof issueReceiptSchema>;
export type CancelReceiptInput = z.infer<typeof cancelReceiptSchema>;
