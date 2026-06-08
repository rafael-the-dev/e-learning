import type {
  FeeType,
  FeeAppliesTo,
  FeeDefinitionStatus,
  InvoiceMode,
  ActivationRule,
  BillingPolicyStatus,
  PolicyFeeAmountType,
  PolicyFeeStatus,
  DiscountType,
  DiscountAppliesTo,
  DiscountRuleStatus,
  TaxAppliesTo,
  TaxRuleStatus,
} from "@/shared/types/common";

// =============================================================================
// BILLING DOMAIN TYPES
// =============================================================================

export interface FeeDefinition {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  feeType: FeeType;
  defaultAmount: number;
  appliesTo: FeeAppliesTo;
  isMandatory: boolean;
  priority: number;
  status: FeeDefinitionStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface PolicyFee {
  id: string;
  organizationId: string;
  policyId: string;
  feeDefinitionId: string;
  amountType: PolicyFeeAmountType;
  fixedAmount: number | null;
  percentage: number | null;
  isRequired: boolean;
  priority: number;
  status: PolicyFeeStatus;
  createdAt: Date;
  updatedAt: Date;
  // denormalized
  feeDefinitionName: string;
  feeDefinitionCode: string;
  feeDefinitionType: FeeType;
  feeDefinitionDefaultAmount: number;
}

export interface EnrollmentBillingPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  autoGenerateInvoiceOnEnrollment: boolean;
  invoiceMode: InvoiceMode;
  activationRule: ActivationRule;
  installmentsRequired: boolean;
  defaultNumberOfInstallments: number | null;
  minimumFirstPaymentAmount: number | null;
  allowWalletCreditOnEnrollment: boolean;
  status: BillingPolicyStatus;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  policyFees: PolicyFee[];
}

export interface DiscountRule {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  discountType: DiscountType;
  value: number;
  appliesTo: DiscountAppliesTo;
  startDate: Date | null;
  endDate: Date | null;
  stackable: boolean;
  status: DiscountRuleStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface TaxRule {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  rate: number;
  appliesTo: TaxAppliesTo;
  isIncludedInPrice: boolean;
  status: TaxRuleStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface AppliedDiscount {
  id: string;
  organizationId: string;
  invoiceId: string;
  discountRuleId: string;
  amount: number;
  description: string | null;
  createdAt: Date;
}

export interface AppliedTax {
  id: string;
  organizationId: string;
  invoiceId: string;
  taxRuleId: string;
  amount: number;
  rate: number;
  description: string | null;
  createdAt: Date;
}

// =============================================================================
// BILLING CALCULATION RESULT (used in invoice preview and generation)
// =============================================================================

export interface BillingPreviewItem {
  feeDefinitionId: string;
  feeDefinitionCode: string;
  description: string;
  itemType: FeeType;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  priority: number;
}

export interface BillingPreviewDiscount {
  discountRuleId: string;
  name: string;
  discountType: DiscountType;
  value: number;
  amount: number;
}

export interface BillingPreviewTax {
  taxRuleId: string;
  name: string;
  rate: number;
  amount: number;
  isIncludedInPrice: boolean;
}

export interface BillingCalculationResult {
  items: BillingPreviewItem[];
  discounts: BillingPreviewDiscount[];
  taxes: BillingPreviewTax[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  installmentsPreview: { number: number; amount: number }[];
}

// =============================================================================
// LABEL MAPS (pt-PT)
// =============================================================================

export const FEE_TYPE_LABELS: Record<string, string> = {
  REGISTRATION_FEE: "Taxa de Inscrição",
  COURSE_FEE: "Taxa do Curso",
  MATERIAL_FEE: "Material Didático",
  EXAM_FEE: "Taxa de Exame",
  CERTIFICATE_FEE: "Certificado",
  PENALTY: "Multa",
  OTHER: "Outro",
};

export const FEE_APPLIES_TO_LABELS: Record<string, string> = {
  ENROLLMENT: "Matrícula",
  COURSE: "Curso",
  LEVEL: "Nível",
  CERTIFICATE: "Certificado",
  EXAM: "Exame",
  MANUAL: "Manual",
};

export const FEE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const INVOICE_MODE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  SINGLE_INVOICE: "Fatura Única",
  INSTALLMENT_INVOICES: "Faturas por Prestação",
};

export const ACTIVATION_RULE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  AFTER_INVOICE_CREATED: "Após Criação de Fatura",
  AFTER_REGISTRATION_FEE: "Após Pagamento da Inscrição",
  AFTER_FIRST_PAYMENT: "Após Primeiro Pagamento",
  AFTER_FULL_PAYMENT: "Após Pagamento Total",
};

export const BILLING_POLICY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
  ARCHIVED: "Arquivada",
};

export const POLICY_FEE_AMOUNT_TYPE_LABELS: Record<string, string> = {
  FIXED: "Valor Fixo",
  PERCENTAGE_OF_COURSE_PRICE: "Percentagem do Preço do Curso",
  COURSE_BASE_PRICE: "Preço Base do Curso",
};

export const POLICY_FEE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};

export const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  PERCENTAGE: "Percentagem",
  FIXED_AMOUNT: "Valor Fixo",
};

export const DISCOUNT_APPLIES_TO_LABELS: Record<string, string> = {
  ENROLLMENT: "Matrícula",
  COURSE: "Curso",
  ALL: "Todos",
};

export const DISCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const TAX_APPLIES_TO_LABELS: Record<string, string> = {
  ENROLLMENT: "Matrícula",
  COURSE: "Curso",
  ALL: "Todos",
};

export const TAX_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};
