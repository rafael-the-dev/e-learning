import { listEventCatalog, defaultPriorityForSeverity } from "@/modules/notifications/catalog/notification-event-catalog";
import { findEventRule, createEventRule } from "@/modules/notifications/repositories/notification-event-rule.repository";
import { templateExistsForEvent, createTemplate } from "@/modules/notifications/repositories/notification-template.repository";
import { NotificationChannel } from "@/shared/types/common";

// =============================================================================
// DEFAULT NOTIFICATION CONFIG SEEDING
// Idempotent — safe to call repeatedly (db:seed re-runs, new-org creation).
// Creates exactly one NotificationEventRule and one NotificationTemplate
// (IN_APP) per catalog event, only for events the org doesn't already have
// one for. Never overwrites an admin's existing customization.
// =============================================================================

export async function ensureDefaultNotificationConfig(organizationId: string): Promise<void> {
  for (const event of listEventCatalog()) {
    const existingRule = await findEventRule(organizationId, event.eventType);
    if (!existingRule) {
      await createEventRule(organizationId, {
        eventType: event.eventType,
        enabled: true,
        channels: [NotificationChannel.IN_APP],
        dedupeWindowMinutes: 1440,
        delayMinutes: 0,
        priority: defaultPriorityForSeverity(event.defaultSeverity),
      });
    }

    const hasTemplate = await templateExistsForEvent(organizationId, event.eventType, NotificationChannel.IN_APP);
    if (!hasTemplate) {
      await createTemplate(organizationId, {
        eventType: event.eventType,
        channel: NotificationChannel.IN_APP,
        name: `${event.label} (padrão)`,
        titleTemplate: event.defaultTitleTemplate,
        bodyTemplate: event.defaultBodyTemplate,
      });
    }
  }
}
