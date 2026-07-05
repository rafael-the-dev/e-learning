import type { EffectiveAttendancePolicy } from "@/modules/attendance/types";

// =============================================================================
// ATTENDANCE RECORD WEIGHTING (pure) — shared by the subject (Phase 3) and
// period (Phase 4) engines so present-equivalent minutes are computed IDENTICALLY
// everywhere. Interpretation is driven by the effective AttendancePolicy.
//
// MODEL: the AttendanceRecord stores REALITY (PRESENT/LATE/ABSENT/REMOTE, the
// minutes attended). The AttendancePolicy INTERPRETS it. An approved
// justification is an EFFECT layered on top of that reality — never a status
// replacement.
//
//   PRESENT          → full duration present
//   REMOTE           → full IF countRemoteAsPresent, else 0 (not counted absent)
//   LATE             → partial (minutesAttended, else duration − lateMinutes) IF
//                      countLateAsPartial; otherwise full present
//   ABSENT           → 0 present, full duration absent
//   EXCUSED (legacy primary status) → an excused absence (no attended minutes)
//
// EXCUSED / justification RULE (Fix H2) — an accommodation NEVER penalises:
//   A record with an approved justification (ABSENT/LATE) or the legacy EXCUSED
//   status is weighed by its REAL status FIRST, then the excused effect is
//   layered on so present-equivalent minutes can only RISE, never fall:
//
//       presentMinutes = max( presentByRealStatus,
//                             countExcusedAsPresent ? duration : 0 )
//
//   • The student keeps every minute they actually attended — a justified LATE
//     never drops below its partial minutes (the pre-fix bug produced 0).
//   • When the policy counts excused time as present, they are credited the full
//     duration (the accommodation IMPROVES attendance).
//   • The non-present remainder is reported as EXCUSED (accommodated) minutes,
//     never as an absence/lateness penalty.
//   • A legacy EXCUSED row has no attended minutes (real status = absence), so it
//     yields `countExcusedAsPresent ? duration : 0` — IDENTICAL to
//     `ABSENT + approved justification` (transitional parity).
//
//   This is monotonic by construction: max(raw, …) ≥ raw, so approving a
//   justification can never reduce present minutes / percentage / status under
//   ANY policy combination. See docs/attendance-engine.md → "Justified records
//   never reduce attendance (Fix H2)".
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
  // 1) Interpret the RECORDED reality first, independent of any excuse.
  const raw = weighByRealStatus(rec, durationMinutes, policy);

  if (!isExcusedEffect(rec)) return raw;

  // 2) Layer the excused accommodation on top. It may only RAISE present minutes,
  //    never lower them (Fix H2). The remainder is reported as excused, not as an
  //    absence/lateness penalty.
  const excusedPresent = policy.countExcusedAsPresent ? durationMinutes : 0;
  const presentMinutes = Math.max(raw.presentMinutes, excusedPresent);

  return {
    presentMinutes,
    absentMinutes: 0,
    lateMinutesLost: 0,
    excusedMinutes: durationMinutes - presentMinutes,
    isExcusedEffect: true,
  };
}

/** Present-equivalent weighting by the record's REAL status, ignoring any excuse.
 *  A legacy EXCUSED primary status has no attended minutes → an excused absence. */
function weighByRealStatus(
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
    case "EXCUSED":
    case "ABSENT":
    default:
      return { ...zero, absentMinutes: durationMinutes };
  }
}
