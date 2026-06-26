import { describe, it, expect } from "vitest";
import { resolveNextSession, buildNextClassLabelsByGroup } from "../services/teacher-portal-schedule.service";
import type { TeacherTodaySession } from "../types";
import type { TeacherScheduleRow } from "@/modules/teachers/teacher-360/types";

function session(overrides: Partial<TeacherTodaySession>): TeacherTodaySession {
  return {
    id: "s1",
    startTime: "09:00",
    endTime: "10:00",
    classGroupId: "cg1",
    classGroupName: "Turma A",
    subjectName: "Código da Estrada",
    classroomName: null,
    status: "OPEN",
    ...overrides,
  };
}

describe("resolveNextSession", () => {
  it("returns null for an empty schedule", () => {
    expect(resolveNextSession([])).toBeNull();
  });

  it("returns the first session sorted by time when both are still upcoming", () => {
    const now = new Date("2026-06-25T07:00:00");
    const first = session({ id: "s1", startTime: "08:00", endTime: "09:00" });
    const second = session({ id: "s2", startTime: "10:00", endTime: "11:00" });
    expect(resolveNextSession([first, second], now)).toBe(first);
  });

  it("skips a CANCELLED session and returns the next non-cancelled one", () => {
    const now = new Date("2026-06-25T07:00:00");
    const cancelled = session({ id: "s1", startTime: "08:00", endTime: "09:00", status: "CANCELLED" });
    const open = session({ id: "s2", startTime: "10:00", endTime: "11:00", status: "OPEN" });
    expect(resolveNextSession([cancelled, open], now)).toBe(open);
  });

  it("returns null when every session today is cancelled", () => {
    const cancelled = session({ status: "CANCELLED" });
    expect(resolveNextSession([cancelled])).toBeNull();
  });

  // H1 — acceptance criteria from the review: at 15:00, a 09:00 COMPLETED
  // session must not be reported as "next"; a future 16:00 session must be.
  it("at 15:00, does not return an earlier COMPLETED session as next", () => {
    const now = new Date("2026-06-25T15:00:00");
    const completed = session({ id: "s1", startTime: "09:00", endTime: "10:00", status: "COMPLETED" });
    expect(resolveNextSession([completed], now)).toBeNull();
  });

  it("at 15:00, returns a future 16:00 session as next", () => {
    const now = new Date("2026-06-25T15:00:00");
    const completed = session({ id: "s1", startTime: "09:00", endTime: "10:00", status: "COMPLETED" });
    const future = session({ id: "s2", startTime: "16:00", endTime: "17:00", status: "OPEN" });
    expect(resolveNextSession([completed, future], now)).toBe(future);
  });

  it("returns null (correct empty state) when there are no future or in-progress sessions left today", () => {
    const now = new Date("2026-06-25T18:00:00");
    const completed = session({ id: "s1", startTime: "09:00", endTime: "10:00", status: "COMPLETED" });
    const cancelled = session({ id: "s2", startTime: "16:00", endTime: "17:00", status: "CANCELLED" });
    expect(resolveNextSession([completed, cancelled], now)).toBeNull();
  });

  it("returns a session currently in progress (startTime <= now <= endTime) rather than skipping it", () => {
    const now = new Date("2026-06-25T09:30:00");
    const inProgress = session({ id: "s1", startTime: "09:00", endTime: "10:00", status: "OPEN" });
    expect(resolveNextSession([inProgress], now)).toBe(inProgress);
  });

  it("excludes a non-cancelled session whose endTime has already passed, even if not marked COMPLETED", () => {
    const now = new Date("2026-06-25T15:00:00");
    const stillOpenButPast = session({ id: "s1", startTime: "09:00", endTime: "10:00", status: "OPEN" });
    expect(resolveNextSession([stillOpenButPast], now)).toBeNull();
  });
});

function scheduleRow(overrides: Partial<TeacherScheduleRow>): TeacherScheduleRow {
  return {
    id: "row-1",
    dayOfWeek: "MONDAY",
    startTime: "09:00",
    endTime: "10:00",
    classGroupId: "cg1",
    classGroupName: "Turma A",
    courseName: "Curso A",
    courseLevelName: null,
    subjectNames: [],
    ...overrides,
  };
}

describe("buildNextClassLabelsByGroup", () => {
  it("labels a same-day occurrence later today as 'Hoje, <time>'", () => {
    // 2026-06-22 is a Monday
    const now = new Date("2026-06-22T08:00:00");
    const labels = buildNextClassLabelsByGroup([scheduleRow({ dayOfWeek: "MONDAY", startTime: "09:00" })], now);
    expect(labels.get("cg1")).toBe("Hoje, 09:00");
  });

  it("rolls a same-day occurrence whose time already passed to next week", () => {
    const now = new Date("2026-06-22T15:00:00"); // Monday, after 09:00
    const labels = buildNextClassLabelsByGroup([scheduleRow({ dayOfWeek: "MONDAY", startTime: "09:00" })], now);
    expect(labels.get("cg1")).toBe("Seg, 09:00");
  });

  it("labels tomorrow as 'Amanhã, <time>'", () => {
    const now = new Date("2026-06-22T08:00:00"); // Monday
    const labels = buildNextClassLabelsByGroup([scheduleRow({ dayOfWeek: "TUESDAY", startTime: "14:00" })], now);
    expect(labels.get("cg1")).toBe("Amanhã, 14:00");
  });

  it("picks the closest occurrence when a class group has multiple weekly slots", () => {
    const now = new Date("2026-06-22T08:00:00"); // Monday
    const labels = buildNextClassLabelsByGroup(
      [
        scheduleRow({ dayOfWeek: "FRIDAY", startTime: "09:00" }),
        scheduleRow({ dayOfWeek: "WEDNESDAY", startTime: "09:00" }),
      ],
      now
    );
    expect(labels.get("cg1")).toBe("Qua, 09:00");
  });

  it("returns an empty map for an empty schedule", () => {
    expect(buildNextClassLabelsByGroup([], new Date()).size).toBe(0);
  });
});
