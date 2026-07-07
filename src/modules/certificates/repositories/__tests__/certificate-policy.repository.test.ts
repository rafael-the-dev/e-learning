import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed } from "./_fake-db";
import {
  createCertificatePolicy,
  findCertificatePolicyById,
  findCourseOverridePolicy,
  findDefaultActivePolicy,
  listCertificatePolicies,
  softDeleteCertificatePolicy,
  updateCertificatePolicyMetadata,
} from "../certificate-policy.repository";

const ORG = "org-A";
const OTHER = "org-B";

describe("certificate-policy repository", () => {
  it("6. creates a policy (org-scoped, returns a record)", async () => {
    const db = makeFakeDb();
    const rec = await createCertificatePolicy(
      { organizationId: ORG, name: "Conclusão", certificateType: "COURSE_COMPLETION", status: "ACTIVE" },
      asClient(db)
    );
    expect(rec.organizationId).toBe(ORG);
    expect(rec.certificateType).toBe("COURSE_COMPLETION");
    expect(rec.status).toBe("ACTIVE");
  });

  it("7. finds the default active policy (courseId null, ACTIVE, not deleted)", async () => {
    const db = makeFakeDb();
    seed(db, "certificatePolicy", {
      id: "p-def",
      organizationId: ORG,
      certificateType: "COURSE_COMPLETION",
      courseId: null,
      status: "ACTIVE",
      deletedAt: null,
    });
    // An INACTIVE default and a course override must NOT be picked.
    seed(db, "certificatePolicy", {
      id: "p-inactive",
      organizationId: ORG,
      certificateType: "COURSE_COMPLETION",
      courseId: null,
      status: "INACTIVE",
    });
    const rec = await findDefaultActivePolicy(
      { organizationId: ORG, certificateType: "COURSE_COMPLETION" },
      asClient(db)
    );
    expect(rec?.id).toBe("p-def");
  });

  it("8. finds the course-override policy", async () => {
    const db = makeFakeDb();
    seed(db, "certificatePolicy", {
      id: "p-course",
      organizationId: ORG,
      certificateType: "COURSE_COMPLETION",
      courseId: "course-1",
      status: "ACTIVE",
      deletedAt: null,
    });
    const rec = await findCourseOverridePolicy(
      { organizationId: ORG, certificateType: "COURSE_COMPLETION", courseId: "course-1" },
      asClient(db)
    );
    expect(rec?.id).toBe("p-course");
  });

  it("9. lists by type / status / course", async () => {
    const db = makeFakeDb();
    seed(db, "certificatePolicy", { id: "a", organizationId: ORG, certificateType: "COURSE_COMPLETION", status: "ACTIVE", courseId: null });
    seed(db, "certificatePolicy", { id: "b", organizationId: ORG, certificateType: "ATTENDANCE", status: "ACTIVE", courseId: null });
    seed(db, "certificatePolicy", { id: "c", organizationId: ORG, certificateType: "COURSE_COMPLETION", status: "INACTIVE", courseId: "course-9" });

    const byType = await listCertificatePolicies({ organizationId: ORG, certificateType: "COURSE_COMPLETION" }, asClient(db));
    expect(byType.map((p) => p.id).sort()).toEqual(["a", "c"]);
    const byStatus = await listCertificatePolicies({ organizationId: ORG, status: "ACTIVE" }, asClient(db));
    expect(byStatus.map((p) => p.id).sort()).toEqual(["a", "b"]);
    const byCourse = await listCertificatePolicies({ organizationId: ORG, courseId: "course-9" }, asClient(db));
    expect(byCourse.map((p) => p.id)).toEqual(["c"]);
  });

  it("10. soft delete hides the policy from lists by default", async () => {
    const db = makeFakeDb();
    seed(db, "certificatePolicy", { id: "p1", organizationId: ORG, certificateType: "COURSE_COMPLETION", status: "ACTIVE", deletedAt: null });
    const del = await softDeleteCertificatePolicy({ id: "p1", organizationId: ORG }, asClient(db));
    expect(del.count).toBe(1);
    expect(await listCertificatePolicies({ organizationId: ORG }, asClient(db))).toHaveLength(0);
    expect(await listCertificatePolicies({ organizationId: ORG, includeDeleted: true }, asClient(db))).toHaveLength(1);
    // second delete is a no-op (already deleted)
    expect((await softDeleteCertificatePolicy({ id: "p1", organizationId: ORG }, asClient(db))).count).toBe(0);
  });

  it("1/3. find + list are tenant-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificatePolicy", { id: "p1", organizationId: OTHER, certificateType: "COURSE_COMPLETION", status: "ACTIVE" });
    expect(await findCertificatePolicyById({ id: "p1", organizationId: ORG }, asClient(db))).toBeNull();
    expect(await listCertificatePolicies({ organizationId: ORG }, asClient(db))).toHaveLength(0);
  });

  it("2. update metadata cannot touch another org's policy", async () => {
    const db = makeFakeDb();
    seed(db, "certificatePolicy", { id: "p1", organizationId: OTHER, certificateType: "COURSE_COMPLETION", status: "ACTIVE" });
    const res = await updateCertificatePolicyMetadata({ id: "p1", organizationId: ORG, status: "ARCHIVED" }, asClient(db));
    expect(res.count).toBe(0);
    const other = await findCertificatePolicyById({ id: "p1", organizationId: OTHER }, asClient(db));
    expect(other?.status).toBe("ACTIVE");
  });
});
