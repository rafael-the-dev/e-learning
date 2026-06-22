import { describe, it, expect } from "vitest";
import { validateRows, parseImportDate } from "../row-validator.service";
import type { TeacherImportRow } from "@/modules/teachers/import/types";

function makeRow(overrides: Partial<TeacherImportRow> = {}): TeacherImportRow {
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
    specialization: "Condução",
    hireDate: "2020-03-01",
    status: "ACTIVE",
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

  it("accepts a row with an empty lastName (not required for teachers)", () => {
    const result = validateRows([makeRow({ lastName: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
  });

  it("rejects an invalid email format", () => {
    const result = validateRows([makeRow({ email: "not-an-email" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
  });

  it("accepts an empty email (optional field)", () => {
    const result = validateRows([makeRow({ email: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
  });

  it("rejects an invalid phone format", () => {
    const result = validateRows([makeRow({ phone: "abc" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
  });

  it("accepts an empty phone (optional field)", () => {
    const result = validateRows([makeRow({ phone: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
  });

  it("rejects an invalid birthDate", () => {
    const result = validateRows([makeRow({ birthDate: "31/02/2000" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
    expect(result.rows[0].messages).toContain("Data de nascimento inválida");
  });

  it("rejects an invalid hireDate", () => {
    const result = validateRows([makeRow({ hireDate: "31/02/2020" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("ERROR");
    expect(result.rows[0].messages).toContain("Data de admissão inválida");
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
      "Já existe um professor com este número de documento nesta organização"
    );
  });

  it("warns (not errors) on an email duplicated within the file", () => {
    const rows = [
      makeRow({ email: "dup@example.com", documentNumber: "D1" }),
      makeRow({ email: "dup@example.com", documentNumber: "D2" }),
    ];
    const result = validateRows(rows, new Set(), new Set());
    expect(result.rows[1].state).toBe("WARNING");
    expect(result.rows[1].messages).toContain("Email duplicado no ficheiro");
  });

  it("warns (not errors) on an email that already exists in the database", () => {
    const result = validateRows(
      [makeRow({ email: "existing@example.com" })],
      new Set(),
      new Set(["existing@example.com"])
    );
    expect(result.rows[0].state).toBe("WARNING");
    expect(result.rows[0].messages).toContain(
      "Já existe um professor com este email nesta organização"
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

  it("warns (not errors) on an unrecognized status", () => {
    const result = validateRows([makeRow({ status: "ON_LEAVE" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("WARNING");
  });

  it("accepts an empty status (defaults to ACTIVE downstream, no warning)", () => {
    const result = validateRows([makeRow({ status: "" })], new Set(), new Set());
    expect(result.rows[0].state).toBe("VALID");
  });

  it("each issue carries a structured field/message/severity tuple", () => {
    const result = validateRows([makeRow({ gender: "NAOSEI" })], new Set(), new Set());
    expect(result.rows[0].issues).toEqual([
      {
        field: "gender",
        message: 'Género "NAOSEI" não reconhecido — será deixado em branco',
        severity: "WARNING",
      },
    ]);
  });

  it("computes totals across a mixed batch", () => {
    const rows = [
      makeRow({ documentNumber: "DOC1" }),
      makeRow({ gender: "UNKNOWN", documentNumber: "DOC2" }),
      makeRow({ firstName: "", documentNumber: "DOC3" }),
    ];
    const result = validateRows(rows, new Set(), new Set());
    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(1);
    expect(result.warningRows).toBe(1);
    expect(result.errorRows).toBe(1);
  });
});
