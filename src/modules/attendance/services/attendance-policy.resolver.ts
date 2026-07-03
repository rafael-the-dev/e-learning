import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { DEFAULT_ATTENDANCE_POLICY } from "@/modules/attendance/types";
import type { EffectiveAttendancePolicy } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE POLICY RESOLUTION — Attendance Engine Phase 3
//
// Resolution order (Decision #2 — interpretation only, never thresholds):
//   1. LevelSubject.attendancePolicyId (per-subject override), if set + active
//   2. the organization's default active AttendancePolicy
//   3. the deterministic DEFAULT_ATTENDANCE_POLICY fallback
//
// Calculation must NEVER fail for lack of a policy, so the fallback always wins
// when nothing else resolves.
// =============================================================================

/** Raw AttendancePolicy row shape used by the pure resolver. */
export interface RawAttendancePolicy {
  id: string;
  countExcusedAsPresent: boolean;
  countRemoteAsPresent: boolean;
  countLateAsPartial: boolean;
  atRiskBufferPercentage: unknown; // Prisma Decimal | number
  allowJustification: boolean;
  requireJustificationApproval: boolean;
  enforceAttendanceForProgress: boolean;
}

function toEffective(
  raw: RawAttendancePolicy,
  source: "LEVEL_SUBJECT" | "ORG_DEFAULT"
): EffectiveAttendancePolicy {
  return {
    countExcusedAsPresent: raw.countExcusedAsPresent,
    countRemoteAsPresent: raw.countRemoteAsPresent,
    countLateAsPartial: raw.countLateAsPartial,
    atRiskBufferPercentage: Number(raw.atRiskBufferPercentage),
    allowJustification: raw.allowJustification,
    requireJustificationApproval: raw.requireJustificationApproval,
    enforceAttendanceForProgress: raw.enforceAttendanceForProgress,
    source,
    policyId: raw.id,
  };
}

/**
 * Pure resolver: pick the effective policy from the (already-loaded) candidates.
 * Kept side-effect-free so it is trivially unit-testable.
 */
export function resolveAttendancePolicy(
  levelSubjectPolicy: RawAttendancePolicy | null,
  orgDefaultPolicy: RawAttendancePolicy | null
): EffectiveAttendancePolicy {
  if (levelSubjectPolicy) return toEffective(levelSubjectPolicy, "LEVEL_SUBJECT");
  if (orgDefaultPolicy) return toEffective(orgDefaultPolicy, "ORG_DEFAULT");
  return { ...DEFAULT_ATTENDANCE_POLICY, source: "FALLBACK", policyId: null };
}

const policySelect = {
  id: true,
  countExcusedAsPresent: true,
  countRemoteAsPresent: true,
  countLateAsPartial: true,
  atRiskBufferPercentage: true,
  allowJustification: true,
  requireJustificationApproval: true,
  enforceAttendanceForProgress: true,
} as const;

/** Load the org's default active policy (raw). Used by the period engine, which
 *  resolves a policy per levelSubject but shares one org-default fetch. */
export async function findRawOrgDefaultPolicy(
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<RawAttendancePolicy | null> {
  const db = client ?? (await getDb());
  return db.attendancePolicy.findFirst({
    where: { organizationId, isDefault: true, status: "ACTIVE", deletedAt: null },
    select: policySelect,
  });
}

/** Batch-load ACTIVE policies by id (org-scoped) → keyed map for per-subject
 *  resolution without an N+1 query. */
export async function findRawPoliciesByIds(
  organizationId: string,
  ids: string[],
  client?: PrismaClientOrTx
): Promise<Map<string, RawAttendancePolicy>> {
  const map = new Map<string, RawAttendancePolicy>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const db = client ?? (await getDb());
  const rows = await db.attendancePolicy.findMany({
    where: { id: { in: unique }, organizationId, status: "ACTIVE", deletedAt: null },
    select: policySelect,
  });
  for (const r of rows) map.set(r.id, r);
  return map;
}

/**
 * Load and resolve the effective policy for a LevelSubject. Only ACTIVE,
 * non-deleted policies are considered; anything else falls through to the next
 * tier and ultimately the fallback.
 */
export async function loadEffectiveAttendancePolicy(
  organizationId: string,
  levelSubjectPolicyId: string | null,
  client?: PrismaClientOrTx
): Promise<EffectiveAttendancePolicy> {
  const db = client ?? (await getDb());

  const [levelSubjectPolicy, orgDefaultPolicy] = await Promise.all([
    levelSubjectPolicyId
      ? db.attendancePolicy.findFirst({
          where: { id: levelSubjectPolicyId, organizationId, status: "ACTIVE", deletedAt: null },
          select: policySelect,
        })
      : Promise.resolve(null),
    db.attendancePolicy.findFirst({
      where: { organizationId, isDefault: true, status: "ACTIVE", deletedAt: null },
      select: policySelect,
    }),
  ]);

  return resolveAttendancePolicy(levelSubjectPolicy, orgDefaultPolicy);
}
