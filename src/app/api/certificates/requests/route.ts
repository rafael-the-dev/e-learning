import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateRequestAdminReadService } from "@/modules/certificates/services/certificate-request-read.service";
import { RequestCertificateCommand } from "@/modules/certificates/commands/request-certificate.command";
import { mapCertificateError, parseRequestAdminListFilters } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// /api/certificates/requests (Phase 12) — admin/secretary
//   GET  → org-scoped, filtered, paginated request list (read service).
//   POST → staff-created request for a student (RequestCertificateCommand).
// Thin transport shell; authorization + rules live in the read service / command.
// =============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseRequestAdminListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await certificateRequestAdminReadService.list(context, filters));
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
    const result = await new RequestCertificateCommand(
      {
        certificateType: body.certificateType as string,
        transcriptVersionId: body.transcriptVersionId as string | undefined,
        studentId: body.studentId as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapCertificateError(err);
  }
}
