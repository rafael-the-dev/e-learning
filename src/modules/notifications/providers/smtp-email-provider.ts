import nodemailer from "nodemailer";
import {
  bridgeSend,
  validateSendEmailInput,
  type EmailProvider,
  type SendEmailInput,
  type SendEmailResult,
} from "@/modules/notifications/providers/email-provider";
import type { SendNotificationInput, SendNotificationResult } from "@/modules/notifications/providers/notification-provider";

// =============================================================================
// SMTP EMAIL PROVIDER (PHASE 3.2B)
// The first real EmailProvider implementation — sends through nodemailer
// against an organization's own SMTP credentials (NotificationEmailSettings,
// decrypted by the provider registry before this class is constructed).
// Never throws on a send failure: every nodemailer error is caught and
// mapped to a safe, Portuguese-language SendEmailResult — see mapSendError.
// =============================================================================

export interface SmtpProviderConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
}

const UNKNOWN_FAILURE_MESSAGE = "Falha desconhecida ao enviar o email";

interface NodemailerErrorShape {
  code?: string;
  responseCode?: number;
  message?: string;
}

/**
 * Maps a nodemailer/SMTP transport error onto one of the categories the
 * admin "Entregas" tab is expected to surface (spec §10) — auth failure,
 * connection failure, rate limiting, or an unknown fallback. Never includes
 * the raw error/stack: that could leak transport internals (host, banner
 * text) into a failureReason shown directly to an organization's admin.
 */
function mapSendError(error: unknown): { errorCode: string; errorMessage: string } {
  const err = error as NodemailerErrorShape | undefined;

  if (err?.code === "EAUTH") {
    return { errorCode: "SMTP_AUTH_FAILED", errorMessage: "Falha de autenticação SMTP" };
  }
  if (err?.code && ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS"].includes(err.code)) {
    return { errorCode: "SMTP_CONNECTION_FAILED", errorMessage: "Falha de ligação ao servidor SMTP" };
  }
  if (err?.responseCode === 421 || err?.responseCode === 450 || err?.responseCode === 451) {
    return { errorCode: "RATE_LIMITED", errorMessage: "Limite de envio excedido" };
  }
  return { errorCode: "UNKNOWN_FAILURE", errorMessage: UNKNOWN_FAILURE_MESSAGE };
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";

  constructor(private readonly config: SmtpProviderConfig) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const validationError = validateSendEmailInput(input);
    if (validationError) {
      return {
        success: false,
        provider: this.name,
        errorCode: validationError,
        errorMessage: validationError === "INVALID_RECIPIENT" ? "Destinatário de email inválido" : "Conteúdo de email inválido",
      };
    }

    const transport = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.username, pass: this.config.password },
    });

    try {
      const info = await transport.sendMail({
        from: input.from ?? `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo ?? this.config.replyTo ?? undefined,
      });

      return { success: true, provider: this.name, providerMessageId: info.messageId };
    } catch (error) {
      const { errorCode, errorMessage } = mapSendError(error);
      return { success: false, provider: this.name, errorCode, errorMessage };
    }
  }

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    return bridgeSend(this, input);
  }
}
