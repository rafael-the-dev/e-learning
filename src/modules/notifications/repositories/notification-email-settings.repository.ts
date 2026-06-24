import { getDb } from "@/server/db";
import type { NotificationEmailSettings } from "@/modules/notifications/types";

// =============================================================================
// NOTIFICATION EMAIL SETTINGS REPOSITORY (PHASE 3.2B)
// One row per organization. `findRawByOrganization` is the only function
// that ever returns `smtpPasswordEncrypted` — it exists solely for the
// provider registry (which decrypts it inside the provider factory and
// never returns it further). Every other read goes through `findByOrganization`,
// which maps to the public DTO and never includes the encrypted password.
// =============================================================================

export interface NotificationEmailSettingsRawRow {
  id: string;
  organizationId: string;
  providerType: string;
  isEnabled: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUsername: string | null;
  smtpPasswordEncrypted: string | null;
  smtpSecure: boolean;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertNotificationEmailSettingsData {
  providerType?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  /** undefined = leave the stored password untouched; null/string = replace it. */
  smtpPasswordEncrypted?: string | null;
  smtpSecure?: boolean;
}

function mapToDto(row: NotificationEmailSettingsRawRow): NotificationEmailSettings {
  return {
    id: row.id,
    organizationId: row.organizationId,
    providerType: row.providerType as NotificationEmailSettings["providerType"],
    isEnabled: row.isEnabled,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    replyTo: row.replyTo,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpUsername: row.smtpUsername,
    smtpSecure: row.smtpSecure,
    lastTestedAt: row.lastTestedAt,
    lastTestStatus: row.lastTestStatus as NotificationEmailSettings["lastTestStatus"],
    lastTestError: row.lastTestError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findRawByOrganization(organizationId: string): Promise<NotificationEmailSettingsRawRow | null> {
  const db = await getDb();
  const row = await db.notificationEmailSettings.findUnique({ where: { organizationId } });
  return row ?? null;
}

export async function findByOrganization(organizationId: string): Promise<NotificationEmailSettings | null> {
  const row = await findRawByOrganization(organizationId);
  return row ? mapToDto(row) : null;
}

export async function upsertByOrganization(
  organizationId: string,
  data: UpsertNotificationEmailSettingsData
): Promise<NotificationEmailSettings> {
  const db = await getDb();
  const { smtpPasswordEncrypted, ...rest } = data;

  const row = await db.notificationEmailSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      providerType: data.providerType ?? "SMTP",
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo ?? null,
      smtpHost: data.smtpHost ?? null,
      smtpPort: data.smtpPort ?? null,
      smtpUsername: data.smtpUsername ?? null,
      smtpPasswordEncrypted: smtpPasswordEncrypted ?? null,
      smtpSecure: data.smtpSecure ?? true,
    },
    update: {
      ...rest,
      ...(smtpPasswordEncrypted !== undefined ? { smtpPasswordEncrypted } : {}),
    },
  });

  return mapToDto(row);
}

export async function setEnabled(organizationId: string, isEnabled: boolean): Promise<NotificationEmailSettings> {
  const db = await getDb();
  const row = await db.notificationEmailSettings.update({
    where: { organizationId },
    data: { isEnabled },
  });
  return mapToDto(row);
}

export async function updateTestResult(
  organizationId: string,
  status: string,
  error: string | null,
  testedAt: Date
): Promise<void> {
  const db = await getDb();
  await db.notificationEmailSettings.update({
    where: { organizationId },
    data: { lastTestedAt: testedAt, lastTestStatus: status, lastTestError: error },
  });
}
