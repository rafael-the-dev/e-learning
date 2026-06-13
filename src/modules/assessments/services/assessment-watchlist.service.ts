import { getDb } from "@/server/db";

export type WatchlistSeverity = "critical" | "high" | "medium" | "low";

export interface AssessmentWatchlistItem {
  id: string;
  title: string;
  componentType: string | null;
  classGroupName: string | null;
  assessmentDate: Date;
  totalResults: number;
  gradedResults: number;
  completionRate: number;
  // Positive = days past the assessment date. Negative = days until assessment date.
  daysFromDate: number;
  severity: WatchlistSeverity;
  issues: string[];
}

// Severity rules:
//   critical — OPEN, past date, 0 graded results
//   high     — OPEN, past date, partial grading | OPEN/SCHEDULED with no teacher | retake >7d
//   medium   — GRADED with publication DRAFT/READY | OPEN within window, 0 graded
//   low      — SCHEDULED in next 3 days (with teacher)
const SEVERITY_RANK: Record<WatchlistSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function maxSeverity(a: WatchlistSeverity, b: WatchlistSeverity): WatchlistSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export async function getAssessmentWatchlist(
  organizationId: string
): Promise<AssessmentWatchlistItem[]> {
  const db = await getDb();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const items = new Map<string, AssessmentWatchlistItem>();

  // ── OPEN assessments past their assessmentDate ─────────────────────────────
  const openPastDate = await db.assessment.findMany({
    where: { organizationId, deletedAt: null, status: "OPEN", assessmentDate: { lt: now } },
    select: {
      id: true,
      title: true,
      teacherId: true,
      assessmentDate: true,
      assessmentComponent: { select: { componentType: true } },
      classGroup: { select: { name: true } },
      _count: { select: { results: { where: { deletedAt: null } } } },
    },
    orderBy: { assessmentDate: "asc" },
    take: 20,
  });

  if (openPastDate.length > 0) {
    const gradedGroups = await db.assessmentResult.groupBy({
      by: ["assessmentId"],
      where: {
        organizationId,
        assessmentId: { in: openPastDate.map((a) => a.id) },
        status: "GRADED",
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const gradedMap = new Map(gradedGroups.map((g) => [g.assessmentId, g._count._all]));

    for (const a of openPastDate) {
      const total = a._count.results;
      const graded = gradedMap.get(a.id) ?? 0;
      const completionRate = total > 0 ? Math.round((graded / total) * 100) : 0;
      const daysFromDate = Math.floor(
        (now.getTime() - new Date(a.assessmentDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      const issues: string[] = [];
      let severity: WatchlistSeverity = "high";

      if (graded === 0) {
        issues.push(`Em atraso há ${daysFromDate} dia(s) — sem notas lançadas`);
        severity = "critical";
      } else {
        issues.push(
          `Em atraso há ${daysFromDate} dia(s) — classificação ${completionRate}% concluída`
        );
      }

      if (!a.teacherId) {
        issues.push("Sem professor atribuído");
        severity = maxSeverity(severity, "high");
      }

      items.set(a.id, {
        id: a.id,
        title: a.title,
        componentType: a.assessmentComponent?.componentType ?? null,
        classGroupName: a.classGroup?.name ?? null,
        assessmentDate: a.assessmentDate,
        totalResults: total,
        gradedResults: graded,
        completionRate,
        daysFromDate,
        severity,
        issues,
      });
    }
  }

  // ── OPEN (future date) without teacher ─────────────────────────────────────
  const openFutureNoTeacher = await db.assessment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "OPEN",
      assessmentDate: { gte: now },
      teacherId: null,
    },
    select: {
      id: true,
      title: true,
      assessmentDate: true,
      assessmentComponent: { select: { componentType: true } },
      classGroup: { select: { name: true } },
      _count: { select: { results: { where: { deletedAt: null } } } },
    },
    orderBy: { assessmentDate: "asc" },
    take: 5,
  });

  for (const a of openFutureNoTeacher) {
    if (items.has(a.id)) continue;
    items.set(a.id, {
      id: a.id,
      title: a.title,
      componentType: a.assessmentComponent?.componentType ?? null,
      classGroupName: a.classGroup?.name ?? null,
      assessmentDate: a.assessmentDate,
      totalResults: a._count.results,
      gradedResults: 0,
      completionRate: 0,
      daysFromDate: 0,
      severity: "high",
      issues: ["Sem professor atribuído"],
    });
  }

  // ── SCHEDULED in next 3 days ───────────────────────────────────────────────
  const scheduledSoon = await db.assessment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "SCHEDULED",
      assessmentDate: { gte: now, lte: threeDaysFromNow },
    },
    select: {
      id: true,
      title: true,
      teacherId: true,
      assessmentDate: true,
      assessmentComponent: { select: { componentType: true } },
      classGroup: { select: { name: true } },
      _count: { select: { results: { where: { deletedAt: null } } } },
    },
    orderBy: { assessmentDate: "asc" },
    take: 5,
  });

  for (const a of scheduledSoon) {
    if (items.has(a.id)) continue;
    const daysUntil = Math.max(
      1,
      Math.ceil(
        (new Date(a.assessmentDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    const noTeacher = !a.teacherId;
    items.set(a.id, {
      id: a.id,
      title: a.title,
      componentType: a.assessmentComponent?.componentType ?? null,
      classGroupName: a.classGroup?.name ?? null,
      assessmentDate: a.assessmentDate,
      totalResults: a._count.results,
      gradedResults: 0,
      completionRate: 0,
      daysFromDate: -daysUntil,
      severity: noTeacher ? "high" : "low",
      issues: noTeacher
        ? [`Em ${daysUntil} dia(s) — sem professor atribuído`]
        : [`Próxima em ${daysUntil} dia(s)`],
    });
  }

  // ── GRADED with pending publication ───────────────────────────────────────
  const pendingPub = await db.assessment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "GRADED",
      publication: { publicationStatus: { in: ["DRAFT", "READY"] } },
    },
    select: {
      id: true,
      title: true,
      assessmentDate: true,
      assessmentComponent: { select: { componentType: true } },
      classGroup: { select: { name: true } },
      publication: { select: { publicationStatus: true } },
      _count: { select: { results: { where: { deletedAt: null } } } },
    },
    orderBy: { assessmentDate: "desc" },
    take: 5,
  });

  for (const a of pendingPub) {
    if (items.has(a.id)) continue;
    const pubLabel =
      a.publication?.publicationStatus === "READY"
        ? "Resultados prontos para publicar"
        : "Publicação em rascunho";
    items.set(a.id, {
      id: a.id,
      title: a.title,
      componentType: a.assessmentComponent?.componentType ?? null,
      classGroupName: a.classGroup?.name ?? null,
      assessmentDate: a.assessmentDate,
      totalResults: a._count.results,
      gradedResults: a._count.results,
      completionRate: 100,
      daysFromDate: 0,
      severity: "medium",
      issues: [pubLabel],
    });
  }

  // ── AssessmentRetakes REQUESTED for more than 7 days ─────────────────────
  const oldRetakes = await db.assessmentRetake.findMany({
    where: {
      organizationId,
      status: "REQUESTED",
      requestedAt: { lt: sevenDaysAgo },
    },
    select: {
      id: true,
      requestedAt: true,
      assessment: {
        select: {
          id: true,
          title: true,
          assessmentDate: true,
          assessmentComponent: { select: { componentType: true } },
          classGroup: { select: { name: true } },
          _count: { select: { results: { where: { deletedAt: null } } } },
        },
      },
    },
    orderBy: { requestedAt: "asc" },
    take: 5,
  });

  for (const retake of oldRetakes) {
    const a = retake.assessment;
    if (items.has(a.id)) continue;
    const daysWaiting = Math.floor(
      (now.getTime() - new Date(retake.requestedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    items.set(a.id, {
      id: a.id,
      title: a.title,
      componentType: a.assessmentComponent?.componentType ?? null,
      classGroupName: a.classGroup?.name ?? null,
      assessmentDate: a.assessmentDate,
      totalResults: a._count.results,
      gradedResults: 0,
      completionRate: 0,
      daysFromDate: 0,
      severity: "high",
      issues: [`Pedido de repetição pendente há ${daysWaiting} dia(s)`],
    });
  }

  return Array.from(items.values())
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 15);
}
