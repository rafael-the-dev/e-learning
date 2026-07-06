import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, type FakeDb } from "./_fake-db";
import * as snapshotRepo from "../academic-transcript-snapshot.repository";
import {
  createAssessmentSnapshots,
  createAttendanceSnapshots,
  createLevelSnapshots,
  createSubjectSnapshots,
  findAssessmentSnapshotsBySubjectId,
  findSnapshotTreeByVersionId,
} from "../academic-transcript-snapshot.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";
const VER = "version-1";

let db: FakeDb;

beforeEach(() => {
  db = makeFakeDb();
});

async function buildTree(versionId = VER, organizationId = ORG_A) {
  const [lvlB, lvlA] = await createLevelSnapshots(
    {
      organizationId,
      transcriptVersionId: versionId,
      // deliberately inserted out of order to prove ordering-by-levelOrder
      levels: [
        { levelName: "Nível 2", levelOrder: 2, status: "IN_PROGRESS" },
        { levelName: "Nível 1", levelOrder: 1, status: "PASSED" },
      ],
    },
    asClient(db)
  );
  // NOTE: createLevelSnapshots returns rows in input order; find below re-sorts.
  const level2 = lvlB;
  const level1 = lvlA;

  const subjects = await createSubjectSnapshots(
    {
      organizationId,
      transcriptVersionId: versionId,
      subjects: [
        {
          transcriptLevelId: level1.id,
          subjectName: "Código",
          subjectOrder: 2,
          status: "PASSED",
          isRequired: true,
        },
        {
          transcriptLevelId: level1.id,
          subjectName: "Condução",
          subjectOrder: 1,
          status: "IN_PROGRESS",
          isRequired: true,
        },
      ],
    },
    asClient(db)
  );
  const subjCodigo = subjects.find((s) => s.subjectName === "Código")!;
  const subjConducao = subjects.find((s) => s.subjectName === "Condução")!;

  await createAssessmentSnapshots(
    {
      organizationId,
      assessments: [
        {
          transcriptSubjectId: subjCodigo.id,
          componentName: "Teste 1",
          sourceType: "CONTINUOUS",
          grade: 14,
          maxGrade: 20,
          normalizedGrade: 14,
          status: "GRADED",
          isRecovery: false,
        },
      ],
    },
    asClient(db)
  );

  await createAttendanceSnapshots(
    {
      organizationId,
      transcriptVersionId: versionId,
      attendances: [
        // subject-grain
        {
          transcriptSubjectId: subjConducao.id,
          totalSessions: 10,
          totalPresentMinutes: 500,
          totalScheduledMinutes: 600,
          status: "SUFFICIENT",
        },
        // version/period-grain (no subject)
        {
          transcriptSubjectId: null,
          totalSessions: 40,
          totalPresentMinutes: 2000,
          totalScheduledMinutes: 2400,
          status: "GOOD",
        },
      ],
    },
    asClient(db)
  );

  return { level1, level2, subjCodigo, subjConducao };
}

describe("academic-transcript-snapshot.repository — creates (test #15)", () => {
  it("creates level/subject/assessment/attendance snapshot rows with generated ids", async () => {
    const { subjCodigo } = await buildTree();
    expect(subjCodigo.id).toBeTruthy();

    const assessments = await findAssessmentSnapshotsBySubjectId(
      { organizationId: ORG_A, transcriptSubjectId: subjCodigo.id },
      asClient(db)
    );
    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toMatchObject({ componentName: "Teste 1", grade: 14, maxGrade: 20 });
  });
});

describe("academic-transcript-snapshot.repository — tree read is org-scoped + deterministic (tests #4, #16)", () => {
  it("assembles levels→subjects→assessments in deterministic order, nesting attendance", async () => {
    await buildTree();
    const tree = await findSnapshotTreeByVersionId(
      { organizationId: ORG_A, transcriptVersionId: VER },
      asClient(db)
    );

    // levels ordered by levelOrder asc
    expect(tree.levels.map((l) => l.levelOrder)).toEqual([1, 2]);

    const level1 = tree.levels[0];
    // subjects ordered by subjectOrder asc
    expect(level1.subjects.map((s) => s.subjectOrder)).toEqual([1, 2]);

    const conducao = level1.subjects.find((s) => s.subjectName === "Condução")!;
    const codigo = level1.subjects.find((s) => s.subjectName === "Código")!;

    // assessments nested under their subject
    expect(codigo.assessments).toHaveLength(1);
    expect(conducao.assessments).toHaveLength(0);

    // subject-grain attendance nested; version-grain surfaced at top level
    expect(conducao.attendances).toHaveLength(1);
    expect(conducao.attendances[0].status).toBe("SUFFICIENT");
    expect(tree.attendances).toHaveLength(1);
    expect(tree.attendances[0].status).toBe("GOOD");
    expect(tree.attendances[0].transcriptSubjectId).toBeNull();
  });

  it("does not read another org's snapshot tree (test #4)", async () => {
    await buildTree(VER, ORG_A);
    const tree = await findSnapshotTreeByVersionId(
      { organizationId: ORG_B, transcriptVersionId: VER },
      asClient(db)
    );
    expect(tree.levels).toHaveLength(0);
    expect(tree.attendances).toHaveLength(0);
  });
});

describe("academic-transcript-snapshot.repository — append-only surface (test #8)", () => {
  it("exports create/read helpers ONLY — no update/delete/upsert methods", () => {
    const exported = Object.keys(snapshotRepo).filter(
      (k) => typeof (snapshotRepo as Record<string, unknown>)[k] === "function"
    );
    // there is at least the create + read set
    expect(exported.length).toBeGreaterThan(0);
    for (const name of exported) {
      expect(name).toMatch(/^(create|find)/);
      expect(name).not.toMatch(/update|delete|upsert|remove|destroy/i);
    }
  });
});
