import type {
  HealthScoreBreakdown,
  HealthScoreInput,
  StudentHealthScore,
  HealthScoreLabel,
} from "@/modules/students/student-360/types";

const WEIGHTS = {
  academic: 0.3,
  finance: 0.25,
  attendance: 0.2,
  enrollment: 0.15,
  activity: 0.1,
} as const;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

// Composite 0–100 well-being score for at-a-glance trend. This is DISTINCT from the risk
// classification (H6): "is the student at risk, why, how severe" lives in
// student-risk.service.ts and is what the alerts panel, the overview risk chips and the
// health card's reasons all display. This service only produces the blended number +
// per-axis breakdown — it no longer derives its own reasons/recommended action.
export function calculateHealthScore(input: HealthScoreInput): StudentHealthScore {
  // Academic — 30%
  let academic = 100;
  const failedSubjectCount = input.subjectStatuses.filter((s) => s === "FAILED").length;
  if (failedSubjectCount > 0) academic -= Math.min(40, failedSubjectCount * 10);
  if (input.levelStatuses.includes("RECOVERY_REQUIRED")) academic -= 20;
  if (input.levelStatuses.includes("BLOCKED")) academic -= 40;
  academic = clamp(academic);

  // Finance — 25% (null when the viewer lacks finance permission: excluded + renormalized).
  let finance: number | null = null;
  if (input.finance) {
    let financeScore = 100;
    if (input.finance.outstandingBalance > 0) financeScore -= 25;
    if (input.finance.hasOverdueInvoice) financeScore -= 35;
    finance = clamp(financeScore);
  }

  // Attendance — 20% (null when the student has no scheduled sessions: excluded, not 100).
  let attendance: number | null = null;
  if (input.attendancePercentage != null) {
    let attendanceScore = input.attendancePercentage;
    if (input.hasBelowRequiredAttendance) attendanceScore = Math.min(attendanceScore, 50);
    attendance = clamp(attendanceScore);
  }

  // Enrollment status — 15%
  let enrollment: number;
  if (input.enrollmentStatuses.includes("ACTIVE")) enrollment = 100;
  else if (input.enrollmentStatuses.includes("COMPLETED")) enrollment = 60;
  else if (input.enrollmentStatuses.some((s) => s === "SUSPENDED" || s === "PENDING_PAYMENT")) enrollment = 30;
  else enrollment = 0;
  enrollment = clamp(enrollment);

  // Activity / engagement — 10%
  const now = input.now ?? new Date();
  let activity: number;
  if (!input.lastActivityAt) {
    activity = 20;
  } else {
    const diffDays = (now.getTime() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24);
    activity = diffDays <= 30 ? 100 : diffDays <= 90 ? 60 : 20;
  }
  activity = clamp(activity);

  const breakdown: HealthScoreBreakdown = { academic, finance, attendance, enrollment, activity };

  // Weighted composite over the categories actually present (finance/attendance may be
  // excluded); weights are redistributed so the score stays on a 0–100 scale.
  const activeCategories: Array<[number, number]> = [
    [academic, WEIGHTS.academic],
    [enrollment, WEIGHTS.enrollment],
    [activity, WEIGHTS.activity],
  ];
  if (finance != null) activeCategories.push([finance, WEIGHTS.finance]);
  if (attendance != null) activeCategories.push([attendance, WEIGHTS.attendance]);
  const totalWeight = activeCategories.reduce((sum, [, weight]) => sum + weight, 0);
  const score = Math.round(
    activeCategories.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight
  );

  const label: HealthScoreLabel =
    score >= 90 ? "EXCELLENT" : score >= 75 ? "HEALTHY" : score >= 50 ? "NEEDS_ATTENTION" : "CRITICAL";

  return { score, label, breakdown };
}
