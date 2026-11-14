import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import api from "../lib/axios";
import {
  buildScheduleKey,
  buildScheduleMap,
  buildStudentScheduleKeys,
  formatScheduleTimeRange,
} from "../lib/scheduleUtils";
import { getStudentSectionDisplay, getStudentYearDisplay } from "../utils/studentDisplay";
import Pagination from "./ui/Pagination";

const FIELD_LABELS = {
  applicantID: "Applicant ID",
  applicantId: "Applicant ID",
  applicant_name: "Applicant Name",
  studentNumber: "Student Number",
  firstName: "First Name",
  lastName: "Last Name",
  middleName: "Middle Name",
  section: "Section",
  year: "Year",
  semester: "Semester",
  status: "Status",
  email: "Email",
  schoolYear: "School Year",
  birthDate: "Birth Date",
  contactNumber: "Contact Number",
  gender: "Gender",
  civilStatus: "Civil Status",
  placeOfBirth: "Place of Birth",
  suffix: "Suffix",
  spouseName: "Spouse Name",
  fatherName: "Father Name",
  fatherContact: "Father Contact",
  motherName: "Mother Name",
  motherContact: "Mother Contact",
  course: "Course",
  applicantType: "Applicant Type",
  permanentHouse: "Permanent House",
  permanentStreet: "Permanent Street",
  permanentBarangay: "Permanent Barangay",
  permanentCity: "Permanent City",
  permanentProvince: "Permanent Province",
  permanentZip: "Permanent Zip",
  presentHouse: "Present House",
  presentStreet: "Present Street",
  presentBarangay: "Present Barangay",
  presentCity: "Present City",
  presentProvince: "Present Province",
  presentZip: "Present Zip",
  elementarySchool: "Elementary School",
  elementaryAddress: "Elementary Address",
  elementaryYear: "Elementary Year",
  juniorHighSchool: "Junior High School",
  juniorHighAddress: "Junior High Address",
  juniorHighYear: "Junior High Year",
  seniorHighSchool: "Senior High School",
  seniorHighAddress: "Senior High Address",
  seniorHighYear: "Senior High Year",
  collegeSchool: "College School",
  collegeAddress: "College Address",
  collegeYear: "College Year",
  disability: "Disability",
  indigenous: "Indigenous",
  soloParent: "Solo Parent",
  fourPs: "4Ps",
  createdAt: "Date Created",
  updatedAt: "Last Updated",
};

const FIELD_ORDER = [
  "studentNumber",
  "applicantId",
  "applicantID",
  "applicant_name",
  "firstName",
  "lastName",
  "middleName",
  "year",
  "section",
  "semester",
  "status",
  "email",
  "schoolYear",
  "birthDate",
  "contactNumber",
  "gender",
  "civilStatus",
  "placeOfBirth",
  "suffix",
  "spouseName",
  "fatherName",
  "fatherContact",
  "motherName",
  "motherContact",
  "course",
  "applicantType",
  "permanentHouse",
  "permanentStreet",
  "permanentBarangay",
  "permanentCity",
  "permanentProvince",
  "permanentZip",
  "presentHouse",
  "presentStreet",
  "presentBarangay",
  "presentCity",
  "presentProvince",
  "presentZip",
  "elementarySchool",
  "elementaryAddress",
  "elementaryYear",
  "juniorHighSchool",
  "juniorHighAddress",
  "juniorHighYear",
  "seniorHighSchool",
  "seniorHighAddress",
  "seniorHighYear",
  "collegeSchool",
  "collegeAddress",
  "collegeYear",
  "disability",
  "indigenous",
  "soloParent",
  "fourPs",
  "createdAt",
  "updatedAt",
];

function humanizeKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const EXCLUDED_DETAIL_KEYS = ["_id", "__v", "password"];

function getSubjectPrerequisites(subject) {
  if (Array.isArray(subject?.prerequisites)) {
    return subject.prerequisites.filter(Boolean).join(", ");
  }

  const prerequisites = String(subject?.prerequisites ?? "").trim();
  if (prerequisites) return prerequisites;

  const title = String(subject?.title ?? "");
  const match = title.match(/\(\s*Pre\s*:\s*([^)]*)\)/i);
  return match?.[1]?.trim() || "";
}

function getCurriculumPeriodLabel(year, semester) {
  const yearLabel = String(year ?? "").trim();
  const semesterLabel = Number(semester) === 1 ? "2nd Sem" : "1st Sem";
  return `Year ${yearLabel} - ${semesterLabel}`;
}

function formatScheduleSemester(semester) {
  const value = String(semester ?? "").trim();
  if (!value) return "—";
  if (/semester$/i.test(value)) {
    return value.replace(/^first\b/i, "1st").replace(/^second\b/i, "2nd");
  }
  if (/^(1|1st)$/i.test(value)) return "1st Semester";
  if (/^(2|2nd)$/i.test(value)) return "2nd Semester";
  return `${value} Semester`;
}

function formatScheduleSchoolYear(schoolYear) {
  const value = String(schoolYear ?? "").trim();
  return value
    ? value
      .replace(/\s+(?:1st|2nd|first|second)\s+semester$/i, "")
      .replace(/\s*-\s*/g, " - ")
      .replace(/^AY\s+/i, "")
    : "—";
}

function getScheduleSectionLabel(student) {
  const section = getStudentSectionDisplay(student);
  const year = getStudentYearDisplay(student);
  if (!section) return "—";
  if (!year || section.includes("|")) return section;
  return section.startsWith(year) ? section : `${year}${section}`;
}

function formatDetailValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";

  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.join(", ");
  }

  if (key === "createdAt" || key === "updatedAt") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    if (Object.keys(value).length === 0) return "—";
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function getDetailEntries(student) {
  if (!student) return [];

  return Object.entries(student)
    .filter(([key]) => {
      const lowerKey = key.toLowerCase();
      if (EXCLUDED_DETAIL_KEYS.some((ex) => ex.toLowerCase() === lowerKey)) return false;
      if (lowerKey.includes("password")) return false;
      return true;
    })
    .sort(([leftKey], [rightKey]) => {
      const leftIndex = FIELD_ORDER.indexOf(leftKey);
      const rightIndex = FIELD_ORDER.indexOf(rightKey);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
      return leftKey.localeCompare(rightKey);
    });
}

function getStatusBadge(status) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "block") {
    return {
      label: status || "Block",
      bg: "bg-[#edf3ec] text-[#173F30] border-[#d3dfd1] font-semibold",
      dot: "bg-[#315B46]",
    };
  }
  if (normalized.includes("enrolled")) {
    return {
      label: status || "Enrolled",
      bg: "bg-blue-100 text-blue-900 border-blue-300 font-semibold",
      dot: "bg-blue-600",
    };
  }
  if (normalized.includes("irregular") || normalized.includes("overloaded")) {
    return {
      label: status || "Irregular",
      bg: "bg-amber-100 text-amber-950 border-amber-300 font-semibold",
      dot: "bg-amber-600",
    };
  }
  if (normalized.includes("pending") || normalized.includes("to be admitted") || normalized.includes("progress")) {
    return {
      label: status || "Pending",
      bg: "bg-purple-100 text-purple-950 border-purple-300 font-semibold",
      dot: "bg-purple-600",
    };
  }
  if (normalized.includes("regular") || normalized.includes("admitted")) {
    return {
      label: status || "Regular",
      bg: "bg-emerald-100 text-emerald-950 border-emerald-300 font-semibold",
      dot: "bg-emerald-600",
    };
  }
  return {
    label: status || "Active",
    bg: "bg-slate-200 text-slate-900 border-slate-300 font-semibold",
    dot: "bg-slate-500",
  };
}

function DataField({ label, value, icon, isHighlight }) {
  const displayVal = formatDetailValue(label, value);
  const isEmpty = displayVal === "—";

  return (
    <div className={`flex flex-col gap-1 rounded-xl p-3.5 transition ${isHighlight ? "bg-emerald-50/50 border border-emerald-100" : "bg-slate-50/70 border border-slate-100 hover:bg-slate-50"}`}>
      <span className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
        {icon && <i className={`${icon} text-slate-400 text-xs`} />}
        {FIELD_LABELS[label] ?? humanizeKey(label)}
      </span>
      <span className={`text-sm font-semibold break-words ${isEmpty ? "text-slate-400 italic" : "text-slate-800"}`}>
        {displayVal}
      </span>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5">
      <div className="mb-3.5 flex items-center gap-2 border-b border-slate-100 pb-3">
        {icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
            <i className={`${icon} text-xs`} />
          </span>
        )}
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function BooleanBadge({ label, value }) {
  const isTrue = Boolean(value === true || String(value).toLowerCase() === "yes" || String(value) === "1");
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${isTrue ? "bg-emerald-100 text-emerald-800" : "bg-slate-200/70 text-slate-600"
          }`}
      >
        <i className={`fa-solid ${isTrue ? "fa-circle-check text-emerald-600" : "fa-circle-xmark text-slate-400"} text-xs`} />
        {isTrue ? "Yes" : "No"}
      </span>
    </div>
  );
}

function StudentsTable({
  students,
  scheduleMap,
  className = "",
  isPendingView = false,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50],
  showPagination = true,
  showAuditColumns = false,
  tableHeightClass = "h-[420px] min-h-[420px]",
  identifierLabel,
  onApplicantIdClick,
  detailStudentToOpen = null,
  onDetailStudentClose,
}) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailStudent, setDetailStudent] = useState(detailStudentToOpen);
  const [activeDetailTab, setActiveDetailTab] = useState("overview");
  const [rawSearchQuery, setRawSearchQuery] = useState("");

  const tabsContainerRef = useRef(null);
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftPos, setScrollLeftPos] = useState(0);

  const handleTabsMouseDown = (e) => {
    if (!tabsContainerRef.current) return;
    setIsDraggingTabs(true);
    setStartX(e.pageX - tabsContainerRef.current.offsetLeft);
    setScrollLeftPos(tabsContainerRef.current.scrollLeft);
  };

  const handleTabsMouseUpOrLeave = () => {
    setIsDraggingTabs(false);
  };

  const handleTabsMouseMove = (e) => {
    if (!isDraggingTabs || !tabsContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabsContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    tabsContainerRef.current.scrollLeft = scrollLeftPos - walk;
  };

  const handleTabsWheel = (e) => {
    if (!tabsContainerRef.current) return;
    if (e.deltaY !== 0) {
      tabsContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const [selectedSubjectView, setSelectedSubjectView] = useState(null);
  const [selectedSubjectSubjects, setSelectedSubjectSubjects] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectError, setSubjectError] = useState("");
  const [curriculumCache, setCurriculumCache] = useState({});
  const [isCurriculumMapping, setIsCurriculumMapping] = useState(false);
  const [curriculumMapping, setCurriculumMapping] = useState(null);
  const mappingContainerRef = useRef(null);
  const mappingSubjectRefs = useRef({});
  const [curriculumMappingLines, setCurriculumMappingLines] = useState([]);
  const [curriculumMappingSize, setCurriculumMappingSize] = useState({ width: 0, height: 0 });
  const [hoveredConnectionId, setHoveredConnectionId] = useState(null);
  const [hoveredSubjectCode, setHoveredSubjectCode] = useState(null);
  const [selectedConnectionCode, setSelectedConnectionCode] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const studentList = useMemo(() => (Array.isArray(students) ? students : []), [students]);
  const closeDetailStudent = () => {
    setDetailStudent(null);
    onDetailStudentClose?.();
  };
  const totalPages = Math.max(1, Math.ceil(studentList.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedStudents = useMemo(() => {
    if (!showPagination) return studentList;
    const start = (safePage - 1) * pageSize;
    return studentList.slice(start, start + pageSize);
  }, [studentList, safePage, pageSize, showPagination]);

  useEffect(() => {
    setCurrentPage(1);
  }, [students, isPendingView]);

  useEffect(() => {
    if (detailStudent) {
      setActiveDetailTab("overview");
      setRawSearchQuery("");
    }
  }, [detailStudent]);

  const normalizeYearKey = (year) => {
    if (!year) return "1st";
    const raw = String(year ?? "").trim().toLowerCase();
    const map = {
      1: "1st",
      "1": "1st",
      "1st": "1st",
      first: "1st",
      "first year": "1st",
      2: "2nd",
      "2": "2nd",
      "2nd": "2nd",
      second: "2nd",
      "second year": "2nd",
      3: "3rd",
      "3": "3rd",
      "3rd": "3rd",
      third: "3rd",
      "third year": "3rd",
      4: "4th",
      "4": "4th",
      "4th": "4th",
      fourth: "4th",
      "fourth year": "4th",
    };
    return map[raw] || "1st";
  };

  const getSemesterIndex = (semester) => {
    if (!semester) return 0;
    const raw = String(semester ?? "").trim().toLowerCase();
    if (["1", "1st", "first", "first semester", "1st semester"].includes(raw)) return 0;
    if (["2", "2nd", "second", "second semester", "2nd semester"].includes(raw)) return 1;
    return 0;
  };

  const handleOpenStudentSubjects = async (student, view) => {
    setSelectedStudent(student);
    setSelectedSubjectView(view);
    setSelectedSubjectSubjects([]);
    setIsCurriculumMapping(false);
    setCurriculumMapping(null);
    setSubjectError("");
    setSubjectLoading(true);

    try {
      if (view === "schedule") {
        const scheduleKeys = buildStudentScheduleKeys(student);
        let activeMap = scheduleMap;

        // Fallback fetch if scheduleMap is missing or empty
        if (!activeMap || activeMap.size === 0) {
          try {
            const schedulesRes = await api.get("/schedules");
            const availableSchedules = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];
            if (availableSchedules.length > 0) {
              const scheduleDetailResults = await Promise.allSettled(
                availableSchedules.map(async (sched) => {
                  if (!sched?._id) return null;
                  const detailsRes = await api.get(`/schedules/${sched._id}`);
                  return detailsRes.data;
                })
              );
              const scheduleDetails = scheduleDetailResults
                .map((res) => (res.status === "fulfilled" ? res.value : null))
                .filter(Boolean);
              activeMap = buildScheduleMap(scheduleDetails);
            }
          } catch (err) {
            console.error("Error fetching fallback schedules:", err);
          }
        }

        if (!activeMap || activeMap.size === 0) {
          setSubjectError("Schedule data is not available yet for this section.");
          setSubjectLoading(false);
          return;
        }

        const irregularSubjects = Array.isArray(student?.irregularSubjects)
          ? student.irregularSubjects
          : [];
        if (String(student?.status ?? "").trim().toLowerCase() === "irregular" && irregularSubjects.length > 0) {
          const matchedClasses = irregularSubjects.flatMap((irregularSubject) => {
            const subjectId = String(irregularSubject?.subjectId ?? "").trim();
            const scheduleKey = buildScheduleKey({
              year: irregularSubject?.targetYear,
              semester: irregularSubject?.targetSemester,
              section: irregularSubject?.targetSection,
            });
            if (!subjectId || !scheduleKey) return [];

            const subjectCode = subjectId.toLowerCase();
            return (activeMap.get(scheduleKey) ?? [])
              .filter((classEntry) =>
                String(classEntry?.subjectCode ?? classEntry?.subject_code ?? "").trim().toLowerCase() === subjectCode
              )
              .map((classEntry) => ({
                ...classEntry,
                day: Array.isArray(classEntry?.days)
                  ? classEntry.days.filter(Boolean).join(", ")
                  : classEntry?.day ?? "-",
              }));
          });

          if (matchedClasses.length === 0) {
            setSubjectError("No matching schedule found for the student's irregular subjects.");
            setSubjectLoading(false);
            return;
          }

          setSelectedSubjectSubjects(matchedClasses);
          setSubjectLoading(false);
          return;
        }

        if (scheduleKeys.length === 0) {
          setSubjectError("Schedule data is not available yet for this section.");
          setSubjectLoading(false);
          return;
        }

        const lookupKey = scheduleKeys.find((key) => activeMap.has(key));
        const scheduleForStudent = lookupKey ? activeMap.get(lookupKey) : null;

        if (!scheduleForStudent || scheduleForStudent.length === 0) {
          setSubjectError(`No schedule found for section "${getStudentSectionDisplay(student)}" (Year ${getStudentYearDisplay(student)}, Semester ${student.semester || "1st"}).`);
          setSubjectLoading(false);
          return;
        }

        setSelectedSubjectSubjects(scheduleForStudent);
        setSubjectLoading(false);
        return;
      }

      // CURRICULUM VIEW
      const isIrregular = String(student?.status ?? "").trim().toLowerCase() === "irregular";
      if (isIrregular) {
        const curriculumResponse = await api.get("/curriculum", {
          params: { t: Date.now() },
          headers: { "Cache-Control": "no-cache" },
        });
        const subjectIds = new Set(
          (Array.isArray(student?.irregularSubjects) ? student.irregularSubjects : [])
            .map((subject) => String(subject?.subjectId ?? "").trim().toLowerCase())
            .filter(Boolean)
        );
        const subjects = (Array.isArray(curriculumResponse?.data) ? curriculumResponse.data : [])
          .flatMap((curriculum) =>
            Array.isArray(curriculum?.subjects)
              ? curriculum.subjects
              : Array.isArray(curriculum?.semesters)
                ? curriculum.semesters.flatMap((semester) =>
                  Array.isArray(semester?.subjects) ? semester.subjects : []
                )
                : []
          )
          .filter((subject) =>
            subjectIds.has(String(subject?.subject_code ?? "").trim().toLowerCase())
          );

        if (!subjects.length) {
          setSubjectError("No matching curriculum subjects found for this irregular student.");
          setSubjectLoading(false);
          return;
        }

        setSelectedSubjectSubjects(subjects);
        setSubjectLoading(false);
        return;
      }

      const yearKey = normalizeYearKey(student?.year);
      const semesterIndex = getSemesterIndex(student?.semester);

      let curriculumDoc = curriculumCache[yearKey];
      if (!curriculumDoc) {
        const response = await api.get(`/curriculum/${yearKey}`);
        curriculumDoc = response.data;
        setCurriculumCache((previous) => ({ ...previous, [yearKey]: curriculumDoc }));
      }

      const semesterSubjects = curriculumDoc?.semesters?.[semesterIndex]?.subjects;
      if (!Array.isArray(semesterSubjects) || semesterSubjects.length === 0) {
        setSubjectError("No curriculum subjects found for this year and semester.");
        setSubjectLoading(false);
        return;
      }

      setSelectedSubjectSubjects(semesterSubjects);
    } catch (error) {
      setSubjectError("Failed to load subject data. " + (error.response?.data?.message || error.message || ""));
    } finally {
      setSubjectLoading(false);
    }
  };

  const closeSubjectDialog = () => {
    setSelectedStudent(null);
    setSelectedSubjectView(null);
    setSelectedSubjectSubjects([]);
    setIsCurriculumMapping(false);
    setCurriculumMapping(null);
    setCurriculumMappingLines([]);
    setHoveredConnectionId(null);
    setHoveredSubjectCode(null);
    setSelectedConnectionCode(null);
    setSubjectError("");
  };

  useLayoutEffect(() => {
    if (!isCurriculumMapping || !curriculumMapping?.length || !mappingContainerRef.current) {
      setCurriculumMappingLines([]);
      return undefined;
    }

    const updateMappingLines = () => {
      const container = mappingContainerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      setCurriculumMappingSize({ width: container.offsetWidth, height: container.offsetHeight });
      const subjectsByCode = new Map();
      Object.entries(mappingSubjectRefs.current).forEach(([code, anchor]) => {
        if (anchor?.element) subjectsByCode.set(code, anchor);
      });

      const lines = [];
      curriculumMapping.forEach((zone) => {
        zone.columns.flatMap((column) => column.subjects).forEach((subject) => {
          const subjectCode = String(subject.subject_code || subject.code || "").trim().toUpperCase();
          const prerequisites = getSubjectPrerequisites(subject)
            .split(/[,/]/)
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);
          const targetAnchor = subjectsByCode.get(subjectCode);
          if (!targetAnchor) return;

          prerequisites.forEach((prerequisite) => {
            const sourceAnchor = subjectsByCode.get(prerequisite);
            if (!sourceAnchor || sourceAnchor.element === targetAnchor.element) return;

            const sourceRect = sourceAnchor.element.getBoundingClientRect();
            const targetRect = targetAnchor.element.getBoundingClientRect();
            const startX = sourceRect.right - containerRect.left + 6;
            const startY = sourceRect.top + sourceRect.height / 2 - containerRect.top;
            const endX = targetRect.left - containerRect.left - 6;
            const endY = targetRect.top + targetRect.height / 2 - containerRect.top;
            const gap = Math.max(18, Math.abs(endX - startX) * 0.35);
            const direction = endX >= startX ? 1 : -1;
            const firstBendX = startX + gap * direction;
            const secondBendX = endX - gap * direction;

            lines.push({
              id: `${prerequisite}-${subjectCode}`,
              sourceCode: prerequisite,
              targetCode: subjectCode,
              path: `M ${startX} ${startY} H ${firstBendX} V ${endY} H ${endX}`,
              startX,
              startY,
              endX,
              endY,
              sourceZone: sourceAnchor.zone,
              targetZone: targetAnchor.zone,
            });
          });
        });
      });

      setCurriculumMappingLines(lines);
    };

    updateMappingLines();
    const resizeObserver = new ResizeObserver(updateMappingLines);
    resizeObserver.observe(mappingContainerRef.current);
    window.addEventListener("resize", updateMappingLines);
    const scrollContainer = mappingContainerRef.current.closest(".overflow-y-auto");
    scrollContainer?.addEventListener("scroll", updateMappingLines, { passive: true });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMappingLines);
      scrollContainer?.removeEventListener("scroll", updateMappingLines);
    };
  }, [curriculumMapping, isCurriculumMapping]);

  const isConnectionActive = (line) =>
    line.id === hoveredConnectionId ||
    line.targetCode === hoveredSubjectCode ||
    line.targetCode === selectedConnectionCode;

  const isSubjectConnectionActive = (code) => {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    const hoveredTarget = normalizedCode === hoveredSubjectCode;
    const selectedTarget = normalizedCode === selectedConnectionCode;
    const isPrerequisite = curriculumMappingLines.some((line) =>
      isConnectionActive(line) && line.sourceCode === normalizedCode
    );
    return hoveredTarget || selectedTarget || isPrerequisite;
  };

  const hasPrerequisites = (code) => {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    return curriculumMappingLines.some((line) =>
      line.targetCode === normalizedCode
    );
  };

  const handleSubjectConnectionClick = (code) => {
    const normalizedCode = String(code ?? "").trim().toUpperCase();
    if (!hasPrerequisites(normalizedCode)) return;
    setSelectedConnectionCode((currentCode) => currentCode === normalizedCode ? null : normalizedCode);
  };

  const handleCurriculumMappingToggle = async (enabled) => {
    setIsCurriculumMapping(enabled);
    if (!enabled || selectedSubjectView !== "curriculum" || !selectedStudent) return;

    setSubjectLoading(true);
    setSubjectError("");

    try {
      const yearNumber = Number(normalizeYearKey(selectedStudent.year)?.replace(/\D/g, ""));
      const semesterIndex = getSemesterIndex(selectedStudent.semester);
      if (!yearNumber || semesterIndex < 0) {
        throw new Error("This view is unavailable for this student's year and semester.");
      }

      const getCurriculumDocument = async (year) => {
        const yearKey = normalizeYearKey(year);
        if (!yearKey) return null;
        if (curriculumCache[yearKey]) return curriculumCache[yearKey];

        const response = await api.get(`/curriculum/${yearKey}`);
        const curriculumDoc = response.data;
        setCurriculumCache((previous) => ({ ...previous, [yearKey]: curriculumDoc }));
        return curriculumDoc;
      };

      const isIrregular = String(selectedStudent?.status ?? "").trim().toLowerCase() === "irregular";
      const currentYearDocument = isIrregular
        ? null
        : await getCurriculumDocument(yearNumber);
      const previousPeriods = [];

      for (let year = 1; year <= yearNumber; year += 1) {
        for (let semester = 0; semester < 2; semester += 1) {
          if (year === yearNumber && semester >= semesterIndex) continue;
          previousPeriods.push({ year, semester });
        }
      }

      const previousDocuments = await Promise.all(
        [...new Set(previousPeriods.map((period) => period.year))].map((year) => getCurriculumDocument(year))
      );
      const previousDocumentsByYear = new Map(
        [...new Set(previousPeriods.map((period) => period.year))].map((year, index) => [year, previousDocuments[index]])
      );

      const getSubjects = (document, semester) => {
        const subjects = document?.semesters?.[semester]?.subjects;
        return Array.isArray(subjects) ? subjects : [];
      };

      let currentColumns;
      if (isIrregular) {
        const curriculumResults = await Promise.allSettled(
          [1, 2, 3, 4].map((year) => getCurriculumDocument(year))
        );
        const subjectsByCode = new Map();

        curriculumResults.forEach((result, yearIndex) => {
          if (result.status !== "fulfilled" || !result.value) return;
          const document = result.value;
          [0, 1].forEach((semester) => {
            getSubjects(document, semester).forEach((subject) => {
              const code = String(subject?.subject_code || subject?.code || "").trim().toLowerCase();
              if (code && !subjectsByCode.has(code)) {
                subjectsByCode.set(code, { year: yearIndex + 1, semester });
              }
            });
          });
        });

        const subjectsByPeriod = new Map();
        selectedSubjectSubjects.forEach((subject) => {
          const code = String(subject?.subject_code || subject?.code || "").trim().toLowerCase();
          const period = subjectsByCode.get(code) || { year: yearNumber, semester: semesterIndex };
          const periodKey = `${period.year}-${period.semester}`;
          if (!subjectsByPeriod.has(periodKey)) {
            subjectsByPeriod.set(periodKey, {
              year: period.year,
              semester: period.semester,
              subjects: [],
            });
          }
          subjectsByPeriod.get(periodKey).subjects.push(subject);
        });
        currentColumns = [...subjectsByPeriod.values()];
      } else {
        currentColumns = [{
          year: yearNumber,
          semester: semesterIndex,
          subjects: getSubjects(currentYearDocument, semesterIndex),
        }];
      }

      setCurriculumMapping([
        {
          label: "Previous",
          columns: previousPeriods.map((period) => ({
            year: period.year,
            semester: period.semester,
            subjects: getSubjects(previousDocumentsByYear.get(period.year), period.semester),
          })),
          borderClass: "border-blue-400",
          headerClass: "bg-blue-50 text-blue-900",
        },
        {
          label: "Current",
          columns: currentColumns,
          borderClass: "border-emerald-500",
          headerClass: "bg-emerald-50 text-emerald-900",
        },
      ]);
    } catch (error) {
      setSubjectError(error.response?.data?.message || error.message || "Failed to load curriculum mapping.");
    } finally {
      setSubjectLoading(false);
    }
  };

  const handlePageSizeChange = (nextSize) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const baseColumnCount = isPendingView ? 3 : 8;
  const columnCount = baseColumnCount + (showAuditColumns && !isPendingView ? 2 : 0);
  const detailEntries = useMemo(() => getDetailEntries(detailStudent), [detailStudent]);

  const filteredRawEntries = useMemo(() => {
    if (!rawSearchQuery.trim()) return detailEntries;
    const q = rawSearchQuery.trim().toLowerCase();
    return detailEntries.filter(([key, val]) => {
      const label = FIELD_LABELS[key] ?? humanizeKey(key);
      const strVal = formatDetailValue(key, val);
      return label.toLowerCase().includes(q) || strVal.toLowerCase().includes(q);
    });
  }, [detailEntries, rawSearchQuery]);

  const isPendingModal = isPendingView || detailStudent?.status === "Pending";
  const fullName = detailStudent
    ? isPendingModal
      ? detailStudent.applicant_name || `${detailStudent.firstName ?? ""} ${detailStudent.lastName ?? ""}`.trim() || "Applicant"
      : `${detailStudent.firstName ?? ""} ${detailStudent.middleName ? detailStudent.middleName + " " : ""}${detailStudent.lastName ?? ""} ${detailStudent.suffix ?? ""}`.trim() || "Student"
    : "";

  const idNumber = detailStudent
    ? isPendingModal
      ? detailStudent.applicantId ?? detailStudent.applicantID ?? "—"
      : detailStudent.studentNumber ?? "—"
    : "—";

  const statusBadge = getStatusBadge(detailStudent?.status);
  const initials = fullName
    ? fullName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase()
    : "ST";

  const DETAIL_TABS = [
    { id: "overview", label: "Overview & Personal", icon: "fa-solid fa-user" },
    { id: "contact", label: "Contact & Address", icon: "fa-solid fa-location-dot" },
    { id: "education", label: "Education", icon: "fa-solid fa-graduation-cap" },
    { id: "background", label: "Special Categories", icon: "fa-solid fa-clipboard-check" },
    { id: "raw", label: "All Fields", icon: "fa-solid fa-table-cells" },
  ];

  return (
    <div className={`flex h-full min-h-[340px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white font-sans  ${className}`}>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 sm:hidden">Scroll horizontally to view all columns.</p>
      <div className={`${tableHeightClass} overflow-auto custom-scrollbar`} tabIndex={0} role="region" aria-label="Student records">
        <table className="min-w-full whitespace-nowrap border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-[#d3dfd1] bg-[#edf3ec] text-[#173F30]">
            <tr>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                <div className="flex items-center gap-1.5">
                  <i className="fa-solid fa-id-card text-[0.7rem] text-[#406e57]" />
                  <span>{identifierLabel || (isPendingView ? "Applicant ID" : "Student Number")}</span>
                </div>
              </th>
              <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                <div className="flex items-center gap-1.5">
                  <i className="fa-solid fa-user text-[0.7rem] text-[#406e57]" />
                  <span>{isPendingView ? "Applicant Name" : "Student Name"}</span>
                </div>
              </th>
              {!isPendingView && (
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Section</th>
              )}
              {!isPendingView && (
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Year</th>
              )}
              {!isPendingView && (
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Semester</th>
              )}
              {!isPendingView && (
                <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                  Schedule
                </th>
              )}
              {!isPendingView && (
                <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                  Curriculum
                </th>
              )}
              <th className="px-5 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                Status
              </th>
              {showAuditColumns && !isPendingView && (
                <>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Created</th>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Updated</th>
                </>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {paginatedStudents.length > 0 ? (
              paginatedStudents.map((student, index) => {
                const sBadge = getStatusBadge(student.status);
                return (
                  <tr
                    key={student._id || student.studentNumber || student.applicantID || index}
                    tabIndex={0}
                    onClick={() => {
                      if (student.applicantId && onApplicantIdClick) {
                        onApplicantIdClick(student);
                        return;
                      }
                      setDetailStudent(student);
                    }}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        if (student.applicantId && onApplicantIdClick) {
                          onApplicantIdClick(student);
                        } else {
                          setDetailStudent(student);
                        }
                      }
                    }}
                    aria-label={`View complete data for ${isPendingView
                        ? student.applicant_name || student.applicantId || student.applicantID || "applicant"
                        : `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || student.studentNumber || "student"
                      }`}
                    className="group cursor-pointer transition-colors hover:bg-emerald-50/70 focus-visible:bg-emerald-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-800 group-hover:text-emerald-950">
                      {isPendingView
                        ? student.applicantID ?? student.applicantId ?? "—"
                        : student.studentNumber ?? student.applicantId ?? student.applicantID ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800 group-hover:text-emerald-900">
                      {isPendingView
                        ? (student.applicant_name ?? `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim()) || "—"
                        : `${student.firstName ?? ""} ${student.lastName ?? ""}${student.suffix ? " " + String(student.suffix).trim() : ""}`.trim() || "—"}
                    </td>
                    {!isPendingView && <td className="px-5 py-3.5 text-slate-600 text-xs font-medium">{getStudentSectionDisplay(student) || "—"}</td>}
                    {!isPendingView && <td className="px-5 py-3.5 text-slate-600 text-xs font-medium">{getStudentYearDisplay(student) || "—"}</td>}
                    {!isPendingView && <td className="px-5 py-3.5 text-slate-600 text-xs font-medium">{student.semester || "—"}</td>}
                    {!isPendingView && (
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenStudentSubjects(student, "schedule");
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-100 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          aria-label={`View schedule for ${student.firstName ?? "student"}`}
                          title="View Class Schedule"
                        >
                          <i className="fa-solid fa-calendar-days text-sm" />
                        </button>
                      </td>
                    )}
                    {!isPendingView && (
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenStudentSubjects(student, "curriculum");
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-100 hover:text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          aria-label={`View curriculum for ${student.firstName ?? "student"}`}
                          title="View Current Curriculum"
                        >
                          <i className="fa-solid fa-book-open text-sm" />
                        </button>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${sBadge.bg}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sBadge.dot}`} />
                        {sBadge.label}
                      </span>
                    </td>
                    {showAuditColumns && !isPendingView && (
                      <>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{formatDetailValue("createdAt", student.createdAt)}</td>
                        <td className="px-5 py-3.5 text-xs text-slate-500">{formatDetailValue("updatedAt", student.updatedAt)}</td>
                      </>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columnCount} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-regular fa-folder-open text-3xl text-slate-300" />
                    <p className="text-sm font-medium">No students found matching your filter criteria.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <Pagination
          currentPage={safePage}
          totalItems={studentList.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={pageSizeOptions}
        />
      )}

      {/* STUDENT RECORD MODAL */}
      {detailStudent &&
        createPortal(
          <div className="fixed inset-0 z-[310] flex items-center justify-center overflow-y-auto p-3 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/60 transition-opacity"
              onClick={closeDetailStudent}
              aria-label="Close student data dialog"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Complete student data"
              className="animate-fade relative flex max-h-[90vh] h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/20 bg-slate-50 shadow-2xl shadow-slate-950/40"
            >
              {/* Top Hero & Fixed Tabs Bar */}
              <div className="shrink-0 bg-[#173c2c] text-white">
                <div className="px-6 pt-6 pb-4 sm:px-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-semibold uppercase text-white border border-white/20 shadow-inner">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.62rem] font-bold uppercase tracking-wide text-emerald-200">
                            {isPendingModal ? "Applicant Record" : "Official Student Record"}
                          </span>
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold ${statusBadge.bg}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
                            {statusBadge.label}
                          </span>
                        </div>
                        <h3 className="mt-0.5 truncate text-lg sm:text-xl font-semibold tracking-tight text-white">
                          {fullName}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-emerald-100/80 font-mono">
                          {isPendingModal ? "Applicant ID" : "Student ID"}: <span className="font-bold text-white">{idNumber}</span>
                          {detailStudent.course && ` • ${detailStudent.course}`}
                          {detailStudent.year && ` • Year ${getStudentYearDisplay(detailStudent)}`}
                          {detailStudent.section && ` • Section ${getStudentSectionDisplay(detailStudent)}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (idNumber && idNumber !== "—") {
                            navigator.clipboard.writeText(idNumber);
                            toast.success(`Copied ID (${idNumber}) to clipboard!`);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 active:scale-95"
                      >
                        <i className="fa-regular fa-copy text-xs" />
                        <span className="hidden sm:inline">Copy ID</span>
                      </button>
                      <button
                        type="button"
                        onClick={closeDetailStudent}
                        className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-white/90 transition hover:bg-white/20 hover:text-white"
                        aria-label="Close detail modal"
                      >
                        <i className="fa-solid fa-xmark text-base" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-navigation Tabs Strip */}
                <div className="border-t border-white/10 bg-black/20 px-4 py-2 sm:px-8">
                  <div
                    ref={tabsContainerRef}
                    onMouseDown={handleTabsMouseDown}
                    onMouseUp={handleTabsMouseUpOrLeave}
                    onMouseLeave={handleTabsMouseUpOrLeave}
                    onMouseMove={handleTabsMouseMove}
                    onWheel={handleTabsWheel}
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 select-none cursor-grab active:cursor-grabbing"
                  >
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          if (isDraggingTabs) return;
                          setActiveDetailTab(tab.id);
                        }}
                        className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${activeDetailTab === tab.id
                            ? "bg-white text-[#111e19] shadow-md"
                            : "bg-white/10 text-emerald-100 hover:bg-white/20 hover:text-white"
                          }`}
                      >
                        <i className={`${tab.icon} text-xs pointer-events-none`} />
                        <span className="pointer-events-none">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Main Content */}
              <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/70 p-4 sm:p-6 custom-scrollbar">
                {/* TAB 1: OVERVIEW & PERSONAL */}
                {activeDetailTab === "overview" && (
                  <div className="flex flex-col gap-5">
                    <SectionCard title="Academic Placement" icon="fa-solid fa-building-columns">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <DataField label="studentNumber" value={detailStudent.studentNumber ?? detailStudent.applicantID} isHighlight />
                        <DataField label="course" value={detailStudent.course} />
                        <DataField label="year" value={getStudentYearDisplay(detailStudent)} />
                        <DataField label="section" value={getStudentSectionDisplay(detailStudent)} />
                        <DataField label="semester" value={detailStudent.semester} />
                        <DataField label="schoolYear" value={detailStudent.schoolYear} />
                        <DataField label="status" value={detailStudent.status} />
                        <DataField label="applicantType" value={detailStudent.applicantType} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Personal Demographics" icon="fa-solid fa-id-card">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <DataField label="firstName" value={detailStudent.firstName} />
                        <DataField label="middleName" value={detailStudent.middleName} />
                        <DataField label="lastName" value={detailStudent.lastName} />
                        <DataField label="suffix" value={detailStudent.suffix} />
                        <DataField label="gender" value={detailStudent.gender} />
                        <DataField label="civilStatus" value={detailStudent.civilStatus} />
                        <DataField label="birthDate" value={detailStudent.birthDate} />
                        <DataField label="placeOfBirth" value={detailStudent.placeOfBirth} />
                        <DataField label="email" value={detailStudent.email} icon="fa-regular fa-envelope" />
                        <DataField label="contactNumber" value={detailStudent.contactNumber} icon="fa-solid fa-phone" />
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* TAB 2: CONTACT & ADDRESS */}
                {activeDetailTab === "contact" && (
                  <div className="flex flex-col gap-5">
                    <SectionCard title="Permanent Address" icon="fa-solid fa-house">
                      <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs font-semibold text-emerald-900">
                        <i className="fa-solid fa-location-dot text-emerald-600 mr-2" />
                        {[
                          detailStudent.permanentHouse,
                          detailStudent.permanentStreet,
                          detailStudent.permanentBarangay,
                          detailStudent.permanentCity,
                          detailStudent.permanentProvince,
                          detailStudent.permanentZip,
                        ]
                          .filter(Boolean)
                          .join(", ") || "No permanent address recorded"}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <DataField label="permanentHouse" value={detailStudent.permanentHouse} />
                        <DataField label="permanentStreet" value={detailStudent.permanentStreet} />
                        <DataField label="permanentBarangay" value={detailStudent.permanentBarangay} />
                        <DataField label="permanentCity" value={detailStudent.permanentCity} />
                        <DataField label="permanentProvince" value={detailStudent.permanentProvince} />
                        <DataField label="permanentZip" value={detailStudent.permanentZip} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Present Address" icon="fa-solid fa-location-arrow">
                      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-100/60 p-3 text-xs font-semibold text-slate-800">
                        <i className="fa-solid fa-location-dot text-slate-500 mr-2" />
                        {[
                          detailStudent.presentHouse,
                          detailStudent.presentStreet,
                          detailStudent.presentBarangay,
                          detailStudent.presentCity,
                          detailStudent.presentProvince,
                          detailStudent.presentZip,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Same as permanent address / Not specified"}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <DataField label="presentHouse" value={detailStudent.presentHouse} />
                        <DataField label="presentStreet" value={detailStudent.presentStreet} />
                        <DataField label="presentBarangay" value={detailStudent.presentBarangay} />
                        <DataField label="presentCity" value={detailStudent.presentCity} />
                        <DataField label="presentProvince" value={detailStudent.presentProvince} />
                        <DataField label="presentZip" value={detailStudent.presentZip} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Parental & Guardian Contacts" icon="fa-solid fa-users">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DataField label="fatherName" value={detailStudent.fatherName} />
                        <DataField label="fatherContact" value={detailStudent.fatherContact} icon="fa-solid fa-phone" />
                        <DataField label="motherName" value={detailStudent.motherName} />
                        <DataField label="motherContact" value={detailStudent.motherContact} icon="fa-solid fa-phone" />
                        <DataField label="spouseName" value={detailStudent.spouseName} />
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* TAB 3: EDUCATION */}
                {activeDetailTab === "education" && (
                  <div className="flex flex-col gap-5">
                    <SectionCard title="Elementary School" icon="fa-solid fa-school">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <DataField label="elementarySchool" value={detailStudent.elementarySchool} />
                        <DataField label="elementaryAddress" value={detailStudent.elementaryAddress} />
                        <DataField label="elementaryYear" value={detailStudent.elementaryYear} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Junior High School" icon="fa-solid fa-building-columns">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <DataField label="juniorHighSchool" value={detailStudent.juniorHighSchool} />
                        <DataField label="juniorHighAddress" value={detailStudent.juniorHighAddress} />
                        <DataField label="juniorHighYear" value={detailStudent.juniorHighYear} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Senior High School" icon="fa-solid fa-graduation-cap">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <DataField label="seniorHighSchool" value={detailStudent.seniorHighSchool} />
                        <DataField label="seniorHighAddress" value={detailStudent.seniorHighAddress} />
                        <DataField label="seniorHighYear" value={detailStudent.seniorHighYear} />
                      </div>
                    </SectionCard>

                    <SectionCard title="College / Prior Tertiary" icon="fa-solid fa-award">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <DataField label="collegeSchool" value={detailStudent.collegeSchool} />
                        <DataField label="collegeAddress" value={detailStudent.collegeAddress} />
                        <DataField label="collegeYear" value={detailStudent.collegeYear} />
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* TAB 4: SPECIAL CATEGORIES */}
                {activeDetailTab === "background" && (
                  <div className="flex flex-col gap-5">
                    <SectionCard title="Special Demographic Statuses" icon="fa-solid fa-clipboard-check">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <BooleanBadge label="4Ps Beneficiary Program" value={detailStudent.fourPs} />
                        <BooleanBadge label="Solo Parent Household" value={detailStudent.soloParent} />
                        <BooleanBadge label="Indigenous Community Member" value={detailStudent.indigenous} />
                        <BooleanBadge label="Person with Disability (PWD)" value={detailStudent.disability} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Record Audit & System Info" icon="fa-solid fa-clock-rotate-left">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DataField label="createdAt" value={detailStudent.createdAt} />
                        <DataField label="updatedAt" value={detailStudent.updatedAt} />
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* TAB 5: ALL FIELDS RAW SEARCHABLE */}
                {activeDetailTab === "raw" && (
                  <div className="flex flex-col gap-4">
                    <div className="relative">
                      <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                      <input
                        type="text"
                        value={rawSearchQuery}
                        onChange={(e) => setRawSearchQuery(e.target.value)}
                        placeholder="Filter fields or values..."
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-xs font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      {rawSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setRawSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {filteredRawEntries.map(([key, value]) => (
                        <DataField key={key} label={key} value={value} />
                      ))}
                      {filteredRawEntries.length === 0 && (
                        <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                          No matching fields found for "{rawSearchQuery}"
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="shrink-0 flex items-center justify-between border-t border-slate-200/80 bg-white px-6 py-3.5">
                <span className="text-xs text-slate-500 font-medium">
                  Viewing {fullName} ({idNumber})
                </span>
                <button
                  type="button"
                  onClick={closeDetailStudent}
                  className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/50"
                >
                  Close Record
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* SCHEDULE / CURRICULUM MODAL */}
      {selectedStudent &&
        createPortal(
          <div className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto p-4 md:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/60 transition-opacity"
              onClick={closeSubjectDialog}
              aria-label="Close subject dialog"
            />
            <div className="animate-fade relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 bg-[#173c2c] px-6 py-5 text-white">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <i className={`fa-solid ${selectedSubjectView === "schedule" ? "fa-calendar-days" : "fa-book-open"} text-emerald-300`} />
                    {selectedSubjectView === "schedule"
                      ? `Class Schedule: Section ${getScheduleSectionLabel(selectedStudent)} • ${formatScheduleSemester(selectedStudent.semester)} • ${formatScheduleSchoolYear(selectedStudent.schoolYear)}`
                      : isCurriculumMapping
                        ? "Curriculum Mapping"
                        : "Current Curriculum"}
                  </h3>
                  <p className="mt-1 text-xs text-emerald-100/90 font-medium">
                    {selectedStudent.firstName} {selectedStudent.lastName} <span className="mx-1.5">•</span>{" "}
                    <span className="font-mono">{selectedStudent.studentNumber || selectedStudent.applicantID}</span> <span className="mx-1.5">•</span> Section {getStudentSectionDisplay(selectedStudent)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSubjectDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 focus:outline-none"
                  aria-label="Close subject dialog"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              <div className="min-h-[300px] flex-1 overflow-y-auto bg-slate-50/50 p-5 md:p-6">
                {subjectLoading ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-500">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-700" />
                    <p className="text-sm font-semibold">
                      Loading {selectedSubjectView === "schedule" ? "schedule" : "curriculum"} details...
                    </p>
                  </div>
                ) : subjectError ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center text-slate-500">
                    <i className="fa-regular fa-calendar-xmark text-4xl text-slate-300" />
                    <p className="text-base font-bold text-slate-700">
                      {selectedSubjectView === "schedule" ? "Schedule details not available" : "Curriculum details not available"}
                    </p>
                    <p className="text-xs text-slate-500 max-w-md">{subjectError}</p>
                  </div>
                ) : (
                  selectedSubjectView === "curriculum" && isCurriculumMapping ? (
                    <div className="max-w-full overflow-x-auto">
                      <div ref={mappingContainerRef} className="relative inline-flex min-w-max items-start gap-6">
                      {curriculumMapping?.map((zone) => (
                        <section
                          key={zone.label}
                          className={`relative z-40 shrink-0 rounded-xl border-2 bg-white/70 p-3  ${zone.borderClass}`}
                        >
                          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">{zone.label}</p>
                          <div className={`flex max-w-full items-start gap-3 pb-1 ${zone.label === "Current" ? "flex-col" : "overflow-x-auto"}`}>
                            {zone.columns.map((column) => (
                              <div key={`${zone.label}-${column.year}-${column.semester}`} className="w-fit max-w-full shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <div className={`w-fit max-w-full whitespace-nowrap border-b px-4 py-3 ${zone.headerClass}`}>
                                  <h4 className="text-sm font-semibold">{getCurriculumPeriodLabel(column.year, column.semester)}</h4>
                                </div>
                                <div className="divide-y divide-slate-100">
                                  {column.subjects.length > 0 ? column.subjects.map((subject, index) => {
                                    const prerequisites = getSubjectPrerequisites(subject);
                                    return (
                                      <div
                                        key={`${subject.subject_code || subject.code || "subject"}-${index}`}
                                        className="w-fit max-w-full whitespace-nowrap px-4 py-3"
                                      >
                                        <p
                                          ref={(element) => {
                                            const code = String(subject.subject_code || subject.code || "").trim().toUpperCase();
                                            if (code) mappingSubjectRefs.current[code] = { element, zone: zone.label };
                                          }}
                                            className={`rounded-md px-1 font-mono text-xs font-bold transition-all duration-150 ${hasPrerequisites(subject.subject_code || subject.code) ? "cursor-pointer" : "cursor-default"} ${isSubjectConnectionActive(subject.subject_code || subject.code)
                                              ? "bg-emerald-100 text-emerald-950 ring-2 ring-emerald-700"
                                              : "text-slate-800"
                                              }`}
                                            onMouseEnter={() => {
                                              const code = String(subject.subject_code || subject.code || "").trim().toUpperCase();
                                              if (hasPrerequisites(code)) setHoveredSubjectCode(code);
                                            }}
                                            onMouseLeave={() => {
                                              if (hoveredSubjectCode === String(subject.subject_code || subject.code || "").trim().toUpperCase()) {
                                                setHoveredSubjectCode(null);
                                              }
                                            }}
                                            onClick={() => handleSubjectConnectionClick(subject.subject_code || subject.code)}
                                        >
                                          {subject.subject_code || subject.code || "-"}
                                        </p>
                                        {prerequisites && (
                                          <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] font-semibold text-slate-500">
                                            <i className="fa-solid fa-arrow-left text-[0.6rem]" aria-hidden="true" />
                                            <span>Pre: {prerequisites}</span>
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }) : (
                                    <p className="px-4 py-6 text-center text-xs font-medium text-slate-400">No subjects listed.</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                      <svg
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-50 overflow-visible"
                        width={curriculumMappingSize.width}
                        height={curriculumMappingSize.height}
                      >
                        {curriculumMappingLines.map((line) => (
                            <g key={line.id}>
                              <path
                                d={line.path}
                                fill="none"
                                stroke={isConnectionActive(line) ? "#10b981" : "#64748b"}
                                opacity={isConnectionActive(line) ? "1" : "0.12"}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={isConnectionActive(line) ? "3" : "2"}
                                className="transition-all duration-150"
                              />
                              <circle cx={line.startX} cy={line.startY} r="3" fill={isConnectionActive(line) ? "#10b981" : "#64748b"} opacity={isConnectionActive(line) ? "1" : "0.12"} />
                              <circle cx={line.endX} cy={line.endY} r="3" fill={isConnectionActive(line) ? "#10b981" : "#64748b"} opacity={isConnectionActive(line) ? "1" : "0.12"} />
                            </g>
                          ))}
                      </svg>
                      </div>
                    </div>
                  ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full border-collapse text-sm">
                      {selectedSubjectView === "schedule" ? (
                        <thead className="border-b border-[#d3dfd1] bg-[#edf3ec] text-[#315B46]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Subject</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Day</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Time</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Room</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Professor</th>
                          </tr>
                        </thead>
                      ) : (
                        <thead className="border-b border-[#d3dfd1] bg-[#edf3ec] text-[#315B46]">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Code</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Title</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Lec</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Lab</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Units</th>
                          </tr>
                        </thead>
                      )}
                      <tbody className="divide-y divide-slate-100">
                        {selectedSubjectView === "schedule" ? (
                          selectedSubjectSubjects.map((cls, index) => (
                            <tr key={index} className="hover:bg-slate-50/80">
                              <td className="px-4 py-3 font-semibold font-mono text-xs text-slate-800">{cls.subjectCode ?? cls.subject_code ?? "-"}</td>
                              <td className="px-4 py-3 text-slate-700 text-xs font-medium">{Array.isArray(cls.days) ? cls.days.join(", ") : cls.day ?? "-"}</td>
                              <td className="px-4 py-3 text-slate-700 text-xs font-medium">{formatScheduleTimeRange(cls.startTime, cls.endTime)}</td>
                              <td className="px-4 py-3 text-slate-700 text-xs">{cls.roomName ?? cls.room_name ?? "-"}</td>
                              <td className="px-4 py-3 text-slate-700 text-xs">{cls.profName ?? cls.professor ?? cls.progName ?? "-"}</td>
                            </tr>
                          ))
                        ) : (
                          selectedSubjectSubjects.map((subject, index) => (
                            <tr key={`${subject.subject_code || subject.code || "subject"}-${index}`} className="hover:bg-slate-50/80">
                              <td className="whitespace-nowrap px-4 py-3 font-semibold font-mono text-xs text-slate-800">
                                {subject.subject_code || subject.code || "-"}
                              </td>
                              <td className="px-4 py-3 text-slate-700 text-xs font-medium">{subject.title || "-"}</td>
                              <td className="px-4 py-3 text-center text-slate-600 text-xs">{subject.lecture ?? 0}</td>
                              <td className="px-4 py-3 text-center text-slate-600 text-xs">{subject.laboratory ?? 0}</td>
                              <td className="px-4 py-3 text-center font-bold text-emerald-800 text-xs">{subject.units ?? 0}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  )
                )}
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-white p-4">
                {selectedSubjectView === "curriculum" ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isCurriculumMapping}
                      onChange={(event) => handleCurriculumMappingToggle(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                    />
                    <span>Curriculum Mapping</span>
                  </label>
                ) : <span />}
                <button
                  type="button"
                  onClick={closeSubjectDialog}
                  className="rounded-xl bg-slate-100 px-6 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default StudentsTable;