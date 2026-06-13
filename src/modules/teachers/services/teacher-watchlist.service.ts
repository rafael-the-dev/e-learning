import { getDb } from "@/server/db";

export type WatchlistSeverity = "critical" | "high" | "medium" | "low";

export interface TeacherWatchlistItem {
  id: string;
  fullName: string;
  specialization: string | null;
  branchName: string | null;
  status: string;
  subjectCount: number;
  activeClassGroupCount: number;
  severity: WatchlistSeverity;
  issues: string[];
}

// Severity rules:
//   critical — OPEN assessment past date with 0 graded results
//   high     — OPEN assessment past date (partial grading) | no subjects | SUSPENDED with ACTIVE groups | ≥7 ACTIVE groups
//   medium   — ACTIVE + subjects + no ACTIVE class group (idle) | 5–6 ACTIVE groups
//   low      — (reserved for future use)
const SEVERITY_RANK: Record<WatchlistSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function upgrade(current: WatchlistSeverity, next: WatchlistSeverity): WatchlistSeverity {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current;
}

export async function getTeacherWatchlist(
  organizationId: string
): Promise<TeacherWatchlistItem[]> {
  const db = await getDb();
  const now = new Date();

  const items = new Map<string, TeacherWatchlistItem>();

  // ── ACTIVE teachers with OPEN overdue assessments ──────────────────────────
  const overdueTeachers = await db.teacher.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      assessments: {
        some: { status: "OPEN", assessmentDate: { lt: now }, deletedAt: null },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialization: true,
      branch: { select: { name: true } },
      _count: { select: { teacherSubjects: true } },
      assessments: {
        where: { status: "OPEN", assessmentDate: { lt: now }, deletedAt: null },
        select: {
          id: true,
          title: true,
          assessmentDate: true,
          _count: { select: { results: { where: { deletedAt: null } } } },
        },
        orderBy: { assessmentDate: "asc" },
        take: 3,
      },
    },
    take: 10,
  });

  if (overdueTeachers.length > 0) {
    const teacherIds = overdueTeachers.map((t) => t.id);
    const allAssessmentIds = overdueTeachers.flatMap((t) => t.assessments.map((a) => a.id));

    const [gradedRaw, classGroupCountsRaw] = await Promise.all([
      db.assessmentResult.groupBy({
        by: ["assessmentId"],
        where: { assessmentId: { in: allAssessmentIds }, status: "GRADED", deletedAt: null },
        _count: { _all: true },
      }),
      // Only count strictly ACTIVE class groups
      db.classGroup.groupBy({
        by: ["teacherId"],
        where: { teacherId: { in: teacherIds }, status: "ACTIVE", deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const gradedMap = new Map(gradedRaw.map((g) => [g.assessmentId, g._count._all]));
    const classGroupMap = new Map(classGroupCountsRaw.map((g) => [g.teacherId!, g._count._all]));

    for (const t of overdueTeachers) {
      const issues: string[] = [];
      let severity: WatchlistSeverity = "high";

      for (const a of t.assessments) {
        const total = a._count.results;
        const graded = gradedMap.get(a.id) ?? 0;
        const daysLate = Math.floor(
          (now.getTime() - new Date(a.assessmentDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (graded === 0 && total > 0) {
          issues.push(`"${a.title}" em atraso há ${daysLate} dia(s) — sem notas`);
          severity = upgrade(severity, "critical");
        } else if (graded === 0) {
          issues.push(`"${a.title}" em atraso há ${daysLate} dia(s) — sem resultados`);
          severity = upgrade(severity, "critical");
        } else {
          const pct = Math.round((graded / total) * 100);
          issues.push(`"${a.title}" em atraso há ${daysLate} dia(s) — ${pct}% classificado`);
        }
      }

      items.set(t.id, {
        id: t.id,
        fullName: `${t.firstName} ${t.lastName}`,
        specialization: t.specialization,
        branchName: t.branch?.name ?? null,
        status: "ACTIVE",
        subjectCount: t._count.teacherSubjects,
        activeClassGroupCount: classGroupMap.get(t.id) ?? 0,
        severity,
        issues,
      });
    }
  }

  // ── ACTIVE teachers with 0 subjects → HIGH ─────────────────────────────────
  const noSubjectsTeachers = await db.teacher.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      teacherSubjects: { none: {} },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialization: true,
      branch: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  for (const t of noSubjectsTeachers) {
    if (items.has(t.id)) {
      const existing = items.get(t.id)!;
      existing.issues.push("Sem disciplinas atribuídas");
      existing.severity = upgrade(existing.severity, "high");
      continue;
    }
    items.set(t.id, {
      id: t.id,
      fullName: `${t.firstName} ${t.lastName}`,
      specialization: t.specialization,
      branchName: t.branch?.name ?? null,
      status: "ACTIVE",
      subjectCount: 0,
      activeClassGroupCount: 0,
      severity: "high",
      issues: ["Sem disciplinas atribuídas — não pode ser alocado a turmas"],
    });
  }

  // ── SUSPENDED teachers with ACTIVE class groups → HIGH ────────────────────
  // Only operationally dangerous suspensions (still assigned to active groups)
  const suspendedWithGroups = await db.teacher.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "SUSPENDED",
      classGroups: { some: { status: "ACTIVE", deletedAt: null } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialization: true,
      branch: { select: { name: true } },
      _count: {
        select: {
          teacherSubjects: true,
          classGroups: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  // Batch count ACTIVE class groups for suspended teachers
  if (suspendedWithGroups.length > 0) {
    const suspendedIds = suspendedWithGroups.map((t) => t.id);
    const activeGroupCounts = await db.classGroup.groupBy({
      by: ["teacherId"],
      where: { teacherId: { in: suspendedIds }, status: "ACTIVE", deletedAt: null },
      _count: { _all: true },
    });
    const activeGroupMap = new Map(activeGroupCounts.map((g) => [g.teacherId!, g._count._all]));

    for (const t of suspendedWithGroups) {
      if (items.has(t.id)) continue;
      const activeCount = activeGroupMap.get(t.id) ?? 0;
      items.set(t.id, {
        id: t.id,
        fullName: `${t.firstName} ${t.lastName}`,
        specialization: t.specialization,
        branchName: t.branch?.name ?? null,
        status: "SUSPENDED",
        subjectCount: t._count.teacherSubjects,
        activeClassGroupCount: activeCount,
        severity: "high",
        issues: [`Professor suspenso com ${activeCount} turma(s) ativa(s) atribuída(s)`],
      });
    }
  }

  // ── ACTIVE teachers with excessive workload ────────────────────────────────
  // ≥7 active groups → HIGH; ≥5 active groups → MEDIUM
  const workloadGroups = await db.classGroup.groupBy({
    by: ["teacherId"],
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      teacherId: { not: null },
      teacher: { status: "ACTIVE", deletedAt: null },
    },
    _count: { _all: true },
  });

  const overloaded = workloadGroups.filter((g) => g._count._all >= 5);

  if (overloaded.length > 0) {
    const overloadedIds = overloaded.map((g) => g.teacherId!);
    const overloadedTeachers = await db.teacher.findMany({
      where: { id: { in: overloadedIds }, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        specialization: true,
        branch: { select: { name: true } },
        _count: { select: { teacherSubjects: true } },
      },
    });
    const teacherInfoMap = new Map(overloadedTeachers.map((t) => [t.id, t]));
    const countMap = new Map(overloaded.map((g) => [g.teacherId!, g._count._all]));

    for (const [teacherId, groupCount] of countMap.entries()) {
      if (items.has(teacherId)) {
        const existing = items.get(teacherId)!;
        existing.issues.push(`Carga elevada: ${groupCount} turmas ativas`);
        existing.severity = upgrade(existing.severity, groupCount >= 7 ? "high" : "medium");
        continue;
      }
      const t = teacherInfoMap.get(teacherId);
      if (!t) continue;
      items.set(teacherId, {
        id: t.id,
        fullName: `${t.firstName} ${t.lastName}`,
        specialization: t.specialization,
        branchName: t.branch?.name ?? null,
        status: "ACTIVE",
        subjectCount: t._count.teacherSubjects,
        activeClassGroupCount: groupCount,
        severity: groupCount >= 7 ? "high" : "medium",
        issues: [`Carga elevada: ${groupCount} turmas ativas atribuídas`],
      });
    }
  }

  // ── ACTIVE teachers with subjects but no ACTIVE class group → MEDIUM ───────
  const idleTeachers = await db.teacher.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      teacherSubjects: { some: {} },
      classGroups: { none: { status: "ACTIVE", deletedAt: null } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      specialization: true,
      branch: { select: { name: true } },
      _count: { select: { teacherSubjects: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const t of idleTeachers) {
    if (items.has(t.id)) continue;
    items.set(t.id, {
      id: t.id,
      fullName: `${t.firstName} ${t.lastName}`,
      specialization: t.specialization,
      branchName: t.branch?.name ?? null,
      status: "ACTIVE",
      subjectCount: t._count.teacherSubjects,
      activeClassGroupCount: 0,
      severity: "medium",
      issues: ["Ativo com disciplinas mas sem turma ativa atribuída"],
    });
  }

  return Array.from(items.values())
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 15);
}
