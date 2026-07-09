import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateOperationalService } from "@/modules/certificates/services/certificate-operational.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// GET /api/certificates/outbox (Phase 14) — admin. Thin shell: authenticate → read
// service (authorizes `certificates.view`) → SANITIZED outbox delivery summary
// (counts + dead-letter envelope; never event payloads). No repository logic, no
// mutation.
export async function GET(): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const result = await certificateOperationalService.getOutboxSummary(context);
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
