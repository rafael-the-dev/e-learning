import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { RestoreCertificateCommand } from "@/modules/certificates/commands/restore-certificate.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/:id/restore (Phase 10) — thin shell over RestoreCertificateCommand
// (authorize: certificates.suspend; reason optional). No business rule in the route.
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
    const result = await new RestoreCertificateCommand(
      { certificateId: id, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
