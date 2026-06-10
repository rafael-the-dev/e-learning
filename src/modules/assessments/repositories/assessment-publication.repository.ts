import { getDb } from "@/server/db";
import type { AssessmentPublication } from "@/modules/assessments/types";

const publicationSelect = {
  id: true,
  organizationId: true,
  assessmentId: true,
  publicationStatus: true,
  publishedAt: true,
  publishedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

function mapToPublication(row: any): AssessmentPublication {
  return {
    id: row.id,
    organizationId: row.organizationId,
    assessmentId: row.assessmentId,
    publicationStatus: row.publicationStatus,
    publishedAt: row.publishedAt,
    publishedByUserId: row.publishedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findPublicationByAssessment(
  assessmentId: string,
  organizationId: string
): Promise<AssessmentPublication | null> {
  const db = await getDb();
  const row = await db.assessmentPublication.findFirst({
    where: { assessmentId, organizationId },
    select: publicationSelect,
  });
  return row ? mapToPublication(row) : null;
}

export async function upsertAssessmentPublication(data: {
  organizationId: string;
  assessmentId: string;
  publicationStatus: string;
  publishedAt?: Date | null;
  publishedByUserId?: string | null;
}): Promise<AssessmentPublication> {
  const db = await getDb();
  const row = await db.assessmentPublication.upsert({
    where: { assessmentId: data.assessmentId },
    create: {
      organizationId: data.organizationId,
      assessmentId: data.assessmentId,
      publicationStatus: data.publicationStatus,
      publishedAt: data.publishedAt ?? null,
      publishedByUserId: data.publishedByUserId ?? null,
    },
    update: {
      publicationStatus: data.publicationStatus,
      publishedAt: data.publishedAt ?? null,
      publishedByUserId: data.publishedByUserId ?? null,
    },
    select: publicationSelect,
  });
  return mapToPublication(row);
}
