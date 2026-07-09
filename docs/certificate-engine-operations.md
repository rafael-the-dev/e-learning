# Certificate Engine — Operations Runbook

> Audience: DevOps, SRE, Support, Operations.
> Scope: **operating** the Certificate Engine in production — monitoring,
> interpreting KPIs, investigating anomalies, and recovering from failures. This is
> not an architecture document and proposes no redesign. For the system design see
> [`certificate-engine-v1-architecture.md`](./certificate-engine-v1-architecture.md);
> for request/response contracts see
> [`certificate-engine-api.md`](./certificate-engine-api.md).

---

## 1. What you are operating

The Certificate Engine issues, verifies, exports and manages the lifecycle of
academic certificates. Operationally, four read-only surfaces give you full
visibility, plus one in-process delivery queue (the Outbox) you can inspect:

| Surface | Endpoint | Answers |
|---|---|---|
| **Health** | `GET /api/certificates/health` | "Is the certificate population healthy right now?" (counts) |
| **Maintenance** | `GET /api/certificates/maintenance` | "Are there structural anomalies I must act on?" |
| **Metrics** | `GET /api/certificates/metrics` | "What activity happened over today / 7d / 30d?" |
| **Outbox** | `GET /api/certificates/outbox` | "Did every domain event get delivered?" |

All four require an authenticated org session with `certificates.view`. All four are
**tenant-scoped** — they report only the caller's organization. All four are
**read-only** (Health/Maintenance/Metrics never write; the Outbox is the only
mutable seam and these endpoints only *read* it). None reads Academic Core / the
Transcript, and none returns PII, checksums, storage paths, or verification codes.

---

## 2. Monitoring

### 2.1 Recommended probes

Poll each org (or a representative sample) on a schedule and alert on thresholds:

| Signal | Source | Alert when |
|---|---|---|
| Failed exports | `health.exportsFailed` | `> 0` and rising, or above a per-org baseline |
| Stuck exports | `maintenance.stuckPendingExports.length` | `> 0` |
| Orphan exports | `maintenance.orphanExports.length` | `> 0` |
| Verification mismatches | `health.verificationMismatches` / `maintenance.verificationProjectionMismatches` | `> 0` |
| Duplicate verifications | `maintenance.duplicateVerifications.length` | `> 0` (should be impossible — DB has unique indexes) |
| Outbox dead-letter | `outbox.failed` / `outbox.deadLetter.length` | `> 0` |
| Outbox backlog | `outbox.pending` | sustained `> 0` (should normally be 0) |

### 2.2 Cadence

- **Health / Outbox:** every 1–5 min (cheap aggregate reads).
- **Maintenance:** every 5–15 min (scans exports + verifications; heavier — see §14).
- **Metrics:** on demand / dashboard refresh; it scans a 30-day window per source.

### 2.3 What "healthy" looks like

`exportsFailed = 0`, all maintenance arrays empty, `verificationMismatches = 0`,
`outbox.failed = 0`, `outbox.pending = 0`. Non-zero on any of these is an
investigation trigger, not necessarily an incident — use §7–§11.

---

## 3. Health endpoint — every KPI explained

`GET /api/certificates/health` → `CertificateHealthKpis`. Every value is a **count**
for the current tenant.

| KPI | Meaning | How to read it |
|---|---|---|
| `totalCertificates` | All non-deleted certificates across every status. | Baseline denominator. |
| `issued` | Certificates in `ISSUED`. | The live, valid population. |
| `revoked` | `REVOKED` (terminal). | Growth is normal; a spike may indicate a bulk revoke — cross-check metrics. |
| `suspended` | `SUSPENDED` (recoverable). | Persistently high = unresolved holds; expect restore or revoke to follow. |
| `stale` | `STALE` — the linked transcript was invalidated. | `> 0` means transcript changes are flowing through; see §7 of the architecture doc. Investigate if it climbs without transcript activity. |
| `pendingApproval` | `PENDING_APPROVAL` awaiting manual approval. | A growing queue = approvers are behind. |
| `draft` | `DRAFT` (generated, not issued). | Large/old backlog = generated-but-never-issued; may be intentional. |
| `exportsReady` | Export rows in `READY`. | Successful artifacts available for download. |
| `exportsFailed` | Export rows in `FAILED`. | **Primary export alert.** Each is a render/storage failure — see §7.2. |
| `verificationRows` | Total verification projections (≈ certificates ever issued). | Should track `issued + revoked + suspended + stale` closely. |
| `verificationMismatches` | Verification projections whose `publicStatus` disagrees with the certificate's lifecycle status. | **Should be 0.** `> 0` = the public verification page may be showing a wrong status — see §9. |
| `requestsPending` | Certificate requests awaiting review. | Support/secretary workload. |
| `requestsApproved` | Approved, not yet fulfilled. | Ready to fulfil into certificates. |
| `requestsFulfilled` | Requests that produced a certificate. | Throughput of the request workflow. |
| `generatedAt` | When this snapshot was computed (UTC). | Freshness of the reading. |

Note: `verificationMismatches` here is computed by the same probe the maintenance
report uses (`detectVerificationProjectionMismatches`), so the two always agree.

---

## 4. Maintenance endpoint — anomaly detection

`GET /api/certificates/maintenance` → `CertificateMaintenanceReport`. **Detection
only — it never repairs.** Reads certificate-domain tables; never the Academic Core.

| Field | What it finds | Normal value |
|---|---|---|
| `orphanExports[]` | Export rows whose owning certificate is missing or soft-deleted. | empty |
| `stuckPendingExports[]` | `PENDING` exports older than `stuckThresholdMinutes` (never reached READY/FAILED). Each has `ageMinutes`. | empty |
| `failedExports[]` | Export rows in `FAILED`. | empty |
| `duplicateVerifications[]` | Verification rows colliding on a key that must be unique (`verificationCode` or the 1:1 `certificateId`). `key` is `"[REDACTED]"` for a code group. | empty |
| `verificationProjectionMismatches[]` | Projections whose `publicStatus` ≠ the value the lifecycle maintains for the certificate's status. Carries `certificateStatus`, `publicStatus`, `expectedPublicStatus[]`. | empty |
| `stuckThresholdMinutes` | The threshold used for the stuck probe (default **60**). | — |
| `generatedAt` | When computed (UTC). | — |

The default stuck threshold is 60 minutes. The service accepts an override
(`getReport(context, now, thresholdMinutes)`) but the HTTP route uses the default —
to probe with a different threshold you currently adjust at the service call site,
not via the query string.

**Expected lifecycle → publicStatus mapping** (what a mismatch is measured against):

| Certificate status | Expected `publicStatus` |
|---|---|
| `ISSUED` | `VALID` or `EXPIRED` |
| `SUSPENDED` | `SUSPENDED` |
| `STALE` | `SUSPENDED` |
| `REVOKED` | `REVOKED` |
| `DRAFT` / `PENDING_APPROVAL` | (no projection expected — not flagged) |

---

## 5. Metrics endpoint — activity counts

`GET /api/certificates/metrics` → `CertificateMetrics`, bucketed into `today`
(from 00:00 UTC), `last7Days`, `last30Days`. Each bucket is a `CertificateMetricCounts`:

| Count | Sourced from | Meaning |
|---|---|---|
| `generate` | `Certificate.createdAt` | Certificates generated. |
| `issue` | `CertificateEvent` (`certificate.issued`) | Issued. |
| `revoke` | `CertificateEvent` (`certificate.revoked`) | Revoked. |
| `suspend` | `CertificateEvent` (`certificate.suspended`) | Suspended. |
| `restore` | `CertificateEvent` (`certificate.restored`) | Restored. |
| `export` | `CertificateExport.createdAt` | Export attempts (any final status). |
| `verification` | `CertificateVerification.lastVerifiedAt` | **Approximate** — see below. |
| `request` | `CertificateRequest.createdAt` | Requests created. |

> **`verification` is an approximation.** There is no per-access log; the count uses
> `lastVerifiedAt`, so it reflects the **most recent** verification per certificate
> within the window, not the total number of public checks. Treat it as a floor /
> trend indicator, not an exact call count.

Windows are computed in UTC; `today` resets at 00:00 UTC (not local time) — expect
the "today" bucket to roll over on the UTC boundary.

---

## 6. Outbox — delivery, retry, dead letter

The Outbox is an **in-process, in-memory** queue (one per app process) through which
every certificate command publishes its post-commit domain events. It is the only
mutable operational component.

`GET /api/certificates/outbox` → `OutboxSummary`:

```ts
{ total, pending, delivered, failed, deadLetter: OutboxEntrySummary[] }
```

Each `OutboxEntrySummary` carries the routing envelope only — `eventType`,
`aggregateType`, `aggregateId`, `status`, `retryCount`, timestamps — **never the
event payload** (no student ids, checksums, or pointers).

**Lifecycle of an entry:**

```
enqueue → PENDING ──deliver ok──▶ DELIVERED
              │
          deliver fails
              │
        retryCount += 1
       ┌──────┴───────┐
  retryCount < 3       retryCount == 3
   stay PENDING          FAILED (dead letter, kept forever)
 (nextRetryAt set)
```

- **Retry policy** (pure, no scheduler): max **3** retries; backoff
  `1000 · 2^(retryCount-1)` ms → 1 s, 2 s, 4 s. `nextRetryAt` is advisory bookkeeping
  — there is no background timer; re-drive happens on the next `publish()`/`retry()`.
- **Dead letter:** an entry that exhausts the retry budget becomes `FAILED`, stays
  queryable in `deadLetter`, and is **never auto-deleted**.
- **Important:** in production the default delivery fn (`eventPublisher.publish`)
  never throws, so entries normally reach `DELIVERED` on the first attempt.
  `failed > 0` therefore signals a real delivery/consumer problem — investigate (§10).

**Interpreting the summary:**

| Reading | Meaning |
|---|---|
| `pending = 0, failed = 0` | Healthy — everything delivered. |
| `pending > 0` sustained | Backlog not draining — a consumer or the publish loop is stuck. |
| `failed > 0` | One or more events dead-lettered — downstream consumers missed them (§10). |
| `total` resets to 0 | **Process restarted** — the in-memory queue is empty on boot (this is expected; see §12 known limitations). |

---

## 7. Failure scenario — Export stuck PENDING

**Symptom.** `maintenance.stuckPendingExports[]` non-empty; each entry has an
`ageMinutes ≥ stuckThresholdMinutes` (default 60). The export row never reached
`READY` or `FAILED`.

**What it means.** An export started (row created `PENDING`) but the render+store
step neither completed nor was marked failed — typically a process crash mid-export,
or a storage backend hang.

**Investigate.**
1. Confirm via maintenance: note the `exportId`, `certificateId`, `exportType`,
   `ageMinutes`.
2. Check app logs around the export's `createdAt` for storage/render errors or a
   process restart.
3. Check the storage backend health for the same window.

**Recover.**
- **Re-export** the certificate (`POST /api/certificates/:id/export`) — this creates
  a fresh export row; the new `READY` row supersedes the stuck one for download.
- The stuck `PENDING` row remains until cleaned up; there is no automatic sweep in
  v1. If it must be cleared, do it as a supervised DB operation (backup first, §16).
- If stuck exports recur, treat the storage backend / process stability as the root
  cause — do not just re-export repeatedly.

---

## 8. Failure scenario — Duplicate verification rows

**Symptom.** `maintenance.duplicateVerifications[]` non-empty. `field` is either
`verificationCode` (key shown as `"[REDACTED]"`) or `certificateId`; `count` and
`verificationIds[]` identify the colliding rows.

**What it means.** Two verification rows share a value that a unique index should
have made impossible. This is a **defense-in-depth probe** — if it ever fires, a
unique index is missing/disabled or data was inserted out-of-band.

**Investigate.**
1. Verify the filtered/unique indexes exist:
   `certificates_verification_code_key` (global) and the 1:1 `certificateId` unique
   on `certificate_verifications`. See the migration; the index list is enumerated in
   the schema header for the Certificate Engine.
2. Identify how the duplicates were created (out-of-band SQL? a failed/partial
   migration?).

**Recover.**
- **Do not** delete rows blindly. Back up first (§16).
- Decide which row is canonical (the one matching the live certificate's
  `publicStatus`), remove the duplicate under supervision, and re-assert the unique
  index.
- Because a public verification code is a security artifact, treat any duplication as
  a potential integrity incident and involve security.

---

## 9. Failure scenario — Verification projection mismatch

**Symptom.** `health.verificationMismatches > 0` and/or
`maintenance.verificationProjectionMismatches[]` non-empty. Each entry shows
`certificateStatus`, the divergent `publicStatus`, and the `expectedPublicStatus[]`.

**What it means.** The public verification page for that certificate would show a
status inconsistent with the certificate's real lifecycle state — e.g. a `REVOKED`
certificate still showing `VALID` publicly. This is a **public-correctness issue**
and should be prioritized.

**Investigate.**
1. From the report, get `verificationId` + `certificateId` and the mismatch pair
   (e.g. `certificateStatus: REVOKED`, `publicStatus: VALID`).
2. Check the `CertificateEvent` history and app logs for the failing transition —
   most mismatches trace to a lifecycle command whose projection update did not land,
   or an out-of-band status edit.
3. Cross-check the Outbox: a mismatch often co-occurs with a `failed` outbox entry
   for the same aggregate (the lifecycle event didn't fully propagate).

**Recover.**
- Re-run the intended lifecycle transition through the proper command (e.g. revoke
  again) so the projection is rewritten to the correct `publicStatus`. Commands use
  conditional writes, so re-running a no-op transition is safe.
- If the certificate status itself is wrong, correct it via the appropriate command,
  not by editing the projection directly.
- Never hand-edit `CertificateVerification.publicStatus` in the DB except as a
  supervised, backed-up last resort — it desynchronizes from the certificate.

---

## 10. Failure scenario — Outbox FAILED (dead letter)

**Symptom.** `outbox.failed > 0`; `outbox.deadLetter[]` lists entries with
`status: FAILED`, `retryCount: 3`.

**What it means.** A post-commit domain event exhausted its 3 retries and was
dead-lettered. **The certificate mutation itself committed successfully** — only the
event delivery to downstream consumers (notifications, other engines) failed. So the
certificate is correct; a *side effect* may be missing.

**Investigate.**
1. From each dead-letter entry read `eventType` + `aggregateId` (the certificate) and
   `lastAttemptAt`.
2. Check the downstream consumer(s) for that `eventType` and app logs around
   `lastAttemptAt` for the delivery error.
3. Determine what side effect was skipped (e.g. a notification not sent, a
   staleness cascade not propagated).

**Recover.**
- Fix the downstream consumer, then re-drive delivery. In v1 there is no HTTP
  re-drive endpoint; delivery is re-attempted by the process on the next
  `publish()`/`retry()` cycle. If entries are already `FAILED` (budget exhausted) and
  a restart cleared the in-memory queue, the entries are gone (§12) — reconcile the
  missed side effect manually (e.g. re-trigger the notification, or run the relevant
  reconcile path such as staleness reconciliation).
- Because dead-letter entries are lost on restart, **act on `failed > 0` before the
  next deploy/restart** — capture the `aggregateId`s first.
- Events are designed to be idempotent/reprocessable, so re-delivering a recovered
  event is safe.

---

## 11. Failure scenario — Orphan exports

**Symptom.** `maintenance.orphanExports[]` non-empty — an export row points at a
certificate that is missing or soft-deleted.

**What it means.** Usually a certificate was soft-deleted after an export was
created. The export bytes may still exist in storage but have no live owner.

**Recover.**
- If the certificate was deleted intentionally, the orphan export is cosmetic; clean
  it up as a supervised, backed-up DB operation if desired.
- If the certificate should exist, investigate why it is soft-deleted (audit log +
  `CertificateEvent`) — this may indicate an erroneous deletion.

---

## 12. Bulk operations — operational notes

Bulk endpoints (`POST /api/certificates/bulk/{generate,issue,export,revoke,suspend,restore}`)
orchestrate the single-item commands **sequentially, one transaction per item**.

- **Partial success is normal.** A bulk call returns `200` with a
  `BulkOperationResult`; per-item failures appear as `items[i].success = false` with
  an `error.code` — they do **not** fail the whole call. Only an invalid envelope or
  an unauthorized caller returns `422`/`401`/`403`.
- **`stopOnFailure`** (default `false`): when `true`, the first failure stops the run
  and the remaining items are returned as `skipped: true`. Support should know which
  mode a caller used when reconciling counts (`total = succeeded + failed + skipped`).
- **Synchronous & sequential** — a large bulk run holds the request open for the sum
  of item durations. There is no queue/worker in v1 (§13). Keep batch sizes moderate
  and expect longer response times for large `items[]`. If a bulk request times out
  at the edge, items already committed stay committed (each is its own transaction) —
  re-run only the remaining items.
- Each bulk item emits its own domain events through the Outbox, so a large bulk run
  produces a burst of outbox entries.

---

## 13. Operational dashboard

The dashboard read model (`CertificateOperationalDashboard`) composes **health +
maintenance + outbox + metrics + `generatedAt`** in one object. It is assembled
server-side (`certificate-operational.service.ts`) for an admin surface to render;
there is no dedicated HTTP route for the composed object in v1 — consume the four
endpoints (§2) directly, or the dashboard model where it is surfaced in the app.

For an at-a-glance operator view, render:
- Health counts as tiles (highlight `exportsFailed`, `verificationMismatches`,
  `stale`, `pendingApproval`).
- Maintenance arrays as tables (empty = green).
- Outbox as `delivered / pending / failed` with the dead-letter list expandable.
- Metrics as today / 7d / 30d columns.

---

## 14. Performance considerations

- **Health** — a handful of `GROUP BY status` counts + the mismatch probe, all
  `Promise.all`-parallel, org-scoped. Cheap; safe to poll frequently.
- **Metrics** — one scan per source table over a **30-day** window, bucketed
  in memory (no repeated scans, no N+1). Cost grows with 30-day volume; poll on
  demand, not every few seconds.
- **Maintenance** — scans exports + verifications and cross-references certificates;
  the heaviest of the four. On large tenants keep the cadence to minutes, not
  seconds. The stuck/orphan/duplicate/mismatch passes all run over the loaded sets in
  memory.
- **Outbox** — in-memory; O(n) over live entries. Negligible unless a process has
  accumulated a very large backlog.
- All operational reads are **read-only** and org-scoped, so they never block
  writers on their own rows and never touch another tenant's data.

---

## 15. Scaling notes

- **Outbox is per-process and in-memory.** With multiple app instances, each has its
  own Outbox; `GET /outbox` reflects only the instance that served the request. Do
  not treat outbox counts as a cluster-wide total, and do not alert on a single
  instance's `total` resetting after a deploy.
- **Public verification** is rate-limited **per process** (30 req / 60 s / IP). Behind
  N instances the effective limit is up to N× that per IP until a shared limiter
  exists (§17).
- **Bulk** is single-request synchronous — it does not scale horizontally within one
  call. Very large operations should be split client-side into multiple bulk calls.
- Operational read endpoints scale with per-tenant data volume; if a very large
  tenant makes Maintenance/Metrics slow, reduce poll frequency before anything else.

---

## 16. Backup considerations

- **Authoritative state is in SQL Server**, not in the Outbox. The certificates,
  events, exports, verifications, requests, policies, templates and the number
  counter are all persisted. Standard database backup/restore covers full recovery of
  certificate state.
- **The Outbox is NOT backed up** — it is in-memory and volatile. Anything only in
  the Outbox (undelivered/dead-lettered events) is lost on restart. Capture
  `deadLetter` details (§10) before any restart if they matter.
- **Export artifacts** live in the storage backend (referenced by
  `CertificateExport.fileUrl`, an internal key). Include that storage in your backup
  policy; a DB restore without the matching artifacts leaves `READY` rows whose bytes
  are gone (re-export to regenerate).
- **Before any manual DB remediation** (clearing stuck/orphan/duplicate rows, fixing
  a projection) take a backup or snapshot first — these tables carry legally
  significant records.
- The `CertificateEvent` audit trail is append-only and part of the DB backup; treat
  it as the source of truth when reconstructing what happened.

---

## 17. Known limitations (operational)

- **Outbox is in-memory / single-process.** A crash between commit and delivery loses
  the event; dead-letter entries are lost on restart. Mitigation today:
  `eventPublisher` never throws (best-effort delivery) and events are idempotent.
- **No HTTP re-drive for the Outbox.** Recovery of dead-lettered events is manual /
  process-cycle-driven (§10).
- **Metrics `verification` is approximate** (most-recent-per-certificate, not a true
  access count).
- **No automatic cleanup sweep** for stuck/orphan/failed exports — detection only;
  remediation is manual.
- **Expiry is inert.** `validityMonths → expiresAt` is not wired, so no certificate
  currently expires and the `EXPIRED` public status never appears organically. Do not
  alert on the absence of expiries.
- **Ministry export does not submit** to a real external system — it builds and
  stores a payload via a local stub (`LOCAL-MINISTRY-…`). A "successful" ministry
  export means the artifact was produced, not transmitted.
- **Public rate limiter is per-process** (see §15).
- **Maintenance stuck-threshold is fixed at the route** (60 min); overriding needs a
  service-level call.

---

## 18. Future improvements (operational impact)

These are planned; none is in v1. Listed so operators know what will change:

- **Persistent Outbox** (table + worker + real backoff) — removes the volatility in
  §17 and enables durable re-drive; the API stays the same.
- **Distributed queues for bulk** — asynchronous, horizontally scalable bulk runs.
- **Real ministry transport** — ministry export will actually transmit.
- **Distributed rate limiting** (Redis / edge KV) — a single cluster-wide public
  verification limit.
- **Expiry wiring** — `expiresAt` derived from policy; `EXPIRED` becomes live and
  will need monitoring.

---

## 19. Deployment checklist

Before/around a deploy or restart of the app:

- [ ] **Drain-check the Outbox.** `GET /api/certificates/outbox` on each instance;
      confirm `pending = 0` and capture any `deadLetter[]` (they are lost on restart).
- [ ] **Snapshot dead letters.** If `failed > 0`, record `aggregateId` + `eventType`
      for post-deploy reconciliation (§10).
- [ ] **DB migrations applied** and `prisma validate` clean. Confirm the
      **filtered/partial unique indexes** exist (they are migration-only, not in the
      Prisma schema): certificate number per org/year, global verification code, and
      active-per-transcript-type. A missing filtered index is how duplicates (§8)
      become possible.
- [ ] **Storage backend reachable** and credentials valid (exports and downloads
      depend on it).
- [ ] **`PUBLIC_PATHS` includes** the public verify path (`src/proxy.ts`) so
      verification stays unauthenticated after the deploy.
- [ ] **Secrets present** in the platform secret store (no hardcoded values); rotate
      anything exposed.
- [ ] **Post-deploy smoke:** hit `health`, `maintenance`, `metrics`, `outbox` for a
      known org and confirm `200` + sane counts; run one public verify with a known
      code and confirm `VALID` + `Cache-Control: no-store`.
- [ ] **Watch after deploy:** `exportsFailed`, `verificationMismatches`,
      `outbox.failed`, `stuckPendingExports` for the first monitoring cycles.

---

## 20. Quick investigation index

| You see… | Go to |
|---|---|
| `exportsFailed > 0` | §7 (stuck) / §11 (orphan) — check logs + storage |
| `stuckPendingExports[]` non-empty | §7 |
| `duplicateVerifications[]` non-empty | §8 (integrity/security) |
| `verificationMismatches > 0` | §9 (public correctness) |
| `outbox.failed > 0` | §10 (missed side effects) |
| `orphanExports[]` non-empty | §11 |
| Bulk counts don't add up | §12 (`total = succeeded + failed + skipped`) |
| Slow operational endpoint | §14 / §15 (reduce cadence, large tenant) |
| Counts reset after restart | §6 / §17 (in-memory Outbox — expected) |
