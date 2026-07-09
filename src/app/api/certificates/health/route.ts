import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateHealthService } from "@/modules/certificates/services/certificate-health.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// GET /api/certificates/health (Phase 14) — admin. Thin shell: authenticate →
// read service (which authorizes `certificates.view` + scopes by tenant) → aggregate
// KPIs. No repository logic, no business rules, no Academic read. Aggregates only.
export async function GET(): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const result = await certificateHealthService.getHealth(context);
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
