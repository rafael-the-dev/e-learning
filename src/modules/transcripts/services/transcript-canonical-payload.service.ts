import { canonicalize, contentChecksum } from "@/shared/lib/checksum";
import type { TranscriptSnapshotPayload } from "@/modules/transcripts/types";

// =============================================================================
// TRANSCRIPT CANONICAL PAYLOAD SERVICE (Phase 3)
// -----------------------------------------------------------------------------
// Turns a `TranscriptSnapshotPayload` into a CONTENT-ONLY canonical form suitable
// for the shared checksum utility. This service does NOT reimplement
// canonicalization — it projects the content that must be checksummed and
// delegates key-sorting / Decimal→number / Date→ISO / undefined-omission /
// null-preservation / array-order-preservation to `@/shared/lib/checksum`.
//
// CONTENT vs ENVELOPE — deliberately EXCLUDED from the checksum:
//   • snapshotDate  — a timestamp (transport concern; two snapshots of the same
//                     data taken on different days must hash identically).
//   • metadata      — generatedBy / builderVersion / counts (who/when/derived).
// Everything academically meaningful (type, resolved scope, detailLevel, student,
// course, course progress, levels→subjects→assessments/attendance, period
// attendance) IS included. `detailLevel` is included explicitly so a SUMMARY and
// a DETAILED snapshot never collide even when the DETAILED one has no assessments.
// =============================================================================

/**
 * Content-only projection of a snapshot payload. Values are copied by reference
 * (no coercion) so Decimal-like grades and `Date`s reach the canonicalizer
 * intact and are normalized there. Key order here is irrelevant — the
 * canonicalizer sorts keys — but array order IS significant and is preserved.
 */
export function toCanonicalTranscriptContent(
  payload: TranscriptSnapshotPayload
): Record<string, unknown> {
  return {
    transcriptType: payload.transcriptType,
    detailLevel: payload.metadata.detailLevel,
    scope: {
      enrollmentId: payload.scope.enrollmentId,
      courseId: payload.scope.courseId,
      courseLevelId: payload.scope.courseLevelId,
      academicTermId: payload.scope.academicTermId,
      levelSubjectId: payload.scope.levelSubjectId,
    },
    student: payload.studentSnapshot,
    course: payload.courseSnapshot,
    courseProgress: payload.courseProgressSnapshot,
    levels: payload.levels,
    periodAttendances: payload.periodAttendances,
  };
}

/** Deterministic canonical string of a snapshot's content. Stable across calls
 *  and independent of object-key insertion order. */
export function canonicalTranscriptString(payload: TranscriptSnapshotPayload): string {
  return canonicalize(toCanonicalTranscriptContent(payload));
}

/** Lowercase-hex SHA-256 of the snapshot's canonical content. CONTENT-ONLY:
 *  the future command stores this on the version row for staleness / supersede
 *  detection. */
export function transcriptContentChecksum(payload: TranscriptSnapshotPayload): string {
  return contentChecksum(toCanonicalTranscriptContent(payload));
}
