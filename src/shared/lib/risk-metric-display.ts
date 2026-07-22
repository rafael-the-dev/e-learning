import type {
  RiskMetric,
  RiskMetricUnavailableReason,
} from "@/modules/students/services/risk-projection-readiness.service";

// =============================================================================
// RISK METRIC — presentation helpers (F-M8)
//
// The UI must never render an UNAVAILABLE risk figure as "0" — a real zero is a
// valid result ("nobody at risk"), while UNAVAILABLE means the canonical projection
// cannot be evaluated yet. These helpers map the availability envelope to PT-PT text
// so every dashboard renders the same explicit "em preparação" / "indisponível" state.
// =============================================================================

// NOT_STARTED / RUNNING / INCOMPLETE read as "being prepared"; FAILED as "unavailable".
export const RISK_METRIC_UNAVAILABLE_LABEL: Record<RiskMetricUnavailableReason, string> = {
  PROJECTION_NOT_STARTED: "Dados de risco em preparação",
  PROJECTION_RUNNING: "Dados de risco em preparação",
  PROJECTION_INCOMPLETE: "Dados de risco em preparação",
  PROJECTION_FAILED: "Dados de risco indisponíveis",
};

/** Short chip/badge text for an unavailable metric ("Em preparação" / "Indisponível"). */
export const RISK_METRIC_UNAVAILABLE_SHORT: Record<RiskMetricUnavailableReason, string> = {
  PROJECTION_NOT_STARTED: "Em preparação",
  PROJECTION_RUNNING: "Em preparação",
  PROJECTION_INCOMPLETE: "Em preparação",
  PROJECTION_FAILED: "Indisponível",
};

export function isRiskMetricAvailable<T>(
  metric: RiskMetric<T>
): metric is Extract<RiskMetric<T>, { status: "AVAILABLE" }> {
  return metric.status === "AVAILABLE";
}

/**
 * StatCard-friendly rendering of a numeric risk metric: the number when available, otherwise a
 * neutral dash value + the explicit "em preparação/indisponível" description (never "0").
 */
export function riskMetricNumberDisplay(metric: RiskMetric<number>): {
  value: string;
  description: string | undefined;
  unavailable: boolean;
} {
  if (metric.status === "AVAILABLE") {
    return { value: String(metric.data), description: undefined, unavailable: false };
  }
  return { value: "—", description: RISK_METRIC_UNAVAILABLE_LABEL[metric.reason], unavailable: true };
}
