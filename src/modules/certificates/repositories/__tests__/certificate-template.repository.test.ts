import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed } from "./_fake-db";
import {
  createCertificateTemplate,
  findCertificateTemplateById,
  findCourseOverrideTemplate,
  findDefaultActiveTemplate,
  listCertificateTemplates,
  softDeleteCertificateTemplate,
} from "../certificate-template.repository";

const ORG = "org-A";
const OTHER = "org-B";

describe("certificate-template repository", () => {
  it("11. creates a template (layoutJson stored opaque)", async () => {
    const db = makeFakeDb();
    const rec = await createCertificateTemplate(
      {
        organizationId: ORG,
        name: "Modelo Oficial",
        certificateType: "COURSE_COMPLETION",
        layoutJson: '{"blocks":[]}',
        language: "pt-PT",
        status: "ACTIVE",
      },
      asClient(db)
    );
    expect(rec.layoutJson).toBe('{"blocks":[]}');
    expect(rec.language).toBe("pt-PT");
  });

  it("12. finds the default active template (courseId null, ACTIVE, by language)", async () => {
    const db = makeFakeDb();
    seed(db, "certificateTemplate", {
      id: "t-pt",
      organizationId: ORG,
      certificateType: "COURSE_COMPLETION",
      language: "pt-PT",
      courseId: null,
      status: "ACTIVE",
      deletedAt: null,
    });
    seed(db, "certificateTemplate", {
      id: "t-en",
      organizationId: ORG,
      certificateType: "COURSE_COMPLETION",
      language: "en",
      courseId: null,
      status: "ACTIVE",
      deletedAt: null,
    });
    const rec = await findDefaultActiveTemplate(
      { organizationId: ORG, certificateType: "COURSE_COMPLETION", language: "pt-PT" },
      asClient(db)
    );
    expect(rec?.id).toBe("t-pt");
  });

  it("13. finds the course-override template", async () => {
    const db = makeFakeDb();
    seed(db, "certificateTemplate", {
      id: "t-course",
      organizationId: ORG,
      certificateType: "COURSE_COMPLETION",
      courseId: "course-1",
      language: "pt-PT",
      status: "ACTIVE",
      deletedAt: null,
    });
    const rec = await findCourseOverrideTemplate(
      { organizationId: ORG, certificateType: "COURSE_COMPLETION", courseId: "course-1", language: "pt-PT" },
      asClient(db)
    );
    expect(rec?.id).toBe("t-course");
  });

  it("14. lists by language / type / status", async () => {
    const db = makeFakeDb();
    seed(db, "certificateTemplate", { id: "a", organizationId: ORG, certificateType: "COURSE_COMPLETION", language: "pt-PT", status: "ACTIVE" });
    seed(db, "certificateTemplate", { id: "b", organizationId: ORG, certificateType: "COURSE_COMPLETION", language: "en", status: "ACTIVE" });
    seed(db, "certificateTemplate", { id: "c", organizationId: ORG, certificateType: "ATTENDANCE", language: "pt-PT", status: "INACTIVE" });

    expect((await listCertificateTemplates({ organizationId: ORG, language: "pt-PT" }, asClient(db))).map((t) => t.id).sort()).toEqual(["a", "c"]);
    expect((await listCertificateTemplates({ organizationId: ORG, certificateType: "COURSE_COMPLETION" }, asClient(db))).map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect((await listCertificateTemplates({ organizationId: ORG, status: "INACTIVE" }, asClient(db))).map((t) => t.id)).toEqual(["c"]);
  });

  it("15. soft delete hides the template from lists by default", async () => {
    const db = makeFakeDb();
    seed(db, "certificateTemplate", { id: "t1", organizationId: ORG, certificateType: "COURSE_COMPLETION", language: "pt-PT", status: "ACTIVE", deletedAt: null });
    expect((await softDeleteCertificateTemplate({ id: "t1", organizationId: ORG }, asClient(db))).count).toBe(1);
    expect(await listCertificateTemplates({ organizationId: ORG }, asClient(db))).toHaveLength(0);
    expect(await listCertificateTemplates({ organizationId: ORG, includeDeleted: true }, asClient(db))).toHaveLength(1);
  });

  it("is tenant-scoped for find and list", async () => {
    const db = makeFakeDb();
    seed(db, "certificateTemplate", { id: "t1", organizationId: OTHER, certificateType: "COURSE_COMPLETION", language: "pt-PT", status: "ACTIVE" });
    expect(await findCertificateTemplateById({ id: "t1", organizationId: ORG }, asClient(db))).toBeNull();
    expect(await listCertificateTemplates({ organizationId: ORG }, asClient(db))).toHaveLength(0);
  });
});
