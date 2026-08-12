import React, { useMemo, useState, useEffect } from "react";
import api from "../lib/axios";
import toast from "../lib/toast";
import { csvToJson, xlsxToJson, jsonToCsv, jsonToXlsxBlob, downloadFile, downloadBlob } from "../lib/curriculumUtils";

const YEAR_MAP = {
  "1st": "1st",
  "2nd": "2nd",
  "3rd": "3rd",
  "4th": "4th",
};

export default function CurriculumTable({ onRegularImportSuccess }) {
  const [activeYear, setActiveYear] = useState("1st");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [irregularStudents, setIrregularStudents] = useState([]);
  const [irregularLoading, setIrregularLoading] = useState(false);
  const [irregularQuery, setIrregularQuery] = useState("");
  const [selectedIrregularStudent, setSelectedIrregularStudent] = useState(null);
  const [selectedIrregularCurriculum, setSelectedIrregularCurriculum] = useState(null);
  const [irregularCurriculumLoading, setIrregularCurriculumLoading] = useState(false);
  const [showIrregularModal, setShowIrregularModal] = useState(false);
  const [showIrregularExportModal, setShowIrregularExportModal] = useState(false);
  const [studentsWithCurriculum, setStudentsWithCurriculum] = useState(new Set());

  const yearKeys = useMemo(
    () => ["1st", "2nd", "3rd", "4th", "irregular"],
    []
  );

  const yearLabels = useMemo(
    () => ["First Year", "Second Year", "Third Year", "Fourth Year", "Irregular"],
    []
  );

  const isIrregularTab = activeYear === "irregular";

  const irregularFilteredStudents = useMemo(() => {
    const q = String(irregularQuery ?? "").trim().toLowerCase();
    if (!q) return irregularStudents;

    return irregularStudents.filter((student) => {
      const number = String(student.student_number ?? "").toLowerCase();
      const first = String(student.first_name ?? "").toLowerCase();
      const last = String(student.last_name ?? "").toLowerCase();
      const full = `${first} ${last}`.trim().toLowerCase();
      const reverse = `${last} ${first}`.trim().toLowerCase();

      if (/^[a-z]/i.test(q)) {
        return first.includes(q) || last.includes(q) || full.includes(q) || reverse.includes(q);
      }

      return number.includes(q);
    });
  }, [irregularStudents, irregularQuery]);

  useEffect(() => {
    const fetchCurriculum = async () => {
      if (isIrregularTab) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await api.get(`/curriculum/${YEAR_MAP[activeYear]}`, {
          params: { t: Date.now() },
          headers: { "Cache-Control": "no-cache" },
        });
        setData(res.data);
      } catch (error) {
        console.error("Error fetching curriculum", error);
        toast.error("Failed to load curriculum data");
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCurriculum();
  }, [activeYear, isIrregularTab]);

  useEffect(() => {
    const fetchIrregularStudents = async () => {
      try {
        setIrregularLoading(true);
        const res = await api.get("/students", {
          params: {
            status: "Irregular",
            t: Date.now(),
          },
        });
        const students = Array.isArray(res.data) ? res.data : [];
        setIrregularStudents(students);

        // Fetch curriculum status for each irregular student
        const withCurriculum = new Set();
        for (const student of students) {
          const studentNumber = String(student.student_number ?? "").trim();
          if (!studentNumber) continue;
          
          try {
            const currRes = await api.get(
              `/curriculum/doc/${encodeURIComponent(studentNumber)}`,
              { params: { t: Date.now() } }
            );
            if (currRes.data) {
              withCurriculum.add(studentNumber);
            }
          } catch {
            // If 404 or error, student doesn't have curriculum
            // Continue without adding to the set
          }
        }
        setStudentsWithCurriculum(withCurriculum);
      } catch (error) {
        console.error("Error fetching irregular students", error);
        toast.error("Failed to load irregular students");
        setIrregularStudents([]);
        setStudentsWithCurriculum(new Set());
      } finally {
        setIrregularLoading(false);
      }
    };

    fetchIrregularStudents();
  }, []);

  const getTotals = (subjects) =>
    (subjects || []).reduce(
      (acc, sub) => ({
        lec: acc.lec + Number(sub.lecture || 0),
        lab: acc.lab + Number(sub.laboratory || 0),
        units: acc.units + Number(sub.units || 0),
      }),
      { lec: 0, lab: 0, units: 0 }
    );

  const parseCurriculumImportFile = async (file) => {
    const fileName = String(file?.name ?? "").toLowerCase();
    const isCsv = fileName.endsWith(".csv");
    const isXlsx = fileName.endsWith(".xlsx");

    if (!isCsv && !isXlsx) {
      throw new Error("Please select a valid CSV or XLSX file");
    }

    let jsonData;
    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      jsonData = xlsxToJson(buffer);
    } else {
      const text = await file.text();
      jsonData = csvToJson(text);
    }

    if (!jsonData?.[0] || typeof jsonData[0] !== "object") {
      throw new Error("Invalid curriculum template format");
    }

    // Use a plain JSON-safe object for API payload consistency.
    return JSON.parse(JSON.stringify(jsonData[0]));
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const parsedJson = await parseCurriculumImportFile(file);

      const payload = {
        year: YEAR_MAP[activeYear],
        data: parsedJson,
      };

      const postRes = await api.post("/curriculum", payload);
      const replacedId =
        postRes?.data?.replacedDocumentId ||
        postRes?.data?.data?._id ||
        `curriculum_${YEAR_MAP[activeYear]}_year`;

      toast.success(`Replaced ${replacedId}`);

      if (postRes?.data?.data && typeof postRes.data.data === "object") {
        setData(postRes.data.data);
      }

      const res = await api.get(`/curriculum/${YEAR_MAP[activeYear]}`, {
        params: { t: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      setData(res.data);

      if (typeof onRegularImportSuccess === "function") {
        onRegularImportSuccess(new Date());
      }
    } catch (error) {
      console.error("Error importing curriculum", error);
      toast.error(error?.response?.data?.message || error?.message || "Failed to import curriculum");
    } finally {
      setIsUploading(false);
    }

    e.target.value = "";
  };

  const handleExport = () => {
    if (!data) {
      toast.error("No data to export");
      return;
    }

    setShowExportModal(true);
  };

  const handleExportAs = (format) => {
    try {
      if (!data) {
        toast.error("No data to export");
        return;
      }

      if (format === "xlsx") {
        const blob = jsonToXlsxBlob([data]);
        const filename = `curriculum_${YEAR_MAP[activeYear]}_year.xlsx`;
        downloadBlob(blob, filename);
      } else {
        const csv = jsonToCsv([data]);
        const filename = `curriculum_${YEAR_MAP[activeYear]}_year.csv`;
        downloadFile(csv, filename);
      }

      toast.success("Curriculum exported successfully");
      setShowExportModal(false);
    } catch (error) {
      console.error("Error exporting curriculum", error);
      toast.error("Failed to export curriculum");
    }
  };

  const openIrregularStudent = async (student) => {
    const docId = String(student?.student_number ?? "").trim();
    if (!docId) {
      toast.error("Student number is required");
      return;
    }

    setSelectedIrregularStudent(student);
    setSelectedIrregularCurriculum(null);
    setShowIrregularModal(true);

    try {
      setIrregularCurriculumLoading(true);
      const res = await api.get(`/curriculum/doc/${encodeURIComponent(docId)}`);
      setSelectedIrregularCurriculum(res.data ?? null);
    } catch (error) {
      if (error?.response?.status !== 404) {
        toast.error("Failed to load irregular curriculum");
      }
      setSelectedIrregularCurriculum(null);
    } finally {
      setIrregularCurriculumLoading(false);
    }
  };

  const handleImportIrregularCurriculum = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedIrregularStudent) return;

    try {
      setIrregularCurriculumLoading(true);
      const parsedJson = await parseCurriculumImportFile(file);

      const docId = String(selectedIrregularStudent.student_number ?? "").trim();
      const postRes = await api.post(`/curriculum/doc/${encodeURIComponent(docId)}`, {
        data: parsedJson,
      });

      if (postRes?.data?.data) {
        setSelectedIrregularCurriculum(postRes.data.data);
        // Add to students with curriculum set
        setStudentsWithCurriculum((prev) => new Set([...prev, docId]));
      }

      const replacedId = postRes?.data?.replacedDocumentId || docId;
      toast.success(`Replaced ${replacedId}`);
    } catch (error) {
      console.error("Error importing irregular curriculum", error);
      toast.error(error?.response?.data?.message || error?.message || "Failed to import curriculum");
    } finally {
      setIrregularCurriculumLoading(false);
      e.target.value = "";
    }
  };

  const handleExportIrregularAs = (format) => {
    try {
      if (!selectedIrregularStudent || !selectedIrregularCurriculum) {
        toast.error("No data to export");
        return;
      }

      const studentNumber = String(selectedIrregularStudent.student_number ?? "").trim();
      const first = String(selectedIrregularStudent.first_name ?? "").trim();
      const last = String(selectedIrregularStudent.last_name ?? "").trim();
      const studentName = `${first} ${last}`.trim();
      const base = `curriculum_${studentNumber}_${studentName}`;

      if (format === "xlsx") {
        const blob = jsonToXlsxBlob([selectedIrregularCurriculum]);
        downloadBlob(blob, `${base}.xlsx`);
      } else {
        const csv = jsonToCsv([selectedIrregularCurriculum]);
        downloadFile(csv, `${base}.csv`);
      }

      toast.success("Curriculum exported successfully");
      setShowIrregularExportModal(false);
    } catch (error) {
      console.error("Error exporting irregular curriculum", error);
      toast.error("Failed to export curriculum");
    }
  };

  const renderTable = (semesterIndex, title) => {
    if (!data?.semesters?.[semesterIndex]) {
      return (
        <div className="flex-1 w-full min-h-[420px] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all duration-200 hover:shadow-md">
          <div className="bg-gray-50/80 border-b border-gray-100 px-5 py-4">
            <h3 className="text-gray-800 font-bold text-sm uppercase tracking-widest text-center">
              {title}
            </h3>
          </div>
          <div className="flex-1 flex items-center justify-center p-8">
            <p className="text-gray-500">No data available</p>
          </div>
        </div>
      );
    }

    const semesterData = data.semesters[semesterIndex].subjects || [];
    const totals = getTotals(semesterData);

    return (
      <div className="flex-1 w-full min-h-[420px] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-all duration-200 hover:shadow-md">
        <div className="bg-gray-50/80 border-b border-gray-100 px-5 py-4">
          <h3 className="text-gray-800 font-bold text-sm uppercase tracking-widest text-center">
            {title}
          </h3>
        </div>

        <div className="w-full h-[340px] overflow-y-auto custom-scrollbar flex-1">
          <table className="w-full min-w-[550px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[48%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>

            <thead className="bg-[#E4F6E2] text-[#315B46] border-b border-[#BFD9BC]">
              <tr>
                <th className="font-semibold uppercase py-3 px-4 text-left whitespace-nowrap text-xs tracking-wider">
                  Code
                </th>
                <th className="font-semibold uppercase py-3 px-4 text-left whitespace-nowrap text-xs tracking-wider">
                  Title
                </th>
                <th className="font-semibold uppercase py-3 px-4 text-center whitespace-nowrap text-xs tracking-wider">
                  Lec
                </th>
                <th className="font-semibold uppercase py-3 px-4 text-center whitespace-nowrap text-xs tracking-wider">
                  Lab
                </th>
                <th className="font-semibold uppercase py-3 px-4 text-center whitespace-nowrap text-xs tracking-wider">
                  Units
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {semesterData.map((sub, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="py-3 px-4 text-gray-800 font-medium whitespace-nowrap">
                    {sub.subject_code || sub.code || ""}
                  </td>
                  <td className="py-3 px-4 text-gray-600 break-words leading-relaxed">
                    {sub.title || ""}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500 whitespace-nowrap">
                    {sub.lecture || 0}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-500 whitespace-nowrap">
                    {sub.laboratory || 0}
                  </td>
                  <td className="py-3 px-4 text-center text-gray-900 font-semibold whitespace-nowrap">
                    {sub.units || 0}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot className="bg-gray-50/80 border-t border-gray-200">
              <tr>
                <td colSpan={2} className="py-4 px-5 text-right font-bold text-gray-500 text-xs tracking-widest uppercase">
                  Total
                </td>
                <td className="py-4 px-4 text-center text-gray-700 font-bold">
                  {totals.lec}
                </td>
                <td className="py-4 px-4 text-center text-gray-700 font-bold">
                  {totals.lab}
                </td>
                <td className="py-4 px-4 text-center text-[#2E522A] font-bold text-base">
                  {totals.units}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const renderIrregularList = () => {
    return (
      <div className="w-full flex flex-col gap-5">
        <div className="relative max-w-xl">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
          </div>
          <input
            type="search"
            placeholder="Search Student Name or Number..."
            value={irregularQuery}
            onChange={(e) => setIrregularQuery(e.target.value)}
            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
          />
          {irregularQuery && (
            <button
              type="button"
              onClick={() => setIrregularQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
            >
              ✕
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[420px]">
          {irregularLoading ? (
            <div className="h-[420px] flex flex-col items-center justify-center text-gray-500 gap-3">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#2E522A]"></i>
              <p className="text-sm font-medium">Loading irregular students...</p>
            </div>
          ) : (
            <div className="h-[420px] overflow-y-auto custom-scrollbar">
              <table className="min-w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-[#E4F6E2] border-b border-[#BFD9BC] text-[#315B46]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Student Number</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Student Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {irregularFilteredStudents.length ? (
                    irregularFilteredStudents.map((student) => {
                      const hasCurriculum = studentsWithCurriculum.has(String(student.student_number ?? "").trim());
                      const rowClasses = hasCurriculum
                        ? "cursor-pointer hover:bg-gray-50/80 transition-colors"
                        : "cursor-pointer hover:bg-red-50/80 transition-colors bg-red-50 border-l-4 border-l-red-500";
                      
                      return (
                        <tr
                          key={student._id || student.student_number}
                          onClick={() => openIrregularStudent(student)}
                          className={rowClasses}
                        >
                          <td className="px-4 py-3 text-gray-800 font-medium">{student.student_number}</td>
                          <td className="px-4 py-3 text-gray-700">{`${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-10 text-center text-gray-500">No irregular students found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading && !isIrregularTab) {
    return (
      <div className="w-full h-[60vh] flex flex-col items-center justify-center text-gray-500 font-sans">
        <i className="fa-solid fa-circle-notch fa-spin text-4xl mb-4 text-[#2E522A]"></i>
        <p className="text-lg font-medium">Loading Curriculum Data...</p>
      </div>
    );
  }

  return (
    <div className="w-full font-sans flex flex-col h-full max-w-[1600px] mx-auto">
      {isUploading && !isIrregularTab && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
            <h3 className="text-lg font-semibold text-gray-900">Uploading Curriculum</h3>
            <p className="mt-2 text-sm text-gray-600">
              Please wait while we process and save your CSV file.
            </p>
          </div>
        </div>
      )}

      {showExportModal && !isIrregularTab && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Export as</h3>
            <p className="mt-1 text-sm text-gray-600">Choose the file format for this curriculum export.</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleExportAs("xlsx")}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
              >
                XLSX
              </button>
              <button
                onClick={() => handleExportAs("csv")}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                CSV
              </button>
            </div>

            <button
              onClick={() => setShowExportModal(false)}
              className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showIrregularModal && (
        <div className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto bg-black/45 backdrop-blur-sm p-4 md:p-6">
          <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden my-4">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Irregular Curriculum</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedIrregularStudent?.student_number} <span className="mx-1">•</span> {`${selectedIrregularStudent?.first_name ?? ""} ${selectedIrregularStudent?.last_name ?? ""}`.trim()}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowIrregularModal(false);
                  setSelectedIrregularCurriculum(null);
                  setSelectedIrregularStudent(null);
                }}
                className="text-gray-400 hover:text-gray-800 bg-white hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-5 bg-gray-50/60 min-h-[420px]">
              {irregularCurriculumLoading ? (
                <div className="min-h-[260px] flex flex-col items-center justify-center text-gray-500 gap-3">
                  <i className="fa-solid fa-circle-notch fa-spin text-3xl text-[#2E522A]"></i>
                  <p className="text-sm font-medium">Loading curriculum...</p>
                </div>
              ) : selectedIrregularCurriculum ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="min-w-full text-sm border-collapse">
                      <thead className="bg-[#E4F6E2] border-b border-[#BFD9BC] text-[#315B46]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Code</th>
                          <th className="px-4 py-3 text-left text-xs uppercase tracking-wider font-semibold">Title</th>
                          <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Lec</th>
                          <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Lab</th>
                          <th className="px-4 py-3 text-center text-xs uppercase tracking-wider font-semibold">Units</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(selectedIrregularCurriculum.subjects || []).map((subject, idx) => (
                          <tr key={`${subject.subject_code || subject.code || "subject"}-${idx}`} className="hover:bg-gray-50/80">
                            <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{subject.subject_code || subject.code || "-"}</td>
                            <td className="px-4 py-3 text-gray-700">{subject.title || "-"}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{subject.lecture ?? 0}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{subject.laboratory ?? 0}</td>
                            <td className="px-4 py-3 text-center text-gray-800 font-semibold">{subject.units ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              ) : (
                <div className="min-h-[260px] flex flex-col items-center justify-center text-center text-gray-500 gap-2">
                  <i className="fa-regular fa-folder-open text-4xl opacity-60"></i>
                  <p className="text-base font-semibold text-gray-700">No curriculum file found for this student.</p>
                  <p className="text-sm text-gray-500">Import a curriculum file to create one.</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-white flex flex-wrap justify-end gap-3">
              <label className="flex items-center gap-2.5 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors cursor-pointer">
                <i className="fa-solid fa-file-import text-sm"></i>
                Import Curriculum File
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleImportIrregularCurriculum}
                  disabled={irregularCurriculumLoading}
                  className="hidden"
                />
              </label>

              <button
                onClick={() => setShowIrregularExportModal(true)}
                disabled={!selectedIrregularCurriculum}
                className="flex items-center gap-2.5 bg-green-600 disabled:opacity-60 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                <i className="fa-solid fa-file-export text-sm"></i>
                Export Curriculum
              </button>
            </div>
          </div>
        </div>
      )}

      {showIrregularExportModal && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Export as</h3>
            <p className="mt-1 text-sm text-gray-600">Choose the file format for this curriculum export.</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleExportIrregularAs("xlsx")}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors"
              >
                XLSX
              </button>
              <button
                onClick={() => handleExportIrregularAs("csv")}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                CSV
              </button>
            </div>

            <button
              onClick={() => setShowIrregularExportModal(false)}
              className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 lg:mb-8 shrink-0">
        {yearKeys.map((year, idx) => {
          const isActive = activeYear === year;
          return (
            <button
              key={year}
              onClick={() => setActiveYear(year)}
              className={`px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold tracking-wide uppercase transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2E522A] cursor-pointer hover:-translate-y-0.5 ${
                isActive
                  ? "bg-[#2E522A] text-white shadow-md"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 shadow-sm"
              }`}
            >
              {yearLabels[idx]}
            </button>
          );
        })}
      </div>

      {isIrregularTab ? (
        <div className="flex-1">{renderIrregularList()}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8 w-full flex-1">
            {renderTable(0, "First Semester")}
            {renderTable(1, "Second Semester")}
          </div>

          <div className="flex flex-wrap justify-end gap-3 sm:gap-4 mt-8 lg:mt-10 shrink-0 pb-6 border-t border-gray-200 pt-6">
            <label className="flex items-center gap-2.5 bg-blue-600 text-white px-6 sm:px-8 py-3 rounded-xl font-medium shadow-sm hover:bg-blue-700 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 active:scale-95 cursor-pointer">
              <i className="fa-solid fa-file-import text-sm"></i>
              Import Curriculum File
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleImport}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            <button
              onClick={handleExport}
              disabled={isUploading}
              className="flex items-center gap-2.5 bg-green-600 text-white px-6 sm:px-8 py-3 rounded-xl font-medium shadow-sm hover:bg-green-700 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 active:scale-95"
            >
              <i className="fa-solid fa-file-export text-sm"></i>
              Export Curriculum
            </button>
          </div>
        </>
      )}
    </div>
  );
}
