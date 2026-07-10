import {
  ExaminationEligibilityBlocker,
  ExaminationEligibilityWarning,
} from "@/modules/examinations/constants";
import type {
  ExaminationEligibilityFacts,
  ExaminationEligibilityResult,
} from "@/modules/examinations/types/eligibility-source";

// =============================================================================
// EXAMINATION ELIGIBILITY ENGINE (Phase 3B) — PURE, DETERMINISTIC DECISION
// -----------------------------------------------------------------------------
// The single authority for whether a student may be generated/registered as an exam
// candidate (ADR-013 E-3). It is a PURE FUNCTION
// of the `ExaminationEligibilityFacts` produced by Phase 3A (Rule E-4): given the
// same facts it always returns the same result. It therefore:
//   • is SYNCHRONOUS — no async, no Promise;
//   • does NOT load or write data — no DB, no repository, no service, no command;
//   • does NOT publish events or write audit;
//   • does NOT read the clock / randomness / environment — `evaluatedAt` comes from
//     `facts.metadata.loadedAt`;
//   • does NOT recompute any academic value — it only COMPARES copied facts.
//   • does NOT mutate the facts — it returns the SAME reference as `evaluatedFacts`.
//
// It decides ACADEMIC/ADMINISTRATIVE eligibility only. Race-sensitive operational
// checks — SESSION_FULL, ALREADY_REGISTERED, room/invigilator/seat/timetable
// conflicts — are NOT decided here; they belong to the scheduling/registration
// commands via conditional writes (E-3a). Manual approval is a NON-blocking gate.
//
// `eligible === blockingReasons.length === 0`. Warnings never affect `eligible`.
// =============================================================================

const ENGINE_VERSION = "examination-eligibility-engine.v1" as const;

/** Subject-progress statuses that mean the subject is already passed/completed.
 *  Copied labels only — the engine never recomputes a subject outcome. */
const PASSED_SUBJECT_STATUSES: ReadonlySet<string> = new Set(["PASSED", "COMPLETED"]);

/** Exam-session statuses in which a candidate may still be generated/registered.
 *  Availability is a status COMPARISON, not a capacity/duplicate check (E-3a). */
const AVAILABLE_SESSION_STATUSES: ReadonlySet<string> = new Set(["SCHEDULED", "LOCKED"]);

const ACTIVE_ENROLLMENT_STATUS = "ACTIVE";
const OPEN_PERIOD_STATUS = "OPEN";

/**
 * Evaluate examination eligibility from facts alone. Pure and deterministic: no I/O,
 * no clock, no randomness, no mutation of the input. `eligible` is exactly
 * `blockingReasons.length === 0`; warnings are informational and never block;
 * `requiresApproval` is a non-blocking gate.
 */
export function evaluateExaminationEligibility(
  facts: ExaminationEligibilityFacts
): ExaminationEligibilityResult {
  const blockingReasons: ExaminationEligibilityBlocker[] = [];
  const warnings: ExaminationEligibilityWarning[] = [];
  let requiresApproval = false;

  // 5.1 Student.
  if (!facts.student) {
    blockingReasons.push(ExaminationEligibilityBlocker.NO_STUDENT);
  }

  // 5.2 Enrollment (present AND active).
  if (!facts.enrollment || facts.enrollment.status !== ACTIVE_ENROLLMENT_STATUS) {
    blockingReasons.push(ExaminationEligibilityBlocker.NO_ACTIVE_ENROLLMENT);
  }

  // 5.3 LevelSubject.
  if (!facts.levelSubject) {
    blockingReasons.push(ExaminationEligibilityBlocker.LEVEL_SUBJECT_NOT_FOUND);
  }

  // 5.4 Subject registration — Phase 3A provides NO "is this subject part of the
  //     enrollment" fact, so SUBJECT_NOT_REGISTERED is intentionally NOT emitted
  //     (do not invent). Reserved for a future source fact.

  // 5.5 Subject already passed (copied status only).
  if (facts.subjectProgress.status && PASSED_SUBJECT_STATUSES.has(facts.subjectProgress.status)) {
    blockingReasons.push(ExaminationEligibilityBlocker.SUBJECT_ALREADY_PASSED);
  }

  // 5.6 Attendance (compare copied percentage against copied requirement).
  if (!facts.attendance) {
    warnings.push(ExaminationEligibilityWarning.ATTENDANCE_UNKNOWN);
  } else {
    const { percentage, requiredPercentage } = facts.attendance;
    if (
      requiredPercentage != null &&
      percentage != null &&
      percentage < requiredPercentage
    ) {
      blockingReasons.push(ExaminationEligibilityBlocker.ATTENDANCE_BELOW_REQUIRED);
    }
  }

  // 5.7 Prerequisites (source-supplied verdict; engine does not evaluate the graph).
  if (facts.prerequisites.allMet === null) {
    // Only surface "unknown" when there actually are prerequisites to satisfy.
    if (facts.prerequisites.items.length > 0) {
      warnings.push(ExaminationEligibilityWarning.PREREQUISITE_STATUS_UNKNOWN);
    }
  } else if (facts.prerequisites.allMet === false) {
    blockingReasons.push(ExaminationEligibilityBlocker.PREREQUISITE_NOT_MET);
  }

  // 5.8 Financial clearance.
  if (facts.financialClearance.status === "UNKNOWN") {
    warnings.push(ExaminationEligibilityWarning.FINANCIAL_CLEARANCE_UNKNOWN);
  } else if (facts.financialClearance.status === "NOT_CLEARED") {
    blockingReasons.push(ExaminationEligibilityBlocker.FINANCIAL_CLEARANCE_REQUIRED);
  }

  // 5.9 Disciplinary.
  if (facts.disciplinary.status === "UNKNOWN") {
    warnings.push(ExaminationEligibilityWarning.DISCIPLINARY_STATUS_UNKNOWN);
  } else if (facts.disciplinary.status === "BLOCKED") {
    blockingReasons.push(ExaminationEligibilityBlocker.DISCIPLINARY_BLOCK);
  }

  // 5.10 Previous attempts — informational only (max-attempts policy not modelled).
  if (facts.previousAttempts.count > 0) {
    warnings.push(ExaminationEligibilityWarning.PREVIOUS_ATTEMPTS_FOUND);
  }

  // 5.11 Exam period — only when the caller requested one.
  if (facts.metadata.requestedExamPeriodId) {
    if (!facts.examPeriod) {
      warnings.push(ExaminationEligibilityWarning.EXAM_PERIOD_MISSING);
    } else if (facts.examPeriod.status !== OPEN_PERIOD_STATUS) {
      blockingReasons.push(ExaminationEligibilityBlocker.EXAM_PERIOD_CLOSED);
    }
  }

  // 5.12 Exam session — only when the caller requested one. NO capacity /
  //      duplicate-candidate check here (command-level, E-3a).
  if (facts.metadata.requestedExamSessionId) {
    if (!facts.examSession) {
      warnings.push(ExaminationEligibilityWarning.EXAM_SESSION_MISSING);
    } else if (!AVAILABLE_SESSION_STATUSES.has(facts.examSession.status)) {
      blockingReasons.push(ExaminationEligibilityBlocker.EXAM_SESSION_NOT_AVAILABLE);
    }
  }

  // 5.13 Manual approval — non-blocking gate.
  if (facts.manualApproval.requiredByPolicy === true) {
    requiresApproval = true;
    warnings.push(ExaminationEligibilityWarning.MANUAL_APPROVAL_REQUIRED);
  }

  return {
    eligible: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    requiresApproval,
    evaluatedAt: facts.metadata.loadedAt,
    evaluatedFacts: facts,
    metadata: { engineVersion: ENGINE_VERSION },
  };
}
