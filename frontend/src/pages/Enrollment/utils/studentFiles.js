import * as XLSX from "xlsx-js-style";

const STUDENT_HEADERS = [
  "STUDENT NUMBER",
  "FIRST NAME",
  "LAST NAME",
  "YEAR",
  "SECTION",
  "SEMESTER",
  "STATUS",
];

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");

export const sanitizeFileName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}

function getStudentRows(students) {
  return [
    STUDENT_HEADERS,
    ...students.map((student) => [
      String(student.student_number ?? ""),
      String(student.first_name ?? ""),
      String(student.last_name ?? ""),
      String(student.year ?? ""),
      String(student.section ?? ""),
      String(student.semester ?? ""),
      String(student.status ?? ""),
    ]),
  ];
}

export function exportStudentsAsCsv(students, filenameBase) {
  const worksheet = XLSX.utils.aoa_to_sheet(getStudentRows(students));
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filenameBase}.csv`);
}

export function exportStudentsAsXlsx(students, filenameBase) {
  const worksheet = XLSX.utils.aoa_to_sheet(getStudentRows(students));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
  const array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

  downloadBlob(
    new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filenameBase}.xlsx`
  );
}

export async function parseStudentTemplateFile(file) {
  const filename = file.name.toLowerCase();
  let workbook;

  if (filename.endsWith(".xlsx")) {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } else if (filename.endsWith(".csv")) {
    workbook = XLSX.read(await file.text(), { type: "string" });
  } else {
    throw new Error("Only CSV and XLSX files are supported");
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The selected file is empty");

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!rows.length) throw new Error("The selected file has no data");

  const headerMap = new Map();
  (rows[0] || []).forEach((header, index) => {
    headerMap.set(normalizeHeader(header), index);
  });

  const requiredHeaders = ["student number", "first name", "last name", "year", "semester", "status"];
  if (!requiredHeaders.every((header) => headerMap.has(header))) {
    throw new Error("Invalid student template headers");
  }

  const getCell = (row, header) => row[headerMap.get(header)] ?? "";
  const parsedStudents = rows
    .slice(1)
    .map((row) => ({
      student_number: String(getCell(row, "student number")).trim(),
      first_name: String(getCell(row, "first name")).trim(),
      last_name: String(getCell(row, "last name")).trim(),
      year: String(getCell(row, "year")).trim(),
      semester: String(getCell(row, "semester")).trim(),
      status: String(getCell(row, "status")).trim() || "Enrolled",
    }))
    .filter((student) => student.student_number);

  if (!parsedStudents.length) throw new Error("No student rows found in file");
  return parsedStudents;
}
