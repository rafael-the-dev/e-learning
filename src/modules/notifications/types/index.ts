import type {
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  NotificationChannel,
  NotificationRulePriority,
  NotificationDeliveryStatus,
  NotificationEmailProviderType,
  NotificationEmailTestStatus,
} from "@/shared/types/common";

export type {
  NotificationSeverity,
  NotificationStatus,
  NotificationType,
  NotificationChannel,
  NotificationRulePriority,
  NotificationDeliveryStatus,
  NotificationEmailProviderType,
  NotificationEmailTestStatus,
};

export interface Notification {
  id: string;
  organizationId: string;
  recipientUserId: string;
  type: NotificationType | string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  status: NotificationStatus;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  readAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationFilters {
  status?: NotificationStatus | "ALL";
  severity?: NotificationSeverity;
  type?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface CreateNotificationInput {
  recipientUserId: string;
  type: NotificationType | string;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  INFO: "Informação",
  SUCCESS: "Sucesso",
  WARNING: "Aviso",
  CRITICAL: "Crítico",
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  UNREAD: "Não lida",
  READ: "Lida",
  ARCHIVED: "Arquivada",
};

// =============================================================================
// PHASE 2 — TEMPLATES & EVENT RULES
// =============================================================================

export interface NotificationTemplate {
  id: string;
  organizationId: string;
  eventType: string;
  channel: NotificationChannel;
  name: string;
  subject: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  variables: string[];
  language: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface NotificationTemplateFilters {
  eventType?: string;
  channel?: NotificationChannel;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateNotificationTemplateInput {
  eventType: string;
  channel: NotificationChannel;
  name: string;
  subject?: string | null;
  titleTemplate: string;
  bodyTemplate: string;
  language?: string;
}

export interface UpdateNotificationTemplateInput {
  name?: string;
  subject?: string | null;
  titleTemplate?: string;
  bodyTemplate?: string;
  language?: string;
}

export interface NotificationEventRule {
  id: string;
  organizationId: string;
  eventType: string;
  enabled: boolean;
  channels: NotificationChannel[];
  dedupeWindowMinutes: number;
  delayMinutes: number;
  priority: NotificationRulePriority;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UpdateNotificationEventRuleInput {
  enabled?: boolean;
  channels?: NotificationChannel[];
  dedupeWindowMinutes?: number;
  delayMinutes?: number;
  priority?: NotificationRulePriority;
}

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "Na aplicação",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  PUSH: "Push",
};

export const NOTIFICATION_RULE_PRIORITY_LABELS: Record<NotificationRulePriority, string> = {
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

// =============================================================================
// PHASE 3.1 — DELIVERY INFRASTRUCTURE
// =============================================================================

export interface NotificationDelivery {
  id: string;
  organizationId: string;
  notificationId: string;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationDeliveryStatus;
  provider: string | null;
  providerMessageId: string | null;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  failureReason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  /** Joined for the admin table — not a column on NotificationDelivery itself. */
  notificationTitle?: string;
}

export interface NotificationDeliveryFilters {
  status?: NotificationDeliveryStatus;
  channel?: NotificationChannel;
  recipient?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface CreateNotificationDeliveryInput {
  notificationId: string;
  channel: NotificationChannel;
  recipient: string;
  status?: NotificationDeliveryStatus;
  failureReason?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
}

export const NOTIFICATION_DELIVERY_STATUS_LABELS: Record<NotificationDeliveryStatus, string> = {
  PENDING: "Pendente",
  PROCESSING: "A processar",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

// =============================================================================
// PHASE 3.2B — EMAIL SETTINGS
// =============================================================================

/**
 * Public-safe shape — never includes smtpPasswordEncrypted, a decrypted
 * password, or the Microsoft Graph client secret. See
 * notification-email-settings.service.ts#getEmailSettings.
 */
export interface NotificationEmailSettings {
  id: string;
  organizationId: string;
  providerType: NotificationEmailProviderType;
  isEnabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpSecure: boolean;
  lastTestedAt: Date | null;
  lastTestStatus: NotificationEmailTestStatus | null;
  lastTestError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertNotificationEmailSettingsInput {
  providerType?: NotificationEmailProviderType;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  /** Plaintext, optional — blank/omitted keeps the currently-stored password unchanged. */
  smtpPassword?: string | null;
  smtpSecure?: boolean;
}

export interface TestNotificationEmailSettingsInput {
  providerType?: NotificationEmailProviderType;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  /** Plaintext, optional — blank/omitted falls back to the saved settings' decrypted password. */
  smtpPassword?: string | null;
  smtpSecure?: boolean;
}

export interface TestNotificationEmailSettingsResult {
  success: boolean;
  errorMessage?: string;
}

export const NOTIFICATION_EMAIL_PROVIDER_TYPE_LABELS: Record<NotificationEmailProviderType, string> = {
  SMTP: "SMTP",
  MICROSOFT_GRAPH: "Microsoft Graph",
};

export const NOTIFICATION_EMAIL_TEST_STATUS_LABELS: Record<NotificationEmailTestStatus, string> = {
  SUCCESS: "Sucesso",
  FAILED: "Falhou",
};
