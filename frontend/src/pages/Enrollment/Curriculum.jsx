import { useEffect, useMemo, useState } from "react";
import CurriculumTable from "./components/CurriculumTable";
import PageHeader from "./components/ui/PageHeader";
import Panel from "./components/ui/Panel";

function Curriculum() {
  useEffect(() => {
    document.title = "Curriculum - IITI Enrollment System";
  }, []);

  const [lastRegularImportAt, setLastRegularImportAt] = useState(() =>
    window.localStorage.getItem("curriculumLastRegularImportAt")
  );

  const updatedLabel = useMemo(() => {
    if (!lastRegularImportAt) return "Updated list as of 2025";

    const parsed = new Date(lastRegularImportAt);
    if (Number.isNaN(parsed.getTime())) return "Updated list as of 2025";

    return `Updated ${parsed.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`;
  }, [lastRegularImportAt]);

  const handleRegularImportSuccess = (dateValue) => {
    const isoDate = (dateValue instanceof Date ? dateValue : new Date()).toISOString();
    setLastRegularImportAt(isoDate);
    window.localStorage.setItem("curriculumLastRegularImportAt", isoDate);
  };

  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Academic program"
        title="Curriculum"
        description="Review regular and irregular curriculum subjects by year and semester."
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
            <i className="fa-regular fa-calendar-check" />
            {updatedLabel}
          </div>
        }
      />

      <Panel className="min-h-[560px] overflow-hidden p-2 sm:p-5">
        <CurriculumTable onRegularImportSuccess={handleRegularImportSuccess} />
      </Panel>
    </section>
  );
}

export default Curriculum;
