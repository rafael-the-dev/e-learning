// =============================================================================
// COURSE COMPLETION — STRATEGY, POLICY & GRADE POLICY
//
// The completion DECISION (is the course complete? what status / grade / reason?)
// is extracted behind a strategy so institutions can adopt different completion
// models without rewriting the engine. The engine (IO, persistence, events) stays
// stable; only the strategy varies.
//
//   CourseCompletionEngine  → CourseCompletionStrategy → CourseCompletionPolicy
//                                        │
//                                        └→ CourseFinalGradePolicy (grade rollup)
//
// Only STANDARD is implemented today and it reproduces the historical behaviour
// exactly (weighted-by-hours grade with simple-mean fallback). The other strategy
// and grade-mode names are declared as extension points, not yet implemented.
// =============================================================================

// ─── Strategy names (extension points) ─────────────────────────────────────────
export const COURSE_COMPLETION_STRATEGY = {
  STANDARD: "STANDARD",
  CREDIT_BASED: "CREDIT_BASED", // future
  COMPETENCY_BASED: "COMPETENCY_BASED", // future
  MANUAL_APPROVAL: "MANUAL_APPROVAL", // future
} as const;
export type CourseCompletionStrategyName =
  (typeof COURSE_COMPLETION_STRATEGY)[keyof typeof COURSE_COMPLETION_STRATEGY];

// ─── Completion reasons (derived, machine-readable) ─────────────────────────────
// Explains WHY the course landed in its status. Improves dashboards/debugging.
// PENDING_ATTENDANCE / PENDING_FINANCIAL_CLEARANCE / PENDING_CERTIFICATE_REQUIREMENTS
// are reserved for when the corresponding policy gates + services exist; the
// STANDARD strategy never produces them today (gates default off).
export const COURSE_COMPLETION_REASON = {
  ALL_LEVELS_COMPLETED: "ALL_LEVELS_COMPLETED",
  FAILED_REQUIRED_LEVEL: "FAILED_REQUIRED_LEVEL",
  LEVEL_IN_PROGRESS: "LEVEL_IN_PROGRESS",
  PENDING_RECOVERY: "PENDING_RECOVERY",
  PENDING_MANUAL_APPROVAL: "PENDING_MANUAL_APPROVAL",
  PENDING_ATTENDANCE: "PENDING_ATTENDANCE", // reserved (future AttendanceEngine)
  PENDING_FINANCIAL_CLEARANCE: "PENDING_FINANCIAL_CLEARANCE", // reserved (future FinancialEligibilityService)
  PENDING_CERTIFICATE_REQUIREMENTS: "PENDING_CERTIFICATE_REQUIREMENTS", // reserved (future certificate module)
  NOT_STARTED: "NOT_STARTED",
} as const;
export type CourseCompletionReason =
  (typeof COURSE_COMPLETION_REASON)[keyof typeof COURSE_COMPLETION_REASON];

// ─── Final-grade rollup modes (extension points) ────────────────────────────────
export const COURSE_FINAL_GRADE_MODE = {
  SIMPLE_AVERAGE: "SIMPLE_AVERAGE",
  WEIGHTED_BY_HOURS: "WEIGHTED_BY_HOURS", // current default
  WEIGHTED_BY_CREDITS: "WEIGHTED_BY_CREDITS", // future (CourseLevel has no credits yet)
  BEST_LEVEL: "BEST_LEVEL", // future
  CUSTOM: "CUSTOM", // future
} as const;
export type CourseFinalGradeMode =
  (typeof COURSE_FINAL_GRADE_MODE)[keyof typeof COURSE_FINAL_GRADE_MODE];

// ─── Completion policy (configuration; current defaults keep behaviour) ──────────
// Institutions will eventually configure this per course. The STANDARD strategy
// honours only `finalGradeMode` today; the requirement gates are accepted but NOT
// enforced (documented stubs) so behaviour is unchanged until the owning services
// (attendance, financial, certificates, internships) exist.
export interface CourseCompletionPolicy {
  strategy: CourseCompletionStrategyName;
  finalGradeMode: CourseFinalGradeMode;
  requireAttendance: boolean;
  requireFinancialClearance: boolean;
  requireInternship: boolean;
  requirePracticalLessons: boolean;
  requireCertificateApproval: boolean;
  requireManualCompletion: boolean;
}

export const DEFAULT_COURSE_COMPLETION_POLICY: CourseCompletionPolicy = {
  strategy: COURSE_COMPLETION_STRATEGY.STANDARD,
  finalGradeMode: COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS, // historical behaviour
  requireAttendance: false,
  requireFinancialClearance: false,
  requireInternship: false,
  requirePracticalLessons: false,
  requireCertificateApproval: false,
  requireManualCompletion: false,
};

// ─── Decision inputs / output ───────────────────────────────────────────────────
export interface CourseLevelInput {
  id: string;
  order: number;
  /**
   * Level weight for the final-grade rollup. Prefer credits when the model
   * exposes them; today CourseLevel only carries totalHours, so callers pass
   * that. Null/0 → contributes no weight (simple-mean fallback kicks in when NO
   * graded level has a usable weight).
   */
  weight?: number | null;
}

export interface CourseLevelProgressInput {
  courseLevelId: string;
  finalGrade: number | null;
  earnedCredits: number | null;
  status: string;
}

export interface CourseCompletionDecision {
  status: string;
  finalGrade: number | null;
  earnedCredits: number;
  /** Human-facing (PT-PT) reason stored on StudentCourseProgress.progressReason. */
  progressReason: string | null;
  /** Machine-readable reason for dashboards/debugging (derived, not persisted). */
  completionReason: CourseCompletionReason;
  completed: boolean;
}

// ─── Level-status classification ────────────────────────────────────────────────
// Only these level statuses count as "done" for course completion.
export const COURSE_PASSED_LEVEL_STATUSES = new Set(["PASSED", "PROMOTED", "COMPLETED"]);

// These explicitly keep the course IN_PROGRESS (student still has outstanding work
// or a pending decision): ELIGIBLE_TO_PROGRESS, RECOVERY_REQUIRED, BLOCKED,
// PROMOTED_WITH_PENDING_SUBJECTS, IN_PROGRESS. (NOT_STARTED / missing handled apart.)
export const COURSE_IN_PROGRESS_LEVEL_STATUSES = new Set([
  "ELIGIBLE_TO_PROGRESS",
  "RECOVERY_REQUIRED",
  "BLOCKED",
  "PROMOTED_WITH_PENDING_SUBJECTS",
  "IN_PROGRESS",
]);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Course final grade rollup, selected by mode.
 *   - SIMPLE_AVERAGE     : unweighted mean of graded levels.
 *   - WEIGHTED_BY_HOURS  : weight by level weight (totalHours) when EVERY graded
 *                          level has a usable weight; otherwise simple mean.
 *   - others             : declared extension points, not implemented yet.
 * Only graded levels (finalGrade != null) contribute.
 *
 * TODO (future): WEIGHTED_BY_CREDITS once CourseLevel exposes credits; BEST_LEVEL
 * and CUSTOM per institutional policy.
 */
export function computeCourseFinalGrade(
  graded: Array<{ grade: number; weight: number | null }>,
  mode: CourseFinalGradeMode = COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS
): number | null {
  if (graded.length === 0) return null;

  const simpleMean = () => round1(graded.reduce((s, g) => s + g.grade, 0) / graded.length);

  switch (mode) {
    case COURSE_FINAL_GRADE_MODE.SIMPLE_AVERAGE:
      return simpleMean();

    case COURSE_FINAL_GRADE_MODE.WEIGHTED_BY_HOURS: {
      const allWeighted = graded.every((g) => g.weight != null && g.weight > 0);
      if (!allWeighted) return simpleMean();
      const totalWeight = graded.reduce((s, g) => s + (g.weight as number), 0);
      const weightedSum = graded.reduce((s, g) => s + g.grade * (g.weight as number), 0);
      return round1(weightedSum / totalWeight);
    }

    default:
      throw new Error(`CourseFinalGradeMode "${mode}" ainda não está implementado`);
  }
}

// ─── Strategy interface ─────────────────────────────────────────────────────────
export interface CourseCompletionStrategyInput {
  courseLevels: CourseLevelInput[];
  levelProgress: CourseLevelProgressInput[];
  policy: CourseCompletionPolicy;
}

export interface CourseCompletionStrategy {
  readonly name: CourseCompletionStrategyName;
  decide(input: CourseCompletionStrategyInput): CourseCompletionDecision;
}

// ─── STANDARD strategy (reproduces historical behaviour) ────────────────────────
export class StandardCourseCompletionStrategy implements CourseCompletionStrategy {
  readonly name = COURSE_COMPLETION_STRATEGY.STANDARD;

  decide({ courseLevels, levelProgress, policy }: CourseCompletionStrategyInput): CourseCompletionDecision {
    const progressMap = new Map(levelProgress.map((p) => [p.courseLevelId, p]));

    const graded: Array<{ grade: number; weight: number | null }> = [];
    let totalEarnedCredits = 0;
    let allPassed = true;
    let anyFailed = false;
    let anyInProgress = false;
    let anyRecovery = false;
    let anyManualPending = false;

    for (const level of courseLevels) {
      const lp = progressMap.get(level.id);

      if (!lp || lp.status === "NOT_STARTED") {
        allPassed = false;
        anyInProgress = true;
        continue;
      }

      if (lp.finalGrade != null) {
        graded.push({ grade: lp.finalGrade, weight: level.weight ?? null });
      }
      totalEarnedCredits += lp.earnedCredits ?? 0;

      if (lp.status === "FAILED") {
        anyFailed = true;
        allPassed = false;
      } else if (COURSE_PASSED_LEVEL_STATUSES.has(lp.status)) {
        // counts as done
      } else if (COURSE_IN_PROGRESS_LEVEL_STATUSES.has(lp.status)) {
        allPassed = false;
        anyInProgress = true;
        if (lp.status === "RECOVERY_REQUIRED") anyRecovery = true;
        if (lp.status === "ELIGIBLE_TO_PROGRESS" || lp.status === "PROMOTED_WITH_PENDING_SUBJECTS") {
          anyManualPending = true;
        }
      } else {
        // Unknown status: fail safe toward IN_PROGRESS (never auto-complete).
        allPassed = false;
        anyInProgress = true;
      }
    }

    const finalGrade = computeCourseFinalGrade(graded, policy.finalGradeMode);

    let status: string;
    let progressReason: string | null = null;
    let completed = false;
    let completionReason: CourseCompletionReason;

    if (courseLevels.length === 0 || levelProgress.length === 0) {
      status = "NOT_STARTED";
      completionReason = COURSE_COMPLETION_REASON.NOT_STARTED;
    } else if (allPassed) {
      status = "COMPLETED";
      progressReason = "Todos os níveis concluídos";
      completed = true;
      completionReason = COURSE_COMPLETION_REASON.ALL_LEVELS_COMPLETED;
    } else if (anyRecovery) {
      // Recovery pending on a level: the course is UNRESOLVED. It must not fail
      // definitively (recovery may still pass) nor complete. Distinct status so
      // it is explicit on transcripts/dashboards, never COMPLETED, never FAILED.
      status = "RECOVERY_REQUIRED";
      progressReason = "Recuperação pendente";
      completionReason = COURSE_COMPLETION_REASON.PENDING_RECOVERY;
    } else if (anyFailed && !anyInProgress) {
      status = "FAILED";
      progressReason = "Reprovação em disciplinas obrigatórias";
      completionReason = COURSE_COMPLETION_REASON.FAILED_REQUIRED_LEVEL;
    } else {
      status = "IN_PROGRESS";
      completionReason = anyManualPending
        ? COURSE_COMPLETION_REASON.PENDING_MANUAL_APPROVAL
        : COURSE_COMPLETION_REASON.LEVEL_IN_PROGRESS;
    }

    return { status, finalGrade, earnedCredits: totalEarnedCredits, progressReason, completed, completionReason };
  }
}

// ─── Strategy registry ──────────────────────────────────────────────────────────
const STRATEGIES: Partial<Record<CourseCompletionStrategyName, CourseCompletionStrategy>> = {
  [COURSE_COMPLETION_STRATEGY.STANDARD]: new StandardCourseCompletionStrategy(),
};

export function getCourseCompletionStrategy(
  policy: CourseCompletionPolicy = DEFAULT_COURSE_COMPLETION_POLICY
): CourseCompletionStrategy {
  const strategy = STRATEGIES[policy.strategy];
  if (!strategy) {
    throw new Error(`CourseCompletionStrategy "${policy.strategy}" ainda não está implementada`);
  }
  return strategy;
}
