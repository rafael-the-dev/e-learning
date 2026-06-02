// =============================================================================
// SHARED DOMAIN TYPES
// =============================================================================

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SortParams {
  field: string;
  direction: "asc" | "desc";
}

export interface FilterParams {
  search?: string;
  [key: string]: unknown;
}

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export interface ServiceContext {
  userId: string;
  organizationId: string;
  branchId?: string;
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// ENUM VALUES (enforced at application layer — SQL Server has no native enums)
// =============================================================================

export const OrganizationStatus = {
  TRIAL: "TRIAL",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
} as const;
export type OrganizationStatus =
  (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

export const SubscriptionPlan = {
  FREE: "FREE",
  STARTER: "STARTER",
  PROFESSIONAL: "PROFESSIONAL",
  ENTERPRISE: "ENTERPRISE",
} as const;
export type SubscriptionPlan =
  (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const BranchStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;
export type BranchStatus = (typeof BranchStatus)[keyof typeof BranchStatus];

export const Gender = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  OTHER: "OTHER",
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const StudentStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  COMPLETED: "COMPLETED",
  DROPPED: "DROPPED",
} as const;
export type StudentStatus =
  (typeof StudentStatus)[keyof typeof StudentStatus];

export const TeacherStatus = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  ON_LEAVE: "ON_LEAVE",
} as const;
export type TeacherStatus =
  (typeof TeacherStatus)[keyof typeof TeacherStatus];

export const ClassGroupStatus = {
  FORMING: "FORMING",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type ClassGroupStatus =
  (typeof ClassGroupStatus)[keyof typeof ClassGroupStatus];

export const EnrollmentStatus = {
  DRAFT: "DRAFT",
  PENDING_PAYMENT: "PENDING_PAYMENT",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  SUSPENDED: "SUSPENDED",
  CANCELLED: "CANCELLED",
} as const;
export type EnrollmentStatus =
  (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const AttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  EXCUSED: "EXCUSED",
} as const;
export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const VehicleStatus = {
  ACTIVE: "ACTIVE",
  MAINTENANCE: "MAINTENANCE",
  INACTIVE: "INACTIVE",
} as const;
export type VehicleStatus =
  (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const PracticalLessonStatus = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;
export type PracticalLessonStatus =
  (typeof PracticalLessonStatus)[keyof typeof PracticalLessonStatus];

export const InvoiceStatus = {
  PENDING: "PENDING",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceStatus =
  (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const InstallmentStatus = {
  PENDING: "PENDING",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
} as const;
export type InstallmentStatus =
  (typeof InstallmentStatus)[keyof typeof InstallmentStatus];

export const PaymentMethod = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  MPESA: "MPESA",
  EMOLA: "EMOLA",
  POS: "POS",
  OTHER: "OTHER",
} as const;
export type PaymentMethod =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus =
  (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const NotificationType = {
  ENROLLMENT_APPROVED: "ENROLLMENT_APPROVED",
  ENROLLMENT_CANCELLED: "ENROLLMENT_CANCELLED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_OVERDUE: "PAYMENT_OVERDUE",
  CLASS_SCHEDULED: "CLASS_SCHEDULED",
  CLASS_CANCELLED: "CLASS_CANCELLED",
  DOCUMENT_READY: "DOCUMENT_READY",
  GENERAL: "GENERAL",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationChannel = {
  IN_APP: "IN_APP",
  EMAIL: "EMAIL",
  SMS: "SMS",
  WHATSAPP: "WHATSAPP",
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const AuditAction = {
  CREATED: "CREATED",
  UPDATED: "UPDATED",
  DELETED: "DELETED",
  RESTORED: "RESTORED",
  STATUS_CHANGED: "STATUS_CHANGED",
  CANCELLED: "CANCELLED",
  APPROVED: "APPROVED",
  SUSPENDED: "SUSPENDED",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
