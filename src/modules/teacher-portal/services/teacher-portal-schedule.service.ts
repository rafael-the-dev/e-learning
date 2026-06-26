import { findTeacherTodaySessions } from "@/modules/teacher-portal/repositories/teacher-portal.repository";
import type { TeacherTodaySession } from "@/modules/teacher-portal/types";
import type { TeacherScheduleRow } from "@/modules/teachers/teacher-360/types";

export async function getTeacherTodaySchedule(
  teacherId: string,
  organizationId: string,
  now: Date = new Date()
): Promise<TeacherTodaySession[]> {
  return findTeacherTodaySessions(teacherId, organizationId, now);
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * "Next" means not-yet-finished — excludes CANCELLED/COMPLETED sessions and
 * any session whose endTime has already passed `now`. A session currently
 * in progress (startTime <= now <= endTime) is included and shown as the
 * "next" one, since there is nothing more specific to distinguish "current"
 * from "next" in the UI today.
 */
export function resolveNextSession(
  todaySchedule: TeacherTodaySession[],
  now: Date = new Date()
): TeacherTodaySession | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return (
    todaySchedule.find((s) => {
      if (s.status === "CANCELLED" || s.status === "COMPLETED") return false;
      return parseMinutes(s.endTime) >= nowMinutes;
    }) ?? null
  );
}

const DAY_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const PT_DAY_ABBR: Record<string, string> = {
  SUNDAY: "Dom",
  MONDAY: "Seg",
  TUESDAY: "Ter",
  WEDNESDAY: "Qua",
  THURSDAY: "Qui",
  FRIDAY: "Sex",
  SATURDAY: "Sáb",
};

/**
 * Derives a "next occurrence" label (e.g. "Hoje, 14:00", "Seg, 09:00") per
 * class group from the teacher's recurring weekly schedule — reused from
 * Teacher 360's findTeacherScheduleRows rather than re-querying.
 */
export function buildNextClassLabelsByGroup(
  scheduleRows: TeacherScheduleRow[],
  now: Date = new Date()
): Map<string, string> {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const closest = new Map<string, { daysUntil: number; startTime: string }>();

  for (const row of scheduleRows) {
    const dayIndex = DAY_INDEX[row.dayOfWeek];
    if (dayIndex === undefined) continue;

    let daysUntil = (dayIndex - now.getDay() + 7) % 7;
    if (daysUntil === 0 && parseMinutes(row.startTime) < currentMinutes) {
      daysUntil = 7;
    }

    const existing = closest.get(row.classGroupId);
    if (!existing || daysUntil < existing.daysUntil) {
      closest.set(row.classGroupId, { daysUntil, startTime: row.startTime });
    }
  }

  const labels = new Map<string, string>();
  for (const [classGroupId, { daysUntil, startTime }] of closest) {
    let prefix: string;
    if (daysUntil === 0) prefix = "Hoje";
    else if (daysUntil === 1) prefix = "Amanhã";
    else {
      const targetDayIndex = (now.getDay() + daysUntil) % 7;
      const dayName = Object.keys(DAY_INDEX).find((key) => DAY_INDEX[key] === targetDayIndex)!;
      prefix = PT_DAY_ABBR[dayName];
    }
    labels.set(classGroupId, `${prefix}, ${startTime}`);
  }
  return labels;
}
