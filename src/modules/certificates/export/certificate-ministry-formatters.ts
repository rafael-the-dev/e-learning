import { CertificateMinistryFormat } from "@/modules/certificates/constants";
import type {
  CertificateMinistryArtifact,
  CertificateMinistryFormatter,
  CertificateMinistryPayload,
} from "@/modules/certificates/types/ministry";
import { MINISTRY_PAYLOAD_FIELDS } from "./certificate-ministry-payload";

// =============================================================================
// CERTIFICATE MINISTRY FORMATTERS (Phase 11) — pure, deterministic adapters
// -----------------------------------------------------------------------------
// Serialize the normalized ministry payload to JSON / CSV / XML. Each formatter is
// PURE and DETERMINISTIC: same payload → byte-identical output, no DB, no clock, no
// business logic, no side effect. Fields are emitted in the fixed
// `MINISTRY_PAYLOAD_FIELDS` order so the artifact (and its checksum) is stable. No
// external library is used (none is needed).
// =============================================================================

/** Stringify a payload value for a flat text format (null → empty string). */
function cell(value: string | null): string {
  return value ?? "";
}

// ─── JSON (stable key order via the field allow-list) ─────────────────────────

export const certificateMinistryJsonFormatter: CertificateMinistryFormatter = {
  format(payload: CertificateMinistryPayload): CertificateMinistryArtifact {
    const ordered: Record<string, string | null> = {};
    for (const key of MINISTRY_PAYLOAD_FIELDS) ordered[key] = payload[key];
    return {
      content: JSON.stringify(ordered, null, 2),
      contentType: "application/json",
      format: CertificateMinistryFormat.JSON,
    };
  },
};

// ─── CSV (header row + RFC-4180 escaping) ─────────────────────────────────────

/** Quote a CSV field iff it contains a comma, quote, CR, or LF; double internal quotes. */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const certificateMinistryCsvFormatter: CertificateMinistryFormatter = {
  format(payload: CertificateMinistryPayload): CertificateMinistryArtifact {
    const header = MINISTRY_PAYLOAD_FIELDS.join(",");
    const row = MINISTRY_PAYLOAD_FIELDS.map((k) => csvEscape(cell(payload[k]))).join(",");
    return {
      content: `${header}\r\n${row}`,
      contentType: "text/csv",
      format: CertificateMinistryFormat.CSV,
    };
  },
};

// ─── XML (escaped text + root element) ────────────────────────────────────────

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const certificateMinistryXmlFormatter: CertificateMinistryFormatter = {
  format(payload: CertificateMinistryPayload): CertificateMinistryArtifact {
    const body = MINISTRY_PAYLOAD_FIELDS.map(
      (k) => `  <${k}>${xmlEscape(cell(payload[k]))}</${k}>`
    ).join("\n");
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<certificate>\n${body}\n</certificate>`;
    return {
      content,
      contentType: "application/xml",
      format: CertificateMinistryFormat.XML,
    };
  },
};

const FORMATTERS: Record<CertificateMinistryFormat, CertificateMinistryFormatter> = {
  [CertificateMinistryFormat.JSON]: certificateMinistryJsonFormatter,
  [CertificateMinistryFormat.CSV]: certificateMinistryCsvFormatter,
  [CertificateMinistryFormat.XML]: certificateMinistryXmlFormatter,
};

/** Dispatch to the formatter for a format. Pure. */
export function formatMinistryPayload(
  payload: CertificateMinistryPayload,
  format: CertificateMinistryFormat
): CertificateMinistryArtifact {
  return FORMATTERS[format].format(payload);
}
