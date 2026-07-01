// =============================================================================
// GRADE RESOLUTION ENGINE
// Pure decision logic for how a recovery/retake grade combines with the
// original grade to produce the effective grade stored on the canonical
// StudentAssessmentResult (sourceType = RECOVERY).
//
// No I/O, no Prisma — fully deterministic and unit-testable.
// =============================================================================

export const GRADE_RESOLUTION_STRATEGY = {
  // Keep whichever attempt scored higher (safe default).
  BEST_SCORE: "BEST_SCORE",
  // Always use the most recent (recovery) attempt.
  LAST_SCORE: "LAST_SCORE",
  // Recovery replaces the original outright (alias of LAST_SCORE, explicit intent).
  REPLACE: "REPLACE",
  // Mean of the original and recovery attempts.
  AVERAGE: "AVERAGE",
} as const;

export type GradeResolutionStrategy =
  (typeof GRADE_RESOLUTION_STRATEGY)[keyof typeof GRADE_RESOLUTION_STRATEGY];

export const DEFAULT_GRADE_RESOLUTION_STRATEGY: GradeResolutionStrategy =
  GRADE_RESOLUTION_STRATEGY.BEST_SCORE;

export interface GradeResolutionInput {
  /** Original effective grade already on the canonical result (null if none). */
  originalGrade: number | null;
  /** Grade obtained in the recovery/retake attempt. */
  recoveryGrade: number;
  /** Resolution strategy; defaults to BEST_SCORE when omitted/unknown. */
  strategy?: GradeResolutionStrategy;
}

export interface GradeResolutionResult {
  /** Effective grade to persist on the canonical result. */
  effectiveGrade: number;
  /** Strategy actually applied. */
  strategy: GradeResolutionStrategy;
  /** Which attempt the effective grade came from. */
  source: "ORIGINAL" | "RECOVERY" | "AVERAGE";
  reason: string;
}

export class GradeResolutionEngine {
  resolve(input: GradeResolutionInput): GradeResolutionResult {
    const strategy = this.normalizeStrategy(input.strategy);
    const { originalGrade, recoveryGrade } = input;

    // With no prior grade, the recovery attempt is the only value we have.
    if (originalGrade === null) {
      return {
        effectiveGrade: recoveryGrade,
        strategy,
        source: "RECOVERY",
        reason: "Sem nota original; usada a nota de recuperação",
      };
    }

    switch (strategy) {
      case GRADE_RESOLUTION_STRATEGY.LAST_SCORE:
      case GRADE_RESOLUTION_STRATEGY.REPLACE:
        return {
          effectiveGrade: recoveryGrade,
          strategy,
          source: "RECOVERY",
          reason: "Nota de recuperação substitui a original",
        };

      case GRADE_RESOLUTION_STRATEGY.AVERAGE: {
        const avg = Math.round(((originalGrade + recoveryGrade) / 2) * 100) / 100;
        return {
          effectiveGrade: avg,
          strategy,
          source: "AVERAGE",
          reason: `Média entre original (${originalGrade}) e recuperação (${recoveryGrade})`,
        };
      }

      case GRADE_RESOLUTION_STRATEGY.BEST_SCORE:
      default: {
        if (recoveryGrade >= originalGrade) {
          return {
            effectiveGrade: recoveryGrade,
            strategy: GRADE_RESOLUTION_STRATEGY.BEST_SCORE,
            source: "RECOVERY",
            reason: `Melhor nota: recuperação (${recoveryGrade} >= ${originalGrade})`,
          };
        }
        return {
          effectiveGrade: originalGrade,
          strategy: GRADE_RESOLUTION_STRATEGY.BEST_SCORE,
          source: "ORIGINAL",
          reason: `Melhor nota: original (${originalGrade} > ${recoveryGrade})`,
        };
      }
    }
  }

  private normalizeStrategy(strategy?: GradeResolutionStrategy): GradeResolutionStrategy {
    const values = Object.values(GRADE_RESOLUTION_STRATEGY) as string[];
    if (strategy && values.includes(strategy)) return strategy;
    return DEFAULT_GRADE_RESOLUTION_STRATEGY;
  }
}

export const gradeResolutionEngine = new GradeResolutionEngine();
