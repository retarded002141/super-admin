import * as XLSX from "xlsx-js-style";

/**
 * Convert nested JSON to curriculum template CSV format.
 */
export function jsonToCsv(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid curriculum data format");
  }

  const rows = buildSplitTemplateRows(data[0] || {});
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

/**
 * Convert nested JSON to template XLSX (returns Blob).
 */
export function jsonToXlsxBlob(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid curriculum data format");
  }

  const rows = buildSplitTemplateRows(data[0] || {});
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Curriculum");

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Convert CSV to nested JSON format compatible with curriculum_1st_year.json
 */
export function csvToJson(csvContent) {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("CSV must have headers and at least one data row");
  }

  const rows = lines.map((line) => parseCsvLine(line));
  const splitTemplateParsed = parseSplitTemplateRows(rows);
  if (splitTemplateParsed) {
    return [splitTemplateParsed];
  }

  const templateParsed = parseTemplateCsv(rows);
  if (templateParsed) {
    return [templateParsed];
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const dataRow = parseCsvLine(lines[1]);

  if (dataRow.length !== headers.length) {
    throw new Error("CSV data row length does not match header count");
  }

  // Build nested object from flat CSV structure
  const result = {};

  headers.forEach((header, index) => {
    const value = dataRow[index];
    setNestedProperty(result, header, value);
  });

  return Array.isArray(result) ? result : [result];
}

/**
 * Convert template XLSX file content (ArrayBuffer) to nested JSON.
 */
export function xlsxToJson(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("XLSX file is empty");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const splitTemplateParsed = parseSplitTemplateRows(rows);
  if (splitTemplateParsed) {
    return [splitTemplateParsed];
  }

  const templateParsed = parseTemplateCsv(rows);
  if (templateParsed) {
    return [templateParsed];
  }

  throw new Error("Unsupported XLSX format");
}

function buildSplitTemplateRows(doc) {
  const yearLabel = toYearLabel(doc?.year);
  const semesters = Array.isArray(doc?.semesters) ? doc.semesters : [];
  const first = Array.isArray(semesters[0]?.subjects) ? semesters[0].subjects : [];
  const second = Array.isArray(semesters[1]?.subjects) ? semesters[1].subjects : [];
  const maxRows = Math.max(first.length, second.length);

  const rows = [
    [yearLabel],
    ["FIRST SEMESTER", "", "", "", "", "", "SECOND SEMESTER"],
    ["", "Code", "Title", "Lec", "Lab", "Units", "", "Code", "Title", "Lec", "Lab", "Units"],
  ];

  let lec1 = 0;
  let lab1 = 0;
  let units1 = 0;
  let lec2 = 0;
  let lab2 = 0;
  let units2 = 0;

  for (let i = 0; i < maxRows; i++) {
    const left = first[i] || null;
    const right = second[i] || null;

    const leftLec = Number(left?.lecture ?? 0);
    const leftLab = Number(left?.laboratory ?? 0);
    const leftUnits = Number(left?.units ?? 0);
    const rightLec = Number(right?.lecture ?? 0);
    const rightLab = Number(right?.laboratory ?? 0);
    const rightUnits = Number(right?.units ?? 0);

    lec1 += Number.isFinite(leftLec) ? leftLec : 0;
    lab1 += Number.isFinite(leftLab) ? leftLab : 0;
    units1 += Number.isFinite(leftUnits) ? leftUnits : 0;
    lec2 += Number.isFinite(rightLec) ? rightLec : 0;
    lab2 += Number.isFinite(rightLab) ? rightLab : 0;
    units2 += Number.isFinite(rightUnits) ? rightUnits : 0;

    rows.push([
      left ? "_______" : "",
      left?.subject_code ?? left?.code ?? "",
      left?.title ?? "",
      left ? leftLec : "",
      left ? leftLab : "",
      left ? leftUnits : "",
      right ? "_______" : "",
      right?.subject_code ?? right?.code ?? "",
      right?.title ?? "",
      right ? rightLec : "",
      right ? rightLab : "",
      right ? rightUnits : "",
    ]);
  }

  rows.push(["", "", "", lec1, lab1, units1, "", "", "", lec2, lab2, units2]);
  return rows;
}

function parseSplitTemplateRows(rows) {
  if (!Array.isArray(rows) || rows.length < 4) {
    return null;
  }

  const normalize = (value) => String(value ?? "").trim().toLowerCase();

  const findSemesterHeader = () => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      let firstIdx = -1;
      let secondIdx = -1;

      for (let col = 0; col < row.length; col++) {
        const cell = normalize(row[col]);
        if (cell === "first semester") {
          firstIdx = col;
        }
        if (cell === "second semester") {
          secondIdx = col;
        }
      }

      if (firstIdx >= 0 && secondIdx >= 0) {
        return { rowIndex, firstIdx, secondIdx };
      }
    }
    return null;
  };

  const semesterHeader = findSemesterHeader();
  const semesterHeaderRow = semesterHeader?.rowIndex ?? -1;

  if (semesterHeaderRow < 0) {
    return null;
  }

  const columnsRowIndex = semesterHeaderRow + 1;
  const columnsRow = rows[columnsRowIndex] || [];

  const findCodeColumn = (startIndex, endIndex) => {
    for (let col = startIndex; col <= endIndex; col++) {
      const cell = normalize(columnsRow[col]);
      if (cell === "code" || cell === "subject code") {
        return col;
      }
    }
    return -1;
  };

  const leftScanStart = Math.max(0, semesterHeader.firstIdx - 1);
  const leftScanEnd = Math.max(leftScanStart, semesterHeader.secondIdx - 1);
  const rightScanStart = Math.max(semesterHeader.secondIdx - 1, semesterHeader.secondIdx);
  const rightScanEnd = Math.max(rightScanStart, columnsRow.length - 1);

  const leftCodeCol = findCodeColumn(leftScanStart, leftScanEnd);
  const rightCodeCol = findCodeColumn(rightScanStart, rightScanEnd);

  if (leftCodeCol < 0 || rightCodeCol < 0) {
    return null;
  }

  const parseNumber = (value) => {
    const num = Number(String(value ?? "").trim());
    return Number.isFinite(num) ? num : 0;
  };

  const firstSubjects = [];
  const secondSubjects = [];

  for (let i = columnsRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];

    const leftCode = String(row[leftCodeCol] ?? "").trim();
    const leftTitle = String(row[leftCodeCol + 1] ?? "").trim();
    const rightCode = String(row[rightCodeCol] ?? "").trim();
    const rightTitle = String(row[rightCodeCol + 1] ?? "").trim();

    if (leftCode || leftTitle) {
      firstSubjects.push({
        subject_code: leftCode,
        title: leftTitle,
        lecture: parseNumber(row[leftCodeCol + 2]),
        laboratory: parseNumber(row[leftCodeCol + 3]),
        units: parseNumber(row[leftCodeCol + 4]),
        prerequisites: [],
      });
    }

    if (rightCode || rightTitle) {
      secondSubjects.push({
        subject_code: rightCode,
        title: rightTitle,
        lecture: parseNumber(row[rightCodeCol + 2]),
        laboratory: parseNumber(row[rightCodeCol + 3]),
        units: parseNumber(row[rightCodeCol + 4]),
        prerequisites: [],
      });
    }
  }

  if (!firstSubjects.length && !secondSubjects.length) {
    return null;
  }

  return {
    semesters: [
      { semester: 1, subjects: firstSubjects },
      { semester: 2, subjects: secondSubjects },
    ],
    subjects: [...firstSubjects, ...secondSubjects],
  };
}

function parseTemplateCsv(rows) {
  const findSemesterRow = (semesterNumber) =>
    rows.findIndex((cols) => {
      const first = String(cols?.[0] ?? "").trim().toLowerCase();
      return first === `semester ${semesterNumber}`;
    });

  const firstSemesterStart = findSemesterRow(1);
  const secondSemesterStart = findSemesterRow(2);

  if (firstSemesterStart < 0 && secondSemesterStart < 0) {
    return null;
  }

  const parsePrerequisite = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return [];

    return raw
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  };

  const parseNumber = (value) => {
    const num = Number(String(value ?? "").trim());
    return Number.isFinite(num) ? num : 0;
  };

  const parseSemesterSubjects = (startIdx, endIdx) => {
    if (startIdx < 0) return [];

    let headerIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const row = rows[i] || [];
      const col0 = String(row[0] ?? "").trim().toLowerCase();
      const col1 = String(row[1] ?? "").trim().toLowerCase();
      if (col0 === "subject code" && col1 === "title") {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx < 0) {
      return [];
    }

    const subjects = [];
    for (let i = headerIdx + 1; i < endIdx; i++) {
      const row = rows[i] || [];
      const code = String(row[0] ?? "").trim();
      const title = String(row[1] ?? "").trim();

      if (!code && !title) {
        const lec = String(row[2] ?? "").trim();
        const lab = String(row[3] ?? "").trim();
        const units = String(row[4] ?? "").trim();
        const isTotalsRow = lec || lab || units;
        if (isTotalsRow) {
          continue;
        }
        break;
      }

      subjects.push({
        subject_code: code,
        title,
        lecture: parseNumber(row[2]),
        laboratory: parseNumber(row[3]),
        units: parseNumber(row[4]),
        prerequisites: parsePrerequisite(row[5]),
      });
    }

    return subjects;
  };

  const endOfFirst = secondSemesterStart >= 0 ? secondSemesterStart : rows.length;
  const firstSubjects = parseSemesterSubjects(firstSemesterStart, endOfFirst);
  const secondSubjects = parseSemesterSubjects(secondSemesterStart, rows.length);

  if (!firstSubjects.length && !secondSubjects.length) {
    return null;
  }

  const semesters = [];
  if (firstSubjects.length) {
    semesters.push({ semester: 1, subjects: firstSubjects });
  }
  if (secondSubjects.length) {
    semesters.push({ semester: 2, subjects: secondSubjects });
  }

  return {
    semesters,
    subjects: [...firstSubjects, ...secondSubjects],
  };
}

function toYearLabel(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  const map = {
    "1": "FIRST YEAR",
    "1st": "FIRST YEAR",
    first: "FIRST YEAR",
    "2": "SECOND YEAR",
    "2nd": "SECOND YEAR",
    second: "SECOND YEAR",
    "3": "THIRD YEAR",
    "3rd": "THIRD YEAR",
    third: "THIRD YEAR",
    "4": "FOURTH YEAR",
    "4th": "FOURTH YEAR",
    fourth: "FOURTH YEAR",
  };

  return map[raw] || "CURRICULUM";
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

/**
 * Parse a single CSV line respecting quoted values
 */
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
  return result;
}

/**
 * Set a nested property in an object using bracket notation path
 */
function setNestedProperty(obj, path, value) {
  const keys = [];
  // Parse path like: semesters[0].subjects[0].title
  const regex = /(\w+)(?:\[(\d+)\])?(?:\.)?/g;
  let match;

  while ((match = regex.exec(path)) !== null) {
    keys.push({ name: match[1], index: match[2] ? parseInt(match[2]) : null });
  }

  let target = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (!target[key.name]) {
      target[key.name] = key.index !== null ? [] : {};
    }

    if (key.index !== null) {
      if (!target[key.name][key.index]) {
        target[key.name][key.index] = {};
      }
      target = target[key.name][key.index];
    } else {
      target = target[key.name];
    }
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey.index !== null) {
    if (!target[lastKey.name]) {
      target[lastKey.name] = [];
    }
    target[lastKey.name][lastKey.index] = parseValue(value);
  } else {
    target[lastKey.name] = parseValue(value);
  }
}

/**
 * Parse CSV value to appropriate type
 */
function parseValue(value) {
  if (value === "" || value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

/**
 * Download file helper
 */
export function downloadFile(content, filename, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
