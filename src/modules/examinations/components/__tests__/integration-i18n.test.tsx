// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import {
  ExaminationStatusBadge,
  getStatusLabel,
  getStatusOptions,
} from "../status-badges";

// The closed vocabularies rendered in the integration area. Kept in sync with the
// domain unions: gradeState summary buckets (CURRENT|MISSING|STALE|UNSUPPORTED|FAILED)
// and ReconcileProgressionState (NOT_RUN|CURRENT|REQUIRES_RECALCULATION).
const GRADE_STATES = ["CURRENT", "MISSING", "STALE", "UNSUPPORTED", "FAILED"] as const;
const PROGRESSION_STATES = ["NOT_RUN", "CURRENT", "REQUIRES_RECALCULATION"] as const;

afterEach(() => cleanup());

describe("H2.1 — GRADE_STATE registry includes FAILED", () => {
  it("FAILED has valid metadata (PT-PT label + a defined, non-fallback variant)", () => {
    // Label present and PT-PT.
    expect(getStatusLabel("gradeState", "FAILED")).toBe("Falhou");
    // Exposed to filter options from the same source of truth.
    const options = getStatusOptions("gradeState");
    expect(options).toContainEqual({ value: "FAILED", label: "Falhou" });
    // The badge renders the destructive variant, NOT the neutral outline fallback.
    const { container } = render(<ExaminationStatusBadge kind="gradeState" status="FAILED" />);
    expect(screen.getByText("Falhou")).toBeTruthy();
    expect(container.querySelector("*")?.className ?? "").not.toMatch(/outline/);
  });
});

describe("H2.2 — every integration state is translated to PT-PT (no fallback)", () => {
  it("all gradeState values map to a PT-PT label distinct from the raw value", () => {
    for (const value of GRADE_STATES) {
      const label = getStatusLabel("gradeState", value);
      expect(label, `gradeState ${value} must be translated`).not.toBe(value);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("all progressionState values map to a PT-PT label distinct from the raw value", () => {
    for (const value of PROGRESSION_STATES) {
      const label = getStatusLabel("progressionState", value);
      expect(label, `progressionState ${value} must be translated`).not.toBe(value);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("no known integration state falls through to the raw-value badge fallback", () => {
    for (const value of GRADE_STATES) {
      cleanup();
      render(<ExaminationStatusBadge kind="gradeState" status={value} />);
      // The raw English literal must never be shown.
      expect(screen.queryByText(value)).toBeNull();
    }
  });
});
