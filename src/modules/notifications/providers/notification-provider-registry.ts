import { NotificationChannel, NotificationEmailProviderType } from "@/shared/types/common";
import type {
  NotificationProvider,
  SendNotificationInput,
  SendNotificationResult,
} from "@/modules/notifications/providers/notification-provider";
import { NoopEmailProvider, type EmailProvider } from "@/modules/notifications/providers/email-provider";
import { SmtpEmailProvider } from "@/modules/notifications/providers/smtp-email-provider";
import { findRawByOrganization } from "@/modules/notifications/repositories/notification-email-settings.repository";
import { decryptSecret } from "@/shared/lib/secret-encryption";

// =============================================================================
// PROVIDER REGISTRY (PHASE 3.2A skeleton, DB-backed since PHASE 3.2B)
// getProvider() is now async — EMAIL looks up the organization's
// NotificationEmailSettings and decrypts its SMTP password here (the only
// place that ever decrypts it). Missing/disabled settings, an unimplemented
// providerType (MICROSOFT_GRAPH), or a decryption failure all fall back to
// NoopEmailProvider — never a thrown error. IN_APP is never actually routed
// through here today (the dispatcher short-circuits it), but a no-op
// provider exists so getProvider() is total over every NotificationChannel.
// =============================================================================

class NoopInAppProvider implements NotificationProvider {
  readonly name = "noop-in-app";

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    return {
      success: true,
      provider: this.name,
      providerMessageId: input.deliveryId,
      status: "DELIVERED",
    };
  }
}

class NotConfiguredProvider implements NotificationProvider {
  constructor(private readonly channel: string) {}

  /**
   * `errorMessage` is an internal diagnostic string, not UI copy — the
   * dispatcher's failure-reason mapping is what produces the Portuguese
   * text shown in the admin "Entregas" tab; this message is never
   * rendered raw.
   */
  async send(_input: SendNotificationInput): Promise<SendNotificationResult> {
    return {
      success: false,
      provider: `not-configured-${this.channel.toLowerCase()}`,
      status: "FAILED",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: `Não existe fornecedor configurado para o canal ${this.channel}`,
    };
  }
}

export async function getProvider(channel: NotificationChannel, organizationId: string): Promise<NotificationProvider> {
  switch (channel) {
    case NotificationChannel.IN_APP:
      return new NoopInAppProvider();
    case NotificationChannel.EMAIL:
      return getEmailProvider(organizationId);
    case NotificationChannel.WHATSAPP:
    case NotificationChannel.SMS:
    case NotificationChannel.PUSH:
    default:
      return new NotConfiguredProvider(channel);
  }
}

/**
 * Resolves the EMAIL provider from the organization's own
 * NotificationEmailSettings. Every "can't actually send" case (no row,
 * disabled, unimplemented providerType, incomplete SMTP fields, or a
 * decryption failure) falls back to NoopEmailProvider rather than throwing —
 * the dispatcher already knows how to turn that into a clear FAILED reason.
 */
async function getEmailProvider(organizationId: string): Promise<EmailProvider> {
  const settings = await findRawByOrganization(organizationId);
  if (!settings || !settings.isEnabled) {
    return new NoopEmailProvider();
  }

  if (settings.providerType === NotificationEmailProviderType.MICROSOFT_GRAPH) {
    // Reserved for a future provider — see docs/notifications-center.md.
    return new NoopEmailProvider();
  }

  if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUsername || !settings.smtpPasswordEncrypted) {
    return new NoopEmailProvider();
  }

  let password: string;
  try {
    password = decryptSecret(settings.smtpPasswordEncrypted);
  } catch {
    return new NoopEmailProvider();
  }

  return new SmtpEmailProvider({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    username: settings.smtpUsername,
    password,
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
    replyTo: settings.replyTo,
  });
}
