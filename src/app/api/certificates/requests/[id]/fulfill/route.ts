import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { FulfillCertificateRequestCommand } from "@/modules/certificates/commands/fulfill-certificate-request.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/requests/:id/fulfill (Phase 12) — thin shell; generates the
// certificate via GenerateCertificateCommand (no auto-issue). No business rule here.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new FulfillCertificateRequestCommand(
      { requestId: id, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
