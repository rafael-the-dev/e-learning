import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseXlsx, parseCsv } from "../file-parser.service";

const HEADERS = [
  "firstName",
  "lastName",
  "gender",
  "birthDate",
  "phone",
  "email",
  "documentType",
  "documentNumber",
  "address",
];

function buildXlsxBuffer(headers: string[], rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function csvBuffer(rows: string[]): Buffer {
  return Buffer.from([HEADERS.join(","), ...rows].join("\n"), "utf-8");
}

describe("parseXlsx", () => {
  it("parses a valid XLSX into the expected row shape", () => {
    const buffer = buildXlsxBuffer(HEADERS, [
      ["Maria", "Santos", "FEMALE", "2000-01-15", "841234567", "maria@test.com", "BI", "DOC1", "Maputo"],
    ]);

    expect(parseXlsx(buffer)).toEqual([
      {
        firstName: "Maria",
        lastName: "Santos",
        gender: "FEMALE",
        birthDate: "2000-01-15",
        phone: "841234567",
        email: "maria@test.com",
        documentType: "BI",
        documentNumber: "DOC1",
        address: "Maputo",
      },
    ]);
  });

  it("ignores fully blank rows between data rows", () => {
    const buffer = buildXlsxBuffer(HEADERS, [
      ["Maria", "Santos", "FEMALE", "2000-01-15", "", "maria@test.com", "BI", "DOC1", "Maputo"],
      [],
      ["Joao", "Pedro", "MALE", "1999-05-20", "", "joao@test.com", "BI", "DOC2", "Beira"],
    ]);

    const rows = parseXlsx(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0].firstName).toBe("Maria");
    expect(rows[1].firstName).toBe("Joao");
  });

  it("maps columns by header name regardless of column order", () => {
    const shuffledHeaders = ["address", "firstName", "documentNumber", "lastName"];
    const buffer = buildXlsxBuffer(shuffledHeaders, [["Maputo", "Maria", "DOC1", "Santos"]]);

    const rows = parseXlsx(buffer);
    expect(rows[0]).toMatchObject({
      firstName: "Maria",
      lastName: "Santos",
      address: "Maputo",
      documentNumber: "DOC1",
    });
  });

  it("ignores unknown columns without crashing", () => {
    const buffer = buildXlsxBuffer(
      [...HEADERS, "comments"],
      [
        [
          "Maria",
          "Santos",
          "FEMALE",
          "2000-01-15",
          "",
          "maria@test.com",
          "BI",
          "DOC1",
          "Maputo",
          "Aluna VIP",
        ],
      ]
    );

    const rows = parseXlsx(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("comments");
    expect(rows[0].firstName).toBe("Maria");
  });

  it("parses a genuine date-formatted cell into the same value a text date cell produces", () => {
    const textBuffer = buildXlsxBuffer(HEADERS, [
      ["Maria", "Santos", "FEMALE", "2000-01-15", "", "maria@test.com", "BI", "DOC1", "Maputo"],
    ]);
    const dateCellBuffer = buildXlsxBuffer(HEADERS, [
      [
        "Maria",
        "Santos",
        "FEMALE",
        new Date(Date.UTC(2000, 0, 15)),
        "",
        "maria@test.com",
        "BI",
        "DOC1",
        "Maputo",
      ],
    ]);

    expect(parseXlsx(dateCellBuffer)[0].birthDate).toBe("2000-01-15");
    expect(parseXlsx(dateCellBuffer)[0].birthDate).toBe(parseXlsx(textBuffer)[0].birthDate);
  });

  it("produces the same row shape as the CSV parser for equivalent input", () => {
    const xlsxBuffer = buildXlsxBuffer(HEADERS, [
      ["Maria", "Santos", "FEMALE", "2000-01-15", "841234567", "maria@test.com", "BI", "DOC1", "Maputo"],
    ]);
    const csv = csvBuffer(["Maria,Santos,FEMALE,2000-01-15,841234567,maria@test.com,BI,DOC1,Maputo"]);

    expect(parseXlsx(xlsxBuffer)).toEqual(parseCsv(csv));
  });
});
