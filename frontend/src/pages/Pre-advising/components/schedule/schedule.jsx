import { PRE_ADVISING_API } from '../../services/api';
import React, { useState, useCallback, useEffect, useMemo} from "react";
import { Link, useNavigate  } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import withDragAndDropModule from "react-big-calendar/lib/addons/dragAndDrop";
const withDragAndDrop = withDragAndDropModule.default ?? withDragAndDropModule;
import moment from "moment";
import TimeGridModule from "react-big-calendar/lib/TimeGrid";
const TimeGrid = TimeGridModule.default ?? TimeGridModule;
import ExternalSchedules from "./externalschedules";
import ConfirmModal from "../shared/ConfirmModal";
import ExitModal from "../shared/ExitModal";
import { AlertCircle } from "lucide-react";

// Calendar CSS
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

// Year & Semester Normalization Helpers for Robust Matrix Matching
const normalizeYearStr = (y) => {
  if (!y) return "";
  const s = String(y).toLowerCase().trim();
  if (s.includes("1") || s.includes("first")) return "1st";
  if (s.includes("2") || s.includes("second")) return "2nd";
  if (s.includes("3") || s.includes("third")) return "3rd";
  if (s.includes("4") || s.includes("fourth")) return "4th";
  return s;
};

const normalizeSemStr = (sem) => {
  if (!sem) return "";
  const s = String(sem).toLowerCase().trim();
  if (s.includes("1") || s.includes("first")) return "1st";
  if (s.includes("2") || s.includes("second")) return "2nd";
  return s;
};

const normalizeAcademicTerm = (term) =>
  String(term || "")
    .toLowerCase()
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");

// Setup Localizer for the Calendar
const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

//  CUSTOM 6-DAY WEEK VIEW (Monday - Saturday) 
class SixDayWeek extends React.Component {
  render() {
    let { date, ...props } = this.props;
    let range = SixDayWeek.range(date);
    return <TimeGrid {...props} range={range} eventOffset={15} />;
  }
}

SixDayWeek.range = (date) => {
  let start = moment(date).startOf("week").add(1, "day"); // Start on Monday
  let end = moment(date).startOf("week").add(6, "day");   // End on Saturday
  let current = start;
  let range = [];
  while (current.isSameOrBefore(end)) {
    range.push(current.toDate());
    current = current.add(1, "day");
  }
  return range;
};

SixDayWeek.navigate = (date, action) => {
  switch (action) {
    case "PREV": return moment(date).add(-1, "week").toDate();
    case "NEXT": return moment(date).add(1, "week").toDate();
    default: return date;
  }
};

SixDayWeek.title = (date) => {
  return `Week of ${moment(date).format("MMM D")}`;
};

// Format to only show the Day of the Week and kill the default duplicated time label
const customFormats = {
  dayFormat: 'dddd',
  eventTimeRangeFormat: () => '', 
};

// Custom UI for the inside of the Event Cards
const CustomEvent = ({ event }) => {
  
  // RENDER: Ghost Block UI
  if (event.isGhostOriginal) {
    return (
      <div className="flex flex-col h-full w-full p-1.5 justify-start overflow-hidden">
        <div className="text-[10px] font-bold line-through decoration-slate-400">
          {moment(event.start).format('h:mm')} - {moment(event.end).format('h:mm')}
        </div>
        <div className="text-[11px] font-bold line-through decoration-slate-400 truncate mt-0.5">
          {event.title}
        </div>
        <div className="text-[10px] font-medium mt-auto truncate opacity-70">
          {event.room || "TBA"} (Original)
        </div>
      </div>
    );
  }

  const isConflict = event.isConflict;

  // RENDER: Proposed or Untouched UI
  return (
    <div className="flex flex-col h-full w-full p-1.5 justify-start overflow-hidden relative">
      <div className="flex justify-between items-start gap-1 mb-1 relative z-20">
        <div className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-sm w-max flex items-center gap-1 ${
          event.isRequestedChange 
            ? (isConflict ? 'bg-red-100 text-red-700' : 'bg-green-50 text-[#1C6100]') 
            : 'text-[#1C6100] bg-white/95'
        }`}>
          {isConflict && <AlertCircle size={10} strokeWidth={3} />}
          {moment(event.start).format('h:mm A')} - {moment(event.end).format('h:mm A')}
        </div>
      </div>
      
      <div className={`text-[11px] font-bold leading-tight truncate relative z-20 ${
        event.isRequestedChange 
          ? (isConflict ? 'text-red-700' : 'text-[#1C6100]') 
          : 'text-white drop-shadow-md'
      }`}>
        {event.title}
      </div>
      
      <div className={`text-[10px] font-medium mt-auto truncate flex flex-col pt-1 relative z-20 ${
        event.isRequestedChange 
          ? (isConflict ? 'text-red-500' : 'text-emerald-700') 
          : 'text-emerald-100'
      }`}>
        <span className="truncate flex items-center gap-1">
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          {event.room || "TBA"}
        </span>
        <span className="truncate flex items-center gap-1 mt-0.5">
          <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
          {event.instructor || "TBA"}
        </span>
      </div>
    </div>
  );
};

// Custom Event Styling (Wrapper)
const eventStyleGetter = (event, start, end, isSelected) => {
  // 1. THE FADED GHOST (Original Slot)
  if (event.isGhostOriginal) {
    return {
      style: {
        backgroundColor: '#f8fafc', 
        borderRadius: '6px',
        opacity: 0.6,
        color: '#94a3b8', 
        border: '1px dashed #cbd5e1', 
        display: 'block',
        pointerEvents: 'none', 
        zIndex: 1
      }
    };
  }

  // 2. THE PROPOSED SLOT (Clean Ghost Outline or Red Conflict)
  if (event.isRequestedChange) {
    const isConflict = event.isConflict;
    return {
      style: {
        backgroundColor: isConflict ? '#fef2f2' : '#ffffff',
        borderRadius: '6px',
        opacity: 1,
        color: isConflict ? '#b91c1c' : '#1C6100', 
        border: `2px dashed ${isConflict ? '#ef4444' : '#1C6100'}`, 
        display: 'block',
        boxShadow: isConflict ? '0 4px 6px -1px rgba(239, 68, 68, 0.2)' : '0 4px 6px -1px rgba(28, 97, 0, 0.1)', 
        padding: '0px',
        zIndex: 10
      },
      className: 'overflow-hidden relative' 
    };
  }

  // 3. THE UNTOUCHED CLASSES (Standard School Green)
  return {
    style: {
      backgroundColor: '#1C6100', 
      borderRadius: '6px',
      opacity: 1,
      color: 'white',
      border: '2px solid #ffffff', 
      display: 'block',
      boxShadow: '0 2px 4px rgba(0,0,0,0.25)', 
      padding: '0px', 
      transition: 'transform 0.15s ease-in-out',
      zIndex: 5
    }
  };
};

export default function Schedule({ navigateToTab, navigationState }) {
  
  // Core Data State
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [subjectsData, setSubjectsData] = useState([]);
  const [roomsData, setRoomsData] = useState([]);
  const [masterSchedules, setMasterSchedules] = useState([]);
  
  const [events, setEvents] = useState([]);
  const [unscheduledSubjects, setUnscheduledSubjects] = useState([]);

  // Navigation & View State
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("2nd Semester 2025 - 2026");
  
  const [viewMode, setViewMode] = useState("table");
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editEventModal, setEditEventModal] = useState(false);
const [activeSubjectData, setActiveSubjectData] = useState(null);
  const [isAutoSlotting, setIsAutoSlotting] = useState(false);
  const [showExternalSchedules, setShowExternalSchedules] = useState(false);

  const semesterOptions = useMemo(() => {
    const set = new Set();
    if (selectedSemester) set.add(selectedSemester);
    masterSchedules.forEach(s => {
      if (s.offeredSemester) set.add(s.offeredSemester);
    });
    set.add("1st Semester 2026 - 2027");
    set.add("2nd Semester 2026 - 2027");
    set.add("1st Semester 2025 - 2026");
    set.add("2nd Semester 2025 - 2026");
    return Array.from(set).filter(Boolean);
  }, [selectedSemester, masterSchedules]);

  //  CUSTOM MODAL STATES 
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [statusPrompt, setStatusPrompt] = useState({ show: false, type: "success", title: "", message: "" });
  const [overridePrompt, setOverridePrompt] = useState({ show: false, message: "", onConfirm: null });

  // PENDING REQUEST STATES
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [activePreviewRequest, setActivePreviewRequest] = useState(null);

  // CONFLICT DETECTOR FOR PREVIEW MODE
  const isPreviewConflicting = useMemo(() => {
    if (!activePreviewRequest || !events) return false;
    
    const proposed = events.filter(e => e.isRequestedChange);
    const existing = events.filter(e => !e.isRequestedChange && !e.isGhostOriginal);

    // Mathematical overlap check: start1 < end2 && start2 < end1
    return proposed.some(p => {
      return existing.some(ex => {
        return p.start < ex.end && ex.start < p.end;
      });
    });
  }, [events, activePreviewRequest]);

  // CANCEL PREVIEW & REVERT BOARD
  const handleExitPreview = () => {
    // Strip out the proposed blocks and un-fade the originals instantly
    setEvents(prev => prev.filter(e => !e.isRequestedChange).map(e => ({ ...e, isGhostOriginal: false })));
    setActivePreviewRequest(null);
  };


  const uniqueInstructors = [...new Set(subjectsData.map(s => s.instructor).filter(i => i && i !== "TBA"))];

  // FETCH PENDING SCHEDULE REQUESTS
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch(`${PRE_ADVISING_API}/schedule-requests`);
        if (res.ok) {
          const data = await res.json();
          setPendingRequests(data.filter(req => req.status === "pending"));
        }
      } catch (err) {
        console.error("Failed to fetch schedule requests:", err);
      }
    };
    fetchRequests();
  }, []);

  // HANDLE SMART CLICK (Preview Request on Calendar)
  const applyRequestToCalendar = (req) => {
    const yearMap = { "1": "1st Year", "2": "2nd Year", "3": "3rd Year", "4": "4th Year" };
    const mappedYear = yearMap[req.schedule.year];
    const mappedSection = `${req.schedule.program}-${req.schedule.year}${req.schedule.section}`;

    setSelectedYear(mappedYear);
    setSelectedSection(mappedSection);
    setViewMode("scheduler");
    setIsEditing(true);
    setShowRequestsModal(false);
    setActivePreviewRequest(req);

    setTimeout(() => {
      const startOfWeek = moment(new Date(2026, 0, 19)).startOf('week').add(1, 'day');
      const daysMap = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5 };

      const existingSectionData = masterSchedules.find(d => 
        d.sectionName === mappedSection && d.offeredSemester === selectedSemester
      );
      
      const requestedSubjectCodes = req.schedule.classes.map(c => c.subjectCode);
      
      let untouchedEvents = [];
      let ghostEvents = [];

      // 1. SEPARATE EXISTING BLOCKS INTO GHOSTS VS. UNTOUCHED
      if (existingSectionData && existingSectionData.classes) {
        existingSectionData.classes.forEach(block => {
          const dayOffset = daysMap[block.day] || 0;
          const baseDate = moment(startOfWeek).add(dayOffset, 'days');
          const startHr = Math.floor(block.startTime / 60);
          const startMin = block.startTime % 60;
          const endHr = Math.floor(block.endTime / 60);
          const endMin = block.endTime % 60;

          const eventObj = {
            id: Math.random().toString(),
            subjectCode: block.subjectCode,
            title: block.title || block.subjectTitle || block.subjectCode,
            instructor: block.profName,
            profId: block.profId,
            room: block.roomName,
            roomId: block.roomId,
            start: moment(baseDate).hours(startHr).minutes(startMin).toDate(),
            end: moment(baseDate).hours(endHr).minutes(endMin).toDate(),
          };

          if (requestedSubjectCodes.includes(block.subjectCode)) {
            eventObj.isGhostOriginal = true;
            ghostEvents.push(eventObj);
          } else {
            eventObj.isRequestedChange = false;
            untouchedEvents.push(eventObj);
          }
        });
      }

      // 2. INJECT THE NEW PROPOSED BLOCKS
      const requestedEvents = req.schedule.classes.map(block => {
        const dayOffset = daysMap[block.day] || 0;
        const baseDate = moment(startOfWeek).add(dayOffset, 'days');
        const startHr = Math.floor(block.startTime / 60);
        const startMin = block.startTime % 60;
        const endHr = Math.floor(block.endTime / 60);
        const endMin = block.endTime % 60;

        return {
          id: Math.random().toString(),
          subjectCode: block.subjectCode,
          title: block.subjectTitle || block.subjectCode,
          instructor: block.profName,
          profId: block.profId,
          room: block.roomName,
          roomId: block.roomId,
          start: moment(baseDate).hours(startHr).minutes(startMin).toDate(),
          end: moment(baseDate).hours(endHr).minutes(endMin).toDate(),
          isRequestedChange: true 
        };
      });

      // Render untouched (green), ghosts (gray/strikethrough), and proposed (animated blue)
      setEvents([...untouchedEvents, ...ghostEvents, ...requestedEvents]);
      setStatusPrompt({ show: true, type: "success", title: "Previewing Changes", message: "Proposed changes have dropped in. Original times are faded in gray. Check for conflicts before approving." });
    }, 600);
  };

  // HANDLE APPROVE / REJECT STATUS UPDATE
  const handleRequestAction = async (req, action) => {
    try {
      // 1. IF APPROVED: Merge the requested classes into the master schedule and save to DB
      if (action === 'approved') {
        const targetSectionName = `${req.schedule.program}-${req.schedule.year}${req.schedule.section}`;
        const existingSectionData = masterSchedules.find(d => 
          d.sectionName === targetSectionName && d.offeredSemester === selectedSemester
        );

        let finalClasses = [];
        const requestedSubjectCodes = req.schedule.classes.map(c => c.subjectCode);

        // Keep all untouched classes from the original schedule
        if (existingSectionData && existingSectionData.classes) {
          finalClasses = existingSectionData.classes.filter(
            block => !requestedSubjectCodes.includes(block.subjectCode)
          );
        }

        // Inject the newly approved requested classes
        finalClasses = [...finalClasses, ...req.schedule.classes];

        const payload = {
          sectionName: targetSectionName,
          offeredSemester: selectedSemester,
          classes: finalClasses
        };

        // Save merged schedule to backend
        const saveRes = await fetch(`${PRE_ADVISING_API}/schedules/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!saveRes.ok) throw new Error("Failed to save master schedule.");
        
        // Update local master schedules so the UI is aware of the new reality
        setMasterSchedules(prev => {
          const filtered = prev.filter(s => !(s.sectionName === payload.sectionName && s.offeredSemester === payload.offeredSemester));
          return [...filtered, payload];
        });
      }

      // 2. Mark the request as resolved in the database
      const res = await fetch(`${PRE_ADVISING_API}/schedule-requests/${req._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action })
      });

      if (res.ok) {
        setPendingRequests(prev => prev.filter(r => r._id !== req._id));
        
        // 3. Clean up the calendar board if the admin is actively previewing this specific section
        if (selectedSection === `${req.schedule.program}-${req.schedule.year}${req.schedule.section}`) {
           if (action === 'rejected') {
             // Revert: Strip out the proposed blocks and un-fade the originals
             setEvents(prev => prev.filter(e => !e.isRequestedChange).map(e => ({ ...e, isGhostOriginal: false })));
           } else {
             // Finalize: Delete the faded originals and formalize the proposed blocks
             setEvents(prev => prev.filter(e => !e.isGhostOriginal).map(e => ({ ...e, isRequestedChange: false })));
           }
        }
        
        setActivePreviewRequest(null); // Clear the preview state
        
        setStatusPrompt({ show: true, type: "success", title: "Request Updated", message: `The schedule request has been successfully ${action}.` });
      } else {
        setStatusPrompt({ show: true, type: "danger", title: "Update Failed", message: "Failed to update request status in the database." });
      }
    } catch (err) {
      console.error(err);
      setStatusPrompt({ show: true, type: "danger", title: "Error", message: "Failed to process the request." });
    }
  };

  // Helper function to convert 12-hour AM/PM strings into integer minutes for the conflict matrix
  const parseTimeToMinutes = (timeStr) => {
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

  //  INITIAL DATA FETCH (THE MATRIX) 
  useEffect(() => {
    Promise.all([
      fetch(`${PRE_ADVISING_API}/schedules`).then(res => res.json()),
      fetch(`${PRE_ADVISING_API}/rooms`).then(res => res.ok ? res.json() : []).catch(() => []),
      fetch(`${PRE_ADVISING_API}/settings`).then(res => res.ok ? res.json() : []).catch(() => []),
      // Add the external schedules fetch
      fetch(`${PRE_ADVISING_API}/external-schedules`).then(res => res.ok ? res.json() : []).catch(() => [])
    ]).then(([schedules, rooms, settingsData, externalSchedules]) => {
      
      const settings = Array.isArray(settingsData) ? settingsData[0] : settingsData;
      const activeTerm = settings?.activeTermString || "1st Semester 2026 - 2027";

      // Format external schedules into dummy section blocks so the conflict checker can read them
      const extSectionsMap = new Map();
      if (externalSchedules && externalSchedules.length > 0) {
        externalSchedules.forEach(ext => {
          if (!extSectionsMap.has(ext.externalSection)) {
            extSectionsMap.set(ext.externalSection, {
              sectionName: ext.externalSection,
              offeredSemester: activeTerm,
              classes: []
            });
          }
          extSectionsMap.get(ext.externalSection).classes.push({
            subjectCode: ext.subjectCode,
            title: ext.subjectTitle,
            day: ext.day,
            startTime: parseTimeToMinutes(ext.startTime),
            endTime: parseTimeToMinutes(ext.endTime),
            roomName: ext.roomName,
            profName: ext.profName
          });
        });
      }

      // Combine standard IT schedules with the newly formatted external schedules
      setMasterSchedules([...schedules, ...Array.from(extSectionsMap.values())]);
      
      setRoomsData(rooms.length > 0 ? rooms : [
        { roomName: "Computer Lab 1", type: "Laboratory" },
        { roomName: "Computer Lab 2", type: "Laboratory" },
        { roomName: "Lec 301", type: "Lecture" },
        { roomName: "Lec 302", type: "Lecture" }
      ]);

      // Database uses activeTermString, not semester/schoolYear
      if (settings && settings.activeTermString) {
        setSelectedSemester(settings.activeTermString);
      }
      
      setIsDbLoaded(true);
    }).catch(err => {
      console.error("Failed to load matrix resources:", err);
      setIsDbLoaded(true);
    });
  }, []);

  //  POPULATE SECTION SCHEDULE & FETCH BLUEPRINT 
  useEffect(() => {
    if (!selectedSection || !selectedYear || !selectedSemester || !isDbLoaded) {
      setEvents([]);
      setUnscheduledSubjects([]);
      return;
    }

    const loadSectionData = async () => {
      let targetedSubjects = [];
      try {
        const res = await fetch(`${PRE_ADVISING_API}/subjects`);
        const allSubjects = await res.json();
        
        const shortSemester = normalizeSemStr(selectedSemester);
        const shortYear = normalizeYearStr(selectedYear);
        
        // Robust Filter by BOTH Semester and Year!
        targetedSubjects = allSubjects.filter(sub => {
          const subSem = normalizeSemStr(sub.targetSemester || sub.semester);
          const subYear = normalizeYearStr(sub.yearLevel || sub.year);
          return subSem === shortSemester && subYear === shortYear;
        });
        setSubjectsData(targetedSubjects);
      } catch (err) {
        console.error("Failed to fetch subjects:", err);
      }

      const sectionData = masterSchedules.find(d => {
        if (d.sectionName !== selectedSection) return false;
        if (!selectedSemester) return true;
        const scheduleTerm = d.offeredSemester || (
          d.semester && d.academicYear
            ? `${d.semester} Semester ${d.academicYear}`
            : ""
        );
        const dSem = normalizeAcademicTerm(scheduleTerm);
        const selSem = normalizeAcademicTerm(selectedSemester);
        return dSem === selSem;
      });
      const startOfWeek = moment(new Date(2026, 0, 19)).startOf('week').add(1, 'day');
      const daysMap = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5 };

      let loadedEvents = [];
      let scheduledSubjectCodes = [];

      if (sectionData && sectionData.classes) {
        loadedEvents = sectionData.classes.map(block => {
          const dayOffset = daysMap[block.day] || 0;
          const baseDate = moment(startOfWeek).add(dayOffset, 'days');
          
          // Convert integer minutes (e.g., 420) back to hours and minutes
          const startHr = Math.floor(block.startTime / 60);
          const startMin = block.startTime % 60;
          const endHr = Math.floor(block.endTime / 60);
          const endMin = block.endTime % 60;
          
          scheduledSubjectCodes.push(block.subjectCode);

          return {
            id: Math.random().toString(),
            subjectCode: block.subjectCode,
            title: block.title, 
            instructor: block.profName,
            profId: block.profId,
            room: block.roomName,
            roomId: block.roomId,
            start: moment(baseDate).hours(startHr).minutes(startMin).toDate(),
            end: moment(baseDate).hours(endHr).minutes(endMin).toDate(),
          };
        });
      }

      setEvents(loadedEvents);

      const pendingSubjects = targetedSubjects
        .filter(sub => !scheduledSubjectCodes.includes(sub.subjectCode))
        .map(sub => {
          const assignedInstructor = sub.instructor || "TBA";
          
          // Prevents MongoDB string data from causing JS concatenation bugs
          const lec = Number(sub.lecture) || 0;
          const lab = Number(sub.laboratory) || 0;
          const units = Number(sub.units) || 3;
          
          const totalPhysicalHours = (lec + lab) > 0 ? (lec + lab) : units;

          return {
            id: sub.subjectCode,
            subjectCode: sub.subjectCode,
            title: `${sub.subjectCode} - ${sub.subjectTitle}`,
            lecHours: lec,
            labHours: lab,
            duration: totalPhysicalHours,
            instructor: assignedInstructor
          };
        });

      setUnscheduledSubjects(pendingSubjects);
    };

    loadSectionData();
  }, [selectedSection, selectedYear, selectedSemester, isDbLoaded, masterSchedules]);


  //  THE CONFLICT MATRIX LOGIC (TWO-TIER: HARD BLOCKS & SOFT WARNINGS) 
  const checkGlobalConflict = useCallback((start, end, room, instructor, eventId, ignoreSubjectCode = null) => {
    let hardError = null;
    let softWarning = null;

    // Internal Section Check (HARD)
    const hasInternal = events.some(ev => {
      if (ev.id === eventId) return false;
      if (ignoreSubjectCode && ev.subjectCode === ignoreSubjectCode) return false;
      return start < ev.end && ev.start < end;
    });
    if (hasInternal) hardError = "Internal Time Conflict! You already have a class scheduled at this time for this section.";

    const droppedDay = moment(start).format('dddd');
    const startDec = moment(start).hours() + moment(start).minutes() / 60;
    const endDec = moment(end).hours() + moment(end).minutes() / 60;
    const newBlockDuration = endDec - startDec;
    
    const safeRoom = room || "TBA";
    const isNewBlockOnline = safeRoom.toUpperCase().includes("ONLINE") || safeRoom.toUpperCase().includes("(VC)");

    // Lunch Ban (SOFT)
    if (!hardError && !isNewBlockOnline && (startDec < 13.0 && 12.0 < endDec)) {
      softWarning = "Lunch Ban! Physical classes are strictly supposed to avoid the 12:00 PM - 1:00 PM window.";
    }

    let instructorTotalHoursToday = 0;
    let instructorF2FHoursToday = 0;

    // Global University Check (HARD)
    for (const section of masterSchedules) {
      if (section.sectionName === selectedSection || section.offeredSemester !== selectedSemester || !section.classes) continue; 

      for (const block of section.classes) { 
        if (block.day === droppedDay) { 
          const blockStartDec = block.startTime / 60;
          const blockEndDec = block.endTime / 60;

          if (startDec < blockEndDec && blockStartDec < endDec) {
            if (safeRoom !== "TBA" && block.roomName === safeRoom) { 
              hardError = `Room Conflict! [${safeRoom}] is already booked by [${section.sectionName}] at this time.`;
            }
            if (instructor && instructor !== "TBA" && block.profName === instructor) { 
              hardError = `Instructor Conflict! [${instructor}] is already teaching [${section.sectionName}] at this time.`;
            }
          }

          if (instructor && instructor !== "TBA" && block.profName === instructor) { 
            const blockDur = blockEndDec - blockStartDec;
            instructorTotalHoursToday += blockDur;
            const isBlockOnline = block.roomName && (block.roomName.toUpperCase().includes("ONLINE") || block.roomName.toUpperCase().includes("(VC)"));
            if (!isBlockOnline) instructorF2FHoursToday += blockDur;
          }
        }
      }
    }

    // Workload Constraints (SOFT)
    if (instructor && instructor !== "TBA") {
      for (const ev of events) {
        if (ev.id === eventId || (ignoreSubjectCode && ev.subjectCode === ignoreSubjectCode)) continue; 
        
        if (moment(ev.start).format('dddd') === droppedDay && ev.instructor === instructor) {
          const evDur = moment(ev.end).diff(moment(ev.start), 'hours', true);
          instructorTotalHoursToday += evDur;
          const evRoom = ev.room || "TBA";
          if (!(evRoom.toUpperCase().includes("ONLINE") || evRoom.toUpperCase().includes("(VC)"))) {
            instructorF2FHoursToday += evDur;
          }
        }
      }

      if (!hardError && !softWarning) {
        if (instructorTotalHoursToday + newBlockDuration > 9.0) {
          softWarning = `Burnout Warning: Adding this pushes [${instructor}] past the 9-hour total daily limit on ${droppedDay}.`;
        } else if (!isNewBlockOnline && (instructorF2FHoursToday + newBlockDuration > 6.0)) {
          softWarning = `Fatigue Warning: Adding this pushes [${instructor}] past the 6-hour Face-to-Face limit on ${droppedDay}.`;
        }
      }
    }

    // Return the object mapping instead of just a string
    return { error: hardError, warning: hardError ? null : softWarning }; 
  }, [events, masterSchedules, selectedSection, selectedSemester]);


  const saveScheduleToDatabase = async () => {
    // HARD-STOP: Prevent the UI from ever firing the API call during a preview
    if (events.some(e => e.isRequestedChange || e.isGhostOriginal)) {
      setStatusPrompt({ 
        show: true, 
        type: "danger", 
        title: "Action Blocked", 
        message: "You cannot save the schedule while previewing a pending request. Please 'Approve' or 'Reject' the request via the Pending Requests menu instead." 
      });
      setShowConfirmModal(false);
      return;
    }

    if (events.length === 0) {
      setStatusPrompt({ show: true, type: "danger", title: "Action Required", message: "The schedule is empty! Add classes before saving." });
      setShowConfirmModal(false);
      return;
    }

    const dbClasses = events.map(ev => {
      const startMins = moment(ev.start).hours() * 60 + moment(ev.start).minutes();
      const endMins = moment(ev.end).hours() * 60 + moment(ev.end).minutes();

      return {
        sectionName: selectedSection,
        subjectCode: ev.subjectCode,
        day: moment(ev.start).format('dddd'),
        startTime: startMins,
        endTime: endMins,
        roomId: ev.roomId || "tba",
        roomName: ev.room || "TBA",
        profId: ev.profId || "tba",
        profName: ev.instructor || "TBA"
      };
    });

    const payload = {
      sectionName: selectedSection,
      offeredSemester: selectedSemester,
      classes: dbClasses 
    };

    try {
      const res = await fetch(`${PRE_ADVISING_API}/schedules/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setStatusPrompt({ show: true, type: "success", title: "Success!", message: "Schedule successfully saved to database!" });
        setMasterSchedules(prev => {
          const filtered = prev.filter(s => !(s.sectionName === selectedSection && s.offeredSemester === selectedSemester));
          return [...filtered, payload];
        });

        setShowConfirmModal(false);
        setIsEditing(false);
      } else {
        const errorData = await res.json();
        setStatusPrompt({ show: true, type: "danger", title: "Error", message: `Error saving schedule: ${errorData.error}` });
      }
    } catch (err) {
      console.error("Failed to save schedule:", err);
      setStatusPrompt({ show: true, type: "danger", title: "Network Error", message: "Network error. Make sure your backend is running." });
    }
  };

  //  DRAG & DROP WITH CONFLICT CHECKING 
  const moveEvent = useCallback(
    ({ event, start, end, isAllDay: droppedOnAllDaySlot = false }) => {
      const { error, warning } = checkGlobalConflict(start, end, event.room, event.instructor, event.id, event.subjectCode);
      if (error) {
        setStatusPrompt({ show: true, type: "danger", title: "Schedule Conflict", message: error });
        return; 
      }

      const applyMove = () => {
        setEvents((prev) => {
          const { allDay } = event;
          const finalAllDay = !allDay && droppedOnAllDaySlot ? true : allDay;
          const existing = prev.find((ev) => ev.id === event.id) ?? {};
          const filtered = prev.filter((ev) => ev.id !== event.id);
          return [...filtered, { ...existing, start, end, allDay: finalAllDay }];
        });
      };

      if (warning) {
        setOverridePrompt({
          show: true, 
          message: warning + " Do you wish to override this policy?", 
          onConfirm: () => { applyMove(); setOverridePrompt({ show: false, message: "", onConfirm: null }); }
        });
        return;
      }

      applyMove();
    },
    [setEvents, checkGlobalConflict]
  );

  const resizeEvent = useCallback(
    ({ event, start, end }) => {
      const { error, warning } = checkGlobalConflict(start, end, event.room, event.instructor, event.id, event.subjectCode);
      if (error) {
        setStatusPrompt({ show: true, type: "danger", title: "Schedule Conflict", message: error });
        return;
      }

      const applyResize = () => {
        setEvents((prev) => {
          const existing = prev.find((ev) => ev.id === event.id) ?? {};
          const filtered = prev.filter((ev) => ev.id !== event.id);
          return [...filtered, { ...existing, start, end }];
        });
      };

      if (warning) {
        setOverridePrompt({
          show: true, 
          message: warning + " Do you wish to override this policy?", 
          onConfirm: () => { applyResize(); setOverridePrompt({ show: false, message: "", onConfirm: null }); }
        });
        return;
      }

      applyResize();
    },
    [setEvents, checkGlobalConflict]
  );

  const getInstructorForSubject = (subjectCode) => {
    const sub = subjectsData.find(s => s.subjectCode === subjectCode);
    return sub ? (sub.instructor || "TBA") : "TBA";
  };

  const handleEventClick = (event) => {
    if (!isEditing) return; 
    const code = event.subjectCode;
    
    let sessions = [];
    if (code) {
      sessions = events.filter(e => e.subjectCode === code).map(e => ({
        ...e,
        day: moment(e.start).format('dddd'),
        room: e.room || ""
      }));
    } else {
      sessions = [{ ...event, day: moment(event.start).format('dddd'), room: event.room || "" }];
    }

    setActiveSubjectData({
      originalCode: code || event.id, 
      subjectCode: code || "",
      title: event.title || "",
      instructor: event.instructor || "",
      sessions: sessions
    });
    setEditEventModal(true);
  };

  const saveEventDetails = () => {
    const startOfWeek = moment(events.length > 0 ? events[0].start : new Date(2026, 0, 19)).startOf('week').add(1, 'day');
    const daysMap = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5 };
    
    const finalizedSessions = activeSubjectData.sessions.map(sess => {
      const dayOffset = daysMap[sess.day] || 0;
      const baseDate = moment(startOfWeek).add(dayOffset, 'days');
      return {
        id: sess.id || Math.random().toString(),
        start: moment(baseDate).hours(moment(sess.start).hours()).minutes(moment(sess.start).minutes()).toDate(),
        end: moment(baseDate).hours(moment(sess.end).hours()).minutes(moment(sess.end).minutes()).toDate(),
        room: sess.room,
        title: activeSubjectData.title,
        subjectCode: activeSubjectData.subjectCode,
        instructor: activeSubjectData.instructor
      };
    });

    setEvents(prev => {
      const filterOut = activeSubjectData.originalCode 
        ? prev.filter(ev => ev.subjectCode !== activeSubjectData.originalCode && ev.id !== activeSubjectData.originalCode)
        : prev;
      return [...filterOut, ...finalizedSessions];
    });
    
    if (!activeSubjectData.originalCode || activeSubjectData.originalCode !== activeSubjectData.subjectCode) {
      setUnscheduledSubjects(prev => prev.filter(s => s.id !== activeSubjectData.subjectCode));
    }

    setEditEventModal(false);
  };

  const handleUnslotSubject = () => {
    if (!activeSubjectData || !activeSubjectData.originalCode) return;
    
    const codeToUnslot = activeSubjectData.originalCode;
    
    // Yank it off the calendar
    setEvents(prev => prev.filter(ev => ev.subjectCode !== codeToUnslot && ev.id !== codeToUnslot));
    
    // Put it back into the Holding Pen
    const subInfo = subjectsData.find(s => s.subjectCode === codeToUnslot);
    if (subInfo) {
      setUnscheduledSubjects(prev => {
        if (prev.some(s => s.id === codeToUnslot)) return prev; 
        
        const assignedInstructor = subInfo.instructor || "TBA";
        // Must read from 'lecture', not 'lecHours', because it fetches from raw API data
        const lec = Number(subInfo.lecture) || 0;
        const lab = Number(subInfo.laboratory) || 0;
        const totalPhysicalHours = (lec + lab) > 0 ? (lec + lab) : (Number(subInfo.units) || 3);

        return [...prev, {
          id: codeToUnslot,
          subjectCode: codeToUnslot,
          title: `${codeToUnslot} - ${subInfo.subjectTitle}`,
          lecHours: lec,
          labHours: lab,
          duration: totalPhysicalHours,
          instructor: assignedInstructor
        }];
      });
    }
    
    setEditEventModal(false);
  };

  const handleSaveToJSON = () => {
    if (events.length === 0) {
      alert("The schedule is empty! Add classes before saving.");
      return;
    }

    const formattedData = events.map(ev => {
      const matchedSubject = subjectsData.find(s => s.subjectCode === ev.subjectCode) || {};
      
      return {
        semester: selectedSemester,
        yearLevel: selectedYear,
        section: selectedSection,
        subjectCode: ev.subjectCode,
        subjectTitle: matchedSubject.subjectTitle || (ev.title ? ev.title.split(" - ")[1]?.trim() : ""),
        instructor: ev.instructor || matchedSubject.instructor || "TBA",
        room: ev.room || "TBA",
        day: moment(ev.start).format('dddd'),
        startTime: moment(ev.start).format('HH:mm'),
        endTime: moment(ev.end).format('HH:mm'),
        totalHours: moment(ev.end).diff(moment(ev.start), 'hours', true)
      };
    });

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(formattedData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Schedule_Output_${selectedSection.replace(/\s+/g, '_')}.json`);
    
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    setShowConfirmModal(false);
  };

  //  AUTO-SLOT MATCHMAKER TRIGGER 
  const handleAutoSlot = async (sub) => {
    if (isAutoSlotting) return; // Prevent double-clicks from destroying the matrix
    setIsAutoSlotting(true);

    try {
      const draftEvents = events.map(ev => ({
        day: moment(ev.start).format('dddd'),
        startTime: moment(ev.start).hours() * 60 + moment(ev.start).minutes(),
        endTime: moment(ev.end).hours() * 60 + moment(ev.end).minutes(),
        roomName: ev.room || "TBA",
        profName: ev.instructor || "TBA"
      }));

      const payload = {
        sectionName: selectedSection,
        semester: selectedSemester,
        subjectCode: sub.subjectCode,
        durationHours: sub.duration,
        lecHours: sub.lecHours, 
        labHours: sub.labHours, 
        draftEvents: draftEvents 
      };

      const res = await fetch(`${PRE_ADVISING_API}/availability/auto-slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch slots"); 
      }

      const validSlots = await res.json();

      if (!validSlots || validSlots.length === 0) {
        setStatusPrompt({ show: true, type: "danger", title: "Matrix Full", message: `No available slots found for ${sub.title}. The matrix is completely full for this instructor or all rooms are booked.` });
        return;
      }

      const startOfWeek = moment(new Date(2026, 0, 19)).startOf('week').add(1, 'day');
      const daysMap = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5 };
      
      // Map through every block the backend algorithm gave us and create an event for it
      const generatedEvents = validSlots.map(match => {
        const dayOffset = daysMap[match.day] || 0; // Changed dayOfWeek to day
        const baseDate = moment(startOfWeek).add(dayOffset, 'days');
        
        // Convert integer minutes to hours/minutes
        const startHr = Math.floor(match.startTime / 60);
        const startMin = match.startTime % 60;
        const endHr = Math.floor(match.endTime / 60);
        const endMin = match.endTime % 60;

        return {
          id: Math.random().toString(),
          subjectCode: sub.subjectCode,
          title: match.title || sub.title,
          instructor: match.profName, // Changed instructorName to profName
          profId: match.profId,
          room: match.roomName, // Changed room to roomName
          roomId: match.roomId,
          start: moment(baseDate).hours(startHr).minutes(startMin).toDate(),
          end: moment(baseDate).hours(endHr).minutes(endMin).toDate(),
        };
      });

      // Drop all generated blocks onto the calendar at once
      setEvents(prev => [...prev, ...generatedEvents]);
      setUnscheduledSubjects(prev => prev.filter(s => s.id !== sub.id));

    } catch (err) {
      console.error("Auto-slot error:", err);
      setStatusPrompt({ show: true, type: "danger", title: "Network Error", message: "Network error trying to auto-slot this subject. Check your backend console." });
    } finally {
      setIsAutoSlotting(false); // Unlock the button
    }
  };

  // SEQUENTIAL AUTO-SLOT ALL ENGINE 
  const handleAutoSlotAll = async () => {
    if (isAutoSlotting) return;
    setIsAutoSlotting(true);

    let currentEvents = [...events];
    let currentUnscheduled = [...unscheduledSubjects];
    let failures = [];

    const startOfWeek = moment(new Date(2026, 0, 19)).startOf('week').add(1, 'day');
    const daysMap = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5 };

    for (const sub of unscheduledSubjects) {
      try {
        const draftEvents = currentEvents.map(ev => ({
          day: moment(ev.start).format('dddd'),
          startTime: moment(ev.start).hours() * 60 + moment(ev.start).minutes(),
          endTime: moment(ev.end).hours() * 60 + moment(ev.end).minutes(),
          roomName: ev.room || "TBA",
          profName: ev.instructor || "TBA"
        }));

        const payload = {
          sectionName: selectedSection,
          semester: selectedSemester,
          subjectCode: sub.subjectCode,
          durationHours: sub.duration,
          lecHours: sub.lecHours, 
          labHours: sub.labHours, 
          draftEvents: draftEvents 
        };

        const res = await fetch(`${PRE_ADVISING_API}/availability/auto-slot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          failures.push(sub.subjectCode);
          continue; // Move to the next subject if this one fails
        }

        const validSlots = await res.json();
        if (!validSlots || validSlots.length === 0) {
          failures.push(sub.subjectCode);
          continue;
        }

        const generatedEvents = validSlots.map(match => {
        const dayOffset = daysMap[match.day] || 0; // Changed dayOfWeek to day
        const baseDate = moment(startOfWeek).add(dayOffset, 'days');
        
        // Convert integer minutes to hours/minutes
        const startHr = Math.floor(match.startTime / 60);
        const startMin = match.startTime % 60;
        const endHr = Math.floor(match.endTime / 60);
        const endMin = match.endTime % 60;

        return {
          id: Math.random().toString(),
          subjectCode: sub.subjectCode,
          title: match.title || sub.title,
          instructor: match.profName, // Changed instructorName to profName
          profId: match.profId,
          room: match.roomName, // Changed room to roomName
          roomId: match.roomId,
          start: moment(baseDate).hours(startHr).minutes(startMin).toDate(),
          end: moment(baseDate).hours(endHr).minutes(endMin).toDate(),
        };
      });

        // Update local arrays for the next loop iteration
        currentEvents = [...currentEvents, ...generatedEvents];
        currentUnscheduled = currentUnscheduled.filter(s => s.id !== sub.id);
        
        // Progressively update the UI so it looks like it's slotting in real-time
        setEvents(currentEvents);
        setUnscheduledSubjects(currentUnscheduled);

      } catch (err) {
        console.error("Auto-slot error for", sub.subjectCode, err);
        failures.push(sub.subjectCode);
      }
    }

    setIsAutoSlotting(false);
    
    if (failures.length > 0) {
      setStatusPrompt({ show: true, type: "danger", title: "Auto-Slot Incomplete", message: `The matrix was full or constraints blocked the following subjects: ${failures.join(", ")}` });
    }
  };

  const availableSections = selectedYear 
    ? ["A", "B", "C", "D", "E"].map(letter => `BSIT-${selectedYear.charAt(0)}${letter}`)
    : [];

  const handleYearChange = (e) => {
    setSelectedYear(e.target.value);
    setSelectedSection("");
    setIsEditing(false);
  };

  if (showExternalSchedules) {
    return (
      <ExternalSchedules 
        onBack={() => {
          setShowExternalSchedules(false);
          if (navigateToTab) navigateToTab('pre-advising-schedule');
        }} 
      />
    );
  }

  if (!isDbLoaded) {
    return <div className="h-screen w-full flex items-center justify-center bg-[#f5f6f8] text-slate-500 font-bold font-RB ">Connecting Matrix Core...</div>;
  }

  // --- CONFLICT DETECTION MATH ---
  // Maps over events and flags proposed changes that overlap with untouched classes
  const processedEvents = events.map(event => {
    if (!event.isRequestedChange) return event; 
    
    const hasConflict = events.some(other => {
      if (other.isGhostOriginal || other.isRequestedChange) return false;
      
      const startA = new Date(event.start).getTime();
      const endA = new Date(event.end).getTime();
      const startB = new Date(other.start).getTime();
      const endB = new Date(other.end).getTime();
      
      // Strict temporal overlap check
      return (startA < endB && startB < endA);
    });
    
    return { ...event, isConflict: hasConflict };
  });

  return (
    <div className="bg-[#f5f6f8] flex-1 font-RB w-full flex flex-col overflow-hidden min-h-[calc(100vh-70px)]">
      
      {/* HEADER: Dropdowns & Actions */}
      <div className="px-6 py-3 flex flex-wrap justify-between items-center border-b border-slate-200 bg-white shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-xl text-slate-800 tracking-tight">Class Scheduler</h1>
          <div className="flex flex-col sm:flex-row gap-3 ml-2 w-full md:w-auto">
            <div className="relative w-full sm:w-48">
              <select 
                className="w-full appearance-none bg-white border border-gray-300 hover:border-gray-400 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1C6100]/50 focus:border-[#1C6100] cursor-pointer transition-all"
                value={selectedYear}
                onChange={handleYearChange}
              >
                <option value="" disabled className="text-gray-400">Select Year Level</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="relative w-full sm:w-48">
              <select 
                className={`w-full appearance-none bg-white border rounded-lg px-4 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1C6100]/50 focus:border-[#1C6100] transition-all ${!selectedYear ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed' : 'border-gray-300 hover:border-gray-400 text-gray-700 cursor-pointer'}`}
                value={selectedSection}
                onChange={(e) => {
                  setSelectedSection(e.target.value);
                  setIsEditing(false);
                }}
                disabled={!selectedYear}
              >
                <option value="" disabled className="text-gray-400">Select Section</option>
                {availableSections.map(sec => <option key={sec} value={sec} className="text-gray-800">{sec}</option>)}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 ${!selectedYear ? 'text-gray-300' : 'text-gray-500'}`}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* PENDING REQUESTS INBOX BUTTON */}
          <button
            onClick={() => setShowRequestsModal(true)}
            className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition active:scale-95 flex items-center gap-2 border bg-white ${
              pendingRequests.length > 0 
                ? 'border-red-400 text-red-600 hover:bg-red-50' 
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Pending Schedule Requests"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
            <span className="hidden xl:inline">Pending Requests</span>
            {pendingRequests.length > 0 ? (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-md leading-none">{pendingRequests.length}</span>
            ) : (
              <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[10px] px-1.5 py-0.5 rounded-md leading-none">0</span>
            )}
          </button>
          <button 
            onClick={() => {
              setShowExternalSchedules(true);
              if (navigateToTab) navigateToTab('pre-advising-external-schedules');
            }}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 hover:border-[#1C6100] transition active:scale-95 cursor-pointer flex items-center gap-2"
            title="Import and manage external Gen-Ed schedules"
          >
            <svg className="w-4 h-4 text-[#1C6100]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            Manage External Schedules
          </button>

          {selectedSection && viewMode === "table" && (
            <button 
              onClick={() => {
                setViewMode("scheduler");
                setIsEditing(true);
              }} 
              className="bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow hover:bg-black transition active:scale-95 cursor-pointer"
            >
              Open Scheduler
            </button>
          )}
          {selectedSection && viewMode === "scheduler" && (
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  setViewMode("table");
                  setIsEditing(false);
                }} 
                className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-300 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                Back to Table
              </button>
              <button onClick={handleSaveToJSON} className="bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-bold shadow hover:bg-black transition active:scale-95 cursor-pointer">
                Export JSON
              </button>
              
              {activePreviewRequest ? (
                <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl shadow-inner ml-2">
                  <button onClick={handleExitPreview} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer">
                    Cancel Preview
                  </button>
                  <button onClick={() => handleRequestAction(activePreviewRequest, 'rejected')} className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Reject
                  </button>
                  <button 
                    onClick={() => handleRequestAction(activePreviewRequest, 'approved')} 
                    disabled={isPreviewConflicting}
                    title={isPreviewConflicting ? "Cannot approve: Schedule conflicts detected" : "Approve Request"}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-1 ${
                      isPreviewConflicting 
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                        : 'bg-[#1C6100] hover:bg-green-700 text-white cursor-pointer'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
                    Approve Request
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowConfirmModal(true)} 
                  className="px-5 py-2 rounded-lg text-sm font-bold shadow transition bg-[#1C6100] text-white hover:bg-green-800 active:scale-95 cursor-pointer"
                >
                  Save to Database
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <main className="flex flex-1 p-8 gap-6 h-full overflow-hidden relative max-w-[1700px] w-full mx-auto">
        
        {viewMode === "table" ? (
          /*  TABLE VIEW (DEFAULT)  */
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm p-8 overflow-y-auto flex flex-col relative">
            {!selectedSection && (
              <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center rounded-2xl">
                <div className="w-16 h-16 bg-emerald-50 text-[#1C6100] rounded-2xl flex items-center justify-center mb-4 shadow-xs">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 tracking-tight">No Section Selected</h2>
                <p className="text-slate-500 text-sm mt-1">Please select a Year Level and Section from the header dropdowns above to view or manage schedules.</p>
              </div>
            )}

            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end pb-6 border-b border-slate-100 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight mt-2">Class Schedule</h2>
                <p className="text-sm font-semibold text-slate-600 mt-0.5">{selectedSection ? ` ${selectedSection}` : 'Select a section to begin'}</p>
              </div>
              
              <div className="w-full sm:w-64">
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Select Semester</label>
                <select 
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-[#1C6100] focus:ring-2 focus:ring-[#1C6100]/20 bg-slate-50 cursor-pointer transition-all"
                  value={selectedSemester}
                  onChange={(e) => setSelectedSemester(e.target.value)}
                >
                  {semesterOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="w-full border border-slate-300 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-center text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <th className="py-4 px-3 border-r border-slate-300">Subject Code</th>
                    <th className="py-4 px-3 border-r border-slate-300">Unit</th>
                    <th className="py-4 px-3 border-r border-slate-300">Hours</th>
                    <th className="py-4 px-3 border-r border-slate-300">Time</th>
                    <th className="py-4 px-3 border-r border-slate-300">Days</th>
                    <th className="py-4 px-3 border-r border-slate-300">Room</th>
                    <th className="py-4 px-3 border-r border-slate-300">Section</th>
                    <th className="py-4 px-3">Instructor's Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {events.length > 0 ? (
                    Object.values(events.reduce((acc, ev) => {
                      const code = ev.subjectCode || ev.id;
                      if (!acc[code]) acc[code] = { ...ev, sessions: [] };
                      acc[code].sessions.push(ev);
                      return acc;
                    }, {})).map((group, i) => {
                      const matchedSubject = subjectsData.find(s => s.subjectCode === group.subjectCode) || {};
                      const units = matchedSubject.units || "-";
                      const totalHours = group.sessions.reduce((sum, sess) => sum + moment(sess.end).diff(moment(sess.start), 'hours', true), 0);
                      const finalInstructor = group.instructor || matchedSubject.instructor || "TBA";
                      
                      return (
                        <tr 
                          key={group.id || i} 
                          onClick={() => {
                            setActiveSubjectData({
                              originalCode: group.subjectCode,
                              subjectCode: group.subjectCode,
                              title: group.title || "",
                              instructor: finalInstructor,
                              sessions: group.sessions.map(s => ({
                                ...s,
                                day: moment(s.start).format('dddd'),
                                room: s.room || ""
                              }))
                            });
                            setEditEventModal(true);
                          }}
                          className="text-slate-700 font-medium hover:bg-emerald-50/50 transition-colors cursor-pointer group"
                        >
                          <td className="py-3 border-r border-slate-300 font-bold group-hover:text-[#1C6100]">{group.subjectCode || "-"}</td>
                          <td className="py-3 border-r border-slate-300">{units}</td>
                          <td className="py-3 border-r border-slate-300">{totalHours}</td>
                          
                          <td className="py-3 border-r border-slate-300 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {group.sessions.map((sess, sIdx) => (
                                <span key={sIdx}>{moment(sess.start).format('hh:mma')} - {moment(sess.end).format('hh:mma')}</span>
                              ))}
                            </div>
                          </td>
                          
                          <td className="py-3 border-r border-slate-300">
                            <div className="flex flex-col gap-0.5">
                              {group.sessions.map((sess, sIdx) => (
                                <span key={sIdx}>{moment(sess.start).format('dddd')}</span>
                              ))}
                            </div>
                          </td>
                          
                          <td className="py-3 border-r border-slate-300 font-semibold text-slate-600">
                          <div className="flex flex-col gap-0.5">
                            {group.sessions.map((sess, sIdx) => (
                              <span key={sIdx}>{sess.room || "TBA"}</span>
                            ))}
                          </div>
                        </td>
                          <td className="py-3 border-r border-slate-300">{selectedSection}</td>
                          <td className="py-3 font-semibold text-slate-800">{finalInstructor}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr className="h-14 text-slate-400 text-sm">
                      <td colSpan="8" className="py-6 italic bg-slate-50/50">No subjects scheduled yet. Click any empty row below to add a class, or click 'Open Scheduler'.</td>
                    </tr>
                  )}
                  {Array.from({ length: Math.max(0, 8 - events.length) }).map((_, i) => (
                    <tr 
                      key={`empty-${i}`} 
                      onClick={() => {
                        // Smart Matrix Scanner: Find the first genuinely available 3-hour gap
                        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                        const baseDate = moment(new Date(2026, 0, 19)).startOf('week').add(1, 'day'); // Monday
                        
                        let foundStart = null;
                        let foundEnd = null;
                        let foundDay = "Monday";

                        for (let d = 0; d < days.length; d++) {
                          for (let hr = 7; hr <= 17; hr++) {
                            // Skip the strict 12:00 PM - 1:00 PM lunch ban
                            if (hr === 12) continue;

                            const testStart = moment(baseDate).add(d, 'days').hours(hr).minutes(0).toDate();
                            const testEnd = moment(baseDate).add(d, 'days').hours(hr + 3).minutes(0).toDate();

                            // Check if this specific time block overlaps with ANY existing event in the matrix
                            const hasCollision = events.some(ev => testStart < ev.end && ev.start < testEnd);

                            if (!hasCollision) {
                              foundStart = testStart;
                              foundEnd = testEnd;
                              foundDay = days[d];
                              break;
                            }
                          }
                          if (foundStart) break;
                        }

                        // Ultimate fallback if the matrix is literally 100% full
                        if (!foundStart) {
                          foundStart = new Date(2026, 0, 19, 7, 0);
                          foundEnd = new Date(2026, 0, 19, 10, 0);
                        }

                        setActiveSubjectData({
                          originalCode: null,
                          subjectCode: "",
                          title: "New Subject",
                          instructor: "",
                          sessions: [{
                            id: Math.random().toString(),
                            day: foundDay,
                            start: foundStart,
                            end: foundEnd,
                            room: ""
                          }]
                        });
                        setEditEventModal(true);
                      }}
                      className="h-12 last:border-b-0 cursor-pointer hover:bg-slate-50 transition-colors group"
                    >
                      <td className="border-r border-slate-300 text-slate-300 group-hover:text-slate-500 text-xs">+ Add Class</td>
                      <td className="border-r border-slate-300"></td>
                      <td className="border-r border-slate-300"></td>
                      <td className="border-r border-slate-300"></td>
                      <td className="border-r border-slate-300"></td>
                      <td className="border-r border-slate-300"></td>
                      <td className="border-r border-slate-300"></td>
                      <td className=""></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-6">
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="bg-red-50 text-red-600 border border-red-200 px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs hover:bg-red-100 transition active:scale-95 cursor-pointer"
              >
                Clear Schedule
              </button>
            </div>
          </div>
        ) : (
          /*  SCHEDULER VIEW (DRAG & DROP)  */
          <>
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 overflow-hidden flex flex-col relative">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-3 text-slate-800">
                    {selectedSection ? `${selectedSection} Schedule Builder` : 'Weekly Schedule'}
                    {events.some(e => e.isRequestedChange || e.isGhostOriginal) && (
                      <span className="bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        Preview Mode
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {events.some(e => e.isRequestedChange || e.isGhostOriginal) 
                      ? "Reviewing proposed schedule changes. Drag and drop is disabled." 
                      : "Drag blocks or click an event to configure room and timing."}
                  </p>
                </div>
              </div>

              {/* PREVIEW LEGEND */}
              {processedEvents.some(e => e.isRequestedChange || e.isGhostOriginal) && (
                <div className="flex items-center gap-4 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                  <span className="text-sm font-bold text-slate-700 mr-2">Preview Legend:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-slate-100 border border-dashed border-slate-300 rounded opacity-60"></div>
                    <span className="text-xs font-bold text-slate-500">Original Time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-white border-2 border-dashed border-[#1C6100] rounded shadow-sm"></div>
                    <span className="text-xs font-bold text-[#1C6100]">Proposed Time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#1C6100] border-2 border-white rounded shadow-sm"></div>
                    <span className="text-xs font-bold text-[#1C6100]">Untouched</span>
                  </div>
                  {/* CONFLICT INDICATOR */}
                  {processedEvents.some(e => e.isConflict) && (
                    <div className="flex items-center gap-2 border-l border-slate-300 pl-4">
                      <div className="w-4 h-4 bg-red-50 border-2 border-dashed border-red-500 rounded shadow-sm"></div>
                      <span className="text-xs font-bold text-red-600">Schedule Conflict</span>
                    </div>
                  )}
                </div>
              )}

              <DnDCalendar
                localizer={localizer}
                events={processedEvents}
                onEventDrop={moveEvent}
                onEventResize={resizeEvent}
                onSelectEvent={handleEventClick}
                resizableAccessor={(event) => !event.isRequestedChange && !event.isGhostOriginal}
                draggableAccessor={(event) => !event.isRequestedChange && !event.isGhostOriginal}
                defaultView="sixDay" 
                views={{ sixDay: SixDayWeek }} 
                step={30}
                timeslots={2}
                min={new Date(2026, 0, 19, 7, 0)}  
                max={new Date(2026, 0, 19, 19, 0)}
                defaultDate={new Date(2026, 0, 19)} 
                toolbar={false} 
                eventPropGetter={eventStyleGetter} 
                formats={customFormats}          
                components={{ event: CustomEvent }} 
                className="flex-1 text-sm font-sans custom-calendar-grid"
              />
            </div>

            {/* Right Side: Holding Pen */}
            <div className="w-[320px] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
              <div className="bg-[#1C6100] text-white p-5">
                <h2 className="font-bold text-base">Unscheduled Subjects</h2>
                <p className="text-xs text-emerald-100 mt-1">Click a subject to manually add, or use Auto-Slot</p>
              </div>
              
              {unscheduledSubjects.length > 0 && (
                <div className="bg-emerald-50 border-b border-emerald-100 p-3 shrink-0">
                  <button 
                    onClick={handleAutoSlotAll}
                    disabled={isAutoSlotting}
                    className={`w-full py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                      isAutoSlotting 
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-[#1C6100] text-white hover:bg-green-800 active:scale-95 cursor-pointer'
                    }`}
                  >
                    {isAutoSlotting ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Calculating Matrix...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        Auto-Slot All Subjects
                      </>
                    )}
                  </button>
                </div>
              )}

              <div className="p-4 flex-1 overflow-y-auto space-y-3 bg-slate-50/50">
                {unscheduledSubjects.map((sub) => (
                  <div 
                    key={sub.id}
                    className="bg-white border border-slate-200 border-l-4 border-l-[#1C6100] shadow-xs p-4 rounded-xl flex flex-col justify-center transition-all hover:shadow-md"
                  >
                    <h3 className="font-bold text-xs text-slate-800 leading-snug">{sub.title}</h3>
                    
                    {/* Lec / Lab Visual Badges */}
                    <div className="flex gap-2 mt-2">
                      {sub.lecHours > 0 && <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">{sub.lecHours}h Lec</span>}
                      {sub.labHours > 0 && <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-bold">{sub.labHours}h Lab</span>}
                      {(sub.lecHours === 0 && sub.labHours === 0) && <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-[10px] font-bold">{sub.duration}h Total</span>}
                    </div>

                    <span className="text-[11px] font-semibold text-slate-500 mt-1.5 block">{sub.instructor || "TBA"}</span>
                    
                    <div className="flex justify-between items-center mt-3 gap-2">
                      <button 
                        onClick={() => handleAutoSlot(sub)}
                        disabled={isAutoSlotting}
                        className={`flex-1 border px-3 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
                          isAutoSlotting 
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-emerald-50 text-[#1C6100] hover:bg-emerald-100 border-emerald-200 active:scale-95 cursor-pointer'
                        }`}
                      >
                        {isAutoSlotting ? (
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        )}
                        {isAutoSlotting ? 'Working...' : 'Auto-Slot'}
                      </button>
                      <button 
                        onClick={() => {
                          // NEW: Split the generated blocks based on Lec/Lab
                          let generatedEvents = [];
                          let currentHour = 7;
                          
                          if (sub.lecHours > 0) {
                            generatedEvents.push({
                              id: Math.random().toString(),
                              subjectCode: sub.subjectCode,
                              title: sub.title + " (Lec)",
                              instructor: sub.instructor,
                              start: new Date(2026, 0, 19, currentHour, 0),
                              end: new Date(2026, 0, 19, currentHour + sub.lecHours, 0),
                            });
                            currentHour += sub.lecHours;
                          }
                          
                          if (sub.labHours > 0) {
                            generatedEvents.push({
                              id: Math.random().toString(),
                              subjectCode: sub.subjectCode,
                              title: sub.title + " (Lab)",
                              instructor: sub.instructor,
                              start: new Date(2026, 0, 20, 7, 0), // Defaulting Lab to Tuesday (20th) to separate it visually
                              end: new Date(2026, 0, 20, 7 + sub.labHours, 0),
                            });
                          }

                          if (sub.lecHours === 0 && sub.labHours === 0) {
                             generatedEvents.push({
                              id: Math.random().toString(),
                              subjectCode: sub.subjectCode,
                              title: sub.title,
                              instructor: sub.instructor,
                              start: new Date(2026, 0, 19, currentHour, 0),
                              end: new Date(2026, 0, 19, currentHour + sub.duration, 0),
                            });
                          }

                          setEvents([...events, ...generatedEvents]);
                          setUnscheduledSubjects(unscheduledSubjects.filter(s => s.id !== sub.id));
                        }}
                        className="flex-1 bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition active:scale-95 cursor-pointer"
                      >
                        Manual Add
                      </button>
                    </div>
                  </div>
                ))}
                {unscheduledSubjects.length === 0 && (
                  <p className="text-center text-xs text-slate-400 mt-12 font-medium">All subjects have been scheduled!</p>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* EVENT EDIT MODAL (Multi-Session & Matrix Validation) */}
      {editEventModal && activeSubjectData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] flex flex-col max-h-[90vh] overflow-hidden">
            <div className="bg-[#1C6100] text-white p-5 shrink-0">
              <h3 className="text-lg font-bold">Edit Schedule Blocks</h3>
              <p className="text-xs opacity-80 mt-1">Configure multiple sessions (e.g., Lecture and Lab) for this subject.</p>
            </div>
            
            <div className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Subject</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-800 outline-none focus:border-[#1C6100] cursor-pointer bg-gray-50"
                    value={activeSubjectData.subjectCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const sub = subjectsData.find(s => s.subjectCode === code);
                      setActiveSubjectData({
                        ...activeSubjectData,
                        subjectCode: code,
                        title: sub ? `${sub.subjectCode} - ${sub.subjectTitle}` : activeSubjectData.title,
                        instructor: getInstructorForSubject(code)
                      });
                    }}
                  >
                    <option value="" disabled>Select Subject</option>
                    {subjectsData.map(s => (
                      <option key={s.subjectCode} value={s.subjectCode}>{s.subjectCode} - {s.subjectTitle}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Instructor</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-800 outline-none focus:border-[#1C6100] cursor-pointer bg-gray-50"
                    value={activeSubjectData.instructor}
                    onChange={(e) => setActiveSubjectData({ ...activeSubjectData, instructor: e.target.value })}
                  >
                    <option value="TBA">TBA</option>
                    {uniqueInstructors.map(inst => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                {activeSubjectData.sessions.map((sess, index) => (
                  <div key={sess.id} className="p-4 border border-gray-200 rounded-xl bg-white shadow-sm relative">
                    {activeSubjectData.sessions.length > 1 && (
                      <button 
                        onClick={() => {
                          setActiveSubjectData({
                            ...activeSubjectData,
                            sessions: activeSubjectData.sessions.filter((_, i) => i !== index)
                          });
                        }}
                        className="absolute top-3 right-3 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition"
                        title="Remove Session"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    )}
                    <h4 className="text-xs font-bold text-[#1C6100] uppercase tracking-wider mb-4">Session {index + 1}</h4>
                    
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Day of Week</label>
                        <select 
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-[#1C6100]"
                          value={sess.day}
                          onChange={(e) => {
                            const newSessions = [...activeSubjectData.sessions];
                            newSessions[index].day = e.target.value;
                            setActiveSubjectData({ ...activeSubjectData, sessions: newSessions });
                          }}
                        >
                          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Start</label>
                          <input 
                            type="time" 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-[#1C6100]"
                            value={moment(sess.start).format('HH:mm')}
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(':');
                              const newSessions = [...activeSubjectData.sessions];
                              newSessions[index].start = moment(sess.start).hours(hours).minutes(minutes).toDate();
                              setActiveSubjectData({ ...activeSubjectData, sessions: newSessions });
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">End</label>
                          <input 
                            type="time" 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-[#1C6100]"
                            value={moment(sess.end).format('HH:mm')}
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(':');
                              const newSessions = [...activeSubjectData.sessions];
                              newSessions[index].end = moment(sess.end).hours(hours).minutes(minutes).toDate();
                              setActiveSubjectData({ ...activeSubjectData, sessions: newSessions });
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">Room</label>
                        <select 
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-[#1C6100]"
                          value={sess.room}
                          onChange={(e) => {
                            const newSessions = [...activeSubjectData.sessions];
                            newSessions[index].room = e.target.value;
                            setActiveSubjectData({ ...activeSubjectData, sessions: newSessions });
                          }}
                        >
                          <option value="">No Room Assigned (TBA)</option>
                          {roomsData.map(r => (
                            <option key={r.roomName} value={r.roomName}>{r.roomName} ({r.type})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => {
                  const lastSess = activeSubjectData.sessions[activeSubjectData.sessions.length - 1];
                  
                  // Push the new session forward by 3 hours to avoid immediate overlap
                  let nextStart = moment(lastSess.start).add(3, 'hours');
                  let nextEnd = moment(lastSess.end).add(3, 'hours');
                  let nextDay = lastSess.day;

                  // If pushing 3 hours pushes us past 8:00 PM (20:00), bump to the next day at 7:00 AM
                  if (nextStart.hours() >= 20 || nextEnd.hours() > 20) {
                    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    const nextDayIndex = (days.indexOf(lastSess.day) + 1) % days.length;
                    nextDay = days[nextDayIndex];
                    
                    nextStart = moment(lastSess.start).add(nextDayIndex > 0 ? 1 : 0, 'days').hours(7).minutes(0);
                    nextEnd = moment(lastSess.end).add(nextDayIndex > 0 ? 1 : 0, 'days').hours(10).minutes(0);
                  }

                  setActiveSubjectData({
                    ...activeSubjectData,
                    sessions: [
                      ...activeSubjectData.sessions,
                      {
                        id: Math.random().toString(),
                        day: nextDay, 
                        start: nextStart.toDate(),
                        end: nextEnd.toDate(),
                        room: lastSess.room
                      }
                    ]
                  });
                }}
                className="w-full py-3 border-2 border-dashed border-[#1C6100]/30 text-[#1C6100] font-bold rounded-xl hover:bg-emerald-50 hover:border-[#1C6100]/50 transition flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                Add Another Session (e.g. Lab)
              </button>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Assigned Instructor</span>
                <span className="text-sm font-bold text-gray-800">{activeSubjectData.instructor || "TBA"}</span>
              </div>
            </div>

            {/* Matrix Validation Footer */}
            <div className="shrink-0 bg-gray-50 border-t border-gray-200">
              {(() => {
                const startOfWeek = moment(events.length > 0 ? events[0].start : new Date(2026, 0, 19)).startOf('week').add(1, 'day');
                const daysMap = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5 };
                let errorMsg = null;
                let warningMsg = null;
                
                const proposedSessions = activeSubjectData.sessions.map(sess => {
                  const dayOffset = daysMap[sess.day] || 0;
                  const baseDate = moment(startOfWeek).add(dayOffset, 'days');
                  return {
                    start: moment(baseDate).hours(moment(sess.start).hours()).minutes(moment(sess.start).minutes()).toDate(),
                    end: moment(baseDate).hours(moment(sess.end).hours()).minutes(moment(sess.end).minutes()).toDate(),
                    room: sess.room
                  };
                });

                if (proposedSessions.some(s => s.start >= s.end)) {
                  errorMsg = "End time must be after start time for all sessions.";
                }

                if (!errorMsg) {
                  const otherEvents = activeSubjectData.originalCode 
                    ? events.filter(ev => ev.subjectCode !== activeSubjectData.originalCode && ev.id !== activeSubjectData.originalCode)
                    : events;
                    
                  for (let prop of proposedSessions) {
                    const conflict = otherEvents.find(ev => prop.start < ev.end && ev.start < prop.end);
                    if (conflict) {
                      errorMsg = `Time conflict with ${conflict.subjectCode || 'another class'}!`;
                      break;
                    }
                  }
                }

                // Check Matrix using the updated object return structure
                if (!errorMsg) {
                  for (let prop of proposedSessions) {
                    const result = checkGlobalConflict(prop.start, prop.end, prop.room, activeSubjectData.instructor, null, activeSubjectData.originalCode);
                    if (result.error) {
                      errorMsg = result.error;
                      break;
                    }
                    if (result.warning && !warningMsg) {
                      warningMsg = result.warning; // Capture the first soft warning
                    }
                  }
                }

                if (!errorMsg) {
                  for (let i = 0; i < proposedSessions.length; i++) {
                    for (let j = i + 1; j < proposedSessions.length; j++) {
                      if (proposedSessions[i].start < proposedSessions[j].end && proposedSessions[j].start < proposedSessions[i].end) {
                        errorMsg = "Time conflict between the multiple sessions you are trying to add!";
                        break;
                      }
                    }
                  }
                }
                
                // Only Hard Errors disable the button now!
                const canSave = activeSubjectData.subjectCode && !errorMsg;

                return (
                  <>
                    {errorMsg && (
                      <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-red-600 text-[11px] uppercase tracking-wide font-bold text-center flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        {errorMsg}
                      </div>
                    )}
                    {/* Optional UI: Show a subtle indicator in the modal if a warning exists, but keep button green */}
                    {!errorMsg && warningMsg && (
                       <div className="px-6 py-2.5 bg-amber-50/50 border-b border-amber-100 text-amber-700 text-[10px] uppercase tracking-wide font-bold text-center flex items-center justify-center gap-2">
                         <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                         Policy Warning Detected (Override Available)
                       </div>
                    )}
                    <div className="px-6 py-4 flex justify-between gap-3 bg-white rounded-b-xl">
                      {activeSubjectData.originalCode ? (
                        <button 
                          onClick={handleUnslotSubject}
                          className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition active:scale-95 cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          Un-slot
                        </button>
                      ) : <div></div>}
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setEditEventModal(false)}
                          className="px-5 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition active:scale-95 cursor-pointer shadow-sm"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => {
                            if (warningMsg) {
                              setOverridePrompt({
                                show: true,
                                message: warningMsg + " Are you sure you want to proceed?",
                                onConfirm: () => { saveEventDetails(); setOverridePrompt({ show: false, message: "", onConfirm: null }); }
                              });
                            } else {
                              saveEventDetails();
                            }
                          }}
                          disabled={!canSave}
                          className={`px-6 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition ${
                            !canSave 
                              ? "bg-gray-400 cursor-not-allowed" 
                              : "bg-[#1C6100] hover:bg-green-800 active:scale-95 cursor-pointer"
                          }`}
                        >
                          {!activeSubjectData.subjectCode ? "Select Subject" : "Apply to Schedule"}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ======================================= */}
      {/*  CUSTOM MODALS OVERRIDE  */}
      {/* ======================================= */}

      {/* PENDING REQUESTS MODAL */}
      {showRequestsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[600px] flex flex-col max-h-[80vh] overflow-hidden">
            <div className="bg-[#1C6100] text-white p-5 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold">Pending Schedule Requests</h3>
                <p className="text-xs text-emerald-100 mt-1">Review instructor requests to alter section schedules.</p>
              </div>
              <button onClick={() => setShowRequestsModal(false)} className="text-white/70 hover:text-white cursor-pointer transition">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 bg-slate-50 space-y-4">
              {pendingRequests.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-10 font-bold">No pending requests at this time.</p>
              ) : (
                pendingRequests.map(req => {
                  const secName = `${req.schedule.program}-${req.schedule.year}${req.schedule.section}`;
                  return (
                    <div key={req._id} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col gap-4 transition hover:border-[#1C6100]/30">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">Schedule Change: {secName}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Requested on: {moment(req.created_at).format('MMM D, YYYY h:mm A')}</p>
                        </div>
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Pending</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => applyRequestToCalendar(req)}
                          className="flex-1 bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1.5 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                          Enter Preview Mode
                        </button>

                        <button
                          onClick={() => handleRequestAction(req, 'approved')}
                          className="bg-emerald-50 text-[#1C6100] border border-emerald-200 hover:bg-emerald-100 px-4 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1.5 cursor-pointer"
                          title="Mark as Approved in Database"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                          Approve
                        </button>

                        <button
                          onClick={() => handleRequestAction(req, 'rejected')}
                          className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-4 py-2 rounded-lg text-xs font-bold transition flex justify-center items-center gap-1.5 cursor-pointer"
                          title="Reject Request"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save Schedule Confirmation */}
      <ConfirmModal 
        show={showConfirmModal} 
        type="success"
        title="Save Schedule"
        onCancel={() => setShowConfirmModal(false)} 
        onConfirm={saveScheduleToDatabase} 
        message="Are you sure you want to save this schedule to the database? This will overwrite the existing active schedule for this section."
      />

      {/* Clear Schedule Confirmation */}
      <ConfirmModal
        show={showClearConfirm} 
        onCancel={() => setShowClearConfirm(false)} 
        onConfirm={() => {
          setEvents([]);
          const pendingSubjects = subjectsData.map(sub => {
            let assignedInstructor = sub.instructor || "TBA";
            if (typeof assignedInstructor === 'string' && assignedInstructor.includes(',')) {
              const instArray = assignedInstructor.split(',').map(i => i.trim());
              assignedInstructor = instArray[Math.floor(Math.random() * instArray.length)];
            }
            return {
              id: sub.subjectCode,
              subjectCode: sub.subjectCode,
              title: `${sub.subjectCode} - ${sub.subjectTitle}`,
              duration: sub.units || 3,
              instructor: assignedInstructor
            };
          });
          setUnscheduledSubjects(pendingSubjects);
          setShowClearConfirm(false);
        }} 
        message="Are you sure you want to completely clear the schedule board?"
      />

      {/* Dynamic Status/Error Modal */}
      <ConfirmModal 
        show={statusPrompt.show} 
        type={statusPrompt.type}
        title={statusPrompt.title}
        message={statusPrompt.message} 
        confirmText="Okay"
        onCancel={null}
        onConfirm={() => {
          if (statusPrompt.title === "Previewing Changes") {
            setEvents(prev => prev.map(e => e.isRequestedChange ? { ...e, animateNow: true } : e));
          }
          setStatusPrompt({ show: false, type: "success", title: "", message: "" });
        }} 
      />

      {/* Policy Override Warning Modal */}
      <ConfirmModal 
        show={overridePrompt.show} 
        type="danger" 
        title="Review Schedule"
        message={overridePrompt.message} 
        confirmText="Override & Apply"
        onCancel={() => setOverridePrompt({ show: false, message: "", onConfirm: null })}
        onConfirm={overridePrompt.onConfirm} 
      />
    </div>
  );
}