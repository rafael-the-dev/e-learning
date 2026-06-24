# Notifications Center

## Purpose

Internal ERP notifications: system events (payments, invoices, assessments, attendance, enrollments) create in-app messages for the affected user, surfaced via a header bell and a dedicated inbox.

## Phase 1 Scope

In-app only, hardcoded title/message per handler. The following were explicitly out of scope for Phase 1 — templates and rules are now built (Phase 2, below); the rest remain out of scope:

- Email / WhatsApp / SMS delivery
- Per-user notification preferences
- Marketing / broadcast campaigns

## Phase 2 Scope — Templates & Event Rules

Phase 2 makes the "what gets sent and how" configurable per organization instead of hardcoded in handler code, while staying IN_APP-only. Added:

- `NotificationTemplate` — admin-editable title/body text per (org, eventType, channel)
- `NotificationEventRule` — per (org, eventType) on/off switch, enabled channels, dedupe window, delay (stored, not yet acted on), priority
- A read-only **event catalog** (`src/modules/notifications/catalog/notification-event-catalog.ts`) declaring which variables each event supports and the hardcoded fallback text
- A **template renderer** (`{{variable}}` substitution) and a **rule engine** that resolves rule + template for an event
- Default rules/templates auto-seeded per organization (on `db:seed` and on new-org creation)
- A "Modelos" (Templates) and "Regras" (Rules) tab on `/notifications`, gated by two new permissions

Still explicitly **out of scope** in Phase 2:

- Email / WhatsApp / SMS providers — `NotificationChannel` has the enum values, nothing sends through them
- A delivery queue or retry jobs — `delayMinutes` is stored but never read by anything; notifications are created synchronously
- External provider integrations
- Marketing campaigns

## Phase 3.1 Scope — Delivery Infrastructure

Phase 3.1 adds a `NotificationDelivery` row per (Notification, channel) so the
system can track **per-channel delivery attempts** — without implementing any
real provider. It does **not** send real email/WhatsApp/SMS/push; it builds
the data model, state machine, and admin surface that a real provider
(Phase 3.2) will plug into. Added:

- `NotificationDelivery` model + `NotificationDeliveryStatus` (`PENDING` | `PROCESSING` | `SENT` | `DELIVERED` | `FAILED` | `CANCELLED`)
- `NotificationChannel` extended with `PUSH` (now `IN_APP` | `EMAIL` | `WHATSAPP` | `SMS` | `PUSH`) — `notification-template.schema.ts` and `notification-event-rule.schema.ts` both derive their zod `channelEnum` from `Object.values(NotificationChannel)` rather than hand-listing the values, so this one const object in `src/shared/types/common.ts` is the single source of truth for every channel list in the module
- A **recipient resolver** (`notification-recipient-resolver.service.ts`) mapping `(recipientUserId, channel)` → a contact address
- A **delivery service** with an explicit status state machine (retry/cancel/transition rules — see below)
- A **dispatcher skeleton** (`notification-dispatcher.service.ts`) that processes due `PENDING` deliveries: `IN_APP` → `DELIVERED`, every other channel → `FAILED` ("Fornecedor não configurado") since no provider exists yet
- An **"Entregas" tab** on `/notifications` (admin-only) to view/retry/cancel deliveries
- 3 new permissions: `NOTIFICATIONS_VIEW_DELIVERIES`, `NOTIFICATIONS_RETRY_DELIVERY`, `NOTIFICATIONS_CANCEL_DELIVERY`
- A backfill script for `Notification` rows created before this migration (no `NotificationDelivery` row existed yet)

Still explicitly **out of scope** in Phase 3.1:

- Real email/WhatsApp/SMS/push providers (SMTP, Resend, Microsoft Graph, Twilio, etc.) — `provider`/`providerMessageId` are reserved columns, unused until Phase 3.2A (`provider`) / Phase 3.2B (`providerMessageId`, real sends)
- A scheduled job actually invoking the dispatcher — `RunNotificationDispatcherCommand` exists but nothing calls it on a timer yet (see "Dispatcher" below)
- Push token storage — `resolveRecipient` always returns `null` for `PUSH`

## Phase 3.2A Scope — Provider Abstraction (EMAIL)

Phase 3.2A adds the **provider abstraction layer** the dispatcher needs before any real sender can be wired in — without sending a single real email. No SMTP credentials, no Resend/Microsoft Graph integration, no WhatsApp/SMS, no cron/scheduler route. The dispatcher's EMAIL path now goes through this abstraction instead of a hardcoded "fail immediately" branch; the *observable outcome* (delivery still ends up `FAILED`, `failureReason: "Fornecedor não configurado"`) is unchanged from Phase 3.1, but it now flows through the same interface a real provider will plug into later.

Added (`src/modules/notifications/providers/`):

- **`NotificationProvider`** (`notification-provider.ts`) — the channel-agnostic contract the dispatcher calls: `send(input: SendNotificationInput): Promise<SendNotificationResult>`. A provider only ever *reports an outcome*; it never touches `NotificationDelivery` itself — the dispatcher/`notification-delivery.service.ts` is the only thing allowed to transition delivery status from that outcome. `SendNotificationResult.status` (`"SENT" | "DELIVERED" | "FAILED"`) lets a future real provider report "delivered" in the same call as "sent" (e.g. a synchronous webhook-confirmed send), without the dispatcher needing channel-specific logic.
- **`EmailProvider`** (`email-provider.ts`) — extends `NotificationProvider` with a strongly-typed `sendEmail(input: SendEmailInput): Promise<SendEmailResult>` (`to`/`subject`/`text`/`html?`/`from?`/`replyTo?`/`metadata?`). Concrete providers (Phase 3.2B) implement `sendEmail`; `send()` is what the dispatcher actually calls, and adapts the channel-agnostic input into `SendEmailInput` (`subject` falls back to the generic `title` when the caller didn't set one — this is where "subject = notification.title" from the section below actually happens) before delegating to `sendEmail`.
- **`validateSendEmailInput`** (`email-provider.ts`) — a pure, pre-send shape check (valid-looking `to`, non-blank `subject`/`text`) run inside `send()` *before* `sendEmail()` is ever called. A malformed payload fails with a distinct error code (`INVALID_RECIPIENT` / `MISSING_SUBJECT` / `MISSING_BODY`) rather than being indistinguishable from "no provider configured" — in normal operation this never fires, since the recipient resolver and the `Notification` row always supply a real address/title/message, but it protects Phase 3.2B's real providers from ever being called with garbage.
- **`NoopEmailProvider`** (`email-provider.ts`) — the only `EmailProvider` implementation in this phase. `sendEmail()` never sends anything: it always returns `{ success: false, provider: "noop-email", errorCode: "PROVIDER_NOT_CONFIGURED", errorMessage: "Fornecedor de email não está configurado" }`. `send()` routes through `sendEmail()` rather than duplicating that result.
- **Provider registry** (`notification-provider-registry.ts`) — `getProvider(channel, organizationId): NotificationProvider`, total over every `NotificationChannel`: `EMAIL` → `NoopEmailProvider`; `WHATSAPP`/`SMS`/`PUSH` → an internal `NotConfiguredProvider` (same `PROVIDER_NOT_CONFIGURED` shape, `provider: "not-configured-<channel>"`); `IN_APP` → an internal `NoopInAppProvider` that reports success (reserved for completeness — the dispatcher still short-circuits `IN_APP` before ever calling the registry, unchanged from Phase 3.1). `organizationId` is accepted but unused — there is no DB-backed per-organization provider configuration yet; it's threaded through now so Phase 3.2B's per-org config doesn't change every call site's signature.

**Why no real email is sent yet:** this phase is scoped to the *shape* of the integration — interfaces, registry, validation, dispatcher wiring, status mapping — not the integration itself. Wiring a real SMTP/Resend/Microsoft Graph provider means picking a vendor, managing secrets, and handling real delivery/bounce semantics, which is deliberately deferred to Phase 3.2B so this phase could land as a small, reviewable, fully-tested abstraction layer with zero risk of an accidental real send.

Still explicitly **out of scope** in Phase 3.2A (deferred to **Phase 3.2B**):

- A real SMTP/Resend/Microsoft Graph `EmailProvider` implementation
- Provider credentials/configuration (env vars, settings UI, per-organization provider choice)
- WhatsApp/SMS providers (`NotConfiguredProvider` is a placeholder, not an implementation)
- Push token storage / a real push provider
- A cron/scheduler route actually invoking `RunNotificationDispatcherCommand` on a timer

## Phase 3.2B Scope — SMTP Email Provider, Dispatcher Route & Retry Job

Phase 3.2B wires a **real** sender behind the Phase 3.2A abstraction (SMTP only — Microsoft Graph stays reserved), gives every organization its own credentials, and adds the two scheduled jobs the dispatcher always needed: a route that actually invokes it, and a retry job that moves exhausted-looking `FAILED` rows back to `PENDING` for it to pick up. Still explicitly **out of scope**: Microsoft Graph, WhatsApp, SMS, Push, BullMQ/any queue, marketing campaigns, bounce webhooks.

Added:

- **`NotificationEmailSettings`** (`prisma/schema.prisma`) — one row per organization (see model section below). `smtpPasswordEncrypted` and the reserved `graphClientSecretEncrypted` are the only encrypted columns in this module.
- **`src/shared/lib/secret-encryption.ts`** — `encryptSecret`/`decryptSecret`, AES-256-GCM keyed from `NOTIFICATION_SECRET_ENCRYPTION_KEY` (hashed with SHA-256 first, so the env var doesn't have to be an exact-length key). Both functions throw `SecretEncryptionError` (fail closed) when the env var is missing. `decryptSecret` also throws on a tampered/foreign-key ciphertext (GCM auth tag mismatch) — every caller that decrypts a *stored* secret (the provider registry, the test-email password fallback) catches this and degrades to a safe failure instead of letting it propagate.
- **`notification-email-settings.repository.ts`** — `findRawByOrganization` is the *only* function in the entire module that returns `smtpPasswordEncrypted`; it exists solely for the provider registry. Every other read goes through `findByOrganization`, which maps to the public DTO (`NotificationEmailSettings` in `types/index.ts`) and never includes the encrypted password, a decrypted password, or `graphClientSecretEncrypted`.
- **`notification-email-settings.service.ts`** — `getEmailSettings` (DTO read), `upsertEmailSettings` (encrypts `smtpPassword` when given; omitting/blanking it leaves the stored ciphertext untouched — this is "leave blank to keep existing password"), `enableEmailSettings` (requires an existing **and complete** row — see Hardening below) / `disableEmailSettings` (requires only an existing row; always allowed, even if incomplete), `testEmailSettings` (below).
- **`SmtpEmailProvider`** (`smtp-email-provider.ts`) — the first real `EmailProvider`. Sends via `nodemailer.createTransport(...).sendMail(...)`. Never throws: every transport error is caught and mapped to a `SendEmailResult` with a Portuguese `errorMessage` (`mapSendError`) — `EAUTH` → "Falha de autenticação SMTP", `EPROTO`/`CERT_HAS_EXPIRED`/`SELF_SIGNED_CERT_IN_CHAIN`/`DEPTH_ZERO_SELF_SIGNED_CERT`/`UNABLE_TO_VERIFY_LEAF_SIGNATURE` → "Erro de TLS/certificado na ligação SMTP", `ECONNECTION`/`ETIMEDOUT`/`ESOCKET`/`ECONNREFUSED`/`EDNS` → "Falha de ligação ao servidor SMTP", SMTP response code 421/450/451 → "Limite de envio excedido", anything else → the generic "Falha desconhecida ao enviar o email" (the raw error/message is never included, to avoid leaking transport internals into a failureReason an org's admin can see). `send()` reuses the same `bridgeSend()` helper `NoopEmailProvider` uses (extracted from `email-provider.ts` in this phase) rather than duplicating the validate→map-status logic. Hardening details (timeouts, `requireTLS`, transport cleanup) are below.
- **Provider registry update** (`notification-provider-registry.ts`) — `getProvider()` is now `async`. For `EMAIL`, it loads the organization's `NotificationEmailSettings` (`findRawByOrganization`) and:
  - no row, or `isEnabled: false` → `NoopEmailProvider` (same `PROVIDER_NOT_CONFIGURED` outcome as Phase 3.2A)
  - `providerType: "MICROSOFT_GRAPH"` → `NoopEmailProvider` (reserved, not implemented)
  - incomplete SMTP fields (missing host/port/username/password) → `NoopEmailProvider`
  - `decryptSecret` throws → `NoopEmailProvider` (a corrupted/foreign-key secret degrades to "not configured," never a thrown error reaching the dispatcher)
  - otherwise → `new SmtpEmailProvider({ ...decrypted config })`

  `getEmailProvider`'s decryption is the **only** place in the runtime path that ever calls `decryptSecret` on a stored password.
- **Dispatcher route** — `POST /api/internal/jobs/notifications/dispatch` (`src/app/api/internal/jobs/notifications/dispatch/route.ts`), `INTERNAL_JOB_SECRET`-gated exactly like `daily-billing/route.ts` (missing/wrong secret → 401, fail-closed if the env var itself is unset). Backed by `runNotificationDispatchJob` (`src/server/jobs/notification-dispatch.job.ts`), which — unlike `dispatchPendingDeliveries`/`RunNotificationDispatcherCommand`, both single-organization — fans out across every organization with `status NOT IN (CANCELLED, SUSPENDED)` (same convention as `daily-billing.job.ts`), or just one when `organizationId` is given in the body. `limit` (default 100, capped to 500) is forwarded into `dispatchPendingDeliveries(orgId, now, limit)`, which forwards it into `findDueDeliveries(...,  take: limit)`. Per-org failures are caught and counted in `errors`, never aborting the batch. Writes one `notification_dispatcher.run` audit row per invocation (not per delivery). Response: `{ processed, sent, delivered, failed, providerNotConfigured, errors, startedAt, completedAt }` — `failed` counts every send failure, `providerNotConfigured` is the subset where `errorCode === "PROVIDER_NOT_CONFIGURED"` specifically (see Hardening §`failed` vs `providerNotConfigured` below).
- **Exponential backoff** (`notification-delivery.service.ts#markFailed`) — replaced the flat 30-minute retry delay with a lookup table keyed by `delivery.attempts` (which already reflects the attempt that just failed): attempt 1 → +5 min, attempt 2 → +15 min, attempt 3 → +60 min (anything beyond the table, only reachable with a non-default `maxAttempts`, also gets +60 min). `markFailed` dropped its `retryDelaySeconds` parameter — backoff is now computed internally, so every caller (the dispatcher) just passes the failure reason and provider name.
- **Retry job** — `runRetryJob(organizationId?, now?)` (`notification-delivery.service.ts`) + `RunNotificationRetryJobCommand` (`commands/run-notification-retry-job.command.ts`, system-internal, no-op `authorize()`, same rationale as `RunNotificationDispatcherCommand`). Eligibility (`findRetryEligibleDeliveries` in the repository): `status = FAILED`, `nextAttemptAt` null-or-due, **and** `attempts < maxAttempts` — the last condition compares two columns of the same row, which Prisma's `where` can't express, so it's fetched first and filtered in JS (same "fetch candidates, filter, batch-update" shape as `daily-billing.job.ts`'s installment→invoice step). `bulkRetryDeliveries` then does a single `updateMany({ where: { id: { in: ids }, status: "FAILED" }, data: { status: "PENDING", failureReason: null, nextAttemptAt: now, cancelledAt: null } })` — re-checking `status: "FAILED"` so a row that raced away from `FAILED` between the scan and the write is silently skipped rather than overwritten; `scanned - retried` is reported as `skipped`. **The retry job never sends anything** — it only flips rows back to `PENDING`; the dispatcher (route or command) picks them up on its own next run. No HTTP route wraps this command yet — it exists for a future scheduled trigger, same as `RunNotificationDispatcherCommand` before this phase.
- **Test email** — `testEmailSettings(organizationId, draft, recipientEmail)` builds a throwaway `SmtpEmailProvider` from `draft` (the admin's in-progress form values, not necessarily what's saved) and sends one real email. A blank/omitted `draft.smtpPassword` falls back to decrypting the *saved* settings' password (so testing an already-saved config doesn't require retyping it); if there's neither a draft password nor a saved one, it fails safely with "Palavra-passe SMTP não fornecida" rather than calling SMTP with no credentials. **Never creates a `Notification` or `NotificationDelivery` row.** If a settings row already exists, `lastTestedAt`/`lastTestStatus`/`lastTestError` are updated with the result; if not (admin is testing before ever saving), nothing is persisted.
- **`NOTIFICATIONS_MANAGE_EMAIL_SETTINGS`** permission — ORG_ADMIN/SUPER_ADMIN only (granted via the existing "every permission except `organizations.delete`" wildcard; not added to SECRETARY/TEACHER/STUDENT). Gates a new **"Email"** tab on `/notifications` (`?tab=email`): enable/disable switch, provider type (`SMTP` selectable, `MICROSOFT_GRAPH` shown disabled "em breve"), from name/email, reply-to, SMTP host/port/username/password/secure, a "Guardar Alterações" save action, and a "Enviar Teste" action with its own recipient field. The password field is always rendered blank with a "Deixe em branco para manter a palavra-passe atual" hint — the stored value is never fetched into the form.
- **EMAIL as a rule channel** — `notification-rule-form-sheet.tsx`'s channel checkboxes now allow `EMAIL` (previously disabled "em breve" like every non-`IN_APP` channel). No change was needed in `notification.service.ts`: `createNotificationFromEvent` already passes the *whole* resolved rule's `channels` to `createDeliveriesForNotification` (Phase 2/3.1 behavior), which already resolves `EMAIL`'s recipient (`User.email`, Phase 3.1) and creates a `PENDING` row for it — enabling the channel in the Rules tab was the only missing piece. The email's subject/body are still always the `Notification`'s own `title`/`message` (the IN_APP-resolved template) — there is no separate per-channel EMAIL template/subject resolution in this phase (`NotificationTemplate.channel = EMAIL` rows remain creatable in the schema but are not read by anything; the Templates tab still shows EMAIL as disabled "em breve" deliberately, to avoid a half-wired UI option).
- **Entregas tab** — new columns: **Fornecedor** (provider name, e.g. `"smtp"`/`"noop-email"`) and **Próxima Tentativa** (`nextAttemptAt`). The "view notification" dialog also shows the provider, `providerMessageId`, and next-attempt time when present.

## Phase 3.2B Hardening — production-traffic readiness

A follow-up pass on top of the Phase 3.2B work above, addressing four gaps found before this shipped against real SMTP traffic: unbounded transport timeouts, a possible STARTTLS downgrade, no validation gate before "Enable," and a provider re-resolved once per delivery instead of once per dispatch run.

### SMTP timeouts

`SmtpEmailProvider` passes three explicit timeouts to `nodemailer.createTransport` — `connectionTimeout`, `greetingTimeout`, `socketTimeout`, each `15000` ms (`SMTP_CONNECTION_TIMEOUT_MS`/`SMTP_GREETING_TIMEOUT_MS`/`SMTP_SOCKET_TIMEOUT_MS`, exported from `smtp-email-provider.ts`). Without these, nodemailer's own defaults (~2 minutes per phase) mean one hung/slow SMTP host could block a single send for minutes — and since the dispatcher processes deliveries sequentially within one synchronous HTTP request (`POST /api/internal/jobs/notifications/dispatch`), that delay multiplies across every delivery still queued behind it in the same run.

### `requireTLS` — STARTTLS downgrade guard

When `smtpSecure === false` (the typical port-587 STARTTLS case), the transport now also sets `requireTLS: true`. Without it, nodemailer will still send the message if the STARTTLS upgrade is stripped by a network attacker, silently falling back to a plaintext connection — credentials and message content would go out unencrypted. When `smtpSecure === true`, `requireTLS` is omitted entirely (TLS is already negotiated from the first byte in that mode, so forcing it is meaningless).

### Transport cleanup

`SmtpEmailProvider.sendEmail()` calls `transport.close?.()` in a `finally` block, after both a successful and a failed `sendMail()`. Non-pooled nodemailer transports already auto-close, but the explicit call removes any doubt and matches the project's general "don't rely on implicit cleanup" preference.

### Expanded TLS/certificate failure mapping

`mapSendError` now recognizes `EPROTO`, `CERT_HAS_EXPIRED`, `SELF_SIGNED_CERT_IN_CHAIN`, `DEPTH_ZERO_SELF_SIGNED_CERT`, and `UNABLE_TO_VERIFY_LEAF_SIGNATURE` as a distinct `SMTP_TLS_ERROR` category (Portuguese message: "Erro de TLS/certificado na ligação SMTP"), separate from the generic connection-failure bucket. Like every other branch in `mapSendError`, the raw error/message is never included — only the fixed Portuguese string, so a certificate error can never leak hostname/chain details into a failureReason an org's admin can read.

### Enable validation — completeness gate

`enableEmailSettings(organizationId)` now reads the **raw** settings row (`findRawByOrganization`, the only place that can see `smtpPasswordEncrypted`) and runs `assertCompleteForEnable` before flipping `isEnabled`:

- `providerType === "MICROSOFT_GRAPH"` → rejected with `BusinessRuleError("Microsoft Graph ainda não está disponível.")` — Graph cannot be enabled even though the schema/UI reserve a slot for it.
- `providerType` anything other than `"SMTP"` → rejected (defensive catch-all for a future/unknown value).
- Missing `fromName`, `fromEmail`, `smtpHost`, `smtpPort`, `smtpUsername`, or `smtpPasswordEncrypted` → rejected with a `BusinessRuleError` naming every missing field (`"Configuração de email incompleta. Em falta: ..."`).

There is no separate "password just typed in this request" input to `enableEmailSettings` — a fresh password always goes through `upsertEmailSettings` first (which encrypts it onto `smtpPasswordEncrypted`) before "Enable" is ever clicked as a second, separate action, so checking the stored ciphertext's presence is sufficient; an org that already has a saved password can enable without retyping it. `disableEmailSettings` has no such gate — turning email off must always succeed, even for an incomplete configuration. Before this gate existed, an admin could toggle "Email ativo" on with no SMTP host configured; the failure mode was always safe (the provider registry already fell back to `NoopEmailProvider` for incomplete settings), just silently non-functional — this closes that footgun with a clear error instead of a quiet no-op.

### Provider cache — one resolution per (organization, channel) per dispatch run

`dispatchPendingDeliveries` creates a `Map<string, NotificationProvider>` (keyed `"${organizationId}:${channel}"`) once per call and threads it through every `dispatchOne` in that run. The first EMAIL delivery for an org resolves the provider (DB read + decrypt); every subsequent EMAIL delivery to the *same* org in the *same* run reuses that instance instead of re-querying `NotificationEmailSettings` and re-decrypting the password. The cache is deliberately **not** module-level or global — a fresh `Map` is created on every `dispatchPendingDeliveries` call, so a settings change (disable, password rotation, host change) takes effect on the very next dispatch run rather than requiring any kind of invalidation logic. Different channels for the same org (e.g. EMAIL and WHATSAPP) still resolve separately, since they're different cache keys.

### `failed` vs `providerNotConfigured`

`DispatchSummary` (`notification-dispatcher.service.ts`) now tracks both:

- `failed` — incremented for **every** send failure, regardless of `errorCode`.
- `providerNotConfigured` — a strict subset of `failed`, incremented only when `errorCode === "PROVIDER_NOT_CONFIGURED"`.

`dispatchOne` returns a `{ kind: "sent" | "delivered" | "failed", providerNotConfigured?: boolean }` outcome rather than a bare string, so the loop in `dispatchPendingDeliveries` can bump `failed` unconditionally on any failure and `providerNotConfigured` only when that specific outcome flag is set. `notification-dispatch.job.ts` (`runNotificationDispatchJob`) sums both fields independently across organizations — it no longer aliases `failed` to whatever `providerNotConfigured` happened to be, since before this pass every failure (SMTP auth error, rate limit, etc.) was incorrectly counted as "provider not configured."

### Why exponential backoff lives in the service, not the dispatcher

`markFailed` (not `dispatchOne`) computes `nextAttemptAt` because attempt count is a property of the *delivery*, not of any one caller — the retry job, a future cron retrying a different way, or a manual `RetryNotificationDeliveryCommand` could all eventually need the same curve, and putting it in the dispatcher would mean re-deriving `delivery.attempts` at every call site instead of once where the delivery row is already loaded.

### Security notes (Phase 3.2B)

- `smtpPasswordEncrypted` is AES-256-GCM ciphertext, never plaintext, at rest.
- The DTO returned by every action/service read (`NotificationEmailSettings` in `types/index.ts`) has no password field at all — it is structurally impossible for a server action to return the password to the browser, encrypted or not.
- `decryptSecret` only ever runs in two places: the provider registry (building a real `SmtpEmailProvider` for an actual send) and the test-email password fallback. Neither returns the decrypted value anywhere — it's used in-memory to construct a transport and discarded.
- Commands never put `smtpPassword` in an audit log's `newValues`/`oldValues` — `UpsertNotificationEmailSettingsCommand` audits the DTO (no password field); `TestNotificationEmailSettingsCommand` audits only `{ success, errorMessage, recipientEmail }`.
- `SmtpEmailProvider` never logs the password and never includes it in a `SendEmailResult` — transport errors are mapped to fixed Portuguese strings (`mapSendError`), not the raw error object.
- `INTERNAL_JOB_SECRET` gates the dispatcher route exactly like the daily billing route: fail-closed if unset, constant string comparison against the `x-internal-job-secret` header, no session/cookie auth involved (machine-to-machine only).
- `requireTLS: true` when `smtpSecure` is `false` prevents a stripped-STARTTLS downgrade from silently sending credentials/content over plaintext (see Hardening below).
- `enableEmailSettings` cannot be used to turn on email with an unsupported/incomplete configuration — see the completeness gate in Hardening below.

### Canonical `EmailProvider` — and the duplicate that was removed

`src/modules/notifications/providers/email-provider.ts`'s `EmailProvider` is the **only** `EmailProvider` abstraction in this codebase and is canonical for the Notifications Center. A pre-existing, unrelated `EmailProvider` interface (`send(message): Promise<void>`, fire-and-forget) lived at `src/infrastructure/email/index.ts` from the project's initial scaffold, alongside an unused `ConsoleEmailProvider` and commented-out Resend/SMTP slots — it was never imported by anything, predates the Notifications Center entirely, and was deleted during Phase 3.2A's review pass specifically to avoid two incompatible interfaces sharing the same name. Phase 3.2B's real email provider belongs under `src/modules/notifications/providers/`, implementing *this* `EmailProvider`.

### Status mapping: when is a send "SENT" vs "DELIVERED"?

A provider's `send()` result maps to `NotificationDeliveryStatus` as follows — this is intentionally conservative, because most providers (including any future SMTP/Resend integration) only confirm *hand-off*, not actual inbox delivery:

- `success: true` and `status: "SENT"` → delivery is marked `SENT`, **not** `DELIVERED`. This is the default for `EmailProvider.send()`: a bare `SendEmailResult` (`success`/`provider`/`providerMessageId`/`errorCode`/`errorMessage`/`rawResponse`) carries no delivery-confirmation signal, so the channel-agnostic bridge in `email-provider.ts` can only ever report `"SENT"` on success, never `"DELIVERED"`.
- `success: true` and `status: "DELIVERED"` → delivery is marked `DELIVERED`. Only reachable today via `IN_APP` (the dispatcher's own short-circuit, not through a provider) or a hypothetical provider that explicitly sets `status: "DELIVERED"` after a real delivery-confirmation signal (e.g. a provider webhook/callback) — no such provider exists yet.
- `success: false` → delivery is marked `FAILED` (see failure-reason mapping below).

Earlier in Phase 3.2A, `EmailProvider.send()` hardcoded `status: "FAILED"` regardless of `result.success` — harmless only because `NoopEmailProvider` always fails, but wrong as a template for Phase 3.2B. Fixed to `status: result.success ? "SENT" : "FAILED"`.

### Failure-reason mapping

The dispatcher (`resolveFailureReason` in `notification-dispatcher.service.ts`) turns a failed `SendNotificationResult` into the delivery's Portuguese `failureReason`:

1. `errorCode === "PROVIDER_NOT_CONFIGURED"` → `"Fornecedor não configurado"` (the only error code with a dedicated label).
2. Otherwise, if `errorMessage` is present → that `errorMessage` verbatim.
3. Otherwise → the generic `"Falha no envio da notificação"`.

`PROVIDER_NOT_CONFIGURED` is deliberately not used as a catch-all: only that exact error code gets the "not configured" label, so a real provider failure (Phase 3.2B — rate limits, invalid recipient, bounced address, etc.) is never misreported as a missing integration.

Provider-level `errorMessage`/`errorCode` strings (e.g. `NoopEmailProvider`'s `"Fornecedor de email não está configurado"`, `NotConfiguredProvider`'s per-channel message) are internal diagnostics, not UI copy — the dispatcher's mapping above is the only thing that produces the Portuguese text actually shown in the admin "Entregas" tab. A real provider's own error text (Phase 3.2B — e.g. Resend's API error message) will often be in English and must go through this same mapping rather than being rendered raw.

## NotificationDelivery Model

`NotificationDelivery` (table `notification_deliveries`), scoped by `organizationId`:

| Field | Type | Notes |
|---|---|---|
| `notificationId` | String | The `Notification` this delivery attempt belongs to |
| `channel` | String | `NotificationChannel` |
| `recipient` | String | Resolved contact address for this channel (`recipientUserId` for `IN_APP`, email/phone for others); empty string when unresolved (status is `FAILED` in that case) |
| `status` | String | `NotificationDeliveryStatus` — see state machine below |
| `provider` / `providerMessageId` | String? | `provider` is set by the dispatcher from the resolved `NotificationProvider`'s result — e.g. `"noop-email"`, `"not-configured-whatsapp"`, or `"smtp"` (Phase 3.2B); `providerMessageId` is `nodemailer`'s message id for a real SMTP send, still unused for every other channel |
| `attempts` / `maxAttempts` | Int | `attempts` increments every time a delivery enters `PROCESSING`; default `maxAttempts` is 3 |
| `lastAttemptAt` / `nextAttemptAt` | DateTime? | `nextAttemptAt` is read by both the dispatcher's `findDueDeliveries` query and the Phase 3.2B retry job's `findRetryEligibleDeliveries` query; set by `markFailed` using exponential backoff (Phase 3.2B — see above) |
| `sentAt` / `deliveredAt` / `failedAt` / `cancelledAt` | DateTime? | Set on the matching transition |
| `failureReason` | String? | Human-readable reason, e.g. `"Destinatário indisponível"` or `"Fornecedor não configurado"` |
| `metadata` | String? | JSON-encoded, currently unused — reserved for provider-specific data in Phase 3.2 |

Indexes: `(organizationId, status, channel, createdAt)`, `(notificationId)`, `(organizationId, nextAttemptAt, status)`, `(organizationId, channel, createdAt)`.

## Recipient Resolver

`resolveRecipient(organizationId, recipientUserId, channel)` (`notification-recipient-resolver.service.ts`), pure lookup, no side effects:

- `IN_APP` → always resolves to `recipientUserId` itself (the "address" is the inbox row, never unavailable)
- `EMAIL` → the user's `email` (always present — it's a required, unique column on `User`, so `EMAIL` deliveries essentially never come back unresolved)
- `WHATSAPP` / `SMS` → the user's `phone` (optional column — frequently unresolved until a user has one on file)
- `PUSH` → always `null` (no push token storage exists yet)

A `null` result means `createDeliveriesForNotification` creates a `FAILED` row with `failureReason: "Destinatário indisponível"` instead of `PENDING` — the delivery is visible and explained in the admin tab rather than silently missing.

## Delivery Creation Rule

`createDeliveriesForNotification(organizationId, notification, channels)` (`notification-delivery.service.ts`) is called from both notification-creation paths in `notification.service.ts`:

- **`createNotification`** (the plain, Phase 1 path — no `NotificationEventRule` to read channels from) always passes `["IN_APP"]`. This path stays IN_APP-only by design, same as Phase 1/2.
- **`createNotificationFromEvent`** (the Phase 2, rule-driven path) passes **the resolved rule's `channels`** — `resolveNotificationConfig` already guarantees `IN_APP` is present (it returns `null` otherwise), but if an admin also enabled `EMAIL`/`WHATSAPP`/`SMS`/`PUSH` on that event's rule (Rules tab), one delivery row is created per additional channel too.

For each channel: `IN_APP` creates a row already `DELIVERED` (`deliveredAt: now`) — the `Notification` row itself is the delivery, nothing else to do. Every other channel resolves a recipient first: found → `PENDING` (nothing sent — no provider yet); not found → `FAILED` with `"Destinatário indisponível"`.

If the rule is disabled, missing, or the template/catalog entry doesn't exist, `createNotificationFromEvent` returns `null` *before* any delivery is created — same "no rule → no notification → no delivery" behavior as Phase 2.

**Failure isolation:** both call sites wrap `createDeliveriesForNotification` in `safelyCreateDeliveries` (`notification.service.ts`), which catches and logs (`console.error`) rather than rethrows. A delivery-creation failure (DB hiccup, resolver bug) can therefore never roll back or throw past an already-committed `Notification` row, and never aborts the remaining iterations of `createManyNotifications`/`createManyNotificationsFromEvent`'s fan-out loops — one recipient's delivery failure does not stop the next recipient's notification from being created.

## Delivery Status State Machine

`notification-delivery.service.ts` enforces these transitions; anything else throws `BusinessRuleError`:

```
PENDING    → PROCESSING, CANCELLED
PROCESSING → SENT, FAILED
SENT       → DELIVERED
FAILED     → PENDING (via retryDelivery), CANCELLED
DELIVERED  → (terminal)
CANCELLED  → (terminal)
```

- `startProcessing` increments `attempts` and sets `lastAttemptAt` — this is the only place attempts increase.
- `markFailed(reason, retryDelaySeconds?)` only sets `nextAttemptAt` when `attempts < maxAttempts` **and** a delay was given; once attempts are exhausted the delivery stays `FAILED` with `nextAttemptAt: null`, requiring a manual retry.
- `retryDelivery` only succeeds when `status === "FAILED"` **and** `attempts < maxAttempts`; it resets to `PENDING`, clears `failureReason`, and sets `nextAttemptAt: now` so the dispatcher picks it up again immediately.
- `cancelDelivery` only succeeds from `PENDING` or `FAILED`.
- `DELIVERED` and `CANCELLED` are terminal — no command or service function can transition out of them (this is what makes "cannot retry a delivered delivery" / "cannot cancel a delivered delivery" hold).

**Concurrency safety:** every transition write in `notification-delivery.repository.ts` is a conditional `updateMany({ where: { id, organizationId, status: expectedStatus }, ... })`, where `expectedStatus` is the status the service observed when it read the row. If another process already moved the row away from that status (e.g. two overlapping dispatcher runs racing the same delivery), the conditional update matches zero rows and the repository throws `ConcurrencyError` (`@/shared/lib/command`) instead of silently overwriting a state it never actually observed. `BusinessRuleError` (invalid transition per the state machine) and `ConcurrencyError` (valid transition, but the row changed between read and write) are deliberately distinct — the former means "no," the latter means "stale read, re-fetch and retry." `runAction()` (`src/shared/lib/action.ts`) maps a thrown `ConcurrencyError` to a dedicated user-friendly message ("Este registo foi alterado por outro processo...") instead of falling through to the generic unexpected-error fallback, since `RetryNotificationDeliveryCommand`/`CancelNotificationDeliveryCommand` can genuinely surface this when an admin acts on a delivery the dispatcher just touched.

## Dispatcher

`dispatchPendingDeliveries(organizationId, now?)` (`notification-dispatcher.service.ts`) finds `PENDING` deliveries with `nextAttemptAt` either `null` or in the past, and advances each one:

- `IN_APP` → `PROCESSING` → `SENT` → `DELIVERED` (in practice this path is rarely hit — `IN_APP` deliveries are already created `DELIVERED` — but it exists so a manually-retried `IN_APP` row, were one ever created, still resolves correctly). Unchanged since Phase 3.1 — the dispatcher never calls the provider registry for `IN_APP`.
- Any other channel → `PROCESSING`, then:
  1. Looks up the `Notification` (`findNotificationById`) to resolve content: `title` → `SendNotificationInput.title` (used as the email subject fallback), `message` → `body`.
  2. Resolves a provider via `resolveProvider(providerCache, channel, organizationId)` — a cache-checking wrapper around `getProvider(channel, organizationId)`, see "Provider cache" in Hardening above — and calls `provider.send({ organizationId, deliveryId, notificationId, channel, recipient, title, body })`.
  3. `result.success === true` → `markSent(..., result.providerMessageId, result.provider)`. Additionally `markDelivered(...)` **only** if `result.status === "DELIVERED"` — see "Status mapping" above; reachable for a confirmed hand-off but no concrete provider in this codebase sets it yet.
  4. `result.success === false` → `markFailed(..., reason, result.provider)`, where `reason` follows the failure-reason mapping above (`"Fornecedor não configurado"` only for `errorCode === "PROVIDER_NOT_CONFIGURED"`; otherwise the provider's own `errorMessage`; otherwise the generic `"Falha no envio da notificação"`) and `nextAttemptAt` is set via the exponential backoff described above (`markFailed` computes it internally from `delivery.attempts`).

**Per-delivery failure isolation:** each delivery in the batch is processed inside its own try/catch; a thrown error (most notably `ConcurrencyError` from a lost race against another dispatcher run, or a provider's `send()` throwing instead of resolving, but any error) is caught, logged (`console.error`, same `[Tag] message` convention as `safelyCreateDeliveries`), and counted in the returned `errors` field — it does not abort the rest of the batch for that organization.

`DispatchSummary` is `{ processed, sent, delivered, failed, providerNotConfigured, errors }`:

| Field | Incremented when |
|---|---|
| `processed` | Always, once per due delivery (`due.length`) |
| `sent` | Provider returned `success: true, status: "SENT"` (hand-off confirmed, not delivery) |
| `delivered` | `IN_APP` (always), or a provider returning `success: true, status: "DELIVERED"` |
| `failed` | `result.success === false`, regardless of the specific `errorCode` — read the persisted `failureReason` for the actual cause |
| `providerNotConfigured` | Strict subset of `failed`: only when `errorCode === "PROVIDER_NOT_CONFIGURED"` specifically (Phase 3.2B hardening — previously this field counted every failure, conflating "not configured" with real send errors) |
| `errors` | The delivery's processing (`dispatchOne`) threw — caught, logged, and skipped rather than aborting the batch |

`sent` and `delivered` were split out from a single `delivered` counter (Phase 3.2A review fix) because a provider that only confirms hand-off (the only kind that exists today, and the most common kind in practice — most email APIs are fire-and-forget) is not the same fact as a provider that confirms the message actually reached the recipient.

`RunNotificationDispatcherCommand` (`commands/run-notification-dispatcher.command.ts`) wraps this for a single organization via the normal `ServiceContext`. Like `CreateNotificationCommand`, its `authorize()` is a no-op — there is no end-user "dispatch now" action; nothing calls this particular command today. The actual scheduled entry point is `POST /api/internal/jobs/notifications/dispatch` (Phase 3.2B — see above), which goes through `runNotificationDispatchJob` → `dispatchPendingDeliveries` directly (not through this command), the same way `daily-billing.job.ts` calls into its own job module rather than a Command.

## Delivery Commands

`RetryNotificationDeliveryCommand` / `CancelNotificationDeliveryCommand` (`commands/`) follow the same shape as every other command here: tenant-scoped lookup in `validate()` (cross-tenant id → `NotFoundError`, identical to "not found"), permission check in `authorize()`, audit log in `execute()`.

| Command | Permission | Allowed from | Effect |
|---|---|---|---|
| Retry | `NOTIFICATIONS_RETRY_DELIVERY` | `FAILED`, `attempts < maxAttempts` | → `PENDING`, clears `failureReason`, `nextAttemptAt: now` |
| Cancel | `NOTIFICATIONS_CANCEL_DELIVERY` | `PENDING` or `FAILED` | → `CANCELLED`, `cancelledAt: now` |

## Delivery Admin UI — "Entregas" Tab

A third tab on `/notifications` (`?tab=deliveries`), gated by `NOTIFICATIONS_VIEW_DELIVERIES`, alongside the existing Templates/Rules tabs. Table columns: Date, Notification title (joined from `Notification.title`), Channel, Recipient, Status, Attempts, Last Attempt, Failure Reason, Actions. Filters: status, channel, recipient (substring search), date range — URL-driven (`?status=&channel=&recipient=&dateFrom=&dateTo=&deliveryPage=`), same server-pagination convention as the rest of the app (`DataTable` + `ColumnDef`, matching `academic-events-table.tsx`'s pattern rather than the simpler card-list used by the inbox). "Retry"/"Cancel" row actions only render when the delivery is in an eligible status (`FAILED`+attempts-left for retry, `PENDING`/`FAILED` for cancel) **and** the actor holds the corresponding permission; a "View notification" action opens a read-only dialog with the delivery's details (no separate notification detail route exists in this app).

## Backward Compatibility

Every `Notification` created before this migration has zero `NotificationDelivery` rows — the table didn't exist. This is safe by construction:

- The inbox/bell never read `NotificationDelivery` — they're entirely unaffected.
- The Delivery tab simply shows nothing for those older notifications until backfilled.
- `prisma/backfill-notification-deliveries.ts` (`pnpm db:backfill-notification-deliveries`) creates one `IN_APP`/`DELIVERED` row per orphaned `Notification`, dated to its original `createdAt` — idempotent (only ever selects notifications with zero deliveries, so re-running it is a no-op once complete).

## Audit Log — Phase 3.1 Additions

| Action | Trigger |
|---|---|
| `notification_delivery.retried` | `RetryNotificationDeliveryCommand` |
| `notification_delivery.cancelled` | `CancelNotificationDeliveryCommand` |
| `notification_delivery.failed` | `markFailed` (`notification-delivery.service.ts`), only when `attempts >= maxAttempts` after the transition |

Per-delivery `created`/`processing`/`sent` transitions, and any `FAILED` transition that still has attempts left, are intentionally **not** audited — those are transient/automatic (no human actor, and a transient failure will be retried by the dispatcher on its own), so auditing them would produce one row per attempt rather than one row per outcome. Only a **terminal** `FAILED` (attempts exhausted, no further automatic retry coming) is audited, alongside the two admin-triggered actions (retry, cancel). The audit entry is written with `{ userId: "SYSTEM", organizationId }` since `markFailed` has no end-user actor — same "system" convention used by `daily-financial-integrity.job.ts`.

## Notification Model

`Notification` (`prisma/schema.prisma`, table `notifications`):

| Field | Type | Notes |
|---|---|---|
| `organizationId` | String | Tenant scope — always derived server-side from the active org context |
| `recipientUserId` | String | Required. Phase 1 has no broadcast/no-recipient notifications |
| `type` | String | Free-form. For events created via `createNotificationFromEvent` this is the `eventType` itself (e.g. `"payment.confirmed"`); older/uncatalogued paths still use the `NotificationType` constants from `src/shared/types/common.ts` (e.g. `"PAYMENT_RECEIVED"`). Both are just strings — there's no DB constraint forcing one scheme |
| `severity` | String | `INFO` \| `SUCCESS` \| `WARNING` \| `CRITICAL` |
| `title` / `message` | String | Portuguese, rendered as-is |
| `status` | String | `UNREAD` \| `READ` \| `ARCHIVED` |
| `actionUrl` | String? | Optional deep link rendered in the UI |
| `metadata` | String? | JSON-encoded `Record<string, unknown>`; `referenceId` drives dedupe |
| `readAt` / `archivedAt` | DateTime? | Set when the corresponding transition happens |

Indexes: `(organizationId, recipientUserId, status, createdAt)` for inbox/bell queries, `(organizationId, type, createdAt)` for type-based lookups.

## NotificationTemplate Model

`NotificationTemplate` (table `notification_templates`), scoped by `organizationId`:

| Field | Type | Notes |
|---|---|---|
| `eventType` | String | Matches a catalog entry's `eventType` |
| `channel` | String | `NotificationChannel` — Phase 2 only ever creates/resolves `IN_APP` rows |
| `name` | String | Admin-facing label, not shown to notification recipients |
| `subject` | String? | Reserved for a future EMAIL channel's subject line — unused for IN_APP |
| `titleTemplate` / `bodyTemplate` | String | `{{variable}}` syntax, validated against the event's catalog variables |
| `variables` | String (JSON) | Variable names extracted from title+body at save time — informational, not authoritative (the catalog is) |
| `language` | String | Defaults `"pt-PT"` — not yet used to pick between multiple languages anywhere |
| `isActive` | Boolean | The rule engine only ever resolves `isActive: true` rows |

Indexes: `(organizationId, eventType, channel)`, `(organizationId, isActive)`.

## NotificationEventRule Model

`NotificationEventRule` (table `notification_event_rules`), scoped by `organizationId`, **unique** on `(organizationId, eventType)` — exactly one rule per event per org:

| Field | Type | Notes |
|---|---|---|
| `eventType` | String | Matches a catalog entry's `eventType` |
| `enabled` | Boolean | `false` → `createNotificationFromEvent` always returns `null` for this event |
| `channels` | String (JSON array) | e.g. `["IN_APP"]` — channel must be in this list or the rule engine returns `null` |
| `dedupeWindowMinutes` | Int | Drives `findRecentDuplicate`'s window for this event, replacing the Phase 1 fixed 24h |
| `delayMinutes` | Int | **Stored, not dispatched.** No code reads this to actually delay anything in Phase 2 |
| `priority` | String | `NotificationRulePriority`: `LOW`\|`NORMAL`\|`HIGH`\|`CRITICAL` — informational only; nothing prioritizes on it yet (reserved for a future dispatcher) |

Indexes: `(organizationId, eventType)`, `(organizationId, enabled)`.

## NotificationEmailSettings Model (Phase 3.2B)

`NotificationEmailSettings` (table `notification_email_settings`), scoped by `organizationId`, **unique** on `organizationId` — at most one row per org:

| Field | Type | Notes |
|---|---|---|
| `providerType` | String | `NotificationEmailProviderType`: `SMTP` (implemented) \| `MICROSOFT_GRAPH` (reserved, not implemented) — default `SMTP` |
| `isEnabled` | Boolean | Default `false`. `false` (or no row at all) → the provider registry returns `NoopEmailProvider` for this org's EMAIL deliveries |
| `fromName` / `fromEmail` | String | Used to build the `From:` header (`"${fromName}" <${fromEmail}>`) when the send call doesn't override it |
| `replyTo` | String? | Optional `Reply-To:` header |
| `smtpHost` / `smtpPort` / `smtpUsername` | String? / Int? / String? | Required (non-null) for the registry to ever return a real `SmtpEmailProvider` — any one missing falls back to `NoopEmailProvider` |
| `smtpPasswordEncrypted` | String? (`NVarChar(Max)`) | AES-256-GCM ciphertext (`src/shared/lib/secret-encryption.ts`). **Never** read by anything except `notification-email-settings.repository.ts#findRawByOrganization` |
| `smtpSecure` | Boolean | Default `true` — passed straight through to `nodemailer.createTransport({ secure })` |
| `graphTenantId` / `graphClientId` / `graphClientSecretEncrypted` | String? / String? / String? | Reserved for a future Microsoft Graph provider — not read by any code in this phase |
| `lastTestedAt` / `lastTestStatus` / `lastTestError` | DateTime? / String? / String? | Set by `testEmailSettings` **only when a settings row already exists** — `lastTestStatus` is `NotificationEmailTestStatus` (`SUCCESS` \| `FAILED`) |

The public DTO (`NotificationEmailSettings` in `types/index.ts`, returned by `getEmailSettings`/every action) drops `smtpPasswordEncrypted` and the three `graph*` columns entirely — there is no field on the DTO type a caller could even attempt to read the password from.

## Module Structure

```
src/modules/notifications/
├── catalog/notification-event-catalog.ts
├── types/index.ts
├── providers/
│   ├── notification-provider.ts                       (NotificationProvider, SendNotificationInput/Result — Phase 3.2A)
│   ├── email-provider.ts                               (EmailProvider, NoopEmailProvider, validateSendEmailInput, bridgeSend — Phase 3.2A/B)
│   ├── smtp-email-provider.ts                          (SmtpEmailProvider — Phase 3.2B)
│   └── notification-provider-registry.ts               (getProvider, now async + DB-backed for EMAIL — Phase 3.2B)
├── schemas/
│   ├── notification.schema.ts
│   ├── notification-template.schema.ts
│   ├── notification-event-rule.schema.ts
│   └── notification-email-settings.schema.ts           (Phase 3.2B)
├── repositories/
│   ├── notification.repository.ts
│   ├── notification-template.repository.ts
│   ├── notification-event-rule.repository.ts
│   ├── notification-delivery.repository.ts
│   └── notification-email-settings.repository.ts        (Phase 3.2B — only place that ever reads smtpPasswordEncrypted)
├── services/
│   ├── notification.service.ts                       (createNotification, createNotificationFromEvent, inbox reads/mutations)
│   ├── notification-template-renderer.ts              (pure {{variable}} substitution + validation)
│   ├── notification-rule-engine.service.ts            (resolveNotificationConfig)
│   ├── notification-template.service.ts               (template CRUD + preview)
│   ├── notification-event-rule.service.ts             (rule CRUD)
│   ├── notification-defaults.service.ts               (ensureDefaultNotificationConfig — per-org seeding)
│   ├── notification-recipient-resolver.service.ts     (resolveRecipient — Phase 3.1)
│   ├── notification-delivery.service.ts               (createDeliveriesForNotification, state machine, exponential backoff, runRetryJob — Phase 3.1/3.2B)
│   ├── notification-dispatcher.service.ts             (dispatchPendingDeliveries — Phase 3.1 skeleton, provider-routed since Phase 3.2A, async since Phase 3.2B)
│   └── notification-email-settings.service.ts          (get/upsert/enable/disable/testEmailSettings — Phase 3.2B)
├── commands/
│   ├── create-notification.command.ts
│   ├── mark-notification-read.command.ts
│   ├── mark-all-notifications-read.command.ts
│   ├── archive-notification.command.ts
│   ├── create-notification-template.command.ts
│   ├── update-notification-template.command.ts
│   ├── activate-notification-template.command.ts
│   ├── deactivate-notification-template.command.ts
│   ├── update-notification-event-rule.command.ts
│   ├── retry-notification-delivery.command.ts
│   ├── cancel-notification-delivery.command.ts
│   ├── run-notification-dispatcher.command.ts
│   ├── run-notification-retry-job.command.ts            (Phase 3.2B)
│   ├── upsert-notification-email-settings.command.ts    (Phase 3.2B)
│   ├── enable-notification-email-settings.command.ts    (Phase 3.2B)
│   ├── disable-notification-email-settings.command.ts   (Phase 3.2B)
│   └── test-notification-email-settings.command.ts      (Phase 3.2B)
├── actions/
│   ├── notification.actions.ts
│   ├── notification-template.actions.ts
│   ├── notification-event-rule.actions.ts
│   ├── notification-delivery.actions.ts
│   └── notification-email-settings.actions.ts           (Phase 3.2B)
└── components/
    ├── notification-bell.tsx
    ├── notification-list.tsx
    ├── notification-card.tsx
    ├── notification-filters.tsx
    ├── notification-template-list.tsx
    ├── notification-template-form-sheet.tsx
    ├── notification-template-preview-dialog.tsx
    ├── notification-rule-list.tsx
    ├── notification-rule-form-sheet.tsx
    ├── notification-delivery-table.tsx
    ├── notification-delivery-columns.tsx
    └── notification-email-settings-panel.tsx             (Phase 3.2B)
```

`src/shared/lib/secret-encryption.ts` (encrypt/decrypt), `src/server/jobs/notification-dispatch.job.ts` (multi-org batch), and `src/app/api/internal/jobs/notifications/dispatch/route.ts` (the dispatcher route) live outside the module, following the same convention as `daily-billing.job.ts`/`daily-billing/route.ts`.

Event handlers live under `src/server/events/handlers/` (the codebase's existing convention — handlers are colocated with the event bus, not inside the business module), registered in `src/server/events/registry.ts`.

## Event Handlers

`NotificationEventHandler` (`src/server/events/handlers/notification.handler.ts`) handles the 4 primary events. Since Phase 2, it no longer hardcodes title/message — it resolves the recipient and the event's **variables**, then calls `notificationService.createNotificationFromEvent({ eventType, recipientUserId, variables, referenceId })`. The rule + template resolve the actual title/body/severity/actionUrl/dedupe window.

| Domain Event | Recipient | Variables passed | referenceId |
|---|---|---|---|
| `payment.confirmed` | Student's linked user | `paymentId`, `paymentNumber` | `paymentId` |
| `invoice.overdue` | Student's linked user | `invoiceId`, `invoiceNumber` | `invoiceId` |
| `assessment.results_published` | Each graded student's linked user | `assessmentId`, `assessmentTitle` | `assessmentId` |
| `attendance.student_at_risk` | Student's linked user | `studentId` | `studentId` (or `studentId:levelSubjectId`) |

If the student has no linked `User` (resolved by email match), no notification is created. If the org has no `NotificationEventRule` for the event, disabled it, or removed `IN_APP` from its channels, `createNotificationFromEvent` returns `null` and nothing is created — see "Rule Engine" below.

### Known Limitation: `invoice.overdue` has no publisher yet

`DomainEventType.INVOICE_OVERDUE` exists in `event-types.ts` but nothing in this codebase currently publishes it — the daily billing job (`src/server/jobs/daily-billing.job.ts`) only emits the aggregated `billing.overdue_detected` event (org-level counts, no per-invoice IDs). The handler above is wired correctly and will work the moment a publisher exists; until then it stays dormant. Closing it means either emitting `invoice.overdue` per invoice from the billing job, or adding a handler for `billing.overdue_detected` that fans out. Neither is part of this phase.

### Other events routed through `CommunicationEventHandler`

`src/server/events/handlers/communication.handler.ts` handles 5 events. Since Phase 2, the 3 that are in the event catalog go through the same rule/template path as above:

- `enrollment.activated` — variables: `enrollmentId`, `enrollmentNumber`, `studentName`, `courseName`
- `attendance.justification_approved` — variables: `justificationId`
- `attendance.justification_rejected` — variables: `justificationId`, `rejectionReason`

`enrollment.cancelled` and `attendance.student_below_required` are **not** in the catalog and intentionally still call the plain `notificationService.createNotification()` with hardcoded title/message, unchanged since Phase 1. Routing them through the rule engine without first seeding a rule for them would silently stop them firing — they were kept on the old path rather than catalogued speculatively. They remain legacy by design, not an oversight.

### `enrollment.activated` has two triggers — both go through the rule engine

`enrollment.activated` is created from two independent places, and **both** call `notificationService.createNotificationFromEvent` with the identical variable set (`enrollmentId`, `enrollmentNumber`, `studentName`, `courseName`) — there is no hardcoded title/message left in either path:

- **Manual activation** — an admin/secretary calls `ActivateEnrollmentCommand`, which publishes `DomainEventType.ENROLLMENT_ACTIVATED`; `CommunicationEventHandler` reacts to it (case above).
- **Automatic activation** — `EnrollmentActivationEventHandler` reacts to `payment.confirmed`, evaluates the enrollment's `EnrollmentBillingPolicy.activationRule` (`AFTER_FIRST_PAYMENT` / `AFTER_FULL_PAYMENT` / `AFTER_REGISTRATION_FEE`), and on activation calls `createNotificationFromEvent` itself — it does **not** re-publish `ENROLLMENT_ACTIVATED` onto the event bus, so `CommunicationEventHandler` never double-fires for the same activation.

Because both call sites resolve through the same rule + template for `enrollment.activated`, disabling that rule or editing its template in the Rules/Templates tab affects both the manual and the automatic activation path identically.

`lesson.published` has no notification-creation code at all (dropped in Phase 1 — it never had a single recipient) but **is** catalogued (see below) so it can be configured ahead of a future handler.

## Event Catalog

`src/modules/notifications/catalog/notification-event-catalog.ts` is the global, read-only source of truth for every event the Notifications Center can configure. Each entry declares:

- `variables` — every variable name its title/body/actionUrl pattern may use. A template referencing anything else fails validation at save time.
- `sampleVariables` — example values, used to auto-fill the template preview form.
- `defaultSeverity`, `defaultActionUrlPattern`, `defaultTitleTemplate`, `defaultBodyTemplate` — used both to seed an org's default rule + template, and as the rule engine's last-resort fallback when no org-specific template exists.

9 events are catalogued: the 4 primary ones above, plus 5 already-emitted "legacy" events (`enrollment.created`, `enrollment.activated`, `attendance.justification_approved`, `attendance.justification_rejected`, `lesson.published`). **Catalog membership does not imply a handler exists** — `enrollment.created` and `lesson.published` have no notification-creation code; they're catalogued (and seeded with a rule + template) purely so an admin can configure them ahead of a future handler, per the Phase 2 spec's "do not implement new handlers for events that don't already have one."

## Template Renderer

`src/modules/notifications/services/notification-template-renderer.ts` — pure functions, no DB access:

- `renderTemplate(template, variables)` replaces every `{{variableName}}`. A variable with no value (or `null`/`undefined`) is left as the literal `{{variableName}}` text and reported in `missingVariables` — the in-app channel never throws on a missing variable, it just shows the placeholder.
- `validateTemplateVariables(content, allowedVariables)` — used by `notification-template.service.ts` at create/update time to reject a template using a variable the event catalog doesn't declare.
- Rendered as plain text everywhere; HTML escaping is intentionally not implemented since nothing renders this with `dangerouslySetInnerHTML`.

## Rule Engine

`resolveNotificationConfig(organizationId, eventType, channel = "IN_APP")` in `notification-rule-engine.service.ts`:

1. No catalog entry for `eventType` → `null` (dev-only console warning).
2. No `NotificationEventRule` for `(organizationId, eventType)` → `null` (dev-only console warning) — **the notification is not created**, by design.
3. `rule.enabled === false` → `null`.
4. `channel` not in `rule.channels` → `null`.
5. Otherwise: look up the most recently updated `isActive` `NotificationTemplate` for `(organizationId, eventType, channel)`. Found → use its `titleTemplate`/`bodyTemplate` (`templateSource: "ORG_TEMPLATE"`). Not found → use the catalog's `defaultTitleTemplate`/`defaultBodyTemplate` (`templateSource: "CATALOG_DEFAULT"`).

`notificationService.createNotificationFromEvent` calls this, renders the resolved templates + the catalog's `defaultActionUrlPattern` against the caller's `variables`, applies dedupe using **the rule's own `dedupeWindowMinutes`** (not a hardcoded 24h — see `findRecentDuplicate`'s `windowMinutes` parameter), and creates the `Notification` with `severity` from the catalog entry.

## Default Seeding

`ensureDefaultNotificationConfig(organizationId)` (`notification-defaults.service.ts`) is idempotent: for every catalog event, it creates exactly one `NotificationEventRule` (`enabled: true`, `channels: ["IN_APP"]`, `dedupeWindowMinutes: 1440`, `delayMinutes: 0`, `priority` derived from the event's `defaultSeverity` via `defaultPriorityForSeverity`) and one `NotificationTemplate` (IN_APP, using the catalog's default text) — but only for events the org doesn't already have one for. It never overwrites an admin's existing customization.

Called from two places:

- `prisma/seed.ts` — loops every existing `Organization` (so `pnpm db:seed` backfills orgs created before Phase 2).
- `CreateOrganizationCommand.execute()` — so every newly created organization gets working defaults immediately, with no manual setup step.

## Anti-Duplication (Dedupe)

Two dedupe paths exist side by side:

- `notificationService.createNotification` (the plain, Phase 1 path — still used by `CreateNotificationCommand` and the 2 uncatalogued `communication.handler.ts` events) uses a fixed 24h (1440 minute) window.
- `notificationService.createNotificationFromEvent` (the Phase 2, rule-driven path) uses **the resolved rule's `dedupeWindowMinutes`**, which an admin can change per event in the Rules tab.

Both compare `organizationId` + `recipientUserId` + `type`/`eventType` + `metadata.referenceId` over the window. No `referenceId` means no dedupe check runs. This is separate from (and in addition to) the domain event bus's own per-event idempotency — the bus prevents reprocessing the same event row; this dedupe prevents distinct events about the same underlying condition from spamming the same notification repeatedly.

## RBAC

| Permission | Constant | Notes |
|---|---|---|
| `notifications.viewOwn` | `NOTIFICATIONS_VIEW_OWN` | Granted to every system role (SECRETARY, TEACHER, STUDENT, and via the wildcard to ORG_ADMIN/SUPER_ADMIN) |
| `notifications.markRead` | `NOTIFICATIONS_MARK_READ` | Same as above |
| `notifications.archiveOwn` | `NOTIFICATIONS_ARCHIVE_OWN` | Same as above |
| `notifications.viewAll` | `NOTIFICATIONS_VIEW_ALL` | ORG_ADMIN / SUPER_ADMIN only, via the existing "all permissions except organizations.delete" filter |
| `notifications.manageTemplates` | `NOTIFICATIONS_MANAGE_TEMPLATES` | ORG_ADMIN / SUPER_ADMIN only — not granted to SECRETARY/TEACHER/STUDENT |
| `notifications.manageRules` | `NOTIFICATIONS_MANAGE_RULES` | ORG_ADMIN / SUPER_ADMIN only — not granted to SECRETARY/TEACHER/STUDENT |
| `notifications.viewDeliveries` | `NOTIFICATIONS_VIEW_DELIVERIES` | ORG_ADMIN / SUPER_ADMIN (wildcard) + SECRETARY (view-only, per spec) — not granted to TEACHER/STUDENT |
| `notifications.retryDelivery` | `NOTIFICATIONS_RETRY_DELIVERY` | ORG_ADMIN / SUPER_ADMIN only |
| `notifications.cancelDelivery` | `NOTIFICATIONS_CANCEL_DELIVERY` | ORG_ADMIN / SUPER_ADMIN only |
| `notifications.manageEmailSettings` | `NOTIFICATIONS_MANAGE_EMAIL_SETTINGS` | ORG_ADMIN / SUPER_ADMIN only (Phase 3.2B) — gates the "Email" tab and all 4 email-settings commands |

`CreateNotificationCommand` has no permission gate — notifications are only ever created from domain event handlers (system-triggered) or other commands, never from a direct user-facing "create" action. Its protection is tenant + recipient-membership validation, not RBAC.

`listNotificationTemplatesAction`/`previewNotificationTemplateAction` bypass the Command layer (they're reads) and call `requirePermission(NOTIFICATIONS_MANAGE_TEMPLATES)` directly, since there's no Command to own that check.

## Tenant Isolation

- `organizationId` always comes from `requireOrganization()` (active org context), never from client input.
- Every notification/template/rule lookup filters by `organizationId`. A cross-tenant id simply resolves to "not found" — same as it not existing.
- `MarkNotificationReadCommand` / `ArchiveNotificationCommand` additionally check `notification.recipientUserId === context.userId`, bypassed only when the actor holds `NOTIFICATIONS_VIEW_ALL`.
- The event catalog itself is global and read-only (a plain TypeScript module, not a DB table) — there's nothing tenant-scoped to isolate there.
- `RetryNotificationDeliveryCommand` / `CancelNotificationDeliveryCommand` look up the delivery via `findDeliveryById(id, organizationId)` — a cross-tenant id resolves to `null`, surfaced as `NotFoundError`, identical to every other command in this module.

## Audit Log

| Action | Trigger |
|---|---|
| `notification.archived` | `ArchiveNotificationCommand` |
| `notification_template.created` | `CreateNotificationTemplateCommand` |
| `notification_template.updated` | `UpdateNotificationTemplateCommand` |
| `notification_template.activated` | `ActivateNotificationTemplateCommand` |
| `notification_template.deactivated` | `DeactivateNotificationTemplateCommand` |
| `notification_rule.enabled` / `notification_rule.disabled` | `UpdateNotificationEventRuleCommand`, only when `enabled` is the field that changed |
| `notification_rule.updated` | `UpdateNotificationEventRuleCommand`, for any other field change (channels/dedupe/delay/priority) |
| `notification_email_settings.updated` | `UpsertNotificationEmailSettingsCommand` (Phase 3.2B) — `oldValues`/`newValues` are the DTO, never the password |
| `notification_email_settings.enabled` / `notification_email_settings.disabled` | `EnableNotificationEmailSettingsCommand` / `DisableNotificationEmailSettingsCommand` (Phase 3.2B) |
| `notification_email_settings.tested` | `TestNotificationEmailSettingsCommand` (Phase 3.2B) — logs only `{ success, errorMessage, recipientEmail }` |
| `notification_delivery.retried` | Also written by `RunNotificationRetryJobCommand` (Phase 3.2B) when `retried > 0`, in addition to the existing manual `RetryNotificationDeliveryCommand` trigger — one row per job run, not per delivery |
| `notification_dispatcher.run` | `runNotificationDispatchJob` (Phase 3.2B) — one row per route invocation, not per delivery; written with `actorId: null` (machine-triggered, no end-user actor) |

Marking as read/all-as-read is intentionally not audited, to avoid log spam from routine read-state changes. The `enabled`/`disabled` vs `updated` split on rules is mutually exclusive — a single save never produces two audit entries.

## Templates & Rules UI

Both live as tabs on `/notifications` (`?tab=templates` / `?tab=rules`), per the spec's recommendation to avoid separate routes. The tabs only render if the user holds the corresponding `manageTemplates`/`manageRules` permission — for everyone else the page is just the inbox, unchanged from Phase 1.

- **Templates tab** — list (event/channel/status), a Sheet-based create/edit form (event + channel locked once created), and a preview Dialog that renders the title/body against the catalog's sample variables (editable inline) without creating a `Notification`. Activating a template deactivates any other active template for the same `(eventType, channel, language)` — "one active template wins," enforced in `notification-template.service.ts#activateTemplate` rather than a DB constraint, so drafts/history can still exist as inactive rows.
- **Rules tab** — list with an inline `enabled` toggle (saves immediately) and an "Editar" button opening a Sheet for channels/dedupe window/delay/priority.

Both list components are server-fetched once on `/notifications` page load (the catalog is small — 9 rows) and use `router.refresh()` after mutations rather than client-side cache invalidation, matching the inbox's existing convention. Form sheets avoid the project's `react-hooks/set-state-in-effect` lint rule by keying an inner fields component on `template?.id`/`rule.id` so switching targets remounts with fresh initial state from props, instead of an effect that calls `setState`.

## Inbox (`/notifications`)

Default view: `UNREAD` + `READ`, excludes `ARCHIVED`. Filters: status (`UNREAD` / `READ` / `ARCHIVED` / `ALL`), severity, type (free text), date range — all URL-driven (`?status=&severity=&type=&dateFrom=&dateTo=&page=`), server-side paginated (`buildPaginationMeta`/`buildSkipTake`, page size 20).

## Header Bell

Self-fetches via `getNotificationBellDataAction` (unread count + latest 10 only — never the full paginated list) using `useQuery`, refetched on dropdown open and after marking a notification as read (`queryClient.invalidateQueries`). Calls the same `markNotificationReadAction` used by the inbox.

## Future Phases (not in this implementation)

Phase 3.2B closed most of the "real providers" gap for EMAIL — see the Phase 3.2B section above. What's left:

- A real Microsoft Graph `EmailProvider` (the schema fields, the `MICROSOFT_GRAPH` registry branch, and the disabled "em breve" UI option already exist — only the implementation is missing)
- `WHATSAPP`/`SMS`/`PUSH` providers (Twilio/etc.) and their own settings models — `NotConfiguredProvider` is still a placeholder for all three
- Push token storage so `resolveRecipient` can resolve `PUSH`
- A queue (BullMQ or similar) instead of an HTTP-route-triggered batch job — the current dispatcher/retry job pair assumes an external scheduler (cron, Windows Task Scheduler, etc.) calls the route/command on an interval; there is no in-process scheduler
- A delivery queue / retry jobs that actually act on `delayMinutes` (rule-level) — still stored, still unread by anything
- Per-channel EMAIL templates/subjects (`NotificationTemplate.channel = EMAIL` rows are creatable in the schema but unread — the email subject/body is always the IN_APP-resolved `Notification.title`/`message`)
- Bounce/complaint webhooks — no provider here ever reports `DELIVERED` after the fact; `SENT` is the ceiling
- Per-user notification preferences (mute by type/severity, or by channel)
- Marketing / broadcast campaigns
- Closing the `invoice.overdue` publisher gap described above
- Folding `enrollment.cancelled` / `attendance.student_below_required` into the catalog so they go through the rule engine too
