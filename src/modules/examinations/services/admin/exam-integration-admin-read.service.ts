import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExamResultStatus } from "@/modules/examinations/constants";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import { listRevisionsByResult } from "@/modules/examinations/repositories/exam-result-revision.repository";
import { findActiveBindingBySession } from "@/modules/examinations/repositories/exam-grade-component-binding.repository";
import { findComponentById } from "@/modules/assessments/repositories/assessment-component.repository";
import { findAssessmentPolicyById } from "@/modules/assessments/repositories/assessment-policy.repository";
import {
  isSessionConsumedRead,
  listIntegrationEventsByResultIds,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import { resolveOfficialExamResult } from "@/modules/examinations/commands/appeals-shared";
import {
  gradeStateFor,
  latestIntegratedVersion,
  mapExamOutcomeToGrade,
} from "@/modules/examinations/commands/integration-shared";
import type { ExamEventRecord } from "@/modules/examinations/types/repository";
import type { OfficialExamResultIntegrationDto } from "@/modules/examinations/services/examination-grade-integration.source";
import type {
  ExamGradeBindingDto,
  ExamIntegrationResultStatusDto,
  ExamIntegrationStatusDto,
} from "@/modules/examinations/types/portal";
import { computeResultIntegrationActions, resolveIntegrationCaps } from "./examination-portal.mapper";

// =============================================================================
// EXAM INTEGRATION ADMIN READ SERVICE (Phase 12 §9) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// The Grade-binding + integration status for a session. It reuses the EXPLICIT
// binding (NO heuristic / first-component fallback), the Phase-10 official resolver,
// and the pure integration-ledger helpers (`latestIntegratedVersion`,
// `gradeStateFor`, `mapExamOutcomeToGrade`) over BATCHED ledger events. maxScore ≠
// component.maxGrade and non-scored outcomes are represented honestly (UNSUPPORTED).
// Requires `exams.view` for reads. No writes, no Transcript/Certificate.
// =============================================================================

export class ExamIntegrationAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async getBinding(context: AuthContext, examSessionId: string): Promise<ExamGradeBindingDto> {
    this.assertCanView(context);
    const { organizationId } = context;
    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const [binding, results, consumed] = await Promise.all([
      findActiveBindingBySession({ organizationId, examSessionId }),
      findResultsBySession({ organizationId, examSessionId }),
      isSessionConsumedRead(organizationId, examSessionId),
    ]);
    const examMaxScore = results[0]?.maxScore ?? null;

    let componentName: string | null = null;
    let componentMaxGrade: number | null = null;
    let compatible = false;
    if (binding) {
      const component = await findComponentById(binding.assessmentComponentId, organizationId);
      if (component) {
        componentName = component.name;
        componentMaxGrade = component.maxGrade;
        const policy = await findAssessmentPolicyById(component.assessmentPolicyId, organizationId);
        compatible = !!policy && policy.levelSubjectId === session.levelSubjectId;
      }
    }

    const blockers: string[] = [];
    if (consumed) blockers.push("A sessão já foi integrada (consumida) — a associação é imutável.");
    if (binding && componentMaxGrade != null && examMaxScore != null && componentMaxGrade !== examMaxScore) {
      blockers.push("A nota máxima do componente não coincide com a pontuação máxima do exame.");
    }
    if (binding && !compatible) {
      blockers.push("O componente associado não é compatível com a disciplina da sessão.");
    }

    const caps = resolveIntegrationCaps(context);
    return {
      examSessionId,
      levelSubjectId: session.levelSubjectId,
      bindingId: binding?.id ?? null,
      assessmentComponentId: binding?.assessmentComponentId ?? null,
      componentName,
      componentMaxGrade,
      examMaxScore,
      compatible,
      consumed,
      canBind: caps.canIntegrate && !consumed && !binding,
      canRebind: caps.canIntegrate && !consumed && !!binding,
      blockers,
    };
  }

  async getIntegrationStatus(
    context: AuthContext,
    examSessionId: string
  ): Promise<ExamIntegrationStatusDto> {
    this.assertCanView(context);
    const { organizationId } = context;
    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const results = await findResultsBySession({ organizationId, examSessionId });
    const published = results.filter((r) => r.status === ExamResultStatus.PUBLISHED);
    const publishedIds = published.map((r) => r.id);

    const events = await listIntegrationEventsByResultIds(organizationId, publishedIds);
    const eventsByResult = new Map<string, ExamEventRecord[]>();
    const lastAtByResult = new Map<string, Date>();
    for (const e of events) {
      const arr = eventsByResult.get(e.examResultId) ?? [];
      // Only the fields latestIntegratedVersion reads (eventType + metadata).
      arr.push({ eventType: e.eventType, metadata: e.metadata } as unknown as ExamEventRecord);
      eventsByResult.set(e.examResultId, arr);
      const prev = lastAtByResult.get(e.examResultId);
      if (!prev || e.createdAt > prev) lastAtByResult.set(e.examResultId, e.createdAt);
    }

    // Batch the current revisions to resolve each official view.
    const revisionsByResult = new Map<string, Awaited<ReturnType<typeof listRevisionsByResult>>[number] | null>();
    await Promise.all(
      published.map(async (r) => {
        if (!r.currentRevisionId) {
          revisionsByResult.set(r.id, null);
          return;
        }
        const chain = await listRevisionsByResult({ organizationId, examResultId: r.id });
        revisionsByResult.set(r.id, chain.find((x) => x.isCurrent) ?? null);
      })
    );

    const caps = resolveIntegrationCaps(context);
    const rows: ExamIntegrationResultStatusDto[] = published.map((result) => {
      const currentRevision = revisionsByResult.get(result.id) ?? null;
      const view = resolveOfficialExamResult({ result, currentRevision });
      const officialVersion = view.revisionId
        ? `result:${result.id}:revision:${view.revisionId}`
        : `result:${result.id}`;
      const mapping = mapExamOutcomeToGrade({
        resultCode: view.resultCode,
        score: view.score,
        normalizedScore: view.normalizedScore,
        maxScore: result.maxScore,
      } as OfficialExamResultIntegrationDto);
      const supported = mapping.supported;
      const ledgerVersion = latestIntegratedVersion(eventsByResult.get(result.id) ?? []);
      const gradeState = supported ? gradeStateFor(officialVersion, ledgerVersion) : "UNSUPPORTED";
      const actions = computeResultIntegrationActions(gradeState, supported, caps);
      const progressionState =
        gradeState === "CURRENT"
          ? "CURRENT"
          : gradeState === "MISSING" || gradeState === "STALE"
            ? "REQUIRES_RECALCULATION"
            : "NOT_RUN";
      return {
        examResultId: result.id,
        currentRevisionId: result.currentRevisionId,
        officialVersion,
        resultCode: view.resultCode,
        gradeState,
        progressionState,
        supported,
        latestIntegratedVersion: ledgerVersion,
        latestIntegratedAt: lastAtByResult.get(result.id) ?? null,
        lastErrorCode: null,
        canIntegrate: actions.canIntegrate,
        canReconcile: actions.canReconcile,
      };
    });

    const summary = {
      total: rows.length,
      current: rows.filter((r) => r.gradeState === "CURRENT").length,
      missing: rows.filter((r) => r.gradeState === "MISSING").length,
      stale: rows.filter((r) => r.gradeState === "STALE").length,
      unsupported: rows.filter((r) => r.gradeState === "UNSUPPORTED").length,
      failed: 0,
    };
    return { examSessionId, results: rows, summary };
  }
}

export const examIntegrationAdminReadService = new ExamIntegrationAdminReadService();
