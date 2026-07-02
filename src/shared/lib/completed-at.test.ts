import { describe, it, expect } from "vitest";
import { resolveStableCompletedAt } from "@/shared/lib/completed-at";

// Status sets mirror the two writers (kept local so the helper's contract is
// tested independently of the service wiring).
const SUBJECT_TERMINAL = new Set(["PASSED", "FAILED"]);
const SUBJECT_COMPLETION = new Set(["PASSED"]);
const LEVEL_TERMINAL = new Set(["PASSED", "FAILED", "PROMOTED", "COMPLETED"]);
const LEVEL_COMPLETION = new Set(["PASSED", "PROMOTED", "COMPLETED"]);

const D1 = new Date("2026-03-01T00:00:00Z"); // original completion date
const NOW = new Date("2026-03-20T00:00:00Z"); // a later recalculation

function subject(previousStatus: string | null, previousCompletedAt: Date | null, nextStatus: string) {
  return resolveStableCompletedAt({
    previousStatus,
    previousCompletedAt,
    nextStatus,
    terminalStatuses: SUBJECT_TERMINAL,
    completionStatuses: SUBJECT_COMPLETION,
    now: NOW,
  });
}

function level(previousStatus: string | null, previousCompletedAt: Date | null, nextStatus: string) {
  return resolveStableCompletedAt({
    previousStatus,
    previousCompletedAt,
    nextStatus,
    terminalStatuses: LEVEL_TERMINAL,
    completionStatuses: LEVEL_COMPLETION,
    now: NOW,
  });
}

describe("resolveStableCompletedAt — StudentSubjectProgress", () => {
  it("1. IN_PROGRESS → PASSED sets completedAt (now)", () => {
    expect(subject("IN_PROGRESS", null, "PASSED")).toEqual(NOW);
  });

  it("2. PASSED → PASSED preserves the original completedAt", () => {
    expect(subject("PASSED", D1, "PASSED")).toEqual(D1);
  });

  it("3. FAILED → FAILED preserves the original completedAt", () => {
    expect(subject("FAILED", D1, "FAILED")).toEqual(D1);
  });

  it("4. PASSED → IN_PROGRESS clears completedAt", () => {
    expect(subject("PASSED", D1, "IN_PROGRESS")).toBeNull();
  });

  it("5. FAILED → PASSED sets a NEW completedAt (completed as passed happens now)", () => {
    expect(subject("FAILED", D1, "PASSED")).toEqual(NOW);
  });

  it("6. PASSED → FAILED clears completedAt (no longer completed)", () => {
    expect(subject("PASSED", D1, "FAILED")).toBeNull();
  });

  it("new row (null previous) → PASSED stamps now; → non-terminal stays null", () => {
    expect(subject(null, null, "PASSED")).toEqual(NOW);
    expect(subject(null, null, "IN_PROGRESS")).toBeNull();
    expect(subject(null, null, "BLOCKED")).toBeNull();
  });

  it("preserving a terminal status with a missing date stamps now (backfill)", () => {
    expect(subject("PASSED", null, "PASSED")).toEqual(NOW);
  });
});

describe("resolveStableCompletedAt — StudentLevelProgress", () => {
  it("1. IN_PROGRESS → PASSED sets completedAt (now)", () => {
    expect(level("IN_PROGRESS", null, "PASSED")).toEqual(NOW);
  });

  it("2. PASSED → PASSED preserves completedAt", () => {
    expect(level("PASSED", D1, "PASSED")).toEqual(D1);
  });

  it("3. PROMOTED → PROMOTED preserves completedAt", () => {
    expect(level("PROMOTED", D1, "PROMOTED")).toEqual(D1);
  });

  it("4. PROMOTED_WITH_PENDING_SUBJECTS does not set completedAt (non-terminal)", () => {
    expect(level("IN_PROGRESS", null, "PROMOTED_WITH_PENDING_SUBJECTS")).toBeNull();
    expect(level(null, null, "PROMOTED_WITH_PENDING_SUBJECTS")).toBeNull();
  });

  it("5. PROMOTED_WITH_PENDING_SUBJECTS → PROMOTED sets completedAt (now)", () => {
    expect(level("PROMOTED_WITH_PENDING_SUBJECTS", null, "PROMOTED")).toEqual(NOW);
  });

  it("6. PROMOTED → PROMOTED_WITH_PENDING_SUBJECTS clears completedAt", () => {
    expect(level("PROMOTED", D1, "PROMOTED_WITH_PENDING_SUBJECTS")).toBeNull();
  });

  it("7. COMPLETED → COMPLETED preserves completedAt", () => {
    expect(level("COMPLETED", D1, "COMPLETED")).toEqual(D1);
  });

  it("8. terminal → BLOCKED clears completedAt", () => {
    expect(level("PASSED", D1, "BLOCKED")).toBeNull();
    expect(level("PROMOTED", D1, "BLOCKED")).toBeNull();
  });

  it("ELIGIBLE_TO_PROGRESS is non-terminal → no completedAt", () => {
    expect(level("PASSED", D1, "ELIGIBLE_TO_PROGRESS")).toBeNull();
  });
});
