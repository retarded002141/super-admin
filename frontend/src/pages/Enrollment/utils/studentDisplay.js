/**
 * Display helpers for student list tables.
 *
 * Irregular students attend classes in multiple sections/years. Their base
 * "section"/"year" attributes hold the main placement, while the
 * "irregularSection"/"irregularYear" arrays hold every other section/year they
 * are currently attending. These helpers merge both into a single display
 * string joined by a pipe, e.g. section="A" + irregularSection=["B"] -> "A | B".
 */

export function isIrregularStudent(student = {}) {
  return String(student.status ?? "").trim().toLowerCase() === "irregular";
}

function toDisplayList(values) {
  return (Array.isArray(values) ? values : values != null && values !== "" ? [values] : [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function collectUniqueValues(primary, irregularValues) {
  const seen = new Set();
  const parts = [];

  for (const value of [String(primary ?? "").trim(), ...toDisplayList(irregularValues)]) {
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }

  return parts;
}

function joinDisplayValues(primary, irregularValues, preserveDuplicates = false) {
  if (preserveDuplicates) {
    return [String(primary ?? "").trim(), ...toDisplayList(irregularValues)].filter(Boolean).join(" | ");
  }
  return collectUniqueValues(primary, irregularValues).join(" | ");
}

/**
 * All sections the student is currently attending, e.g. "A | B" for an
 * irregular student with section "A" and irregularSection ["B"].
 * Returns the plain section value for non-irregular students.
 */
export function getStudentSectionDisplay(student = {}) {
  if (!isIrregularStudent(student) && toDisplayList(student.irregularSection).length === 0) {
    return String(student.section ?? "").trim();
  }
  return joinDisplayValues(student.section, student.irregularSection, true);
}

/**
 * All year levels the student is currently attending, e.g. "2 | 1" for an
 * irregular student with year "2" and irregularYear ["1"].
 * Returns the plain year value for non-irregular students.
 */
export function getStudentYearDisplay(student = {}) {
  if (!isIrregularStudent(student)) return String(student.year ?? "").trim();
  return joinDisplayValues(student.year, student.irregularYear);
}

/**
 * Every (year, section) placement the student is currently attending.
 *
 * Irregular students attend multiple year/section combinations. The base
 * "year"/"section" attributes form the main placement, while the
 * "irregularYear"/"irregularSection" arrays are paired by index to form the
 * remaining placements. Returns an array like
 * [{ year: "2", section: "A" }, { year: "1", section: "B" }].
 * Non-irregular students return only their single main placement.
 */
export function getStudentPlacements(student = {}) {
  const placements = [];

  const baseYear = String(student.year ?? "").trim();
  const baseSection = String(student.section ?? "").trim();
  if (baseYear !== "" || baseSection !== "") {
    placements.push({ year: baseYear, section: baseSection });
  }

  if (isIrregularStudent(student)) {
    const irregularYears = toDisplayList(student.irregularYear);
    const irregularSections = toDisplayList(student.irregularSection);
    const pairCount = Math.max(irregularYears.length, irregularSections.length);

    for (let index = 0; index < pairCount; index += 1) {
      const year = irregularYears[index] ?? "";
      const section = irregularSections[index] ?? "";
      if (year === "" && section === "") continue;
      placements.push({ year, section });
    }
  }

  return placements;
}

/**
 * Whether a student is attending a placement matching the requested year and/or
 * section. When both are given, they must match the SAME placement
 * (e.g. year "1" + section "B" matches an irregular student whose placements
 * are [{ year: "2", section: "A" }, { year: "1", section: "B" }], but NOT
 * year "1" + section "A").
 */
export function studentMatchesFilters(student = {}, { year = null, section = null } = {}) {
  const yearFilter = year != null && String(year).trim() !== "" ? String(year).trim() : null;
  const sectionFilter =
    section != null && String(section).trim() !== "" ? String(section).trim().toLowerCase() : null;

  if (yearFilter == null && sectionFilter == null) return true;

  return getStudentPlacements(student).some((placement) => {
    if (yearFilter != null && placement.year !== yearFilter) return false;
    if (sectionFilter != null && placement.section.trim().toLowerCase() !== sectionFilter) return false;
    return true;
  });
}
