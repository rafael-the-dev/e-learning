import { getDb } from "@/server/db";

export type WatchlistSeverity = "critical" | "high" | "medium" | "low";

export interface ClassGroupWatchlistItem {
  id: string;
  name: string;
  courseName: string;
  status: string;
  enrolled: number;
  capacity: number;
  occupancyRate: number;
  daysInStatus: number;
  severity: WatchlistSeverity;
  issues: string[];
}

// Severity rules:
//   critical — capacity exceeded
//   high     — no teacher / no schedule / FORMING > 30d with 0 enrollments
//   medium   — occupancy < 20% / FORMING > 30d with some enrollments
//   low      — occupancy 20–50%
function maxSeverity(a: WatchlistSeverity, b: WatchlistSeverity): WatchlistSeverity {
  const rank: Record<WatchlistSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
  return rank[a] >= rank[b] ? a : b;
}

export async function getClassGroupWatchlist(
  organizationId: string
): Promise<ClassGroupWatchlistItem[]> {
  const db = await getDb();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const groups = await db.classGroup.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { in: ["ACTIVE", "FORMING"] },
    },
    select: {
      id: true,
      name: true,
      status: true,
      currentCount: true,
      capacity: true,
      teacherId: true,
      createdAt: true,
      updatedAt: true,
      course: { select: { name: true } },
      _count: { select: { classGroupSchedules: true, classroomBookings: true } },
    },
  });

  const items = new Map<string, ClassGroupWatchlistItem>();

  for (const g of groups) {
    const issues: string[] = [];
    let severity: WatchlistSeverity = "low";
    const daysCreated = Math.floor((now.getTime() - new Date(g.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const occupancyRate = g.capacity > 0 ? Math.round((g.currentCount / g.capacity) * 100) : 0;

    // Critical: capacity exceeded
    if (g.currentCount > g.capacity) {
      issues.push("Capacidade excedida");
      severity = maxSeverity(severity, "critical");
    }

    // High: no teacher
    if (!g.teacherId) {
      issues.push("Sem professor");
      severity = maxSeverity(severity, "high");
    }

    // High: no schedule (active groups)
    if (g.status === "ACTIVE" && g._count.classGroupSchedules === 0) {
      issues.push("Sem horário");
      severity = maxSeverity(severity, "high");
    }

    // High: no classroom (active groups)
    if (g.status === "ACTIVE" && g._count.classroomBookings === 0) {
      issues.push("Sem sala");
      severity = maxSeverity(severity, "high");
    }

    // High: forming > 30 days with no enrollments
    if (g.status === "FORMING" && daysCreated > 30 && g.currentCount === 0) {
      issues.push(`Em formação há ${daysCreated} dias sem inscrições`);
      severity = maxSeverity(severity, "high");
    }

    // Medium: forming > 30 days with some enrollments
    if (g.status === "FORMING" && daysCreated > 30 && g.currentCount > 0 && severity === "low") {
      issues.push(`Em formação há ${daysCreated} dias`);
      severity = maxSeverity(severity, "medium");
    }

    // Medium: active with very low occupancy < 20%
    if (g.status === "ACTIVE" && g.capacity > 0 && occupancyRate < 20) {
      issues.push(`Ocupação muito baixa (${occupancyRate}%)`);
      severity = maxSeverity(severity, "medium");
    }

    // Low: active with low occupancy 20–50% (only if no other issues)
    if (
      g.status === "ACTIVE" &&
      g.capacity > 0 &&
      occupancyRate >= 20 &&
      occupancyRate < 50 &&
      issues.length === 0
    ) {
      issues.push(`Baixa ocupação (${occupancyRate}%)`);
      severity = "low";
    }

    if (issues.length > 0) {
      items.set(g.id, {
        id: g.id,
        name: g.name,
        courseName: g.course.name,
        status: g.status,
        enrolled: g.currentCount,
        capacity: g.capacity,
        occupancyRate,
        daysInStatus: daysCreated,
        severity,
        issues,
      });
    }
  }

  const severityOrder: Record<WatchlistSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

  return Array.from(items.values())
    .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])
    .slice(0, 15);
}
