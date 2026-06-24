import { countByStatus } from "@/modules/notifications/repositories/notification-delivery.repository";
import { findManyRules } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { findByOrganization as findEmailSettings } from "@/modules/notifications/repositories/notification-email-settings.repository";
import {
  getStatusCountsInRange,
  getAverageAttempts,
  getRetryBacklogCount,
  getTerminalFailureCount,
  getStaleRetryableFailureCount,
  getStuckProcessingCount,
  getEmailFailureCountByExactReason,
  getEmailFailureCountByKeywords,
  getRecentEmailFailureCount,
  getDailyVolume,
  getStatusDistribution,
  getChannelHealth,
  getFailureReasons,
  getTopEvents,
  getProblemDeliveries as getProblemDeliveriesRepo,
} from "@/modules/notifications/repositories/notification-operations.repository";
import { buildPaginationMeta } from "@/shared/lib/pagination";
import type {
  ChannelHealthPoint,
  DeliveryOperationsWatchlistItem,
  DeliveryStatusDistributionPoint,
  DeliveryVolumePoint,
  EventVolumePoint,
  FailureReasonPoint,
  NotificationOperationsDateRange,
  NotificationOperationsKpis,
  ProblemDeliveryFilters,
  ProblemDeliveryRow,
} from "@/modules/notifications/types";
import type { PaginatedResult } from "@/shared/types/common";

// =============================================================================
// NOTIFICATION OPERATIONS SERVICE — PHASE 3.3
// Composes the repository's single-purpose aggregates into the dashboard's
// KPIs, charts, watchlist and problem-deliveries table. See
// docs/notifications-center.md "Phase 3.3" for the queue-state-vs-period
// distinction and the watchlist's threshold rationale.
// =============================================================================

const PROVIDER_NOT_CONFIGURED_REASON = "Fornecedor não configurado";
const AUTH_OR_CONFIG_KEYWORDS = ["autenticação", "TLS/certificado"];

const EMAIL_REPEATED_FAILURE_WINDOW_HOURS = 24;
const EMAIL_REPEATED_FAILURE_THRESHOLD = 5;
const STALE_FAILURE_HOURS = 24;
const RETRY_BACKLOG_THRESHOLD = 50;
const STUCK_PROCESSING_MINUTES = 30;
const CHANNEL_FAILURE_RATE_THRESHOLD_PCT = 20;
const CHANNEL_MIN_VOLUME = 10;
const CHANNEL_HEALTH_WINDOW_DAYS = 7;
const HIGH_PENDING_VOLUME_THRESHOLD = 20;

// =============================================================================
// KPIs
// =============================================================================

export async function getOperationsKpis(
  organizationId: string,
  range: NotificationOperationsDateRange,
  now: Date = new Date()
): Promise<NotificationOperationsKpis> {
  const [currentCounts, periodCounts, retryBacklog, averageAttempts] = await Promise.all([
    countByStatus(organizationId),
    getStatusCountsInRange(organizationId, range.dateFrom, range.dateTo),
    getRetryBacklogCount(organizationId, now),
    getAverageAttempts(organizationId, range.dateFrom, range.dateTo),
  ]);

  const sent = periodCounts.SENT ?? 0;
  const delivered = periodCounts.DELIVERED ?? 0;
  const failed = periodCounts.FAILED ?? 0;
  const cancelled = periodCounts.CANCELLED ?? 0;
  const periodPending = periodCounts.PENDING ?? 0;
  const periodProcessing = periodCounts.PROCESSING ?? 0;

  const nonCancelledTotal = sent + delivered + failed + periodPending + periodProcessing;
  const successRate = nonCancelledTotal > 0 ? ((sent + delivered) / nonCancelledTotal) * 100 : 0;

  return {
    pending: currentCounts.PENDING ?? 0,
    processing: currentCounts.PROCESSING ?? 0,
    sent,
    delivered,
    failed,
    cancelled,
    successRate,
    retryBacklog,
    averageAttempts,
  };
}

// =============================================================================
// CHARTS
// =============================================================================

export async function getDeliveryVolumeTrend(
  organizationId: string,
  range: NotificationOperationsDateRange
): Promise<DeliveryVolumePoint[]> {
  return getDailyVolume(organizationId, range.dateFrom, range.dateTo);
}

export async function getDeliveryStatusDistribution(
  organizationId: string,
  range: NotificationOperationsDateRange
): Promise<DeliveryStatusDistributionPoint[]> {
  return getStatusDistribution(organizationId, range.dateFrom, range.dateTo);
}

export async function getChannelHealthBreakdown(
  organizationId: string,
  range: NotificationOperationsDateRange
): Promise<ChannelHealthPoint[]> {
  return getChannelHealth(organizationId, range.dateFrom, range.dateTo);
}

export async function getTopFailureReasons(
  organizationId: string,
  range: NotificationOperationsDateRange
): Promise<FailureReasonPoint[]> {
  return getFailureReasons(organizationId, range.dateFrom, range.dateTo);
}

export async function getTopNotificationEvents(
  organizationId: string,
  range: NotificationOperationsDateRange
): Promise<EventVolumePoint[]> {
  return getTopEvents(organizationId, range.dateFrom, range.dateTo);
}

// =============================================================================
// WATCHLIST
// =============================================================================

const RECOMMENDED_ACTIONS = {
  VIEW_FAILED: { label: "Ver Entregas Falhadas", link: "/notifications?tab=operations&opsStatus=FAILED" },
  VIEW_PENDING: { label: "Ver Entregas Pendentes", link: "/notifications?tab=operations&opsStatus=PENDING" },
  VIEW_PROCESSING: { label: "Ver Entregas em Processamento", link: "/notifications?tab=operations&opsStatus=PROCESSING" },
  OPEN_EMAIL_SETTINGS: { label: "Abrir Configurações de Email", link: "/notifications?tab=email" },
  RETRY_FAILED: { label: "Reenviar Falhadas", link: "/notifications?tab=operations&opsStatus=FAILED" },
  OPEN_RULES: { label: "Abrir Regras", link: "/notifications?tab=rules" },
} as const;

const SEVERITY_RANK: Record<DeliveryOperationsWatchlistItem["severity"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function viewChannelLink(channel: string): string {
  return `/notifications?tab=operations&opsStatus=FAILED&opsChannel=${channel}`;
}

export async function getDeliveryOperationsWatchlist(
  organizationId: string,
  now: Date = new Date()
): Promise<DeliveryOperationsWatchlistItem[]> {
  const staleCutoff = new Date(now.getTime() - STALE_FAILURE_HOURS * 60 * 60 * 1000);
  const stuckCutoff = new Date(now.getTime() - STUCK_PROCESSING_MINUTES * 60 * 1000);
  const recentEmailFailureSince = new Date(now.getTime() - EMAIL_REPEATED_FAILURE_WINDOW_HOURS * 60 * 60 * 1000);
  const channelHealthWindowStart = new Date(now.getTime() - CHANNEL_HEALTH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [
    currentCounts,
    terminalFailureCount,
    staleRetryableFailureCount,
    retryBacklogCount,
    stuckProcessingCount,
    emailNotConfiguredCount,
    emailAuthOrConfigCount,
    recentEmailFailureCount,
    emailSettings,
    enabledRules,
    recentChannelHealth,
  ] = await Promise.all([
    countByStatus(organizationId),
    getTerminalFailureCount(organizationId),
    getStaleRetryableFailureCount(organizationId, staleCutoff),
    getRetryBacklogCount(organizationId, now),
    getStuckProcessingCount(organizationId, stuckCutoff),
    getEmailFailureCountByExactReason(organizationId, PROVIDER_NOT_CONFIGURED_REASON),
    getEmailFailureCountByKeywords(organizationId, AUTH_OR_CONFIG_KEYWORDS, PROVIDER_NOT_CONFIGURED_REASON),
    getRecentEmailFailureCount(organizationId, recentEmailFailureSince),
    findEmailSettings(organizationId),
    findManyRules(organizationId),
    getChannelHealth(organizationId, channelHealthWindowStart, now),
  ]);

  const items: DeliveryOperationsWatchlistItem[] = [];

  // CRITICAL
  if (terminalFailureCount > 0) {
    items.push({
      id: "terminal-failures",
      severity: "CRITICAL",
      type: "TERMINAL_FAILURES",
      count: terminalFailureCount,
      description: `${terminalFailureCount} entrega(s) falharam permanentemente (tentativas esgotadas).`,
      recommendedAction: RECOMMENDED_ACTIONS.VIEW_FAILED.label,
      link: RECOMMENDED_ACTIONS.VIEW_FAILED.link,
    });
  }
  if (emailNotConfiguredCount > 0) {
    items.push({
      id: "email-not-configured",
      severity: "CRITICAL",
      type: "EMAIL_PROVIDER_NOT_CONFIGURED",
      channel: "EMAIL",
      count: emailNotConfiguredCount,
      description: `${emailNotConfiguredCount} falha(s) de email por fornecedor não configurado.`,
      recommendedAction: RECOMMENDED_ACTIONS.OPEN_EMAIL_SETTINGS.label,
      link: RECOMMENDED_ACTIONS.OPEN_EMAIL_SETTINGS.link,
    });
  }
  if (emailAuthOrConfigCount > 0) {
    items.push({
      id: "email-auth-or-config-issue",
      severity: "CRITICAL",
      type: "EMAIL_AUTH_OR_CONFIG_ISSUE",
      channel: "EMAIL",
      count: emailAuthOrConfigCount,
      description: `${emailAuthOrConfigCount} falha(s) de email por erro de autenticação ou configuração SMTP.`,
      recommendedAction: RECOMMENDED_ACTIONS.OPEN_EMAIL_SETTINGS.label,
      link: RECOMMENDED_ACTIONS.OPEN_EMAIL_SETTINGS.link,
    });
  }
  if (emailSettings?.isEnabled && recentEmailFailureCount >= EMAIL_REPEATED_FAILURE_THRESHOLD) {
    items.push({
      id: "email-enabled-but-repeatedly-failing",
      severity: "CRITICAL",
      type: "EMAIL_ENABLED_BUT_REPEATEDLY_FAILING",
      channel: "EMAIL",
      count: recentEmailFailureCount,
      description: `Email está ativo mas falhou ${recentEmailFailureCount} vez(es) nas últimas 24 horas.`,
      recommendedAction: RECOMMENDED_ACTIONS.OPEN_EMAIL_SETTINGS.label,
      link: RECOMMENDED_ACTIONS.OPEN_EMAIL_SETTINGS.link,
    });
  }

  // HIGH
  if (staleRetryableFailureCount > 0) {
    items.push({
      id: "stale-retryable-failures",
      severity: "HIGH",
      type: "STALE_RETRYABLE_FAILURES",
      count: staleRetryableFailureCount,
      description: `${staleRetryableFailureCount} entrega(s) falhada(s) há mais de 24 horas continuam por reenviar.`,
      recommendedAction: RECOMMENDED_ACTIONS.RETRY_FAILED.label,
      link: RECOMMENDED_ACTIONS.RETRY_FAILED.link,
    });
  }
  if (retryBacklogCount > RETRY_BACKLOG_THRESHOLD) {
    items.push({
      id: "retry-backlog-high",
      severity: "HIGH",
      type: "RETRY_BACKLOG_HIGH",
      count: retryBacklogCount,
      description: `Lista de reenvio com ${retryBacklogCount} entrega(s) — acima do limite operacional de ${RETRY_BACKLOG_THRESHOLD}.`,
      recommendedAction: RECOMMENDED_ACTIONS.RETRY_FAILED.label,
      link: RECOMMENDED_ACTIONS.RETRY_FAILED.link,
    });
  }
  if (stuckProcessingCount > 0) {
    items.push({
      id: "stuck-processing",
      severity: "HIGH",
      type: "STUCK_PROCESSING",
      count: stuckProcessingCount,
      description: `${stuckProcessingCount} entrega(s) em processamento há mais de ${STUCK_PROCESSING_MINUTES} minutos.`,
      recommendedAction: RECOMMENDED_ACTIONS.VIEW_PROCESSING.label,
      link: RECOMMENDED_ACTIONS.VIEW_PROCESSING.link,
    });
  }

  // MEDIUM
  const enabledEmailRuleCount = enabledRules.filter((rule) => rule.channels.includes("EMAIL")).length;
  if (!emailSettings?.isEnabled && enabledEmailRuleCount > 0) {
    items.push({
      id: "email-disabled-but-rule-enabled",
      severity: "MEDIUM",
      type: "EMAIL_DISABLED_BUT_RULE_ENABLED",
      channel: "EMAIL",
      count: enabledEmailRuleCount,
      description: `${enabledEmailRuleCount} regra(s) com o canal Email ativo, mas o fornecedor de email está desativado.`,
      recommendedAction: RECOMMENDED_ACTIONS.OPEN_RULES.label,
      link: RECOMMENDED_ACTIONS.OPEN_RULES.link,
    });
  }
  for (const point of recentChannelHealth) {
    if (point.channel === "IN_APP") continue;
    const volume = point.successCount + point.failureCount;
    const failureRate = 100 - point.successRate;
    if (volume >= CHANNEL_MIN_VOLUME && failureRate > CHANNEL_FAILURE_RATE_THRESHOLD_PCT) {
      items.push({
        id: `high-channel-failure-rate-${point.channel}`,
        severity: "MEDIUM",
        type: "HIGH_CHANNEL_FAILURE_RATE",
        channel: point.channel,
        count: point.failureCount,
        description: `Canal ${point.channel} com taxa de falha de ${failureRate.toFixed(0)}% nos últimos ${CHANNEL_HEALTH_WINDOW_DAYS} dias.`,
        recommendedAction: RECOMMENDED_ACTIONS.VIEW_FAILED.label,
        link: viewChannelLink(point.channel),
      });
    }
  }

  // LOW
  const pendingCount = currentCounts.PENDING ?? 0;
  if (pendingCount > HIGH_PENDING_VOLUME_THRESHOLD) {
    items.push({
      id: "high-pending-volume",
      severity: "LOW",
      type: "HIGH_PENDING_VOLUME",
      count: pendingCount,
      description: `Fila de pendentes com ${pendingCount} entrega(s) — volume elevado mas sob controlo.`,
      recommendedAction: RECOMMENDED_ACTIONS.VIEW_PENDING.label,
      link: RECOMMENDED_ACTIONS.VIEW_PENDING.link,
    });
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// =============================================================================
// TABLE — Recent Problem Deliveries
// =============================================================================

export async function getProblemDeliveries(
  organizationId: string,
  filters: ProblemDeliveryFilters
): Promise<PaginatedResult<ProblemDeliveryRow>> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const { data, total } = await getProblemDeliveriesRepo(organizationId, { ...filters, page, pageSize });
  return buildPaginationMeta(data, total, { page, pageSize });
}
