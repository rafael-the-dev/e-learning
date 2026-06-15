import { NextRequest, NextResponse } from "next/server";
import {
  runDailyBillingJob,
  type DailyBillingJobResult,
} from "@/server/jobs/daily-billing.job";

// =============================================================================
// POST /api/internal/jobs/daily-billing
//
// Triggers the daily overdue-processing job.
//
// Security
// --------
// The request must carry the x-internal-job-secret header whose value matches
// the INTERNAL_JOB_SECRET environment variable. This route is not protected by
// a user session and must never be exposed publicly without that secret.
//
// If INTERNAL_JOB_SECRET is not set in the environment the route always returns
// 401 (fail-closed), preventing accidental exposure in mis-configured deploys.
//
// Body (optional JSON)
// --------------------
// { "organizationId": "<id>" }
// When supplied, only that organization is processed. Useful for targeted
// re-runs after fixing a data issue without re-processing the entire tenant set.
//
// Response
// --------
// 200  DailyBillingJobResult — job summary with counts, errors, warnings.
// 401  Unauthorized — missing or incorrect secret.
// 500  Internal server error — unexpected failure; no stack trace is exposed.
// =============================================================================

export async function POST(req: NextRequest): Promise<NextResponse<DailyBillingJobResult | { error: string }>> {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const provided = req.headers.get("x-internal-job-secret");

  // Fail closed: reject if env var is absent OR header does not match.
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    let organizationId: string | undefined;

    try {
      const body = await req.json();
      if (body && typeof body.organizationId === "string") {
        organizationId = body.organizationId;
      }
    } catch {
      // No body or non-JSON body — proceed without organizationId.
    }

    const result = await runDailyBillingJob({ organizationId });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
