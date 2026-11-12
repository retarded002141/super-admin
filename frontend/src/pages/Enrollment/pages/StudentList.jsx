import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import StudentsTable from "../components/StudentsTable";
import LoadingState from "../components/ui/LoadingState";
import PageHeader from "../components/ui/PageHeader";
import Panel from "../components/ui/Panel";
import SearchInput from "../components/ui/SearchInput";
import api from "../lib/axios";
import { buildScheduleMap } from "../lib/scheduleUtils";
import { getStudentPlacements, studentMatchesFilters } from "../utils/studentDisplay";

const YEAR_OPTIONS = ["All Year", "First Year", "Second Year", "Third Year", "Fourth Year"];
const STATUS_OPTIONS = ["To Be Enrolled", "All Registered", "Block", "Irregular"];
const SORT_OPTIONS = ["Student Number ↑", "Student Number ↓", "Most Recent", "Oldest"];
const OTHER_STATUS_OPTIONS = [
  { label: "4Ps", field: "fourPs" },
  { label: "Solo Parent", field: "soloParent" },
  { label: "Indigenous", field: "indigenous" },
  { label: "PWD", field: "disability" },
];
const YEAR_MAP = { "First Year": "1", "Second Year": "2", "Third Year": "3", "Fourth Year": "4" };

function FilterSelect({ label, value, onChange, options }) {
  const active = !value.startsWith("All");

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-40">
      <span className="text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={onChange}
          className={`h-11 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 ${active ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-700"
            }`}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <i className="fa-solid fa-angle-down pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
      </span>
    </label>
  );
}

function StudentList() {
  const [selectedStatus, setSelectedStatus] = useState("All Registered");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedYear, setSelectedYear] = useState("All Year");
  const [selectedSection, setSelectedSection] = useState("All Section");
  const [selectedSort, setSelectedSort] = useState("Student Number ↑");
  const [selectedOtherStatuses, setSelectedOtherStatuses] = useState([]);
  const [scheduleMap, setScheduleMap] = useState(new Map());

  const isPendingView = selectedStatus === "To Be Enrolled";

  const availableSections = useMemo(() => {
    const nonPending = students.filter((student) => student.status !== "Pending" && student.status !== "Advised");
    const targetYear = selectedYear === "All Year" ? null : YEAR_MAP[selectedYear];

    const sections = Array.from(
      new Set(
        nonPending.flatMap((student) =>
          getStudentPlacements(student)
            .filter((placement) => targetYear == null || placement.year === targetYear)
            .map((placement) => placement.section)
            .filter(Boolean)
        )
      )
    ).sort((left, right) => {
      const leftIrregular = left.toLowerCase() === "irregular";
      const rightIrregular = right.toLowerCase() === "irregular";
      if (leftIrregular && !rightIrregular) return 1;
      if (!leftIrregular && rightIrregular) return -1;
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    });

    return ["All Section", ...sections];
  }, [students, selectedYear]);

  const displayedStudents = useMemo(() => {
    let result = [...students];

    if (selectedStatus === "All Registered") {
      result = result.filter((student) => student.status !== "Pending" && student.status !== "Advised");
    } else if (!isPendingView) {
      result = result.filter((student) => student.status === selectedStatus);
    }

    if (selectedOtherStatuses.length > 0) {
      result = result.filter((student) =>
        selectedOtherStatuses.every((field) => student[field] === true)
      );
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((student) => {
        const number = String(
          isPendingView
            ? student.applicantId ?? student.applicantID
            : student.studentNumber ?? student.applicantId ?? student.applicantID
        ).toLowerCase();
        const firstName = String(student.firstName ?? "").trim().toLowerCase();
        const lastName = String(student.lastName ?? "").trim().toLowerCase();
        const applicantName = String(student.applicant_name ?? "").trim().toLowerCase();
        const fullName = isPendingView ? applicantName : `${firstName} ${lastName}`.trim();
        const reverseName = `${lastName} ${firstName}`.trim();

        return [number, firstName, lastName, fullName, reverseName].some((value) =>
          value.includes(normalizedQuery)
        );
      });
    }

    if (!isPendingView) {
      const yearFilter = selectedYear === "All Year" ? null : YEAR_MAP[selectedYear];
      const sectionFilter = selectedSection === "All Section" ? null : selectedSection;

      if (yearFilter != null || sectionFilter != null) {
        result = result.filter((student) =>
          studentMatchesFilters(student, { year: yearFilter, section: sectionFilter })
        );
      }
    }

    const defaultStudentNumber = (student) =>
      String(student.studentNumber ?? student.applicantId ?? student.applicantID ?? "");
    const compareStudentNumbers = (left, right, direction) => {
      const leftNumber = defaultStudentNumber(left);
      const rightNumber = defaultStudentNumber(right);
      const leftYear = leftNumber.slice(0, 4);
      const rightYear = rightNumber.slice(0, 4);
      const leftRemainder = leftNumber.slice(4);
      const rightRemainder = rightNumber.slice(4);
      const yearDifference = leftYear.localeCompare(rightYear, undefined, { numeric: true });
      const remainderDifference = leftRemainder.localeCompare(rightRemainder, undefined, { numeric: true });

      if (yearDifference !== 0) return direction * yearDifference;
      if (remainderDifference !== 0) return direction * remainderDifference;
      return leftNumber.localeCompare(rightNumber, undefined, { numeric: true, sensitivity: "base" });
    };

    const compareDefaultOrder = (left, right) => {
      if (isPendingView) {
        return String(left.applicant_number ?? left.applicantID ?? "").localeCompare(
          String(right.applicant_number ?? right.applicantID ?? ""),
          undefined,
          { numeric: true, sensitivity: "base" }
        );
      }

      const yearDifference = Number(left.year ?? 0) - Number(right.year ?? 0);
      if (yearDifference !== 0) return yearDifference;

      const sectionDifference = String(left.section ?? "").localeCompare(String(right.section ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (sectionDifference !== 0) return sectionDifference;

      return defaultStudentNumber(left).localeCompare(defaultStudentNumber(right), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    };

    if (!isPendingView && selectedSort === "Most Recent") {
      result.sort((left, right) => {
        const dateDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        return Number.isNaN(dateDifference) ? compareDefaultOrder(left, right) : dateDifference;
      });
    } else if (!isPendingView && selectedSort === "Oldest") {
      result.sort((left, right) => {
        const dateDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return Number.isNaN(dateDifference) ? compareDefaultOrder(left, right) : dateDifference;
      });
    } else if (!isPendingView && selectedSort === "Student Number ↓") {
      result.sort((left, right) => compareStudentNumbers(left, right, 1));
    } else if (!isPendingView && selectedSort === "Student Number ↑") {
      result.sort((left, right) => compareStudentNumbers(left, right, -1));
    } else {
      result.sort(compareDefaultOrder);
    }

    return result;
  }, [
    students,
    query,
    selectedYear,
    selectedSection,
    selectedStatus,
    selectedSort,
    selectedOtherStatuses,
    isPendingView,
  ]);

  useEffect(() => {
    if (!availableSections.includes(selectedSection)) {
      setSelectedSection("All Section");
    }
  }, [availableSections, selectedSection]);

  useEffect(() => {
    document.title = "Students - IITI Enrollment System";

    const fetchStudents = async () => {
      try {
        setLoading(true);
        const response = isPendingView
          ? await api.get("/students/applicants")
          : await api.get("/students", {
            params: selectedStatus !== "All Registered" ? { status: selectedStatus } : undefined,
          });
        setStudents(Array.isArray(response.data) ? response.data : []);
        console.log("[StudentList] Fetched students data (raw from API):", response.data); // 
      } catch (error) {
        console.error("Error fetching students", error);
        toast.error("Failed to load student records");
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [selectedStatus, isPendingView]);

  // Fetch master schedule 
  useEffect(() => {
    const fetchMasterSchedule = async () => {
      try {
        const schedulesRes = await api.get("/schedules");
        const availableSchedules = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];

        if (availableSchedules.length === 0) {
          setScheduleMap(new Map());
          return;
        }

        const scheduleDetailResults = await Promise.allSettled(
          availableSchedules.map(async (schedule) => {
            if (!schedule?._id) return null;

            const detailsRes = await api.get(`/schedules/${schedule._id}`);
            return detailsRes.data;
          })
        );

        const scheduleDetails = scheduleDetailResults
          .map((result) => (result.status === "fulfilled" ? result.value : null))
          .filter(Boolean);

        setScheduleMap(buildScheduleMap(scheduleDetails));
      } catch (error) {
        console.error("Error fetching master schedule for StudentList:", error);
        setScheduleMap(new Map());
      }
    };
    fetchMasterSchedule();
  }, []);

  return (
    <>
      <section className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="Student Directory"
          description="Search, review, and filter registered students and pending applicants."
          actions={
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
                {displayedStudents.length} record{displayedStudents.length === 1 ? "" : "s"}
              </div>
              <p className="text-xs font-medium text-slate-500">Click any row to view the complete record.</p>
            </div>
          }
        />

        <Panel className="p-4 sm:p-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClear={() => setQuery("")}
                placeholder={isPendingView ? "Search applicant name or number..." : "Search student name or number..."}
                className="w-full xl:max-w-xl"
              />

              {!isPendingView && (
                <div className="grid w-full grid-cols-2 gap-3 xl:grid-cols-3 xl:w-auto">
                  <FilterSelect
                    label="Year"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(event.target.value)}
                    options={YEAR_OPTIONS}
                  />
                  <FilterSelect
                    label="Section"
                    value={selectedSection}
                    onChange={(event) => setSelectedSection(event.target.value)}
                    options={availableSections}
                  />
                  <FilterSelect
                    label="Sort By"
                    value={selectedSort}
                    onChange={(event) => setSelectedSort(event.target.value)}
                    options={SORT_OPTIONS}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 pt-4">
              <span className="hidden sm:inline mr-1 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">Status</span>
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  aria-pressed={selectedStatus === status}
                  className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${selectedStatus === status
                    ? "border-emerald-700 bg-emerald-700 text-white "
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                    }`}
                >
                  {status}
                </button>
              ))}
              <div className="ml-2 flex shrink-0 items-center gap-2 border-l border-slate-200 pl-3">
                <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-wide text-slate-500">
                  Other Status
                </span>
                {OTHER_STATUS_OPTIONS.map(({ label, field }) => {
                  const isSelected = selectedOtherStatuses.includes(field);
                  return (
                    <button
                      key={field}
                      type="button"
                      onClick={() =>
                        setSelectedOtherStatuses((current) =>
                          isSelected
                            ? current.filter((selectedField) => selectedField !== field)
                            : [...current, field]
                        )
                      }
                      aria-pressed={isSelected}
                      className={`shrink-0 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${isSelected
                        ? "border-emerald-700 bg-emerald-700 text-white "
                        : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="min-h-[420px] overflow-hidden">
          {loading ? (
            <LoadingState label="Loading student records..." />
          ) : (
            <StudentsTable
              students={displayedStudents}
              scheduleMap={scheduleMap}
              className="w-full border-0 shadow-none"
              isPendingView={isPendingView}
              initialPageSize={10}
              pageSizeOptions={[10, 20, 50]}
            />
          )}
        </Panel>
      </section>

    </>
  );
}

export default StudentList;
