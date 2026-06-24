import type {
  NotificationProvider,
  SendNotificationInput,
  SendNotificationResult,
} from "@/modules/notifications/providers/notification-provider";

// =============================================================================
// EMAIL PROVIDER (PHASE 3.2A)
// EmailProvider adds a strongly-typed sendEmail() on top of the
// channel-agnostic NotificationProvider.send() — concrete providers
// (Phase 3.2B: SMTP/Resend/Microsoft Graph) implement sendEmail(), while
// send() is what the dispatcher actually calls. NoopEmailProvider is the
// only implementation here; it never sends anything, by design.
// =============================================================================

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  metadata?: Record<string, unknown> | null;
}

export interface SendEmailResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: unknown;
}

export interface EmailProvider extends NotificationProvider {
  readonly name: string;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Pure shape/content check, run before any provider (real or noop) is
 * invoked — a malformed payload should never reach a real provider's API
 * call in Phase 3.2B, and should fail with a distinct reason from
 * "provider not configured" today.
 */
export function validateSendEmailInput(input: SendEmailInput): string | null {
  if (!input.to || !EMAIL_PATTERN.test(input.to)) return "INVALID_RECIPIENT";
  if (!input.subject?.trim()) return "MISSING_SUBJECT";
  if (!input.text?.trim()) return "MISSING_BODY";
  return null;
}

/**
 * Bridges any `EmailProvider.sendEmail()` into the channel-agnostic
 * `NotificationProvider.send()` contract: validates first, then maps a bare
 * `SendEmailResult` onto `SendNotificationResult`. Shared by every concrete
 * `EmailProvider` (`NoopEmailProvider`, `SmtpEmailProvider`, Phase 3.2B) so
 * the validation + status-mapping rules live in exactly one place.
 *
 * `errorMessage` on the returned result is an internal diagnostic string by
 * default, not UI copy — the dispatcher's failure-reason mapping
 * (`notification-dispatcher.service.ts`) is the only thing allowed to turn a
 * provider result into the Portuguese text that lands in the admin
 * "Entregas" tab; a real provider's `errorMessage` (e.g. SMTP's own error
 * text) must go through that same mapping rather than being rendered raw.
 */
export async function bridgeSend(
  provider: EmailProvider,
  input: SendNotificationInput
): Promise<SendNotificationResult> {
  const emailInput: SendEmailInput = {
    to: input.recipient,
    subject: input.subject ?? input.title,
    text: input.body,
    metadata: input.metadata,
  };

  const validationError = validateSendEmailInput(emailInput);
  if (validationError) {
    return {
      success: false,
      provider: provider.name,
      status: "FAILED",
      errorCode: validationError,
      errorMessage: "Conteúdo de email inválido para envio",
    };
  }

  const result = await provider.sendEmail(emailInput);
  return {
    success: result.success,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    // A bare SendEmailResult carries no delivery-confirmation signal, so a
    // successful send can only ever mean "handed off to the provider"
    // (SENT) — DELIVERED requires an explicit confirmation channel
    // (webhook/provider callback) no concrete EmailProvider implements yet.
    status: result.success ? "SENT" : "FAILED",
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    rawResponse: result.rawResponse,
  };
}

export class NoopEmailProvider implements EmailProvider {
  readonly name = "noop-email";

  /**
   * `errorMessage` here is an internal diagnostic string, not UI copy — see
   * `bridgeSend`'s doc comment above.
   */
  async sendEmail(_input: SendEmailInput): Promise<SendEmailResult> {
    return {
      success: false,
      provider: this.name,
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "Fornecedor de email não está configurado",
    };
  }

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    return bridgeSend(this, input);
  }
}
