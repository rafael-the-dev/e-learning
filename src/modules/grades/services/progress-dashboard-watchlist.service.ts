import { getDb } from "@/server/db";

export type WatchlistSeverity = "critical" | "high" | "medium" | "low";

export interface ProgressWatchlistItem {
  id: string;               // enrollmentId (deduplication key)
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  levelName: string | null; // relevant level for BLOCKED/ELIGIBLE issues
  status: string;           // primary status driving the watchlist entry
  severity: WatchlistSeverity;
  issues: string[];
  finalGrade: string | null;
}

// Severity rules:
//   critical — StudentLevelProgress BLOCKED (cannot advance to next level)
//   high     — StudentCourseProgress FAILED
//              | StudentCourseProgress RECOVERY_REQUIRED for > 30 days
//   medium   — StudentLevelProgress ELIGIBLE_TO_PROGRESS for > 7 days (no action)
//   low      — (reserved)
const SEVERITY_RANK: Record<WatchlistSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function upgrade(current: WatchlistSeverity, next: WatchlistSeverity): WatchlistSeverity {
  return SEVERITY_RANK[next] > SEVERITY_RANK[current] ? next : current;
}

type SkeletonItem = {
  enrollmentId: string;
  studentId: string;
  courseId: string;
  courseLevelId: string | null;
  status: string;
  severity: WatchlistSeverity;
  issues: string[];
  finalGrade: string | null;
};

export async function getProgressWatchlist(
  organizationId: string
): Promise<ProgressWatchlistItem[]> {
  const db = await getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── Run all queries in parallel ────────────────────────────────────────────
  const [blockedLevels, failedCourses, overdueRecovery, pendingEligible] = await Promise.all([
    // CRITICAL: Students with BLOCKED level progress
    db.studentLevelProgress.findMany({
      where: { organizationId, status: "BLOCKED" },
      select: {
        enrollmentId: true,
        studentId: true,
        courseId: true,
        courseLevelId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 8,
    }),
    // HIGH: Students with FAILED course progress
    db.studentCourseProgress.findMany({
      where: { organizationId, status: "FAILED" },
      select: {
        enrollmentId: true,
        studentId: true,
        courseId: true,
        finalGrade: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    // HIGH: RECOVERY_REQUIRED that has been open for > 30 days
    db.studentCourseProgress.findMany({
      where: {
        organizationId,
        status: "RECOVERY_REQUIRED",
        updatedAt: { lt: thirtyDaysAgo },
      },
      select: {
        enrollmentId: true,
        studentId: true,
        courseId: true,
        finalGrade: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 5,
    }),
    // MEDIUM: Eligible to progress but no action for > 7 days
    db.studentLevelProgress.findMany({
      where: {
        organizationId,
        status: "ELIGIBLE_TO_PROGRESS",
        updatedAt: { lt: sevenDaysAgo },
      },
      select: {
        enrollmentId: true,
        studentId: true,
        courseId: true,
        courseLevelId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "asc" },
      take: 5,
    }),
  ]);

  // ── Collect unique IDs for batch enrichment ────────────────────────────────
  const studentIdSet = new Set<string>();
  const courseIdSet = new Set<string>();
  const levelIdSet = new Set<string>();

  for (const r of blockedLevels) {
    studentIdSet.add(r.studentId);
    courseIdSet.add(r.courseId);
    levelIdSet.add(r.courseLevelId);
  }
  for (const r of failedCourses) {
    studentIdSet.add(r.studentId);
    courseIdSet.add(r.courseId);
  }
  for (const r of overdueRecovery) {
    studentIdSet.add(r.studentId);
    courseIdSet.add(r.courseId);
  }
  for (const r of pendingEligible) {
    studentIdSet.add(r.studentId);
    courseIdSet.add(r.courseId);
    levelIdSet.add(r.courseLevelId);
  }

  // ── Batch enrich ───────────────────────────────────────────────────────────
  const [students, courses, levels] = await Promise.all([
    db.student.findMany({
      where: { id: { in: [...studentIdSet] }, organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.course.findMany({
      where: { id: { in: [...courseIdSet] } },
      select: { id: true, name: true },
    }),
    levelIdSet.size > 0
      ? db.courseLevel.findMany({
          where: { id: { in: [...levelIdSet] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const studentMap = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));
  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const levelMap = new Map(levels.map((l) => [l.id, l.name]));

  // ── Build items Map (deduplication by enrollmentId) ────────────────────────
  const items = new Map<string, SkeletonItem>();

  for (const r of blockedLevels) {
    const daysBlocked = Math.floor(
      (now.getTime() - new Date(r.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (items.has(r.enrollmentId)) {
      const existing = items.get(r.enrollmentId)!;
      existing.issues.push(`Bloqueado no nível "${levelMap.get(r.courseLevelId) ?? "?"}" há ${daysBlocked} dia(s)`);
      existing.severity = upgrade(existing.severity, "critical");
      existing.courseLevelId = r.courseLevelId;
    } else {
      items.set(r.enrollmentId, {
        enrollmentId: r.enrollmentId,
        studentId: r.studentId,
        courseId: r.courseId,
        courseLevelId: r.courseLevelId,
        status: "BLOCKED",
        severity: "critical",
        finalGrade: null,
        issues: [`Bloqueado no nível "${levelMap.get(r.courseLevelId) ?? "?"}" há ${daysBlocked} dia(s) — não pode avançar`],
      });
    }
  }

  for (const r of failedCourses) {
    const grade = r.finalGrade ? r.finalGrade.toString() : null;
    if (items.has(r.enrollmentId)) {
      const existing = items.get(r.enrollmentId)!;
      existing.issues.push("Reprovado no curso" + (grade ? ` — nota: ${grade}` : ""));
      existing.severity = upgrade(existing.severity, "high");
      if (!existing.finalGrade && grade) existing.finalGrade = grade;
    } else {
      items.set(r.enrollmentId, {
        enrollmentId: r.enrollmentId,
        studentId: r.studentId,
        courseId: r.courseId,
        courseLevelId: null,
        status: "FAILED",
        severity: "high",
        finalGrade: grade,
        issues: ["Reprovado no curso" + (grade ? ` — nota final: ${grade}` : "")],
      });
    }
  }

  for (const r of overdueRecovery) {
    const daysOpen = Math.floor(
      (now.getTime() - new Date(r.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (items.has(r.enrollmentId)) {
      const existing = items.get(r.enrollmentId)!;
      existing.issues.push(`Em recuperação há ${daysOpen} dia(s) sem resolução`);
      existing.severity = upgrade(existing.severity, "high");
    } else {
      items.set(r.enrollmentId, {
        enrollmentId: r.enrollmentId,
        studentId: r.studentId,
        courseId: r.courseId,
        courseLevelId: null,
        status: "RECOVERY_REQUIRED",
        severity: "high",
        finalGrade: r.finalGrade ? r.finalGrade.toString() : null,
        issues: [`Em recuperação há ${daysOpen} dia(s) sem resolução`],
      });
    }
  }

  for (const r of pendingEligible) {
    const daysWaiting = Math.floor(
      (now.getTime() - new Date(r.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (items.has(r.enrollmentId)) {
      const existing = items.get(r.enrollmentId)!;
      existing.issues.push(`Elegível para progressão há ${daysWaiting} dia(s) sem ação`);
      existing.severity = upgrade(existing.severity, "medium");
    } else {
      items.set(r.enrollmentId, {
        enrollmentId: r.enrollmentId,
        studentId: r.studentId,
        courseId: r.courseId,
        courseLevelId: r.courseLevelId,
        status: "ELIGIBLE_TO_PROGRESS",
        severity: "medium",
        finalGrade: null,
        issues: [`Elegível para progressão no nível "${levelMap.get(r.courseLevelId) ?? "?"}" há ${daysWaiting} dia(s)`],
      });
    }
  }

  // ── Enrich and sort ────────────────────────────────────────────────────────
  return Array.from(items.values())
    .map((item) => ({
      id: item.enrollmentId,
      enrollmentId: item.enrollmentId,
      studentId: item.studentId,
      studentName: studentMap.get(item.studentId) ?? "—",
      courseId: item.courseId,
      courseName: courseMap.get(item.courseId) ?? "—",
      levelName: item.courseLevelId ? (levelMap.get(item.courseLevelId) ?? null) : null,
      status: item.status,
      severity: item.severity,
      issues: item.issues,
      finalGrade: item.finalGrade,
    }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, 15);
}
