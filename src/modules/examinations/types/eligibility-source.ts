import type {
  ExaminationEligibilityBlocker,
  ExaminationEligibilityWarning,
} from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION ENGINE — ELIGIBILITY SOURCE CONTRACTS (Phase 3A)
// -----------------------------------------------------------------------------
// The INPUT and FACTS shapes for `loadExaminationEligibilityFacts` — a pure
// read-aggregation façade. Every field here is a FACT container (a copied value, a
// count, a status, or an explicit null/UNKNOWN), never a decision. There is
// deliberately NO `eligible`, `blockingReasons`, `warnings`, `requiresApproval`,
// `canRegister`, `canSchedule`, or `canOverride` — those belong to the future pure
// `ExaminationEligibilityEngine` (Phase 3B, ADR-013 E-3/E-4/E-5).
//
// Missing integrations are represented explicitly as `UNKNOWN`/`null` — the source
// never invents data. Nullable facts are always explicit. No Prisma types leak.
// =============================================================================

/** Tri-state for facts sourced from an integration that may not exist yet. */
export const ExaminationFactAvailability = {
  KNOWN: "KNOWN",
  UNKNOWN: "UNKNOWN",
} as const;
export type ExaminationFactAvailability =
  (typeof ExaminationFactAvailability)[keyof typeof ExaminationFactAvailability];

/** Finance clearance fact (read-model). Phase 3A: no finance read-model is wired,
 *  so this is always `UNKNOWN` until a later phase integrates finance. */
export const ExaminationFinancialClearanceStatus = {
  CLEARED: "CLEARED",
  NOT_CLEARED: "NOT_CLEARED",
  NOT_REQUIRED: "NOT_REQUIRED",
  UNKNOWN: "UNKNOWN",
} as const;
export type ExaminationFinancialClearanceStatus =
  (typeof ExaminationFinancialClearanceStatus)[keyof typeof ExaminationFinancialClearanceStatus];

/** Disciplinary fact. Phase 3A: no disciplinary module exists → always `UNKNOWN`. */
export const ExaminationDisciplinaryStatus = {
  CLEAR: "CLEAR",
  BLOCKED: "BLOCKED",
  UNKNOWN: "UNKNOWN",
} as const;
export type ExaminationDisciplinaryStatus =
  (typeof ExaminationDisciplinaryStatus)[keyof typeof ExaminationDisciplinaryStatus];

// ─── Input ───────────────────────────────────────────────────────────────────

/** Service-level input (NOT a public/client DTO). `organizationId`, `studentId`,
 *  `enrollmentId`, `levelSubjectId` are required; period/session/attempt are loaded
 *  only when their id is provided. `now` (if supplied) is copied verbatim into
 *  `metadata.loadedAt` — the source never uses the clock for a fact value. */
export interface ExaminationEligibilitySourceInput {
  organizationId: string;
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  examPeriodId?: string;
  examSessionId?: string;
  examAttemptId?: string;
  actorId?: string;
  now?: Date;
}

// ─── Fact sections ─────────────────────────────────────────────────────────────

/** Frozen-only: soft-deleted students are treated as absent (null), never exposed. */
export interface ExaminationStudentFact {
  id: string;
  studentNumber: string | null; // Student.code
  fullName: string; // firstName + lastName (copy, no formatting rule)
  status: string;
}

export interface ExaminationEnrollmentFact {
  id: string;
  status: string;
  courseId: string;
  courseLevelId: string | null;
  currentLevelId: string | null;
}

export interface ExaminationLevelSubjectFact {
  id: string;
  subjectId: string;
  subjectName: string | null; // via Subject.name (copy)
  minimumAttendancePercentage: number | null;
  minimumPassingGrade: number | null;
  isRequired: boolean;
  credits: number | null;
  workloadHours: number | null;
}

/** From StudentSubjectProgress (keyed by enrollmentId + levelSubjectId). Copied
 *  verbatim — NO recalculation. `passedAt` is not tracked separately in the source
 *  model, so it is always null (documented gap). */
export interface ExaminationSubjectProgressFact {
  exists: boolean;
  status: string | null;
  finalGrade: number | null;
  attendancePercentage: number | null;
  completedAt: Date | null;
  passedAt: Date | null; // not tracked as a distinct column → always null in Phase 3A
  source: "StudentSubjectProgress";
}

/** From StudentSubjectAttendanceSummary (keyed by enrollmentId + levelSubjectId).
 *  `null` when no summary row exists (explicit unknown). Copied verbatim. */
export interface ExaminationAttendanceFact {
  percentage: number | null;
  present: number | null; // totalPresentMinutes
  total: number | null; // totalScheduledMinutes
  requiredPercentage: number | null; // copied from LevelSubject.minimumAttendancePercentage
  status: string | null; // summary status (SUFFICIENT | AT_RISK | BELOW_REQUIRED | NOT_STARTED)
  source: "StudentSubjectAttendanceSummary";
}

/** One prerequisite requirement (copied). The source does NOT evaluate whether it
 *  is met — that is the engine's job. */
export interface ExaminationPrerequisiteItemFact {
  id: string;
  groupId: string;
  groupLogicType: string; // ALL | ANY
  prerequisiteLevelSubjectId: string;
  requirementType: string; // MUST_PASS | MUST_COMPLETE | MINIMUM_GRADE
  minimumRequiredGrade: number | null;
}

export interface ExaminationPrerequisitesFact {
  items: ExaminationPrerequisiteItemFact[];
  /** Whether ALL prerequisites are satisfied. `null` = the source did not evaluate
   *  satisfaction (Phase 3A copies requirement definitions only) → the engine treats
   *  it as UNKNOWN (a warning), never a blocker. A future source that evaluates
   *  prerequisites sets `true`/`false`; `false` → PREREQUISITE_NOT_MET. */
  allMet: boolean | null;
  source: "LevelSubjectPrerequisiteGroup";
}

/** Finance fact. Phase 3A: always `UNKNOWN` (no finance read-model wired). */
export interface ExaminationFinancialClearanceFact {
  status: ExaminationFinancialClearanceStatus;
  checkedAt: Date | null;
  reference: string | null;
}

/** Disciplinary fact. Phase 3A: always `UNKNOWN` (no disciplinary module). */
export interface ExaminationDisciplinaryFact {
  status: ExaminationDisciplinaryStatus;
  reason: string | null;
}

/** A prior attempt (copied from ExamAttempt) — history, not a decision. ExamAttempt
 *  is scoped by (enrollment, levelSubject); it carries no session pointer. */
export interface ExaminationPreviousAttemptFact {
  id: string;
  attemptNumber: number;
  status: string;
}

export interface ExaminationPreviousAttemptsFact {
  attempts: ExaminationPreviousAttemptFact[];
  count: number;
  lastAttemptStatus: string | null;
  maxAttemptNumber: number | null;
  source: "ExamAttempt";
}

/** Loaded only when `examPeriodId` is supplied. */
export interface ExaminationPeriodFact {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

/** Loaded only when `examSessionId` is supplied. */
export interface ExaminationSessionFact {
  id: string;
  status: string;
  periodId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
}

/** Loaded only when `examSessionId` is supplied. A FACT only — the source does not
 *  decide ALREADY_REGISTERED. */
export interface ExaminationExistingCandidateFact {
  candidateId: string;
  status: string;
  examSessionId: string;
}

/** Manual-approval fact. Phase 3A: no exam policy/override model exists, so the
 *  policy requirement is unknown and overrides is empty. */
export interface ExaminationManualApprovalFact {
  requiredByPolicy: boolean | null; // null = UNKNOWN in Phase 3A
  overrides: never[]; // no override model yet
}

export interface ExaminationEligibilityFactsMetadata {
  sourceVersion: "examination-eligibility-source.v1";
  loadedAt: Date;
  /** The period/session the caller asked about (copied from input), so the engine can
   *  distinguish "not requested" (no warning) from "requested but not found" (a
   *  warning). `null` = not requested for this evaluation. */
  requestedExamPeriodId: string | null;
  requestedExamSessionId: string | null;
}

// ─── Aggregate output ──────────────────────────────────────────────────────────

/** The complete fact bundle handed to the future `ExaminationEligibilityEngine`.
 *  FACTS ONLY — no decision fields. Nullable sections are explicit; missing
 *  integrations are `null`/`UNKNOWN`. */
export interface ExaminationEligibilityFacts {
  student: ExaminationStudentFact | null;
  enrollment: ExaminationEnrollmentFact | null;
  levelSubject: ExaminationLevelSubjectFact | null;
  subjectProgress: ExaminationSubjectProgressFact;
  attendance: ExaminationAttendanceFact | null;
  prerequisites: ExaminationPrerequisitesFact;
  financialClearance: ExaminationFinancialClearanceFact;
  disciplinary: ExaminationDisciplinaryFact;
  previousAttempts: ExaminationPreviousAttemptsFact;
  examPeriod: ExaminationPeriodFact | null;
  examSession: ExaminationSessionFact | null;
  existingCandidate: ExaminationExistingCandidateFact | null;
  manualApproval: ExaminationManualApprovalFact;
  metadata: ExaminationEligibilityFactsMetadata;
}

// ─── Engine result (Phase 3B) ──────────────────────────────────────────────────

/** The decision the pure `ExaminationEligibilityEngine` (Phase 3B) returns from
 *  `ExaminationEligibilityFacts`. `eligible === blockingReasons.length === 0`;
 *  `requiresApproval` is a NON-blocking gate; warnings never affect `eligible`.
 *  `evaluatedAt` is copied from `facts.metadata.loadedAt` (the engine reads no
 *  clock); `evaluatedFacts` is the SAME facts reference (engine mutates nothing). */
export interface ExaminationEligibilityResult {
  eligible: boolean;
  blockingReasons: ExaminationEligibilityBlocker[];
  warnings: ExaminationEligibilityWarning[];
  requiresApproval: boolean;
  evaluatedAt: Date;
  evaluatedFacts: ExaminationEligibilityFacts;
  metadata: {
    engineVersion: "examination-eligibility-engine.v1";
  };
}
