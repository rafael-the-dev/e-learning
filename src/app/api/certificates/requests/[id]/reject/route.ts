import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { RejectCertificateRequestCommand } from "@/modules/certificates/commands/reject-certificate-request.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/requests/:id/reject (Phase 12) — thin shell (reason required).
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
    const result = await new RejectCertificateRequestCommand(
      { requestId: id, reason: (body.reason as string) ?? "" },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
