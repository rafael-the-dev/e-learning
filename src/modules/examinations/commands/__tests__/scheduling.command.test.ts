import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 4 SCHEDULING COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives the Phase-4 scheduling commands (period / room / session lifecycle +
// invigilator assignment) against the rollback-capable in-memory fake DB. The
// real repositories and the real auditService run against the fake; only
// `@/server/db` (→ fake) and `@/server/auth/rbac` (allow/deny + recorded perms)
// are mocked. There is NO domain-event bus in Phase 4, so the durable trail we
// assert on is the append-only `examEvent` store + the `auditLog` store, both
// written INSIDE the command transaction (so a rollback discards them).
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true, checked: [] as string[] }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({
    can: (perm: string) => {
      authState.checked.push(perm);
      return authState.allow;
    },
  }),
}));

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  CancelExamPeriodCommand,
  CompleteExamPeriodCommand,
  CreateExamPeriodCommand,
  LockExamPeriodCommand,
  OpenExamPeriodCommand,
} from "../exam-period.commands";
import {
  ArchiveExamRoomCommand,
  CreateExamRoomCommand,
  UpdateExamRoomCommand,
} from "../exam-room.commands";
import {
  CancelExamSessionCommand,
  CompleteExamSessionCommand,
  CreateExamSessionCommand,
  LockExamSessionCommand,
  ScheduleExamSessionCommand,
  StartExamSessionCommand,
} from "../exam-session.commands";
import { AssignExamInvigilatorCommand } from "../assign-exam-invigilator.command";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const otherCtx: ServiceContext = { userId: "u-x", organizationId: OTHER_ORG };

const store = (name: string) => h.db[name].__store;
const events = () => store("examEvent");
const audits = () => store("auditLog");
const eventsOf = (type: string) => events().filter((e) => (e as { eventType: string }).eventType === type);

// Period window and a session window inside it.
const P_START = new Date("2026-06-01T00:00:00.000Z");
const P_END = new Date("2026-06-30T23:59:59.000Z");
const S_START = new Date("2026-06-10T09:00:00.000Z");
const S_END = new Date("2026-06-10T12:00:00.000Z");

function seedPeriod(over: Record<string, unknown> = {}): void {
  seed(h.db, "examPeriod", {
    id: "per-1", organizationId: ORG, branchId: null, name: "Finais 2026", academicYear: "2026",
    term: null, status: "OPEN", startsAt: P_START, endsAt: P_END,
    lockedAt: null, completedAt: null, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, cancelledById: null, deletedAt: null,
    ...over,
  });
}

function seedRoom(over: Record<string, unknown> = {}): void {
  seed(h.db, "examRoom", {
    id: "room-1", organizationId: ORG, branchId: null, name: "Sala A", code: "A1",
    capacity: 30, status: "ACTIVE", description: null, deletedAt: null, ...over,
  });
}

function seedLevelSubject(over: Record<string, unknown> = {}): void {
  seed(h.db, "levelSubject", { id: "ls-1", organizationId: ORG, deletedAt: null, ...over });
}

function seedSession(over: Record<string, unknown> = {}): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "DRAFT", startsAt: S_START, endsAt: S_END, capacity: 20, instructions: null,
    lockedAt: null, startedAt: null, completedAt: null, publishedAt: null, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, publishedById: null, cancelledById: null,
    deletedAt: null, ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── ExamPeriod lifecycle ────────────────────────────────────────────────────

describe("ExamPeriod commands", () => {
  const create = (over: Record<string, unknown> = {}, context = ctx) =>
    new CreateExamPeriodCommand(
      { name: "Finais", academicYear: "2026", startsAt: P_START, endsAt: P_END, ...over },
      context
    ).run();

  it("1. create → DRAFT, writes audit only (no ExamEvent)", async () => {
    const r = await create();
    expect(r.status).toBe("DRAFT");
    expect(store("examPeriod")[0].status).toBe("DRAFT");
    expect(store("examPeriod")[0].createdById).toBe("u-1");
    expect(audits().some((a) => (a as { action: string }).action === "exam_period.created")).toBe(true);
    expect(events()).toHaveLength(0);
  });

  it("2. create rejects startsAt >= endsAt (ValidationError)", async () => {
    await expect(create({ startsAt: P_END, endsAt: P_START })).rejects.toBeInstanceOf(ValidationError);
  });

  it("3. open DRAFT → OPEN, writes event + audit", async () => {
    seedPeriod({ status: "DRAFT" });
    const r = await new OpenExamPeriodCommand({ periodId: "per-1" }, ctx).run();
    expect(r.status).toBe("OPEN");
    expect(store("examPeriod")[0].status).toBe("OPEN");
    expect(eventsOf("exam_period.opened")).toHaveLength(1);
    expect(audits().some((a) => (a as { action: string }).action === "exam_period.opened")).toBe(true);
  });

  it("4. lock OPEN → LOCKED (stamps lockedById)", async () => {
    seedPeriod({ status: "OPEN" });
    const r = await new LockExamPeriodCommand({ periodId: "per-1" }, ctx).run();
    expect(r.status).toBe("LOCKED");
    expect(store("examPeriod")[0].status).toBe("LOCKED");
    expect(store("examPeriod")[0].lockedById).toBe("u-1");
    expect(eventsOf("exam_period.locked")).toHaveLength(1);
  });

  it("5. complete LOCKED → COMPLETED", async () => {
    seedPeriod({ status: "LOCKED" });
    const r = await new CompleteExamPeriodCommand({ periodId: "per-1" }, ctx).run();
    expect(r.status).toBe("COMPLETED");
    expect(store("examPeriod")[0].completedById).toBe("u-1");
    expect(eventsOf("exam_period.completed")).toHaveLength(1);
  });

  it("6. cancel DRAFT|OPEN|LOCKED → CANCELLED (reason recorded on event)", async () => {
    seedPeriod({ status: "OPEN" });
    const r = await new CancelExamPeriodCommand({ periodId: "per-1", reason: "erro" }, ctx).run();
    expect(r.status).toBe("CANCELLED");
    const evt = eventsOf("exam_period.cancelled")[0] as { reason: string };
    expect(evt.reason).toBe("erro");
  });

  it("7. cancel requires a reason (ValidationError)", async () => {
    seedPeriod({ status: "OPEN" });
    await expect(new CancelExamPeriodCommand({ periodId: "per-1", reason: "" }, ctx).run()).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("8. cannot open a non-DRAFT period (terminal-rejected)", async () => {
    seedPeriod({ status: "OPEN" });
    await expect(new OpenExamPeriodCommand({ periodId: "per-1" }, ctx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(events()).toHaveLength(0);
  });

  it("9. cannot complete a non-LOCKED period", async () => {
    seedPeriod({ status: "OPEN" });
    await expect(new CompleteExamPeriodCommand({ periodId: "per-1" }, ctx).run()).rejects.toBeInstanceOf(
      BusinessRuleError
    );
  });

  it.each(["COMPLETED", "CANCELLED"])("10. cannot cancel a terminal (%s) period", async (status) => {
    seedPeriod({ status });
    await expect(new CancelExamPeriodCommand({ periodId: "per-1", reason: "x" }, ctx).run()).rejects.toBeInstanceOf(
      BusinessRuleError
    );
    expect(events()).toHaveLength(0);
  });

  it("11. open aborts on a lost race (mark count 0) — no event/audit", async () => {
    seedPeriod({ status: "DRAFT" });
    h.db.examPeriod.updateMany = async () => ({ count: 0 });
    await expect(new OpenExamPeriodCommand({ periodId: "per-1" }, ctx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(events()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("12. open rolls back (event write throws) — status unchanged, nothing persisted", async () => {
    seedPeriod({ status: "DRAFT" });
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(new OpenExamPeriodCommand({ periodId: "per-1" }, ctx).run()).rejects.toThrow(/boom/);
    expect(store("examPeriod")[0].status).toBe("DRAFT");
    expect(audits()).toHaveLength(0);
  });

  it("13. cross-tenant period is NotFound", async () => {
    seedPeriod({ status: "DRAFT" });
    await expect(new OpenExamPeriodCommand({ periodId: "per-1" }, otherCtx).run()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("14. create requires exams.schedule", async () => {
    authState.allow = false;
    await expect(create()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.schedule");
  });

  it("15. open requires exams.schedule", async () => {
    seedPeriod({ status: "DRAFT" });
    authState.allow = false;
    await expect(new OpenExamPeriodCommand({ periodId: "per-1" }, ctx).run()).rejects.toBeInstanceOf(
      AuthorizationError
    );
  });
});

// ─── ExamRoom ─────────────────────────────────────────────────────────────────

describe("ExamRoom commands", () => {
  const create = (over: Record<string, unknown> = {}, context = ctx) =>
    new CreateExamRoomCommand({ name: "Sala A", capacity: 30, ...over }, context).run();

  it("16. create → ACTIVE, audit only (no ExamEvent)", async () => {
    const r = await create({ code: "A1" });
    expect(r.status).toBe("ACTIVE");
    expect(store("examRoom")[0].code).toBe("A1");
    expect(events()).toHaveLength(0);
    expect(audits().some((a) => (a as { action: string }).action === "exam_room.created")).toBe(true);
  });

  it("17. create rejects capacity <= 0 (ValidationError)", async () => {
    await expect(create({ capacity: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("18. create rejects a duplicate live code", async () => {
    seedRoom({ code: "A1" });
    await expect(create({ code: "A1" })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("19. update metadata (name + capacity + status) writes audit", async () => {
    seedRoom();
    const r = await new UpdateExamRoomCommand(
      { roomId: "room-1", name: "Sala B", capacity: 40, status: "INACTIVE" },
      ctx
    ).run();
    expect(r.roomId).toBe("room-1");
    expect(store("examRoom")[0].name).toBe("Sala B");
    expect(store("examRoom")[0].capacity).toBe(40);
    expect(store("examRoom")[0].status).toBe("INACTIVE");
    expect(audits().some((a) => (a as { action: string }).action === "exam_room.updated")).toBe(true);
  });

  it("20. update a missing room is NotFound", async () => {
    await expect(new UpdateExamRoomCommand({ roomId: "nope", name: "X" }, ctx).run()).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("21. archive a free room (no future sessions) soft-deletes it", async () => {
    seedRoom();
    const r = await new ArchiveExamRoomCommand({ roomId: "room-1" }, ctx).run();
    expect(r.roomId).toBe("room-1");
    expect(store("examRoom")[0].deletedAt).not.toBeNull();
    expect(audits().some((a) => (a as { action: string }).action === "exam_room.archived")).toBe(true);
  });

  it("22. archive is blocked by a future non-cancelled session in the room", async () => {
    seedRoom();
    seedSession({ id: "sess-fut", roomId: "room-1", status: "SCHEDULED", endsAt: new Date("2099-01-01T00:00:00.000Z") });
    await expect(new ArchiveExamRoomCommand({ roomId: "room-1" }, ctx).run()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store("examRoom")[0].deletedAt ?? null).toBeNull();
  });

  it("23. archive cross-tenant room is NotFound", async () => {
    seedRoom();
    await expect(new ArchiveExamRoomCommand({ roomId: "room-1" }, otherCtx).run()).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("24. archive aborts on a lost race (mark count 0)", async () => {
    seedRoom();
    h.db.examRoom.updateMany = async () => ({ count: 0 });
    await expect(new ArchiveExamRoomCommand({ roomId: "room-1" }, ctx).run()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("25. create requires exams.schedule", async () => {
    authState.allow = false;
    await expect(create()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.schedule");
  });
});

// ─── ExamSession lifecycle ───────────────────────────────────────────────────

describe("ExamSession commands", () => {
  const create = (over: Record<string, unknown> = {}, context = ctx) =>
    new CreateExamSessionCommand(
      { periodId: "per-1", levelSubjectId: "ls-1", startsAt: S_START, endsAt: S_END, capacity: 20, ...over },
      context
    ).run();

  it("26. create DRAFT under an OPEN period (audit only, no event)", async () => {
    seedPeriod({ status: "OPEN" });
    seedLevelSubject();
    const r = await create();
    expect(r.status).toBe("DRAFT");
    expect(store("examSession")[0].periodId).toBe("per-1");
    expect(events()).toHaveLength(0);
    expect(audits().some((a) => (a as { action: string }).action === "exam_session.created")).toBe(true);
  });

  it("27. create DRAFT under a LOCKED period is allowed", async () => {
    seedPeriod({ status: "LOCKED" });
    seedLevelSubject();
    const r = await create();
    expect(r.status).toBe("DRAFT");
  });

  it("28. create rejects a non-schedulable period (DRAFT)", async () => {
    seedPeriod({ status: "DRAFT" });
    seedLevelSubject();
    await expect(create()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("29. create rejects a window outside the period bounds", async () => {
    seedPeriod({ status: "OPEN" });
    seedLevelSubject();
    await expect(
      create({ startsAt: new Date("2026-05-01T09:00:00.000Z"), endsAt: new Date("2026-05-01T12:00:00.000Z") })
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("30. create rejects a missing period (NotFound)", async () => {
    seedLevelSubject();
    await expect(create()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("31. create rejects a missing level-subject (NotFound)", async () => {
    seedPeriod({ status: "OPEN" });
    await expect(create()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("32. create rejects capacity over the room capacity", async () => {
    seedPeriod({ status: "OPEN" });
    seedLevelSubject();
    seedRoom({ capacity: 10 });
    await expect(create({ roomId: "room-1", capacity: 20 })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("33. create rejects an overlapping session in the same room", async () => {
    seedPeriod({ status: "OPEN" });
    seedLevelSubject();
    seedRoom({ capacity: 30 });
    seedSession({ id: "sess-x", roomId: "room-1", status: "SCHEDULED" });
    await expect(create({ roomId: "room-1", capacity: 20 })).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("34. create succeeds in a room with capacity and no overlap", async () => {
    seedPeriod({ status: "OPEN" });
    seedLevelSubject();
    seedRoom({ capacity: 30 });
    const r = await create({ roomId: "room-1", capacity: 20 });
    expect(r.status).toBe("DRAFT");
    expect(store("examSession").find((s) => (s as { roomId: string }).roomId === "room-1")).toBeDefined();
  });

  it("35. schedule DRAFT → SCHEDULED (event + audit)", async () => {
    seedSession({ status: "DRAFT" });
    const r = await new ScheduleExamSessionCommand({ sessionId: "sess-1" }, ctx).run();
    expect(r.status).toBe("SCHEDULED");
    expect(eventsOf("exam_session.scheduled")).toHaveLength(1);
  });

  it("36. lock SCHEDULED → LOCKED", async () => {
    seedSession({ status: "SCHEDULED" });
    const r = await new LockExamSessionCommand({ sessionId: "sess-1" }, ctx).run();
    expect(r.status).toBe("LOCKED");
    expect(store("examSession")[0].lockedById).toBe("u-1");
    expect(eventsOf("exam_session.locked")).toHaveLength(1);
  });

  it("37. start LOCKED → IN_PROGRESS (stamps startedAt)", async () => {
    seedSession({ status: "LOCKED" });
    const r = await new StartExamSessionCommand({ sessionId: "sess-1" }, ctx).run();
    expect(r.status).toBe("IN_PROGRESS");
    expect(store("examSession")[0].startedAt).not.toBeNull();
    expect(eventsOf("exam_session.started")).toHaveLength(1);
  });

  it("38. complete IN_PROGRESS → COMPLETED", async () => {
    seedSession({ status: "IN_PROGRESS" });
    const r = await new CompleteExamSessionCommand({ sessionId: "sess-1" }, ctx).run();
    expect(r.status).toBe("COMPLETED");
    expect(eventsOf("exam_session.completed")).toHaveLength(1);
  });

  it("39. cancel DRAFT|SCHEDULED|LOCKED → CANCELLED (reason)", async () => {
    seedSession({ status: "SCHEDULED" });
    const r = await new CancelExamSessionCommand({ sessionId: "sess-1", reason: "adiado" }, ctx).run();
    expect(r.status).toBe("CANCELLED");
    expect((eventsOf("exam_session.cancelled")[0] as { reason: string }).reason).toBe("adiado");
  });

  it("40. cannot schedule a non-DRAFT session (terminal-rejected)", async () => {
    seedSession({ status: "SCHEDULED" });
    await expect(new ScheduleExamSessionCommand({ sessionId: "sess-1" }, ctx).run()).rejects.toBeInstanceOf(
      BusinessRuleError
    );
    expect(events()).toHaveLength(0);
  });

  it("41. cannot start a COMPLETED session", async () => {
    seedSession({ status: "COMPLETED" });
    await expect(new StartExamSessionCommand({ sessionId: "sess-1" }, ctx).run()).rejects.toBeInstanceOf(
      BusinessRuleError
    );
  });

  it("42. cancel requires a reason (ValidationError)", async () => {
    seedSession({ status: "SCHEDULED" });
    await expect(new CancelExamSessionCommand({ sessionId: "sess-1", reason: "" }, ctx).run()).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("43. schedule aborts on a lost race (mark count 0)", async () => {
    seedSession({ status: "DRAFT" });
    h.db.examSession.updateMany = async () => ({ count: 0 });
    await expect(new ScheduleExamSessionCommand({ sessionId: "sess-1" }, ctx).run()).rejects.toBeInstanceOf(
      BusinessRuleError
    );
    expect(events()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("44. schedule rolls back when the audit write throws — status unchanged", async () => {
    seedSession({ status: "DRAFT" });
    h.db.auditLog.create = async () => {
      throw new Error("boom");
    };
    await expect(new ScheduleExamSessionCommand({ sessionId: "sess-1" }, ctx).run()).rejects.toThrow(/boom/);
    expect(store("examSession")[0].status).toBe("DRAFT");
    expect(events()).toHaveLength(0);
  });

  it("45. cross-tenant session is NotFound", async () => {
    seedSession({ status: "DRAFT" });
    await expect(new ScheduleExamSessionCommand({ sessionId: "sess-1" }, otherCtx).run()).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("46. schedule requires exams.schedule", async () => {
    seedSession({ status: "DRAFT" });
    authState.allow = false;
    await expect(new ScheduleExamSessionCommand({ sessionId: "sess-1" }, ctx).run()).rejects.toBeInstanceOf(
      AuthorizationError
    );
  });
});

// ─── ExamInvigilatorAssignment ─────────────────────────────────────────────────

describe("AssignExamInvigilatorCommand", () => {
  const assign = (over: Record<string, unknown> = {}, context = ctx) =>
    new AssignExamInvigilatorCommand(
      { examSessionId: "sess-1", teacherId: "t-1", role: "INVIGILATOR", ...over },
      context
    ).run();

  it("47. assign a teacher → assignment + event + audit", async () => {
    seedSession({ status: "SCHEDULED" });
    const r = await assign();
    expect(r.examSessionId).toBe("sess-1");
    expect(r.role).toBe("INVIGILATOR");
    expect(store("examInvigilatorAssignment")[0].teacherId).toBe("t-1");
    expect(eventsOf("exam_invigilator.assigned")).toHaveLength(1);
    expect(audits().some((a) => (a as { action: string }).action === "exam_invigilator.assigned")).toBe(true);
  });

  it("48. assign a user (by userId) → assignment", async () => {
    seedSession({ status: "SCHEDULED" });
    const r = await assign({ teacherId: undefined, userId: "usr-9" });
    expect(store("examInvigilatorAssignment")[0].userId).toBe("usr-9");
    expect(r.assignmentId).toBeDefined();
  });

  it("49. rejects when BOTH teacherId and userId are given (ValidationError)", async () => {
    seedSession({ status: "SCHEDULED" });
    await expect(assign({ userId: "usr-9" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("50. rejects when NEITHER teacherId nor userId is given (ValidationError)", async () => {
    seedSession({ status: "SCHEDULED" });
    await expect(assign({ teacherId: undefined })).rejects.toBeInstanceOf(ValidationError);
  });

  it("51. rejects a duplicate assignment (same session + teacher)", async () => {
    seedSession({ status: "SCHEDULED" });
    seed(h.db, "examInvigilatorAssignment", {
      id: "asg-0", organizationId: ORG, examSessionId: "sess-1", teacherId: "t-1", userId: null,
      role: "INVIGILATOR", assignedAt: S_START, assignedById: "u-0",
    });
    await expect(assign()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("52. rejects an overlapping assignment for the same invigilator", async () => {
    seedSession({ status: "SCHEDULED" });
    // Another live session that overlaps sess-1's window, already staffed by t-1.
    seedSession({ id: "sess-2", status: "SCHEDULED", startsAt: S_START, endsAt: S_END });
    seed(h.db, "examInvigilatorAssignment", {
      id: "asg-2", organizationId: ORG, examSessionId: "sess-2", teacherId: "t-1", userId: null,
      role: "INVIGILATOR", assignedAt: S_START, assignedById: "u-0",
    });
    await expect(assign()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("53. rejects a non-assignable (post-sitting) session", async () => {
    seedSession({ status: "COMPLETED" });
    await expect(assign()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(events()).toHaveLength(0);
  });

  it("54. rolls back (event write throws) — no assignment/audit persisted", async () => {
    seedSession({ status: "SCHEDULED" });
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(assign()).rejects.toThrow(/boom/);
    expect(store("examInvigilatorAssignment")).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("55. requires exams.schedule", async () => {
    seedSession({ status: "SCHEDULED" });
    authState.allow = false;
    await expect(assign()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.schedule");
  });

  it("56. cross-tenant session is NotFound", async () => {
    seedSession({ status: "SCHEDULED" });
    await expect(assign({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });
});
