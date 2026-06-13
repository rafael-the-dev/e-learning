import { getDb } from "@/server/db";

export type WatchlistSeverity = "critical" | "high" | "medium" | "low";

export interface CourseWatchlistItem {
  id: string;
  name: string;
  code: string | null;
  categoryName: string | null;
  status: string;
  levelCount: number;
  activeClassGroupCount: number;
  activeEnrollmentCount: number;
  severity: WatchlistSeverity;
  issues: string[];
}

// Severity rules:
//   critical — ACTIVE + 0 levels | ACTIVE + has levels + no active LevelSubjects
//   high     — ACTIVE + has curriculum but no active class groups
//              | ACTIVE + has class groups (running) but 0 active enrollments
//   medium   — DRAFT older than 30 days
//   low      — (reserved)
const SEVERITY_RANK: Record<WatchlistSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function upgrade(current: WatchlistSeverity, next: WatchlistSeverity): WatchlistSeverity {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current;
}

export async function getCourseWatchlist(
  organizationId: string
): Promise<CourseWatchlistItem[]> {
  const db = await getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const items = new Map<string, CourseWatchlistItem>();

  // ── CRITICAL: ACTIVE courses with 0 levels ────────────────────────────────
  const noLevelsCourses = await db.course.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      levels: { none: {} },
    },
    select: {
      id: true,
      name: true,
      code: true,
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  for (const c of noLevelsCourses) {
    items.set(c.id, {
      id: c.id,
      name: c.name,
      code: c.code,
      categoryName: c.category?.name ?? null,
      status: "ACTIVE",
      levelCount: 0,
      activeClassGroupCount: 0,
      activeEnrollmentCount: 0,
      severity: "critical",
      issues: ["Curso ativo sem nenhum nível definido — currículo completamente vazio"],
    });
  }

  // ── CRITICAL: ACTIVE courses with levels but no active LevelSubjects ────────
  // Uses course.levelSubjects (direct relation confirmed in schema)
  const noSubjectsCourses = await db.course.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      levels: { some: {} },
      levelSubjects: { none: { status: "ACTIVE", deletedAt: null } },
    },
    select: {
      id: true,
      name: true,
      code: true,
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  if (noSubjectsCourses.length > 0) {
    const nsIds = noSubjectsCourses.map((c) => c.id);
    const levelCountsRaw = await db.courseLevel.groupBy({
      by: ["courseId"],
      where: { courseId: { in: nsIds } },
      _count: { _all: true },
    });
    const levelCountMap = new Map(levelCountsRaw.map((r) => [r.courseId, r._count._all]));

    for (const c of noSubjectsCourses) {
      if (items.has(c.id)) {
        items.get(c.id)!.issues.push("Níveis existentes sem disciplinas ativas");
        items.get(c.id)!.severity = upgrade(items.get(c.id)!.severity, "critical");
        continue;
      }
      items.set(c.id, {
        id: c.id,
        name: c.name,
        code: c.code,
        categoryName: c.category?.name ?? null,
        status: "ACTIVE",
        levelCount: levelCountMap.get(c.id) ?? 0,
        activeClassGroupCount: 0,
        activeEnrollmentCount: 0,
        severity: "critical",
        issues: ["Níveis definidos mas sem disciplinas ativas — turmas não podem ser configuradas"],
      });
    }
  }

  // ── HIGH: ACTIVE courses with curriculum but no active class groups ──────────
  // Only flag if they have active subjects (otherwise already CRITICAL above)
  const noGroupCourses = await db.course.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      levelSubjects: { some: { status: "ACTIVE", deletedAt: null } },
      classGroups: { none: { status: "ACTIVE", deletedAt: null } },
    },
    select: {
      id: true,
      name: true,
      code: true,
      category: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  if (noGroupCourses.length > 0) {
    const ngIds = noGroupCourses.map((c) => c.id);
    const [levelCountsRaw] = await Promise.all([
      db.courseLevel.groupBy({
        by: ["courseId"],
        where: { courseId: { in: ngIds } },
        _count: { _all: true },
      }),
    ]);
    const levelCountMap = new Map(levelCountsRaw.map((r) => [r.courseId, r._count._all]));

    for (const c of noGroupCourses) {
      if (items.has(c.id)) {
        items.get(c.id)!.issues.push("Sem turma ativa associada");
        items.get(c.id)!.severity = upgrade(items.get(c.id)!.severity, "high");
        continue;
      }
      items.set(c.id, {
        id: c.id,
        name: c.name,
        code: c.code,
        categoryName: c.category?.name ?? null,
        status: "ACTIVE",
        levelCount: levelCountMap.get(c.id) ?? 0,
        activeClassGroupCount: 0,
        activeEnrollmentCount: 0,
        severity: "high",
        issues: ["Currículo completo mas sem turma ativa — curso não está em funcionamento"],
      });
    }
  }

  // ── HIGH: ACTIVE courses running (has class groups) but no active enrollments ─
  const noEnrollmentCourses = await db.course.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "ACTIVE",
      classGroups: { some: { status: "ACTIVE", deletedAt: null } },
      enrollments: { none: { status: "ACTIVE", deletedAt: null } },
    },
    select: {
      id: true,
      name: true,
      code: true,
      category: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  if (noEnrollmentCourses.length > 0) {
    const neIds = noEnrollmentCourses.map((c) => c.id);
    const [levelCountsRaw, classGroupCountsRaw] = await Promise.all([
      db.courseLevel.groupBy({
        by: ["courseId"],
        where: { courseId: { in: neIds } },
        _count: { _all: true },
      }),
      db.classGroup.groupBy({
        by: ["courseId"],
        where: { courseId: { in: neIds }, status: "ACTIVE", deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const levelCountMap = new Map(levelCountsRaw.map((r) => [r.courseId, r._count._all]));
    const classGroupCountMap = new Map(classGroupCountsRaw.map((r) => [r.courseId!, r._count._all]));

    for (const c of noEnrollmentCourses) {
      const activeGroupCount = classGroupCountMap.get(c.id) ?? 0;
      if (items.has(c.id)) {
        items.get(c.id)!.issues.push(`${activeGroupCount} turma(s) ativa(s) sem nenhuma matrícula`);
        items.get(c.id)!.severity = upgrade(items.get(c.id)!.severity, "high");
        items.get(c.id)!.activeClassGroupCount = activeGroupCount;
        continue;
      }
      items.set(c.id, {
        id: c.id,
        name: c.name,
        code: c.code,
        categoryName: c.category?.name ?? null,
        status: "ACTIVE",
        levelCount: levelCountMap.get(c.id) ?? 0,
        activeClassGroupCount: activeGroupCount,
        activeEnrollmentCount: 0,
        severity: "high",
        issues: [`${activeGroupCount} turma(s) ativa(s) em funcionamento mas sem alunos matriculados`],
      });
    }
  }

  // ── MEDIUM: DRAFT courses older than 30 days ────────────────────────────────
  const staleDrafts = await db.course.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: "DRAFT",
      createdAt: { lt: thirtyDaysAgo },
    },
    select: {
      id: true,
      name: true,
      code: true,
      category: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  for (const c of staleDrafts) {
    if (items.has(c.id)) continue;
    const daysOld = Math.floor(
      (now.getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    items.set(c.id, {
      id: c.id,
      name: c.name,
      code: c.code,
      categoryName: c.category?.name ?? null,
      status: "DRAFT",
      levelCount: 0,
      activeClassGroupCount: 0,
      activeEnrollmentCount: 0,
      severity: "medium",
      issues: [`Rascunho há ${daysOld} dia(s) sem publicar`],
    });
  }

  return Array.from(items.values())
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 15);
}
