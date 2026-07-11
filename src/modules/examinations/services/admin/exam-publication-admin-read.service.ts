import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import { listRegisteredCandidatesBySession } from "@/modules/examinations/repositories/exam-candidate.repository";
import { findResultsBySession } from "@/modules/examinations/repositories/exam-result.repository";
import { listAttendanceBySession } from "@/modules/examinations/repositories/exam-attendance.repository";
import { findActivePublicationBySession } from "@/modules/examinations/repositories/exam-publication.repository";
import { isSessionConsumedRead } from "@/modules/examinations/repositories/exam-admin-read.repository";
import {
  evaluatePublicationReadiness,
  type PublicationReadinessVerdict,
} from "@/modules/examinations/commands/publication-shared";
import type {
  ExamPublicationDetailDto,
  ExamPublicationReadinessDto,
} from "@/modules/examinations/types/portal";
import { computePublicationAllowedActions, resolvePublicationCaps } from "./examination-portal.mapper";

// =============================================================================
// EXAM PUBLICATION ADMIN READ SERVICE (Phase 12 §7) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Publication readiness + state for a session. It REUSES the canonical
// `evaluatePublicationReadiness` helper (no duplicated readiness rules) and the
// canonical consumption check (`isSessionConsumedRead`). Requires `exams.view`.
// No writes — publish/retract go through the Phase-9 commands the routes invoke.
// =============================================================================

export class ExamPublicationAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async getReadiness(
    context: AuthContext,
    examSessionId: string
  ): Promise<ExamPublicationReadinessDto> {
    this.assertCanView(context);
    const { organizationId } = context;
    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const [candidates, results, attendance, activePublication, downstreamConsumed] = await Promise.all([
      listRegisteredCandidatesBySession({ organizationId, examSessionId }),
      findResultsBySession({ organizationId, examSessionId }),
      listAttendanceBySession({ organizationId, examSessionId }),
      findActivePublicationBySession({ organizationId, examSessionId }),
      isSessionConsumedRead(organizationId, examSessionId),
    ]);

    const attendanceByCandidate: Record<string, string> = {};
    for (const a of attendance) attendanceByCandidate[a.examCandidateId] = a.status;

    const verdict = evaluatePublicationReadiness({
      requiredCandidateIds: candidates.map((c) => c.id),
      results: results.map((r) => ({
        id: r.id,
        examCandidateId: r.examCandidateId,
        status: r.status,
        resultCode: r.resultCode,
      })),
      attendanceByCandidate,
      hasActivePublication: !!activePublication,
    });

    return this.buildReadiness(
      context,
      examSessionId,
      session.status,
      candidates.length,
      results.length,
      verdict,
      activePublication,
      downstreamConsumed
    );
  }

  async getDetail(context: AuthContext, examSessionId: string): Promise<ExamPublicationDetailDto> {
    const readiness = await this.getReadiness(context, examSessionId);
    const { organizationId } = context;
    const publication = await findActivePublicationBySession({ organizationId, examSessionId });
    return {
      publicationId: publication?.id ?? null,
      examSessionId,
      publicationStatus: publication?.status ?? null,
      publishedAt: publication?.publishedAt ?? null,
      publishedById: publication?.publishedById ?? null,
      retractedAt: publication?.retractedAt ?? null,
      retractedById: publication?.retractedById ?? null,
      retractionReasonPresent: !!publication?.reason,
      downstreamConsumed: readiness.downstreamConsumed,
      readiness,
      allowedActions: readiness.allowedActions,
    };
  }

  private buildReadiness(
    context: AuthContext,
    examSessionId: string,
    sessionStatus: string,
    requiredCandidateCount: number,
    resultCount: number,
    verdict: PublicationReadinessVerdict,
    activePublication: { id: string; status: string } | null,
    downstreamConsumed: boolean
  ): ExamPublicationReadinessDto {
    const ready =
      verdict.missingCandidateIds.length === 0 &&
      verdict.nonApprovedResultIds.length === 0 &&
      verdict.staleResultIds.length === 0 &&
      !verdict.hasNothingToPublish &&
      !verdict.hasActivePublication;

    const blockers: string[] = [];
    if (verdict.hasActivePublication) blockers.push("Já existe uma publicação ativa para esta sessão.");
    if (verdict.hasNothingToPublish) blockers.push("Não há resultados para publicar.");
    if (verdict.missingCandidateIds.length) {
      blockers.push(`${verdict.missingCandidateIds.length} candidato(s) sem resultado.`);
    }
    if (verdict.nonApprovedResultIds.length) {
      blockers.push(`${verdict.nonApprovedResultIds.length} resultado(s) por aprovar.`);
    }
    if (verdict.staleResultIds.length) {
      blockers.push(`${verdict.staleResultIds.length} resultado(s) desatualizado(s) face à assiduidade.`);
    }

    const caps = resolvePublicationCaps(context);
    return {
      examSessionId,
      sessionStatus,
      requiredCandidateCount,
      resultCount,
      missingCandidateIds: verdict.missingCandidateIds,
      nonApprovedResultIds: verdict.nonApprovedResultIds,
      staleResultIds: verdict.staleResultIds,
      activePublicationId: activePublication?.id ?? null,
      publicationStatus: activePublication?.status ?? null,
      downstreamConsumed,
      ready,
      blockers,
      allowedActions: computePublicationAllowedActions(
        ready,
        sessionStatus,
        !!activePublication,
        downstreamConsumed,
        caps
      ),
    };
  }
}

export const examPublicationAdminReadService = new ExamPublicationAdminReadService();
