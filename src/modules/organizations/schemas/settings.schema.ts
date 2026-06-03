import { z } from "zod";

export const updateSettingsSchema = z.object({
  currencyCode: z.string().min(1).max(3),
  currencySymbol: z.string().min(1).max(10),
  dateFormat: z.string().min(1).max(20),
  taxRate: z.number().min(0).max(100).optional(),
  taxName: z.string().max(50).optional(),
  invoicePrefix: z.string().min(1).max(10),
  receiptPrefix: z.string().min(1).max(10),
  allowLatePayments: z.boolean(),
  gracePeriodDays: z.number().int().min(0).max(365),
});

export type UpdateSettingsSchema = z.infer<typeof updateSettingsSchema>;
