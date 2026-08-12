import { useEffect, useMemo, useState } from "react";
import toast from "./lib/toast";
import StudentsTable from "./components/StudentsTable";
import LoadingState from "./components/ui/LoadingState";
import PageHeader from "./components/ui/PageHeader";
import Panel from "./components/ui/Panel";
import SearchInput from "./components/ui/SearchInput";
import api from "./lib/axios";

const YEAR_OPTIONS = ["All Year", "First Year", "Second Year", "Third Year", "Fourth Year"];
const SEMESTER_OPTIONS = ["All Sem", "1st Sem", "2nd Sem"];
const STATUS_OPTIONS = ["Pending", "All Registered", "Enrolled", "Irregular"];
const YEAR_MAP = { "First Year": "1", "Second Year": "2", "Third Year": "3", "Fourth Year": "4" };
const SEMESTER_MAP = { "1st Sem": "1st", "2nd Sem": "2nd" };

function FilterSelect({ label, value, onChange, options }) {
  const active = !value.startsWith("All");

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-40">
      <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={onChange}
          className={`h-11 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 ${
            active ? "border-emerald-300 text-emerald-800" : "border-slate-200 text-slate-700"
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
  const [selectedSemester, setSelectedSemester] = useState("All Sem");

  const isPendingView = selectedStatus === "Pending";

  const availableSections = useMemo(() => {
    let filtered = students.filter((student) => student.status !== "Pending");

    if (selectedYear !== "All Year") {
      filtered = filtered.filter((student) => String(student.year) === YEAR_MAP[selectedYear]);
    }

    if (selectedSemester !== "All Sem") {
      filtered = filtered.filter((student) => String(student.semester) === SEMESTER_MAP[selectedSemester]);
    }

    const sections = Array.from(
      new Set(filtered.map((student) => String(student.section ?? "").trim()).filter(Boolean))
    ).sort((left, right) => {
      const leftIrregular = left.toLowerCase() === "irregular";
      const rightIrregular = right.toLowerCase() === "irregular";
      if (leftIrregular && !rightIrregular) return 1;
      if (!leftIrregular && rightIrregular) return -1;
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
    });

    return ["All Section", ...sections];
  }, [students, selectedYear, selectedSemester]);

  const displayedStudents = useMemo(() => {
    let result = [...students];

    if (selectedStatus === "All Registered") {
      result = result.filter((student) => student.status !== "Pending");
    } else if (!isPendingView) {
      result = result.filter((student) => student.status === selectedStatus);
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery) {
      result = result.filter((student) => {
        const number = String(
          isPendingView ? student.applicant_number ?? student.applicantID : student.student_number
        ).toLowerCase();
        const firstName = String(student.first_name ?? "").trim().toLowerCase();
        const lastName = String(student.last_name ?? "").trim().toLowerCase();
        const applicantName = String(student.applicant_name ?? "").trim().toLowerCase();
        const fullName = isPendingView ? applicantName : `${firstName} ${lastName}`.trim();
        const reverseName = `${lastName} ${firstName}`.trim();

        return [number, firstName, lastName, fullName, reverseName].some((value) =>
          value.includes(normalizedQuery)
        );
      });
    }

    if (!isPendingView && selectedYear !== "All Year") {
      result = result.filter((student) => String(student.year) === YEAR_MAP[selectedYear]);
    }

    if (!isPendingView && selectedSection !== "All Section") {
      result = result.filter((student) => student.section === selectedSection);
    }

    if (!isPendingView && selectedSemester !== "All Sem") {
      result = result.filter((student) => String(student.semester) === SEMESTER_MAP[selectedSemester]);
    }

    return result.sort((left, right) => {
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

      return String(left.student_number ?? "").localeCompare(String(right.student_number ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [students, query, selectedYear, selectedSection, selectedSemester, selectedStatus, isPendingView]);

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
          ? await api.get("/students/pending")
          : await api.get("/students", {
              params: selectedStatus !== "All Registered" ? { status: selectedStatus } : undefined,
            });
        setStudents(Array.isArray(response.data) ? response.data : []);
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

  return (
    <>
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Records"
        title="Student Directory"
        description="Search, review, and filter registered students and pending applicants."
        actions={
          <div className="flex flex-col items-end gap-1.5">
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">
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
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 xl:w-auto">
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
                  label="Semester"
                  value={selectedSemester}
                  onChange={(event) => setSelectedSemester(event.target.value)}
                  options={SEMESTER_OPTIONS}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="mr-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">Status</span>
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(status)}
                className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                  selectedStatus === status
                    ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="min-h-[420px] overflow-hidden">
        {loading ? (
          <LoadingState label="Loading student records..." />
        ) : (
          <StudentsTable
            students={displayedStudents}
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
