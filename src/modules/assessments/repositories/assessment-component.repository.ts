import { getDb } from "@/server/db";
import type { AssessmentComponent } from "@/modules/assessments/types";

const componentSelect = {
  id: true,
  organizationId: true,
  assessmentPolicyId: true,
  name: true,
  componentType: true,
  weight: true,
  order: true,
  isRequired: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

function mapToComponent(row: any): AssessmentComponent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assessmentPolicyId: row.assessmentPolicyId,
    name: row.name,
    componentType: row.componentType,
    weight: Number(row.weight),
    order: row.order,
    isRequired: row.isRequired,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export async function findComponentsByPolicy(
  assessmentPolicyId: string,
  organizationId: string
): Promise<AssessmentComponent[]> {
  const db = await getDb();
  const rows = await db.assessmentComponent.findMany({
    where: { assessmentPolicyId, organizationId, deletedAt: null },
    select: componentSelect,
    orderBy: [{ order: "asc" }],
  });
  return rows.map(mapToComponent);
}

export async function findActiveComponentsByPolicy(
  assessmentPolicyId: string,
  organizationId: string
): Promise<AssessmentComponent[]> {
  const db = await getDb();
  const rows = await db.assessmentComponent.findMany({
    where: { assessmentPolicyId, organizationId, status: "ACTIVE", deletedAt: null },
    select: componentSelect,
    orderBy: [{ order: "asc" }],
  });
  return rows.map(mapToComponent);
}

export async function findComponentById(
  id: string,
  organizationId: string
): Promise<AssessmentComponent | null> {
  const db = await getDb();
  const row = await db.assessmentComponent.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: componentSelect,
  });
  return row ? mapToComponent(row) : null;
}

export async function createAssessmentComponent(data: {
  organizationId: string;
  assessmentPolicyId: string;
  name: string;
  componentType: string;
  weight: number;
  order: number;
  isRequired: boolean;
}): Promise<AssessmentComponent> {
  const db = await getDb();
  const row = await db.assessmentComponent.create({
    data: {
      organizationId: data.organizationId,
      assessmentPolicyId: data.assessmentPolicyId,
      name: data.name,
      componentType: data.componentType,
      weight: data.weight,
      order: data.order,
      isRequired: data.isRequired,
      status: "ACTIVE",
    },
    select: componentSelect,
  });
  return mapToComponent(row);
}

export async function updateAssessmentComponent(
  id: string,
  organizationId: string,
  data: Partial<{
    name: string;
    componentType: string;
    weight: number;
    order: number;
    isRequired: boolean;
    status: string;
  }>
): Promise<AssessmentComponent> {
  const db = await getDb();
  const row = await db.assessmentComponent.update({
    where: { id },
    data,
    select: componentSelect,
  });
  return mapToComponent(row);
}
