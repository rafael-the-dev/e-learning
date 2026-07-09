import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateMaintenanceService } from "@/modules/certificates/services/certificate-maintenance.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// GET /api/certificates/maintenance (Phase 14) — admin. Thin shell: authenticate →
// read service (authorizes `certificates.view`, tenant-scoped) → read-only anomaly
// report (orphan/stuck/failed exports + verification integrity). Detection only, no
// mutation, no repository logic, no Academic read.
export async function GET(): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const result = await certificateMaintenanceService.getReport(context);
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
