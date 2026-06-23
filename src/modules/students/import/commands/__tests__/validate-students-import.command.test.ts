import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn().mockResolvedValue(new Set()),
  createAbility: vi.fn().mockReturnValue({ can: vi.fn().mockReturnValue(true) }),
}));

vi.mock("@/modules/students/repositories/student.repository", () => ({
  findExistingIdNumbers: vi.fn().mockResolvedValue(new Set()),
  findExistingEmails: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/modules/import-jobs/repositories/import-job.repository", () => ({
  createImportJob: vi.fn(),
}));

vi.mock("@/modules/audit-logs/services/audit.service", () => ({
  auditService: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { createAbility } from "@/server/auth/rbac";
import {
  findExistingIdNumbers,
  findExistingEmails,
} from "@/modules/students/repositories/student.repository";
import { createImportJob } from "@/modules/import-jobs/repositories/import-job.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { ValidateStudentsImportCommand } from "../validate-students-import.command";

const CTX = { userId: "user-1", organizationId: "org-1" };

const CSV_HEADER = "firstName,lastName,gender,birthDate,phone,email,documentType,documentNumber,address";

function csvBuffer(rows: string[]): Buffer {
  return Buffer.from([CSV_HEADER, ...rows].join("\n"), "utf-8");
}

describe("ValidateStudentsImportCommand — authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a user without students.import permission", async () => {
    (createAbility as Mock).mockReturnValue({ can: vi.fn().mockReturnValue(false) });
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: 100, buffer: csvBuffer(["Maria,Santos,FEMALE,2000-01-15,,maria@test.com,BI,123,Maputo"]) },
      CTX
    );
    await expect(cmd.authorize()).rejects.toThrow();
  });
});

describe("ValidateStudentsImportCommand — file constraints", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unsupported file extension", async () => {
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.txt", fileSize: 100, buffer: Buffer.from("") },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow();
  });

  it("rejects a file larger than 10MB", async () => {
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: 11 * 1024 * 1024, buffer: Buffer.from("") },
      CTX
    );
    await expect(cmd.validate()).rejects.toThrow();
  });
});

describe("ValidateStudentsImportCommand — execute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("parses the CSV, validates rows, creates an ImportJob, and returns its jobId", async () => {
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Maria,Santos,FEMALE,2000-01-15,841234567,maria@test.com,BI,DOC1,Maputo",
      "João,Pedro,MALE,1999-05-20,821234567,joao@test.com,BI,DOC2,Beira",
    ]);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();

    expect(result.jobId).toBe("job-1");
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(createImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        type: "STUDENTS",
        uploadedFileName: "alunos.csv",
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

  it("collects unique non-empty documentNumbers and checks them against the DB in one call", async () => {
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Maria,Santos,FEMALE,2000-01-15,,maria@test.com,BI,DOC1,Maputo",
      "João,Pedro,MALE,1999-05-20,,joao@test.com,BI,DOC1,Beira",
      "Ana,Costa,FEMALE,1998-03-10,,ana@test.com,BI,,Maputo",
    ]);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    await cmd.execute();

    expect(findExistingIdNumbers).toHaveBeenCalledTimes(1);
    expect(findExistingIdNumbers).toHaveBeenCalledWith("org-1", ["DOC1"]);
  });

  it("collects unique non-empty emails, lowercased, and checks them against the DB in one call", async () => {
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Maria,Santos,FEMALE,2000-01-15,,Carlos@Test.com,BI,DOC1,Maputo",
      "João,Pedro,MALE,1999-05-20,,carlos@test.com,BI,DOC2,Beira",
      "Ana,Costa,FEMALE,1998-03-10,,,BI,DOC3,Maputo",
    ]);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    await cmd.execute();

    expect(findExistingEmails).toHaveBeenCalledTimes(1);
    expect(findExistingEmails).toHaveBeenCalledWith("org-1", ["carlos@test.com"]);
  });

  it("marks rows whose documentNumber already exists in the DB as ERROR", async () => {
    (findExistingIdNumbers as Mock).mockResolvedValue(new Set(["EXISTING"]));
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Maria,Santos,FEMALE,2000-01-15,,maria@test.com,BI,EXISTING,Maputo",
    ]);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();
    expect(result.errorRows).toBe(1);
    expect(result.rows[0].state).toBe("ERROR");
  });

  it("warns (not errors) when an uploaded email matches an existing DB email of different case", async () => {
    (findExistingEmails as Mock).mockResolvedValue(new Set(["carlos@test.com"]));
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Maria,Santos,FEMALE,2000-01-15,,CARLOS@TEST.COM,BI,DOC1,Maputo",
    ]);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );

    const result = await cmd.execute();
    expect(result.errorRows).toBe(0);
    expect(result.warningRows).toBe(1);
    expect(result.rows[0].state).toBe("WARNING");
    expect(result.rows[0].messages).toContain("Já existe um aluno com este email nesta organização");
  });

  it("warns (not errors) on the second occurrence of an email duplicated within the file, regardless of case", async () => {
    (findExistingEmails as Mock).mockResolvedValue(new Set());
    (createImportJob as Mock).mockResolvedValue({ id: "job-1" });

    const buffer = csvBuffer([
      "Maria,Santos,FEMALE,2000-01-15,,carlos@Test.com,BI,DOC1,Maputo",
      "João,Pedro,MALE,1999-05-20,,carlos@test.com,BI,DOC2,Beira",
    ]);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
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
      (_, i) => `Aluno${i},Sobrenome,MALE,2000-01-15,,a${i}@test.com,BI,DOC${i},Maputo`
    );
    const buffer = csvBuffer(rows);
    const cmd = new ValidateStudentsImportCommand(
      { fileName: "alunos.csv", fileSize: buffer.byteLength, buffer },
      CTX
    );
    await expect(cmd.execute()).rejects.toThrow();
  });
});
