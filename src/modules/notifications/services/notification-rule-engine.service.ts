import { findEventRule } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { findActiveTemplate } from "@/modules/notifications/repositories/notification-template.repository";
import { getEventCatalogEntry, type NotificationEventDefinition } from "@/modules/notifications/catalog/notification-event-catalog";
import { NotificationChannel } from "@/shared/types/common";
import type { NotificationEventRule } from "@/modules/notifications/types";

// =============================================================================
// NOTIFICATION RULE ENGINE
// Resolves "what should happen for this event, in this org" — the rule
// (enabled? which channels? dedupe/delay/priority?) plus the template text
// to render. delayMinutes is returned but never acted upon here: there is
// no dispatcher in Phase 2 to delay against.
// =============================================================================

export type TemplateSource = "ORG_TEMPLATE" | "CATALOG_DEFAULT";

export interface ResolvedNotificationConfig {
  rule: NotificationEventRule;
  catalogEntry: NotificationEventDefinition;
  titleTemplate: string;
  bodyTemplate: string;
  templateSource: TemplateSource;
}

function warnInDev(message: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[notifications] ${message}`);
  }
}

export async function resolveNotificationConfig(
  organizationId: string,
  eventType: string,
  channel: string = NotificationChannel.IN_APP
): Promise<ResolvedNotificationConfig | null> {
  const catalogEntry = getEventCatalogEntry(eventType);
  if (!catalogEntry) {
    warnInDev(`"${eventType}" has no catalog entry — skipping notification`);
    return null;
  }

  const rule = await findEventRule(organizationId, eventType);
  if (!rule) {
    warnInDev(`no NotificationEventRule for "${eventType}" in org ${organizationId} — skipping notification`);
    return null;
  }

  if (!rule.enabled) return null;
  if (!rule.channels.includes(channel as NotificationEventRule["channels"][number])) return null;

  const orgTemplate = await findActiveTemplate(organizationId, eventType, channel);
  if (orgTemplate) {
    return {
      rule,
      catalogEntry,
      titleTemplate: orgTemplate.titleTemplate,
      bodyTemplate: orgTemplate.bodyTemplate,
      templateSource: "ORG_TEMPLATE",
    };
  }

  return {
    rule,
    catalogEntry,
    titleTemplate: catalogEntry.defaultTitleTemplate,
    bodyTemplate: catalogEntry.defaultBodyTemplate,
    templateSource: "CATALOG_DEFAULT",
  };
}
