import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { ApproveCertificateCommand } from "@/modules/certificates/commands/approve-certificate.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/:id/approve — thin shell over ApproveCertificateCommand
// (authorize: certificates.generate). Records the approval provenance for a
// PENDING_APPROVAL certificate so it can be issued. No business rule in the route.
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
    const result = await new ApproveCertificateCommand(
      { certificateId: id, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
