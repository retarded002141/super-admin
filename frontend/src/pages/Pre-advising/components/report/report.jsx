import { PRE_ADVISING_API } from '../../services/api';
import React, { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ChevronRight, Search, BookOpen, Users, FileText, Printer, Download } from "lucide-react";

// Centralized NoSQL Data Sources (maintained for backwards compatibility)
let studentsData = [];
let subjectsData = [];
let sectionsData = [];

const getOrdinalYear = (level) => {
  if (!level) return "Unknown";
  const str = String(level).trim();
  const num = parseInt(str, 10);
  if (num === 1 || str.toLowerCase().includes("1")) return "1st Year";
  if (num === 2 || str.toLowerCase().includes("2")) return "2nd Year";
  if (num === 3 || str.toLowerCase().includes("3")) return "3rd Year";
  if (num === 4 || str.toLowerCase().includes("4")) return "4th Year";
  return `${str} Year`;
};

const normalizeSemStr = (sem) => {
  if (!sem) return "";
  const s = String(sem).toLowerCase().trim();
  if (s.includes("1") || s.includes("first")) return "1st";
  if (s.includes("2") || s.includes("second")) return "2nd";
  return s;
};

const isYearMatch = (subYear, targetYearStr) => {
  if (!subYear || !targetYearStr) return false;
  const num1 = String(subYear).replace(/\D/g, '');
  const num2 = String(targetYearStr).replace(/\D/g, '');
  return Boolean(num1 && num2 && num1 === num2);
};

// ==========================================
// VIEW 1: MASTER REPORT DIRECTORY 
// ==========================================
const ReportDirectory = ({ onSelectYear, onBack }) => {
  const years = [
    { name: "1st Year", desc: "View section and subject reports for 1st year" },
    { name: "2nd Year", desc: "View section and subject reports for 2nd year" },
    { name: "3rd Year", desc: "View section and subject reports for 3rd year" },
    { name: "4th Year", desc: "View section and subject reports for 4th year" },
    { name: "Irregular Students", desc: "View irregular student tracking reports" },
  ];

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-8 pt-6 pb-4 flex items-center gap-3 bg-white shadow-sm z-10">
        <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="font-bold text-2xl text-slate-800 tracking-tight">Report Directory</h1>
          <p className="text-xs text-slate-400 mt-0.5">Select a year level to view academic reports.</p>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {years.map((y, index) => (
            <div
              key={index}
              onClick={() => onSelectYear(y)}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#1C6100]/30 transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1C6100] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="p-3 bg-emerald-50 text-[#1C6100] rounded-xl group-hover:scale-110 transition-transform">
                    <BookOpen size={24} strokeWidth={2} />
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 group-hover:text-[#1C6100] transition-colors">{y.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{y.desc}</p>
              </div>
              <div className="mt-6 flex items-center text-xs font-bold text-[#1C6100] gap-1 group-hover:translate-x-1 transition-transform">
                <span>View Sections</span>
                <ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW 2: SECTION DRILL-DOWN 
// ==========================================
const ReportSections = ({ yearContext, reportType, onBack, onSelectSection, sections = sectionsData, students = studentsData }) => {
  const sectionsList = useMemo(() => {
    if (yearContext?.name === "Irregular Students") return ["All Irregular Students"];
    
    // Pull available sections from the Master Schedule (Schedule DB)
    const availableSchedules = sections.filter(sec => 
      getOrdinalYear(sec.year) === yearContext?.name
    );
    
    // Map their proper names (e.g., "BSIT-2A")
    const scheduleSections = availableSchedules.map(sec => 
      sec.sectionName || `${sec.program}-${sec.year}${sec.section}`
    );

    // Just in case there are students assigned to a section that has no schedule yet, mix them in
    const yearStudents = students.filter(s => 
      getOrdinalYear(s.yearLevel || s.year) === yearContext?.name && (s.status || "").toLowerCase() === "regular"
    );
    const studentSections = yearStudents.map(s => s.section);

    // Combine both arrays and remove duplicates
    const uniqueSections = [...new Set([...scheduleSections, ...studentSections])].filter(Boolean).sort();
    
    return uniqueSections.length > 0 ? uniqueSections : ["No Sections Found"];
  }, [yearContext, sections, students]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-8 pt-6 pb-4 flex justify-between items-center bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Report</span><ChevronRight size={12} /><span className="text-slate-700 font-semibold">{yearContext?.name}</span>
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">Select Section</h1>
          </div>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sectionsList.map((secName, idx) => (
            <button
              key={idx}
              onClick={() => onSelectSection(secName)}
              className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border border-slate-200 hover:border-[#1C6100] transition-all duration-300 shadow-sm hover:shadow-md active:scale-95 cursor-pointer group"
            >
              <Users size={28} className="mb-3 text-slate-400 group-hover:text-[#1C6100] transition-colors" />
              <span className="font-bold text-lg text-slate-800">{secName}</span>
              <span className="text-[10px] mt-2 uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-[#1C6100] transition-colors">
                {reportType === "section" ? "View Masterlist" : "View Subjects"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW 3: SUBJECT DRILL-DOWN 
// ==========================================
const ReportSubjects = ({ yearContext, sectionContext, activeSemester, onBack, onSelectSubject, sections = sectionsData, students = studentsData, subjectsList = subjectsData }) => {
  const subjects = useMemo(() => {
    // Find the matching section schedule for the CURRENT ACTIVE SEMESTER
    const matchedSection = sections.find(sec => 
      sec.sectionName === sectionContext && 
      normalizeSemStr(sec.semester || sec.offeredSemester) === normalizeSemStr(activeSemester)
    );
    
    if (!matchedSection || !matchedSection.classes || matchedSection.classes.length === 0) {
      const targetYear = yearContext?.name ? yearContext.name.split(" ")[0] : "1st"; 
      
      const filteredSubjects = yearContext?.name === "Irregular Students" 
        ? subjectsList.filter(sub => normalizeSemStr(sub.targetSemester) === normalizeSemStr(activeSemester))
        : subjectsList.filter(sub => normalizeSemStr(sub.targetSemester) === normalizeSemStr(activeSemester) && isYearMatch(sub.yearLevel, targetYear));

      return filteredSubjects
        .map(sub => {
          // Count active students in this section enrolled in this subject
          const enrolledCount = students.filter(s => {
            // If we are viewing irregular students, match by status, not section string
            if (sectionContext === "All Irregular Students") {
               if ((s.status || "").toLowerCase() !== "irregular") return false;
            } else {
               if (s.section !== sectionContext) return false;
            }
            
            const enrolled = s.advisedSubjects || s.enrolledSubjects || [];
            return enrolled.some(e => e.subjectId === sub.subjectCode || e.subject_id === sub.subjectCode || e.subjectCode === sub.subjectCode);
          }).length;

          // For Irregular view, hide subjects that have 0 irregular students to avoid screen clutter
          if (sectionContext === "All Irregular Students" && enrolledCount === 0) return null;

          return {
            code: sub.subjectCode,
            title: sub.subjectTitle,
            prof: "TBA",
            studentCount: enrolledCount
          };
        }).filter(Boolean); // Clean out the nulls
    }

    // If they have an active schedule, deduplicate the subjects from their class blocks
    const uniqueCodes = [...new Set(matchedSection.classes.map(c => c.subjectCode))];
    
    return uniqueCodes.map(code => {
      const schBlock = matchedSection.classes.find(c => c.subjectCode === code);
      const subInfo = subjectsList.find(sub => sub.subjectCode === code);
      
      // Count active students in this section enrolled in this subject
      const enrolledCount = students.filter(s => {
        if (sectionContext === "All Irregular Students") {
           if ((s.status || "").toLowerCase() !== "irregular") return false;
        } else {
           if (s.section !== sectionContext) return false;
        }
        
        const enrolled = s.advisedSubjects || s.enrolledSubjects || [];
        return enrolled.some(e => e.subjectId === code || e.subject_id === code || e.subjectCode === code);
      }).length;

      return {
        code: code,
        title: subInfo ? subInfo.subjectTitle : (schBlock?.title || schBlock?.subjectName || code),
        prof: schBlock?.profName || schBlock?.instructorName || "TBA",
        studentCount: enrolledCount
      };
    });
  }, [sectionContext, yearContext, activeSemester, sections, students, subjectsList]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-8 pt-6 pb-4 flex justify-between items-center bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Report</span>
              <ChevronRight size={12} />
              <span>{yearContext?.name}</span>
              <ChevronRight size={12} />
              <span className="text-slate-700 font-semibold">{sectionContext}</span>
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">Select Subject</h1>
          </div>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subjects.map((sub, idx) => (
            <div
              key={idx}
              onClick={() => onSelectSubject(sub)}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#1C6100]/30 transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1C6100] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="p-3 bg-emerald-50 text-[#1C6100] rounded-xl group-hover:scale-110 transition-transform">
                    <FileText size={24} strokeWidth={2} />
                  </span>
                  <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {sub.studentCount} {sub.studentCount === 1 ? 'Student' : 'Students'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 group-hover:text-[#1C6100] transition-colors">{sub.code}: {sub.title}</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">Instructor: {sub.prof}</p>
              </div>
              <div className="mt-6 flex items-center text-xs font-bold text-[#1C6100] gap-1 group-hover:translate-x-1 transition-transform">
                <span>View Roster List</span>
                <ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW 4: STUDENT ROSTER REPORT TABLE 
// ==========================================
const ReportStudentTable = ({ yearContext, sectionContext, subjectContext, profContext, reportType, activeAcademicYear, onBack, students = studentsData, sections = sectionsData }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortConfig, setSortConfig] = useState({ key: "lastName", direction: "asc" });

  const rosterStudents = useMemo(() => {
    // SECTION MASTERLIST
    if (reportType === "section") {
      if (sectionContext === "All Irregular Students") return students.filter(s => (s.status || "").toLowerCase() === "irregular");
      return students.filter(s => s.section === sectionContext);
    }

    // CLASS ROSTER
    if (reportType === "class") {
      return students.filter(s => {
        if (sectionContext === "All Irregular Students") {
          if ((s.status || "").toLowerCase() !== "irregular") return false;
        } else {
          if (s.section !== sectionContext) return false;
        }
        const enrolled = s.advisedSubjects || s.enrolledSubjects || [];
        return enrolled.some(sub => sub.subjectId === subjectContext?.code || sub.subject_id === subjectContext?.code || sub.subjectCode === subjectContext?.code);
      });
    }

    // PROFESSOR MASTERLIST
    if (reportType === "professor") {
      const profSections = sections.filter(sec => {
        const blocks = sec.classes || sec.schedules || [];
        return blocks.some(b => b.subjectCode === subjectContext?.code && (b.profName === profContext || b.instructorName === profContext));
      }).map(sec => sec.sectionName);

      return students.filter(s => {
        if (!profSections.includes(s.section)) return false; 
        const enrolled = s.advisedSubjects || s.enrolledSubjects || [];
        return enrolled.some(sub => sub.subjectId === subjectContext?.code || sub.subject_id === subjectContext?.code || sub.subjectCode === subjectContext?.code);
      });
    }
    return [];
  }, [reportType, sectionContext, subjectContext, profContext, students, sections]);

  const processedStudents = useMemo(() => {
    let result = [...rosterStudents];

    // Search Filter
    if (search) {
      result = result.filter(s => {
        const fullName = `${s.lastName || ""} ${s.firstName || ""} ${s.middleName || ""}`.toLowerCase();
        const sId = (s.studentNumber || s.studentId || "").toString();
        return fullName.includes(search.toLowerCase()) || sId.includes(search.toLowerCase());
      });
    }

    // Status Filter
    if (statusFilter !== "All") {
      result = result.filter(s => (s.status || "").toLowerCase() === statusFilter.toLowerCase());
    }

    // Sorting Logic
    result.sort((a, b) => {
      let aValue = a[sortConfig.key] || "";
      let bValue = b[sortConfig.key] || "";

      if (sortConfig.key === 'id') {
        aValue = a.studentNumber || a.studentId || "";
        bValue = b.studentNumber || b.studentId || "";
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [rosterStudents, search, statusFilter, sortConfig]);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const handleExportCSV = () => {
    if (processedStudents.length === 0) return alert("No students to export.");
    const csvRows = [["Application ID", "Last Name", "First Name", "M.I.", "Section", "Status"].join(",")];
    processedStudents.forEach(stu => {
      const mi = stu.middleName ? stu.middleName.charAt(0).toUpperCase() + "." : "";
      csvRows.push(`"${stu.studentNumber || stu.studentId}","${stu.lastName || ""}","${stu.firstName || ""}","${mi}","${stu.section || ""}","${stu.status || ""}"`);
    });
    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(new Blob([csvRows.join("\n")], { type: "text/csv" }));
    a.download = `${reportType}_Roster_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full w-full print:block print:absolute print:left-0 print:top-0 print:w-full print:bg-white print:z-[9999] print:m-0 print:p-0">
      <div className="px-8 pt-6 pb-4 flex justify-between items-center bg-white shadow-sm z-10 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Report</span><ChevronRight size={12} />
              {reportType === "professor" ? (
                <><span>{profContext}</span><ChevronRight size={12} /><span className="text-slate-700 font-semibold">{subjectContext?.code}</span></>
              ) : (
                <><span>{yearContext?.name}</span><ChevronRight size={12} /><span>{sectionContext}</span>
                  {reportType === "class" && <><ChevronRight size={12} /><span className="text-slate-700 font-semibold">{subjectContext?.code}</span></>}
                </>
              )}
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">
              {reportType === "section" ? `${sectionContext} Masterlist` : `${subjectContext?.title} Roster`}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition shadow-xs cursor-pointer"><Printer size={16} /> Print</button>
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-[#1C6100] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#154900] transition shadow-xs cursor-pointer"><Download size={16} /> Export CSV</button>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto print:p-4 print:m-0 print:max-w-none print:block">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col p-6 flex-1 print:shadow-none print:border-none print:p-0">
          <div className="flex justify-between items-end mb-6 print:mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 print:text-xl">
                {reportType === "section" ? `Official Roster: ${sectionContext}` : `${subjectContext?.code} - ${subjectContext?.title}`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 print:text-sm print:mt-1">
                {reportType === "section" ? <>Academic Year: <span className="font-semibold text-slate-700 print:text-black">{activeAcademicYear || "2026-2027"}</span></> :
                 reportType === "professor" ? <>Instructor: <span className="font-semibold text-slate-700 print:text-black">{profContext}</span> | Sections: <span className="font-semibold text-slate-700 print:text-black">All Tagged Sections</span></> :
                 <>Instructor: <span className="font-semibold text-slate-700 print:text-black">{subjectContext?.prof}</span> | Section: <span className="font-semibold text-slate-700 print:text-black">{sectionContext}</span></>}
              </p>
            </div>
            
            {/* Filter and Search Bar */}
            <div className="flex items-center gap-3 print:hidden">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none bg-slate-50 text-slate-700 focus:border-[#1C6100] cursor-pointer">
                <option value="All">All Status</option>
                <option value="Regular">Regular</option>
                <option value="Irregular">Irregular</option>
              </select>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#1C6100] bg-slate-50 w-[250px]">
                <div className="pl-3 text-slate-400"><Search size={16} /></div>
                <input type="text" placeholder="Search roster..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full px-3 py-2 text-xs outline-none bg-transparent text-slate-700" />
              </div>
            </div>
          </div>

          <div className="w-full overflow-y-auto flex-1 rounded-xl border border-slate-100 print:border-none print:overflow-visible">
            <table className="w-full text-sm text-left print:text-xs">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 print:bg-white print:text-black print:border-b-2 print:border-black">
                <tr>
                  <th onClick={() => handleSort('id')} className="px-6 py-4 cursor-pointer hover:text-[#1C6100] print:p-2">ID No. {sortConfig.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => handleSort('lastName')} className="px-6 py-4 cursor-pointer hover:text-[#1C6100] print:p-2">Last Name {sortConfig.key === 'lastName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => handleSort('firstName')} className="px-6 py-4 cursor-pointer hover:text-[#1C6100] print:p-2">First Name {sortConfig.key === 'firstName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th className="px-6 py-4 print:p-2">M.I.</th>
                  <th onClick={() => handleSort('section')} className="px-6 py-4 cursor-pointer hover:text-[#1C6100] print:p-2">Section {sortConfig.key === 'section' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                  <th onClick={() => handleSort('status')} className="px-6 py-4 cursor-pointer hover:text-[#1C6100] print:p-2">Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 print:divide-gray-300">
                {processedStudents.length > 0 ? processedStudents.map((stu, idx) => {
                  const mi = stu.middleName ? stu.middleName.charAt(0).toUpperCase() + "." : "";
                  return (
                    <tr key={idx} className="hover:bg-slate-50 print:hover:bg-white print:break-inside-avoid">
                      <td className="px-6 py-4 font-medium text-slate-700 print:p-2 print:text-black">{stu.studentNumber || stu.studentId}</td>
                      <td className="px-6 py-4 font-bold text-slate-800 print:p-2 print:text-black">{stu.lastName}</td>
                      <td className="px-6 py-4 font-medium text-slate-800 print:p-2 print:text-black">{stu.firstName}</td>
                      <td className="px-6 py-4 text-slate-600 print:p-2 print:text-black">{mi}</td>
                      <td className="px-6 py-4 text-slate-500 print:p-2 print:text-black">{stu.section}</td>
                      <td className="px-6 py-4 text-slate-500 print:p-2 print:text-black uppercase text-xs">{stu.status}</td>
                    </tr>
                  )
                }) : <tr><td colSpan={6} className="py-16 text-center text-slate-400">No students found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW: DASHBOARD HOME (THE 3 TRACKS) 
// ==========================================
const ReportHome = ({ onSelectTrack, onBack }) => {
  const tracks = [
    { id: "section", title: "Section Masterlists", desc: "View every student enrolled in a specific section.", icon: <Users size={28} /> },
    { id: "class", title: "Class Rosters", desc: "View students taking a specific subject within a section.", icon: <BookOpen size={28} /> },
    { id: "professor", title: "Professor Workloads", desc: "View all students handled by a specific professor across all sections.", icon: <FileText size={28} /> }
  ];

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-8 pt-6 pb-4 bg-white shadow-sm z-10 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <h1 className="font-bold text-2xl text-slate-800 tracking-tight">Report Generator</h1>
          <p className="text-xs text-slate-400 mt-0.5">Select a report type to begin filtering data.</p>
        </div>
      </div>
      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tracks.map((t) => (
            <div key={t.id} onClick={() => onSelectTrack(t.id)} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#1C6100]/30 transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1C6100] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div>
                <div className="mb-4 text-[#1C6100] bg-emerald-50 w-max p-3 rounded-xl group-hover:scale-110 transition-transform">{t.icon}</div>
                <h2 className="text-xl font-bold text-slate-800 group-hover:text-[#1C6100] transition-colors">{t.title}</h2>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{t.desc}</p>
              </div>
              <div className="mt-8 flex items-center text-sm font-bold text-[#1C6100] gap-1 group-hover:translate-x-1 transition-transform">
                <span>Generate Report</span><ChevronRight size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW: PROFESSOR DIRECTORY 
// ==========================================
const ReportProfessors = ({ onBack, onSelectProf, sections = sectionsData }) => {
  const profs = useMemo(() => {
    const allProfs = [];
    sections.forEach(sec => {
      const blocks = sec.classes || sec.schedules || [];
      blocks.forEach(b => {
        const name = b.profName || b.instructorName;
        if (name && name !== "TBA") allProfs.push(name);
      });
    });
    return [...new Set(allProfs)].sort();
  }, [sections]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-8 pt-6 pb-4 flex items-center gap-3 bg-white shadow-sm z-10">
        <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"><ArrowLeft size={18} /></button>
        <div><h1 className="font-bold text-xl text-slate-800 tracking-tight">Select Professor</h1></div>
      </div>
      <div className="p-8 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-[1600px] mx-auto">
        {profs.map((prof, idx) => (
          <button key={idx} onClick={() => onSelectProf(prof)} className="p-5 bg-white rounded-xl border border-slate-200 hover:border-[#1C6100] transition-all shadow-sm active:scale-95 text-left font-bold text-slate-800 group cursor-pointer">
            <span className="group-hover:text-[#1C6100] transition-colors">{prof}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// VIEW: PROFESSOR SUBJECTS 
// ==========================================
const ReportProfSubjects = ({ profContext, onBack, onSelectSubject, sections = sectionsData, students = studentsData, subjectsList = subjectsData }) => {
  const subjects = useMemo(() => {
    const subs = [];
    sections.forEach(sec => {
      const blocks = sec.classes || sec.schedules || [];
      blocks.forEach(b => {
        const name = b.profName || b.instructorName;
        if (name === profContext && !subs.find(s => s.code === b.subjectCode)) {
          const info = subjectsList.find(x => x.subjectCode === b.subjectCode);
          
          // First, find all sections this specific professor handles for this specific subject
          const profSections = sections.filter(s => {
            const sBlocks = s.classes || s.schedules || [];
            return sBlocks.some(sb => sb.subjectCode === b.subjectCode && (sb.profName === profContext || sb.instructorName === profContext));
          }).map(s => s.sectionName);

          // Then count how many students from those specific sections are actively enrolled in it
          const count = students.filter(s => {
            if (!profSections.includes(s.section)) return false; 
            const enrolled = s.advisedSubjects || s.enrolledSubjects || [];
            return enrolled.some(sub => sub.subjectId === b.subjectCode || sub.subject_id === b.subjectCode || sub.subjectCode === b.subjectCode);
          }).length;

          subs.push({ 
            code: b.subjectCode, 
            title: info ? info.subjectTitle : (b.title || b.subjectName || b.subjectCode), 
            prof: profContext, 
            studentCount: count 
          });
        }
      });
    });
    return subs;
  }, [profContext, sections, students, subjectsList]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="px-8 pt-6 pb-4 flex items-center gap-3 bg-white shadow-sm z-10">
        <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"><ArrowLeft size={18} /></button>
        <div>
          <div className="text-xs text-slate-400 font-medium mb-0.5">Professor {profContext}</div>
          <h1 className="font-bold text-xl text-slate-800 tracking-tight">Select Active Subject</h1>
        </div>
      </div>
      <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-[1600px] mx-auto">
        {subjects.map((sub, idx) => (
          <div key={idx} onClick={() => onSelectSubject(sub)} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:border-[#1C6100] cursor-pointer group">
            <div className="flex justify-between items-start mb-2">
              <h2 className="font-bold text-slate-800 group-hover:text-[#1C6100]">{sub.code}</h2>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                {sub.studentCount} {sub.studentCount === 1 ? 'Student' : 'Students'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium truncate">{sub.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// MAIN PARENT COMPONENT 
// ==========================================
export default function Report({ navigateToTab }) {
  const [currentView, setCurrentView] = useState("home"); 
  const [reportType, setReportType] = useState(null); 
  
  const [yearContext, setYearContext] = useState(null);
  const [sectionContext, setSectionContext] = useState(null);
  const [subjectContext, setSubjectContext] = useState(null);
  const [profContext, setProfContext] = useState(null);
  
  const [activeSemester, setActiveSemester] = useState("1st");
  const [activeAcademicYear, setActiveAcademicYear] = useState("2026-2027");
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  const [schedulesList, setSchedulesList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch(`${PRE_ADVISING_API}/schedules`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/students`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/subjects`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/settings`).then(res => res.json())
    ]).then(([schedules, students, subjects, settings]) => {
      const validSchedules = Array.isArray(schedules) ? schedules : [];
      const validStudents = Array.isArray(students) ? students : [];
      const validSubjects = Array.isArray(subjects) ? subjects : [];

      sectionsData.length = 0; sectionsData.push(...validSchedules);
      studentsData.length = 0; studentsData.push(...validStudents);
      subjectsData.length = 0; subjectsData.push(...validSubjects);

      setSchedulesList(validSchedules);
      setStudentsList(validStudents);
      setSubjectsList(validSubjects);
      
      if (settings) {
        if (settings.activeSemesterShort) {
          setActiveSemester(settings.activeSemesterShort);
        }
        if (settings.schoolYear) {
          setActiveAcademicYear(settings.schoolYear);
        } else if (settings.academicYear) {
          setActiveAcademicYear(settings.academicYear);
        }
      }
      
      setIsDbLoaded(true);
    }).catch(err => {
      console.error("Failed to fetch database records:", err);
      setIsDbLoaded(true);
    });
  }, []);

  if (!isDbLoaded) return <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-slate-500 font-bold font-RB ">Loading Reports...</div>;

  return (
    <div className="font-RB w-full bg-slate-50 min-h-screen flex flex-col print:pl-0 print:bg-white">
      {currentView === "home" && (
        <ReportHome 
          onSelectTrack={(type) => {
            setReportType(type);
            setCurrentView(type === "professor" ? "professors" : "directory");
          }} 
          onBack={navigateToTab ? () => navigateToTab('pre-advising-dashboard') : null}
        />
      )}

      {currentView === "directory" && (
        <ReportDirectory 
          onSelectYear={(yData) => { setYearContext(yData); setCurrentView("sections"); }} 
          onBack={() => setCurrentView("home")}
        />
      )}

      {currentView === "professors" && (
        <ReportProfessors 
          sections={schedulesList}
          onBack={() => setCurrentView("home")} 
          onSelectProf={(prof) => { setProfContext(prof); setCurrentView("prof_subjects"); }} 
        />
      )}

      {currentView === "sections" && (
        <ReportSections 
          yearContext={yearContext} 
          reportType={reportType} 
          sections={schedulesList}
          students={studentsList}
          onBack={() => setCurrentView("directory")} 
          onSelectSection={(secName) => {
            setSectionContext(secName);
            setCurrentView(reportType === "section" ? "students" : "subjects");
          }} 
        />
      )}

      {currentView === "prof_subjects" && (
        <ReportProfSubjects 
          profContext={profContext} 
          sections={schedulesList}
          students={studentsList}
          subjectsList={subjectsList}
          onBack={() => setCurrentView("professors")} 
          onSelectSubject={(subData) => {
            setSubjectContext(subData); setCurrentView("students");
          }} 
        />
      )}

      {currentView === "subjects" && (
        <ReportSubjects 
          yearContext={yearContext} 
          sectionContext={sectionContext} 
          activeSemester={activeSemester} 
          sections={schedulesList}
          students={studentsList}
          subjectsList={subjectsList}
          onBack={() => setCurrentView("sections")} 
          onSelectSubject={(subData) => {
            setSubjectContext(subData); setCurrentView("students");
          }} 
        />
      )}

      {currentView === "students" && (
        <ReportStudentTable 
          yearContext={yearContext} 
          sectionContext={sectionContext} 
          subjectContext={subjectContext} 
          profContext={profContext}
          reportType={reportType}
          activeAcademicYear={activeAcademicYear}
          students={studentsList}
          sections={schedulesList}
          onBack={() => setCurrentView(reportType === "section" ? "sections" : reportType === "professor" ? "prof_subjects" : "subjects")} 
        />
      )}
    </div>
  );
}
