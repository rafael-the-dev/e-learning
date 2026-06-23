import { describe, it, expect } from "vitest";
import { validateRows, parseImportDate } from "../row-validator.service";
import type { StudentImportRow } from "@/modules/students/import/types";

function makeRow(overrides: Partial<StudentImportRow> = {}): StudentImportRow {
  return {
    firstName: "Maria",
    lastName: "Santos",
    gender: "FEMALE",
    birthDate: "2000-01-15",
    phone: "841234567",
    email: "maria@example.com",
    documentType: "BI",
    documentNumber: "123456789",
    address: "Maputo",
    ...overrides,
  };
}

describe("parseImportDate", () => {
  it("parses ISO dates", () => {
    expect(parseImportDate("2000-01-15")).not.toBeNull();
  });

  it("parses pt-PT DD/MM/YYYY dates", () => {
    expect(parseImportDate("15/01/2000")).not.toBeNull();
  });

  it("rejects an invalid date", () => {
    expect(parseImportDate("2000-13-40")).toBeNull();
    expect(parseImportDate("31/02/2000")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseImportDate("")).toBeNull();
  });
});

describe("validateRows", () => {
  it("marks a fully valid row as VALID", () => {
    const result = validateRows([makeRow()], new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
    expect(result.validRows).toBe(1);
    expect(result.errorRows).toBe(0);
    expect(result.warningRows).toBe(0);
  });

  it("rejects a row missing firstName", () => {
    const result = validateRows([makeRow({ firstName: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
    expect(result.rows[0].messages.length).toBeGreaterThan(0);
  });

  it("rejects a row missing lastName", () => {
    const result = validateRows([makeRow({ lastName: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
  });

  it("rejects an invalid email format", () => {
    const result = validateRows([makeRow({ email: "not-an-email" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
  });

  it("accepts an empty email (optional field)", () => {
    const result = validateRows([makeRow({ email: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
  });

  it("rejects an invalid birthDate", () => {
    const result = validateRows([makeRow({ birthDate: "31/02/2000" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
    expect(result.rows[0].messages).toContain("Data de nascimento inválida");
  });

  it("rejects the second occurrence of a documentNumber duplicated within the file", () => {
    const rows = [
      makeRow({ documentNumber: "DUP1" }),
      makeRow({ documentNumber: "DUP1" }),
    ];
    const result = validateRows(rows, new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
    expect(result.rows[1].state).toBe("ERROR");
    expect(result.rows[1].messages).toContain("Número de documento duplicado no ficheiro");
  });

  it("rejects a documentNumber that already exists in the database", () => {
    const result = validateRows(
      [makeRow({ documentNumber: "EXISTING" })],
      new Set(["EXISTING"]),
      new Set()
    );
    expect(result.rows[0].state).toBe("ERROR");
    expect(result.rows[0].messages).toContain(
      "Já existe um aluno com este número de documento nesta organização"
    );
  });

  it("warns (not errors) on an unrecognized gender", () => {
    const result = validateRows([makeRow({ gender: "NAOSEI" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("WARNING");
    expect(result.warningRows).toBe(1);
    expect(result.errorRows).toBe(0);
  });

  it("warns (not errors) on an unrecognized documentType", () => {
    const result = validateRows([makeRow({ documentType: "OUTRO_TIPO" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("WARNING");
  });

  it("computes totals across a mixed batch", () => {
    const rows = [
      makeRow(),
      makeRow({ gender: "UNKNOWN", documentNumber: "DOC2" }),
      makeRow({ firstName: "", documentNumber: "DOC3" }),
    ];
    const result = validateRows(rows, new Set(), new Set());
    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(1);
    expect(result.warningRows).toBe(1);
    expect(result.errorRows).toBe(1);
  });

  describe("email duplicate detection — case-insensitive", () => {
    it("warns (not errors) on the second occurrence of an email duplicated within the file, regardless of case", () => {
      const rows = [
        makeRow({ email: "carlos@Test.com", documentNumber: "DOC1" }),
        makeRow({ email: "carlos@test.com", documentNumber: "DOC2" }),
      ];
      const result = validateRows(rows, new Set(), new Set());
      expect(result.rows[0].state).toBe("VALID");
      expect(result.rows[1].state).toBe("WARNING");
      expect(result.rows[1].messages).toContain("Email duplicado no ficheiro");
      expect(result.errorRows).toBe(0);
    });

    it("warns when an uploaded email matches an existing DB email of different case", () => {
      // existingEmails is always pre-lowercased by the repository (e.g. a DB
      // row stored as "Carlos@Test.com" is returned here as "carlos@test.com").
      const result = validateRows(
        [makeRow({ email: "CARLOS@TEST.COM", documentNumber: "DOC1" })],
        new Set(),
        new Set(["carlos@test.com"])
      );
      expect(result.rows[0].state).toBe("WARNING");
      expect(result.rows[0].messages).toContain(
        "Já existe um aluno com este email nesta organização"
      );
    });

    it("ignores surrounding whitespace when comparing emails", () => {
      const result = validateRows(
        [makeRow({ email: "  carlos@test.com  ", documentNumber: "DOC1" })],
        new Set(),
        new Set(["carlos@test.com"])
      );
      expect(result.rows[0].state).toBe("WARNING");
      expect(result.rows[0].messages).toContain(
        "Já existe um aluno com este email nesta organização"
      );
    });
  });
});
