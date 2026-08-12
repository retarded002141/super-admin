import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../lib/axios";
import Pagination from "./ui/Pagination";

const FIELD_LABELS = {
  applicantID: "Applicant ID",
  applicant_number: "Applicant Number",
  applicant_name: "Applicant Name",
  student_number: "Student Number",
  name: "Complete Name",
  first_name: "First Name",
  last_name: "Last Name",
  section: "Section",
  year: "Year",
  semester: "Semester",
  status: "Status",
  title: "Title",
  content: "Content",
  createdAt: "Date Created",
  updatedAt: "Last Updated",
};

const FIELD_ORDER = [
  "student_number",
  "applicant_number",
  "applicantID",
  "name",
  "applicant_name",
  "first_name",
  "last_name",
  "year",
  "section",
  "semester",
  "status",
  "createdAt",
  "updatedAt",
];

function humanizeKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDetailValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";

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
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function getDetailEntries(student) {
  if (!student) return [];

  return Object.entries(student)
    .filter(([key]) => !["_id", "__v"].includes(key))
    .sort(([leftKey], [rightKey]) => {
      const leftIndex = FIELD_ORDER.indexOf(leftKey);
      const rightIndex = FIELD_ORDER.indexOf(rightKey);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

      if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
      return leftKey.localeCompare(rightKey);
    });
}

function StudentsTable({
  students,
  className = "",
  isPendingView = false,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50],
  showPagination = true,
  showAuditColumns = false,
  tableHeightClass = "h-[420px] min-h-[420px]",
}) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailStudent, setDetailStudent] = useState(null);
  const [selectedSubjectView, setSelectedSubjectView] = useState(null);
  const [selectedSubjectSubjects, setSelectedSubjectSubjects] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectError, setSubjectError] = useState("");
  const [curriculumCache, setCurriculumCache] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const studentList = useMemo(() => (Array.isArray(students) ? students : []), [students]);
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

  const normalizeYearKey = (year) => {
    const raw = String(year ?? "").trim().toLowerCase();
    const map = {
      1: "1st",
      "1st": "1st",
      first: "1st",
      "first year": "1st",
      2: "2nd",
      "2nd": "2nd",
      second: "2nd",
      "second year": "2nd",
      3: "3rd",
      "3rd": "3rd",
      third: "3rd",
      "third year": "3rd",
      4: "4th",
      "4th": "4th",
      fourth: "4th",
      "fourth year": "4th",
    };

    return map[raw] || null;
  };

  const getSemesterIndex = (semester) => {
    const raw = String(semester ?? "").trim().toLowerCase();

    if (["1", "1st", "first", "first semester", "1st semester"].includes(raw)) return 0;
    if (["2", "2nd", "second", "second semester", "2nd semester"].includes(raw)) return 1;
    return -1;
  };

  const handleOpenStudentSubjects = async (student, view) => {
    setSelectedStudent(student);
    setSelectedSubjectView(view);
    setSelectedSubjectSubjects([]);
    setSubjectError("");
    setSubjectLoading(true);

    try {
      const isIrregular = String(student?.status ?? "").trim().toLowerCase() === "irregular";

      if (isIrregular) {
        const curriculumId = String(student?.student_number ?? "").trim();
        if (!curriculumId) {
          setSubjectError("Student number is required to load this view.");
          return;
        }

        const response = await api.get(`/curriculum/doc/${encodeURIComponent(curriculumId)}`);
        const curriculumDoc = response?.data;
        const subjects = Array.isArray(curriculumDoc?.subjects)
          ? curriculumDoc.subjects
          : Array.isArray(curriculumDoc?.semesters)
            ? curriculumDoc.semesters.flatMap((semester) =>
              Array.isArray(semester?.subjects) ? semester.subjects : []
            )
            : [];

        if (!subjects.length) {
          setSubjectError("No subjects found for this student.");
          return;
        }

        setSelectedSubjectSubjects(subjects);
        return;
      }

      const yearKey = normalizeYearKey(student?.year);
      const semesterIndex = getSemesterIndex(student?.semester);

      if (!yearKey || semesterIndex < 0) {
        setSubjectError("This view is unavailable for this student year/semester.");
        return;
      }

      let curriculumDoc = curriculumCache[yearKey];
      if (!curriculumDoc) {
        const response = await api.get(`/curriculum/${yearKey}`);
        curriculumDoc = response.data;
        setCurriculumCache((previous) => ({ ...previous, [yearKey]: curriculumDoc }));
      }

      const semesterSubjects = curriculumDoc?.semesters?.[semesterIndex]?.subjects;
      if (!Array.isArray(semesterSubjects) || semesterSubjects.length === 0) {
        setSubjectError("No subjects found for this semester.");
        return;
      }

      setSelectedSubjectSubjects(semesterSubjects);
    } catch {
      setSubjectError("Failed to load subject data.");
    } finally {
      setSubjectLoading(false);
    }
  };

  const closeSubjectDialog = () => {
    setSelectedStudent(null);
    setSelectedSubjectView(null);
    setSelectedSubjectSubjects([]);
    setSubjectError("");
  };

  const handlePageSizeChange = (nextSize) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const getStatusStyle = (status) => {
    const normalizedStatus = status?.toLowerCase() || "";

    if (normalizedStatus.includes("enrolled")) return "bg-blue-100 text-blue-700 font-bold";
    if (normalizedStatus.includes("irregular") || normalizedStatus.includes("overloaded")) {
      return "bg-red-100 text-red-700 font-bold";
    }
    if (normalizedStatus.includes("pending") || normalizedStatus.includes("progress")) {
      return "bg-yellow-100 text-yellow-700 font-bold";
    }
    if (normalizedStatus.includes("regular") || normalizedStatus.includes("balance")) {
      return "bg-green-100 text-green-700 font-bold";
    }

    return "bg-gray-100 text-gray-700 font-bold";
  };

  const baseColumnCount = isPendingView ? 3 : 8;
  const columnCount = baseColumnCount + (showAuditColumns && !isPendingView ? 2 : 0);
  const detailEntries = getDetailEntries(detailStudent);

  return (
    <div className={`flex h-full min-h-[340px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white font-sans shadow-sm ${className}`}>
      <div className={`${tableHeightClass} overflow-auto custom-scrollbar`}>
        <table className="min-w-full whitespace-nowrap border-collapse text-left text-sm md:text-base">
          <thead className="sticky top-0 z-10 border-b border-[#BFD9BC] bg-[#E4F6E2] text-[#173F30]">
            <tr>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                {isPendingView ? "Applicant Number" : "Student Number"}
              </th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">
                {isPendingView ? "Applicant Name" : "Student Name"}
              </th>
              {!isPendingView && <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Section</th>}
              {!isPendingView && <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Year</th>}
              {!isPendingView && <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Semester</th>}
              {!isPendingView && <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Schedule</th>}
              {!isPendingView && <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Curriculum</th>}
              <th className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#315B46]">Status</th>
              {showAuditColumns && !isPendingView && (
                <>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Created</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#315B46]">Updated</th>
                </>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {paginatedStudents.length > 0 ? (
              paginatedStudents.map((student, index) => (
                <tr
                  key={student._id || student.student_number || student.applicantID || index}
                  tabIndex={0}
                  onClick={() => setDetailStudent(student)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDetailStudent(student);
                    }
                  }}
                  aria-label={`View complete data for ${isPendingView
                    ? student.applicant_name || student.applicant_number || student.applicantID || "applicant"
                    : `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.student_number || "student"
                    }`}
                  className="cursor-pointer transition-colors hover:bg-emerald-50/60 focus-visible:bg-emerald-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                >
                  <td className="px-5 py-4 font-medium text-gray-900">
                    {isPendingView ? student.applicant_number ?? student.applicantID ?? "—" : student.student_number ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-gray-800">
                    {isPendingView
                      ? (student.applicant_name ?? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()) || "—"
                      : `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.name || "—"}
                  </td>
                  {!isPendingView && <td className="px-5 py-4 text-gray-600">{student.section || "—"}</td>}
                  {!isPendingView && <td className="px-5 py-4 text-gray-600">{student.year || "—"}</td>}
                  {!isPendingView && <td className="px-5 py-4 text-gray-600">{student.semester || "—"}</td>}
                  {!isPendingView && (
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenStudentSubjects(student, "schedule");
                        }}
                        className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#2E522A] focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                        aria-label={`View schedule for ${student.first_name ?? "student"}`}
                      >
                        <i className="fa-solid fa-calendar-days" />
                      </button>
                    </td>
                  )}
                  {!isPendingView && (
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenStudentSubjects(student, "curriculum");
                        }}
                        className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#2E522A] focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                        aria-label={`View curriculum for ${student.first_name ?? "student"}`}
                      >
                        <i className="fa-solid fa-book-open" />
                      </button>
                    </td>
                  )}
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-xs tracking-wide ${getStatusStyle(student.status)}`}>
                      {student.status || "Unknown"}
                    </span>
                  </td>
                  {showAuditColumns && !isPendingView && (
                    <>
                      <td className="px-5 py-4 text-xs text-gray-600">{formatDetailValue("createdAt", student.createdAt)}</td>
                      <td className="px-5 py-4 text-xs text-gray-600">{formatDetailValue("updatedAt", student.updatedAt)}</td>
                    </>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columnCount} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <i className="fa-regular fa-folder-open text-3xl opacity-50" />
                    <p>No students found.</p>
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

      {detailStudent &&
        createPortal(
          <div className="fixed inset-0 z-[230] flex items-center justify-center overflow-y-auto p-3 sm:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
              onClick={() => setDetailStudent(null)}
              aria-label="Close student data dialog"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Complete student data"
              className="animate-fade relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/30 bg-white shadow-2xl shadow-slate-950/25"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">Complete record</p>
                  <h3 className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                    {isPendingView
                      ? detailStudent.applicant_name || "Applicant data"
                      : `${detailStudent.first_name ?? ""} ${detailStudent.last_name ?? ""}`.trim() || "Student data"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {isPendingView
                      ? detailStudent.applicant_number ?? detailStudent.applicantID ?? "No applicant number"
                      : detailStudent.student_number ?? "No student number"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailStudent(null)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close complete student data"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              <div className="overflow-y-auto bg-slate-50/60 p-4 sm:p-6">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detailEntries.map(([key, value]) => (
                    <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <dt className="text-[0.65rem] font-bold uppercase tracking-[0.15em] text-slate-500">
                        {FIELD_LABELS[key] ?? humanizeKey(key)}
                      </dt>
                      <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-800">
                        {formatDetailValue(key, value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>,
          document.body
        )}

      {selectedStudent &&
        createPortal(
          <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto p-4 md:p-6">
            <button
              type="button"
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity"
              onClick={closeSubjectDialog}
              aria-label="Close subject dialog"
            />
            <div className="animate-fade relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 bg-white p-5 md:p-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedSubjectView === "schedule" ? "Class Schedule" : "Class Curriculum"}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-gray-500">
                    {selectedStudent.first_name} {selectedStudent.last_name} <span className="mx-1">•</span>{" "}
                    {selectedStudent.student_number} <span className="mx-1">•</span> {selectedStudent.section}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSubjectDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#2E522A]/50"
                  aria-label="Close subject dialog"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              <div className="min-h-[300px] bg-gray-50/50 p-5 md:p-6">
                {subjectLoading ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-gray-500">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#2E522A]" />
                    <p className="text-sm font-medium">
                      Loading {selectedSubjectView === "schedule" ? "schedule" : "curriculum"}...
                    </p>
                  </div>
                ) : subjectError ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center text-gray-500">
                    <i className="fa-regular fa-calendar-xmark text-4xl text-gray-400 opacity-70" />
                    <p className="text-base font-semibold text-gray-700">
                      {selectedSubjectView === "schedule" ? "Schedule details not available." : "Curriculum details not available."}
                    </p>
                    <p className="text-sm text-gray-500">{subjectError}</p>
                  </div>
                ) : (
                  <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="border-b border-[#BFD9BC] bg-[#E4F6E2] text-[#315B46]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Code</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Title</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Lec</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Lab</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Units</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedSubjectSubjects.map((subject, index) => (
                          <tr key={`${subject.subject_code || subject.code || "subject"}-${index}`} className="hover:bg-gray-50/80">
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                              {subject.subject_code || subject.code || "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-700">{subject.title || "-"}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{subject.lecture ?? 0}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{subject.laboratory ?? 0}</td>
                            <td className="px-4 py-3 text-center font-semibold text-gray-800">{subject.units ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-gray-100 bg-white p-4">
                <button
                  type="button"
                  onClick={closeSubjectDialog}
                  className="rounded-xl bg-gray-100 px-6 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
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
