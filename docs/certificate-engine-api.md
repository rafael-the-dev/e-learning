# Certificate Engine — API Integration Manual

> Audience: engineers integrating with the Certificate Engine HTTP surface.
> This documents **every public API route** the engine exposes, its request and
> response contracts, error codes and DTOs. It does not document internal services,
> repositories, or commands — for those see
> [`certificate-engine-v1-architecture.md`](./certificate-engine-v1-architecture.md).

---

## 1. Overview

The Certificate Engine exposes three route families:

| Family | Base path | Auth | Consumer |
|---|---|---|---|
| **Admin / secretary** | `/api/certificates/**` | Session + org | Backoffice, secretary portal |
| **Student** | `/api/student/certificates/**` | Session + org (own-scope) | Student portal |
| **Public** | `/api/public/certificates/**` | None | Anyone verifying a certificate |

All routes are **thin transport shells**: authentication is checked in the route;
authorization, tenant scoping and business rules live in the command/service the
route delegates to. No route implements a business rule, recomputes eligibility, or
reads Academic Core / Transcript data.

Request/response bodies are JSON (`Content-Type: application/json`), except the two
**download** endpoints (binary `application/pdf` stream) and the query-string
filters on list endpoints. All dates are ISO-8601 strings in JSON.

`organizationId` and the acting `studentId` are **always** derived server-side from
the authenticated session — they are never read from the request body or query, and
supplying them has no effect.

---

## 2. Authentication

Authenticated routes call `requireOrganization()`, which resolves the Auth.js
session and the active organization. On failure the route returns:

```
401 { "error": "Não autenticado" }
```

- Session cookies are `httpOnly`, `secure`, `sameSite` (managed by Auth.js).
- The **public** verification route (`/api/public/certificates/verify/...`) requires
  no session — it is registered in `PUBLIC_PATHS` (`src/proxy.ts`) and is
  rate-limited per client IP instead.

There are no API keys or bearer tokens in v1; integration is via the authenticated
session.

---

## 3. Permissions

Authorization is server-side (CASL/RBAC), default-deny. A caller lacking the
required permission gets `403`.

| Permission | Grants |
|---|---|
| `certificates.view` | Read within the tenant (admin/secretary lists + detail + operational endpoints). |
| `certificates.viewOwn` | Student reads/downloads their own certificates. |
| `certificates.generate` | Generate; review requests (approve / reject / fulfil). |
| `certificates.issue` | Issue a certificate. |
| `certificates.revoke` | Revoke a certificate. |
| `certificates.suspend` | Suspend **and** restore (restore reuses this permission). |
| `certificates.export` | Export (PDF + ministry). |
| `certificates.request` | Request a certificate; cancel one's own request. |
| `certificates.verify` | Internal verification (not required by the public endpoint). |
| `certificatePolicies.manage` / `certificateTemplates.manage` | Manage config (no HTTP routes in v1). |

`GUARDIAN` has no certificate access (denied by default). `TEACHER` is denied on
certificate download.

---

## 4. HTTP status codes

Every authenticated route maps typed domain errors to status codes through one
shared mapper (`mapCertificateError`):

| Code | Meaning | Body |
|---|---|---|
| `200` | Success (read, lifecycle mutation, bulk run — including partial failures). | Endpoint DTO |
| `201` | Resource created (generate, export, request create). | Endpoint DTO |
| `400` | Malformed public verification code (public route only). | `{ error }` |
| `401` | Not authenticated. | `{ "error": "Não autenticado" }` |
| `403` | Authenticated but lacking permission / not accessible. | `{ "error": "Sem permissão para executar esta ação" }` |
| `404` | Not found, unknown id, or cross-tenant (never leaks existence). | `{ "error": "Certificado não encontrado" }` |
| `409` | Conflict — the owner's export exists but is not READY (download only). | `{ "error": "A exportação ainda não está pronta" }` |
| `422` | Validation error (Zod) or a business-rule violation. | `{ error, fieldErrors? }` |
| `429` | Rate limit exceeded (public route only). | `{ error }` + `Retry-After` |
| `500` | Unexpected/internal error (generic, no leakage). | `{ "error": "Erro interno no servidor" }` |

`422` carries an optional `fieldErrors` object (Zod's flattened field → messages)
for validation failures; a business-rule violation (e.g. an invalid state
transition) returns `422` with a message and no `fieldErrors`. Note: bulk endpoints
return `200` for **per-item** failures — the run itself succeeded; only invalid
envelope input or an unauthorized caller throws `422`/`401`/`403`.

---

## 5. DTO reference

### `CertificateAllowedActions`
Server-computed action flags (the UI renders these; it never infers rules).
```ts
{ canIssue, canRevoke, canSuspend, canRestore, canExport, canDownload: boolean }
```

### `CertificateListItemDto`
```ts
{
  id: string;
  certificateNumber: string | null;
  certificateType: string;
  status: string;                 // DRAFT|PENDING_APPROVAL|ISSUED|SUSPENDED|REVOKED|STALE
  publicStatus: string | null;    // VALID|REVOKED|SUSPENDED|EXPIRED|NOT_FOUND
  studentName: string | null;
  courseName: string | null;
  issuedAt: string | null;        // ISO-8601
  expiresAt: string | null;
  allowedActions: CertificateAllowedActions;
}
```

### `CertificateListResult`
```ts
{ items: CertificateListItemDto[]; total: number; page: number; pageSize: number }
```

### `CertificateExportSummaryDto`
```ts
{ id: string; exportType: string; status: string; exportedAt: string | null; canDownload: boolean }
```
Never carries `fileUrl` / storage key / raw checksum.

### `CertificateEventSummaryDto` (admin detail only)
```ts
{ eventType, previousStatus|null, newStatus|null, actorId|null, reason|null, createdAt }
```

### `AdminCertificateDetailDto`
```ts
{
  id; certificateNumber|null; certificateType; status; publicStatus|null;
  studentName|null; courseName|null;
  studentSnapshot: object;            // frozen snapshot (not a transcript read)
  courseSnapshot: object | null;
  issueBasisSummary: object;          // safe summary (type + finance flags), never the raw blob
  transcriptNumber: string;
  financialClearanceStatus: string;   // NOT_REQUIRED|CLEARED|NOT_CLEARED|UNKNOWN
  issuedAt|null; issuedBy|null; expiresAt|null; verificationCode|null;
  exports: CertificateExportSummaryDto[];
  events: CertificateEventSummaryDto[];
  allowedActions: CertificateAllowedActions;
}
```

### `StudentCertificateDetailDto` (redacted)
```ts
{
  id; certificateNumber|null; certificateType; status; publicStatus|null;
  studentName|null; courseName|null; issuedAt|null; expiresAt|null;
  exports: CertificateExportSummaryDto[];
  allowedActions: CertificateAllowedActions;
}
```
No events, no checksums, no transcript pointer, no finance reference, no internal ids.

### `CertificateExportResultDto` (POST export result)
```ts
{ exportId; certificateId; exportType; status; fileUrl: string|null; fileChecksum: string|null; exportedAt: string|null }
```
> `fileUrl` here is an internal storage reference for server use — **do not fetch it
> from a client**. Download bytes only through the authenticated download endpoint
> (§7). Portal list/detail DTOs never expose it.

### Bulk (`BulkOperationResult<TInput, TResult>`)
```ts
{
  total: number; succeeded: number; failed: number; skipped: number;  // total === succeeded+failed+skipped
  items: Array<{
    index: number; success: boolean; skipped: boolean;
    input: TInput;
    result?: TResult;
    error?: { code: string; message: string };  // machine-readable, no internal leak
  }>;
}
```
`skipped` items were not attempted because an earlier failure stopped the run
(`stopOnFailure: true`).

### Certificate request DTOs
```ts
CertificateRequestListItemDto {
  requestId; studentId; certificateType; status;   // PENDING|APPROVED|REJECTED|FULFILLED|CANCELLED
  transcriptVersionId: string|null; reason: string|null;
  createdAt; reviewedAt: string|null; fulfilledCertificateId: string|null;
  allowedActions: { canApprove, canReject, canCancel, canFulfill: boolean };
}
CertificateRequestListResult { items; total; page; pageSize }
```

### `CertificatePublicVerificationDto` (public)
```ts
{
  status: string;              // VALID|REVOKED|SUSPENDED|EXPIRED|NOT_FOUND
  publicStatus: string;        // duplicate of status
  certificateNumber: string | null;
  certificateType: string | null;
  organizationName: string | null;
  studentDisplayName: string | null;  // masked, e.g. "João S." — never full identity/document
  courseName: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
}
```
No transcript pointer/checksum, no certificate checksum, no grades/attendance/
finance, no internal ids.

### Operational DTOs (Phase 14)
```ts
CertificateHealthKpis {
  totalCertificates, issued, revoked, suspended, stale, pendingApproval, draft,
  exportsReady, exportsFailed, verificationRows, verificationMismatches,
  requestsPending, requestsApproved, requestsFulfilled: number;
  generatedAt: string;
}

CertificateMaintenanceReport {
  orphanExports: { exportId, certificateId, exportType, status, createdAt }[];
  stuckPendingExports: { exportId, certificateId, exportType, createdAt, ageMinutes }[];
  failedExports: { exportId, certificateId, exportType, createdAt }[];
  duplicateVerifications: { key, field: "verificationCode"|"certificateId", count, verificationIds[] }[];
                          // key is "[REDACTED]" for a verificationCode group
  verificationProjectionMismatches: { verificationId, certificateId, certificateStatus, publicStatus, expectedPublicStatus[] }[];
  stuckThresholdMinutes: number;
  generatedAt: string;
}

CertificateMetricCounts { generate, issue, revoke, suspend, restore, export, verification, request: number }
CertificateMetrics { today, last7Days, last30Days: CertificateMetricCounts; generatedAt: string }

OutboxEntrySummary { id, organizationId, eventType, aggregateType, aggregateId,
                     status: "PENDING"|"DELIVERED"|"FAILED", retryCount,
                     enqueuedAt, lastAttemptAt: string|null, nextRetryAt: string|null }
OutboxSummary { total, pending, delivered, failed: number; deadLetter: OutboxEntrySummary[] }
```
Operational responses are **aggregates / structural anomalies only** — never PII,
checksums, storage paths, verification codes, or transcript pointers (verification
codes are redacted in the maintenance report).

---

# Admin / Secretary API

Base path `/api/certificates`. All require an authenticated org session.

## A1. List certificates

- **Route:** `GET /api/certificates`
- **Permission:** `certificates.view`
- **Request (query params, all optional):** `studentId`, `courseId`,
  `certificateType`, `status`, `issuedFrom` (ISO date), `issuedTo` (ISO date),
  `search`, `page`, `pageSize`. Unknown params are ignored.
- **Response:** `200` `CertificateListResult`.
- **Errors:** `401`, `403`, `500`.

**Example**
```
GET /api/certificates?status=ISSUED&certificateType=COURSE_COMPLETION&page=1&pageSize=20
```
```json
{
  "items": [
    { "id": "ckx…", "certificateNumber": "2026/000123", "certificateType": "COURSE_COMPLETION",
      "status": "ISSUED", "publicStatus": "VALID", "studentName": "João Silva",
      "courseName": "Curso de Condução B", "issuedAt": "2026-07-01T09:00:00.000Z",
      "expiresAt": null,
      "allowedActions": { "canIssue": false, "canRevoke": true, "canSuspend": true,
                          "canRestore": false, "canExport": true, "canDownload": true } }
  ],
  "total": 1, "page": 1, "pageSize": 20
}
```

## A2. Certificate detail

- **Route:** `GET /api/certificates/:id`
- **Permission:** `certificates.view`
- **Response:** `200` `AdminCertificateDetailDto`.
- **Errors:** `401`, `403`, `404` (unknown / cross-tenant — no existence leak),
  `500`.

## A3. Generate certificate

- **Route:** `POST /api/certificates/generate`
- **Permission:** `certificates.generate`
- **Request:**
  ```jsonc
  {
    "transcriptVersionId": "string (required)",
    "certificateType": "COURSE_COMPLETION | LEVEL_COMPLETION | PARTICIPATION | ATTENDANCE | ACHIEVEMENT | PROFESSIONAL_TRAINING | DRIVING_SCHOOL | LANGUAGE_COURSE | IT_COURSE | DESIGN_COURSE",
    "policyId": "string (optional)",
    "courseId": "string (optional)",
    "reason": "string ≤500 (optional)"
  }
  ```
  Unknown fields are rejected (`.strict()`).
- **Response:** `201` `GenerateCertificateResult`:
  ```ts
  { certificateId, status, certificateType, transcriptVersionId, transcriptNumber,
    requiresApproval: boolean, blockingReasons: string[], warnings: string[] }
  ```
  A generated certificate is `DRAFT`, or `PENDING_APPROVAL` when the policy requires
  approval (`requiresApproval: true`).
- **Errors:** `401`, `403`, `422` (invalid input, or eligibility blocked —
  `blockingReasons` populated when generation is refused by a business rule), `500`.

**Example**
```json
// → 201
{ "certificateId": "ckz…", "status": "DRAFT", "certificateType": "COURSE_COMPLETION",
  "transcriptVersionId": "ver_…", "transcriptNumber": "T-2026-0007",
  "requiresApproval": false, "blockingReasons": [], "warnings": [] }
```

## A4. Issue certificate

- **Route:** `POST /api/certificates/:id/issue`
- **Permission:** `certificates.issue`
- **Request:** `{ "reason": "string ≤500 (optional)" }` (the id is the path param).
- **Response:** `200` `IssueCertificateResult`:
  ```ts
  { certificateId, status: "ISSUED", certificateNumber, certificateType,
    transcriptVersionId, transcriptNumber, issuedAt, checksum }
  ```
  On issue — and only on issue — the certificate number and content checksum are
  allocated and the public verification row is created.
- **Errors:** `401`, `403`, `404`, `422` (not in an issuable state, or a
  `PENDING_APPROVAL` certificate without a prior approval), `500`.

## A4b. Approve certificate (manual-approval flow)

- **Route:** `POST /api/certificates/:id/approve`
- **Permission:** `certificates.generate` (the review authority).
- **Request:** `{ "reason": "string ≤500 (optional)" }` (the id is the path param).
- **Response:** `200`:
  ```ts
  { certificateId, status: "PENDING_APPROVAL", approvedAt, approvedBy }
  ```
  Records the approval **provenance** (a `certificate.approved` `CertificateEvent`)
  for a `PENDING_APPROVAL` certificate so it becomes issuable via A4. Approval is
  **not** a lifecycle transition — the status stays `PENDING_APPROVAL` until issue.
  Only needed for certificates generated under a policy with
  `requiresManualApproval: true`; a `DRAFT` certificate is issuable without it.
- **Errors:** `401`, `403`, `404`, `422` (not `PENDING_APPROVAL`, or already
  approved — approval is idempotent-refuse), `500`.

## A5. Lifecycle — Revoke / Suspend / Restore

| Action | Route | Permission | Transition | Reason |
|---|---|---|---|---|
| Revoke | `POST /api/certificates/:id/revoke` | `certificates.revoke` | ISSUED\|SUSPENDED → REVOKED (terminal) | **required** |
| Suspend | `POST /api/certificates/:id/suspend` | `certificates.suspend` | ISSUED → SUSPENDED | **required** |
| Restore | `POST /api/certificates/:id/restore` | `certificates.suspend` | SUSPENDED → ISSUED | optional |

- **Request:** `{ "reason": "string ≤500" }` — mandatory for revoke/suspend
  (min length 1), optional for restore.
- **Response:** `200`, shape identical for all three:
  ```ts
  { certificateId, status, previousStatus, publicStatus }
  ```
- **Errors:** `401`, `403`, `404`, `422` (invalid transition for the current state,
  or missing required reason), `500`.

**Example — revoke**
```json
// POST /api/certificates/ckz…/revoke   { "reason": "Emitido por engano" }
// → 200
{ "certificateId": "ckz…", "status": "REVOKED", "previousStatus": "ISSUED", "publicStatus": "REVOKED" }
```

## A6. Export (PDF)

- **Route:** `POST /api/certificates/:id/export`
- **Permission:** `certificates.export`
- **Request:** `{ "exportType": "PDF | API | MINISTRY (optional, default PDF)" }`.
- **Response:** `201` `CertificateExportResultDto`. Creates a `CertificateExport`
  row, renders + persists the artifact, and returns `status: "READY"` on success.
  Emits `certificate.exported`.
- **Errors:** `401`, `403`, `404`, `422` (e.g. `TEMPLATE_NOT_FOUND`, or the
  certificate is not in an exportable state), `500` (storage/render failure — the
  export row is marked `FAILED`).

**Example**
```json
// → 201
{ "exportId": "exp_…", "certificateId": "ckz…", "exportType": "PDF",
  "status": "READY", "fileUrl": "internal://…", "fileChecksum": "sha256:…",
  "exportedAt": "2026-07-09T10:12:00.000Z" }
```
> Use A7 (download) to fetch the bytes — do not fetch `fileUrl` directly.

## A7. Download an export (authenticated)

- **Route:** `GET /api/certificates/exports/:exportId/download`
- **Permission:** `certificates.view` or `certificates.export` (admin/secretary,
  any export in the tenant).
- **Response:** `200` — a binary PDF stream. Headers:
  `Content-Type: application/pdf`,
  `Content-Disposition: attachment; filename="<number>.pdf"`,
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
  and `ETag` when a file checksum exists. The stored `fileUrl` / storage key is
  never redirected to — bytes stream through the server.
- **Errors:** `401`, `403` (authenticated but not permitted), `404` (missing /
  cross-tenant / not accessible), `409` (`"A exportação ainda não está pronta"` —
  the export exists but is not READY), `500` (storage read failure — generic, no
  path leak).
- **Note:** a REVOKED/SUSPENDED certificate still downloads; public verification
  reflects REVOKED/SUSPENDED separately.

## A8. Bulk operations

All under `POST /api/certificates/bulk/*`, all admin, each orchestrates the matching
single-item command **sequentially, one transaction per item**.

| Route | Permission | Item shape | Reason |
|---|---|---|---|
| `bulk/generate` | `certificates.generate` | `{ transcriptVersionId, certificateType, policyId?, courseId? }` | optional |
| `bulk/issue` | `certificates.issue` | `{ certificateId }` | optional |
| `bulk/export` | `certificates.export` | `{ certificateId, exportType? }` | — |
| `bulk/revoke` | `certificates.revoke` | `{ certificateId }` | **required** |
| `bulk/suspend` | `certificates.suspend` | `{ certificateId }` | **required** |
| `bulk/restore` | `certificates.suspend` | `{ certificateId }` | optional |

- **Request (envelope):**
  ```jsonc
  {
    "items": [ /* ≥1 item of the shape above */ ],
    "reason": "string ≤500 (per the table)",
    "stopOnFailure": false   // optional, default false → continue past per-item failures
  }
  ```
- **Response:** `200` `BulkOperationResult` — returned **even with partial
  failures**. Per-item outcomes are in `items[]`.
- **Errors:** `401`, `403`, `422` (invalid envelope — e.g. empty `items`, missing
  required `reason`), `500`. Per-item business failures do **not** throw; they appear
  as `items[i].success = false` with an `error` code.

**Example — bulk issue with one failure**
```json
// POST /api/certificates/bulk/issue
// { "items": [ {"certificateId":"good"}, {"certificateId":"bad"} ] }
// → 200
{
  "total": 2, "succeeded": 1, "failed": 1, "skipped": 0,
  "items": [
    { "index": 0, "success": true,  "skipped": false, "input": {"certificateId":"good"},
      "result": { "certificateId": "good", "status": "ISSUED", "certificateNumber": "2026/000200", … } },
    { "index": 1, "success": false, "skipped": false, "input": {"certificateId":"bad"},
      "error": { "code": "NOT_FOUND", "message": "Certificate not found" } }
  ]
}
```

## A9. Certificate requests (admin/secretary)

### List requests
- **Route:** `GET /api/certificates/requests`
- **Permission:** `certificates.view`
- **Request (query, optional):** `status`, `studentId`, `certificateType`,
  `createdFrom`, `createdTo`, `page`, `pageSize`.
- **Response:** `200` `CertificateRequestListResult`.
- **Errors:** `401`, `403`, `500`.

### Create request (staff, for a student)
- **Route:** `POST /api/certificates/requests`
- **Permission:** `certificates.request` (staff-created; `studentId` accepted here).
- **Request:** `{ certificateType, transcriptVersionId?, studentId?, reason? }`.
- **Response:** `201` `RequestCertificateResult`:
  `{ requestId, status: "PENDING", certificateType, transcriptVersionId: string|null }`.
- **Errors:** `401`, `403`, `422`, `500`.

### Review actions
| Action | Route | Permission | Transition | Reason |
|---|---|---|---|---|
| Approve | `POST /api/certificates/requests/:id/approve` | `certificates.generate` | PENDING → APPROVED | optional |
| Reject | `POST /api/certificates/requests/:id/reject` | `certificates.generate` | PENDING → REJECTED | **required** |
| Cancel | `POST /api/certificates/requests/:id/cancel` | `certificates.generate` | PENDING\|APPROVED → CANCELLED | optional |
| Fulfil | `POST /api/certificates/requests/:id/fulfill` | `certificates.generate` | APPROVED → FULFILLED (generates a certificate) | optional |

- **Request:** `{ "reason": "string ≤500" }` (mandatory for reject).
- **Response `200`:**
  - approve / reject / cancel → `ReviewCertificateRequestResult`
    `{ requestId, status, reviewedAt, reviewedBy }`.
  - fulfil → `FulfillCertificateRequestResult`
    `{ requestId, status: "FULFILLED", fulfilledCertificateId, certificateStatus }`
    (fulfil generates the certificate; it does **not** auto-issue).
- **Errors:** `401`, `403`, `404`, `422` (invalid transition / missing reason),
  `500`.

## A10. Operational — Health

- **Route:** `GET /api/certificates/health`
- **Permission:** `certificates.view`
- **Response:** `200` `CertificateHealthKpis` (aggregate counts + `generatedAt`).
- **Errors:** `401`, `403`, `500`.

## A11. Operational — Maintenance

- **Route:** `GET /api/certificates/maintenance`
- **Permission:** `certificates.view`
- **Response:** `200` `CertificateMaintenanceReport` — read-only anomaly detection
  (orphan / stuck / failed exports + verification duplicates + projection
  mismatches). Detection only; never mutates. Verification codes are redacted
  (`key: "[REDACTED]"`).
- **Errors:** `401`, `403`, `500`.

## A12. Operational — Metrics

- **Route:** `GET /api/certificates/metrics`
- **Permission:** `certificates.view`
- **Response:** `200` `CertificateMetrics` — windowed action counts (`today`,
  `last7Days`, `last30Days`). `verification` is an approximation (counts the most
  recent verification per certificate within the window).
- **Errors:** `401`, `403`, `500`.

## A13. Operational — Outbox

- **Route:** `GET /api/certificates/outbox`
- **Permission:** `certificates.view`
- **Response:** `200` `OutboxSummary` — sanitized delivery counts + the dead-letter
  list (`status: FAILED` entries). Never includes event payloads.
- **Errors:** `401`, `403`, `500`.

**Example**
```json
{ "total": 42, "pending": 0, "delivered": 41, "failed": 1,
  "deadLetter": [ { "id": "outbox-42", "organizationId": "org_…",
                    "eventType": "certificate.exported", "aggregateType": "certificate",
                    "aggregateId": "ckz…", "status": "FAILED", "retryCount": 3,
                    "enqueuedAt": "…", "lastAttemptAt": "…", "nextRetryAt": null } ] }
```

---

# Student API

Base path `/api/student/certificates`. All require an authenticated session with
`certificates.viewOwn` (or `certificates.request` for creating requests). The
`studentId` is resolved server-side from the session — a `studentId` in the body or
query is ignored. Responses use the **redacted** student DTOs.

## S1. List own certificates
- **Route:** `GET /api/student/certificates`
- **Permission:** `certificates.viewOwn`
- **Request (query, optional):** `certificateType`, `status`, `page`, `pageSize`.
- **Response:** `200` `CertificateListResult` (redacted rows).
- **Errors:** `401`, `403`, `500`.

## S2. Own certificate detail
- **Route:** `GET /api/student/certificates/:id`
- **Permission:** `certificates.viewOwn`
- **Response:** `200` `StudentCertificateDetailDto`.
- **Errors:** `401`, `403`, `404` (not own / unknown — no existence leak), `500`.

## S3. Download own export
- **Route:** `GET /api/student/certificates/exports/:exportId/download`
- **Permission:** `certificates.viewOwn` (only the student's **own** certificate's
  export).
- **Response:** `200` binary PDF stream (same headers as A7).
- **Errors:** `401`, `403`, `404`, `409` (not READY), `500`.

## S4. Own requests — list & create
- **Route:** `GET /api/student/certificates/requests`
- **Permission:** `certificates.viewOwn` — the student's own requests.
- **Response:** `200` `CertificateRequestListResult`.

- **Route:** `POST /api/student/certificates/requests`
- **Permission:** `certificates.request` — the student requests **for themselves**;
  any `studentId` in the body is ignored.
- **Request:** `{ certificateType, transcriptVersionId?, reason? }`.
- **Response:** `201` `RequestCertificateResult`.
- **Errors:** `401`, `403`, `422`, `500`.

## S5. Cancel own request
- **Route:** `POST /api/student/certificates/requests/:id/cancel`
- **Permission:** `certificates.request` (own request only).
- **Request:** `{ "reason": "string ≤500 (optional)" }`.
- **Response:** `200` `ReviewCertificateRequestResult`.
- **Errors:** `401`, `403`, `404`, `422`, `500`.

---

# Public API

No authentication. Rate-limited per client IP. Returns only privacy-safe data.

## P1. Verify a certificate

- **Route:** `GET /api/public/certificates/verify/:verificationCode`
- **Permission:** none (public).
- **Request:** `verificationCode` path param — must be **32 lowercase-hex
  characters** (128-bit code). Validated before any DB access.
- **Rate limit:** 30 requests per 60 s per client IP (`x-forwarded-for` /
  `x-real-ip`). On exceed → `429` with a `Retry-After` header (seconds).
- **Response:** `200` `CertificatePublicVerificationDto`, always with
  `Cache-Control: no-store`. **Existence is never leaked**: an unknown code, a
  soft-deleted certificate, and a not-publicly-issued certificate all return `200`
  with `status: "NOT_FOUND"` — indistinguishable from a real lookup.
- **Errors:**
  - `400` — malformed code (`{ "error": "Código de verificação inválido" }`).
  - `429` — rate limit exceeded.
  - `500` — unexpected (generic).
  - (No `401`/`403`/`404` — this endpoint has no auth and never leaks existence.)

**Example — valid**
```
GET /api/public/certificates/verify/9f3c1e0a7b2d4c5e6f708192a3b4c5d6
```
```json
// → 200  (Cache-Control: no-store)
{
  "status": "VALID", "publicStatus": "VALID",
  "certificateNumber": "2026/000123", "certificateType": "COURSE_COMPLETION",
  "organizationName": "Escola de Condução XYZ",
  "studentDisplayName": "João S.", "courseName": "Curso de Condução B",
  "issuedAt": "2026-07-01T09:00:00.000Z", "expiresAt": null
}
```

**Example — unknown / not verifiable (no existence leak)**
```json
// → 200
{ "status": "NOT_FOUND", "publicStatus": "NOT_FOUND",
  "certificateNumber": null, "certificateType": null, "organizationName": null,
  "studentDisplayName": null, "courseName": null, "issuedAt": null, "expiresAt": null }
```

---

## Appendix — enum vocabularies

Domain strings (never translated; travel in payloads/URLs):

- **Certificate status:** `DRAFT`, `PENDING_APPROVAL`, `ISSUED`, `SUSPENDED`,
  `REVOKED`, `STALE`.
- **Public status:** `VALID`, `REVOKED`, `SUSPENDED`, `EXPIRED`, `NOT_FOUND`.
- **Certificate type:** `COURSE_COMPLETION`, `LEVEL_COMPLETION`, `PARTICIPATION`,
  `ATTENDANCE`, `ACHIEVEMENT`, `PROFESSIONAL_TRAINING`, `DRIVING_SCHOOL`,
  `LANGUAGE_COURSE`, `IT_COURSE`, `DESIGN_COURSE`.
- **Export type:** `PDF`, `API`, `MINISTRY`. **Export status:** `PENDING`, `READY`,
  `FAILED`.
- **Ministry format:** `JSON`, `CSV`, `XML`.
- **Request status:** `PENDING`, `APPROVED`, `REJECTED`, `FULFILLED`, `CANCELLED`.
- **Financial clearance:** `NOT_REQUIRED`, `CLEARED`, `NOT_CLEARED`, `UNKNOWN`.
