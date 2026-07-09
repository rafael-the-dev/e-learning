# Certificate Engine — Developer Onboarding Guide

> Audience: backend engineers joining the project.
> Purpose: teach you how to build **inside** the Certificate Engine without breaking
> its architecture. It is a hands-on manual — copy the patterns here and the
> architecture-guard tests will pass. Break them and CI fails.
>
> Companion docs: [architecture](./certificate-engine-v1-architecture.md) ·
> [API](./certificate-engine-api.md) · [operations](./certificate-engine-operations.md) ·
> the frozen decisions in [`adr/ADR-002-certificate-engine-architecture.md`](./adr/ADR-002-certificate-engine-architecture.md).

---

## 0. The one thing to internalize first

**The Certificate Engine certifies frozen facts. It never produces or recalculates
academics.** Academic truth is owned by the Transcript Engine (upstream). Your job
inside this module is to copy already-decided facts, apply certificate-domain rules,
and persist/expose them — never to compute a grade, an attendance percentage, a
completion, or re-decide eligibility outside the one place that decides it.

Everything below is a consequence of that sentence. If a change would make the
engine *depend on* or *recompute* academic data, it is wrong regardless of how clean
the code looks.

---

## 1. Folder structure

```
src/modules/certificates/
├── constants.ts        Domain vocabularies: const objects + string-literal types.
├── index.ts            Module barrel.
├── schemas/            Zod v4 input contracts (validators).
├── types/              Pure TypeScript contracts — DTOs, params, results. No runtime.
├── lib/                Pure helpers (checksum, number, verification code/url). No I/O.
├── repositories/       The ONLY layer that imports Prisma. Org-scoped persistence.
│   └── certificate-transcript-source.repository.ts   ← the ACL (only transcript reader)
├── services/           Read side + pure domain logic. NEVER mutates the DB.
│   └── certificate-eligibility.engine.ts             ← the ONLY eligibility authority
├── commands/           The ONLY layer that mutates. BaseCommand pattern.
├── outbox/             The ONLY event-delivery seam (enqueue → publish).
├── export/             Infrastructure ADAPTERS (PDF, storage, ministry). Not services.
└── **/__tests__/       Vitest suites, including static architecture-guard tests.

src/app/api/certificates/**          Admin/secretary + operational routes (thin shells).
src/app/api/student/certificates/**  Student self-scoped routes.
src/app/api/public/certificates/**   Public verification (no auth).
```

Dependency direction is strictly one-way. Memorize it:

```
route → command (mutate) / service (read) → repository → Prisma
                                    service reads transcript facts ONLY via the ACL repository
command → outbox → eventPublisher        (never command → eventPublisher directly)
command → export/ adapters               (via interfaces in types/export.ts)
```

A layer never imports "sideways or upward": services never import commands,
repositories never import services/commands, routes never embed rules.

---

## 2. Naming conventions

Follow the project i18n rule: **identifiers in English, user-facing strings in
PT-PT.** (See `.claude/skills/i18n.md`.)

| Thing | Convention | Example |
|---|---|---|
| Command class | `VerbNounCommand` | `IssueCertificateCommand` |
| Command file | `verb-noun.command.ts` | `issue-certificate.command.ts` |
| Command result | `VerbNounResult` interface | `IssueCertificateResult` |
| Repository file | `certificate-<entity>.repository.ts` | `certificate-request.repository.ts` |
| Repository fn | `verbEntity(params, client?)` | `createCertificateRequest(...)` |
| Read service | `certificate-<x>-read.service.ts` / `certificate-<x>.service.ts` | `certificate-admin-read.service.ts` |
| Service class + singleton | `PascalService` + `camelService` export | `class CertificateHealthService` + `certificateHealthService` |
| Zod schema | `verbNounSchema` + `VerbNounInput` type | `generateCertificateSchema`, `GenerateCertificateInput` |
| DTO / type | `...Dto` (outward) / `...Record` (repo row) / `...Result` (command) | `AdminCertificateDetailDto`, `CertificateRequestRecord` |
| Enum value | `SCREAMING_SNAKE`, English, never translated | `PENDING_APPROVAL` |
| Domain vocabulary | const object in `constants.ts` (no native Prisma enum) | `CertificateStatus.ISSUED` |

Enum **values** travel in URLs/payloads/DB — never translate them. Translate only at
render time (labels, toasts, validation messages).

---

## 3. How to create a new command (the mutation path)

Every mutation is a `BaseCommand` subclass with three phases:
`validate()` → `authorize()` → `execute()`, orchestrated by `run()`.

**Skeleton (follow this exactly):**

```ts
// commands/do-something.command.ts
import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import { BaseCommand, AuthorizationError, BusinessRuleError, ValidationError } from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import type { DomainEvent } from "@/server/events/domain-event";
import { certificateOutbox } from "@/modules/certificates/outbox";
import { doSomethingSchema, type DoSomethingInput } from "@/modules/certificates/schemas/certificate.schema";
import { findCertificateById, someConditionalWrite } from "@/modules/certificates/repositories/certificate.repository";
import { createCertificateEvent } from "@/modules/certificates/repositories/certificate-event.repository";

export interface DoSomethingResult {
  certificateId: string;
  status: string;
  previousStatus: string;
}

export class DoSomethingCommand extends BaseCommand<DoSomethingInput, DoSomethingResult> {
  async validate(): Promise<void> {
    const parsed = doSomethingSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CERTIFICATES_SOMETHING)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<DoSomethingResult> {
    const { organizationId } = this.context;
    const input = doSomethingSchema.parse(this.input);
    const events: DomainEvent[] = [];

    const db = await getDb();
    const result = await db.$transaction(async (tx: PrismaClientOrTx) => {
      const cert = await findCertificateById({ id: input.certificateId, organizationId }, tx);
      if (!cert) throw new NotFoundError("Certificate", input.certificateId);

      // CONDITIONAL WRITE — guard on the expected current status; assert exactly one row.
      const count = await someConditionalWrite(
        { id: cert.id, organizationId, expectedStatus: "ISSUED", newStatus: "SUSPENDED" },
        tx
      );
      if (count !== 1) throw new BusinessRuleError("Transição inválida");

      // Audit event INSIDE the transaction.
      await createCertificateEvent(
        { organizationId, certificateId: cert.id, eventType: "certificate.suspended",
          previousStatus: cert.status, newStatus: "SUSPENDED", actorId: this.context.userId },
        tx
      );

      events.push({
        eventType: DomainEventType.CERTIFICATE_SUSPENDED,
        aggregateType: DomainAggregateType.CERTIFICATE,
        aggregateId: cert.id,
        organizationId,
        payload: { certificateId: cert.id },
      });

      return { certificateId: cert.id, status: "SUSPENDED", previousStatus: cert.status };
    });

    // Publish AFTER commit — ONLY through the Outbox. Never eventPublisher directly.
    await certificateOutbox.dispatch(events);
    return result;
  }
}
```

**Rules for a command:**
- One transaction per operation; pass `tx` into every repository call so all writes
  (status + audit event + counters) commit atomically.
- State transitions are **conditional writes** (`WHERE status = expected`, assert
  `count === 1`) — this is your concurrency safety, do not skip it.
- Collect `DomainEvent`s and dispatch them **after commit** via
  `certificateOutbox.dispatch(events)`.
- Branch only on the eligibility engine's result — never re-decide eligibility.
- Never read a Transcript table or an Academic Core table directly; if you need
  transcript facts, load them through the ACL (via the eligibility source).

---

## 4. How to create a repository (the persistence path)

Repositories are the **only** layer that imports Prisma. They persist and read;
they decide nothing.

```ts
// repositories/certificate-thing.repository.ts
import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { CertificateThingRecord } from "@/modules/certificates/types/repository";

const thingSelect = { id: true, organizationId: true, status: true, createdAt: true } as const;

type Row = Record<string, unknown>;
function toRecord(row: Row): CertificateThingRecord {
  return { id: row.id as string, organizationId: row.organizationId as string,
           status: row.status as string, createdAt: row.createdAt as Date };
}

export interface FindThingParams { id: string; organizationId: string; }

export async function findThingById(
  params: FindThingParams,
  client?: PrismaClientOrTx
): Promise<CertificateThingRecord | null> {
  const db = client ?? (await getDb());
  const row = await db.certificateThing.findFirst({
    where: { id: params.id, organizationId: params.organizationId },  // ALWAYS org-scoped
    select: thingSelect,
  });
  return row ? toRecord(row as Row) : null;
}

/** Conditional status write — returns the affected row count for the command to assert. */
export async function markThingDone(
  params: { id: string; organizationId: string; expectedStatus: string },
  client?: PrismaClientOrTx
): Promise<number> {
  const db = client ?? (await getDb());
  const res = await db.certificateThing.updateMany({
    where: { id: params.id, organizationId: params.organizationId, status: params.expectedStatus },
    data: { status: "DONE" },
  });
  return res.count;
}
```

**Rules for a repository:**
- Every `where` carries `organizationId`. Use `findFirst`/`findMany`/`count` — never
  `findUnique(id)` on a global id.
- Accept an optional `client?: PrismaClientOrTx` and use `client ?? await getDb()` so
  a command can pass its transaction.
- Map rows to `...Record` types; never leak a raw Prisma entity/relation.
- **No business logic**: no eligibility, no grade/attendance/completion math, no
  lifecycle decision, no numbering/checksum, no events/audit.
- **Soft delete only** (`deletedAt`); never `.delete(`/`.deleteMany(`.
- The `certificate-event.repository.ts` is **append-only** — no update/delete/upsert.

---

## 5. How to create a read service (the read path)

Services compose repository reads into DTOs. They **never write** and **never
publish events**.

```ts
// services/certificate-thing-read.service.ts
import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { listThings } from "@/modules/certificates/repositories/certificate-thing.repository";
import type { CertificateThingListResult } from "@/modules/certificates/types/portal";

export class CertificateThingReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.CERTIFICATES_VIEW)) throw new AuthorizationError();
  }

  async list(context: AuthContext, filters: { page?: number }): Promise<CertificateThingListResult> {
    this.assertCanView(context);
    const rows = await listThings({ organizationId: context.organizationId, ...filters });
    return { items: rows.map(toDto), total: rows.length, page: filters.page ?? 1, pageSize: 20 };
  }
}
export const certificateThingReadService = new CertificateThingReadService();
```

**Rules for a service:**
- Authorize first (`context.ability.can(...)`); default deny.
- Scope by `context.organizationId` — always from the context, never from input.
- No DB writes (`create/update/delete/upsert`, raw SQL). No `eventPublisher`.
- No Academic Core / Transcript reads except transcript facts via the ACL (only the
  eligibility source does that). Operational read services touch neither.
- Pure domain logic that is a function of its inputs (like the eligibility engine)
  lives in `services/` too, but must stay pure: no I/O, no clock, no randomness.

---

## 6. How to create a route (the transport shell)

Routes are thin. Authenticate, delegate, map errors. No business logic.

```ts
// app/api/certificates/thing/route.ts
import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateThingReadService } from "@/modules/certificates/services/certificate-thing-read.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const result = await certificateThingReadService.list(context, { /* parsed filters */ });
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
```

**Rules for a route:**
- `requireOrganization()` in its own try/catch → `401` on failure.
- Delegate to a command (mutation) or read service; do not embed rules or recompute.
- Use `mapCertificateError(err)` for the typed-error → status mapping (422/403/404/
  500) so responses stay consistent and never leak internals.
- Never read `organizationId`/`studentId` from the request — they come from context.
- Operational routes must not import a repository or a command (they call a read
  service only) — a guard test enforces this.

---

## 7. How to create a DTO

DTOs are pure types in `types/`. Distinguish three flavors:

- **`...Record`** — a repository's row shape (internal).
- **`...Result`** — a command's return value (internal → route).
- **`...Dto`** — an **outward** shape returned over HTTP; the privacy boundary.

```ts
// types/portal.ts
export interface CertificateThingListItemDto {
  id: string;
  status: string;          // domain enum value, never a translated label
  createdAt: Date;         // serialized as ISO-8601 in JSON
}
export interface CertificateThingListResult {
  items: CertificateThingListItemDto[];
  total: number; page: number; pageSize: number;
}
```

**Rules for a DTO:**
- Outward DTOs expose **only** what the consumer needs. Never `passwordHash`, tokens,
  checksums, storage paths (`fileUrl`), verification codes, transcript pointers, or
  raw snapshot/metadata blobs.
- Student DTOs are more redacted than admin DTOs (no events, no checksums, no
  transcript pointer, no finance reference).
- Compute `allowedActions` server-side; the UI renders flags, it never infers rules.

---

## 8. How to create a validator

Input validation is Zod v4 in `schemas/certificate.schema.ts`. Derive enum schemas
from the const objects so they can never drift.

```ts
export const doSomethingSchema = z
  .object({
    certificateId: z.string().min(1, "O identificador do certificado é obrigatório"),
    reason: z.string().max(500, "O motivo não pode exceder 500 caracteres").optional(),
  })
  .strict();                       // reject unexpected fields
export type DoSomethingInput = z.infer<typeof doSomethingSchema>;
```

**Rules for a validator:**
- `.strict()` on every command input — never blindly spread a request body.
- Never accept server-owned/immutable fields from the client: `organizationId`,
  `studentId` (except a staff-created request), `certificateNumber`, `checksum`,
  `status`, `transcriptNumber`/`transcriptChecksum`, `verificationCode`, `fileUrl`.
- Validation messages are PT-PT; field keys stay English.
- Enum schemas come from `values(ConstObject)` so schema and domain vocabulary stay
  in lockstep.

---

## 9. How to create tests

Vitest. Every new surface needs behavior tests; every architectural boundary you
touch is already covered by a static guard test that will fail if you cross it.

- **Fake DB:** `repositories/__tests__/_fake-db.ts` is an in-memory Prisma stand-in
  (`findFirst/findMany/count/create/updateMany`, `in`/`notIn`/`not`/ranges; ignores
  `select`). Use `makeFakeDb()` + `seed(...)` and mock `@/server/db`:
  ```ts
  const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
  vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
  beforeEach(() => { h.db = makeFakeDb(); });
  ```
- **Commands:** test validate/authorize/execute, the conditional-write concurrency
  guard (assert a second concurrent transition fails), and that events are dispatched
  via the Outbox. Reset the outbox singleton in `beforeEach` (`certificateOutbox.reset()`).
- **Services:** test authz (missing permission → `AuthorizationError`), org scoping
  (foreign-org rows are invisible), and read-only-ness.
- **Pure functions** (eligibility engine, retry policy, checksum): table-driven,
  deterministic — same input, same output.
- **Architecture guards:** you rarely write these, but know they exist (§11). If you
  add a repository/service/route, the count assertions in the guard tests may need
  updating — update them intentionally, and only after confirming the file obeys the
  rules.
- Run the module's suites before pushing:
  ```bash
  pnpm exec vitest run src/modules/certificates src/app/api/certificates src/server/events
  ```

---

## 10. Architecture rules (the hard boundaries)

1. **Mutations only in `commands/`; reads only in `services/`.** Repositories persist,
   they don't decide.
2. **Repositories are the only Prisma importers**, always org-scoped.
3. **Eligibility is decided once** — in `certificate-eligibility.engine.ts` (pure).
   Commands execute the result; nothing else re-decides.
4. **Transcript is read only through the ACL** (`certificate-transcript-source.repository.ts`),
   read-only, DTOs only.
5. **No Academic Core dependency** — never import `modules/{grades,attendance,
   assessments,academic,enrollments}` or reference `AcademicTranscript*` outside the ACL.
6. **Snapshots are frozen** — copy at generate, checksum once at issue, never mutate
   afterward.
7. **Events publish after commit, only through the Outbox.**
8. **Storage/PDF/ministry live behind adapters in `export/`**, consumed via interfaces
   in `types/export.ts` — never imported into a service.
9. **The transcript is a POINTER** (`transcriptVersionId: String`), never a Prisma
   relation.

---

## 11. Architecture guard philosophy

The rules above are not honor-system — they are **enforced by static tests** that read
the source files directly and fail on a forbidden pattern:

- `__tests__/architecture-guards.test.ts` — no Grade/Attendance/Transcript-write/React
  imports anywhere in the module; the Prisma model set is frozen; `transcriptVersionId`
  is never a relation.
- `repositories/__tests__/architecture-guards.test.ts` — the ACL is read-only and
  exposes no write-shaped function; model repositories don't read the Transcript,
  don't publish events/audit, don't do checksum/numbering, don't hard-delete, and hold
  no lifecycle helper; the event repo is append-only.
- `services/__tests__/architecture-guards.test.ts` and
  `__tests__/operational-architecture-guards.test.ts` — services don't write or
  publish; operational routes don't import repositories/commands; only the Outbox
  references `eventPublisher`.

**Why it matters:** these tests are the memory of the design decisions. If your change
trips a guard, the guard is almost always right — rework the change, don't weaken the
guard. Only edit a guard when you are *deliberately and correctly* changing the count
of files or the allowed set, and you can articulate why the boundary still holds.

---

## 12. GOOD vs BAD patterns

**GOOD — command branches on the engine's decision:**
```ts
const result = evaluateCertificateEligibility(facts);   // pure decision
if (!result.eligible) throw new BusinessRuleError("Certificado não elegível", { blockingReasons: result.blockingReasons });
// ... execute the already-decided outcome
```
**BAD — command re-deciding eligibility inline:**
```ts
// ❌ duplicates the rule; now there are two sources of truth
if (transcript.status !== "ISSUED" || subjects.some(s => s.status === "PENDING")) {
  throw new BusinessRuleError("not eligible");
}
```

**GOOD — repository persists what the command decided:**
```ts
export async function markCertificateIssued(params, client?) {
  const db = client ?? await getDb();
  return db.certificate.updateMany({ where: { id: params.id, organizationId: params.organizationId, status: "DRAFT" },
                                     data: { status: "ISSUED", certificateNumber: params.number } });
}
```
**BAD — repository making a business decision:**
```ts
// ❌ business logic in a repository
export async function issueIfEligible(id, orgId) {
  const cert = await db.certificate.findFirst({ where: { id, organizationId: orgId } });
  if (cert.transcriptChecksum === recomputeChecksum(cert)) { /* decide + write */ }  // NO
}
```

**GOOD — transcript facts via the ACL / eligibility source:**
```ts
const facts = await loadCertificateEligibilityFacts({ organizationId, transcriptVersionId, ... }, tx);
```
**BAD — direct transcript read:**
```ts
// ❌ crosses the engine boundary; fails the guard
const version = await db.academicTranscriptVersion.findFirst({ where: { id } });
```

**GOOD — publish through the Outbox after commit:**
```ts
await certificateOutbox.dispatch(events);
```
**BAD — direct publish (and inside the transaction):**
```ts
// ❌ bypasses the single seam; may emit for a rolled-back mutation
for (const e of events) await eventPublisher.publish(e);
```

**GOOD — storage behind an adapter interface:**
```ts
const stored = await this.storage.persist(bytes, { certificateId });   // storage: CertificateExportStorage
```
**BAD — direct storage/PDF in a service:**
```ts
// ❌ service reaching into infrastructure; fails the guard
import { uploadToS3 } from "@/infrastructure/storage";
```

---

## 13. Things NEVER allowed

| Forbidden | Why | Do instead |
|---|---|---|
| **Business logic in repositories** | Splits the rule from its owner; untestable in isolation. | Decide in the command/engine; repository only persists/reads. |
| **Eligibility duplication** | Two sources of truth drift apart. | `evaluateCertificateEligibility(facts)` is the only decider. |
| **Direct transcript reads** | Couples to the Transcript schema; leaks academic recompute. | Read via the ACL (`certificate-transcript-source.repository.ts`) → DTOs. |
| **Academic Core dependency** | The engine must not depend on live academics. | Consume frozen snapshots only. |
| **Snapshot mutation** | Certificates must reflect the world at issue. | Copy at generate; checksum once at issue; never rewrite. |
| **Direct event publishing** | Bypasses ordering/reliability; can emit for rolled-back work. | `certificateOutbox.dispatch(events)` after commit. |
| **Direct storage access** | Infrastructure in the domain; unswappable. | Depend on the `types/export.ts` interface; implement an adapter in `export/`. |
| **Hard deletes** | Legal records; audit integrity. | Soft delete (`deletedAt`). |
| **Global `findUnique(id)`** | Cross-tenant leak. | `findFirst`/`count` scoped by `organizationId`. |
| **Trusting client `organizationId`/`studentId`** | Tenant/identity spoofing. | Derive from `context` server-side. |

Each of these has a guard test. Violating one fails CI.

---

## 14. Tenant isolation rules

- `organizationId` **always** comes from the authenticated `context` — never from the
  request body, query, or a path param.
- Every repository query is scoped by `organizationId`. No exceptions, including
  operational/aggregate reads.
- Use `findFirst`/`findMany`/`count`, never `findUnique(id)` on a global id — a
  cross-tenant id must resolve to "not found", not another tenant's row.
- A cross-tenant or unknown resource returns `404` with a generic message — never leak
  existence.
- Student/guardian scoping resolves the acting `studentId` server-side; a `studentId`
  in a student request body is ignored (the command resolves self).
- Public verification is unauthenticated but leaks nothing: unknown/soft-deleted/
  not-issued all return `200 NOT_FOUND`, indistinguishable from each other.

---

## 15. Testing philosophy

- **Guards encode the architecture; behavior tests encode the contract.** Keep both
  green.
- Test the **conditional-write race**: two concurrent transitions, exactly one wins.
  This is the heart of correctness under concurrency.
- Test **authz and scoping** on every read surface (missing permission → error;
  foreign-org rows invisible).
- Keep pure functions pure and table-driven (engine, retry policy, checksum) — no
  clock/randomness in the unit under test; inject `now` where time matters.
- Prefer the fake DB over heavy mocks; it exercises real repository query shapes.
- Reset shared singletons (`certificateOutbox.reset()`) between tests.

---

## 16. Performance philosophy

- **No N+1.** Batch reads: load a set with one `... IN (...)` query and look up in
  memory (see `findActiveCertificatesForPairs` for the bulk preview, and the ACL's
  bulk child loads). If you find yourself querying inside a loop, stop and batch.
- One transaction per mutation; keep it tight — do no external I/O (PDF render,
  storage) inside a lock longer than necessary.
- Operational reads are aggregate/scan-based; the heaviest (metrics/maintenance) scan
  bounded windows or sets once and bucket in memory — do not add per-row queries.
- Bulk is sequential and synchronous by design (one tx per item). Don't smuggle
  parallelism/queues into it; that's future work.
- Rely on the DB's filtered-unique indexes for uniqueness (numbering, verification
  code, active-per-transcript-type) rather than pre-checking in code.

---

## 17. Future extension examples (do it additively)

The engine is built so these need **no** change to existing files:

- **New certificate type:** add the value to `CertificateType` in `constants.ts`; seed
  a policy/template. Commands are type-agnostic — nothing else changes.
- **New export type:** add an adapter under `export/` implementing the
  `types/export.ts` interface; add a thin command that composes it; record a
  `CertificateExport` row with the new `exportType`.
- **New verification provider:** consume the `CertificateVerification` projection / its
  DTO. No lifecycle or command change.
- **New lifecycle transition:** add a `VerbCertificateCommand` with its own conditional
  guard + audit event; extend the status vocabulary in `constants.ts`; extend
  `expectedPublicStatuses` in the maintenance service so drift detection keeps
  mirroring reality.
- **New storage backend:** implement the storage adapter interface behind
  `src/infrastructure/**`. Commands depend on the interface, so nothing else moves.

The rule for every extension: **depend on a `types/**` interface, implement an
adapter, wire it in a command.** Never widen a repository into logic, never bypass the
ACL, never add an Academic dependency.

---

## 18. Checklist before opening a PR

- [ ] Mutations only in `commands/`, reads only in `services/`, Prisma only in
      `repositories/`.
- [ ] Every repository query scoped by `organizationId`; no `findUnique(id)`;
      `organizationId`/`studentId` from context, not input.
- [ ] Command: one transaction, conditional writes with `count === 1` assertion, audit
      event inside the tx, events dispatched via `certificateOutbox.dispatch(...)`
      **after** commit.
- [ ] No transcript/Academic read outside the ACL; no snapshot mutation; no recomputed
      eligibility.
- [ ] Zod schema `.strict()`; no server-owned fields accepted; PT-PT messages,
      English keys.
- [ ] Outward DTOs leak nothing sensitive (checksums, `fileUrl`, verification codes,
      transcript pointers, PII).
- [ ] Tests added (behavior + concurrency + authz/scoping); shared singletons reset.
- [ ] All gates pass:
      ```bash
      pnpm exec tsc --noEmit
      pnpm lint
      pnpm exec vitest run src/modules/certificates src/app/api/certificates src/server/events
      pnpm exec prisma validate    # only if the schema changed
      ```
- [ ] If a schema changed: migration written, **filtered-unique indexes preserved**
      (they are migration-only — Prisma won't regenerate them).
- [ ] Guard tests green (and any count assertions updated *intentionally*).

---

## 19. Review checklist (for reviewers)

- [ ] **Boundary:** does the change keep mutations/reads/persistence in their layers?
- [ ] **Eligibility:** is the engine still the only decider? No inline re-deciding.
- [ ] **ACL:** any new transcript/Academic read? Must go through the ACL, read-only.
- [ ] **Tenant:** every query org-scoped; no client-supplied `organizationId`;
      cross-tenant → 404.
- [ ] **Events:** published after commit, via the Outbox only; none inside a tx.
- [ ] **Snapshots:** frozen; checksum computed once; nothing rewritten.
- [ ] **Concurrency:** conditional writes with a count assertion; race tested.
- [ ] **Exposure:** no sensitive field in any DTO/response; errors are generic.
- [ ] **Guards:** all architecture-guard tests pass; any guard edit is justified.
- [ ] **Docs:** if behavior/contract changed, the API/operations/architecture docs are
      updated.

---

## 20. Where to look when stuck

| Question | Read |
|---|---|
| "How does a command look end to end?" | `commands/generate-certificate.command.ts`, `issue-certificate.command.ts` |
| "How is the transcript boundary enforced?" | `repositories/certificate-transcript-source.repository.ts` (the ACL) + its guard test |
| "Where is eligibility decided?" | `services/certificate-eligibility.engine.ts` (pure) + `certificate-eligibility-source.service.ts` (facts) |
| "How do events get out?" | `outbox/certificate-outbox.service.ts` + `outbox/retry-policy.ts` |
| "What may a response contain?" | `types/portal.ts`, `types/public-verification.ts`, `types/operational.ts` |
| "What are the rules I can't break?" | the four `__tests__/architecture-guards*.test.ts` files |
| "What's frozen and why?" | `adr/ADR-002-certificate-engine-architecture.md` |
```
