import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/shared/lib/pagination";
import { findExamRoomById } from "@/modules/examinations/repositories/exam-room.repository";
import {
  countRoomsForPortal,
  listBranchNamesByIds,
  listRoomsForPortal,
  listUpcomingSessionsByRoomIds,
  type UpcomingSessionRef,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import type {
  ExamRoomAdminListFilters,
  ExamRoomDetailDto,
  ExamRoomListItemDto,
  PortalListResult,
} from "@/modules/examinations/types/portal";
import { computeRoomAllowedActions, resolveRoomCaps } from "./examination-portal.mapper";

// =============================================================================
// EXAM ROOM ADMIN READ SERVICE (Phase 12 §3) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// Room list/detail with batched upcoming-session occupancy + branch names (no
// N+1). `canArchive` is conservatively false while future/active sessions exist
// (the archive command re-checks). Requires `exams.view`. No writes, no rules.
// =============================================================================

export class ExamRoomAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async list(
    context: AuthContext,
    filters: ExamRoomAdminListFilters = {}
  ): Promise<PortalListResult<ExamRoomListItemDto>> {
    this.assertCanView(context);
    const { organizationId } = context;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));

    const repoFilters = {
      organizationId,
      branchId: filters.branchId,
      status: filters.status,
      minCapacity: filters.minCapacity,
      maxCapacity: filters.maxCapacity,
      search: filters.search,
    };
    const [rows, total] = await Promise.all([
      listRoomsForPortal({ ...repoFilters, skip: (page - 1) * pageSize, take: pageSize }),
      countRoomsForPortal(repoFilters),
    ]);

    const roomIds = rows.map((r) => r.id);
    const branchIds = [...new Set(rows.map((r) => r.branchId).filter((b): b is string => !!b))];
    const [upcoming, branches] = await Promise.all([
      listUpcomingSessionsByRoomIds(organizationId, roomIds),
      listBranchNamesByIds(organizationId, branchIds),
    ]);
    const byRoom = groupByRoom(upcoming);
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const caps = resolveRoomCaps(context);

    const items = rows.map((r): ExamRoomListItemDto => {
      const up = byRoom.get(r.id) ?? [];
      return {
        roomId: r.id,
        name: r.name,
        code: r.code,
        branchId: r.branchId,
        branchName: r.branchId ? branchName.get(r.branchId) ?? null : null,
        capacity: r.capacity,
        status: r.status,
        description: r.description,
        upcomingSessionCount: up.length,
        nextSessionAt: up[0]?.startsAt ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        allowedActions: computeRoomAllowedActions(r.status, up.length > 0, caps),
      };
    });

    return { items, total, page, pageSize };
  }

  async getDetail(context: AuthContext, roomId: string): Promise<ExamRoomDetailDto | null> {
    this.assertCanView(context);
    const { organizationId } = context;
    const room = await findExamRoomById({ organizationId, id: roomId });
    if (!room) return null;

    const [upcoming, branches] = await Promise.all([
      listUpcomingSessionsByRoomIds(organizationId, [roomId]),
      room.branchId ? listBranchNamesByIds(organizationId, [room.branchId]) : Promise.resolve([]),
    ]);
    const caps = resolveRoomCaps(context);
    const hasFuture = upcoming.length > 0;

    return {
      roomId: room.id,
      name: room.name,
      code: room.code,
      branchId: room.branchId,
      branchName: room.branchId ? branches[0]?.name ?? null : null,
      capacity: room.capacity,
      status: room.status,
      description: room.description,
      upcomingSessionCount: upcoming.length,
      nextSessionAt: upcoming[0]?.startsAt ?? null,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      upcomingSessions: upcoming.map((s) => ({
        sessionId: s.id,
        title: s.title,
        status: s.status,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
      activeSessionCount: upcoming.length,
      archiveBlockedReason: hasFuture
        ? "Existem sessões futuras ou em curso associadas a esta sala."
        : null,
      allowedActions: computeRoomAllowedActions(room.status, hasFuture, caps),
    };
  }
}

function groupByRoom(refs: UpcomingSessionRef[]): Map<string, UpcomingSessionRef[]> {
  const m = new Map<string, UpcomingSessionRef[]>();
  for (const r of refs) {
    const arr = m.get(r.roomId) ?? [];
    arr.push(r);
    m.set(r.roomId, arr);
  }
  return m;
}

export const examRoomAdminReadService = new ExamRoomAdminReadService();
