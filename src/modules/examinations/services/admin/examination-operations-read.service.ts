import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExamResultCode, ExamResultStatus, ExamSessionStatus } from "@/modules/examinations/constants";
import { countExamSessions, listExamSessions } from "@/modules/examinations/repositories/exam-session.repository";
import { countExamResults, listExamResults } from "@/modules/examinations/repositories/exam-result.repository";
import {
  countActiveCandidatesBySessionIds,
  isSessionConsumedRead,
  listActiveBindingsBySessionIds,
  listIntegrationEventsByResultIds,
  listInvigilatorAssignmentsBySessionIds,
  listPeriodWindowsByIds,
  listSessionsForConflicts,
  type ConflictSessionRow,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import { gradeStateFor, latestIntegratedVersion } from "@/modules/examinations/commands/integration-shared";
import type { ExamEventRecord } from "@/modules/examinations/types/repository";
import type {
  ExamConflictSessionRef,
  ExaminationConflictsDto,
  ExaminationIntegrationHealthDto,
} from "@/modules/examinations/types/portal";

// =============================================================================
// EXAMINATION OPERATIONS READ SERVICE (Phase 12 §10) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// DETECTION ONLY — conflicts + integration health over existing facts. It never
// mutates or resolves anything. Requires `exams.operationsView`. Conflict detection
// runs in-memory over the bounded active-session set (batched reads, no N+1);
// integration health scans published results up to a bound. No raw event metadata.
// =============================================================================

const HEALTH_SCAN_CAP = 2000;
const ref = (s: ConflictSessionRow): ExamConflictSessionRef => ({
  sessionId: s.id,
  title: s.title,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
});
const overlaps = (a: ConflictSessionRow, b: ConflictSessionRow): boolean =>
  a.startsAt < b.endsAt && b.startsAt < a.endsAt;

export class ExaminationOperationsReadService {
  private assertCanOperate(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_OPERATIONS_VIEW)) throw new AuthorizationError();
  }

  async getConflicts(context: AuthContext): Promise<ExaminationConflictsDto> {
    this.assertCanOperate(context);
    const { organizationId } = context;
    const sessions = await listSessionsForConflicts(organizationId);
    const sessionIds = sessions.map((s) => s.id);

    const [assignments, candidateCounts, periodWindows] = await Promise.all([
      listInvigilatorAssignmentsBySessionIds(organizationId, sessionIds),
      countActiveCandidatesBySessionIds(organizationId, sessionIds),
      listPeriodWindowsByIds(organizationId, [...new Set(sessions.map((s) => s.periodId))]),
    ]);

    // Room conflicts — overlapping sessions sharing a room.
    const byRoom = new Map<string, ConflictSessionRow[]>();
    for (const s of sessions) {
      if (!s.roomId) continue;
      const arr = byRoom.get(s.roomId) ?? [];
      arr.push(s);
      byRoom.set(s.roomId, arr);
    }
    const roomConflicts = [...byRoom.entries()]
      .map(([roomId, list]) => ({ roomId, sessions: overlappingSet(list).map(ref) }))
      .filter((c) => c.sessions.length > 0);

    // Invigilator conflicts — one invigilator across overlapping sessions.
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const byInvigilator = new Map<string, ConflictSessionRow[]>();
    for (const a of assignments) {
      if (!a.invigilatorId) continue;
      const s = sessionById.get(a.examSessionId);
      if (!s) continue;
      const arr = byInvigilator.get(a.invigilatorId) ?? [];
      arr.push(s);
      byInvigilator.set(a.invigilatorId, arr);
    }
    const invigilatorConflicts = [...byInvigilator.entries()]
      .map(([invigilatorId, list]) => ({ invigilatorId, sessions: overlappingSet(list).map(ref) }))
      .filter((c) => c.sessions.length > 0);

    const sessionsWithInvigilator = new Set(assignments.map((a) => a.examSessionId));
    const sessionsWithoutRoom = sessions.filter((s) => !s.roomId).map(ref);
    const sessionsWithoutInvigilators = sessions.filter((s) => !sessionsWithInvigilator.has(s.id)).map(ref);

    const countBySession = new Map(candidateCounts.map((c) => [c.examSessionId, c.activeCount]));
    const overCapacitySessions = sessions
      .filter((s) => (countBySession.get(s.id) ?? 0) > s.capacity)
      .map(ref);

    const windowById = new Map(periodWindows.map((p) => [p.id, p]));
    const sessionsOutsidePeriodWindow = sessions
      .filter((s) => {
        const w = windowById.get(s.periodId);
        if (!w) return false;
        return s.startsAt < w.startsAt || s.endsAt > w.endsAt;
      })
      .map(ref);

    return {
      roomConflicts,
      invigilatorConflicts,
      sessionsWithoutRoom,
      sessionsWithoutInvigilators,
      overCapacitySessions,
      sessionsOutsidePeriodWindow,
      counts: {
        roomConflicts: roomConflicts.length,
        invigilatorConflicts: invigilatorConflicts.length,
        sessionsWithoutRoom: sessionsWithoutRoom.length,
        sessionsWithoutInvigilators: sessionsWithoutInvigilators.length,
        overCapacitySessions: overCapacitySessions.length,
        sessionsOutsidePeriodWindow: sessionsOutsidePeriodWindow.length,
      },
    };
  }

  async getIntegrationHealth(context: AuthContext): Promise<ExaminationIntegrationHealthDto> {
    this.assertCanOperate(context);
    const { organizationId } = context;

    const [totalPublishedSessions, totalPublishedResults, publishedSessions] = await Promise.all([
      countExamSessions({ organizationId, status: ExamSessionStatus.PUBLISHED }),
      countExamResults({ organizationId, status: ExamResultStatus.PUBLISHED }),
      listExamSessions({ organizationId, status: ExamSessionStatus.PUBLISHED, take: HEALTH_SCAN_CAP }),
    ]);
    const sessionIds = publishedSessions.map((s) => s.id);

    const [bindings, publishedResults] = await Promise.all([
      listActiveBindingsBySessionIds(organizationId, sessionIds),
      listExamResults({ organizationId, status: ExamResultStatus.PUBLISHED, take: HEALTH_SCAN_CAP }),
    ]);
    const boundSessionIds = new Set(bindings.map((b) => b.examSessionId));
    const missingBindings = sessionIds.filter((id) => !boundSessionIds.has(id)).length;

    const consumedFlags = await Promise.all(
      sessionIds.map((id) => isSessionConsumedRead(organizationId, id))
    );
    const consumedPublications = consumedFlags.filter(Boolean).length;

    // Per-result grade-state over batched ledger events (officialVersion derived from
    // the result's currentRevisionId pointer — no revision load needed for a summary).
    const events = await listIntegrationEventsByResultIds(
      organizationId,
      publishedResults.map((r) => r.id)
    );
    const eventsByResult = new Map<string, ExamEventRecord[]>();
    for (const e of events) {
      const arr = eventsByResult.get(e.examResultId) ?? [];
      arr.push({ eventType: e.eventType, metadata: e.metadata } as unknown as ExamEventRecord);
      eventsByResult.set(e.examResultId, arr);
    }

    let unsupportedResults = 0;
    let staleIntegrations = 0;
    let unreconciledRevisions = 0;
    for (const r of publishedResults) {
      const supported = r.resultCode === ExamResultCode.SCORED && r.score != null;
      if (!supported) {
        unsupportedResults += 1;
        continue;
      }
      const officialVersion = r.currentRevisionId
        ? `result:${r.id}:revision:${r.currentRevisionId}`
        : `result:${r.id}`;
      const ledgerVersion = latestIntegratedVersion(eventsByResult.get(r.id) ?? []);
      const state = gradeStateFor(officialVersion, ledgerVersion);
      if (state === "STALE") {
        staleIntegrations += 1;
        if (r.currentRevisionId) unreconciledRevisions += 1;
      }
    }

    return {
      missingBindings,
      unsupportedResults,
      staleIntegrations,
      failedIntegrations: 0,
      consumedPublications,
      unreconciledRevisions,
      summary: { totalPublishedSessions, totalPublishedResults },
    };
  }
}

/** From a candidate list sharing a room/invigilator, return the sessions involved in
 *  at least one time-overlap (deduped, order-preserved). */
function overlappingSet(list: ConflictSessionRow[]): ConflictSessionRow[] {
  const conflicting = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a && b && overlaps(a, b)) {
        conflicting.add(a.id);
        conflicting.add(b.id);
      }
    }
  }
  return list.filter((s) => conflicting.has(s.id));
}

export const examinationOperationsReadService = new ExaminationOperationsReadService();
