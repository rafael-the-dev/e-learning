import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateRequestStudentReadService } from "@/modules/certificates/services/certificate-request-read.service";
import { RequestCertificateCommand } from "@/modules/certificates/commands/request-certificate.command";
import { mapCertificateError, parseStudentListQuery } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// /api/student/certificates/requests (Phase 12) — student, own scope
//   GET  → the student's OWN requests (read service; studentId from session).
//   POST → the student requests a certificate for THEMSELVES.
// A `studentId` in the body is ignored — the command always resolves self.
// =============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseStudentListQuery(new URL(req.url).searchParams);
    return NextResponse.json(await certificateRequestStudentReadService.list(context, filters));
  } catch (err) {
    return mapCertificateError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // No `studentId` — a student may only request for self (enforced in the command).
    const result = await new RequestCertificateCommand(
      {
        certificateType: body.certificateType as string,
        transcriptVersionId: body.transcriptVersionId as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapCertificateError(err);
  }
}
