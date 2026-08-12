import { useEffect, useMemo, useState } from "react";
import toast from "./lib/toast";
import SectionTable from "./components/SectionTable";
import LoadingState from "./components/ui/LoadingState";
import PageHeader from "./components/ui/PageHeader";
import Panel from "./components/ui/Panel";
import SearchInput from "./components/ui/SearchInput";
import api from "./lib/axios";

const STATUS_OPTIONS = ["All", "Available", "Full", "Overloaded"];

function SectionList() {
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const displayedSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let result = [...sections];

    if (normalizedQuery) {
      const combinedMatch = normalizedQuery.match(/^(\d+)\s*([a-z]+)$/i);
      const reverseCombinedMatch = normalizedQuery.match(/^([a-z]+)\s*(\d+)$/i);

      if (combinedMatch) {
        const [, year, section] = combinedMatch;
        result = result.filter(
          (item) => String(item.year) === year && String(item.section).toLowerCase() === section.toLowerCase()
        );
      } else if (reverseCombinedMatch) {
        const [, section, year] = reverseCombinedMatch;
        result = result.filter(
          (item) => String(item.year) === year && String(item.section).toLowerCase() === section.toLowerCase()
        );
      } else {
        result = result.filter((item) =>
          [item.year, item.section, item.semester, item.status]
            .map((value) => String(value ?? "").toLowerCase())
            .some((value) => value.includes(normalizedQuery))
        );
      }
    }

    if (selectedStatus !== "All") {
      result = result.filter((item) => item.status === selectedStatus);
    }

    return result.sort((left, right) => {
      const yearDifference = Number(left.year) - Number(right.year);
      if (yearDifference !== 0) return yearDifference;

      const semesterOrder = { "1st": 1, "2nd": 2 };
      const semesterDifference =
        (semesterOrder[String(left.semester ?? "").trim()] ?? 99) -
        (semesterOrder[String(right.semester ?? "").trim()] ?? 99);
      if (semesterDifference !== 0) return semesterDifference;

      return String(left.section ?? "").localeCompare(String(right.section ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [sections, query, selectedStatus]);

  useEffect(() => {
    document.title = "Sections - IITI Enrollment System";

    const refreshSections = async () => {
      try {
        setLoading(true);
        await api.post("/sections/sync");
        const response = await api.get("/sections", { params: { t: Date.now() } });
        const rawSections = Array.isArray(response.data) ? response.data : [];

        const uniqueSections = new Map();
        rawSections.forEach((section) => {
          const key = `${String(section.year ?? "")}::${String(section.section ?? "")}::${String(
            section.semester ?? ""
          )}`;
          const existing = uniqueSections.get(key);
          if (!existing || Number(section.regular ?? 0) > Number(existing.regular ?? 0)) {
            uniqueSections.set(key, section);
          }
        });

        const normalized = Array.from(uniqueSections.values())
          .map((section) => ({
            ...section,
            regular: Number(section.regular ?? 0),
            irregular: Number(section.irregular ?? 0),
            regular_capacity: Number(section.regular_capacity ?? 45),
            irregular_capacity: Number(section.irregular_capacity ?? 5),
            total_capacity: Number(section.total_capacity ?? 50),
            total: Number(section.regular ?? 0) + Number(section.irregular ?? 0),
          }))
          .filter((section) => section.regular > 0 || section.irregular > 0);

        setSections(normalized);
      } catch (error) {
        console.error("Failed to load sections", error);
        toast.error("Failed to load section data");
        setSections([]);
      } finally {
        setLoading(false);
      }
    };

    refreshSections();
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Capacity"
        title="Section Management"
        description="Monitor section enrollment, available capacity, and overloaded classes."
        actions={
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm">
            {displayedSections.length} section{displayedSections.length === 1 ? "" : "s"}
          </div>
        }
      />

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            placeholder="Search year, section, semester, or status..."
            className="w-full lg:max-w-xl"
          />

          <div className="flex flex-wrap items-center gap-2">
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
          <LoadingState label="Loading section data..." />
        ) : (
          <SectionTable sections={displayedSections} />
        )}
      </Panel>
    </section>
  );
}

export default SectionList;
