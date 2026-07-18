// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/shared/hooks/use-toast", () => ({ toast: vi.fn() }));

import { IntegrationStatusCard } from "../integration-status-card";
import type {
  ExamGradeBindingDto,
  ExamIntegrationStatusDto,
} from "@/modules/examinations/types/portal";

const binding: ExamGradeBindingDto = {
  examSessionId: "sess-1",
  levelSubjectId: "ls-1",
  bindingId: "b-1",
  assessmentComponentId: "c-1",
  componentName: "Componente Teórico",
  componentMaxGrade: 20,
  examMaxScore: 20,
  compatible: true,
  consumed: false,
  canBind: false,
  canRebind: true,
  blockers: [],
};

const status: ExamIntegrationStatusDto = {
  examSessionId: "sess-1",
  results: [
    {
      examResultId: "r-1",
      currentRevisionId: null,
      officialVersion: "result:r-1",
      resultCode: "SCORED",
      gradeState: "STALE",
      progressionState: "REQUIRES_RECALCULATION",
      supported: true,
      latestIntegratedVersion: null,
      latestIntegratedAt: null,
      lastErrorCode: null,
      canIntegrate: true,
      canReconcile: false,
    },
  ],
  summary: { total: 1, current: 0, missing: 0, stale: 1, unsupported: 0, failed: 0 },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(String(url).includes("integration-status") ? status : binding),
      } as Response),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("H2.2 — IntegrationStatusCard renders no English in tiles or captions", () => {
  it("shows PT-PT tile labels and never the raw English summary keys", async () => {
    render(<IntegrationStatusCard binding={binding} status={status} />);
    await waitFor(() => expect(screen.getByText("Falhou")).toBeTruthy());

    // Every tile label is PT-PT (some also appear as the row badge — hence getAllByText).
    for (const label of ["Atual", "Em falta", "Desatualizado", "Não suportado", "Falhou"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // No raw English summary keys leak.
    for (const raw of ["failed", "Failed", "unsupported", "Unsupported", "stale", "Stale"]) {
      expect(screen.queryByText(raw)).toBeNull();
    }
  });

  it("shows the progressionState caption in PT-PT, not the raw domain value", async () => {
    render(<IntegrationStatusCard binding={binding} status={status} />);
    await waitFor(() => expect(screen.getByText("Requer recálculo")).toBeTruthy());
    expect(screen.queryByText("REQUIRES_RECALCULATION")).toBeNull();
  });
});
