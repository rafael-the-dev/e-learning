import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listForCurrentUser } from "@/modules/notifications/services/notification.service";
import { listTemplates } from "@/modules/notifications/services/notification-template.service";
import { listRules } from "@/modules/notifications/services/notification-event-rule.service";
import { listDeliveries } from "@/modules/notifications/services/notification-delivery.service";
import { getEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import type { NotificationStatus, NotificationSeverity, NotificationDeliveryStatus, NotificationChannel } from "@/modules/notifications/types";
import { NotificationsPageClient } from "./_components/notifications-page-client";

export const metadata = { title: "Notificações" };

const VALID_STATUSES: (NotificationStatus | "ALL")[] = ["UNREAD", "READ", "ARCHIVED", "ALL"];
const VALID_SEVERITIES: NotificationSeverity[] = ["INFO", "SUCCESS", "WARNING", "CRITICAL"];
const VALID_DELIVERY_STATUSES: NotificationDeliveryStatus[] = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
];
const VALID_CHANNELS: NotificationChannel[] = ["IN_APP", "EMAIL", "WHATSAPP", "SMS", "PUSH"];

function asValidStatus(value: string | undefined) {
  return value && (VALID_STATUSES as string[]).includes(value)
    ? (value as NotificationStatus | "ALL")
    : undefined;
}

function asValidSeverity(value: string | undefined) {
  return value && (VALID_SEVERITIES as string[]).includes(value) ? (value as NotificationSeverity) : undefined;
}

function asValidDeliveryStatus(value: string | undefined) {
  return value && (VALID_DELIVERY_STATUSES as string[]).includes(value)
    ? (value as NotificationDeliveryStatus)
    : undefined;
}

function asValidChannel(value: string | undefined) {
  return value && (VALID_CHANNELS as string[]).includes(value) ? (value as NotificationChannel) : undefined;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    status?: string;
    severity?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    deliveryPage?: string;
    channel?: string;
    recipient?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.NOTIFICATIONS_VIEW_OWN);

  const { tab, page, status, severity, type, dateFrom, dateTo, deliveryPage, channel, recipient } =
    await searchParams;

  const filters = {
    page: page ? Number(page) : 1,
    status: asValidStatus(status),
    severity: asValidSeverity(severity),
    type,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
  };

  const canManageTemplates = context.ability.can(PERMISSIONS.NOTIFICATIONS_MANAGE_TEMPLATES);
  const canManageRules = context.ability.can(PERMISSIONS.NOTIFICATIONS_MANAGE_RULES);
  const canViewDeliveries = context.ability.can(PERMISSIONS.NOTIFICATIONS_VIEW_DELIVERIES);
  const canRetryDelivery = context.ability.can(PERMISSIONS.NOTIFICATIONS_RETRY_DELIVERY);
  const canCancelDelivery = context.ability.can(PERMISSIONS.NOTIFICATIONS_CANCEL_DELIVERY);
  const canManageEmailSettings = context.ability.can(PERMISSIONS.NOTIFICATIONS_MANAGE_EMAIL_SETTINGS);

  const deliveryFilters = {
    page: deliveryPage ? Number(deliveryPage) : 1,
    status: asValidDeliveryStatus(status),
    channel: asValidChannel(channel),
    recipient,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
  };

  const [result, templatesResult, rules, deliveriesResult, emailSettings] = await Promise.all([
    listForCurrentUser(context.organizationId, context.userId, filters),
    canManageTemplates
      ? listTemplates(context.organizationId, { pageSize: 100 })
      : Promise.resolve({ data: [], total: 0 }),
    canManageRules ? listRules(context.organizationId) : Promise.resolve([]),
    canViewDeliveries
      ? listDeliveries(context.organizationId, deliveryFilters)
      : Promise.resolve({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false }),
    canManageEmailSettings ? getEmailSettings(context.organizationId) : Promise.resolve(null),
  ]);

  return (
    <NotificationsPageClient
      activeTab={tab === "templates" || tab === "rules" || tab === "deliveries" || tab === "email" ? tab : "inbox"}
      canManageTemplates={canManageTemplates}
      canManageRules={canManageRules}
      canViewDeliveries={canViewDeliveries}
      canRetryDelivery={canRetryDelivery}
      canCancelDelivery={canCancelDelivery}
      canManageEmailSettings={canManageEmailSettings}
      result={result}
      templates={templatesResult.data}
      rules={rules}
      deliveries={deliveriesResult}
      emailSettings={emailSettings}
      status={status}
      severity={severity}
      type={type}
      dateFrom={dateFrom}
      dateTo={dateTo}
      deliveryChannel={channel}
      deliveryRecipient={recipient}
    />
  );
}
