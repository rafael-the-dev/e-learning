import { z } from "zod";

export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  quantity: z.number().positive("Quantidade deve ser maior que zero"),
  unitPrice: z.number().nonnegative("Preço não pode ser negativo"),
  itemType: z
    .enum(["REGISTRATION_FEE", "COURSE_FEE", "MATERIAL_FEE", "EXAM_FEE", "CERTIFICATE_FEE", "PENALTY", "OTHER"])
    .default("OTHER"),
});

export const createInvoiceSchema = z.object({
  enrollmentId: z.string().optional(),
  studentId: z.string().optional(),
  branchId: z.string().optional(),
  dueDate: z.string().optional(),
  discountAmount: z.number().nonnegative("Desconto não pode ser negativo").default(0),
  taxAmount: z.number().nonnegative("Taxa não pode ser negativa").default(0),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "A fatura deve ter pelo menos um item"),
});

export const updateInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  dueDate: z.string().optional(),
  discountAmount: z.number().nonnegative("Desconto não pode ser negativo").optional(),
  taxAmount: z.number().nonnegative("Taxa não pode ser negativa").optional(),
  notes: z.string().optional(),
});

export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;
