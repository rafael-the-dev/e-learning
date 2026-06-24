import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listForCurrentUser } from "@/modules/notifications/services/notification.service";
import { listTemplates } from "@/modules/notifications/services/notification-template.service";
import { listRules } from "@/modules/notifications/services/notification-event-rule.service";
import { listDeliveries } from "@/modules/notifications/services/notification-delivery.service";
import { getEmailSettings } from "@/modules/notifications/services/notification-email-settings.service";
import {
  getOperationsKpis,
  getDeliveryVolumeTrend,
  getDeliveryStatusDistribution,
  getChannelHealthBreakdown,
  getTopFailureReasons,
  getTopNotificationEvents,
  getDeliveryOperationsWatchlist,
  getProblemDeliveries,
} from "@/modules/notifications/services/notification-operations.service";
import { defaultOperationsDateRange, toDateInputValue, endOfDay } from "@/modules/notifications/lib/operations-date-range";
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
    opsDateFrom?: string;
    opsDateTo?: string;
    opsStatus?: string;
    opsChannel?: string;
    opsFailureReason?: string;
    opsEventType?: string;
    opsPage?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.NOTIFICATIONS_VIEW_OWN);

  const {
    tab,
    page,
    status,
    severity,
    type,
    dateFrom,
    dateTo,
    deliveryPage,
    channel,
    recipient,
    opsDateFrom,
    opsDateTo,
    opsStatus,
    opsChannel,
    opsFailureReason,
    opsEventType,
    opsPage,
  } = await searchParams;

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
  const canViewOperations = context.ability.can(PERMISSIONS.NOTIFICATIONS_VIEW_OPERATIONS);

  const deliveryFilters = {
    page: deliveryPage ? Number(deliveryPage) : 1,
    status: asValidDeliveryStatus(status),
    channel: asValidChannel(channel),
    recipient,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
  };

  const defaultOpsRange = defaultOperationsDateRange();
  const opsRange = {
    dateFrom: opsDateFrom ? new Date(opsDateFrom) : defaultOpsRange.dateFrom,
    dateTo: opsDateTo ? endOfDay(opsDateTo) : defaultOpsRange.dateTo,
  };
  const opsDateFromValue = opsDateFrom ?? toDateInputValue(defaultOpsRange.dateFrom);
  const opsDateToValue = opsDateTo ?? toDateInputValue(defaultOpsRange.dateTo);

  const problemDeliveryFilters = {
    page: opsPage ? Number(opsPage) : 1,
    status: asValidDeliveryStatus(opsStatus),
    channel: asValidChannel(opsChannel),
    failureReason: opsFailureReason,
    eventType: opsEventType,
    dateFrom: opsRange.dateFrom,
    dateTo: opsRange.dateTo,
  };

  const emptyPaginatedResult = { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false };

  const [
    result,
    templatesResult,
    rules,
    deliveriesResult,
    emailSettings,
    operationsKpis,
    dailyVolume,
    statusDistribution,
    channelHealth,
    failureReasons,
    topEvents,
    operationsWatchlist,
    problemDeliveries,
  ] = await Promise.all([
    listForCurrentUser(context.organizationId, context.userId, filters),
    canManageTemplates
      ? listTemplates(context.organizationId, { pageSize: 100 })
      : Promise.resolve({ data: [], total: 0 }),
    canManageRules ? listRules(context.organizationId) : Promise.resolve([]),
    canViewDeliveries
      ? listDeliveries(context.organizationId, deliveryFilters)
      : Promise.resolve(emptyPaginatedResult),
    canManageEmailSettings ? getEmailSettings(context.organizationId) : Promise.resolve(null),
    canViewOperations
      ? getOperationsKpis(context.organizationId, opsRange)
      : Promise.resolve(null),
    canViewOperations ? getDeliveryVolumeTrend(context.organizationId, opsRange) : Promise.resolve([]),
    canViewOperations ? getDeliveryStatusDistribution(context.organizationId, opsRange) : Promise.resolve([]),
    canViewOperations ? getChannelHealthBreakdown(context.organizationId, opsRange) : Promise.resolve([]),
    canViewOperations ? getTopFailureReasons(context.organizationId, opsRange) : Promise.resolve([]),
    canViewOperations ? getTopNotificationEvents(context.organizationId, opsRange) : Promise.resolve([]),
    canViewOperations ? getDeliveryOperationsWatchlist(context.organizationId) : Promise.resolve([]),
    canViewOperations
      ? getProblemDeliveries(context.organizationId, problemDeliveryFilters)
      : Promise.resolve(emptyPaginatedResult),
  ]);

  return (
    <NotificationsPageClient
      activeTab={
        tab === "templates" || tab === "rules" || tab === "deliveries" || tab === "email" || tab === "operations"
          ? tab
          : "inbox"
      }
      canManageTemplates={canManageTemplates}
      canManageRules={canManageRules}
      canViewDeliveries={canViewDeliveries}
      canRetryDelivery={canRetryDelivery}
      canCancelDelivery={canCancelDelivery}
      canManageEmailSettings={canManageEmailSettings}
      canViewOperations={canViewOperations}
      result={result}
      templates={templatesResult.data}
      rules={rules}
      deliveries={deliveriesResult}
      emailSettings={emailSettings}
      operationsKpis={operationsKpis}
      dailyVolume={dailyVolume}
      statusDistribution={statusDistribution}
      channelHealth={channelHealth}
      failureReasons={failureReasons}
      topEvents={topEvents}
      operationsWatchlist={operationsWatchlist}
      problemDeliveries={problemDeliveries}
      status={status}
      severity={severity}
      type={type}
      dateFrom={dateFrom}
      dateTo={dateTo}
      deliveryChannel={channel}
      deliveryRecipient={recipient}
      opsDateFrom={opsDateFromValue}
      opsDateTo={opsDateToValue}
      opsStatus={opsStatus}
      opsChannel={opsChannel}
      opsFailureReason={opsFailureReason}
      opsEventType={opsEventType}
    />
  );
}
