import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  UpdateExamAppealMetadataInput,
  UpdateExamCandidateMetadataInput,
  UpdateExamPeriodMetadataInput,
  UpdateExamResultMetadataInput,
  UpdateExamSessionMetadataInput,
} from "@/modules/examinations/types/repository";

// =============================================================================
// H1 STATIC API GUARD (ADR-013 / E-6a) — metadata patch surface
// -----------------------------------------------------------------------------
// The five `Update*MetadataInput` patch types must never expose lifecycle `status`
// or any immutable ExamResult domain field. This guard has two layers:
//   1. SOURCE layer (runs under vitest): parse `types/repository.ts` and assert the
//      forbidden property keys are absent from each metadata patch declaration.
//   2. TYPE layer (enforced by `tsc --noEmit`): `@ts-expect-error` + `satisfies`
//      assertions that FAIL to compile the moment a forbidden field is reintroduced
//      (the unused directive itself becomes a tsc error).
// If someone later re-adds one of these fields, at least one layer fails automatically.
// =============================================================================

const TYPES_FILE = join(
  process.cwd(),
  "src",
  "modules",
  "examinations",
  "types",
  "repository.ts"
);
const SRC = readFileSync(TYPES_FILE, "utf8");

/** Extract an `export interface <name> { ... }` body (no nested braces in these DTOs). */
function interfaceBody(name: string): string {
  const m = SRC.match(new RegExp(`export interface ${name} \\{([^}]*)\\}`));
  expect(m, `interface ${name} not found in repository.ts`).toBeTruthy();
  return m![1];
}

/** True when `body` declares a property named exactly `key` (word-boundary anchored so
 *  e.g. `eligibilityStatus` never counts as `status`, `resultChecksum` never as `score`). */
function declaresProperty(body: string, key: string): boolean {
  return new RegExp(`\\b${key}\\s*\\??\\s*:`).test(body);
}

// Fields that must NEVER appear on any metadata patch (the review's forbidden set,
// including the instruction's `reviewerId` / `approverId` aliases).
const GLOBALLY_FORBIDDEN = [
  "status",
  "score",
  "normalizedScore",
  "resultCode",
  "markerId",
  "reviewerId",
  "approverId",
  "reviewedById",
  "approvedById",
  "currentRevisionId",
];

describe("H1 — metadata patch types expose no lifecycle/immutable field (source)", () => {
  const INTERFACE_CASES: Array<{ name: string; forbidden: string[] }> = [
    { name: "UpdateExamPeriodMetadataInput", forbidden: ["status"] },
    {
      name: "UpdateExamSessionMetadataInput",
      forbidden: ["status", "startsAt", "endsAt", "roomId"],
    },
    { name: "UpdateExamCandidateMetadataInput", forbidden: ["status"] },
    {
      name: "UpdateExamResultMetadataInput",
      forbidden: [
        "status",
        "score",
        "maxScore",
        "normalizedScore",
        "resultCode",
        "markerId",
        "reviewedById",
        "approvedById",
        "submittedAt",
        "reviewedAt",
        "approvedAt",
        "publishedAt",
        "invalidatedAt",
        "invalidationReason",
        "currentRevisionId",
      ],
    },
  ];

  for (const { name, forbidden } of INTERFACE_CASES) {
    it(`${name} declares none of its forbidden fields`, () => {
      const body = interfaceBody(name);
      for (const key of forbidden) {
        expect(declaresProperty(body, key), `${name} must not expose \`${key}\``).toBe(false);
      }
      // Belt-and-suspenders: the global forbidden set is never present either.
      for (const key of GLOBALLY_FORBIDDEN) {
        expect(declaresProperty(body, key), `${name} must not expose \`${key}\``).toBe(false);
      }
    });
  }

  it("UpdateExamAppealMetadataInput is structurally empty (Record<string, never>)", () => {
    expect(SRC).toMatch(
      /export type UpdateExamAppealMetadataInput\s*=\s*Record<string,\s*never>/
    );
    // And it is NOT re-declared as an interface with fields.
    expect(SRC).not.toMatch(/export interface UpdateExamAppealMetadataInput/);
  });

  it("the surviving metadata fields are genuine (non-lifecycle) metadata", () => {
    // Result keeps only a free-text annotation + the integration checksum.
    const result = interfaceBody("UpdateExamResultMetadataInput");
    expect(declaresProperty(result, "remarks")).toBe(true);
    expect(declaresProperty(result, "resultChecksum")).toBe(true);
  });
});

describe("H1 — forbidden fields fail to compile (type-level, enforced by tsc)", () => {
  it("rejects lifecycle/immutable fields on every metadata patch", () => {
    const rejected: unknown[] = [
      // @ts-expect-error `status` is lifecycle, not metadata (H1).
      ({ status: "OPEN" }) satisfies UpdateExamPeriodMetadataInput,
      // @ts-expect-error `status` is lifecycle, not metadata (H1).
      ({ status: "SCHEDULED" }) satisfies UpdateExamSessionMetadataInput,
      // @ts-expect-error `startsAt` is the exam window, not metadata (H1).
      ({ startsAt: new Date() }) satisfies UpdateExamSessionMetadataInput,
      // @ts-expect-error `roomId` is the sitting location, not metadata (H1).
      ({ roomId: "room-1" }) satisfies UpdateExamSessionMetadataInput,
      // @ts-expect-error `status` is lifecycle, not metadata (H1).
      ({ status: "REGISTERED" }) satisfies UpdateExamCandidateMetadataInput,
      // @ts-expect-error `status` is lifecycle, not metadata (H1).
      ({ status: "SUBMITTED" }) satisfies UpdateExamResultMetadataInput,
      // @ts-expect-error `score` is an immutable official fact (E-6a).
      ({ score: 90 }) satisfies UpdateExamResultMetadataInput,
      // @ts-expect-error `currentRevisionId` moves only via updateExamResultCurrentRevision.
      ({ currentRevisionId: "rev-1" }) satisfies UpdateExamResultMetadataInput,
      // @ts-expect-error ExamAppeal exposes no mutable metadata (H1).
      ({ status: "APPROVED" }) satisfies UpdateExamAppealMetadataInput,
    ];
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("still accepts genuine metadata", () => {
    const remarks = { remarks: "ok" } satisfies UpdateExamResultMetadataInput;
    const title = { title: "Época A" } satisfies UpdateExamSessionMetadataInput;
    const name = { name: "Época A" } satisfies UpdateExamPeriodMetadataInput;
    const seat = { assignedSeat: "A1" } satisfies UpdateExamCandidateMetadataInput;
    const emptyAppeal = {} satisfies UpdateExamAppealMetadataInput;
    expect([remarks, title, name, seat, emptyAppeal]).toHaveLength(5);
  });
});
