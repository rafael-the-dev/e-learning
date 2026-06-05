import { z } from "zod";

export const createPaymentPlanSchema = z.object({
  invoiceId: z.string().min(1, "Fatura é obrigatória"),
  name: z.string().min(1, "Nome do plano é obrigatório"),
  numberOfInstallments: z
    .number()
    .int("Número de prestações deve ser inteiro")
    .min(2, "Mínimo de 2 prestações")
    .max(60, "Máximo de 60 prestações"),
  firstDueDate: z.string().min(1, "Data da primeira prestação é obrigatória"),
});

export const updatePaymentPlanSchema = z.object({
  paymentPlanId: z.string().min(1),
  name: z.string().min(1, "Nome do plano é obrigatório").optional(),
});

export const cancelPaymentPlanSchema = z.object({
  paymentPlanId: z.string().min(1),
  reason: z.string().optional(),
});

export type CreatePaymentPlanInput = z.infer<typeof createPaymentPlanSchema>;
export type UpdatePaymentPlanInput = z.infer<typeof updatePaymentPlanSchema>;
export type CancelPaymentPlanInput = z.infer<typeof cancelPaymentPlanSchema>;
