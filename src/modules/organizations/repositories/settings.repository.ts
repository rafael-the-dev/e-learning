import { getDb } from "@/server/db";
import type { OrganizationSettings } from "@prisma/client";

export async function findSettings(
  organizationId: string
): Promise<OrganizationSettings | null> {
  const db = await getDb();
  return db.organizationSettings.findUnique({ where: { organizationId } });
}

export async function upsertSettings(
  organizationId: string,
  data: {
    currencyCode?: string;
    currencySymbol?: string;
    dateFormat?: string;
    taxRate?: number | null;
    taxName?: string | null;
    invoicePrefix?: string;
    receiptPrefix?: string;
    allowLatePayments?: boolean;
    gracePeriodDays?: number;
  }
): Promise<OrganizationSettings> {
  const db = await getDb();
  return db.organizationSettings.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
}
