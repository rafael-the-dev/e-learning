# Progressão Académica — Aprovação Manual de Nível

Este documento descreve o fluxo de **aprovação manual de progressão de nível**:
como um aluno passa de estar apenas academicamente elegível para ser
efetivamente promovido ao nível seguinte quando a política exige uma decisão
humana.

> Âmbito: apenas o workflow de aprovação manual. As regras de cálculo académico
> (motor de notas, motor de elegibilidade de disciplinas, motor de progressão de
> nível) **não** são alteradas por este fluxo — ver
> [`grade-engine.md`](./grade-engine.md) e o módulo `src/modules/prerequisites`.

---

## 1. Quando surge `MANUAL_APPROVAL`

O `LevelProgressionEngine`
([`level-progression.engine.ts`](../src/modules/prerequisites/engines/level-progression.engine.ts))
avalia a transição do nível atual para o próximo e devolve um `outcome`. Devolve
`REQUIRES_MANUAL_APPROVAL` em dois casos:

1. **Modo da política = `MANUAL_APPROVAL`** — toda a progressão neste ponto é
   sempre encaminhada para revisão humana, independentemente dos resultados.
2. **`requireManualApproval = true`** sobre qualquer outro modo
   (`STRICT` / `CONDITIONAL` / `CREDIT_BASED`) — os critérios académicos foram
   cumpridos, mas a política exige na mesma uma confirmação do coordenador.

Nesse momento **nenhuma promoção acontece**. O motor apenas sinaliza que é
necessária uma decisão. O `currentLevelId` da matrícula permanece inalterado.

---

## 2. Ciclo de vida do pedido (`LevelProgressionRequest`)

```
   evaluateLevelProgressionAction
             │  (outcome = REQUIRES_MANUAL_APPROVAL)
             ▼
     ┌───────────────┐   approve    ┌───────────────┐
     │    PENDING     │ ───────────▶ │   APPROVED     │  → aluno promovido
     └───────────────┘              └───────────────┘
             │  reject
             ▼
     ┌───────────────┐
     │   REJECTED     │  → nível inalterado
     └───────────────┘
```

O modelo `LevelProgressionRequest` (campo de estado: `decision`) guarda
`enrollmentId`, `studentId`, `courseId`, `policyId`, `fromLevelId`, `toLevelId`,
`reason` (motivo do encaminhamento), `reviewNotes`, `requestedAt`, `reviewedAt` e
`reviewedBy`.

### Criação

`evaluateLevelProgressionAction`
([`prerequisite.actions.ts`](../src/modules/prerequisites/actions/prerequisite.actions.ts))
cria o pedido através de `ensurePendingProgressionRequest`, que é **idempotente**.

### Prevenção de duplicados

Nunca podem existir **dois pedidos `PENDING`** para a mesma combinação
`(enrollmentId, fromLevelId, toLevelId)`. `ensurePendingProgressionRequest`
verifica primeiro (`findPendingRequestId`) e, se já existir um pedido pendente,
devolve-o (`created = false`) em vez de inserir um novo. Só é escrito o evento de
auditoria `level_progression_request.created` quando um pedido é realmente criado.

---

## 3. Aprovação

`approveProgressionRequestAction` → `approveProgressionRequest`
([`review-progression-request.service.ts`](../src/modules/prerequisites/services/review-progression-request.service.ts)).

Executa **tudo dentro de uma única transação interactiva** (`db.$transaction`),
de forma que uma falha parcial nunca deixa a matrícula promovida sem os registos
de progresso atualizados (ou vice-versa):

1. Revalida o pedido como `PENDING` e a matrícula como progredível
   (uma matrícula `CANCELLED` / `COMPLETED` nunca é promovida por um pedido
   obsoleto).
2. `LevelProgressionRequest.decision = APPROVED`, com `reviewNotes` (opcional),
   `reviewedAt` e `reviewedBy`.
3. `Enrollment.currentLevelId = toLevelId` — a matrícula **existente** é
   atualizada; **nunca** se cria uma nova matrícula.
4. `StudentLevelProgress` do nível de origem passa a `PROMOTED` (todas as
   disciplinas obrigatórias aprovadas e nenhuma pendente) ou
   `PROMOTED_WITH_PENDING_SUBJECTS` (avança com pendências). Esta distinção
   espelha o motor de progressão — **não** é uma regra de cálculo nova.
5. `StudentCourseProgress` é recalculado com `decideCourseCompletion` (função
   pura reutilizada do `CourseCompletionEngine`).

`reviewNotes` na aprovação são **opcionais**.

---

## 4. Rejeição

`rejectProgressionRequestAction` → `rejectProgressionRequest` (também
transacional):

1. Revalida o pedido como `PENDING`.
2. `LevelProgressionRequest.decision = REJECTED`, guardando o **motivo**
   (`reason` **obrigatório**, mínimo 5 caracteres), `reviewedAt` e `reviewedBy`.
3. `Enrollment.currentLevelId` **permanece inalterado**. Nenhum registo de
   progresso é modificado.

---

## 5. Auditabilidade

Cada evento é registado via `auditService.log`. Os eventos do workflow são:

| Evento                                  | Quando                                        | Entidade |
| --------------------------------------- | --------------------------------------------- | -------- |
| `level_progression_request.created`     | pedido `PENDING` criado                       | `LevelProgressionRequest` |
| `level_progression_request.approved`    | decisão de aprovação                          | `LevelProgressionRequest` |
| `level_progression_request.rejected`    | decisão de rejeição                           | `LevelProgressionRequest` |
| `level_progression.approved`            | promoção académica efetivada                  | `Enrollment` |
| `level_progression.blocked`             | progressão bloqueada (rejeição)               | `Enrollment` |

O payload (`newValues`) de cada evento inclui: `enrollmentId`, `studentId`,
`fromLevelId`, `toLevelId`, `policyId`, `decision` e `reason` (quando aplicável).
O **ator** (`actorId`) e o **timestamp** (`createdAt`) são gravados
automaticamente pelo `AuditService` a partir do contexto autenticado.

---

## 6. RBAC

Permissões dedicadas (ver
[`permissions.ts`](../src/server/auth/permissions.ts)):

| Permissão                          | Descrição                          |
| ---------------------------------- | ---------------------------------- |
| `levelProgressionRequests.view`    | Ver a fila e o detalhe dos pedidos |
| `levelProgressionRequests.approve` | Aprovar um pedido                  |
| `levelProgressionRequests.reject`  | Rejeitar um pedido                 |

Atribuição por papel:

- **ORG_ADMIN** — todas (view + approve + reject).
- **SECRETARY** — apenas `view`. Aprovar/rejeitar não são concedidos; a
  secretaria vê a fila em modo de leitura, salvo se uma política elevar o papel.
- **TEACHER** — `view` concedido, mas a página aplica na mesma o *redirect* de
  âmbito de professor (ver [`teacher-access-scope.md`](./teacher-access-scope.md)):
  a fila de aprovação é *org-wide* e não é apresentada a utilizadores com âmbito
  de professor. Não há filtragem por atribuição específica de aluno/turma neste
  workflow.
- **STUDENT / GUARDIAN** — sem acesso à fila de aprovação.

Cada *server action* revalida a permissão no servidor (`requirePermission`)
antes de qualquer mutação — a UI nunca é a fonte de autorização.

---

## 7. UI

- **Fila:** `/academic/progression-requests` — `PageHeader`, filtros (estado,
  curso, nível de origem, intervalo de datas) e `DataTable` paginada. Colunas:
  aluno, curso, transição, modo de política, estado, data do pedido, revisão.
- **Detalhe / revisão:** `/academic/progression-requests/[requestId]` — resumo do
  aluno, nível atual/destino, resultados por disciplina (reprovadas / pendentes /
  em recuperação), recomendação **atual** do motor, motivo do encaminhamento
  manual e histórico por nível (*snapshot* de transcrição). As ações **Aprovar**
  (notas opcionais) e **Rejeitar** (motivo obrigatório, `Textarea`) só aparecem
  quando o pedido está `PENDING` e o utilizador tem a permissão respetiva.

---

## 8. Ficheiros

| Camada        | Ficheiro |
| ------------- | -------- |
| Motor         | `src/modules/prerequisites/engines/level-progression.engine.ts` |
| Repositório   | `src/modules/prerequisites/repositories/level-progression-request.repository.ts` |
| Serviço (tx)  | `src/modules/prerequisites/services/review-progression-request.service.ts` |
| Schemas       | `src/modules/prerequisites/schemas/prerequisite.schema.ts` |
| Actions       | `src/modules/prerequisites/actions/prerequisite.actions.ts` |
| UI (fila)     | `src/app/(org)/academic/progression-requests/page.tsx` |
| UI (detalhe)  | `src/app/(org)/academic/progression-requests/[requestId]/page.tsx` |
| Componentes   | `src/modules/prerequisites/components/progression-*.tsx` |
| Testes        | `*/review-progression-request.service.test.ts`, `*/progression-request-workflow.actions.test.ts` |
