import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateMetricsService } from "@/modules/certificates/services/certificate-metrics.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// GET /api/certificates/metrics (Phase 14) — admin. Thin shell: authenticate →
// read service (authorizes `certificates.view`, tenant-scoped) → windowed action
// counts (today / 7d / 30d) from existing tables. No repository logic, no replay,
// no Academic read.
export async function GET(): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const result = await certificateMetricsService.getMetrics(context);
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
