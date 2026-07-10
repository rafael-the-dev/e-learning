import { z } from "zod";
import { getDb } from "@/server/db";
import type { PrismaClientOrTx } from "@/server/db";
import type { ServiceContext } from "@/shared/types/common";
import {
  AuthorizationError,
  BaseCommand,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExamEventAggregateType, ExamEventType, ExamResultStatus, ExamSessionStatus } from "@/modules/examinations/constants";
import { loadOfficialResultForIntegration } from "@/modules/examinations/services/examination-grade-integration.source";
import { findExamResultById, findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listExamEventsByAggregate } from "@/modules/examinations/repositories/exam-event.repository";
import { recordExamTransition } from "./scheduling-shared";
import {
  gradeStateFor,
  latestIntegratedVersion,
  mapExamOutcomeToGrade,
  reconcileProgressionState,
  toIntegrationItemError,
  type ExamGradeComponentResolverPort,
  type ExamGradeWritePort,
  type ExamProgressionConfirmPort,
  type IntegrateExamResultResult,
  type IntegrateExamSessionResultsItem,
  type IntegrateExamSessionResultsResult,
  type IntegrationPorts,
  type ReconcileGradeState,
  type ReconcileIntegrationResult,
} from "./integration-shared";
import {
  productionComponentResolver,
  productionGradeWritePort,
  productionProgressionConfirmPort,
} from "@/modules/examinations/integrations/production-ports";

// =============================================================================
// EXAMINATION ENGINE — GRADE/PROGRESSION INTEGRATION COMMANDS (Phase 11; E-13)
// -----------------------------------------------------------------------------
// The one-way, anti-corruption boundary that pushes an OFFICIAL PUBLISHED exam result
// into the existing Grade & Progression engines. The Grade Engine stays the SINGLE grade
// writer and the Progression Engine the SINGLE progression owner: the Examination Engine
// NEVER writes their tables — it calls INJECTED PORTS (production wires the isolated
// adapters; tests inject fakes). Idempotency + staleness are read from the append-only
// ExamEvent metadata ledger (no ledger table): a successful integration writes an
// `exam_result.integrated` / `exam_result.integration_reconciled` event whose JSON
// metadata carries the integrated `officialVersion`. There is NO Transcript / Certificate
// write here, NO final-grade / pass-fail logic (a SCORED score maps 1:1; a non-scored
// outcome is UNSUPPORTED, never a silent 0), and NO domain-event bus / Outbox — the
// ExamEvent + AuditLog pair is written INSIDE the command transaction. Actor ids come from
// the server ServiceContext only, never from input.
//
// Since Phase 11B / ADR-014 the production component resolver is LIVE: it resolves the
// exam session's explicit `ExamGradeComponentBinding` (or returns `null` → a bound-less
// session integrates as EXAM_RESULT_INTEGRATION_UNSUPPORTED — never a heuristic). For a
// bound, scale-compatible SCORED result the production grade port performs the REAL
// canonical Grade write (via `gradeMutationService`) and the progression port confirms
// the cascaded status. The gated write path is covered by unit tests (fake ports) AND by
// a live-database integration script exercising the real production adapter end-to-end
// (`__tests__/grade-integration-production.integration.ts`).
// =============================================================================

const EXAM_RESULT = ExamEventAggregateType.EXAM_RESULT;
const RESULT_ENTITY = "ExamResult";
const SESSION_ENTITY = "ExamSession";
/** Event-only label for a successful integration — NOT an ExamResult status write. */
const INTEGRATED_EVENT_STATUS = "INTEGRATED";

// ─── Input schemas (strict — actor ids can never be smuggled in) ──────────────

const integrateExamResultSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    reason: z.string().min(1).optional(),
  })
  .strict();
type IntegrateExamResultInput = z.infer<typeof integrateExamResultSchema>;

const reconcileExamResultIntegrationSchema = z
  .object({
    examResultId: z.string().min(1, "O identificador do resultado é obrigatório"),
    dryRun: z.boolean().optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
type ReconcileExamResultIntegrationInput = z.infer<typeof reconcileExamResultIntegrationSchema>;

const integrateExamSessionResultsSchema = z
  .object({
    examSessionId: z.string().min(1, "O identificador da sessão é obrigatório"),
    stopOnFailure: z.boolean().optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();
type IntegrateExamSessionResultsInput = z.infer<typeof integrateExamSessionResultsSchema>;

async function authorizeIntegrate(userId: string, organizationId: string): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(PERMISSIONS.EXAMS_INTEGRATE_RESULTS)) {
    throw new AuthorizationError();
  }
}

const DEFAULT_REASON = "Integração de resultado de exame publicado";

// ─── Integrate a single published result ──────────────────────────────────────

export class IntegratePublishedExamResultCommand extends BaseCommand<
  IntegrateExamResultInput,
  IntegrateExamResultResult
> {
  private readonly resolver: ExamGradeComponentResolverPort;
  private readonly gradePort: ExamGradeWritePort;
  private readonly progressionPort: ExamProgressionConfirmPort;

  constructor(input: IntegrateExamResultInput, context: ServiceContext, ports: IntegrationPorts = {}) {
    super(input, context);
    this.resolver = ports.resolver ?? productionComponentResolver;
    this.gradePort = ports.gradePort ?? productionGradeWritePort;
    this.progressionPort = ports.progressionPort ?? productionProgressionConfirmPort;
  }

  async validate(): Promise<void> {
    const parsed = integrateExamResultSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeIntegrate(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<IntegrateExamResultResult> {
    const { organizationId, userId } = this.context;
    const input = integrateExamResultSchema.parse(this.input);
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx): Promise<IntegrateExamResultResult> => {
      // 1. Load the current official PUBLISHED result. Distinguish a missing base row
      //    (OFFICIAL_RESULT_NOT_FOUND) from a present-but-unpublished one.
      const dto = await loadOfficialResultForIntegration(
        { organizationId, examResultId: input.examResultId, sourceEvent: "PUBLICATION" },
        tx
      );
      if (!dto) {
        const base = await findExamResultById({ organizationId, id: input.examResultId }, tx);
        if (!base) {
          throw new BusinessRuleError("OFFICIAL_RESULT_NOT_FOUND", { examResultId: input.examResultId });
        }
        throw new BusinessRuleError("EXAM_RESULT_NOT_PUBLISHED", { status: base.status });
      }

      // 2. Idempotency via the ExamEvent metadata ledger — already at this version?
      const events = await listExamEventsByAggregate(
        { organizationId, aggregateType: EXAM_RESULT, aggregateId: input.examResultId },
        tx
      );
      const ledger = latestIntegratedVersion(events);
      if (ledger === dto.officialVersion) {
        return {
          examResultId: input.examResultId,
          officialVersion: dto.officialVersion,
          currentRevisionId: dto.currentRevisionId,
          gradeRecordId: null,
          gradeAction: "UNCHANGED",
          progressionRecalculated: false,
          progressionStatus: null,
          integratedAt: new Date(),
        };
      }

      // 3. Map the outcome to a grade — a non-scored code is UNSUPPORTED (never 0).
      const mapping = mapExamOutcomeToGrade(dto);
      if (!mapping.supported) {
        throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_UNSUPPORTED", { resultCode: dto.resultCode });
      }

      // 4. Resolve the target grade component (production returns null — documented gap).
      const target = await this.resolver.resolve(dto, tx);
      if (!target) {
        throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_UNSUPPORTED", { reason: "no grade component mapping" });
      }

      // 5. Concurrency guard: re-read the official version; a change means an appeal
      //    revision moved the target underneath us — abort so we never write a stale one.
      const dto2 = await loadOfficialResultForIntegration(
        { organizationId, examResultId: input.examResultId, sourceEvent: "PUBLICATION" },
        tx
      );
      if (!dto2 || dto2.officialVersion !== dto.officialVersion) {
        throw new BusinessRuleError("OFFICIAL_RESULT_CHANGED", {
          expected: dto.officialVersion,
          actual: dto2?.officialVersion ?? null,
        });
      }

      // 6. Grade write via the injected port (the Grade Engine is the single writer).
      let gradeRes;
      try {
        gradeRes = await this.gradePort.apply(
          {
            organizationId,
            enrollmentId: dto.enrollmentId,
            studentId: dto.studentId,
            levelSubjectId: dto.levelSubjectId,
            subjectId: target.subjectId,
            assessmentComponentId: target.assessmentComponentId,
            grade: mapping.grade,
            maxGrade: mapping.maxGrade,
            normalizedGrade: mapping.normalizedGrade,
            actorId: userId,
            reason: input.reason ?? DEFAULT_REASON,
            officialVersion: dto.officialVersion,
          },
          this.context,
          tx
        );
      } catch (err) {
        if (err instanceof BusinessRuleError) throw err;
        throw new BusinessRuleError("EXAM_RESULT_INTEGRATION_FAILED", { cause: toIntegrationItemError(err).code });
      }

      // 7. Confirm progression AFTER the grade write (grade cascades progression).
      let prog;
      try {
        prog = await this.progressionPort.confirm(
          { studentId: dto.studentId, enrollmentId: dto.enrollmentId, levelSubjectId: dto.levelSubjectId },
          this.context,
          tx
        );
      } catch (err) {
        if (err instanceof BusinessRuleError) throw err;
        throw new BusinessRuleError("PROGRESSION_RECALCULATION_FAILED", { cause: toIntegrationItemError(err).code });
      }

      // 8. Ledger entry + audit inside the tx (no bus). The metadata JSON IS the ledger.
      const integratedAt = new Date();
      await recordExamTransition(this.context, tx, {
        aggregateType: EXAM_RESULT,
        aggregateId: input.examResultId,
        eventType: ExamEventType.EXAM_RESULT_INTEGRATED,
        entity: RESULT_ENTITY,
        previousStatus: "",
        newStatus: INTEGRATED_EVENT_STATUS,
        reason: input.reason ?? null,
        extraNew: {
          examResultId: input.examResultId,
          gradeRecordId: gradeRes.gradeRecordId,
          gradeAction: gradeRes.action,
          progressionStatus: prog.status,
          officialVersion: dto.officialVersion,
          currentRevisionId: dto.currentRevisionId,
        },
        metadata: {
          officialVersion: dto.officialVersion,
          gradeRecordId: gradeRes.gradeRecordId,
          gradeAction: gradeRes.action,
          progressionStatus: prog.status,
          currentRevisionId: dto.currentRevisionId,
        },
      });

      return {
        examResultId: input.examResultId,
        officialVersion: dto.officialVersion,
        currentRevisionId: dto.currentRevisionId,
        gradeRecordId: gradeRes.gradeRecordId,
        gradeAction: gradeRes.action,
        progressionRecalculated: prog.recalculated,
        progressionStatus: prog.status,
        integratedAt,
      };
    });
  }
}

// ─── Reconcile a single result's integration (staleness repair) ────────────────

export class ReconcileExamResultIntegrationCommand extends BaseCommand<
  ReconcileExamResultIntegrationInput,
  ReconcileIntegrationResult
> {
  private readonly resolver: ExamGradeComponentResolverPort;
  private readonly gradePort: ExamGradeWritePort;
  private readonly progressionPort: ExamProgressionConfirmPort;

  constructor(
    input: ReconcileExamResultIntegrationInput,
    context: ServiceContext,
    ports: IntegrationPorts = {}
  ) {
    super(input, context);
    this.resolver = ports.resolver ?? productionComponentResolver;
    this.gradePort = ports.gradePort ?? productionGradeWritePort;
    this.progressionPort = ports.progressionPort ?? productionProgressionConfirmPort;
  }

  async validate(): Promise<void> {
    const parsed = reconcileExamResultIntegrationSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeIntegrate(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<ReconcileIntegrationResult> {
    const { organizationId, userId } = this.context;
    const input = reconcileExamResultIntegrationSchema.parse(this.input);
    const dryRun = input.dryRun ?? true;
    const db = await getDb();

    return db.$transaction(async (tx: PrismaClientOrTx): Promise<ReconcileIntegrationResult> => {
      const dto = await loadOfficialResultForIntegration(
        { organizationId, examResultId: input.examResultId, sourceEvent: "RECONCILIATION" },
        tx
      );
      if (!dto) {
        const base = await findExamResultById({ organizationId, id: input.examResultId }, tx);
        if (!base) {
          throw new BusinessRuleError("OFFICIAL_RESULT_NOT_FOUND", { examResultId: input.examResultId });
        }
        throw new BusinessRuleError("EXAM_RESULT_NOT_PUBLISHED", { status: base.status });
      }

      const events = await listExamEventsByAggregate(
        { organizationId, aggregateType: EXAM_RESULT, aggregateId: input.examResultId },
        tx
      );
      const ledger = latestIntegratedVersion(events);
      const mapping = mapExamOutcomeToGrade(dto);

      const gradeState: ReconcileGradeState = mapping.supported
        ? gradeStateFor(dto.officialVersion, ledger)
        : "UNSUPPORTED";
      const wouldChange = gradeState === "MISSING" || gradeState === "STALE";
      const errors: string[] = [];

      // Dry-run (default), nothing to change, or an unsupported outcome → report only.
      if (dryRun || !wouldChange || !mapping.supported) {
        return {
          examResultId: input.examResultId,
          officialVersion: dto.officialVersion,
          gradeState,
          progressionState: reconcileProgressionState(gradeState, wouldChange),
          wouldChange,
          changed: false,
          errors,
        };
      }

      // Live repair: re-run the same grade + progression apply as integrate. Recoverable
      // failures are collected (sanitised), not thrown — this repairs a partial
      // Grade-success / Progression-failure by re-running.
      try {
        const target = await this.resolver.resolve(dto, tx);
        if (!target) {
          errors.push("EXAM_RESULT_INTEGRATION_UNSUPPORTED");
          return {
            examResultId: input.examResultId,
            officialVersion: dto.officialVersion,
            gradeState,
            progressionState: reconcileProgressionState(gradeState, wouldChange),
            wouldChange,
            changed: false,
            errors,
          };
        }

        const gradeRes = await this.gradePort.apply(
          {
            organizationId,
            enrollmentId: dto.enrollmentId,
            studentId: dto.studentId,
            levelSubjectId: dto.levelSubjectId,
            subjectId: target.subjectId,
            assessmentComponentId: target.assessmentComponentId,
            grade: mapping.grade,
            maxGrade: mapping.maxGrade,
            normalizedGrade: mapping.normalizedGrade,
            actorId: userId,
            reason: input.reason ?? DEFAULT_REASON,
            officialVersion: dto.officialVersion,
          },
          this.context,
          tx
        );

        const prog = await this.progressionPort.confirm(
          { studentId: dto.studentId, enrollmentId: dto.enrollmentId, levelSubjectId: dto.levelSubjectId },
          this.context,
          tx
        );

        await recordExamTransition(this.context, tx, {
          aggregateType: EXAM_RESULT,
          aggregateId: input.examResultId,
          eventType: ExamEventType.EXAM_RESULT_INTEGRATION_RECONCILED,
          entity: RESULT_ENTITY,
          previousStatus: ledger ?? "",
          newStatus: INTEGRATED_EVENT_STATUS,
          reason: input.reason ?? null,
          extraNew: {
            examResultId: input.examResultId,
            gradeRecordId: gradeRes.gradeRecordId,
            gradeAction: gradeRes.action,
            progressionStatus: prog.status,
            officialVersion: dto.officialVersion,
            currentRevisionId: dto.currentRevisionId,
            previousVersion: ledger,
          },
          metadata: {
            officialVersion: dto.officialVersion,
            gradeRecordId: gradeRes.gradeRecordId,
            gradeAction: gradeRes.action,
            progressionStatus: prog.status,
            currentRevisionId: dto.currentRevisionId,
            previousVersion: ledger,
          },
        });

        return {
          examResultId: input.examResultId,
          officialVersion: dto.officialVersion,
          gradeState,
          progressionState: "CURRENT",
          wouldChange,
          changed: true,
          errors,
        };
      } catch (err) {
        errors.push(toIntegrationItemError(err).code);
        return {
          examResultId: input.examResultId,
          officialVersion: dto.officialVersion,
          gradeState,
          progressionState: reconcileProgressionState(gradeState, wouldChange),
          wouldChange,
          changed: false,
          errors,
        };
      }
    });
  }
}

// ─── Integrate every published result of a session (partial-success batch) ─────

export class IntegrateExamSessionResultsCommand extends BaseCommand<
  IntegrateExamSessionResultsInput,
  IntegrateExamSessionResultsResult
> {
  private readonly ports: IntegrationPorts;

  constructor(input: IntegrateExamSessionResultsInput, context: ServiceContext, ports: IntegrationPorts = {}) {
    super(input, context);
    this.ports = ports;
  }

  async validate(): Promise<void> {
    const parsed = integrateExamSessionResultsSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorizeIntegrate(this.context.userId, this.context.organizationId);
  }

  async execute(): Promise<IntegrateExamSessionResultsResult> {
    const { organizationId } = this.context;
    const input = integrateExamSessionResultsSchema.parse(this.input);
    const db = await getDb();

    // The session must be PUBLISHED. Reads happen OUTSIDE any transaction — each item
    // integrates in its OWN tx (no shared giant tx).
    const session = await findExamSessionById({ organizationId, id: input.examSessionId }, db);
    if (!session) throw new NotFoundError(SESSION_ENTITY, input.examSessionId);
    if (session.status !== ExamSessionStatus.PUBLISHED) {
      throw new BusinessRuleError("SESSION_NOT_PUBLISHED", { sessionStatus: session.status });
    }

    const results = await findResultsBySession(
      { organizationId, examSessionId: input.examSessionId },
      db
    );
    const publishedResults = results.filter((r) => r.status === ExamResultStatus.PUBLISHED);

    const items: IntegrateExamSessionResultsItem[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let stop = false;

    for (const r of publishedResults) {
      if (stop) {
        items.push({
          examResultId: r.id,
          ok: false,
          code: "SKIPPED",
          message: "Ignorado após uma falha anterior (stopOnFailure).",
        });
        skipped += 1;
        continue;
      }
      try {
        const res = await new IntegratePublishedExamResultCommand(
          { examResultId: r.id, reason: input.reason },
          this.context,
          this.ports
        ).run();
        items.push({ examResultId: r.id, ok: true, gradeAction: res.gradeAction });
        succeeded += 1;
      } catch (err) {
        const e = toIntegrationItemError(err);
        items.push({ examResultId: r.id, ok: false, code: e.code, message: e.message });
        failed += 1;
        if (input.stopOnFailure) stop = true;
      }
    }

    return { total: publishedResults.length, succeeded, failed, skipped, items };
  }
}
