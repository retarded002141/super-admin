import { PRE_ADVISING_API } from '../../services/api';
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, UserCircle, UploadCloud, Search, ArrowLeft, ChevronRight, Eye, Printer } from "lucide-react";
import { getAcademicYearShort } from "../shared/academicYear";
import CorPreview from "../shared/CorPreview";

export default function Dashboard({ navigateToTab, navigationState }) {
  const [students, setStudents] = useState([]);
  const [subjectsData, setSubjectsData] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalRegular, setTotalRegular] = useState(0);
  const [totalIrregular, setTotalIrregular] = useState(0);
  const [totalAdvised, setTotalAdvised] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Total");

  const [lookupStudentName, setLookupStudentName] = useState("");
  const [lookupStudentId, setLookupStudentId] = useState("");
  const [lookupYearSection, setLookupYearSection] = useState("");
  const [lookupYearLevel, setLookupYearLevel] = useState("");
  const [lookupAllGrades, setLookupAllGrades] = useState([]);
  const [lookupGrades, setLookupGrades] = useState([]);
  const [lookupSemesterOptions, setLookupSemesterOptions] = useState([]);
  const [lookupSelectedSemester, setLookupSelectedSemester] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  const [activeSubjectCode, setActiveSubjectCode] = useState(null);
  const [subjectPopupTop, setSubjectPopupTop] = useState(0);
  const [isPopupUpward, setIsPopupUpward] = useState(false);
  const subjectTableRef = useRef(null);
  const subjectPopupRef = useRef(null);

  const [dashboardView, setDashboardView] = useState("overview"); 
  const [detailedStudent, setDetailedStudent] = useState(null);
  const [advisedStudentPreview, setAdvisedStudentPreview] = useState(null);
  const [advisingRecords, setAdvisingRecords] = useState([]);
  const [schedulesData, setSchedulesData] = useState([]);

  const buildSemLabel = (grade) => {
    if (grade.semester === "Credited" || (grade.status || "").toLowerCase() === "credited") return "Credited";
    if (grade.semester && grade.schoolYear) return `${grade.semester} ${grade.schoolYear}`;
    return "Unknown";
  };

  const semesterSortKey = (label) => {
    if (label === "Credited") return -1;
    const match = label.match(/(\d+)(?:st|nd|rd|th)?\s+Semester\s+(\d{4})/i);
    if (!match) return 0;
    return parseInt(match[2]) * 10 + parseInt(match[1]);
  };

  const getSemesterOptions = (grades) => {
    const semMap = new Map();
    grades.forEach((grade) => {
      const label = buildSemLabel(grade);
      if (label) semMap.set(label, semesterSortKey(label));
    });

    const sorted = [...semMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label);

    if (!sorted.includes("Credited")) sorted.push("Credited");
    return sorted;
  };

  const getGradesForSemester = (grades, semester) =>
    grades.filter((grade) => buildSemLabel(grade) === semester);

  const loadStudentById = (id) => {
    const studentId = String(id || "").trim();
    if (!studentId) return;

    setLookupLoading(true);
    setLookupError("");

    // Directly search the live state populated by MongoDB
    const foundStudent = students.find((student) =>
      [student.studentNumber, student.studentId, student.id, student.applicantId]
        .some((value) => String(value ?? "").trim() === studentId)
    );

    if (foundStudent) {
      const grades = foundStudent.grades || [];
      // Use studentNumber first to match your MongoDB schema
      const dbStudentNumber = foundStudent.studentNumber || foundStudent.studentId || foundStudent.applicantId || foundStudent.id;
      const dbStudentName = foundStudent.name || `${foundStudent.firstName || foundStudent.first_name || ""} ${foundStudent.lastName || foundStudent.last_name || ""}`.trim();

      setLookupStudentName(dbStudentName);
      setLookupStudentId(dbStudentNumber);
      setLookupYearSection(foundStudent.section || "");
      setLookupYearLevel(foundStudent.year || foundStudent.yearLevel || "");
      setLookupAllGrades(grades);

      const semOptions = getSemesterOptions(grades);
      setLookupSemesterOptions(semOptions);
      const selected = semOptions[0] || "";
      setLookupSelectedSemester(selected);
      setLookupGrades(getGradesForSemester(grades, selected));
    } else {
      setLookupError("Student information not found.");
      setLookupGrades([]);
      setLookupAllGrades([]);
      setLookupSemesterOptions([]);
      setLookupStudentName("");
      setLookupYearSection("");
      setLookupYearLevel("");
    }
    
    setLookupLoading(false);
  };

  const handleSelectStudent = (student) => {
    const studentId = student.studentNumber || student.studentId || student.applicantId || student.id;
    if (!studentId) return;
    loadStudentById(studentId);
  };

  const handleStudentIdKeyDown = (e) => {
    if (e.key === "Enter") {
      loadStudentById(lookupStudentId);
    }
  };

  useEffect(() => {
    if (!lookupSelectedSemester) return;
    setLookupGrades(getGradesForSemester(lookupAllGrades, lookupSelectedSemester));
  }, [lookupAllGrades, lookupSelectedSemester]);

  const refreshDashboard = async () => {
    try {
      const [studentsRes, subjectsRes, advisingRes, schedulesRes] = await Promise.all([
        fetch(`${PRE_ADVISING_API}/students`),
        fetch(`${PRE_ADVISING_API}/subjects`),
        fetch(`${PRE_ADVISING_API}/advising`).catch(() => ({ ok: false })),
        fetch(`${PRE_ADVISING_API}/schedules`).catch(() => ({ ok: false }))
      ]);

      if (!studentsRes.ok || !subjectsRes.ok) throw new Error("Failed to fetch data");
      
      const dbStudents = await studentsRes.json();
      const dbSubjects = await subjectsRes.json();
      const advisingData = advisingRes.ok ? await advisingRes.json() : [];
      const schedulesData = schedulesRes.ok ? await schedulesRes.json() : [];

      const total = dbStudents.length;
      const regular = dbStudents.filter(s => { const st = (s.status || "").toLowerCase(); return st === "regular" || st === "block"; }).length;
      const irregular = dbStudents.filter(s => (s.status || "").toLowerCase() === "irregular").length;
      const advised = dbStudents.filter(s => (s.enrollmentStatus || "").toLowerCase() === "advised").length;

      setStudents(dbStudents);
      setSubjectsData(dbSubjects);
      setAdvisingRecords(Array.isArray(advisingData) ? advisingData : []);
      setSchedulesData(Array.isArray(schedulesData) ? schedulesData : []);
      setTotalStudents(total);
      setTotalRegular(regular);
      setTotalIrregular(irregular);
      setTotalAdvised(advised);
    } catch (error) {
      console.error("Database connection error:", error);
    }
  };

  useEffect(() => {
    refreshDashboard();
  }, [])

  useEffect(() => {
    if (!activeSubjectCode) return;
    const handleOutsideClick = (e) => {
      if (
        subjectPopupRef.current &&
        !subjectPopupRef.current.contains(e.target)
      ) {
        setActiveSubjectCode(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [activeSubjectCode]);

  const getSubjectHistory = (code) =>
    lookupAllGrades.filter(
      (g) => (g.subjectCode || g.code || "") === code
    );

  const handleSubjectRowClick = (e, grade) => {
    const code = grade.subjectCode || grade.code || "";
    if (!code) return;

    if (activeSubjectCode === code) {
      setActiveSubjectCode(null);
      return;
    }

    const rowRect = e.currentTarget.getBoundingClientRect();
    const containerRect = subjectTableRef.current?.getBoundingClientRect();
    
    if (containerRect) {
      const scrollTop = subjectTableRef.current?.scrollTop || 0;
      const relativeTop = rowRect.top - containerRect.top + scrollTop;
      
      const isBottomHalf = (rowRect.top - containerRect.top) > (containerRect.height / 2);
      
      setIsPopupUpward(isBottomHalf);
      setSubjectPopupTop(isBottomHalf ? relativeTop : relativeTop + rowRect.height);
    }
    setActiveSubjectCode(code);
  };

  // Intercept the render to show the full-page record if "View" is clicked
  if (dashboardView === "record" && detailedStudent) {
    return (
      <StudentRecordView 
        student={detailedStudent} 
        subjectsData={subjectsData} 
        onBack={() => setDashboardView("overview")} 
      />
    );
  }

  return (
    <div className="font-RB w-full bg-[#f5f6f8] flex-1 flex flex-col">
      
      

      {/* MAIN CONTENT CANVAS: Edge-to-Edge, Fluid Width */}
      <div className="p-6 flex-1 flex flex-col">
        
        {/* THE MASTER CARD (Box-in-a-Box Architecture) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col lg:flex-row gap-6 flex-1 min-h-[650px]">
          
          {/* LEFT COLUMN: Student Management (60%) */}
          <div className="w-full lg:w-[60%] flex flex-col h-full border-b lg:border-b-0 lg:border-r border-slate-100 pb-6 lg:pb-0 lg:pr-6">
            
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
              
              {/* Search & Add */}
              <div className="flex items-center gap-3 w-full xl:w-auto flex-1">
                <div className="flex-1 flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:border-[#1C6100] focus-within:ring-2 focus-within:ring-[#1C6100]/20 transition-all bg-white">
                  <div className="pl-4 text-slate-400">
                    <Search size={18} strokeWidth={2} />
                  </div>
                  <input
                    type="text"
                    placeholder="Search by name, ID, or status..."
                    className="w-full px-3 py-2.5 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400 font-medium"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Integrated Tabs as Direct Filters */}
              <div className="flex bg-slate-100 p-1.5 rounded-lg w-full xl:w-auto shadow-inner">
                <button 
                  onClick={() => setActiveTab("Total")}
                  className={`flex-1 xl:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "Total" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Total ({totalStudents})
                </button>
                <button 
                  onClick={() => setActiveTab("Regular")}
                  className={`flex-1 xl:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "Regular" ? "bg-white text-[#1C6100] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Regular ({totalRegular})
                </button>
                <button 
                  onClick={() => setActiveTab("Irregular")}
                  className={`flex-1 xl:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "Irregular" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Irregular ({totalIrregular})
                </button>
                <button 
                  onClick={() => setActiveTab("Advised")}
                  className={`flex-1 xl:flex-none px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === "Advised" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Advised ({totalAdvised})
                </button>
              </div>
            </div>

            {/* Fluid Table Container: Stretches to the floor */}
            <div className="w-full flex-1 overflow-y-auto overflow-x-hidden border border-slate-200 rounded-lg bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4 font-bold border-b border-slate-200">Student ID / Applicant ID</th>
                    <th className="px-6 py-4 font-bold border-b border-slate-200">Name</th>
                    <th className="px-6 py-4 font-bold text-center border-b border-slate-200">Status</th>
                    <th className="px-6 py-4 font-bold text-center border-b border-slate-200">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const filteredStudents = (students || []).filter((s) => {
                      const searchMatch = 
                        (s.name || `${s.firstName || s.first_name || ''} ${s.lastName || s.last_name || ''}`.trim()).toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (s.studentNumber || s.studentId || s.applicantId || '').toString().includes(searchQuery);
                      
                      let tabMatch = true;
                      if (activeTab === "Regular") { const st = (s.status ?? "").toLowerCase(); tabMatch = st === "regular" || st === "block"; }
                      else if (activeTab === "Irregular") tabMatch = (s.status ?? "").toLowerCase() === "irregular";
                      else if (activeTab === "Advised") tabMatch = (s.enrollmentStatus ?? "").toLowerCase() === "advised";
                      return searchMatch && tabMatch;
                    });

                    if (filteredStudents.length > 0) {
                      return filteredStudents.map((s, i) => {
                        const st = (s.status ?? "").toLowerCase(); const isRegular = st === "regular" || st === "block";
                        const isAdvised = activeTab === "Advised";
                        
                        return (
                          <tr key={i} onClick={() => {
                            if (isAdvised) {
                              setAdvisedStudentPreview(s);
                            } else {
                              handleSelectStudent(s);
                            }
                          }} className="hover:bg-slate-50/80 transition-colors cursor-pointer group">
                            <td className="px-6 py-4 font-bold text-slate-700">{s.studentNumber || s.studentId || s.applicantId || "—"}</td>
                            <td className="px-6 py-4 text-slate-600 font-medium">{s.name || `${s.firstName || s.first_name || ""} ${s.lastName || s.last_name || ""}`.trim() || "-"}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${isRegular ? 'bg-green-100 text-[#1C6100]' : isAdvised ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                {isAdvised ? "Advised" : (s.status ?? "—")}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isAdvised) {
                                    setAdvisedStudentPreview(s);
                                  } else {
                                    setDetailedStudent(s);
                                    setDashboardView("record");
                                  }
                                }}
                                className="px-4 py-1.5 bg-white text-slate-600 hover:bg-[#1C6100] hover:text-white hover:border-[#1C6100] rounded-lg text-xs font-bold transition-colors border border-slate-200 shadow-sm flex items-center gap-1.5 mx-auto"
                              >
                                {isAdvised ? <Eye size={14} /> : null}
                                {isAdvised ? "Preview" : "View"}
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    }

                    return (
                      <tr>
                        <td colSpan="4" className="py-20 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <Search size={40} strokeWidth={1.5} className="mb-3 opacity-50 text-slate-300" />
                            <p className="text-base font-bold text-slate-600">No students found.</p>
                            <p className="text-sm mt-1">Try adjusting your search criteria.</p>
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COLUMN: Nested Card for Record + Grades (40%) */}
          <div className="w-full lg:w-[40%] flex flex-col h-full bg-slate-50/50 border border-slate-200 rounded-xl p-5 gap-5 shadow-inner relative overflow-hidden">
            
            {/* Top: Record Inputs */}
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Student Record</h2>
              <input type="text" placeholder="Student Name" value={lookupStudentName} onChange={(e) => setLookupStudentName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-[#1C6100]/20 transition-all placeholder-slate-400 shadow-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Student ID / Applicant ID" value={lookupStudentId} onKeyDown={handleStudentIdKeyDown} onChange={(e) => setLookupStudentId(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-[#1C6100]/20 transition-all placeholder-slate-400 shadow-sm" />
                <input type="text" placeholder="Year Level" value={lookupYearLevel} readOnly className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200/60 rounded-lg text-sm text-slate-500 font-bold outline-none cursor-not-allowed placeholder-slate-400" />
              </div>
              <input type="text" placeholder="Section" value={lookupYearSection} readOnly className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200/60 rounded-lg text-sm text-slate-500 font-bold outline-none cursor-not-allowed placeholder-slate-400" />
            </div>

            {/* Bottom: Rigid Grades Table */}
            <div className="flex-1 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col relative min-h-[250px] shadow-sm">
              <div ref={subjectTableRef} className="absolute inset-0 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-5 py-4 font-bold border-b border-slate-200">Code</th>
                      <th className="px-5 py-4 font-bold border-b border-slate-200">Subject Title</th>
                      <th className="px-5 py-4 font-bold text-center border-b border-slate-200">Units</th>
                      <th className="px-5 py-4 font-bold text-center border-b border-slate-200">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lookupLoading ? (
                      <tr><td colSpan="4" className="py-12 text-center text-slate-400 font-bold">Loading grades...</td></tr>
                    ) : lookupGrades.length > 0 ? (
                      lookupGrades.map((grade, index) => {
                        const statusRaw = (grade.status || "").toLowerCase();
                        const passed = ["completed", "credited", "passed"].includes(statusRaw);
                        const code = grade.subjectCode || grade.code || "";
                        
                        // Cross-reference the Curriculum API to get title and units
                        const matchedSubject = subjectsData.find(s => s.subjectCode === code) || {};
                        const title = grade.subjectTitle || grade.title || matchedSubject.subjectTitle || "Unknown Subject";
                        const units = grade.units ?? matchedSubject.units ?? "-";
                        
                        return (
                          <tr key={index} onClick={(e) => handleSubjectRowClick(e, grade)} className={`relative group hover:bg-slate-50/80 transition-colors cursor-pointer ${activeSubjectCode === code ? "bg-green-50/30" : ""}`}>
                            <td className="px-5 py-3.5 font-bold text-slate-700">
                              {code}
                            </td>
                            <td className="px-5 py-3.5 text-slate-600 font-medium truncate max-w-[120px]" title={title}>{title}</td>
                            <td className="px-5 py-3.5 text-slate-600 font-bold text-center">{units}</td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-flex px-2 py-1 rounded-md text-[11px] uppercase tracking-wider font-bold ${passed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                {passed ? "Completed" : (statusRaw === "failed" ? "Failed" : "Missing")}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="4" className="py-20 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <p className="text-base font-bold text-slate-600">No grades found.</p>
                            <p className="text-sm mt-1">Select a student to view records.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Expanded Right-Column Modal */}
            {activeSubjectCode && (() => {
              const history = lookupAllGrades.filter(g => (g.subjectCode || g.code || "") === activeSubjectCode);
              const attempts = history.length;
              const totalFails = history.filter(g => (g.status || "").toLowerCase() === "failed").length;

              return (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
                  {/* Dimming Background scoped to right column */}
                  <div 
                    className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] cursor-pointer transition-opacity"
                    onClick={() => setActiveSubjectCode(null)}
                  ></div>
                  
                  {/* Modal Content Box - Taller max-height */}
                  <div className="relative bg-slate-800 text-white p-6 rounded-xl text-sm w-full max-w-md shadow-2xl border border-slate-700 flex flex-col max-h-full">
                    <div className="font-bold mb-4 border-b border-slate-600 pb-3 flex justify-between items-center">
                      <span className="text-lg">Subject History</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs bg-slate-700 px-2 py-1 rounded uppercase tracking-wider">{activeSubjectCode}</span>
                        <button onClick={() => setActiveSubjectCode(null)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-700/50 hover:bg-slate-600 p-1.5 rounded">
                          <X size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between mt-2 items-center">
                      <span className="text-slate-300">Total Attempts:</span> 
                      <span className="font-bold text-base">{attempts}</span>
                    </div>
                    <div className="flex justify-between mt-3 items-center">
                      <span className="text-slate-300">Total Fails:</span> 
                      <span className={`font-bold text-base ${totalFails > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{totalFails}</span>
                    </div>
                    
                    <div className="mt-6 mb-3 text-xs text-slate-400 uppercase tracking-widest font-bold">All Records:</div>
                    
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                      {history.length > 0 ? (
                        history.map((past, i) => {
                          const pastSem = past.semester === "Credited" || (past.status || "").toLowerCase() === "credited" ? "Credited" : `${past.semester} ${past.schoolYear}`;
                          const isFailed = (past.status || "").toLowerCase() === "failed";
                          return (
                            <div key={i} className="bg-slate-700 p-4 rounded-lg border border-slate-600 text-left">
                              <div className="flex justify-between items-center border-b border-slate-600 pb-2 mb-2">
                                <span className="font-bold text-slate-200 text-sm">{pastSem}</span> 
                                <span className={`font-bold px-2.5 py-1 rounded text-xs ${isFailed ? "text-red-400 bg-red-400/10" : "text-emerald-400 bg-emerald-400/10"}`}>
                                  {past.status} ({past.finalGrade || "N/A"})
                                </span>
                              </div>
                              <div className="flex justify-between text-xs text-slate-300 mt-2">
                                <span>Prof:</span>
                                <span className="font-medium text-white truncate max-w-[150px]" title={past.professor || "N/A"}>{past.professor || "N/A"}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-slate-400 italic mt-2">No records found.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          
        </div>
      </div>

      {/* ADVISED STUDENT PREVIEW MODAL */}
      {advisedStudentPreview && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[110] font-RB p-4">
          <div className="bg-white w-full max-w-[900px] max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-800">Pre-Advising Record</h2>
                <p className="text-xs text-slate-400 mt-0.5">{advisedStudentPreview?.firstName} {advisedStudentPreview?.lastName} • {advisedStudentPreview?.studentNumber}</p>
              </div>
              <button onClick={() => setAdvisedStudentPreview(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition">
                <X size={18} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 bg-gray-50 flex justify-center">
              {(() => {
                // BUG FIX: Pull directly from the student object! Your server.js already embeds advisedSubjects.
                const passedSubjectCodes = new Set(
                  (advisedStudentPreview?.grades || [])
                    .filter((grade) => ["passed", "credited", "completed"].includes((grade.status || "").toLowerCase()))
                    .map((grade) => grade.subjectCode || grade.code)
                );
                
                const advisedSubjects = (advisedStudentPreview?.advisedSubjects || [])
                  .filter((subject) => !passedSubjectCodes.has(subject.subjectId));
                
                const previewSubjects = advisedSubjects.map((subject) => {
                  const subjectInfo = subjectsData.find((item) => item.subjectCode === subject.subjectId);
                  const targetSection = `${subject.targetProgram || "BSIT"}-${subject.targetYear || ""}${subject.targetSection || ""}`;
                  
                  const sectionSchedules = schedulesData.filter((schedule) => schedule.sectionName === targetSection);
                  const sectionSchedule = sectionSchedules[0] || {};
                  const schedule = (sectionSchedule?.classes || []).filter((item) => item.subjectCode === subject.subjectId);
                  const firstSchedule = schedule[0] || {};

                  return {
                    code: subject.subjectId,
                    title: subjectInfo?.subjectTitle || "Unknown",
                    units: subjectInfo?.units || 0,
                    hours: subjectInfo?.hours || subjectInfo?.units || 0, // Added missing hours mapping
                    schedule: schedule,
                    room: firstSchedule.roomName || "TBA",
                    target: targetSection,
                    instructor: firstSchedule.profName || firstSchedule.instructor || subjectInfo?.instructor || "TBA"
                  };
                });

                return (
                  <CorPreview
                    student={{ ...advisedStudentPreview, status: "ADVISED" }}
                    academicYear={getAcademicYearShort("2025-2026")}
                    subjects={previewSubjects}
                  />
                );
              })()}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button 
                onClick={() => setAdvisedStudentPreview(null)} 
                className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-300 transition"
              >
                Close
              </button>
              <button 
                onClick={() => window.print()} 
                className="px-5 py-2.5 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] transition shadow-sm flex items-center gap-2"
              >
                <Printer size={16} />
                Print Form
              </button>
            </div>
          </div>
        </div>
      )}

      <AddStudentModal
        isOpen={showAddStudentModal}
        onClose={() => setShowAddStudentModal(false)}
        onSave={refreshDashboard}
      />
      
    </div>
  );
}

const initialFormState = {
  surname: "",
  firstName: "",
  middleName: "",
  gender: "",
  yearLevel: "",
  studentStatus: "Freshmen (New)",
};

function AddStudentModal({
  isOpen = true,
  onClose = () => {},
  onSave = () => {},
}) {
  const [form, setForm] = useState(initialFormState);

  if (!isOpen) return null;

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = () => {
    onSave(form);
    handleCancel(); // Close modal on save
  };

  const handleCancel = () => {
    setForm(initialFormState);
    onClose();
  };
}

function StudentRecordView({ student, subjectsData = [], onBack }) {
  const grades = student?.grades || [];

  // Extract and sort unique semesters for the dropdown
  const availableSemesters = React.useMemo(() => {
    const sems = new Set();
    grades.forEach((g) => {
      if (g.semester === "Credited" || g.status === "Credited") {
        sems.add("Credited");
      } else if (g.semester && g.schoolYear) {
        sems.add(`${g.semester} ${g.schoolYear}`);
      }
    });
    // Sort so the most recent years naturally appear at the top
    return Array.from(sems).sort((a, b) => b.localeCompare(a));
  }, [grades]);

  // State for the currently selected semester
  const [selectedSemester, setSelectedSemester] = React.useState(availableSemesters[0] || "");

  // Ensure a valid semester is selected when navigating between students
  React.useEffect(() => {
    if (availableSemesters.length > 0 && !availableSemesters.includes(selectedSemester)) {
      setSelectedSemester(availableSemesters[0]);
    } else if (availableSemesters.length === 0) {
      setSelectedSemester("");
    }
  }, [availableSemesters, selectedSemester]);

  // Filter the grades table based on the dropdown
  const filteredGrades = React.useMemo(() => {
    return grades.filter((g) => {
      if (selectedSemester === "Credited") {
        return g.semester === "Credited" || g.status === "Credited";
      }
      return `${g.semester} ${g.schoolYear}` === selectedSemester;
    });
  }, [grades, selectedSemester]);

  return (
    <div className="font-RB w-full bg-white min-h-screen flex flex-col z-50">
            {/* Top Header with Breadcrumbs */}
      <div className="px-8 py-3.5 border-b border-slate-200 flex items-center bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 text-slate-500 rounded-full transition-colors cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2 text-lg font-bold text-slate-400">
            <span>Student Roster</span>
            <ChevronRight size={16} className="text-slate-300" strokeWidth={2.5} />
            <span className="text-slate-800 font-bold">Record</span>
          </div>
        </div>
      </div>

      <div className="p-10 max-w-[1400px] w-full mx-auto flex-1">
        {/* Student Details Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="text-[15px] font-medium text-slate-800 space-y-2">
            <div className="flex gap-4">
              <span className="w-36">Name :</span>
              <span className="font-bold">{student?.firstName} {student?.lastName}</span>
            </div>
            <div className="flex gap-4">
              <span className="w-36">Year and Section :</span>
              <span className="font-bold">{student?.year ? `${student.year} Year` : ""} {student?.section ? `- Section ${student.section}` : ""}</span>
            </div>
          </div>
          <div className="px-6 py-3 border border-slate-300 rounded text-[15px] text-slate-800">
            Student ID / Applicant ID : <span className="font-bold ml-2">{student?.studentNumber || student?.studentId || student?.applicantId || "N/A"}</span>
          </div>
        </div>

        {/* Dynamic Semester Dropdown */}
        <div className="mb-6 w-[300px]">
          <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1 block relative z-10 bg-white w-max px-1 left-2 top-2">Select Semester</label>
          <select 
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            disabled={availableSemesters.length === 0}
            className="w-full border border-slate-400 rounded-md px-4 py-3 text-[15px] font-medium text-slate-700 outline-none focus:border-[#1C6100] appearance-none bg-transparent relative cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23666%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem top 50%', backgroundSize: '0.65rem auto' }}
          >
            {availableSemesters.length > 0 ? (
              availableSemesters.map((sem, i) => (
                <option key={i} value={sem}>{sem}</option>
              ))
            ) : (
              <option value="">No records available</option>
            )}
          </select>
        </div>

        {/* Detailed Grades Table with Tooltips */}
        <div className="w-full">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b-2 border-slate-200">
                <th className="py-4 font-bold w-[35%] pl-2">Subject Details</th>
                <th className="py-4 font-bold text-center w-[13%]">Prelim</th>
                <th className="py-4 font-bold text-center w-[13%]">Midterm</th>
                <th className="py-4 font-bold text-center w-[13%]">Pre-Final</th>
                <th className="py-4 font-bold text-center w-[13%]">Final</th>
                <th className="py-4 font-bold text-center w-[13%] pr-2">Final Grade</th>
              </tr>
            </thead>
            <tbody>
              {filteredGrades.length > 0 ? (
                filteredGrades.map((grade, idx) => {
                  const isFailed = (grade.status || "").toLowerCase() === "failed";
                  
                  // Cross-reference the Curriculum API
                  const matchedSubject = subjectsData.find(s => s.subjectCode === grade.subjectCode) || {};
                  const title = grade.subjectTitle || matchedSubject.subjectTitle || "Unknown Subject";

                  return (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-4 pl-2 pr-4">
                        <div className={`font-bold text-[14px] ${isFailed ? 'text-red-500' : 'text-slate-800'}`}>{grade.subjectCode || "—"}</div>
                        <div className={`text-xs font-medium mt-0.5 ${isFailed ? 'text-red-400' : 'text-slate-500'}`}>{title}</div>
                        {grade.professor && (
                          <div className={`text-[11px] mt-1 ${isFailed ? 'text-red-500/70' : 'text-slate-400'}`}>Prof: {grade.professor}</div>
                        )}
                      </td>
                      <td className={`py-4 text-center text-[14px] font-medium ${isFailed ? 'text-red-500' : 'text-slate-600'}`}>{grade.prelim || "—"}</td>
                      <td className={`py-4 text-center text-[14px] font-medium ${isFailed ? 'text-red-500' : 'text-slate-600'}`}>{grade.midterm || "—"}</td>
                      <td className={`py-4 text-center text-[14px] font-medium ${isFailed ? 'text-red-500' : 'text-slate-600'}`}>{grade.preFinal || "—"}</td>
                      <td className={`py-4 text-center text-[14px] font-medium ${isFailed ? 'text-red-500' : 'text-slate-600'}`}>{grade.final || "—"}</td>
                      <td className={`py-4 text-center text-[15px] font-bold pr-2 ${isFailed ? 'text-red-500' : 'text-[#1C6100]'}`}>{grade.finalGrade || "—"}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="py-16 text-center text-slate-400 font-medium">
                    No grades found for this student.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}