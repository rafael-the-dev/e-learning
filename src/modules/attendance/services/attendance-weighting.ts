import type { EffectiveAttendancePolicy } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE RECORD WEIGHTING (pure) — shared by the subject (Phase 3) and
// period (Phase 4) engines so present-equivalent minutes are computed IDENTICALLY
// everywhere. Interpretation is driven by the effective AttendancePolicy.
//
//   PRESENT          → full duration present
//   REMOTE           → full IF countRemoteAsPresent, else 0 (not counted absent)
//   LATE             → partial (minutesAttended, else duration − lateMinutes) IF
//                      countLateAsPartial; otherwise full present
//   ABSENT           → 0 present, full duration absent
//   EXCUSED / approved-justification effect → full IF countExcusedAsPresent,
//                      else 0; the duration is tracked as excused minutes
// =============================================================================

export interface WeighingInput {
  status: string;
  minutesAttended: number;
  lateMinutes: number | null;
  hasApprovedJustification: boolean;
}

export interface RecordWeighting {
  presentMinutes: number;
  absentMinutes: number;
  lateMinutesLost: number;
  excusedMinutes: number;
  /** True when the record is interpreted as an excused effect rather than by its
   *  raw status (explicit EXCUSED, or ABSENT/LATE with an approved justification). */
  isExcusedEffect: boolean;
}

type WeighingPolicy = Pick<
  EffectiveAttendancePolicy,
  "countExcusedAsPresent" | "countRemoteAsPresent" | "countLateAsPartial"
>;

export function isExcusedEffect(rec: WeighingInput): boolean {
  if (rec.status === "EXCUSED") return true;
  if (rec.hasApprovedJustification && (rec.status === "ABSENT" || rec.status === "LATE")) return true;
  return false;
}

export function weighAttendanceRecord(
  rec: WeighingInput,
  durationMinutes: number,
  policy: WeighingPolicy
): RecordWeighting {
  const zero: RecordWeighting = {
    presentMinutes: 0,
    absentMinutes: 0,
    lateMinutesLost: 0,
    excusedMinutes: 0,
    isExcusedEffect: false,
  };

  if (isExcusedEffect(rec)) {
    return {
      ...zero,
      isExcusedEffect: true,
      excusedMinutes: durationMinutes,
      presentMinutes: policy.countExcusedAsPresent ? durationMinutes : 0,
    };
  }

  switch (rec.status) {
    case "PRESENT":
      return { ...zero, presentMinutes: durationMinutes };
    case "REMOTE":
      return { ...zero, presentMinutes: policy.countRemoteAsPresent ? durationMinutes : 0 };
    case "LATE": {
      let attended: number;
      if (policy.countLateAsPartial) {
        attended =
          rec.minutesAttended > 0
            ? Math.min(rec.minutesAttended, durationMinutes)
            : rec.lateMinutes != null
              ? Math.max(0, durationMinutes - rec.lateMinutes)
              : durationMinutes;
      } else {
        attended = durationMinutes;
      }
      return { ...zero, presentMinutes: attended, lateMinutesLost: Math.max(0, durationMinutes - attended) };
    }
    case "ABSENT":
    default:
      return { ...zero, absentMinutes: durationMinutes };
  }
}
