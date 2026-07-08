import { NextResponse } from "next/server";
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import type {
  CertificateAdminListFilters,
  CertificateRequestAdminListFilters,
} from "@/modules/certificates/types/portal";
import type { CertificateExportDownloadResult } from "@/modules/certificates/types/export";

// =============================================================================
// CERTIFICATE PORTAL — HTTP HELPERS (Phase 10)
// -----------------------------------------------------------------------------
// Shared, thin helpers for the authenticated certificate portal routes: a typed
// error → status mapping and admin list-query parsing. NO business logic — routes
// stay a transport shell over the read services + commands.
// =============================================================================

/** Map a command/service typed error to a JSON response (generic messages; no leak). */
export function mapCertificateError(err: unknown): NextResponse {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message, fieldErrors: err.fieldErrors }, { status: 422 });
  }
  if (err instanceof BusinessRuleError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  if (err instanceof AuthorizationError) {
    return NextResponse.json({ error: "Sem permissão para executar esta ação" }, { status: 403 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
}

/** Sanitize a certificate number into a header-safe `Content-Disposition` filename stem. */
export function safeCertificateFilename(certificateNumber: string): string {
  const cleaned = certificateNumber.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "certificate";
}

/** Build the authenticated PDF-download response from a download-service result: bytes
 *  streamed through the server with the security headers (`private, no-store`, `nosniff`,
 *  attachment + sanitized filename, and an `ETag` when a file checksum exists). Shared by
 *  the Phase 8C route and the student alias so the header contract cannot drift. Never
 *  exposes a `fileUrl` / storage key. */
export function buildCertificateDownloadResponse(
  result: CertificateExportDownloadResult
): NextResponse {
  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename="${safeCertificateFilename(result.certificateNumber)}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (result.fileChecksum) headers.ETag = `"${result.fileChecksum}"`;
  return new NextResponse(new Uint8Array(result.buffer), { status: 200, headers });
}

function parseIntParam(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateParam(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Parse the admin list filters from a URL's query string. Unknown params are ignored. */
export function parseAdminListFilters(searchParams: URLSearchParams): CertificateAdminListFilters {
  return {
    studentId: searchParams.get("studentId") ?? undefined,
    courseId: searchParams.get("courseId") ?? undefined,
    certificateType: searchParams.get("certificateType") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    issuedFrom: parseDateParam(searchParams.get("issuedFrom")),
    issuedTo: parseDateParam(searchParams.get("issuedTo")),
    search: searchParams.get("search") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the admin certificate-request list filters from a URL's query string. */
export function parseRequestAdminListFilters(
  searchParams: URLSearchParams
): CertificateRequestAdminListFilters {
  return {
    status: searchParams.get("status") ?? undefined,
    studentId: searchParams.get("studentId") ?? undefined,
    certificateType: searchParams.get("certificateType") ?? undefined,
    createdFrom: parseDateParam(searchParams.get("createdFrom")),
    createdTo: parseDateParam(searchParams.get("createdTo")),
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}

/** Parse the narrow student list filters (status/type/page) from a query string. */
export function parseStudentListQuery(searchParams: URLSearchParams): {
  status?: string;
  certificateType?: string;
  page?: number;
  pageSize?: number;
} {
  return {
    status: searchParams.get("status") ?? undefined,
    certificateType: searchParams.get("certificateType") ?? undefined,
    page: parseIntParam(searchParams.get("page")),
    pageSize: parseIntParam(searchParams.get("pageSize")),
  };
}
