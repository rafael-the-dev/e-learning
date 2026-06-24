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

// Bounds worst-case latency for a single send — without these, a hung/slow
// SMTP host can block a synchronous dispatch run (and the HTTP route behind
// it) for nodemailer's much longer defaults (~2 minutes per phase).
export const SMTP_CONNECTION_TIMEOUT_MS = 15000;
export const SMTP_GREETING_TIMEOUT_MS = 15000;
export const SMTP_SOCKET_TIMEOUT_MS = 15000;

const TLS_CERT_ERROR_CODES = [
  "EPROTO",
  "CERT_HAS_EXPIRED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
];
const CONNECTION_ERROR_CODES = ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "EDNS"];

interface NodemailerErrorShape {
  code?: string;
  responseCode?: number;
  message?: string;
}

/**
 * Maps a nodemailer/SMTP transport error onto one of the categories the
 * admin "Entregas" tab is expected to surface (spec §10) — auth failure,
 * TLS/certificate failure, connection failure, rate limiting, or an unknown
 * fallback. Never includes the raw error/stack: that could leak transport
 * internals (host, banner text, certificate details) into a failureReason
 * shown directly to an organization's admin.
 */
function mapSendError(error: unknown): { errorCode: string; errorMessage: string } {
  const err = error as NodemailerErrorShape | undefined;

  if (err?.code === "EAUTH") {
    return { errorCode: "SMTP_AUTH_FAILED", errorMessage: "Falha de autenticação SMTP" };
  }
  if (err?.code && TLS_CERT_ERROR_CODES.includes(err.code)) {
    return { errorCode: "SMTP_TLS_ERROR", errorMessage: "Erro de TLS/certificado na ligação SMTP" };
  }
  if (err?.code && CONNECTION_ERROR_CODES.includes(err.code)) {
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
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      // secure=false is the typical port-587 STARTTLS case — without
      // requireTLS, nodemailer will still send if the STARTTLS upgrade is
      // stripped (downgrade to plaintext) instead of failing the send.
      // secure=true already negotiates TLS from the first byte, so this is
      // never set in that case.
      ...(this.config.secure ? {} : { requireTLS: true }),
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
    } finally {
      // Non-pooled transports auto-close after sendMail, but closing
      // explicitly is cheaper to reason about than relying on that default.
      transport.close?.();
    }
  }

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    return bridgeSend(this, input);
  }
}
