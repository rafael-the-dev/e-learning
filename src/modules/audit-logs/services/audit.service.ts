import { getDb } from "@/server/db";
import type { AuditAction, ServiceContext } from "@/shared/types/common";

// =============================================================================
// AUDIT SERVICE
// Every critical mutation calls AuditService.log() before returning.
// oldValues / newValues are serialized JSON for queryability.
// =============================================================================

interface AuditLogInput {
  entity: string;
  entityId: string;
  action: AuditAction | string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

export class AuditService {
  async log(
    context: ServiceContext,
    input: AuditLogInput
  ): Promise<void> {
    const db = await getDb();
    await db.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorId: context.userId,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        oldValues: input.oldValues ? JSON.stringify(input.oldValues) : null,
        newValues: input.newValues ? JSON.stringify(input.newValues) : null,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }
}

export const auditService = new AuditService();
