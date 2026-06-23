import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/teachers/repositories/teacher.repository", () => ({
  findExistingTeacherIdNumbers: vi.fn().mockResolvedValue(new Set()),
  findExistingTeacherEmails: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/modules/import-jobs/repositories/import-job.repository", () => ({
  createImportJob: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import {
  findExistingTeacherIdNumbers,
  findExistingTeacherEmails,
} from "@/modules/teachers/repositories/teacher.repository";
import { createImportJob } from "@/modules/import-jobs/repositories/import-job.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { ValidateTeachersImportCommand } from "../validate-teachers-import.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

const CSV_HEADER =
  "firstName,lastName,gender,birthDate,phone,email,documentType,documentNumber,address,specialization,hireDate,status";

function csvBuffer(rows: string[]): Buffer {
  return Buffer.from([CSV_HEADER, ...rows].join("\n"), "utf-8");
}

describe("ValidateTeachersImportCommand — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a user without teachers.import permission", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new ValidateTeachersImportCommand(
      {
        fileName: "professores.csv",
        fileSize: 100,
        buffer: csvBuffer([
          "Carlos,Mendes,MALE,1980-01-15,841234567,carlos@test.com,BI,123,Maputo,Condução,2020-01-01,ACTIVE",
        ]),
      },
      CTX
    );
    await expect(cmd.authorize()).rejects.toThrow();
  });
});

describe("ValidateTeachersImportCommand — file constraints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unsupported file extension", async () => {
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.txt", fileSize: 100, buffer: Buffer.from("") },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow();
  });

  it("rejects a file larger than 10MB", async () => {
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: 11 * 1024 * 1024, buffer: Buffer.from("") },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow();
  });
});

describe("ValidateTeachersImportCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses the CSV, validates rows, creates an ImportJob of type TEACHERS, and returns its jobId", async () => {
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,841234567,carlos@test.com,BI,DOC1,Maputo,Condução,2020-01-01,ACTIVE",
      "Ana,Silva,FEMALE,1985-05-20,821234567,ana@test.com,BI,DOC2,Beira,Mecânica,2021-06-15,ACTIVE",
    ]);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();

    expect(result.jobId).toBe("job-1");
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(createImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        type: "TEACHERS",
        uploadedFileName: "professores.csv",
        totalRows: 2,
        uploadedById: "user-1",
        validationSummary: { totalRows: 2, validRows: 2, warningRows: 0, errorRows: 0 },
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "import.job.created", entityId: "job-1" })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({ action: "import.job.validated", entityId: "job-1" })
    );
  });

  it("collects unique non-empty documentNumbers and emails and checks them against the DB in one call each", async () => {
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,,carlos@test.com,BI,DOC1,Maputo,,,",
      "Ana,Silva,FEMALE,1985-05-20,,outro@test.com,BI,DOC1,Beira,,,",
      "João,Costa,MALE,1990-03-10,,joao@test.com,BI,,Maputo,,,",
    ]);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    await cmd.execute();

    expect(findExistingTeacherIdNumbers).toHaveBeenCalledTimes(1);
    expect(findExistingTeacherIdNumbers).toHaveBeenCalledWith("org-1", ["DOC1"]);
    expect(findExistingTeacherEmails).toHaveBeenCalledTimes(1);
    expect(findExistingTeacherEmails).toHaveBeenCalledWith("org-1", [
      "carlos@test.com",
      "outro@test.com",
      "joao@test.com",
    ]);
  });

  it("marks rows whose documentNumber already exists in the DB as ERROR", async () => {
    (findExistingTeacherIdNumbers as Mock).mockResolvedValue(new Set(["EXISTING"]));
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,,carlos@test.com,BI,EXISTING,Maputo,,,",
    ]);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();
    expect(result.errorRows).toBe(1);
    expect(result.rows[0].state).toBe("ERROR");
  });

  it("marks rows whose email already exists in the DB as WARNING (not ERROR)", async () => {
    (findExistingTeacherEmails as Mock).mockResolvedValue(new Set(["existing@test.com"]));
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,,existing@test.com,BI,DOC1,Maputo,,,",
    ]);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();
    expect(result.errorRows).toBe(0);
    expect(result.warningRows).toBe(1);
    expect(result.rows[0].state).toBe("WARNING");
  });

  it("lowercases emails before the DB lookup, so a mixed-case upload still matches a lowercase existing entry", async () => {
    (findExistingTeacherEmails as Mock).mockResolvedValue(new Set(["existing@test.com"]));
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,,Existing@Test.com,BI,DOC1,Maputo,,,",
    ]);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();

    expect(findExistingTeacherEmails).toHaveBeenCalledWith("org-1", ["existing@test.com"]);
    expect(result.warningRows).toBe(1);
    expect(result.rows[0].messages).toContain(
      "Já existe um professor com este email nesta organização"
    );
  });

  it("warns on the second occurrence of an email duplicated within the file, regardless of case", async () => {
    (findExistingTeacherEmails as Mock).mockResolvedValue(new Set());
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,,carlos@Test.com,BI,DOC1,Maputo,,,",
      "Ana,Silva,FEMALE,1985-05-20,,carlos@test.com,BI,DOC2,Beira,,,",
    ]);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();
    expect(result.rows[0].state).toBe("VALID");
    expect(result.rows[1].state).toBe("WARNING");
    expect(result.rows[1].messages).toContain("Email duplicado no ficheiro");
  });

  it("rejects a file with more than 5000 rows", async () => {
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `Professor${i},Sobrenome,MALE,1980-01-15,,p${i}@test.com,BI,DOC${i},Maputo,,,`
    );
    const buffer = csvBuffer(rows);
    const cmd = new ValidateTeachersImportCommand(
      { fileName: "professores.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );
    await expect(cmd.execute()).rejects.toThrow();
  });
});
