import { getDb } from "@/server/db";
import { findAssessmentsByOrganization } from "@/modules/assessments/repositories/assessment.repository";
import { ASSESSMENT_COMPONENT_TYPE_LABELS } from "@/modules/assessments/types";
import type { PaginatedResult } from "@/shared/types/common";
import type { ListAssessmentsParams } from "@/modules/assessments/types";

const PT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssessmentKPIs {
  totalAssessments: number;
  scheduledCount: number;
  openCount: number;
  gradedCount: number;
  // OPEN assessments that have at least 1 result still PENDING or SUBMITTED
  awaitingGradingCount: number;
  // AssessmentRetake rows with status REQUESTED
  pendingRetakesCount: number;
  // GRADED assessments whose publication.publicationStatus = READY
  readyToPublishCount: number;
  // Average of StudentAssessmentResult.normalizedGrade (the canonical grade store)
  // for scheduled-event results (assessmentEventId set), status = GRADED.
  avgNormalizedScore: number | null;
}

export interface AssessmentTrend {
  month: string;
  scheduled: number;
  graded: number;
  published: number;
}

export interface AssessmentStatusItem {
  status: string;
  count: number;
}

export interface ComponentTypeItem {
  componentType: string;
  label: string;
  count: number;
}

export interface TeacherPendingItem {
  teacherName: string;
  openCount: number;
}

export interface PublicationStatusItem {
  status: string;
  count: number;
}

// Enriched row for the dashboard table
export interface AssessmentDashboardRow {
  id: string;
  title: string;
  componentName: string | null;
  componentType: string | null;
  classGroupName: string | null;
  teacherName: string | null;
  periodName: string | null;
  assessmentDate: Date;
  maxScore: number;
  status: string;
  // Total AssessmentResult rows for this assessment
  totalResultsCount: number;
  // Rows with status = GRADED
  gradedResultsCount: number;
  // From AssessmentPublication, null if no publication record
  publicationStatus: string | null;
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function getAssessmentKPIs(organizationId: string): Promise<AssessmentKPIs> {
  const db = await getDb();

  const [statusGroups, awaitingGrading, pendingRetakes, readyToPublish, avgScore] =
    await Promise.all([
      db.assessment.groupBy({
        by: ["status"],
        where: { organizationId, deletedAt: null },
        _count: { _all: true },
      }),
      // OPEN assessments with at least 1 ungraded result
      db.assessment.count({
        where: {
          organizationId,
          deletedAt: null,
          status: "OPEN",
          results: {
            some: { status: { in: ["PENDING", "SUBMITTED"] }, deletedAt: null },
          },
        },
      }),
      db.assessmentRetake.count({
        where: { organizationId, status: "REQUESTED" },
      }),
      // GRADED assessments whose results are ready to publish
      db.assessment.count({
        where: {
          organizationId,
          deletedAt: null,
          status: "GRADED",
          publication: { publicationStatus: "READY" },
        },
      }),
      // General average from the canonical grade store (StudentAssessmentResult),
      // NOT the deprecated AssessmentResult.normalizedScore. Scoped to scheduled-event
      // grades (assessmentEventId set) with status GRADED, excluding CANCELLED.
      db.studentAssessmentResult.aggregate({
        where: {
          organizationId,
          status: "GRADED",
          assessmentEventId: { not: null },
          assessmentEvent: { deletedAt: null },
        },
        _avg: { normalizedGrade: true },
      }),
    ]);

  const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));

  return {
    totalAssessments: Object.values(byStatus).reduce((a, b) => a + b, 0),
    scheduledCount: byStatus["SCHEDULED"] ?? 0,
    openCount: byStatus["OPEN"] ?? 0,
    gradedCount: byStatus["GRADED"] ?? 0,
    awaitingGradingCount: awaitingGrading,
    pendingRetakesCount: pendingRetakes,
    readyToPublishCount: readyToPublish,
    avgNormalizedScore:
      avgScore._avg.normalizedGrade != null
        ? Math.round(Number(avgScore._avg.normalizedGrade) * 10) / 10
        : null,
  };
}

// ─── Multi-series trend (last 6 months) ──────────────────────────────────────

export async function getAssessmentTrend(organizationId: string): Promise<AssessmentTrend[]> {
  const db = await getDb();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [scheduledRows, gradedRows, publishedRows] = await Promise.all([
    // Scheduled: all non-cancelled assessments by assessmentDate
    db.assessment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ["CANCELLED", "ARCHIVED"] },
        assessmentDate: { gte: sixMonthsAgo },
      },
      select: { assessmentDate: true },
    }),
    // Graded: assessments with status GRADED by assessmentDate
    db.assessment.findMany({
      where: { organizationId, deletedAt: null, status: "GRADED", assessmentDate: { gte: sixMonthsAgo } },
      select: { assessmentDate: true },
    }),
    // Published: publications with publicationStatus PUBLISHED by publishedAt
    db.assessmentPublication.findMany({
      where: {
        organizationId,
        publicationStatus: "PUBLISHED",
        publishedAt: { gte: sixMonthsAgo },
      },
      select: { publishedAt: true },
    }),
  ]);

  const now = new Date();
  const months: AssessmentTrend[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();

    const inMonth = (dt: Date) => {
      const x = new Date(dt);
      return x.getFullYear() === year && x.getMonth() === month;
    };

    months.push({
      month: PT_MONTHS[month],
      scheduled: scheduledRows.filter((r) => inMonth(r.assessmentDate)).length,
      graded: gradedRows.filter((r) => inMonth(r.assessmentDate)).length,
      published: publishedRows.filter((r) => r.publishedAt && inMonth(r.publishedAt)).length,
    });
  }

  return months;
}

// ─── Status distribution (for donut) ─────────────────────────────────────────

export async function getAssessmentStatusDistribution(
  organizationId: string
): Promise<AssessmentStatusItem[]> {
  const db = await getDb();

  const groups = await db.assessment.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { _all: true },
  });

  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.status, count: g._count._all }));
}

// ─── Component type distribution (for Componentes tab) ───────────────────────

export async function getComponentTypeDistribution(
  organizationId: string
): Promise<ComponentTypeItem[]> {
  const db = await getDb();

  const rows = await db.assessment.groupBy({
    by: ["assessmentComponentId"],
    where: { organizationId, deletedAt: null, status: { notIn: ["CANCELLED", "ARCHIVED"] } },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const componentIds = rows.map((r) => r.assessmentComponentId);
  const components = await db.assessmentComponent.findMany({
    where: { id: { in: componentIds } },
    select: { id: true, componentType: true },
  });

  const typeMap = new Map(components.map((c) => [c.id, c.componentType]));
  const aggregated = new Map<string, number>();

  for (const row of rows) {
    const type = typeMap.get(row.assessmentComponentId) ?? "OTHER";
    aggregated.set(type, (aggregated.get(type) ?? 0) + row._count._all);
  }

  return Array.from(aggregated.entries())
    .map(([componentType, count]) => ({
      componentType,
      label: ASSESSMENT_COMPONENT_TYPE_LABELS[componentType] ?? componentType,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// ─── Teacher pending grading — OPEN assessments (for Professores tab) ─────────

export async function getTeacherPendingGrading(
  organizationId: string
): Promise<TeacherPendingItem[]> {
  const db = await getDb();

  const rows = await db.assessment.groupBy({
    by: ["teacherId"],
    where: {
      organizationId,
      deletedAt: null,
      status: "OPEN",
      teacherId: { not: null },
    },
    _count: { _all: true },
  });

  if (rows.length === 0) return [];

  const teacherIds = rows.map((r) => r.teacherId!);
  const teachers = await db.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, firstName: true, lastName: true },
  });

  const nameMap = new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`]));

  return rows
    .map((r) => ({
      teacherName: nameMap.get(r.teacherId!) ?? "Sem Nome",
      openCount: r._count._all,
    }))
    .sort((a, b) => b.openCount - a.openCount)
    .slice(0, 8);
}

// ─── Publication status distribution (for Publicação tab) ────────────────────

export async function getPublicationStatusDistribution(
  organizationId: string
): Promise<PublicationStatusItem[]> {
  const db = await getDb();

  const groups = await db.assessmentPublication.groupBy({
    by: ["publicationStatus"],
    where: { organizationId },
    _count: { _all: true },
  });

  return groups
    .filter((g) => g._count._all > 0)
    .map((g) => ({ status: g.publicationStatus, count: g._count._all }));
}

// ─── Paginated dashboard rows (enriched with graded count + publication) ──────

export async function listAssessmentsForDashboard(
  organizationId: string,
  params: ListAssessmentsParams
): Promise<PaginatedResult<AssessmentDashboardRow>> {
  const result = await findAssessmentsByOrganization(organizationId, params);

  if (result.data.length === 0) {
    return {
      data: [],
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
    };
  }

  const db = await getDb();
  const ids = result.data.map((a) => a.id);

  const [gradedCountsRaw, publications] = await Promise.all([
    db.assessmentResult.groupBy({
      by: ["assessmentId"],
      where: { organizationId, assessmentId: { in: ids }, status: "GRADED", deletedAt: null },
      _count: { _all: true },
    }),
    db.assessmentPublication.findMany({
      where: { organizationId, assessmentId: { in: ids } },
      select: { assessmentId: true, publicationStatus: true },
    }),
  ]);

  const gradedMap = new Map(gradedCountsRaw.map((g) => [g.assessmentId, g._count._all]));
  const pubMap = new Map(publications.map((p) => [p.assessmentId, p.publicationStatus]));

  return {
    data: result.data.map((a) => ({
      id: a.id,
      title: a.title,
      componentName: a.componentName ?? null,
      componentType: a.componentType ?? null,
      classGroupName: a.classGroupName ?? null,
      teacherName: a.teacherName ?? null,
      periodName: a.periodName ?? null,
      assessmentDate: a.assessmentDate,
      maxScore: a.maxScore,
      status: a.status,
      totalResultsCount: a.resultsCount ?? 0,
      gradedResultsCount: gradedMap.get(a.id) ?? 0,
      publicationStatus: pubMap.get(a.id) ?? null,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
    hasPreviousPage: result.hasPreviousPage,
  };
}
