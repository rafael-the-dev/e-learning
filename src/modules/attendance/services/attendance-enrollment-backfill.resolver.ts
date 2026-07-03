import type {
  BackfillEnrollmentCandidate,
  BackfillResolution,
  BackfillSessionContext,
} from "@/modules/attendance/types/backfill";

// =============================================================================
// ATTENDANCE ENGINE — PHASE 2 enrollmentId RESOLVER (pure, no I/O)
//
// Deterministic mapping of a legacy AttendanceRecord (via its AttendanceSession
// context) to the single Enrollment it belongs to. Kept pure so it is trivially
// unit-testable and so the exact same logic drives both the read-only report and
// the mutating backfill.
//
// Resolution priority (from the Phase 2 brief — highest confidence first):
//   1. same studentId + same courseId + same classGroupId
//   2. same studentId + same courseId + currentLevelId === session.courseLevelId
//   3. same studentId + same courseId + initialLevelId === session.courseLevelId
//   → if a tier yields >1 candidate  : AMBIGUOUS (never guess)
//   → if no tier yields any candidate: UNRESOLVED
//
// Candidates passed in are ALREADY scoped to: same student, same organization,
// non-cancelled, not soft-deleted (see the repository). The resolver additionally
// enforces the courseId match defensively.
// =============================================================================

/**
 * Resolve one attendance record to its enrolment.
 *
 * @param session    the record's AttendanceSession context (course/class/level)
 * @param candidates the student's non-cancelled enrolments (org-scoped)
 */
export function resolveEnrollmentForRecord(
  session: BackfillSessionContext,
  candidates: BackfillEnrollmentCandidate[]
): BackfillResolution {
  // A record can only belong to an enrolment in the SAME course as its session.
  const sameCourse = candidates.filter((c) => c.courseId === session.courseId);

  if (sameCourse.length === 0) {
    return {
      outcome: "unresolved",
      reason: "Sem matrícula não-cancelada do aluno neste curso.",
    };
  }

  // ── Tier 1: same class group ────────────────────────────────────────────────
  const byClassGroup = sameCourse.filter(
    (c) => c.classGroupId != null && c.classGroupId === session.classGroupId
  );
  if (byClassGroup.length === 1) {
    return { outcome: "resolved", enrollmentId: byClassGroup[0].id, tier: 1, reason: "Turma coincide." };
  }
  if (byClassGroup.length > 1) {
    return {
      outcome: "ambiguous",
      tier: 1,
      candidateIds: byClassGroup.map((c) => c.id),
      reason: "Múltiplas matrículas na mesma turma e curso.",
    };
  }

  // Tiers 2 and 3 require a session level to match against.
  if (session.courseLevelId != null) {
    // ── Tier 2: current level ─────────────────────────────────────────────────
    const byCurrentLevel = sameCourse.filter(
      (c) => c.currentLevelId != null && c.currentLevelId === session.courseLevelId
    );
    if (byCurrentLevel.length === 1) {
      return { outcome: "resolved", enrollmentId: byCurrentLevel[0].id, tier: 2, reason: "Nível actual coincide." };
    }
    if (byCurrentLevel.length > 1) {
      return {
        outcome: "ambiguous",
        tier: 2,
        candidateIds: byCurrentLevel.map((c) => c.id),
        reason: "Múltiplas matrículas com o mesmo nível actual e curso.",
      };
    }

    // ── Tier 3: initial level ─────────────────────────────────────────────────
    const byInitialLevel = sameCourse.filter(
      (c) => c.initialLevelId != null && c.initialLevelId === session.courseLevelId
    );
    if (byInitialLevel.length === 1) {
      return { outcome: "resolved", enrollmentId: byInitialLevel[0].id, tier: 3, reason: "Nível inicial coincide." };
    }
    if (byInitialLevel.length > 1) {
      return {
        outcome: "ambiguous",
        tier: 3,
        candidateIds: byInitialLevel.map((c) => c.id),
        reason: "Múltiplas matrículas com o mesmo nível inicial e curso.",
      };
    }
  }

  // No tier matched. Deliberately conservative: we never fall back to "the only
  // enrolment for the course" — an unmatched row is surfaced for an operator to
  // resolve, not silently guessed.
  return {
    outcome: "unresolved",
    reason: "Matrícula(s) existe(m) para o curso mas nenhuma regra de prioridade coincidiu.",
  };
}
