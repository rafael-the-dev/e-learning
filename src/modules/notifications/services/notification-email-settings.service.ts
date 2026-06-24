import {
  findByOrganization,
  findRawByOrganization,
  upsertByOrganization,
  setEnabled,
  updateTestResult,
  type NotificationEmailSettingsRawRow,
} from "@/modules/notifications/repositories/notification-email-settings.repository";
import { encryptSecret, decryptSecret, SecretEncryptionError } from "@/shared/lib/secret-encryption";
import { SmtpEmailProvider } from "@/modules/notifications/providers/smtp-email-provider";
import { NotificationEmailProviderType, NotificationEmailTestStatus } from "@/shared/types/common";
import { NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import type {
  NotificationEmailSettings,
  UpsertNotificationEmailSettingsInput,
  TestNotificationEmailSettingsInput,
  TestNotificationEmailSettingsResult,
} from "@/modules/notifications/types";

// =============================================================================
// NOTIFICATION EMAIL SETTINGS SERVICE (PHASE 3.2B)
// Owns the encrypt-on-write / never-decrypt-for-a-client rule: every read in
// this file returns the public DTO (see the repository's mapToDto) except
// the SMTP password, which is only ever decrypted inside testEmailSettings
// (to build a throwaway SmtpEmailProvider) — never returned to the caller.
// =============================================================================

const TEST_EMAIL_SUBJECT = "Email de teste — Notificações";
const TEST_EMAIL_BODY = "Este é um email de teste das definições de email da sua organização. Se o recebeu, a configuração SMTP está a funcionar.";

export async function getEmailSettings(organizationId: string): Promise<NotificationEmailSettings | null> {
  return findByOrganization(organizationId);
}

/**
 * Encrypts `smtpPassword` when provided; fails closed (BusinessRuleError) if
 * NOTIFICATION_SECRET_ENCRYPTION_KEY is not configured. A blank/omitted
 * password leaves the stored encrypted value untouched — this is how "leave
 * blank to keep existing password" works in the settings form.
 */
export async function upsertEmailSettings(
  organizationId: string,
  input: UpsertNotificationEmailSettingsInput
): Promise<NotificationEmailSettings> {
  let smtpPasswordEncrypted: string | undefined;

  if (input.smtpPassword) {
    try {
      smtpPasswordEncrypted = encryptSecret(input.smtpPassword);
    } catch (error) {
      if (error instanceof SecretEncryptionError) {
        throw new BusinessRuleError("Não é possível guardar a palavra-passe: encriptação não configurada no servidor");
      }
      throw error;
    }
  }

  return upsertByOrganization(organizationId, {
    providerType: input.providerType,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo ?? null,
    smtpHost: input.smtpHost ?? null,
    smtpPort: input.smtpPort ?? null,
    smtpUsername: input.smtpUsername ?? null,
    smtpPasswordEncrypted,
    smtpSecure: input.smtpSecure,
  });
}

async function requireSettings(organizationId: string): Promise<NotificationEmailSettings> {
  const settings = await findByOrganization(organizationId);
  if (!settings) throw new NotFoundError("NotificationEmailSettings", organizationId);
  return settings;
}

async function requireRawSettings(organizationId: string): Promise<NotificationEmailSettingsRawRow> {
  const raw = await findRawByOrganization(organizationId);
  if (!raw) throw new NotFoundError("NotificationEmailSettings", organizationId);
  return raw;
}

const REQUIRED_FIELDS_FOR_ENABLE: Array<[keyof NotificationEmailSettingsRawRow, string]> = [
  ["fromName", "nome do remetente"],
  ["fromEmail", "email do remetente"],
  ["smtpHost", "servidor SMTP"],
  ["smtpPort", "porta SMTP"],
  ["smtpUsername", "utilizador SMTP"],
  ["smtpPasswordEncrypted", "palavra-passe SMTP"],
];

/**
 * Guards against enabling a half-configured (or unsupported-provider)
 * settings row — without this, the registry would silently fall back to
 * NoopEmailProvider at send time, which is safe but leaves "Email ativo"
 * toggled on with nothing actually working. `smtpPasswordEncrypted` already
 * covers "password provided at some point" — a fresh password always goes
 * through `upsertEmailSettings` (which encrypts it onto this same column)
 * before `enableEmailSettings` is ever called separately, so there is no
 * extra "or new password" input to thread through here.
 */
function assertCompleteForEnable(raw: NotificationEmailSettingsRawRow): void {
  if (raw.providerType === NotificationEmailProviderType.MICROSOFT_GRAPH) {
    throw new BusinessRuleError("Microsoft Graph ainda não está disponível.");
  }
  if (raw.providerType !== NotificationEmailProviderType.SMTP) {
    throw new BusinessRuleError("Fornecedor de email não suportado.");
  }

  const missing = REQUIRED_FIELDS_FOR_ENABLE.filter(([field]) => !raw[field]).map(([, label]) => label);
  if (missing.length > 0) {
    throw new BusinessRuleError(`Configuração de email incompleta. Em falta: ${missing.join(", ")}.`);
  }
}

export async function enableEmailSettings(organizationId: string): Promise<NotificationEmailSettings> {
  const raw = await requireRawSettings(organizationId);
  assertCompleteForEnable(raw);
  return setEnabled(organizationId, true);
}

export async function disableEmailSettings(organizationId: string): Promise<NotificationEmailSettings> {
  await requireSettings(organizationId);
  return setEnabled(organizationId, false);
}

/**
 * Sends a real test email using `input` as given — a draft the admin is
 * still editing, not necessarily what's saved. A blank `smtpPassword` falls
 * back to the saved settings' decrypted password (so testing an
 * already-saved configuration doesn't require retyping it). Persists
 * lastTestedAt/lastTestStatus/lastTestError only when a settings row already
 * exists; never creates a Notification or NotificationDelivery row.
 */
export async function testEmailSettings(
  organizationId: string,
  input: TestNotificationEmailSettingsInput,
  recipientEmail: string
): Promise<TestNotificationEmailSettingsResult> {
  const result = await sendTestEmail(organizationId, input, recipientEmail);

  const existing = await findRawByOrganization(organizationId);
  if (existing) {
    await updateTestResult(
      organizationId,
      result.success ? NotificationEmailTestStatus.SUCCESS : NotificationEmailTestStatus.FAILED,
      result.errorMessage ?? null,
      new Date()
    );
  }

  return result;
}

async function sendTestEmail(
  organizationId: string,
  input: TestNotificationEmailSettingsInput,
  recipientEmail: string
): Promise<TestNotificationEmailSettingsResult> {
  if ((input.providerType ?? NotificationEmailProviderType.SMTP) === NotificationEmailProviderType.MICROSOFT_GRAPH) {
    return { success: false, errorMessage: "Fornecedor Microsoft Graph ainda não está disponível" };
  }

  if (!input.smtpHost || !input.smtpPort || !input.smtpUsername) {
    return { success: false, errorMessage: "Configuração SMTP incompleta" };
  }

  const password = await resolvePassword(organizationId, input.smtpPassword);
  if (!password) {
    return { success: false, errorMessage: "Palavra-passe SMTP não fornecida" };
  }

  const provider = new SmtpEmailProvider({
    host: input.smtpHost,
    port: input.smtpPort,
    secure: input.smtpSecure ?? true,
    username: input.smtpUsername,
    password,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo,
  });

  const sendResult = await provider.sendEmail({
    to: recipientEmail,
    subject: TEST_EMAIL_SUBJECT,
    text: TEST_EMAIL_BODY,
  });

  return { success: sendResult.success, errorMessage: sendResult.errorMessage };
}

async function resolvePassword(organizationId: string, draftPassword?: string | null): Promise<string | null> {
  if (draftPassword) return draftPassword;

  const existing = await findRawByOrganization(organizationId);
  if (!existing?.smtpPasswordEncrypted) return null;

  try {
    return decryptSecret(existing.smtpPasswordEncrypted);
  } catch {
    return null;
  }
}
