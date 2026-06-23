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
  "specialization",
  "hireDate",
  "status",
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
      [
        "Carlos",
        "Mendes",
        "MALE",
        "1980-01-15",
        "841234567",
        "carlos@test.com",
        "BI",
        "DOC1",
        "Maputo",
        "Condução",
        "2020-03-01",
        "ACTIVE",
      ],
    ]);

    expect(parseXlsx(buffer)).toEqual([
      {
        firstName: "Carlos",
        lastName: "Mendes",
        gender: "MALE",
        birthDate: "1980-01-15",
        phone: "841234567",
        email: "carlos@test.com",
        documentType: "BI",
        documentNumber: "DOC1",
        address: "Maputo",
        specialization: "Condução",
        hireDate: "2020-03-01",
        status: "ACTIVE",
      },
    ]);
  });

  it("ignores fully blank rows between data rows", () => {
    const buffer = buildXlsxBuffer(HEADERS, [
      [
        "Carlos",
        "Mendes",
        "MALE",
        "1980-01-15",
        "",
        "carlos@test.com",
        "BI",
        "DOC1",
        "Maputo",
        "",
        "",
        "ACTIVE",
      ],
      [],
      [
        "Ana",
        "Silva",
        "FEMALE",
        "1985-05-20",
        "",
        "ana@test.com",
        "BI",
        "DOC2",
        "Beira",
        "",
        "",
        "ACTIVE",
      ],
    ]);

    const rows = parseXlsx(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0].firstName).toBe("Carlos");
    expect(rows[1].firstName).toBe("Ana");
  });

  it("maps columns by header name regardless of column order", () => {
    const shuffledHeaders = ["specialization", "firstName", "documentNumber", "lastName"];
    const buffer = buildXlsxBuffer(shuffledHeaders, [["Condução", "Carlos", "DOC1", "Mendes"]]);

    const rows = parseXlsx(buffer);
    expect(rows[0]).toMatchObject({
      firstName: "Carlos",
      lastName: "Mendes",
      specialization: "Condução",
      documentNumber: "DOC1",
    });
  });

  it("ignores unknown columns without crashing", () => {
    const buffer = buildXlsxBuffer(
      [...HEADERS, "comments"],
      [
        [
          "Carlos",
          "Mendes",
          "MALE",
          "1980-01-15",
          "",
          "carlos@test.com",
          "BI",
          "DOC1",
          "Maputo",
          "Condução",
          "2020-03-01",
          "ACTIVE",
          "Professor experiente",
        ],
      ]
    );

    const rows = parseXlsx(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("comments");
    expect(rows[0].firstName).toBe("Carlos");
  });

  it("parses genuine date-formatted birthDate/hireDate cells into the same value text date cells produce", () => {
    const textBuffer = buildXlsxBuffer(HEADERS, [
      [
        "Carlos",
        "Mendes",
        "MALE",
        "1980-01-15",
        "",
        "carlos@test.com",
        "BI",
        "DOC1",
        "Maputo",
        "Condução",
        "2020-03-01",
        "ACTIVE",
      ],
    ]);
    const dateCellBuffer = buildXlsxBuffer(HEADERS, [
      [
        "Carlos",
        "Mendes",
        "MALE",
        new Date(Date.UTC(1980, 0, 15)),
        "",
        "carlos@test.com",
        "BI",
        "DOC1",
        "Maputo",
        "Condução",
        new Date(Date.UTC(2020, 2, 1)),
        "ACTIVE",
      ],
    ]);

    const dateRow = parseXlsx(dateCellBuffer)[0];
    const textRow = parseXlsx(textBuffer)[0];

    expect(dateRow.birthDate).toBe("1980-01-15");
    expect(dateRow.hireDate).toBe("2020-03-01");
    expect(dateRow.birthDate).toBe(textRow.birthDate);
    expect(dateRow.hireDate).toBe(textRow.hireDate);
  });

  it("produces the same row shape as the CSV parser for equivalent input", () => {
    const xlsxBuffer = buildXlsxBuffer(HEADERS, [
      [
        "Carlos",
        "Mendes",
        "MALE",
        "1980-01-15",
        "841234567",
        "carlos@test.com",
        "BI",
        "DOC1",
        "Maputo",
        "Condução",
        "2020-03-01",
        "ACTIVE",
      ],
    ]);
    const csv = csvBuffer([
      "Carlos,Mendes,MALE,1980-01-15,841234567,carlos@test.com,BI,DOC1,Maputo,Condução,2020-03-01,ACTIVE",
    ]);

    expect(parseXlsx(xlsxBuffer)).toEqual(parseCsv(csv));
  });
});
