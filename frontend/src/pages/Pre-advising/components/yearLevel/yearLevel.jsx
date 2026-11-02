import { PRE_ADVISING_API } from '../../services/api';
import React, { useEffect, useState, useMemo } from "react";
import { ArrowLeft, ChevronRight, BookOpen, Users, Search, Eye, X } from "lucide-react";

// Centralized NoSQL Data Sources (maintained for backwards compatibility)
let studentsData = [];

// Helper function to convert JSON integers to UI ordinals
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

// ==========================================
// MODAL: STUDENT DETAILS & GRADES VIEW
// ==========================================
const StudentDetailsModal = ({ student, onClose }) => {
  if (!student) return null;

  const grades = student.grades || [];
  
  // Available semesters
  const availableSemesters = useMemo(() => {
    const sems = new Set();
    grades.forEach(g => {
      if (g.semester === "Credited" || (g.status || "").toLowerCase() === "credited") {
        sems.add("Credited");
      } else if (g.semester && g.schoolYear) {
        sems.add(`${g.semester} ${g.schoolYear}`);
      }
    });
    return Array.from(sems).sort((a, b) => b.localeCompare(a));
  }, [grades]);

  const [selectedSemester, setSelectedSemester] = useState(availableSemesters[0] || "Credited");

  useEffect(() => {
    if (availableSemesters.length > 0 && !availableSemesters.includes(selectedSemester)) {
      setSelectedSemester(availableSemesters[0]);
    }
  }, [availableSemesters, selectedSemester]);

  const filteredGrades = useMemo(() => {
    return grades.filter(g => {
      if (selectedSemester === "Credited") {
        return g.semester === "Credited" || (g.status || "").toLowerCase() === "credited";
      }
      return `${g.semester} ${g.schoolYear}` === selectedSemester;
    });
  }, [grades, selectedSemester]);

  const fullName = `${student.firstName || student.first_name || ""} ${student.lastName || student.last_name || ""}`.trim();
  const idNumber = student.studentNumber || student.studentId || student.applicantId || student.number || "—";
  const isRegular = (student.status || "").toLowerCase() === "regular" || (student.status || "").toLowerCase() === "block";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[110] font-RB p-4">
      <div className="bg-white w-full max-w-[850px] max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800">{fullName || "Student Record"}</h2>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                isRegular ? 'bg-green-100 text-[#1C6100]' : 'bg-amber-100 text-amber-700'
              }`}>
                {student.status || "Regular"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              ID: <span className="font-semibold text-slate-700">{idNumber}</span> &bull; Section: <span className="font-semibold text-slate-700">{student.section || "Unassigned"}</span> &bull; Year: <span className="font-semibold text-slate-700">{getOrdinalYear(student.yearLevel || student.year)}</span>
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Semester Selector */}
          {availableSemesters.length > 0 && (
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Academic Term</label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg outline-none bg-white text-slate-700 focus:border-[#1C6100] cursor-pointer shadow-xs"
              >
                {availableSemesters.map((sem, idx) => (
                  <option key={idx} value={sem}>{sem}</option>
                ))}
              </select>
            </div>
          )}

          {/* Grades Table */}
          {filteredGrades.length > 0 ? (
            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-bold">Code</th>
                    <th className="px-4 py-3 font-bold">Subject</th>
                    <th className="px-4 py-3 font-bold text-center">Prelim</th>
                    <th className="px-4 py-3 font-bold text-center">Midterm</th>
                    <th className="px-4 py-3 font-bold text-center">Final</th>
                    <th className="px-4 py-3 font-bold text-center">Grade</th>
                    <th className="px-4 py-3 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGrades.map((g, idx) => {
                    const statusStr = (g.status || "").toLowerCase();
                    const passed = ["completed", "credited", "passed"].includes(statusStr);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-700">{g.subjectCode || g.code}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={g.subjectTitle || g.title}>
                          {g.subjectTitle || g.title || "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-600">{g.prelim ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{g.midterm ?? "—"}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{g.final ?? "—"}</td>
                        <td className="px-4 py-3 text-center font-bold text-[#1C6100]">{g.finalGrade ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            passed ? 'bg-green-50 text-[#1C6100]' : 'bg-red-50 text-red-600'
                          }`}>
                            {g.status || (passed ? "Passed" : "Failed")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-sm font-semibold text-slate-600">No prior grades recorded</p>
              <p className="text-xs mt-1">Student is in freshman standing or has no completed terms yet.</p>
            </div>
          )}

          {/* Currently Advised Subjects (if any) */}
          {student.advisedSubjects && student.advisedSubjects.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Advised Subjects for Enrollment</h3>
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-bold">Code</th>
                      <th className="px-4 py-2.5 font-bold">Title</th>
                      <th className="px-4 py-2.5 font-bold text-center">Units</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {student.advisedSubjects.map((sub, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-bold text-slate-700">{sub.subjectCode || sub.subjectId}</td>
                        <td className="px-4 py-2.5 text-slate-600">{sub.subjectTitle || sub.title || "—"}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600 font-bold">{sub.units ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW 1: MASTER YEAR LEVEL DIRECTORY
// ==========================================
const YearDirectory = ({ onSelectYear, onBack, students = [] }) => {
  const displayLevels = [
    { name: "1st Year", level: 1, desc: "Manage 1st year section rosters" },
    { name: "2nd Year", level: 2, desc: "Manage 2nd year section rosters" },
    { name: "3rd Year", level: 3, desc: "Manage 3rd year section rosters" },
    { name: "4th Year", level: 4, desc: "Manage 4th year section rosters" },
    { name: "Irregular Students", level: null, desc: "Manage unassigned or irregular rosters" },
  ];

  const directoryCounts = useMemo(() => {
    const counts = { "1st Year": 0, "2nd Year": 0, "3rd Year": 0, "4th Year": 0, "Irregular Students": 0 };
    students.forEach(student => {
      const isIrregular = (student.status || "").toLowerCase() === "irregular";
      if (isIrregular) {
        counts["Irregular Students"] += 1;
      } else {
        const formattedYear = getOrdinalYear(student.yearLevel || student.year);
        if (counts[formattedYear] !== undefined) {
          counts[formattedYear] += 1;
        }
      }
    });
    return counts;
  }, [students]);

  return (
    <div className="flex flex-col h-full w-full">
      {onBack && (
        <div className="px-8 pt-6 pb-0 flex items-center gap-3">
          <button 
            onClick={onBack} 
            className="p-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl transition-all cursor-pointer shadow-xs border border-slate-200 flex items-center gap-2 text-xs font-bold"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayLevels.map((item, index) => (
            <div
              key={index}
              onClick={() => onSelectYear(item)}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#1C6100]/30 transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1C6100] opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className="p-3 bg-emerald-50 text-[#1C6100] rounded-xl group-hover:scale-110 transition-transform">
                    <BookOpen size={24} strokeWidth={2} />
                  </span>
                  <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {directoryCounts[item.name] || 0} Students
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-800 group-hover:text-[#1C6100] transition-colors">{item.name}</h2>
                <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
              </div>
              
              <div className="mt-6 flex items-center text-xs font-bold text-[#1C6100] gap-1 group-hover:translate-x-1 transition-transform">
                <span>Manage Section</span>
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
const SectionDirectory = ({ yearContext, onBack, onSelectSection, students = [] }) => {
  const sections = useMemo(() => {
    if (yearContext.level === null || yearContext.isIrregular) {
      return [{ name: "All Irregular Students", active: true }];
    }

    // Extract unique sections dynamically using the ordinal helper to match context name
    const yearStudents = students.filter(s => {
      const statusStr = (s.status || "").toLowerCase();
      const isRegularOrBlock = statusStr === "regular" || statusStr === "block";
      return getOrdinalYear(s.yearLevel || s.year) === yearContext.name && isRegularOrBlock;
    });
    
    const uniqueSectionNames = [...new Set(yearStudents.map(s => s.section))].filter(Boolean).sort();

    return uniqueSectionNames.map((secName) => ({
      name: secName,
      active: true 
    }));
  }, [yearContext, students]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="px-8 pt-3 pb-3 flex justify-between items-center bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Year Level</span>
              <ChevronRight size={12} />
              <span className="text-slate-700 font-semibold">{yearContext.name}</span>
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">{yearContext.name} Sections</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col p-6 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sections.length > 0 ? sections.map((sec, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSection(sec.name)}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border transition-all duration-300 shadow-sm hover:shadow-md active:scale-95 cursor-pointer ${
                  sec.active
                    ? "bg-green-50/50 border-[#1C6100]/30 hover:border-[#1C6100]"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <Users size={28} className={`mb-3 ${sec.active ? "text-[#1C6100]" : "text-slate-400"}`} />
                <span className="font-bold text-lg text-slate-800">{sec.name}</span>
                <span className={`text-[10px] mt-2 uppercase tracking-widest font-bold px-2 py-1 rounded-md ${
                  sec.active ? "bg-green-100 text-[#1C6100]" : "bg-slate-100 text-slate-500"
                }`}>
                  {sec.active ? "Active" : "View Roster"}
                </span>
              </button>
            )) : (
              <div className="col-span-full py-12 text-center text-slate-400 font-medium">
                No regular sections found for this year level.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// VIEW 3: STUDENT ROSTER LIST
// ==========================================
const StudentRosterView = ({ yearContext, sectionContext, onBack, students = [] }) => {
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const sectionStudents = useMemo(() => {
    return students.filter(student => {
      const isIrregular = (student.status || "").toLowerCase() === "irregular";
      if (yearContext?.isIrregular) return isIrregular;
      return !isIrregular && student.section === sectionContext;
    });
  }, [yearContext, sectionContext, students]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return sectionStudents;
    const q = search.toLowerCase().trim();
    return sectionStudents.filter(student => {
      const fullName = `${student.firstName || student.first_name || ""} ${student.lastName || student.last_name || ""}`.toLowerCase();
      const sId = (student.studentNumber || student.studentId || student.number || student.applicantId || "").toString().toLowerCase();
      return fullName.includes(q) || sId.includes(q);
    });
  }, [sectionStudents, search]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="px-8 pt-3 pb-3 flex justify-between items-center bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Year Level</span>
              <ChevronRight size={12} />
              <span>{yearContext.name}</span>
              <ChevronRight size={12} />
              <span className="text-slate-700 font-semibold">Roster</span>
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">{sectionContext}</h1>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
         <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col p-6 flex-1">
           {/* Search Bar */}
           <div className="flex items-center gap-3 mb-6">
             <div className="flex-1 flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#1C6100] transition-all bg-slate-50">
               <div className="pl-4 text-slate-400">
                 <Search size={18} strokeWidth={2} />
               </div>
               <input
                 type="text"
                 placeholder="Search by student name or ID..."
                 className="w-full px-3 py-3 text-sm outline-none bg-transparent text-slate-700 placeholder-slate-400"
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
               />
             </div>
           </div>

           {/* Data Table */}
           <div className="w-full overflow-y-auto flex-1 rounded-xl border border-slate-100">
             <table className="w-full text-sm text-left">
               <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10">
                 <tr>
                   <th className="px-6 py-4 font-semibold">Application / Student ID</th>
                   <th className="px-6 py-4 font-semibold">Student Name</th>
                   <th className="px-6 py-4 font-semibold">Section</th>
                   <th className="px-6 py-4 font-semibold text-center">Status</th>
                   <th className="px-6 py-4 font-semibold text-right">Action</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {filteredStudents.length > 0 ? (
                   filteredStudents.map((student, index) => {
                     const statusStr = (student.status || "").toLowerCase();
                     const isRegular = statusStr === 'regular' || statusStr === 'block';
                     const studentId = student.studentNumber || student.studentId || student.number || "—";
                     const studentName = `${student.firstName || student.first_name || ""} ${student.lastName || student.last_name || ""}`.trim();
                     return (
                       <tr 
                         key={index} 
                         onClick={() => setSelectedStudent(student)}
                         className="hover:bg-slate-50 transition-colors cursor-pointer group"
                       >
                         <td className="px-6 py-4 font-medium text-slate-700">{studentId}</td>
                         <td className="px-6 py-4 text-slate-700 font-bold group-hover:text-[#1C6100] transition-colors">{studentName}</td>
                         <td className="px-6 py-4 text-slate-500">{student.section || "—"}</td>
                         <td className="px-6 py-4 text-center">
                           <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${isRegular ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                             {student.status || "Regular"}
                           </span>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <button 
                             onClick={(e) => { e.stopPropagation(); setSelectedStudent(student); }}
                             className="p-1.5 text-slate-400 hover:text-[#1C6100] hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                             title="View Student Record"
                           >
                             <Eye size={18} />
                           </button>
                         </td>
                       </tr>
                     );
                   })
                 ) : (
                   <tr>
                     <td colSpan={5} className="py-16 text-center">
                       <div className="flex flex-col items-center justify-center text-slate-400">
                         <Search size={40} strokeWidth={1.5} className="mb-3 opacity-50" />
                         <p className="text-base font-semibold text-slate-600">No students found.</p>
                         <p className="text-xs mt-1">Try adjusting your search criteria.</p>
                       </div>
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
         </div>
      </div>

      {/* Student Details & Grades Modal */}
      {selectedStudent && (
        <StudentDetailsModal 
          student={selectedStudent} 
          onClose={() => setSelectedStudent(null)} 
        />
      )}
    </div>
  );
};

// ==========================================
// MAIN PARENT COMPONENT
// ==========================================
export default function YearLevel({ navigateToTab, navigationState }) {
  const [currentView, setCurrentView] = useState("year"); // 'year' | 'section' | 'list'
  const [yearContext, setYearContext] = useState({ level: 1, name: "", isIrregular: false });
  const [sectionContext, setSectionContext] = useState("");
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [students, setStudents] = useState([]);

  // Fetch live students from MongoDB on mount
  useEffect(() => {
    fetch(`${PRE_ADVISING_API}/students`)
      .then(res => res.json())
      .then(data => {
        const validData = Array.isArray(data) ? data : [];
        studentsData.length = 0;
        studentsData.push(...validData);
        setStudents(validData);
        setIsDbLoaded(true);
      })
      .catch(err => {
        console.error("Failed to fetch database records:", err);
        setIsDbLoaded(true); // Fallback to allow UI to load even if fetch fails
      });
  }, []);

  // Handle incoming navigationState (deep linking from Dashboard or other tabs)
  useEffect(() => {
    if (navigationState) {
      if (navigationState.isIrregular || navigationState.irregular) {
        setYearContext({ level: null, name: "Irregular Students", isIrregular: true });
        setSectionContext("Irregular");
        setCurrentView("list");
      } else if (navigationState.section) {
        const yLevel = navigationState.yearLevel || 1;
        const yName = navigationState.yearName || getOrdinalYear(yLevel);
        setYearContext({ level: yLevel, name: yName, isIrregular: false });
        setSectionContext(navigationState.section);
        setCurrentView("list");
      }
    }
  }, [navigationState]);

  const handleSelectYear = (year) => {
    setYearContext({ level: year.level, name: year.name, isIrregular: year.level === null });
    
    // If it's irregular, skip section selection entirely
    if (year.level === null) {
      setSectionContext("Irregular");
      setCurrentView("list");
    } else {
      setCurrentView("section");
    }
  };

  const handleSelectSection = (sectionName) => {
    setSectionContext(sectionName);
    setCurrentView("list");
  };

  if (!isDbLoaded) {
    return <div className="h-screen w-full flex items-center justify-center bg-[#f5f6f8] text-slate-500 font-bold font-RB ">Loading Rosters...</div>;
  }

  return (
    <div className="bg-[#f5f6f8] h-full font-RB w-full min-h-screen">
      {currentView === "year" && (
        <YearDirectory 
          onSelectYear={handleSelectYear} 
          onBack={navigateToTab ? () => navigateToTab('pre-advising-dashboard') : null}
          students={students}
        />
      )}
      
      {currentView === "section" && (
        <SectionDirectory 
          yearContext={yearContext} 
          onBack={() => setCurrentView("year")}
          onSelectSection={handleSelectSection}
          students={students}
        />
      )}
      
      {currentView === "list" && (
        <StudentRosterView 
          yearContext={yearContext}
          sectionContext={sectionContext}
          onBack={() => setCurrentView(yearContext.isIrregular ? "year" : "section")}
          students={students}
        />
      )}
    </div>
  );
}
