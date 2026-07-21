import { NextRequest, NextResponse } from "next/server";
import {
  runReconcileRiskProjectionsJob,
  type ReconcileRiskProjectionsJobResult,
} from "@/server/jobs/reconcile-risk-projections.job";

// =============================================================================
// POST /api/internal/jobs/reconcile-risk-projections
//
// Triggers the periodic risk-projection reconciliation (F-H3): a full ("all")
// reconcile per organization that heals time-driven drift, lost/FAILED events and
// version/coverage drift, and updates each org's coverage rollout state.
//
// Security: must carry the x-internal-job-secret header matching INTERNAL_JOB_SECRET
// (same contract as the daily-billing job). Fail-closed when the env var is absent.
//
// Body (optional JSON): { "organizationId": "<id>", "batchSize": <n> } for a targeted run.
//
// Response: 200 ReconcileRiskProjectionsJobResult · 401 Unauthorized · 500 Internal error.
// =============================================================================

export async function POST(
  req: NextRequest
): Promise<NextResponse<ReconcileRiskProjectionsJobResult | { error: string }>> {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const provided = req.headers.get("x-internal-job-secret");

  // Fail closed: reject if the env var is absent OR the header does not match.
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    let organizationId: string | undefined;
    let maxBatches: number | undefined;
    let maxDurationMs: number | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.organizationId === "string") organizationId = body.organizationId;
      if (body && typeof body.maxBatches === "number") maxBatches = body.maxBatches;
      if (body && typeof body.maxDurationMs === "number") maxDurationMs = body.maxDurationMs;
    } catch {
      // No / non-JSON body — unbounded run.
    }

    const result = await runReconcileRiskProjectionsJob({ organizationId, maxBatches, maxDurationMs });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
