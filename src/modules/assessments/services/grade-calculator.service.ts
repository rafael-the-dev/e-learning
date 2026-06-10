// =============================================================================
// GRADE CALCULATOR SERVICE
// Handles weighted/simple average, rounding, and passing logic.
// =============================================================================

export interface ComponentScore {
  weight: number;
  normalizedScore: number | null;
  isRequired: boolean;
}

export interface GradeCalculationInput {
  calculationMethod: string;
  roundingMethod: string;
  minimumPassingGrade: number;
  allowRetake: boolean;
  components: ComponentScore[];
  attendancePercentage: number | null;
  minimumAttendancePercentage: number | null;
}

export interface GradeCalculationResult {
  finalGrade: number | null;
  status: "PASSED" | "FAILED" | "INCOMPLETE" | "BLOCKED";
  reason: string;
}

export class GradeCalculatorService {
  calculateNormalizedScore(score: number, maxScore: number): number {
    if (maxScore <= 0) return 0;
    return Math.round((score / maxScore) * 10000) / 100;
  }

  applyRounding(value: number, roundingMethod: string): number {
    switch (roundingMethod) {
      case "NEAREST_INTEGER":
        return Math.round(value);
      case "ONE_DECIMAL":
        return Math.round(value * 10) / 10;
      case "TWO_DECIMALS":
        return Math.round(value * 100) / 100;
      case "NONE":
      default:
        return value;
    }
  }

  calculateFinalGrade(input: GradeCalculationInput): GradeCalculationResult {
    const { components, calculationMethod, roundingMethod, minimumPassingGrade } = input;

    // Check for required components with no score
    const missingRequired = components.filter(
      (c) => c.isRequired && c.normalizedScore === null
    );
    if (missingRequired.length > 0) {
      return {
        finalGrade: null,
        status: "BLOCKED",
        reason: "Componentes obrigatórios sem avaliação",
      };
    }

    const scoredComponents = components.filter((c) => c.normalizedScore !== null);
    if (scoredComponents.length === 0) {
      return {
        finalGrade: null,
        status: "INCOMPLETE",
        reason: "Nenhuma avaliação registada",
      };
    }

    let finalGrade: number;

    if (calculationMethod === "WEIGHTED_AVERAGE") {
      const totalWeight = scoredComponents.reduce((sum, c) => sum + c.weight, 0);
      if (totalWeight === 0) {
        return {
          finalGrade: null,
          status: "INCOMPLETE",
          reason: "Peso total dos componentes é zero",
        };
      }
      const weightedSum = scoredComponents.reduce(
        (sum, c) => sum + c.normalizedScore! * c.weight,
        0
      );
      finalGrade = weightedSum / totalWeight;
    } else {
      // SIMPLE_AVERAGE
      const sum = scoredComponents.reduce((s, c) => s + c.normalizedScore!, 0);
      finalGrade = sum / scoredComponents.length;
    }

    finalGrade = this.applyRounding(finalGrade, roundingMethod);

    // Check attendance
    if (
      input.minimumAttendancePercentage !== null &&
      input.attendancePercentage !== null &&
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
        reason: `Nota mínima atingida (${finalGrade} >= ${minimumPassingGrade})`,
      };
    }

    return {
      finalGrade,
      status: "FAILED",
      reason: `Nota final abaixo do mínimo (${finalGrade} < ${minimumPassingGrade})`,
    };
  }
}

export const gradeCalculatorService = new GradeCalculatorService();
