// =============================================================================
// UNIFIED GRADE CALCULATION SERVICE
// Single source of truth for all grade calculations — used by both the
// continuous-assessment (Grade Engine) and scheduled-exam (Assessment Engine)
// flows. Both engines write StudentAssessmentResult; this service reads them
// and produces StudentSubjectProgress.
// =============================================================================

export interface GradeComponentScore {
  componentId: string;
  weight: number;
  maxGrade: number;
  grade: number | null;
  normalizedGrade: number | null;
  isRequired: boolean;
}

export interface GradeCalculationInput {
  calculationMethod: string;
  roundingMethod: string;
  minimumPassingGrade: number;
  allowRecovery: boolean;
  components: GradeComponentScore[];
  attendancePercentage?: number | null;
  minimumAttendancePercentage?: number | null;
}

export interface GradeCalculationResult {
  finalGrade: number | null;
  status: "PASSED" | "FAILED" | "RECOVERY_REQUIRED" | "IN_PROGRESS" | "BLOCKED" | "INCOMPLETE";
  reason: string;
}

export class GradeCalculationService {
  normalizeGrade(grade: number, maxGrade: number): number {
    if (maxGrade <= 0) return 0;
    return Math.round((grade / maxGrade) * 10000) / 100;
  }

  applyRounding(value: number, roundingMethod: string): number {
    switch (roundingMethod) {
      case "ROUND":
      case "NEAREST_INTEGER":
        return Math.round(value);
      case "FLOOR":
        return Math.floor(value);
      case "CEIL":
        return Math.ceil(value);
      case "ONE_DECIMAL":
        return Math.round(value * 10) / 10;
      case "TWO_DECIMALS":
        return Math.round(value * 100) / 100;
      case "NONE":
      default:
        return Math.round(value * 100) / 100;
    }
  }

  calculateFinalGrade(input: GradeCalculationInput): GradeCalculationResult {
    const { components, calculationMethod, roundingMethod, minimumPassingGrade, allowRecovery } = input;

    const requiredMissing = components.filter(
      (c) => c.isRequired && c.normalizedGrade === null
    );
    if (requiredMissing.length > 0) {
      return {
        finalGrade: null,
        status: "BLOCKED",
        reason: "Componentes obrigatórios sem classificação",
      };
    }

    const scoredComponents = components.filter((c) => c.normalizedGrade !== null);
    if (scoredComponents.length === 0) {
      return {
        finalGrade: null,
        status: "IN_PROGRESS",
        reason: "Nenhuma classificação registada",
      };
    }

    let finalGrade: number;

    if (calculationMethod === "WEIGHTED_AVERAGE") {
      const totalWeight = scoredComponents.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight === 0) {
        return {
          finalGrade: null,
          status: "IN_PROGRESS",
          reason: "Peso total dos componentes é zero",
        };
      }
      finalGrade = scoredComponents.reduce(
        (sum, c) => sum + c.normalizedGrade! * (c.weight / totalWeight),
        0
      );
    } else {
      finalGrade =
        scoredComponents.reduce((sum, c) => sum + c.normalizedGrade!, 0) /
        scoredComponents.length;
    }

    finalGrade = this.applyRounding(finalGrade, roundingMethod);

    // Attendance check.
    // NOTE (Grade Engine Final Sprint): this gate is currently dormant in
    // production. The Attendance Engine is out of scope, so callers pass
    // attendancePercentage: null and this branch is never taken. The logic is
    // retained (and unit-tested) so the gate activates automatically once a real
    // attendance percentage is supplied. See subject-progress-cascade.service.ts.
    if (
      input.minimumAttendancePercentage != null &&
      input.attendancePercentage != null &&
      input.attendancePercentage < input.minimumAttendancePercentage
    ) {
      return {
        finalGrade,
        status: "INCOMPLETE",
        reason: `Frequência abaixo do mínimo obrigatório (${input.attendancePercentage.toFixed(1)}% < ${input.minimumAttendancePercentage}%)`,
      };
    }

    if (finalGrade >= minimumPassingGrade) {
      return {
        finalGrade,
        status: "PASSED",
        reason: `Aprovado (${finalGrade} >= ${minimumPassingGrade})`,
      };
    }

    if (allowRecovery) {
      return {
        finalGrade,
        status: "RECOVERY_REQUIRED",
        reason: `Recuperação necessária (${finalGrade} < ${minimumPassingGrade})`,
      };
    }

    return {
      finalGrade,
      status: "FAILED",
      reason: `Reprovado (${finalGrade} < ${minimumPassingGrade})`,
    };
  }
}

export const gradeCalculationService = new GradeCalculationService();
