# Certificate Engine — Documento de Fecho v1.0

> Documento de transferência. Resume o estado congelado do módulo para que outra
> equipa o possa manter sem depender do histórico de desenvolvimento.
> Detalhe por fase: [`certificate-engine.md`](./certificate-engine.md) (§31–§48).
> Arquitectura congelada: [`adr/ADR-002-certificate-engine-architecture.md`](./adr/ADR-002-certificate-engine-architecture.md).

- **Estado:** Fases 0–14 implementadas. Arquitectura FROZEN v1.0.
- **Localização:** `src/modules/certificates/` (domínio) + `src/app/api/certificates/**` (rotas) + `src/server/events/handlers/certificate-transcript-staleness.handler.ts` (reação).
- **Downstream de:** Academic Transcript Engine (ADR-002) e Academic Core (ADR-001), ambos congelados.

---

## 1. Fases concluídas

| Fase | Conteúdo |
|------|----------|
| 0 | Foundation (constantes, schemas Zod, numeração, checksum) |
| 1 | Data Model (8 modelos Prisma) |
| 2A | Transcript ACL (leitura read-only do Transcript) |
| 2B | Repositories (tenant-safe, persistência) |
| 3A | Eligibility Source (agregação de factos) |
| 3B | Eligibility Engine (decisão pura) |
| 4 | `GenerateCertificateCommand` |
| 5 | `IssueCertificateCommand` |
| 6 | Lifecycle (revoke / suspend / restore) |
| 7 | Public Verification + Expiry |
| 8 / 8B / 8C | Export Engine + hardening + download autenticado |
| 9 | STALE Detection (reação à invalidação do transcript) |
| 10 | Portal Integration (read models + rotas) |
| 11 | Ministry Export (adapter-driven, transporte local) |
| 12 | Certificate Request Workflow |
| 13 | Bulk Operations |
| 14 | Operational Hardening (Outbox, Health, Maintenance, Metrics) |

---

## 2. Garantias arquitecturais (invariantes — não quebrar)

1. **Certifica factos congelados; nunca recalcula académico.** Lê apenas o snapshot da
   `AcademicTranscriptVersion` emitida, a própria policy/template e um snapshot não-académico
   de finanças. Nunca toca em Grade / Attendance / StudentAssessmentResult / StudentSubject /
   LevelProgress / StudentCourseProgress em tempo real.
2. **Transcript preso por POINTER, não FK.** `Certificate.transcriptVersionId` é `String`
   + `transcriptNumber`/`transcriptChecksum` copiados. Sobrevive a supersessão/eliminação.
3. **Padrão Command.** Toda a mutação passa por `BaseCommand.run()` → `validate()` →
   `authorize()` → `execute()`. Uma transacção por operação; escritas condicionais
   (`WHERE status = expected`, assert `count === 1`) para segurança em corrida.
4. **Eventos publicados só APÓS o commit, sempre através do Outbox** (ver §5). O Outbox é o
   único sítio que referencia `eventPublisher`.
5. **Repositories são a única camada que importa Prisma** e estão sempre scoped por
   `organizationId`. Numeração/checksum/verificationCode únicos via índices filtrados
   definidos na migração (o Prisma não os exprime).
6. **Camada operacional (Fase 14) é read-only, excepto o Outbox.** Nenhum serviço/rota de
   health/maintenance/metrics escreve.
7. **Checksum de conteúdo calculado uma vez, no issue; nunca recalculado.** Expiry vive na
   projeção de verificação (`publicStatus`), nunca em `Certificate.status` (D-6).

**Modelos (8):** `CertificatePolicy`, `CertificateTemplate`, `Certificate`, `CertificateEvent`,
`CertificateExport`, `CertificateVerification`, `CertificateRequest`, `CertificateNumberCounter`.

---

## 3. Comandos disponíveis

Ciclo de vida do certificado:
- `GenerateCertificateCommand` — cria DRAFT/PENDING_APPROVAL a partir de um transcript emitido.
- `IssueCertificateCommand` — promove a ISSUED (aloca número, checksum, cria projeção de verificação).
- `RevokeCertificateCommand` — ISSUED|SUSPENDED → REVOKED (terminal).
- `SuspendCertificateCommand` — ISSUED → SUSPENDED (recuperável).
- `RestoreCertificateCommand` — SUSPENDED → ISSUED.

Export:
- `ExportCertificateCommand` — artefacto PDF.
- `ExportCertificateToMinistryCommand` — payload JSON/CSV/XML (transporte local; ver riscos).

STALE:
- `ReconcileCertificateStalenessCommand` — reconciliação manual (dry-run por omissão).

Request workflow:
- `RequestCertificateCommand`, `ApproveCertificateRequestCommand`, `RejectCertificateRequestCommand`,
  `CancelCertificateRequestCommand`, `FulfillCertificateRequestCommand`.

Bulk (orquestração — cada item corre o comando singular na sua própria transacção):
- `BulkGenerateCertificatesCommand`, `BulkIssueCertificatesCommand`, `BulkExportCertificatesCommand`,
  `BulkRevokeCertificatesCommand`, `BulkSuspendCertificatesCommand`, `BulkRestoreCertificatesCommand`.

---

## 4. Endpoints disponíveis

**Admin / secretaria** (`certificates.view` + permissão da acção):
- `GET  /api/certificates` — lista paginada.
- `GET  /api/certificates/[id]` — detalhe.
- `POST /api/certificates/generate`
- `POST /api/certificates/[id]/{issue,revoke,suspend,restore,export}`
- `POST /api/certificates/bulk/{generate,issue,export,revoke,suspend,restore}`
- `GET  /api/certificates/exports/[exportId]/download` — stream do PDF (nunca expõe `fileUrl`).
- `POST /api/certificates/requests` + `GET`
- `POST /api/certificates/requests/[id]/{approve,reject,cancel,fulfill}`

**Operacional — Fase 14** (`certificates.view`, só agregados):
- `GET /api/certificates/health`
- `GET /api/certificates/maintenance`
- `GET /api/certificates/metrics`
- `GET /api/certificates/outbox`

**Aluno** (`certificates.viewOwn` / `certificates.request`, sempre auto-scoped):
- `GET  /api/student/certificates` + `/[id]`
- `GET  /api/student/certificates/exports/[exportId]/download`
- `GET|POST /api/student/certificates/requests` + `POST /[id]/cancel`

**Público** (sem auth, projeção privacy-safe, rate-limited):
- `GET /api/public/certificates/verify/[verificationCode]`

---

## 5. Eventos

Vocabulário declarado (`DomainEventType`, `event-types.ts`) e emissão real via **Outbox**:

| Evento | Emitido no bus? | Origem |
|--------|-----------------|--------|
| `certificate.issued` | Sim | `IssueCertificateCommand` |
| `certificate.revoked` | Sim | `RevokeCertificateCommand` |
| `certificate.suspended` | Sim | `SuspendCertificateCommand` |
| `certificate.restored` | Sim | `RestoreCertificateCommand` |
| `certificate.exported` | Sim | Export (PDF) + Ministry export |
| `certificate.marked_stale` | Sim | Staleness handler + `ReconcileCertificateStalenessCommand` |
| `certificate.generated` | Não (só `CertificateEvent`/audit) | `GenerateCertificateCommand` |
| `certificate.approved` | Não (só `CertificateEvent`/audit) | fluxo de aprovação |
| `certificate.verified` | Não (só contador na projeção) | verificação pública |

**Outbox (Fase 14):** singleton em memória `certificateOutbox`. Fluxo Command → `enqueue()` →
`publish()` (comandos usam `dispatch(events)`). **Os 8 pontos de publicação pós-commit**
(7 comandos + o `CertificateTranscriptStalenessHandler`) passam todos pelo Outbox. Payloads
inalterados. Retry: máx. 3, backoff exponencial `1000·2^(n-1)`, funções puras (`canRetry`,
`nextRetryAt`), sem timers/scheduler. Esgotado o orçamento → dead-letter `FAILED` (consultável,
nunca eliminado automaticamente).

---

## 6. Permissões (`PERMISSIONS`, `server/auth/permissions.ts`)

| Permissão | Uso |
|-----------|-----|
| `certificates.view` | Ler no tenant (portais admin/secretaria + endpoints operacionais). |
| `certificates.viewOwn` | Aluno lê os próprios certificados. |
| `certificates.generate` | Gerar; rever pedidos (approve/reject/fulfill). |
| `certificates.issue` | Emitir. |
| `certificates.revoke` | Revogar. |
| `certificates.suspend` | Suspender **e restaurar** (restore reutiliza esta permissão). |
| `certificates.export` | Exportar (PDF + ministério). |
| `certificates.request` | Aluno pede; cancela o próprio pedido. |
| `certificates.verify` | Verificação (interna). |
| `certificatePolicies.manage` | Gerir policies. |
| `certificateTemplates.manage` | Gerir templates. |

Toda a autorização é server-side (CASL/RBAC). `organizationId` deriva sempre do contexto de
sessão, nunca do input do cliente. GUARDIAN não tem acesso a certificados (negado por omissão).

---

## 7. Pendências futuras (fora do âmbito da v1)

- **Persistência do Outbox** — actualmente em memória. Substituir por tabela + worker + backoff
  real, **sem alterar a API** (`enqueue`/`publish`/`retry`/`list*`/`mark*`).
- **API real do ministério** — o transporte actual é um stub local (`LOCAL-MINISTRY-…`).
- **Derivação `validityMonths` → `expiresAt`** — enquanto não existir, `expiresAt` fica sempre
  `null` e o sweep de expiry é um no-op (comportamento correcto, mas inerte).
- **Rate limiter público distribuído** — o actual é por processo (em memória); precisa de
  Redis/edge KV antes de controlo de abuso a sério.
- **Acesso do encarregado de educação (GUARDIAN)** — negado por omissão; política por definir.
- **Pagamento no request workflow** — deferido.
- **Bulk com filas/paralelismo/retries** — Fase 13 é sequencial e síncrona por design.
- **Páginas de UI** — o backend está UI-ready; as páginas são trabalho do frontend.

---

## 8. Riscos conhecidos

- **Outbox em memória (single-process).** Uma falha do processo entre o commit e a entrega
  perde o evento (não há persistência ainda). Mitigação actual: `eventPublisher` nunca lança
  (best-effort) e os eventos são idempotentes/reprocessáveis; a persistência remove o risco.
- **Métrica `verification` é aproximada.** Conta a verificação MAIS RECENTE por certificado na
  janela (`lastVerifiedAt`) — não existe tabela por-acesso. Documentado no §48.
- **Ministry export não submete.** Produz e guarda o payload, mas não há entrega externa real.
- **Expiry inerte.** Sem `validityMonths` → `expiresAt`, nenhum certificado expira (ver §7).
- **Rate limiter público não distribuído.** Protege um único processo; ineficaz atrás de várias
  instâncias.
- **Numeração/unicidade dependem de índices filtrados na migração.** Ao alterar o schema, não
  perder os índices únicos filtrados (número por org/ano, verificationCode global, activo por
  transcript+tipo) — o Prisma não os regenera.

---

## 9. Validação no fecho

`pnpm exec tsc --noEmit` · `pnpm exec vitest run src/modules/certificates src/app/api/certificates
src/server/events` (702 testes) · `pnpm exec eslint` · `pnpm exec prisma validate` — todos passam.
Sem alterações de schema/migração na Fase 14.
