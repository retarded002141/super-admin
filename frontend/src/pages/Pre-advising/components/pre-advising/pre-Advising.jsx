import { PRE_ADVISING_API } from '../../services/api';
import React, { useEffect, useState, useMemo } from "react";
import { Search, X, ArrowLeft, ChevronRight, Trash2, CheckCircle2, AlertCircle, BookOpen, Clock, ArrowRightLeft, RefreshCw, PlusCircle, CornerDownRight, Printer, Plus, Eye, EyeOff, Globe } from "lucide-react";
import CorPreview from "../shared/CorPreview";
import { getAcademicYearShort } from "../shared/academicYear";
import ConfirmModal from "../shared/ConfirmModal";

// Centralized NoSQL Data Sources
let studentsData = [];
let subjectsData = [];
let sectionsData = [];

// DATA HELPERS
let ACTIVE_SEMESTER_SHORT = ""; 
let ACTIVE_TERM_STRING = "";

const parseTimeStringToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  try {
    const [time, modifier] = timeStr.trim().split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (hours === 12) hours = 0;
    if (modifier && modifier.toUpperCase() === 'PM') hours += 12;
    return (hours * 60) + (minutes || 0);
  } catch (e) {
    return 0;
  }
};

const formatTime12Hour = (minutesInt) => {
  if (minutesInt === undefined || minutesInt === null) return "";
  const hour = Math.floor(minutesInt / 60);
  const minute = minutesInt % 60;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
};

const formatYear = (lvl) => {
  const num = parseInt(lvl, 10);
  if (!isNaN(num)) {
    const suffix = num === 1 ? 'st' : num === 2 ? 'nd' : num === 3 ? 'rd' : 'th';
    return `${num}${suffix} Year`;
  }
  return lvl;
};

// Bridges the gap between Student { year: "1", section: "A" } and Schedule "BSIT-1A"
const getFullSection = (student) => {
  if (!student) return "";
  if (student.section && student.section.includes("-")) return student.section;
  
  const courseCode = student.course || "BSIT"; 
  return `${courseCode}-${student.year}${student.section}`;
};

const getPassedSubjects = (student) => {
  if (!student || !student.grades) return [];
  return student.grades
    .filter(g => ["passed", "credited", "completed", "PASSED"].includes((g.status || "").toLowerCase()))
    .map(g => g.subjectCode);
};

const getEligibleSubjects = (student) => {
  const passed = getPassedSubjects(student);
  return subjectsData.filter(subject => {
    if (subject.targetSemester !== ACTIVE_SEMESTER_SHORT) return false;
    if (passed.includes(subject.subjectCode)) return false;
    if (!subject.prerequisites || subject.prerequisites.length === 0) return true;
    return subject.prerequisites.every(req => passed.includes(req));
  });
};

const getScheduleDetails = (subjectCode, targetSection) => {
  const section = sectionsData.find(sec => sec.sectionName === targetSection && sec.offeredSemester === ACTIVE_TERM_STRING);
  if (!section || !section.classes) return [];
  
  const classBlocks = section.classes.filter(sch => sch.subjectCode === subjectCode);
  if (classBlocks.length === 0) return [];
  
  const subjectInfo = subjectsData.find(sub => sub.subjectCode === subjectCode);
  
  return classBlocks.map(sch => ({
    ...sch,
    units: subjectInfo ? subjectInfo.units : 0
  }));
};

const getBlockSchedule = (sectionName) => {
  const section = sectionsData.find(sec => sec.sectionName === sectionName && sec.offeredSemester === ACTIVE_TERM_STRING);
  if (!section || !section.classes) return [];
  
  const uniqueSubjects = [...new Set(section.classes.map(sch => sch.subjectCode))];
  
  return uniqueSubjects.map(code => ({
    subjectCode: code,
    targetSection: sectionName
  }));
};

const isBSITCurriculumEligibleSubject = (subjectCode, subjectTitle) => {
  if (!subjectCode && !subjectTitle) return false;
  const code = (subjectCode || "").toUpperCase();
  const title = (subjectTitle || "").toUpperCase();
  const isInBsitCurriculum = subjectsData.some(sub => (sub.subjectCode || "").toUpperCase() === code);
  if (isInBsitCurriculum) return true;
  const curriculumKeywords = ["PE", "NSTP", "PHYSICAL EDUCATION", "NATIONAL SERVICE TRAINING PROGRAM"];
  return curriculumKeywords.some(keyword => code.includes(keyword) || title.includes(keyword));
};

// MODAL 1: BATCH AUTO-ADVISE
const BatchConfirmModal = ({ show, onCancel, onConfirm, regularCount }) => {
  if (!show) return null;
  
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[70] font-RB p-4">
      <div className="bg-white w-full max-w-[450px] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-[#1C6100]">Batch Auto-Advise</h2>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-8 flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 text-[#1C6100] mb-5 border border-emerald-100 shadow-sm">
            <RefreshCw size={28} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Process {regularCount} Students?</h3>
          <p className="text-sm text-slate-500 leading-relaxed max-w-[320px]">
            This will automatically assign the default block schedule and approve all <strong className="text-slate-800">Regular</strong> students currently pending.
          </p>
        </div>
        
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-300 transition cursor-pointer">Cancel</button>
          <button onClick={onConfirm} className="px-5 py-2.5 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] transition shadow-sm cursor-pointer">Confirm Batch Process</button>
        </div>
      </div>
    </div>
  );
};

// MODAL 2: BATCH SUCCESS
const BatchSuccessModal = ({ show, count, onClose }) => {
  if (!show) return null;
  
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[70] font-RB p-4">
      <div className="bg-white w-full max-w-[400px] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
        <div className="p-8 flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-[#1C6100] mb-5 border border-emerald-100 shadow-sm">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Batch Complete!</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Successfully auto-advised <strong className="text-slate-800">{count}</strong> regular students. Their records have been safely stored in the database.
          </p>
        </div>
        
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-center">
          <button onClick={onClose} className="w-full px-5 py-2.5 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] transition shadow-sm cursor-pointer">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

// MODAL 3: REPLACE SUBJECT 
const ReplaceSubjectModal = ({ show, studentContext, currentCart, onCancel, onSave }) => {
  const [selected, setSelected] = useState(null);

  const eligibleSubjects = useMemo(() => {
    if (!studentContext) return [];
    const eligible = getEligibleSubjects(studentContext);
    const cartCodes = currentCart.map(s => s.subjectCode);
    return eligible.filter(subj => !cartCodes.includes(subj.subjectCode));
  }, [studentContext, currentCart, show]);

  if (!show) return null;

  const handleSave = () => {
    const offeringSection = sectionsData.find(sec => sec.classes && sec.classes.some(sch => sch.subjectCode === selected));
    const targetSection = offeringSection ? offeringSection.sectionName : getFullSection(studentContext);
    onSave(selected, targetSection);
    setSelected(null);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[70] font-RB p-4">
      <div className="bg-white w-full max-w-[500px] max-h-[80vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Replace Subject</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select a new eligible subject to add to the cart.</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {eligibleSubjects.length > 0 ? (
            eligibleSubjects.map((subj) => {
              const prereqText = subj.prerequisites && subj.prerequisites.length > 0 
                ? subj.prerequisites.map(req => {
                    const rData = subjectsData.find(s => s.subjectCode === req);
                    return rData ? `${req} - ${rData.subjectTitle}` : req;
                  }).join(", ")
                : "None";

              return (
                <div 
                  key={subj.subjectCode} 
                  onClick={() => setSelected(subj.subjectCode)}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${selected === subj.subjectCode ? 'border-[#1C6100] bg-emerald-50/40 shadow-xs' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1C6100]">{subj.subjectCode}</span>
                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-medium">{subj.units} Units</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 mt-0.5">{subj.subjectTitle}</span>
                    <span className="text-[10px] text-slate-500 font-medium mt-1">Reqs: {prereqText}</span>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selected === subj.subjectCode ? 'border-[#1C6100] bg-[#1C6100] text-white' : 'border-slate-300'}`}>
                    {selected === subj.subjectCode && <CheckCircle2 size={12} strokeWidth={3} />}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold text-slate-600">No more eligible subjects.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-300 transition cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={!selected} className="px-5 py-2.5 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] transition disabled:opacity-50 shadow-sm cursor-pointer">Replace</button>
        </div>
      </div>
    </div>
  );
};

// MODAL 4: CHANGE SCHEDULE 
const ChangeScheduleModal = ({ show, subjectCode, currentSection, activeCart, onCancel, onSave }) => {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (show) setSelected(currentSection);
  }, [show, currentSection]);

  const occupiedSlots = useMemo(() => {
    if (!activeCart) return [];
    const slots = [];
    activeCart.forEach(item => {
      if (item.isLocked || item.isPassed || item.subjectCode === subjectCode) return;
      
      if (item.targetSection) {
        const details = getScheduleDetails(item.subjectCode, item.targetSection);
        details.forEach(d => {
          slots.push({
            day: d.day || d.dayOfWeek,
            start: d.startTime,
            end: d.endTime,
            subjectCode: item.subjectCode
          });
        });
      }
    });
    return slots;
  }, [activeCart, subjectCode]);

  const availableSchedules = useMemo(() => {
    if (!subjectCode) return [];
    return sectionsData
      .filter(sec => sec.classes && sec.classes.some(sch => sch.subjectCode === subjectCode))
      .map(sec => {
        const sch = sec.classes.find(s => s.subjectCode === subjectCode);
        const schDay = sch.day || sch.dayOfWeek;
        
        const conflictItem = occupiedSlots.find(slot => 
          slot.day === schDay && (sch.startTime < slot.end && slot.start < sch.endTime)
        );

        return { 
          sectionName: sec.sectionName, 
          conflictWith: conflictItem ? conflictItem.subjectCode : null,
          ...sch 
        };
      });
  }, [subjectCode, occupiedSlots]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[70] font-RB p-4">
      <div className="bg-white w-full max-w-[550px] max-h-[80vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Change Schedule ({subjectCode})</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select a different section block for this subject.</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {availableSchedules.length > 0 ? (
            availableSchedules.map((sch) => {
              const isConflicting = !!sch.conflictWith;
              const isSelected = selected === sch.sectionName;
              
              const wrapperClasses = isConflicting 
                ? "opacity-50 bg-slate-50/50 grayscale-[20%] cursor-not-allowed border-slate-200" 
                : isSelected 
                  ? "border-[#1C6100] bg-emerald-50/40 shadow-xs cursor-pointer" 
                  : "border-slate-200 hover:border-slate-300 bg-white cursor-pointer";

              return (
                <div 
                  key={sch.sectionName} 
                  onClick={() => !isConflicting && setSelected(sch.sectionName)}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${wrapperClasses}`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isSelected && !isConflicting ? 'bg-emerald-100 text-[#1C6100]' : 'bg-slate-100 text-slate-600'}`}>{sch.sectionName}</span>
                      <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1"><Clock size={12}/> {sch.day} • {formatTime12Hour(sch.startTime)} - {formatTime12Hour(sch.endTime)}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      {sch.title || sch.subjectCode}
                      {isConflicting && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold uppercase tracking-wide flex items-center gap-1">
                          <AlertCircle size={10} /> Conflicts with {sch.conflictWith}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-slate-500 mt-0.5">Room: {sch.roomName || 'TBA'} • Prof: {sch.profName || 'TBA'}</span>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected && !isConflicting ? 'border-[#1C6100] bg-[#1C6100] text-white' : 'border-slate-300'}`}>
                    {isSelected && !isConflicting && <CheckCircle2 size={12} strokeWidth={3} />}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm font-semibold text-slate-600">No alternative schedules found.</p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-300 transition cursor-pointer">Cancel</button>
          <button onClick={() => onSave(selected)} disabled={!selected || selected === currentSection} className="px-5 py-2.5 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] transition disabled:opacity-50 shadow-sm cursor-pointer">Save Schedule</button>
        </div>
      </div>
    </div>
  );
};

// MODAL 5: ADD SUBJECT FROM OTHER COURSES 
const AddSubjectFromOtherCoursesModal = ({ show, studentContext, currentCart, onCancel, onAdd }) => {
  const [activeTab, setActiveTab] = useState("IT");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedSection, setSelectedSection] = useState("");

  if (!show) return null;

  const itCourses = [...new Set(
    subjectsData
      .filter(s => s.yearLevel !== "External" && isBSITCurriculumEligibleSubject(s.subjectCode, s.subjectTitle))
      .map(s => s.yearLevel)
      .filter(Boolean)
  )];

  const externalSubjectsList = subjectsData.filter(s => s.yearLevel === "External" && s.targetSemester === ACTIVE_SEMESTER_SHORT);

  const displayedSubjects = activeTab === "IT"
    ? (selectedCourse
      ? subjectsData.filter(s =>
          s.yearLevel === selectedCourse &&
          s.targetSemester === ACTIVE_SEMESTER_SHORT &&
          isBSITCurriculumEligibleSubject(s.subjectCode, s.subjectTitle)
        )
      : [])
    : externalSubjectsList;

  const sectionsForSubject = selectedSubject
    ? sectionsData.filter(sec => 
        sec.offeredSemester === ACTIVE_TERM_STRING &&
        sec.classes && 
        sec.classes.some(sch => sch.subjectCode === selectedSubject.subjectCode)
      ).map(sec => sec.sectionName)
    : [];

  const handleAdd = () => {
    if (!selectedSubject || !selectedSection) return alert("Please select both a subject and a section.");
    if (currentCart.some(item => item.subjectCode === selectedSubject.subjectCode)) return alert("This subject is already in the advising cart.");
    onAdd(selectedSubject.subjectCode, selectedSection);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[70] font-RB p-4">
      <div className="bg-white w-full max-w-[550px] max-h-[80vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Add Cross-Enrolled Subject</h2>
            <p className="text-xs text-slate-500 mt-0.5">Search and add subjects outside the student's normal block.</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg cursor-pointer"><X size={18} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex gap-2 p-1.5 bg-slate-100 rounded-xl mb-2">
            <button
              onClick={() => { setActiveTab("IT"); setSelectedSubject(null); setSelectedSection(""); setSelectedCourse(""); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${activeTab === "IT" ? "bg-white text-[#1C6100] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              IT Curriculum
            </button>
            <button
              onClick={() => { setActiveTab("EXTERNAL"); setSelectedSubject(null); setSelectedSection(""); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex justify-center items-center gap-1.5 cursor-pointer ${activeTab === "EXTERNAL" ? "bg-[#1C6100] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Globe size={14} /> External Gen-Ed
            </button>
          </div>

          {activeTab === "IT" && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Year Level</label>
              <select value={selectedCourse} onChange={(e) => { setSelectedCourse(e.target.value); setSelectedSubject(null); setSelectedSection(""); }} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-semibold outline-none bg-white focus:border-[#1C6100] focus:ring-2 focus:ring-[#1C6100]/20 transition-all cursor-pointer">
                <option value="">Choose a year level...</option>
                {itCourses.map((course) => <option key={course} value={course}>{course}</option>)}
              </select>
            </div>
          )}

          {(activeTab === "EXTERNAL" || selectedCourse) && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select Subject</label>
              <div className="space-y-2 max-h-[220px] overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50 shadow-inner">
                {displayedSubjects.length > 0 ? displayedSubjects.map((subject) => (
                  <div key={subject.subjectCode} onClick={() => { setSelectedSubject(subject); setSelectedSection(""); }} className={`p-4 rounded-xl cursor-pointer border transition-all ${selectedSubject?.subjectCode === subject.subjectCode ? 'border-[#1C6100] bg-emerald-50/60 shadow-sm' : 'border-slate-200 bg-white hover:border-[#1C6100]/30 hover:shadow-xs'}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className={`font-bold ${selectedSubject?.subjectCode === subject.subjectCode ? 'text-[#1C6100]' : 'text-slate-800'}`}>{subject.subjectCode}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5">{subject.subjectTitle}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1.5 rounded-lg">{subject.units} Units</span>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium italic">No subjects available in this category.</div>
                )}
              </div>
            </div>
          )}

          {selectedSubject && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 mt-2">Select Target Section</label>
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-semibold outline-none bg-white focus:border-[#1C6100] focus:ring-2 focus:ring-[#1C6100]/20 transition-all cursor-pointer">
                <option value="">Choose an available section...</option>
                {sectionsForSubject.map((section) => <option key={section} value={section}>{section}</option>)}
              </select>
            </div>
          )}

        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-5 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-100 transition shadow-sm cursor-pointer">Cancel</button>
          <button onClick={handleAdd} disabled={!selectedSubject || !selectedSection} className="px-6 py-2.5 bg-[#1C6100] text-white rounded-xl font-bold text-sm hover:bg-[#154900] transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2">
            <PlusCircle size={16} /> Add Subject
          </button>
        </div>
      </div>
    </div>
  );
};

// MODAL 6: TRANSFEREE CREDIT EVALUATOR
const TransfereeModal = ({ show, studentContext, onCancel, onSuccess }) => {
  const [search, setSearch] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!show || !studentContext) return null;

  const filteredSubjects = subjectsData.filter(s => 
    (s.subjectCode.toLowerCase().includes(search.toLowerCase()) || 
     s.subjectTitle.toLowerCase().includes(search.toLowerCase())) &&
    s.yearLevel !== "External"
  );

  const toggleSubject = (code) => {
    setSelectedSubjects(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = async () => {
    if (selectedSubjects.length === 0) return;
    setIsSubmitting(true);
    try {
      const promises = selectedSubjects.map(code => 
        fetch(`${PRE_ADVISING_API}/transferee/credit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentNumber: studentContext.studentNumber,
            subjectCode: code,
            status: "credited",
            finalGrade: "PASSED",
            semester: "Transferred",
            schoolYear: "Previous"
          })
        })
      );
      
      await Promise.all(promises);
      onSuccess(selectedSubjects);
      setSelectedSubjects([]);
    } catch (error) {
      console.error("Error crediting subjects:", error);
      alert("Failed to credit subjects. Ensure backend is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[70] font-RB p-4">
      <div className="bg-white w-full max-w-[600px] max-h-[85vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-800">Transferee Evaluation</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manually credit passed subjects for {studentContext.firstName} {studentContext.lastName}.</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg cursor-pointer"><X size={18} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#1C6100] bg-slate-50">
            <div className="pl-4 text-slate-400"><Search size={18} /></div>
            <input
              type="text"
              placeholder="Search curriculum subjects..."
              className="w-full px-3 py-3 text-sm outline-none bg-transparent text-slate-700"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50 p-2 space-y-1 max-h-[300px]">
            {filteredSubjects.map(subject => {
              const isSelected = selectedSubjects.includes(subject.subjectCode);
              const alreadyPassed = studentContext.grades && studentContext.grades.some(g => g.subjectCode === subject.subjectCode && ["passed", "credited", "completed"].includes((g.status || "").toLowerCase()));
              
              return (
                <div 
                  key={subject.subjectCode} 
                  onClick={() => !alreadyPassed && toggleSubject(subject.subjectCode)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${alreadyPassed ? 'opacity-50 grayscale cursor-not-allowed bg-slate-100' : isSelected ? 'border-[#1C6100] bg-emerald-50 cursor-pointer' : 'border-slate-200 bg-white hover:border-[#1C6100]/30 cursor-pointer'}`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${alreadyPassed ? 'bg-slate-300 border-slate-300' : isSelected ? 'bg-[#1C6100] border-[#1C6100] text-white' : 'border-slate-300 bg-white'}`}>
                    {(isSelected || alreadyPassed) && <CheckCircle2 size={14} strokeWidth={3} />}
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${isSelected ? 'text-[#1C6100]' : 'text-slate-800'}`}>
                      {subject.subjectCode} {alreadyPassed && <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded ml-2">Already Credited</span>}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">{subject.subjectTitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-600">{selectedSubjects.length} subjects selected</span>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-100 cursor-pointer">Cancel</button>
            <button 
              onClick={handleSubmit} 
              disabled={selectedSubjects.length === 0 || isSubmitting} 
              className="px-6 py-2.5 bg-[#1C6100] text-white rounded-xl font-bold text-sm hover:bg-[#154900] disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Credit Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// SUB-COMPONENT: DIRECTORY VIEW 
const DirectoryView = ({ setYearContext, setCurrentView }) => {
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const directoryCounts = useMemo(() => {
    const counts = { "1st Year": 0, "2nd Year": 0, "3rd Year": 0, "4th Year": 0, "Irregular": 0, "TotalRegular": 0 };
    studentsData.forEach(student => {
      const eStatus = (student.enrollmentStatus || "pending").toLowerCase();
      if (eStatus === "pending") {
        const statusStr = (student.status || "").toLowerCase();
        const isIrregular = statusStr === "irregular";
        
        if (isIrregular) {
          counts["Irregular"] += 1;
        } else {
          const yLvl = formatYear(student.year);
          if (counts[yLvl] !== undefined) counts[yLvl] += 1;
          counts["TotalRegular"] += 1; 
        }
      }
    });
    return counts;
  }, []);

  const displayLevels = [
    { year_level: 1, name: "1st Year", student_count: directoryCounts["1st Year"] },
    { year_level: 2, name: "2nd Year", student_count: directoryCounts["2nd Year"] },
    { year_level: 3, name: "3rd Year", student_count: directoryCounts["3rd Year"] },
    { year_level: 4, name: "4th Year", student_count: directoryCounts["4th Year"] },
    { year_level: "irregular", name: "Irregular Students", student_count: directoryCounts["Irregular"] },
  ];

  const handleBatchConfirm = async () => {
    const regularStudents = studentsData.filter(s => {
      const eStatus = (s.enrollmentStatus || "pending").toLowerCase();
      const statusStr = (s.status || "").toLowerCase();
      return eStatus === "pending" && (statusStr === "regular" || statusStr === "block");
    });
    
    try {
      const payloads = regularStudents.map(student => {
        const fullSection = getFullSection(student);
        const blockSubjects = getBlockSchedule(fullSection);
        
        const formattedAdvisedSubjects = blockSubjects.map(item => {
          let tProgram = "BSIT", tYear = "", tSec = "";
          if (item.targetSection) {
            const [prog, ys] = item.targetSection.split("-");
            tProgram = prog || "BSIT";
            tYear = ys ? ys.charAt(0) : "";
            tSec = ys ? ys.charAt(1) : "";
          }

          return {
            subjectId: item.subjectCode,
            targetProgram: tProgram,
            targetYear: tYear,
            targetSection: tSec,
            targetSemester: ACTIVE_SEMESTER_SHORT,
            droppedSubjectId: null
          };
        });

        const fullSec = getFullSection(student);
        const [prog, ys] = fullSec.split("-");

        return {
          advisingId: `ADV-${student.studentNumber}-${Math.floor(1000 + Math.random() * 9000)}`,
          applicantID: student.studentNumber,
          isApplicant: student.isApplicant || false,
          enrollmentStatus: "advised",
          status: "regular",
          termId: `TERM-${ACTIVE_SEMESTER_SHORT.toUpperCase()}-2026`,
          year: ys ? ys.charAt(0) : (student.year || "1"),
          section: ys ? ys.substring(1) : (student.section || "A"),
          semester: ACTIVE_SEMESTER_SHORT,
          advisedSubjects: formattedAdvisedSubjects 
        };
      });
      
      const res = await fetch(`${PRE_ADVISING_API}/advising/batch-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students: payloads })
      });

      if (!res.ok) {
        throw new Error("Failed to execute batch save.");
      }
      
      setShowBatchModal(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Batch processing failed:", error);
      alert("Error processing batch advising. Check terminal for details.");
    }
  };

  return (
    <div className="font-RB w-full bg-slate-50 flex-1 flex flex-col">
      <div className="px-8 pt-6 pb-4 flex justify-between items-center bg-white shadow-sm z-10">
        <div>
          <h1 className="font-bold text-2xl text-slate-800 tracking-tight">Pre-Advising Directory</h1>
          <p className="text-xs text-slate-400 mt-0.5">Select a year level to manage pending student carts.</p>
        </div>
        {directoryCounts["TotalRegular"] > 0 && (
          <button 
            onClick={() => setShowBatchModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1C6100] text-white rounded-xl font-bold text-sm hover:bg-[#154900] shadow-sm transition active:scale-95 cursor-pointer"
          >
            <RefreshCw size={16} />
            Batch Auto-Advise Regulars
          </button>
        )}
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayLevels.map((item, index) => {
            const isIrregular = item.year_level === "irregular";
            return (
              <div
                key={index}
                onClick={() => {
                  setYearContext({ level: item.year_level, title: item.name, isIrregular });
                  setCurrentView("list");
                }}
                className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-[#1C6100]/30 transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#1C6100] opacity-0 group-hover:opacity-100 transition-opacity" />
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="p-3 bg-emerald-50 text-[#1C6100] rounded-xl group-hover:scale-110 transition-transform">
                      <BookOpen size={24} strokeWidth={2} />
                    </span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${item.student_count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {item.student_count} Pending
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 group-hover:text-[#1C6100] transition-colors">{item.name}</h2>
                  <p className="text-xs text-slate-400 mt-1">Review pending study loads and validate subject eligibility.</p>
                </div>
                <div className="mt-6 flex items-center text-xs font-bold text-[#1C6100] gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Manage Section</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <BatchConfirmModal 
        show={showBatchModal}
        regularCount={directoryCounts["TotalRegular"]}
        onCancel={() => setShowBatchModal(false)}
        onConfirm={handleBatchConfirm}
      />

      <BatchSuccessModal
        show={showSuccessModal}
        count={directoryCounts["TotalRegular"]}
        onClose={() => {
          setShowSuccessModal(false);
          window.location.reload(); 
        }}
      />
    </div>
  );
};

// SUB-COMPONENT: STUDENT LIST VIEW 
const StudentListView = ({ yearContext, setCurrentView, setStudentContext }) => {
  const [search, setSearch] = useState("");

  const relevantStudents = useMemo(() => {
    return studentsData.filter(student => {
      const eStatus = (student.enrollmentStatus || "pending").toLowerCase();
      if (eStatus !== "pending") return false;
      
      const statusStr = (student.status || "").toLowerCase();
      const isIrregular = statusStr === "irregular";
      
      if (yearContext.isIrregular) return isIrregular;
      return !isIrregular && formatYear(student.year) === yearContext.title;
    });
  }, [yearContext]);

  const filteredStudents = relevantStudents.filter((student) =>
    (student.firstName || "").toLowerCase().includes(search.toLowerCase()) ||
    (student.lastName || "").toLowerCase().includes(search.toLowerCase()) ||
    (student.studentNumber || "").toString().includes(search)
  );

  return (
    <div className="font-RB w-full bg-slate-50 flex-1 flex flex-col">
      <div className="px-8 py-3.5 flex justify-between items-center bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentView("directory")} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Pre-Advising</span>
              <ChevronRight size={12} />
              <span className="text-slate-700 font-semibold">{yearContext.title}</span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-bold tracking-wide uppercase ml-2 shadow-sm">
                {ACTIVE_TERM_STRING}
              </span>
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">Select Student to Advise</h1>
          </div>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col p-6 flex-1">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 flex items-center border border-slate-200 rounded-xl overflow-hidden focus-within:border-[#1C6100] focus-within:ring-2 focus-within:ring-[#1C6100]/20 transition-all bg-slate-50">
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

          <div className="w-full overflow-y-auto flex-1 rounded-xl border border-slate-100">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-semibold">Application ID</th>
                  <th className="px-6 py-4 font-semibold">Student Name</th>
                  <th className="px-6 py-4 font-semibold">Section</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map((student, index) => {
                    const statusStr = (student.status || "").toLowerCase();
                    const isRegular = statusStr === "regular" || statusStr === "block";
                    return (
                      <tr
                        key={index}
                        onClick={() => {
                          setStudentContext(student);
                          setCurrentView("student");
                        }}
                        className="hover:bg-slate-50 transition-colors cursor-pointer group"
                      >
                        <td className="px-6 py-4 font-medium text-slate-700">{student.studentNumber}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-600 font-medium">{student.firstName} {student.lastName}</span>
                            {student.demotionReason && (
                              <span className="text-[10px] font-bold bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1 shadow-sm">
                                <AlertCircle size={10} />
                                {student.demotionReason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{getFullSection(student)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${isRegular ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {student.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <Search size={40} strokeWidth={1.5} className="mb-3 opacity-50" />
                        <p className="text-base font-semibold text-slate-600">No pending students found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// SUB-COMPONENT: STUDENT SUBJECT EDITOR VIEW 
const StudentSubjectsView = ({ yearContext, studentContext, setStudentContext, setCurrentView }) => {
  const [cart, setCart] = useState([]);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [replaceModal, setReplaceModal] = useState({ isOpen: false, index: null });
  const [scheduleModal, setScheduleModal] = useState({ isOpen: false, index: null, subjectCode: null });
  const [deletePrompt, setDeletePrompt] = useState({ show: false, index: null });
  const [savePrompt, setSavePrompt] = useState({ show: false, type: "success", message: "", redirect: false });
  const [printPreviewModal, setPrintPreviewModal] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const [addSubjectModal, setAddSubjectModal] = useState(false);

  const [transfereeModal, setTransfereeModal] = useState(false);

  const handleTransfereeSuccess = (newlyCreditedCodes) => {
    setTransfereeModal(false);
    
    const syntheticGrades = newlyCreditedCodes.map(code => ({
      subjectCode: code,
      status: "credited",
      finalGrade: "PASSED",
      semester: "Transferred",
      schoolYear: "Previous"
    }));
    
    const updatedGrades = [...(studentContext.grades || []), ...syntheticGrades];

    // 1. Update active React state so useMemo immediately unlocks prerequisites
    setStudentContext(prev => ({
      ...prev,
      grades: updatedGrades
    }));

    // 2. Sync global studentsData cache so backing out to the list doesn't revert the grades
    const studentIdx = studentsData.findIndex(s => s.studentNumber === studentContext.studentNumber);
    if (studentIdx !== -1) {
      studentsData[studentIdx].grades = updatedGrades;
    }
    
    // 3. Convert credited items in the cart to isPassed: true so they appear under "Show Ineligible & Credited"
    setCart(prev => {
      const updatedCart = prev.map(item => 
        newlyCreditedCodes.includes(item.subjectCode)
          ? { subjectCode: item.subjectCode, targetSection: null, isPassed: true }
          : item
      );
      const existingCodes = updatedCart.map(item => item.subjectCode);
      const newPassedItems = newlyCreditedCodes
        .filter(code => !existingCodes.includes(code))
        .map(code => ({ subjectCode: code, targetSection: null, isPassed: true }));
      
      return [...updatedCart, ...newPassedItems];
    });

    setSavePrompt({ show: true, type: "success", message: `Successfully credited ${newlyCreditedCodes.length} subject(s). Cart recalculated.`, redirect: false });
  };

  const statusStr = (studentContext?.status || "").toLowerCase();
  const isRegular = statusStr === "regular" || statusStr === "block";
  
  const blockSchedule = useMemo(() => {
    return isRegular ? getBlockSchedule(getFullSection(studentContext)) : [];
  }, [isRegular, studentContext]);

  // SMART CART FETCH LOGIC 
  useEffect(() => {
    if (isRegular) return; 
    
    const fetchDraftCart = async () => {
      setIsCartLoading(true);
      try {
        const res = await fetch(`${PRE_ADVISING_API}/advising/draft-cart/${studentContext.studentNumber}`);
        if (res.ok) {
          const data = await res.json();
          if (data.subjects && data.subjects.length > 0) {
            setCart(data.subjects);
          } else {
            const defaultBlock = getBlockSchedule(getFullSection(studentContext));
            const eligibleSubjects = getEligibleSubjects(studentContext);
            const eligibleCodes = eligibleSubjects.map(s => s.subjectCode);
            const autoCart = defaultBlock.filter(item => eligibleCodes.includes(item.subjectCode));
            setCart(autoCart);
          }
        } else {
          console.error("Failed to fetch draft cart. Falling back to auto-populate.");
          const defaultBlock = getBlockSchedule(getFullSection(studentContext));
          const eligibleSubjects = getEligibleSubjects(studentContext);
          const eligibleCodes = eligibleSubjects.map(s => s.subjectCode);
          setCart(defaultBlock.filter(item => eligibleCodes.includes(item.subjectCode)));
        }
      } catch (error) {
        console.error("Network error fetching draft cart:", error);
        const defaultBlock = getBlockSchedule(getFullSection(studentContext));
        const eligibleSubjects = getEligibleSubjects(studentContext);
        const eligibleCodes = eligibleSubjects.map(s => s.subjectCode);
        setCart(defaultBlock.filter(item => eligibleCodes.includes(item.subjectCode)));
      } finally {
        setIsCartLoading(false);
      }
    };

    if (studentContext?.studentNumber) {
      fetchDraftCart();
    }
  }, [studentContext?.studentNumber, isRegular]);

  const displayListWithStatus = useMemo(() => {
    const baseList = isRegular ? blockSchedule : cart;
    const passed = getPassedSubjects(studentContext);

    return baseList.map(item => {
      const subjInfo = subjectsData.find(s => s.subjectCode === item.subjectCode);
      const missingReqs = item.isPassed ? [] : (subjInfo?.prerequisites?.filter(req => !passed.includes(req)) || []);
      
      let isLocked = false;
      let lockReason = "";
      let availableRetake = null;

      if (!isRegular && !item.isPassed && missingReqs.length > 0) {
        isLocked = true;
        
        const reqOffered = sectionsData.some(sec => sec.offeredSemester === ACTIVE_TERM_STRING && sec.classes && sec.classes.some(sch => sch.subjectCode === missingReqs[0]));
        
        if (reqOffered) {
          lockReason = `Requires Prerequisite: ${missingReqs[0]}`;
          
          const alreadyInCart = baseList.some(cartItem => cartItem.subjectCode === missingReqs[0]);
          if (!alreadyInCart) {
            availableRetake = missingReqs[0];
          }
        } else {
          lockReason = `Prerequisite Not Offered: ${missingReqs[0]}`;
        }
      }

      return { ...item, isLocked, lockReason, availableRetake, missingReqs };
    });
  }, [isRegular, blockSchedule, cart, studentContext]);

  const totalUnits = useMemo(() => {
    return displayListWithStatus.reduce((sum, item) => {
      if (item.isLocked || item.isPassed) return sum; 
      const info = subjectsData.find(s => s.subjectCode === item.subjectCode);
      return sum + (info ? info.units : 0);
    }, 0);
  }, [displayListWithStatus]);

  const visibleList = useMemo(() => {
    return displayListWithStatus.filter(item => !item.isLocked && !item.isPassed);
  }, [displayListWithStatus]);

  const hasScheduleConflicts = useMemo(() => {
    if (isRegular) return false; 
    
    let conflict = false;
    const timeSlots = new Set();
    
    for (const item of displayListWithStatus) {
      if (item.isLocked || item.isPassed) continue; 
      if (!item.targetSection && item.isRetake) return true;

      const detailsArray = item.targetSection ? getScheduleDetails(item.subjectCode, item.targetSection) : [];
      detailsArray.forEach(details => {
        const dayLabel = details.day || details.dayOfWeek;
        const slot = `${dayLabel}-${details.startTime}`;
        
        if (timeSlots.has(slot)) conflict = true;
        timeSlots.add(slot);
      });
    }
    return conflict;
  }, [displayListWithStatus, isRegular]);

  const handleAddRetake = (retakeCode) => {
    const offeringSection = sectionsData.find(sec => sec.offeredSemester === ACTIVE_TERM_STRING && sec.classes && sec.classes.some(sch => sch.subjectCode === retakeCode));
    const targetSection = offeringSection ? offeringSection.sectionName : getFullSection(studentContext);
    setCart(prev => [...prev, { subjectCode: retakeCode, targetSection: targetSection }]);
  };

  const handleRemoveRequest = (index) => {
    setDeletePrompt({ show: true, index });
  };

  const handleConfirmRemove = () => {
    setCart(prev => prev.filter((_, i) => i !== deletePrompt.index));
    setDeletePrompt({ show: false, index: null });
  };

  const handleReplaceSave = (newSubjectCode, newTargetSection) => {
    const targetIdx = replaceModal.index; 
    setCart(prev => prev.map((item, i) => 
      i === targetIdx 
        ? { subjectCode: newSubjectCode, targetSection: newTargetSection }
        : item
    ));
    setReplaceModal({ isOpen: false, index: null });
  };

  const handleScheduleSave = (newTargetSection) => {
    const targetIdx = scheduleModal.index;
    setCart(prev => prev.map((item, i) => 
      i === targetIdx 
        ? { ...item, targetSection: newTargetSection }
        : item
    ));
    setScheduleModal({ isOpen: false, index: null, subjectCode: null });
  };

  const saveAdvisingToDatabase = async () => {
    if (isRegular && displayListWithStatus.some(item => item.missingReqs && item.missingReqs.length > 0)) {
      setSavePrompt({ show: true, type: "danger", message: "Cannot save! This student is missing prerequisites for this block. They must be evaluated as an Irregular student." });
      return;
    }

    const validSubjects = displayListWithStatus.filter(item => !item.isLocked && !item.isPassed);
    
    if (validSubjects.length === 0) {
      setSavePrompt({ show: true, type: "danger", message: "There are no valid active subjects in the cart! Cannot save an empty study load." });
      return;
    }

    const needsSchedule = validSubjects.some(item => !item.targetSection);
    if (needsSchedule) {
      setSavePrompt({ show: true, type: "danger", message: "Please assign a schedule to all Retake subjects before saving to the database." });
      return;
    }

    const rawStatus = (studentContext?.status || "").toLowerCase();
    const safeAcademicStatus = (rawStatus === "block" || rawStatus === "regular") ? "regular" : "irregular";

    const fullSec = getFullSection(studentContext);
    const [prog, ys] = fullSec.split("-");

    const payload = {
      advisingId: `ADV-${studentContext?.studentNumber}-${Math.floor(1000 + Math.random() * 9000)}`,
      applicantID: studentContext?.studentNumber, 
      enrollmentStatus: "advised",
      status: safeAcademicStatus,
      termId: `TERM-${ACTIVE_SEMESTER_SHORT.toUpperCase()}-2026`,
      year: ys ? ys.charAt(0) : (studentContext?.year || "1"),
      section: ys ? ys.substring(1) : (studentContext?.section || "A"),
      semester: ACTIVE_SEMESTER_SHORT,
      isApplicant: studentContext?.isApplicant || false,
      ...( !isRegular && { totalUnitsApproved: totalUnits } ),
      advisedSubjects: validSubjects.map(item => {
        let tProgram = "BSIT", tYear = "", tSec = "";
        if (item.targetSection) {
          const [prog, ys] = item.targetSection.split("-");
          tProgram = prog || "BSIT";
          tYear = ys ? ys.charAt(0) : "";
          tSec = ys ? ys.charAt(1) : "";
        }

        const subjectPayload = {
          subjectId: item.subjectCode,
          targetProgram: tProgram,
          targetYear: tYear,
          targetSection: tSec,
          targetSemester: ACTIVE_SEMESTER_SHORT
        };
        
        if (item.replacedSubject) {
          subjectPayload.droppedSubjectId = item.replacedSubject;
        }
        return subjectPayload;
      })
    };

    try {
      const res = await fetch(`${PRE_ADVISING_API}/advising/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const studentIndex = studentsData.findIndex(s => s.studentNumber === studentContext?.studentNumber);
        if (studentIndex !== -1) {
          studentsData[studentIndex].enrollmentStatus = "advised";
        }
        setSavePrompt({ show: true, type: "success", message: `Advising record for ${studentContext.studentNumber} successfully saved to MongoDB!`, redirect: true });
      } else {
        const errorData = await res.json();
        setSavePrompt({ show: true, type: "danger", message: `Error saving advising record: ${errorData.error}` });
      }
    } catch (err) {
      console.error("Database save failed:", err);
      setSavePrompt({ show: true, type: "danger", message: "Network error. Ensure your backend server is running." });
    }
  };

  return (
    <div className="font-RB w-full bg-slate-50 flex-1 flex flex-col">
      <div className="px-8 py-3.5 flex justify-between items-center bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentView("list")} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <span>Pre-Advising</span>
              <ChevronRight size={12} />
              <span>{yearContext.title}</span>
              <ChevronRight size={12} />
              <span className="text-slate-700 font-semibold">Student Cart</span>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-bold tracking-wide uppercase ml-2 shadow-sm">
                {ACTIVE_TERM_STRING}
              </span>
            </div>
            <h1 className="font-bold text-xl text-slate-800 tracking-tight mt-0.5">Study Load Review</h1>
          </div>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6 w-full max-w-[1600px] flex-1 mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-4 z-20">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">{studentContext?.firstName} {studentContext?.lastName}</h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${isRegular ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {studentContext?.status || "—"}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-400 mt-0.5">{studentContext?.studentNumber} • {getFullSection(studentContext)}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-lg font-extrabold text-slate-800">
                {totalUnits} <span className="text-xs font-semibold text-slate-400">Units</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentView("list")} className="px-5 py-2 bg-slate-100 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-200 transition cursor-pointer">Cancel</button>
              {!isRegular && (
                <>
                  <button 
                    onClick={() => setTransfereeModal(true)} 
                    className="px-5 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-[#1C6100] transition flex items-center gap-2 cursor-pointer"
                    title="Evaluate and credit transferee subjects"
                  >
                    <BookOpen size={16} /> 
                    Credit Transferee
                  </button>
                  <button 
                    onClick={() => setPrintPreviewModal(true)} 
                    className="px-5 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-[#1C6100] transition flex items-center gap-2 cursor-pointer"
                    title="Print and preview the pre-advising record"
                  >
                    <Printer size={16} />
                    Print & Preview
                  </button>
                  <button 
                    onClick={() => setAddSubjectModal(true)} 
                    className="px-5 py-2 bg-white text-slate-600 border border-slate-200 rounded-xl font-semibold text-sm hover:bg-slate-50 hover:border-[#1C6100] transition flex items-center gap-2 cursor-pointer"
                    title="Add subjects from other courses"
                  >
                    <Plus size={16} />
                    Add Subject
                  </button>
                </>
              )}
              <div title={(hasScheduleConflicts || isCartLoading || displayListWithStatus.some(item => item.isLocked && item.availableRetake)) ? "Resolve conflicts and add required prerequisites before saving" : ""}>
                <button 
                  onClick={saveAdvisingToDatabase} 
                  disabled={hasScheduleConflicts || isCartLoading || displayListWithStatus.some(item => item.isLocked && item.availableRetake)}
                  className="px-6 py-2 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
                >
                  Save to Database
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col flex-1 overflow-hidden p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-slate-800">{isRegular ? "Assigned Block Schedule" : "Advising Cart Subjects"}</h2>
            {!isRegular && (
              <button
                onClick={() => setShowLocked(!showLocked)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${showLocked ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                {showLocked ? <EyeOff size={14} /> : <Eye size={14} />}
                {showLocked ? "Hide Ineligible & Credited" : "Show Ineligible & Credited"}
              </button>
            )}
          </div>

          <div className="w-full overflow-y-auto flex-1 rounded-xl border border-slate-100">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-semibold">Subject</th>
                  <th className="px-6 py-4 font-semibold">Description</th>
                  <th className="px-6 py-4 font-semibold">Prerequisite</th>
                  <th className="px-6 py-4 font-semibold text-center">Units</th>
                  <th className="px-6 py-4 font-semibold">Schedule (Block)</th>
                  {!isRegular && <th className="px-6 py-4 font-semibold text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isCartLoading ? (
                  <tr>
                    <td colSpan={isRegular ? "5" : "6"} className="py-16 text-center text-slate-400">
                      <RefreshCw className="animate-spin mx-auto mb-3 opacity-50" size={32} />
                      <p className="text-base font-semibold text-slate-600">Drafting Smart Cart...</p>
                    </td>
                  </tr>
                ) : displayListWithStatus.filter(item => showLocked || (!item.isLocked && !item.isPassed) || (item.isLocked && item.availableRetake)).length > 0 ? (
                  displayListWithStatus.map((item, index) => {
                    if (!showLocked && (item.isPassed || (item.isLocked && !item.availableRetake))) return null;

                    const detailsArray = item.targetSection ? getScheduleDetails(item.subjectCode, item.targetSection) : [];
                    const subjInfo = subjectsData.find(s => s.subjectCode === item.subjectCode);
                    const replacedInfo = item.replacedSubject ? subjectsData.find(s => s.subjectCode === item.replacedSubject) : null;
                    const rowOpacity = item.isLocked ? "opacity-50 bg-slate-50/50 grayscale-[20%]" : item.isPassed ? "bg-emerald-50/30" : "hover:bg-slate-50 transition-colors";

                    return (
                      <tr key={index} className={rowOpacity}>
                        <td className="px-6 py-4">
                          {item.replacedSubject && <div className="text-slate-400 font-normal mb-1">{item.replacedSubject}</div>}
                          <div className="flex items-center gap-1.5 font-bold text-slate-700">
                            {item.replacedSubject && <CornerDownRight size={14} className="text-slate-400 shrink-0" />}
                            <div>
                              <span>{item.subjectCode}</span>
                              {item.replacedSubject && (
                                <span className="text-[10px] text-amber-600 font-bold ml-2 uppercase tracking-wide">
                                  Prerequisite
                                </span>
                              )}
                              {item.isPassed && (
                                <span className="text-[10px] bg-emerald-100 text-[#1C6100] px-2 py-0.5 rounded ml-2 uppercase tracking-wide">
                                  Credited
                                </span>
                              )}
                              {item.isRetake && (
                                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded ml-2 uppercase tracking-wide">
                                  Retake
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.replacedSubject && <div className="text-slate-400 font-normal mb-1">{replacedInfo ? replacedInfo.subjectTitle : "Unknown Subject"}</div>}
                          <div className={`text-slate-600 font-medium ${item.replacedSubject ? 'ml-5' : ''}`}>
                            {subjInfo ? subjInfo.subjectTitle : "Unknown Subject"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {item.isPassed ? (
                             <span className="text-[11px] text-emerald-600 font-bold">Passed</span>
                          ) : subjInfo?.prerequisites?.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {subjInfo.prerequisites.map((req, i) => {
                                const reqData = subjectsData.find(s => s.subjectCode === req);
                                const reqTitle = reqData ? reqData.subjectTitle : "Unknown";
                                const isMissingReq = item.missingReqs && item.missingReqs.includes(req);
                                
                                return (
                                  <span key={i} className={`text-[11px] font-medium px-2 py-1 rounded w-max ${isMissingReq ? 'bg-red-50 text-red-600 border border-red-100 font-bold' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                    {req} - {reqTitle} {isMissingReq && "(Missing)"}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">None</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-700">
                          {item.isLocked || item.isPassed ? 0 : (subjInfo ? subjInfo.units : 0)}
                        </td>
                        <td className="px-6 py-4">
                          {item.isPassed ? (
                            <span className="text-emerald-600 text-xs font-semibold">Credited (No Schedule Required)</span>
                          ) : item.isRetake && !item.targetSection ? (
                            <span className="text-amber-500 text-xs font-bold flex items-center gap-1.5"><AlertCircle size={14} /> Schedule Needed</span>
                          ) : detailsArray.length > 0 ? (
                            <div className="flex flex-col gap-2.5">
                              {detailsArray.map((det, dIdx) => (
                                <div key={dIdx} className="flex flex-col">
                                  <span className="font-semibold text-slate-700">{det.day} • {formatTime12Hour(det.startTime)}-{formatTime12Hour(det.endTime)}</span>
                                  <span className="text-xs text-slate-500 mt-0.5">{item.targetSection} • {det.roomName || 'TBA'}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-red-500 text-xs font-semibold">Schedule Not Found</span>
                          )}
                        </td>
                        {!isRegular && (
                          <td className="px-6 py-4">
                            {item.isPassed ? (
                               <span className="text-xs text-slate-400 font-medium italic">Locked</span>
                            ) : item.isLocked ? (
                              <div className="flex items-center gap-2 w-max">
                                <div className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold">
                                  <AlertCircle size={14} />
                                  {item.lockReason}
                                </div>
                                {item.availableRetake && (
                                  <button 
                                    onClick={() => handleAddRetake(item.availableRetake)}
                                    className="flex items-center justify-center gap-1.5 bg-[#1C6100] text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-[#154900] transition active:scale-95 cursor-pointer"
                                  >
                                    <PlusCircle size={14} /> Add {item.availableRetake}
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleRemoveRequest(index)} 
                                  className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition border border-red-100 cursor-pointer"
                                  title="Remove Locked Subject"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => setScheduleModal({ isOpen: true, index, subjectCode: item.subjectCode })}
                                  className={`p-2 rounded-lg transition border cursor-pointer ${!item.targetSection ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200 animate-pulse' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100'}`}
                                  title={!item.targetSection ? "Assign Schedule Now" : "Change Schedule Time"}
                                >
                                  <Clock size={16} />
                                </button>
                                <button 
                                  onClick={() => setReplaceModal({ isOpen: true, index })}
                                  className="p-2 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 transition border border-amber-100 cursor-pointer"
                                  title="Replace Subject"
                                >
                                  <ArrowRightLeft size={16} />
                                </button>
                                <button 
                                  onClick={() => handleRemoveRequest(index)} 
                                  className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition border border-red-100 cursor-pointer"
                                  title="Remove"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="py-16 text-center text-slate-400">
                      <p className="text-base font-semibold text-slate-600">Cart is empty.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ReplaceSubjectModal 
        show={replaceModal.isOpen} 
        studentContext={studentContext} 
        currentCart={cart}
        onCancel={() => setReplaceModal({ isOpen: false, index: null })} 
        onSave={handleReplaceSave} 
      />
      
      <ChangeScheduleModal
        show={scheduleModal.isOpen}
        subjectCode={scheduleModal.subjectCode}
        currentSection={cart[scheduleModal.index]?.targetSection}
        activeCart={displayListWithStatus}
        onCancel={() => setScheduleModal({ isOpen: false, index: null, subjectCode: null })}
        onSave={handleScheduleSave}
      />

      <ConfirmModal 
        show={deletePrompt.show}
        type="danger"
        title="Remove Subject"
        message="Are you sure you want to remove this subject from the cart?"
        onCancel={() => setDeletePrompt({ show: false, index: null })}
        onConfirm={handleConfirmRemove}
      />

      <ConfirmModal
        show={savePrompt.show}
        type={savePrompt.type}
        title={savePrompt.type === "success" ? "Success!" : "Action Required"}
        message={savePrompt.message}
        confirmText="Okay"
        onCancel={null} 
        onConfirm={() => {
          setSavePrompt({ show: false, type: "success", message: "", redirect: false });
          if (savePrompt.redirect) setCurrentView("list");
        }}
      />
      
      {printPreviewModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[110] font-RB p-4">
          <div className="bg-white w-full max-w-[900px] max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-slate-100">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-800">Print Pre-Advising Form</h2>
                <p className="text-xs text-slate-400 mt-0.5">Official enrollment form for {studentContext?.firstName} {studentContext?.lastName}</p>
              </div>
              <button onClick={() => setPrintPreviewModal(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 bg-gray-50 flex justify-center">
              <CorPreview 
                student={studentContext} 
                subjects={visibleList.map(item => {
                  const subjInfo = subjectsData.find(s => s.subjectCode === item.subjectCode);
                  const schedule = item.targetSection ? getScheduleDetails(item.subjectCode, item.targetSection) : [];
                  return {
                    code: item.subjectCode,
                    title: subjInfo?.subjectTitle || "Unknown",
                    units: subjInfo?.units || 0,
                    hours: subjInfo?.hours || subjInfo?.units || 0,
                    schedule: schedule,
                    room: schedule.length ? (schedule[0].roomName || "TBA") : "TBA",
                    target: item.targetSection || "—",
                    instructor: schedule.length ? (schedule[0].profName || "TBA") : (subjInfo?.instructor || "TBA")
                  };
                })}
              />
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 justify-end">
              <button onClick={() => setPrintPreviewModal(false)} className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-300 transition cursor-pointer">
                Close
              </button>
              <button onClick={() => window.print()} className="px-5 py-2.5 bg-[#1C6100] text-white rounded-xl font-semibold text-sm hover:bg-[#154900] transition shadow-sm flex items-center gap-2 cursor-pointer">
                <Printer size={16} />
                Print Form
              </button>
            </div>
          </div>
        </div>
      )}

      {addSubjectModal && (
        <AddSubjectFromOtherCoursesModal
          show={addSubjectModal}
          studentContext={studentContext}
          currentCart={cart}
          onCancel={() => setAddSubjectModal(false)}
          onAdd={(subjectCode, targetSection) => {
            setCart(prev => [...prev, { subjectCode, targetSection }]);
            setAddSubjectModal(false);
          }}
        />
      )}

      {/* THE NEW TRANSFEREE MODAL */}
      <TransfereeModal
        show={transfereeModal}
        studentContext={studentContext}
        onCancel={() => setTransfereeModal(false)}
        onSuccess={handleTransfereeSuccess}
      />
    </div>
  );
};


// MAIN PARENT COMPONENT 
export default function PreAdvising() {
  const [currentView, setCurrentView] = useState("directory"); 
  const [yearContext, setYearContext] = useState({ level: 1, title: "", isIrregular: false });
  const [studentContext, setStudentContext] = useState(null);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${PRE_ADVISING_API}/settings`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/schedules`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/students`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/subjects`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/external-schedules`).then(res => res.ok ? res.json() : []).catch(() => [])
    ])
    .then(([settingsArray, schedules, students, subjects, externalSchedules]) => {
      const settings = Array.isArray(settingsArray) ? settingsArray[0] : (settingsArray || {});
      const safeSchedules = Array.isArray(schedules) ? schedules : [];
      const safeStudents = Array.isArray(students) ? students : [];
      const safeSubjects = Array.isArray(subjects) ? subjects : [];
      const safeExternal = Array.isArray(externalSchedules) ? externalSchedules : [];
      
      ACTIVE_SEMESTER_SHORT = settings.activeSemesterShort || "1st"; 
      ACTIVE_TERM_STRING = settings.activeTermString || "1st Semester 2025-2026";
      
      sectionsData.length = 0;
      sectionsData.push(...safeSchedules);
      
      if (safeExternal.length > 0) {
        const uniqueExtSubjects = new Map();
        const extSectionsMap = new Map();

        safeExternal.forEach(ext => {
          if (!uniqueExtSubjects.has(ext.subjectCode)) {
            uniqueExtSubjects.set(ext.subjectCode, {
              subjectCode: ext.subjectCode,
              subjectTitle: ext.subjectTitle,
              units: ext.units || 3,
              hours: ext.hours || ext.units || 3,
              yearLevel: "External",
              targetSemester: ACTIVE_SEMESTER_SHORT,
              prerequisites: []
            });
          }

          if (!extSectionsMap.has(ext.externalSection)) {
            extSectionsMap.set(ext.externalSection, {
              sectionName: ext.externalSection,
              offeredSemester: ACTIVE_TERM_STRING,
              classes: []
            });
          }
          extSectionsMap.get(ext.externalSection).classes.push({
            subjectCode: ext.subjectCode,
            title: ext.subjectTitle,
            day: ext.day,
            startTime: parseTimeStringToMinutes(ext.startTime),
            endTime: parseTimeStringToMinutes(ext.endTime),
            roomName: ext.roomName,
            profName: ext.profName
          });
        });

        safeSubjects.push(...Array.from(uniqueExtSubjects.values()));
        sectionsData.push(...Array.from(extSectionsMap.values()));
      }

      studentsData.length = 0;
      studentsData.push(...safeStudents);
      
      subjectsData.length = 0;
      subjectsData.push(...safeSubjects);
      
      setIsDbLoaded(true);
    })
    .catch(err => {
      console.error("Failed to fetch database records:", err);
      setIsDbLoaded(true); 
    });
  }, []);

  if (!isDbLoaded) {
    return <div className="h-screen w-full flex items-center justify-center bg-slate-50 text-slate-500 font-bold font-RB ">Connecting to Database...</div>;
  }

  return (
    <>
      {currentView === "directory" && (
        <DirectoryView 
          setYearContext={setYearContext} 
          setCurrentView={setCurrentView} 
        />
      )}
      {currentView === "list" && (
        <StudentListView 
          yearContext={yearContext}
          setStudentContext={setStudentContext}
          setCurrentView={setCurrentView} 
        />
      )}
      {currentView === "student" && (
        <StudentSubjectsView
          yearContext={yearContext}
          studentContext={studentContext}
          setStudentContext={setStudentContext}
          setCurrentView={setCurrentView}
        />
      )}
    </>
  );
}