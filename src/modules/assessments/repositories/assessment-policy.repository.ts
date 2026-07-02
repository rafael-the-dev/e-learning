import { getDb, type PrismaClientOrTx } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { AssessmentPolicy, ListAssessmentPoliciesParams } from "@/modules/assessments/types";

const policySelect = {
  id: true,
  organizationId: true,
  levelSubjectId: true,
  name: true,
  description: true,
  calculationMethod: true,
  roundingMethod: true,
  minimumPassingGrade: true,
  allowRetake: true,
  maxRetakes: true,
  allowRecovery: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  levelSubject: {
    select: {
      id: true,
      subject: { select: { name: true } },
      courseLevel: { select: { name: true } },
    },
  },
  _count: { select: { components: { where: { deletedAt: null, status: "ACTIVE" } } } },
} as const;

function mapToPolicy(row: any): AssessmentPolicy {
  return {
    id: row.id,
    organizationId: row.organizationId,
    levelSubjectId: row.levelSubjectId,
    name: row.name,
    description: row.description,
    calculationMethod: row.calculationMethod,
    roundingMethod: row.roundingMethod,
    minimumPassingGrade: Number(row.minimumPassingGrade),
    allowRetake: row.allowRetake,
    maxRetakes: row.maxRetakes,
    allowRecovery: row.allowRecovery,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    subjectName: row.levelSubject?.subject?.name ?? null,
    courseLevelName: row.levelSubject?.courseLevel?.name ?? null,
    componentsCount: row._count?.components ?? 0,
  };
}

export async function findAssessmentPoliciesByOrganization(
  organizationId: string,
  params: ListAssessmentPoliciesParams
): Promise<PaginatedResult<AssessmentPolicy>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where: any = { organizationId, deletedAt: null };
  if (params.status) where.status = params.status;
  if (params.levelSubjectId) where.levelSubjectId = params.levelSubjectId;
  if (params.search) {
    where.name = { contains: params.search };
  }

  const [rows, total] = await Promise.all([
    db.assessmentPolicy.findMany({
      where,
      select: policySelect,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }],
    }),
    db.assessmentPolicy.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToPolicy), total, params);
}

export async function findAssessmentPolicyById(
  id: string,
  organizationId: string
): Promise<AssessmentPolicy | null> {
  const db = await getDb();
  const row = await db.assessmentPolicy.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: policySelect,
  });
  return row ? mapToPolicy(row) : null;
}

export async function findActivePolicyForLevelSubject(
  levelSubjectId: string,
  organizationId: string,
  client?: PrismaClientOrTx
): Promise<AssessmentPolicy | null> {
  const db = client ?? await getDb();
  const row = await db.assessmentPolicy.findFirst({
    where: { levelSubjectId, organizationId, status: "ACTIVE", deletedAt: null },
    select: policySelect,
  });
  return row ? mapToPolicy(row) : null;
}

export async function createAssessmentPolicy(data: {
  organizationId: string;
  levelSubjectId: string;
  name: string;
  description?: string | null;
  calculationMethod: string;
  roundingMethod: string;
  minimumPassingGrade: number;
  allowRetake: boolean;
  maxRetakes: number;
  allowRecovery: boolean;
}): Promise<AssessmentPolicy> {
  const db = await getDb();
  const row = await db.assessmentPolicy.create({
    data: {
      organizationId: data.organizationId,
      levelSubjectId: data.levelSubjectId,
      name: data.name,
      description: data.description ?? null,
      calculationMethod: data.calculationMethod,
      roundingMethod: data.roundingMethod,
      minimumPassingGrade: data.minimumPassingGrade,
      allowRetake: data.allowRetake,
      maxRetakes: data.maxRetakes,
      allowRecovery: data.allowRecovery,
      status: "INACTIVE",
    },
    select: policySelect,
  });
  return mapToPolicy(row);
}

export async function updateAssessmentPolicy(
  id: string,
  organizationId: string,
  data: Partial<{
    name: string;
    description: string | null;
    calculationMethod: string;
    roundingMethod: string;
    minimumPassingGrade: number;
    allowRetake: boolean;
    maxRetakes: number;
    allowRecovery: boolean;
    status: string;
  }>
): Promise<AssessmentPolicy> {
  const db = await getDb();
  const row = await db.assessmentPolicy.update({
    where: { id },
    data,
    select: policySelect,
  });
  return mapToPolicy(row);
}
