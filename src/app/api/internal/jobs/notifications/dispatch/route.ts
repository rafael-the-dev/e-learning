import { NextRequest, NextResponse } from "next/server";
import {
  runNotificationDispatchJob,
  type NotificationDispatchJobResult,
} from "@/server/jobs/notification-dispatch.job";

// =============================================================================
// POST /api/internal/jobs/notifications/dispatch
//
// Triggers the notification dispatcher across every active organization (or
// a single one, when given).
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
// { "organizationId"?: "<id>", "limit"?: number }
// organizationId restricts the run to a single organization. limit caps how
// many due deliveries are processed per organization (default 100, max 500).
//
// Response
// --------
// 200  NotificationDispatchJobResult — processed/sent/delivered/failed/errors summary.
// 401  Unauthorized — missing or incorrect secret.
// 500  Internal server error — unexpected failure; no stack trace is exposed.
// =============================================================================

export async function POST(
  req: NextRequest
): Promise<NextResponse<NotificationDispatchJobResult | { error: string }>> {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const provided = req.headers.get("x-internal-job-secret");

  // Fail closed: reject if env var is absent OR header does not match.
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    let organizationId: string | undefined;
    let limit: number | undefined;

    try {
      const body = await req.json();
      if (body && typeof body.organizationId === "string") {
        organizationId = body.organizationId;
      }
      if (body && typeof body.limit === "number" && Number.isFinite(body.limit)) {
        limit = body.limit;
      }
    } catch {
      // No body or non-JSON body — proceed with defaults.
    }

    const result = await runNotificationDispatchJob({ organizationId, limit });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
