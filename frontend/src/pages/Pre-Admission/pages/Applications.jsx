import { useEffect, useRef, useState, useMemo } from "react";
import api, { BASE_URL } from "../../../services/api";
import {
  FaSearch, FaFilter, FaEye, FaTimes, FaFileDownload,
  FaSearchPlus, FaSearchMinus, FaRedo, FaCheckCircle,
  FaEdit, FaUpload, FaPlus, FaCheck, FaTrash, FaChevronDown, FaPrint
} from "react-icons/fa";
import { FileText, CheckCircle, MessageSquare, Eye, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, AlertTriangle, Lock } from "lucide-react";
import { useToast } from "../context/ToastContext.jsx";
import { ButtonSpinner, PageLoader } from "../components/Loaders.jsx";
import {
  createApplicant, bulkUpdateStatus, encodeScore,
  getRubric, saveRubric as apiSaveRubric, updateApplicantStatus, unlockApplicant
} from "../../../services/adminService.js";
import * as XLSX from "xlsx-js-style";
import { saveAs } from "file-saver";
import { useReactToPrint } from "react-to-print";
import { regions, provinces, cities, barangays } from 'select-philippines-address';

/* --- DYNAMIC HELPERS --- */
const getCourseAbbr = (courseName) => {
  if (!courseName) return "N/A";
  if (courseName.includes("Major in")) {
    const parts = courseName.split("Major in");
    const main = parts[0].match(/[A-Z]/g)?.join('') || "";
    const major = parts[1].match(/[A-Z]/g)?.join('') || "";
    return `${main}-${major}`;
  }
  return courseName.match(/[A-Z]/g)?.join('') || courseName.substring(0, 10).toUpperCase();
};

const getCourseAbbreviation = (courseName, coursesList) => {
  if (!courseName || courseName === "N/A" || !coursesList || coursesList.length === 0) return "N/A";
  const haystack = courseName.trim().toLowerCase();

  const sortedCourses = [...coursesList].sort((a, b) => (b.name || "").length - (a.name || "").length);
  const foundCourse = sortedCourses.find(c => {
    const dbName = (c.name || "").trim().toLowerCase();
    return dbName && haystack.includes(dbName);
  });

  if (foundCourse && foundCourse.abbreviation) {
    return foundCourse.abbreviation.toUpperCase();
  }
};

const normalizeApplicantType = (val) => {
  if (!val) return "";
  const s = String(val).toUpperCase();
  if (s.includes("ALS") || s.includes("ALTERNATIVE")) return "ALS";
  if (s.includes("TRANS")) return "TRANSFEREE";
  if (s.includes("SHS") || s.includes("SENIOR HIGH") || s.includes("FRESHMEN")) return "SHS GRADUATE";
  return s;
};

const getCourseFullName = (courseName, coursesList) => {
  if (!courseName || courseName === "N/A" || !coursesList || coursesList.length === 0) return courseName || "N/A";
  const haystack = courseName.trim().toLowerCase();

  const sortedCourses = [...coursesList].sort((a, b) => (b.name || "").length - (a.name || "").length);
  const foundCourse = sortedCourses.find(c => {
    const dbName = (c.name || "").trim().toLowerCase();
    return dbName && haystack.includes(dbName);
  });

  if (foundCourse && foundCourse.name) {
    return foundCourse.name.toUpperCase();
  }
  return courseName.toUpperCase();
};

const INITIAL_RUBRIC_SECTIONS = [
  {
    id: "I", title: "I. Communication Skills (30%)",
    criteria: [
      { id: "1_1", name: "Articulation & Clarity", desc: "Expresses ideas logically, clearly, and confidently.", weight: 15 },
      { id: "1_2", name: "Language Proficiency", desc: "Uses correct grammar, vocabulary, and appropriate tone.", weight: 10 },
      { id: "1_3", name: "Active Listening", desc: "Responds appropriately, shows understanding, and answers questions directly.", weight: 5 },
    ]
  },
  {
    id: "II", title: "II. Personality, Behaviour & Interpersonal Skills (25%)",
    criteria: [
      { id: "2_1", name: "Professional Attitude", desc: "Shows respectfulness, politeness, and appropriate behaviour.", weight: 10 },
      { id: "2_2", name: "Confidence & Composure", desc: "Maintains calmness, self-assurance, and professionalism.", weight: 10 },
      { id: "2_3", name: "Interpersonal Skills", desc: "Interacts positively and engages appropriately during the interview.", weight: 5 },
    ]
  },
  {
    id: "III", title: "III. Course Awareness & Academic Readiness (25%)",
    criteria: [
      { id: "3_1", name: "Understanding of Chosen Course", desc: "Shows awareness of course content, expectations, and career paths.", weight: 10 },
      { id: "3_2", name: "Logical & Critical Thinking", desc: "Demonstrates reasoning, problem-solving, and analytical skills.", weight: 10 },
      { id: "3_3", name: "Alignment of Skills & Interests", desc: "Shows that abilities and interests fit the chosen course.", weight: 5 },
    ]
  },
  {
    id: "IV", title: "IV. Motivation, Goals & Overall Impression (20%)",
    criteria: [
      { id: "4_1", name: "Motivation for the Course", desc: "Shows genuine reason for choosing the course.", weight: 10 },
      { id: "4_2", name: "Career Goals", desc: "Presents realistic, clear, and purposeful future plans.", weight: 5 },
      { id: "4_3", name: "Overall Impression", desc: "Demonstrates potential to succeed in the course.", weight: 5 },
    ]
  }
];

const isApplicantInterviewed = (app) => {
  if (!app) return false;
  const isWaived = app.isInterviewWaived === true || app.isInterviewWaived === "true";
  if (isWaived) {
    return app.isInterviewed === true || app.isInterviewed === "true";
  }
  return Boolean(
    app.isInterviewed === true ||
    app.isInterviewed === "true" ||
    (app.interviewScore !== undefined && app.interviewScore !== null && Number(app.interviewScore) > 0) ||
    app.interviewStatus === 'Passed' ||
    app.interviewStatus === 'Failed'
  );
};

/* --- REUSABLE COMPONENTS --- */
const CustomCheckbox = ({ checked, onChange, disabled }) => (
  <div
    onClick={(e) => {
      e.stopPropagation();
      if (!disabled) onChange(!checked);
    }}
    className={`w-[18px] h-[18px] mx-auto rounded-[3px] border flex items-center justify-center transition-all shadow-sm ${disabled
      ? 'cursor-not-allowed opacity-50 bg-gray-200 border-gray-300'
      : 'cursor-pointer'
      } ${checked && !disabled
        ? 'bg-[#10dc60] border-[#10dc60]'
        : 'bg-white border-gray-400 hover:border-[#10dc60]'
      }`}
  >
    {checked && <FaCheck size={10} className={disabled ? "text-gray-400" : "text-white"} />}
  </div>
);

const FormField = ({ label, value, isEditMode, editValue, onChange, type = "text", className = "", required = false, maxLength }) => (
  <div className={`flex flex-col ${className}`}>
    <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">
      {label}{isEditMode && required && <span className="text-red-500 ml-1 text-[12px] leading-none">*</span>}
    </label>
    {isEditMode ? (
      <input
        type={type}
        value={editValue !== undefined ? editValue : value}
        onChange={onChange}
        maxLength={maxLength}
        className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none transition-colors uppercase"
      />
    ) : (
      <div className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 uppercase truncate cursor-default flex items-center shadow-sm">
        {value || "N/A"}
      </div>
    )}
  </div>
);

const InputFormField = ({ label, value, onChange, type = "text", className = "", placeholder = "", disabled = false, required = false, maxLength }) => (
  <div className={`flex flex-col ${className}`}>
    {label && <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">{label}{required && <span className="text-red-500 ml-1 text-[12px] leading-none">*</span>}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      className={`h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none transition-colors uppercase ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
    />
  </div>
);

const SelectFormField = ({ label, value, onChange, options, className = "", disabled = false, required = false }) => (
  <div className={`flex flex-col ${className}`}>
    <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">{label}{required && <span className="text-red-500 ml-1 text-[12px] leading-none">*</span>}</label>
    <div className="relative">
      <select
        value={value || ""}
        onChange={onChange}
        disabled={disabled}
        className={`h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] shadow-sm focus:border-[#3a7538] outline-none transition-colors uppercase appearance-none ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : (value ? 'text-gray-800' : 'text-gray-400')}`}
      >
        <option value="" disabled hidden>SELECT PROGRAM</option>
        {options.map((option, index) => (
          <option key={index} value={option.name.toUpperCase()} className="text-gray-800">{option.name.toUpperCase()}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
      </div>
    </div>
  </div>
);

const CustomDatePicker = ({ value, onChange, disabled, required = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const dateRef = useRef(null);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dateRef.current && !dateRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value) setViewDate(new Date(value));
  }, [value]);

  const handleDateSelect = (day) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const yyyy = newDate.getFullYear();
    const mm = String(newDate.getMonth() + 1).padStart(2, '0');
    const dd = String(newDate.getDate()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

  return (
    <div className="relative" ref={dateRef}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] shadow-sm flex items-center justify-between outline-none transition-colors ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'cursor-pointer hover:border-[#3a7538]'}`}
      >
        <span className="text-gray-800 uppercase">{value || "YYYY-MM-DD"}</span>
        <CalendarIcon className="text-gray-500 w-4 h-4" />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-3">
          <div className="flex justify-between items-center mb-2">
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronLeft size={14} /></button>
            <div className="font-bold text-[12px] uppercase text-gray-800">{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronRight size={14} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <div key={day} className="text-[10px] font-bold text-center text-gray-500">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = value && new Date(value).getDate() === day && new Date(value).getMonth() === viewDate.getMonth() && new Date(value).getFullYear() === viewDate.getFullYear();
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => handleDateSelect(day)}
                  className={`w-7 h-7 text-xs flex items-center justify-center rounded-full hover:bg-green-100 transition-colors ${isSelected ? 'bg-[#376e35] text-white font-bold hover:bg-[#5c9c5a]' : 'text-gray-700'}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const AddressDropdowns = ({ label, addressData, onChange, disabled, required = false }) => {
  const [provinceList, setProvinceList] = useState([]);
  const [cityList, setCityList] = useState([]);
  const [barangayList, setBarangayList] = useState([]);

  useEffect(() => {
    regions().then(async (regionList) => {
      const allProvPromises = regionList.map(r => provinces(r.region_code));
      const provsArray = await Promise.all(allProvPromises);
      const allProvinces = provsArray.flat().sort((a, b) => a.province_name.localeCompare(b.province_name));
      setProvinceList(allProvinces);
    });
  }, []);

  useEffect(() => {
    if (addressData.provinceCode) {
      cities(addressData.provinceCode).then(setCityList);
    } else {
      setCityList([]);
      setBarangayList([]);
    }
  }, [addressData.provinceCode]);

  useEffect(() => {
    if (addressData.cityCode) {
      barangays(addressData.cityCode).then(setBarangayList);
    } else {
      setBarangayList([]);
    }
  }, [addressData.cityCode]);

  const handleChange = (field, codeField, code, name) => {
    onChange(field, name);
    onChange(codeField, code);
  };

  return (
    <div className="md:col-span-2 lg:col-span-4 mt-2">
      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1 border-b pb-1 block">{label}{required && <span className="text-red-500 ml-1 text-[12px] leading-none">*</span>}</label>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
        <InputFormField placeholder="House/Street" value={addressData.houseStreet} onChange={e => onChange('houseStreet', e.target.value)} disabled={disabled} />

        <div className="flex flex-col">
          <select disabled={disabled} value={addressData.provinceCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('province', 'provinceCode', e.target.value, name);
            handleChange('city', 'cityCode', "", "");
            handleChange('barangay', 'barangayCode', "", "");
          }} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">PROVINCE</option>
            {provinceList.map((p, idx) => <option key={`${p.province_code}-${idx}`} value={p.province_code}>{p.province_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <select disabled={disabled || !addressData.provinceCode} value={addressData.cityCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('city', 'cityCode', e.target.value, name);
            handleChange('barangay', 'barangayCode', "", "");
          }} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">CITY/MUNI</option>
            {cityList.map((c, idx) => <option key={`${c.city_code}-${idx}`} value={c.city_code}>{c.city_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <select disabled={disabled || !addressData.cityCode} value={addressData.barangayCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('barangay', 'barangayCode', e.target.value, name);
          }} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">BARANGAY</option>
            {barangayList.map((b, idx) => <option key={`${b.brgy_code}-${idx}`} value={b.brgy_code}>{b.brgy_name}</option>)}
          </select>
        </div>

        <InputFormField placeholder="ZIP Code" value={addressData.zip} onChange={e => onChange('zip', e.target.value.replace(/\D/g, '').slice(0, 5))} disabled={disabled} />
      </div>
    </div>
  );
};

const SectionHeader = ({ title }) => (
  <div className="mb-4 pb-2 border-b border-gray-200">
    <h3 className="text-[12px] font-black text-[#376e35] uppercase tracking-wide">{title}</h3>
  </div>
);

const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('blob:') || path.startsWith('http')) return path;

  let cleanPath = path.replace(/\\/g, '/');
  cleanPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  // Ensure the path starts with /uploads/
  if (!cleanPath.startsWith('/uploads/')) {
    cleanPath = `/uploads${cleanPath}`;
  }

  return `${BASE_URL}${cleanPath}`;
};

const getDocsSubmissionHeaderSchedule = (applicant) => {
  if (!applicant) return "";

  const statusLower = String(applicant.status || applicant.interviewStatus || "").toLowerCase();
  const isDocsSubmission = statusLower.includes("doc") || statusLower.includes("submission");
  const isWaived = applicant.isInterviewWaived === true || applicant.isInterviewWaived === "true";

  if (!isDocsSubmission && !isWaived) return "";

  const submissionDate =
    applicant.docsSubmissionDate ||
    applicant.documentSubmissionDate ||
    applicant.submissionDate ||
    applicant.scheduleDate ||
    applicant.interviewDate;

  const submissionTime =
    applicant.docsSubmissionTime ||
    applicant.documentSubmissionTime ||
    applicant.submissionTime ||
    applicant.scheduleTime ||
    applicant.interviewTime;

  if (!submissionDate && !submissionTime) return "";

  let formattedDate = submissionDate || "";
  if (submissionDate) {
    const parsed = new Date(submissionDate);
    if (!isNaN(parsed.getTime())) {
      formattedDate = parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }
  }

  const datePart = formattedDate ? `Schedule: ${formattedDate}` : "Schedule:";
  const timePart = submissionTime ? ` (${submissionTime})` : "";
  return `${datePart}${timePart}`;
};

/* --- MAIN COMPONENT --- */
export default function Applications({ navigateToTab, navigationState }) {
  const { toast } = useToast();
  const isSidebarOpen = false;

  /* --- DYNAMIC STATES --- */
  const [coursesList, setCoursesList] = useState([]);
  const [institutesList, setInstitutesList] = useState([]);

  /* --- ROLE STATE --- */
  const [userRole, setUserRole] = useState("Admin");
  const [userInstitute, setUserInstitute] = useState("IITI");
  const [currentAdminUsername, setCurrentAdminUsername] = useState("");

  /* --- STATE --- */
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [capacityWarningModal, setCapacityWarningModal] = useState(null);
  const [portalSettings, setPortalSettings] = useState(null);
  const [confirmActionModal, setConfirmActionModal] = useState({ isOpen: false, message: "", onConfirm: null });
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignProgram, setReassignProgram] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [isRubricEditModalOpen, setIsRubricEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isInlineEditMode, setIsInlineEditMode] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [unlockOnSend, setUnlockOnSend] = useState(false);
  const [messageData, setMessageData] = useState({ subject: "", message: "" });
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmActionStatus, setConfirmActionStatus] = useState(null);

  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(0.8);
  const [rotationAngle, setRotationAngle] = useState(0);
  const handleRotate = () => setRotationAngle(prev => (prev + 90) % 360);

  const [selectedApplicantIds, setSelectedApplicantIds] = useState([]);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [activePopover, setActivePopover] = useState(null);

  const [rubricData, setRubricData] = useState(INITIAL_RUBRIC_SECTIONS);
  const [tempRubricData, setTempRubricData] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [courseFilter, setCourseFilter] = useState("All");
  const [instituteFilter, setInstituteFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [nameSortOrder, setNameSortOrder] = useState("A-Z");
  const [activeSortType, setActiveSortType] = useState("date");
  const filterRef = useRef(null);
  const exportMenuRef = useRef(null);

  const [interviewRatings, setInterviewRatings] = useState({});
  const [draftRatings, setDraftRatings] = useState(() => {
    try {
      const saved = localStorage.getItem('btech_admin_interview_drafts');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('btech_admin_interview_drafts', JSON.stringify(draftRatings));
    } catch (e) {
      console.error("Failed to save draft ratings to localStorage", e);
    }
  }, [draftRatings]);

  const [newApplicant, setNewApplicant] = useState(null);
  const [activeRatingDropdown, setActiveRatingDropdown] = useState(null);

  // --- PRINT STATE ---
  const printFormRef = useRef(null);
  const [printContent, setPrintContent] = useState('');
  const isPrintingRef = useRef(false);

  const handlePrintApplication = useReactToPrint({
    contentRef: printFormRef,
    documentTitle: 'Application_Form',
    onAfterPrint: () => {
      setPrintContent('');
      isPrintingRef.current = false;
    },
    onPrintError: () => {
      isPrintingRef.current = false;
    }
  });

  useEffect(() => {
    if (printContent && !isPrintingRef.current) {
      isPrintingRef.current = true;
      const timer = setTimeout(() => {
        handlePrintApplication();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [printContent]);

  const [applicants, setApplicants] = useState([]);
  const [activeYear, setActiveYear] = useState("");
  const [isArchiveMode, setIsArchiveMode] = useState(false);
  const getColSpan = () => (!isArchiveMode && userRole === "Admin" ? 9 : 8);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const exitArchiveMode = () => {
    sessionStorage.removeItem("archiveViewYear");
    window.location.reload();
  };

  const getSafeApplicant = (app) => {
    if (!app) return null;

    const rawDocs = app.documents || app.profile?.documents || [];
    const normalizedDocs = rawDocs.filter(doc => doc != null).map(doc => {
      const pathStr = doc.path || doc.url || doc.fileUrl || doc.filename || '';
      const ext = pathStr.split('.').pop()?.toLowerCase() || 'file';
      return {
        ...doc,
        name: doc.originalName || doc.name || doc.filename || 'Document',
        path: pathStr,
        type: doc.type || ext.toUpperCase()
      };
    });

    const perm = app.profile?.personal?.permAddress || app.permAddress || {};
    const pres = app.profile?.personal?.presAddress || app.presAddress || {};

    return {
      ...app,
      _id: app._id || app.id,
      id: app.id || app._id,
      isApplicationAccepted: app.isApplicationAccepted === true || isApplicantInterviewed(app) || app.admissionStatus === 'Admitted' || app.status === 'Passed' || app.status === 'Failed',
      institute: app.institute || "N/A",
      interviewer: app.interviewer || "",
      interviewRatings: app.interviewRatings || {},
      profile: {
        appDetails: {
          applicantType: app.profile?.appDetails?.applicantType || app.applicantType || app.type || "N/A",
          firstChoice: app.profile?.appDetails?.firstChoice || app.firstChoice || "N/A",
          secondChoice: app.profile?.appDetails?.secondChoice || app.secondChoice || "N/A"
        },
        personal: {
          image: app.photo || null,
          firstName: app.firstName || "N/A",
          middleName: app.middleName || "",
          surname: app.lastName || "N/A",
          extension: app.suffix || "",
          dob: app.birthDate || "N/A",
          pob: app.placeOfBirth || app.birthPlace || "N/A",
          sex: app.gender || "N/A",
          civilStatus: app.civilStatus || "N/A",
          spouseName: app.spouseName || app.profile?.personal?.spouseName || "",
          email: app.email || "N/A",
          contact: app.contactNumber || "N/A",
          permAddress: {
            houseStreet: perm.houseStreet || perm.street || app.permanentHouse || app.permanentStreet || "",
            barangay: perm.barangay || app.permanentBarangay || "",
            city: perm.city || app.permanentCity || app.city || "",
            province: perm.province || app.permanentProvince || "",
            zip: perm.zip || app.permanentZip || ""
          },
          presAddress: {
            houseStreet: pres.houseStreet || pres.street || app.presentHouse || app.presentStreet || "",
            barangay: pres.barangay || app.presentBarangay || "",
            city: pres.city || app.presentCity || app.city || "",
            province: pres.province || app.presentProvince || "",
            zip: pres.zip || app.presentZip || ""
          }
        },
        family: {
          father: app.profile?.family?.father || { firstName: app.fatherName || "N/A", middleName: "", surname: "", contact: app.fatherContact || "N/A" },
          mother: app.profile?.family?.mother || { firstName: app.motherName || "N/A", middleName: "", surname: "", contact: app.motherContact || "N/A" },
          guardian: app.profile?.family?.guardian || { surname: "N/A", firstName: "N/A", middleName: "N/A", relation: "N/A", occupation: "N/A", contact: "N/A" }
        },
        education: {
          elem: app.profile?.education?.elem || { name: app.elementarySchool || app.education?.elementarySchool || "N/A", address: app.elementaryAddress || app.education?.elementaryAddress || "N/A", year: app.elementaryYear || app.education?.elementaryYear || "N/A" },
          jhs: app.profile?.education?.jhs || { name: app.juniorHighSchool || app.education?.juniorHighSchool || "N/A", address: app.juniorHighAddress || app.education?.juniorHighAddress || "N/A", year: app.juniorHighYear || app.education?.juniorHighYear || "N/A" },
          shs: app.profile?.education?.shs || { name: app.seniorHighSchool || app.education?.seniorHighSchool || "N/A", address: app.seniorHighAddress || app.education?.seniorHighAddress || "N/A", year: app.seniorHighYear || app.education?.seniorHighYear || "N/A", gwa: app.seniorHighGwa || app.education?.seniorHighGwa || "N/A", grade11Gwa: app.grade11Gwa || "", grade12Gwa: app.grade12Gwa || "", track: app.track || "", strand: app.strand || "" },
          tertiary: app.profile?.education?.tertiary || { name: app.collegeSchool || "N/A", address: app.collegeAddress || "N/A", year: app.collegeYear || "N/A" }
        },
        otherInfo: app.profile?.otherInfo || {
          isPwd: app.disability || false, pwdDetails: app.disabilitySpec || app.disabilityDetails || "",
          isIndigenous: app.indigenous || false, indigenousDetails: app.indigenousSpec || app.indigenousDetails || "",
          isSoloParent: app.soloParent || false, soloParentDetails: app.soloParentSpec || app.soloParentDetails || "",
          is4Ps: app.fourPs || false, fourPsDetails: app.fourPsSpec || app.fourPsDetails || "",
          isOfw: app.ofw || false
        },
        documents: normalizedDocs
      }
    };
  };

  const extractCityOrTown = (input) => {
    if (!input || typeof input !== "string") return "";
    let clean = input.trim();
    if (!clean || clean.toUpperCase() === "N/A") return "";

    // If there are commas, split and filter out street, barangay, zip, country, and province
    if (clean.includes(",")) {
      let parts = clean.split(",").map(p => p.trim()).filter(Boolean);

      // Remove country ("Philippines") and postal zip codes (e.g., 3006, (3006))
      parts = parts.filter(p => !/^philippines$/i.test(p) && !/^\(?\d{4}\)?$/.test(p));

      // Common provinces in the Philippines
      const provincesList = [
        "bulacan", "pampanga", "nueva ecija", "tarlac", "bataan", "zambales", "aurora",
        "metro manila", "manila", "rizal", "cavite", "laguna", "batangas", "quezon", "pangasinan",
        "ilocos norte", "ilocos sur", "la union", "benguet", "isabela", "cagayan"
      ];

      // If the last remaining part is a province or contains "Province", remove it
      if (parts.length > 1) {
        const last = parts[parts.length - 1].toLowerCase().replace(/\bprovince\b/i, '').trim();
        if (provincesList.includes(last) || /province/i.test(parts[parts.length - 1])) {
          parts.pop();
        }
      }

      // Iterate backwards to find the first token that is not a street, building, or barangay
      for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        const isBrgy = /^(brgy\.?|barangay|bgy\.?)\b/i.test(part);
        const isStreetOrBldg = /\b(street|st\.?|avenue|ave\.?|road|rd\.?|blvd\.?|boulevard|drive|dr\.?|lane|subdivision|subd\.?|purok|sitio|phase|block|blk|lot|bldg|building|floor)\b/i.test(part) || /^\d+/.test(part);
        if (!isBrgy && !isStreetOrBldg) {
          return part.toUpperCase();
        }
      }

      // Fallback to last token if all had keywords
      if (parts.length > 0) {
        return parts[parts.length - 1].toUpperCase();
      }
    }

    // If no comma, check if it starts with "Brgy" or "Barangay"
    if (/^(brgy\.?|barangay|bgy\.?)\b/i.test(clean)) {
      return "N/A";
    }

    return clean.toUpperCase();
  };

  const getApplicantCityOrTown = (safeApp, rawApp) => {
    // 1. Direct city fields from permanent address
    const permCity = safeApp?.profile?.personal?.permAddress?.city || rawApp?.permanentCity || rawApp?.profile?.personal?.permAddress?.city || rawApp?.permAddress?.city;
    const cleanedPerm = extractCityOrTown(permCity);
    if (cleanedPerm && cleanedPerm !== "N/A") return cleanedPerm;

    // 2. Direct city fields from present address
    const presCity = safeApp?.profile?.personal?.presAddress?.city || rawApp?.presentCity || rawApp?.profile?.personal?.presAddress?.city || rawApp?.presAddress?.city;
    const cleanedPres = extractCityOrTown(presCity);
    if (cleanedPres && cleanedPres !== "N/A") return cleanedPres;

    // 3. Root city field
    const rawCity = safeApp?.city || rawApp?.city;
    const cleanedCity = extractCityOrTown(rawCity);
    if (cleanedCity && cleanedCity !== "N/A") return cleanedCity;

    // 4. Raw address/location strings (e.g. "123 Street, Poblacion, Baliuag, Bulacan")
    const raw = (safeApp?.location || rawApp?.location || rawApp?.permanentAddress || rawApp?.presentAddress || rawApp?.address || "").trim();
    if (raw) {
      const cleanedRaw = extractCityOrTown(raw);
      if (cleanedRaw && cleanedRaw !== "N/A") return cleanedRaw;
    }

    return "N/A";
  };

  /* --- EFFECTS & MEMOS --- */
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const [profileRes, coursesRes, institutesRes, settingsRes] = await Promise.all([
          api.get('/admin/profile'),
          api.get('/admin/courses'),
          api.get('/admin/institutes'),
          api.get('/public/settings')
        ]);

        setUserRole("Admin");
        const inst = (profileRes.data?.institute && profileRes.data.institute !== "Admission") ? profileRes.data.institute : "IITI";
        setUserInstitute(inst);
        setCurrentAdminUsername(profileRes.data.username || profileRes.data.name || "");
        setCoursesList(coursesRes.data || []);
        setInstitutesList(institutesRes.data || []);

        const archiveYear = sessionStorage.getItem("archiveViewYear");
        const currentYearToFetch = archiveYear || settingsRes.data.schoolYear;
        setActiveYear(currentYearToFetch);

        if (archiveYear) {
          setIsArchiveMode(true);
        }

        if (settingsRes.data.portalSettings) {
          setPortalSettings(settingsRes.data.portalSettings);
        }

        const applicantsRes = await api.get('/admin/applicants', { params: { schoolYear: currentYearToFetch } });

        const mappedData = applicantsRes.data.map(app => {
          const safe = getSafeApplicant(app);

          const isInterviewed = isApplicantInterviewed(app);

          const dbStatus = (app.interviewStatus && app.interviewStatus !== 'Pending')
            ? app.interviewStatus
            : (isInterviewed ? (app.admissionStatus || 'Pending') : 'For Interview');

          let actualStatus = (!isInterviewed || dbStatus === 'Pending Interview' || dbStatus === 'Pending' || dbStatus?.toLowerCase() === 'pending')
            ? 'For Interview'
            : dbStatus;

          if (app.isInterviewWaived && !isInterviewed) {
            actualStatus = 'For Docs Submission';
          }

          const actualSchedule = app.interviewSchedule || app.interviewDate || "";

          const locDisplay = getApplicantCityOrTown(safe, app);

          return {
            ...safe,
            id: app.applicantId || app.id || app._id,
            name: (app.name || `${safe.profile.personal.surname}, ${safe.profile.personal.firstName}`).toUpperCase(),
            type: safe.profile.appDetails.applicantType,
            location: locDisplay,
            date: safe.createdAt ? new Date(safe.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : (safe.date || getTodayStr()),
            status: actualStatus,
            interviewSchedule: actualSchedule,
            interviewRatings: app.interviewRatings || {},
            interviewer: app.interviewer || "",
            examScore: app.examScore,
            isExamined: app.isExamined || false,
            admissionStatus: app.admissionStatus,
            isInterviewWaived: app.isInterviewWaived || safe.isInterviewWaived || false,
            isInterviewed: isInterviewed,
            isApplicationAccepted: app.isApplicationAccepted || safe.isApplicationAccepted || false
          }
        });

        setApplicants(mappedData);
        setError(null);

        try {
          const rubricRes = await getRubric();
          if (rubricRes.data && rubricRes.data.length > 0) {
            setRubricData(rubricRes.data);
          }
        } catch (rubricErr) {
          console.warn("Rubric backend not found. Using default rubric for now.");
        }

      } catch (err) {
        setError(err.message || "An error occurred while fetching applicants.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!activeYear || isArchiveMode) return;

    const fetchApplicantsOnly = async () => {
      try {
        const applicantsRes = await api.get('/admin/applicants', { params: { schoolYear: activeYear } });

        const mappedData = applicantsRes.data.map(app => {
          const safe = getSafeApplicant(app);

          const isInterviewed = isApplicantInterviewed(app);

          const dbStatus = (app.interviewStatus && app.interviewStatus !== 'Pending')
            ? app.interviewStatus
            : (isInterviewed ? (app.admissionStatus || 'Pending') : 'For Interview');

          let actualStatus = (!isInterviewed || dbStatus === 'Pending Interview' || dbStatus === 'Pending' || dbStatus?.toLowerCase() === 'pending')
            ? 'For Interview'
            : dbStatus;

          if (app.isInterviewWaived && !isInterviewed) {
            actualStatus = 'For Docs Submission';
          }

          const actualSchedule = app.interviewSchedule || app.interviewDate || "";

          const locDisplay = getApplicantCityOrTown(safe, app);

          return {
            ...safe,
            id: app.applicantId || app.id || app._id,
            name: (app.name || `${safe.profile.personal.surname}, ${safe.profile.personal.firstName}`).toUpperCase(),
            type: safe.profile.appDetails.applicantType,
            location: locDisplay,
            date: safe.createdAt ? new Date(safe.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : (safe.date || getTodayStr()),
            status: actualStatus,
            interviewSchedule: actualSchedule,
            interviewRatings: app.interviewRatings || {},
            interviewer: app.interviewer || "",
            examScore: app.examScore,
            isExamined: app.isExamined || false,
            admissionStatus: app.admissionStatus,
            isInterviewWaived: app.isInterviewWaived || safe.isInterviewWaived || false,
            isInterviewed: isInterviewed,
            isApplicationAccepted: app.isApplicationAccepted || safe.isApplicationAccepted || false
          }
        });
        setApplicants(prev => {
          if (JSON.stringify(prev) === JSON.stringify(mappedData)) return prev;
          return mappedData;
        });
      } catch (err) {
        console.error("Auto-update failed:", err);
      } finally {
        timeoutId = setTimeout(fetchApplicantsOnly, 15000);
      }
    };

    let timeoutId = setTimeout(fetchApplicantsOnly, 15000); // 15 seconds
    return () => clearTimeout(timeoutId);
  }, [activeYear, isArchiveMode]);

  useEffect(() => {
    if (navigationState?.applicantId && applicants.length > 0) {
      const target = applicants.find(a => a._id === navigationState.applicantId || a.id === navigationState.applicantId || a.rawId === navigationState.applicantId || String(a._id) === String(navigationState.applicantId));

      if (target) {
        if (navigationState.openInterview) {
          openInterviewModal(target);
        } else if (navigationState.openEdit) {
          const safeApp = getSafeApplicant(target);
          setSelectedApplicant(safeApp);
          setIsInlineEditMode(true);
          setNewApplicant(JSON.parse(JSON.stringify(safeApp)));
          setIsModalOpen(true);
        } else {
          setSelectedApplicant(getSafeApplicant(target));
          setIsModalOpen(true);
        }
      }
    }
  }, [navigationState, applicants]);

  useEffect(() => {
    if (isInterviewModalOpen && selectedApplicant && !isArchiveMode && userRole === "Admin") {
      const appId = selectedApplicant._id || selectedApplicant.id;
      const hasRatings = Object.keys(interviewRatings || {}).length > 0;
      const interviewer = selectedApplicant.interviewer || "";
      const interviewSchedule = selectedApplicant.interviewSchedule || "";
      if (hasRatings || interviewer || interviewSchedule) {
        setDraftRatings(prev => ({
          ...prev,
          [appId]: {
            ratings: interviewRatings,
            interviewer,
            interviewSchedule
          }
        }));
      }
    }
  }, [interviewRatings, selectedApplicant?.interviewer, selectedApplicant?.interviewSchedule, isInterviewModalOpen, isArchiveMode, userRole]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredApplicants = useMemo(() => {
    if (!activeYear || activeYear.trim() === "") return [];

    let result = applicants.filter((a) => {
      if (isApplicantInterviewed(a)) return false;
      if (a.admissionStatus === 'Admitted') return false;
      if (a.schoolYear !== activeYear) return false;

      if (searchQuery) {
        const lowerTerm = searchQuery.toLowerCase();
        const appName = (a.name || "").toLowerCase();
        const appId = (a.id || "").toString().toLowerCase();
        const rawId = (a.rawId || "").toString().toLowerCase();
        if (!appName.includes(lowerTerm) && !appId.includes(lowerTerm) && !rawId.includes(lowerTerm)) return false;
      }
      // Strictly restrict to IITI programs
      const activeChoice = a.reconsiderationProgram || (a.isRejectedFirstChoice ? (a.profile?.appDetails?.secondChoice || a.secondChoice) : (a.profile?.appDetails?.firstChoice || a.firstChoice));
      if (!activeChoice) return false;
      const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
      const activeCourse = coursesList.find(c => c.abbreviation === activeAbbr || c.name === activeChoice);
      const courseInst = (activeCourse?.institute || "").toUpperCase();
      const isIITI = courseInst === "IITI" || activeAbbr === "BSIT" || activeChoice.toLowerCase().includes("information technology");
      if (!isIITI) return false;

      if (courseFilter !== "All") {
        if (activeAbbr !== courseFilter) return false;
      }
      if (typeFilter) {
        const normAppType = normalizeApplicantType(a.type || a.applicantType || a.profile?.appDetails?.applicantType);
        const normFilter = normalizeApplicantType(typeFilter);
        if (normAppType !== normFilter) return false;
      }
      const appLoc = (a.location || getApplicantCityOrTown(a, a)).toUpperCase();
      if (locationFilter && appLoc !== locationFilter.toUpperCase()) return false;
      if (statusFilter) {
        const normStatus = (a.status === 'For Document Submission' ? 'For Docs Submission' : a.status) || '';
        if (normStatus.toUpperCase() !== statusFilter.toUpperCase()) return false;
      }

      if (scheduleFilter) {
        const today = getTodayStr();
        const tomorrow = getTomorrowStr();
        if (scheduleFilter === 'today' && !a.interviewSchedule?.startsWith(today)) return false;
        if (scheduleFilter === 'tomorrow' && !a.interviewSchedule?.startsWith(tomorrow)) return false;
      }
      return true;
    });

    // 3. SORTING
    if (activeSortType === "name") {
      result.sort((a, b) => {
        const aIsDone = (a.status === 'Passed' || a.status === 'Failed');
        const bIsDone = (b.status === 'Passed' || b.status === 'Failed');
        if (aIsDone && !bIsDone) return 1;
        if (!aIsDone && bIsDone) return -1;

        if (nameSortOrder === "A-Z") {
          return (a.name || "").localeCompare(b.name || "");
        } else {
          return (b.name || "").localeCompare(a.name || "");
        }
      });
    } else {
      result.sort((a, b) => {
        const aIsDone = (a.status === 'Passed' || a.status === 'Failed');
        const bIsDone = (b.status === 'Passed' || b.status === 'Failed');
        if (aIsDone && !bIsDone) return 1;
        if (!aIsDone && bIsDone) return -1;

        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
    }

    return result;
  }, [applicants, activeYear, searchQuery, courseFilter, instituteFilter, typeFilter, locationFilter, statusFilter, scheduleFilter, sortOrder, nameSortOrder, activeSortType, coursesList]);

  const uniqueLocations = useMemo(() => {
    const baseApplicants = applicants.filter(a => {
      if (isApplicantInterviewed(a)) return false;
      if (a.admissionStatus === 'Admitted') return false;
      if (a.schoolYear !== activeYear) return false;
      return true;
    });

    const locs = baseApplicants.map(a => getApplicantCityOrTown(a, a)?.toUpperCase()).filter(loc => loc && loc !== "N/A");
    return [...new Set(locs)].sort();
  }, [applicants, activeYear]);


  /* --- HANDLERS --- */
  const handleSelectAll = (checked) => {
    if (isArchiveMode || userRole === 'SuperAdmin') return;
    setIsSelectAllChecked(checked);
    if (checked) {
      setSelectedApplicantIds(filteredApplicants.map(a => a._id || a.id));
      setActivePopover('all');
    } else {
      setSelectedApplicantIds([]);
      setActivePopover(null);
    }
  };

  const handleSelectApplicant = (id) => {
    if (isArchiveMode || userRole === 'SuperAdmin') return;
    setIsSelectAllChecked(false);
    setSelectedApplicantIds(prev => {
      if (prev.includes(id)) {
        const newIds = prev.filter(appId => appId !== id);
        if (activePopover === id) {
          setActivePopover(newIds.length > 0 ? newIds[newIds.length - 1] : null);
        }
        return newIds;
      } else {
        setActivePopover(id);
        return [...prev, id];
      }
    });
  };

  const triggerConfirmModal = (status) => {
    setConfirmActionStatus(status);
    setIsConfirmModalOpen(true);
    setActivePopover(null);
  };

  const executeBulkUpdate = async () => {
    if (confirmActionStatus && !isArchiveMode && userRole === 'Admin') {
      await handleBulkStatusUpdate(confirmActionStatus);
    }
    setIsConfirmModalOpen(false);
    setConfirmActionStatus(null);
  };

  const handleBulkStatusUpdate = async (newStatus) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const scoreOverride = newStatus === 'Passed' ? 100 : 0;
      const autoRatings = {};
      rubricData.forEach(section => {
        section.criteria.forEach(crit => {
          autoRatings[crit.id] = scoreOverride.toString();
        });
      });

      const today = getTodayStr();
      const interviewerName = currentAdminUsername || "Admin";

      // Process sequentially with a slight delay to avoid triggering the 429 Rate Limiter
      for (const id of selectedApplicantIds) {
        const targetApp = applicants.find(a => (a._id || a.id) === id);
        const isWaived = targetApp?.isInterviewWaived === true || targetApp?.isInterviewWaived === "true";

        if (newStatus === 'Passed') {
          if (isWaived) {
            // Waived applicant: Accept and auto-credit 50 points to advance to Pre-Admission
            await api.put(`/admin/applicant/${id}/accept-application`);
          } else {
            // Requires interview: Encode score 100 with rubric ratings
            await encodeScore(id, scoreOverride, autoRatings, today, interviewerName);
          }
        } else {
          // Failed: Encode score 0
          await encodeScore(id, 0, autoRatings, today, interviewerName);
        }
        await new Promise(resolve => setTimeout(resolve, 150)); // 150ms delay between requests
      }

      setApplicants(prev => prev.map(app =>
        selectedApplicantIds.includes(app._id || app.id)
          ? {
            ...app,
            status: newStatus,
            interviewRatings: autoRatings,
            interviewScore: scoreOverride,
            isInterviewed: true,
            isApplicationAccepted: true,
            interviewer: interviewerName
          }
          : app
      ));

      toast.success(`Successfully marked ${selectedApplicantIds.length} applicant(s) as ${newStatus}.`);

      setSelectedApplicantIds([]);
      setIsSelectAllChecked(false);
      setActivePopover(null);
    } catch (err) {
      console.error("Bulk update failed:", err);
      toast.error(err.response?.data?.detail || "Failed to update applicant statuses.");
    } finally {
      setIsProcessing(false);
    }
  };

  /* --- EXPORT HANDLERS --- */
  const getTargetApplicants = () => selectedApplicantIds.length > 0
    ? filteredApplicants.filter(a => selectedApplicantIds.includes(a._id || a.id))
    : filteredApplicants;

  const exportToExcel = () => {
    const data = getTargetApplicants();

    const headers = [
      "APPLICANT ID", "APPLICANT TYPE", "PROGRAM", "APPLICANT FULL NAME",
      "PERMANENT ADDRESS", "PRESENT ADDRESS", "GENDER", "DATE OF BIRTH", "PLACE OF BIRTH",
      "CIVIL STATUS", "NAME OF SPOUSE", "EMAIL ADDRESS", "CONTACT NUMBER",
      "ELEMENTARY SCHOOL", "ELEMENTARY ADDRESS", "ELEMENTARY YEAR GRADUATED",
      "JHS SCHOOL", "JHS ADDRESS", "JHS YEAR GRADUATED",
      "SHS SCHOOL", "SHS ADDRESS", "GRADE 11 GWA", "GRADE 12 GWA", "SHS YEAR GRADUATED", "TRACK", "STRAND/ELECTIVES",
      "TERTIARY/ALS SCHOOL", "TERTIARY/ALS ADDRESS", "TERTIARY/ALS YEAR GRADUATED", "LATEST GWA",
      "FATHER'S NAME", "FATHER'S CONTACT NUMBER", "MOTHER'S MAIDEN NAME", "MOTHER'S CONTACT NUMBER",
      "ICC/IP", "SOLO PARENT", "SSN/DISABILITY", "4PS", "OFW"
    ];

    const formatFam = (person) => {
      if (!person || person.firstName === 'N/A') return "N/A";
      const middle = person.middleName && person.middleName !== 'N/A' ? person.middleName : '';
      return `${person.firstName} ${middle} ${person.surname}`.replace(/\s+/g, ' ').trim();
    };

    const formatAddr = (addr) => {
      if (!addr) return "N/A";
      return `${addr.houseStreet || ''} ${addr.barangay || ''}, ${addr.city || ''}, ${addr.province || ''} ${addr.zip || ''}`.replace(/\s+/g, ' ').trim();
    };

    const excelData = [headers];

    data.forEach(app => {
      const p = app.profile?.personal || {};
      const f = app.profile?.family || {};
      const ed = app.profile?.education || {};
      const o = app.profile?.otherInfo || {};
      const a = app.profile?.appDetails || {};
      const edElem = ed.elem || {};
      const edJhs = ed.jhs || {};
      const edShs = ed.shs || {};
      const edTert = ed.tertiary || {};

      const activeChoice = app.isReassigned
        ? a.firstChoice
        : (app.isRejectedFirstChoice ? a.secondChoice : a.firstChoice);

      const rawRow = [
        app.id || app._id || "N/A",
        a.applicantType || app.type || "N/A",
        getCourseFullName(activeChoice, coursesList),
        app.name || "N/A",
        formatAddr(p.permAddress),
        formatAddr(p.presAddress),
        p.sex || "N/A",
        p.dob || "N/A",
        p.pob || "N/A",
        p.civilStatus || "N/A",
        p.spouseName || "N/A",
        p.email || "N/A",
        p.contact || "N/A",
        edElem.name || "N/A", edElem.address || "N/A", edElem.year || "N/A",
        edJhs.name || "N/A", edJhs.address || "N/A", edJhs.year || "N/A",
        edShs.name || "N/A", edShs.address || "N/A", edShs.grade11Gwa || edShs.gwa || "N/A", edShs.grade12Gwa || "N/A", edShs.year || "N/A", edShs.track || "N/A", edShs.strand || "N/A",
        edTert.name || "N/A", edTert.address || "N/A", edTert.year || "N/A", edTert.latestGwa || edTert.gwa || "N/A",
        formatFam(f.father), f.father?.contact || "N/A",
        formatFam(f.mother), f.mother?.contact || "N/A",
        o.isIndigenous ? (o.indigenousDetails || o.indigenousSpec || app.indigenousSpec || app.indigenousDetails || "YES") : "NO",
        o.isSoloParent ? (o.soloParentDetails || o.soloParentSpec || app.soloParentSpec || app.soloParentDetails || "YES") : "NO",
        o.isPwd ? (o.pwdDetails || o.pwdSpec || app.disabilitySpec || app.disabilityDetails || "YES") : "NO",
        o.is4Ps ? (o.fourPsDetails || o.fourPsSpec || app.fourPsSpec || app.fourPsDetails || "YES") : "NO",
        o.isOfw ? "YES" : "NO"
      ];

      excelData.push(rawRow.map(item => String(item).toUpperCase()));
    });

    const ws = XLSX.utils.aoa_to_sheet(excelData);

    const colWidths = headers.map((_, colIndex) => {
      const maxLength = excelData.reduce((max, row) => {
        const val = row[colIndex] ? row[colIndex].toString() : "";
        return Math.max(max, val.length);
      }, 10);
      return { wch: maxLength + 2 };
    });
    ws['!cols'] = colWidths;

    for (let R = 0; R < excelData.length; ++R) {
      for (let C = 0; C < headers.length; ++C) {
        const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
        if (!ws[cellRef]) continue;

        if (R === 0) {
          ws[cellRef].s = {
            alignment: { horizontal: "center", vertical: "center" },
            font: { bold: true }
          };
        } else {
          ws[cellRef].s = {
            alignment: { horizontal: "left", vertical: "center" }
          };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Applicants");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8" });
    saveAs(blob, `Applicants Details ${activeYear}.xlsx`);
    setIsExportMenuOpen(false);
  };


  const exportFormsToPDF = (specificApplicants = null) => {
    const targetApplicants = specificApplicants || getTargetApplicants();
    if (targetApplicants.length === 0) {
      toast.error("No applicants available to print.");
      return;
    }

    const generateFormHtml = (app) => {
      const p = app.profile.personal;
      const f = app.profile.family;
      const ed = app.profile.education;
      const o = app.profile.otherInfo;
      const a = app.profile.appDetails;

      const chk = (condition) => condition ? '<span style="display:inline-block; width:12px; height:12px; border:1px solid #000; text-align:center; line-height:10px; font-size:10px; font-weight:bold;">X</span>' : '<span style="display:inline-block; width:12px; height:12px; border:1px solid #000;"></span>';

      const civilStatus = String(p.civilStatus || '').toUpperCase();
      const gender = String(p.sex || '').toUpperCase();
      const appType = String(a.applicantType || '').toUpperCase();

      const isIndig = String(o.isIndigenous).toLowerCase() === 'true';
      const isSolo = String(o.isSoloParent).toLowerCase() === 'true';
      const isPwd = String(o.isPwd).toLowerCase() === 'true';
      const is4Ps = String(o.is4Ps).toLowerCase() === 'true';
      const isOfw = String(o.isOfw).toLowerCase() === 'true';
      const indigenousSpec = o.indigenousDetails || o.indigenousSpec || app.indigenousSpec || app.indigenousDetails || '';
      const pwdSpec = o.pwdDetails || o.pwdSpec || app.disabilitySpec || app.disabilityDetails || '';

      const isFreshmen = appType.includes('FRESHMEN') || appType.includes('SHS GRADUATE') || appType === 'SENIOR HIGH SCHOOL GRADUATE';
      const isTransfereeOrALS = appType.includes('TRANSFEREE') || appType.includes('RETURNEE') || appType.includes('ALS');
      const is2ndSemesterActive = activeYear ? activeYear.toLowerCase().includes('2nd semester') : false;

      const printGrade11Gwa = isFreshmen ? (ed.shs?.grade11Gwa || ed.shs?.seniorHighGwa || ed.shs?.gwa || '') : '';
      const printGrade12Gwa = (isFreshmen && is2ndSemesterActive) ? (ed.shs?.grade12Gwa || '') : null;
      const printLatestGwa = isTransfereeOrALS ? (ed.tertiary?.latestGwa || ed.tertiary?.gwa || ed.shs?.gwa || '') : '';

      return `
            <div class="page">
                <div class="header-container">
                    <div class="header-left">
                        <div class="header-content">
                            <img src="/img/btech.png" class="btech-logo" onerror="this.style.display='none'" alt="Logo" />
                            <div class="header-text">
                                <h2>DALUBHASAANG POLITEKNIKO<br/>NG LUNGSOD NG BALIWAG</h2>
                                <h3>(BALIWAG POLYTECHNIC COLLEGE)</h3>
                                <div class="header-titles">
                                    <p>Admissions Office</p>
                                    <h1>APPLICATION FORM</h1>
                                </div>
                            </div>
                        </div>
                        <div class="instruction-box">
                            Instructions: Please use PRINTED CAPITAL LETTERS (not cursive) upon filling out the form of the following information except on email address.
                        </div>
                    </div>
                    <div class="photo-box">2X2<br/>PHOTO</div>
                </div>
                
                <div class="row">
                    <span class="label label-offset">NAME:</span>
                    <div class="flex-1 field-underline text-center">
                        <div>${p.surname || ''}</div><div class="sub-label">SURNAME</div>
                    </div>
                    <div class="flex-1 field-underline text-center">
                        <div>${p.firstName || ''}</div><div class="sub-label">FIRST NAME</div>
                    </div>
                    <div class="flex-1 field-underline text-center">
                        <div>${p.middleName || ''}</div><div class="sub-label">MIDDLE NAME</div>
                    </div>
                </div>

                <div class="row">
                    <span class="label label-offset">PERMANENT ADDRESS:</span>
                    <div style="width: 80px;" class="field-underline text-center"><div>${p.permAddress.zip || ''}</div><div class="sub-label">ZIP CODE</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.houseStreet || ''}</div><div class="sub-label">HOUSE NO. & STREET</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.barangay || ''}</div><div class="sub-label">BARANGAY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.city || ''}</div><div class="sub-label">TOWN/CITY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.province || ''}</div><div class="sub-label">PROVINCE</div></div>
                </div>

                <div class="row">
                    <span class="label label-offset">PRESENT ADDRESS:</span>
                    <div style="width: 80px;" class="field-underline text-center"><div>${p.presAddress.zip || ''}</div><div class="sub-label">ZIP CODE</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.houseStreet || ''}</div><div class="sub-label">HOUSE NO. & STREET</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.barangay || ''}</div><div class="sub-label">BARANGAY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.city || ''}</div><div class="sub-label">TOWN/CITY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.province || ''}</div><div class="sub-label">PROVINCE</div></div>
                </div>

                <div class="row items-center">
                    <span class="label">CIVIL STATUS:</span>
                    <span class="checkbox-group">
                        <span>${chk(civilStatus === 'SINGLE')} Single</span>
                        <span>${chk(civilStatus === 'MARRIED')} Married</span>
                    </span>
                    <span class="label" style="margin-left:20px; font-style: italic;">If married, name of spouse:</span>
                    <div class="flex-1 field-underline"><div>${p.spouseName || ''}</div></div>
                </div>

                <div class="row items-center">
                    <span class="label">DATE OF BIRTH:</span>
                    <div class="flex-1 field-underline"><div>${p.dob || ''}</div></div>
                    <span class="label" style="margin-left:15px;">PLACE OF BIRTH:</span>
                    <div class="flex-1 field-underline"><div>${p.pob || ''}</div></div>
                    <span class="label" style="margin-left:15px;">GENDER:</span>
                    <span class="checkbox-group">
                        <span>${chk(gender === 'MALE')} Male</span>
                        <span>${chk(gender === 'FEMALE')} Female</span>
                    </span>
                </div>

                <div class="row items-center">
                    <span class="label">EMAIL ADDRESS:</span>
                    <div class="flex-1 field-underline" style="text-transform: none;"><div>${p.email || ''}</div></div>
                    <span class="checkbox-group" style="margin-left:20px;">
                        <span>${chk(appType === 'FRESHMEN' || appType === 'SENIOR HIGH SCHOOL GRADUATE' || appType === 'SHS GRADUATE')} Freshmen</span>
                        <span>${chk(appType === 'TRANSFEREE')} Transferee</span>
                        <span>${chk(appType === 'RETURNEE')} Returnee</span>
                        <span>${chk(appType === 'ALS' || appType === 'ALS GRADUATE')} ALS Graduate</span>
                    </span>
                </div>

                <div class="row items-center">
                    <span class="label">CONTACT NUMBER:</span>
                    <div style="width: 250px;" class="field-underline"><div>${p.contact || ''}</div></div>
                </div>

                <h4 class="section-title">EDUCATIONAL BACKGROUND</h4>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">ELEMENTARY:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.elem?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.elem?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.elem?.year || ''}</div><div class="sub-label">YEAR GRADUATED</div></div>
                </div>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">JUNIOR HIGH SCHOOL:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.jhs?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.jhs?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.jhs?.year || ''}</div><div class="sub-label">YEAR GRADUATED</div></div>
                </div>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">SENIOR HIGH SCHOOL:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.shs?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.shs?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.shs?.year || ''}</div><div class="sub-label">YEAR GRADUATED</div></div>
                    <div style="width: 100px;" class="field-underline text-center"><div>${printGrade11Gwa}</div><div class="sub-label">GRADE 11 GWA</div></div>
                    ${printGrade12Gwa !== null ? `<div style="width: 100px;" class="field-underline text-center"><div>${printGrade12Gwa}</div><div class="sub-label">GRADE 12 GWA</div></div>` : ''}
                </div>
                <div class="row">
                    <span style="width: 150px;"></span>
                    <div class="flex-1 field-underline text-center"><div>${ed.shs?.track || ''}</div><div class="sub-label">TRACK</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.shs?.strand || ''}</div><div class="sub-label">STRAND/ELECTIVES</div></div>
                </div>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">TERTIARY/ ALS:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.tertiary?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.tertiary?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.tertiary?.year || ''}</div><div class="sub-label">YEAR GRADUATED</div></div>
                    <div style="width: 100px;" class="field-underline text-center"><div>${printLatestGwa}</div><div class="sub-label">LATEST GWA</div></div>
                </div>

                <h4 class="section-title">PARENT INFORMATION <span style="font-weight:normal; font-style:italic;">(Please include your parents' full name; note that you shall write your mother's maiden name.)</span></h4>
                <div class="row">
                    <span class="label" style="width: 80px;">FATHER:</span>
                    <div class="flex-1 field-underline"><div>${f.father?.firstName || ''} ${f.father?.middleName || ''} ${f.father?.surname || ''}</div></div>
                    <span class="label" style="margin-left:15px;">CONTACT NUMBER:</span>
                    <div style="width: 250px;" class="field-underline"><div>${f.father?.contact || ''}</div></div>
                </div>
                <div class="row">
                    <span class="label" style="width: 80px;">MOTHER:</span>
                    <div class="flex-1 field-underline"><div>${f.mother?.firstName || ''} ${f.mother?.middleName || ''} ${f.mother?.surname || ''}</div></div>
                    <span class="label" style="margin-left:15px;">CONTACT NUMBER:</span>
                    <div style="width: 250px;" class="field-underline"><div>${f.mother?.contact || ''}</div></div>
                </div>

                <div style="margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <div style="flex: 1; padding-right: 15px;">MEMBER OF AN INDIGENOUS CULTURAL COMMUNITY (ICC) /INDIGENOUS PEOPLE (IP)?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isIndig)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isIndig)} NO <span style="flex: 1; border-bottom: 1px solid black; margin-left: 10px; display: inline-block; height: 12px; font-size: 8px; text-align: center; padding-top: 2px;">${indigenousSpec}</span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">CHILD OF A SOLO PARENT OR SOLO PARENT?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isSolo)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isSolo)} NO <span style="flex: 1; border-bottom: 1px solid black; margin-left: 10px; display: inline-block; height: 12px;"></span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">STUDENT WITH SPECIAL NEEDS (SSN) AND OTHER TYPES OF DISABILITIES?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isPwd)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isPwd)} NO <span style="flex: 1; border-bottom: 1px solid black; margin-left: 10px; display: inline-block; height: 12px; font-size: 8px; text-align: center; padding-top: 2px;">${pwdSpec}</span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">MEMBER OF PANTAWID PAMILYANG PILIPINO PROGRAM (4PS)?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(is4Ps)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!is4Ps)} NO</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">CHILD OF OVERSEAS FILIPINO WORKER/S (OFW)?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isOfw)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isOfw)} NO</div>
                    </div>
                </div>

                <div class="row items-center" style="margin-top: 8px; margin-bottom: 8px;">
                    <span class="label">DEGREE COURSE(S) APPLIED FOR</span>
                    <span class="label" style="margin-left: 20px;">1<sup>ST</sup> Choice</span>
                    <div class="flex-1 field-underline"><div${app.isRejectedFirstChoice ? ' style="text-decoration: line-through; color: #999;"' : ''}>${a.firstChoice ? a.firstChoice.split(' - ')[0].trim() : ''}</div></div>
                    <span class="label" style="margin-left: 20px;">2<sup>nd</sup> Choice</span>
                    <div class="flex-1 field-underline"><div>${app.isReassigned ? '' : (a.secondChoice ? a.secondChoice.split(' - ')[0].trim() : '')}</div></div>
                </div>

                <div style="font-size: 10px; margin-bottom: 8px;">
                    <p style="margin-bottom: 5px; font-weight: bold;">I HEREBY AFFIRM THAT:</p>
                    <ul style="margin-top: 0; padding-left: 20px;">
                        <li>THE ABOVE INFORMATION GIVEN ARE TRUE AND CORRECT.</li>
                        <li>I UNDERSTAND THAT GIVING FALSE INFORMATION WILL AUTOMATICALLY DISQUALIFY ME FOR ADMISSION.</li>
                        <li>IF ADMITTED, BY THE RULES AND REGULATIONS OF THE BTECH, I HEREBY ALLOW/AUTHORIZE THE BTECH TO USE, COLLECT, AND PROCESS THE INFORMATION FOR LEGITIMATE PURPOSES SPECIFICALLY THE PROMOTION OF THE COLLEGE COURSES AND SERVICES.</li>
                        <li>I ALLOW AUTHORIZED PERSONNEL TO PROCESS THE INFORMATION PURSUANT TO THE DATA PRIVACY OF POLICIES OF THE COLLEGE.</li>
                        <li>I ACKNOWLEDGE THAT ALL DOCUMENTS SUBMITTED FOR ADMISSION SHALL BECOME THE PROPERTY OF THE BTECH, AND THAT TRANSFER CREDENTIALS WILL BE ISSUED IF I TRANSFER TO ANOTHER EDUCATIONAL INSTITUTION.</li>
                    </ul>
                </div>

                <div style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
                    <div style="display: flex; width: 400px;">
                        <div style="font-size: 10px; text-align: left; padding-top: 6px; margin-right: 10px; white-space: nowrap;">Certified Correct by:</div>
                        <div style="flex: 1; text-align: center;">
                            <div style="border-bottom: 1px solid black; height: 25px;"></div>
                            <div style="font-size: 9px; margin-top: 3px;">Printed Name with Signature above</div>
                            <div style="border-bottom: 1px solid black; height: 25px; margin-top: 5px;"></div>
                            <div style="font-size: 9px; margin-top: 3px;">Date</div>
                        </div>
                    </div>
                </div>

                <div style="font-size: 10px;">
                    <p style="font-weight: bold; margin-bottom: 5px;">Documents Submitted: (Please submit your documents inside <span style="text-decoration: underline;">Long Brown Envelope</span>.)</p>
                    <div style="display: flex; justify-content: space-between;">
                        ${(() => {
                            const reqs = portalSettings?.applicantRequirements || [];
                            
                            const filterReqs = (types) => reqs.filter(r => 
                                !r.condition && 
                                (!r.targetApplicant || r.targetApplicant.length === 0 || r.targetApplicant.some(t => types.includes(t)))
                            );

                            const freshmenReqs = filterReqs(["SHS Graduate", "High School (Old Curriculum)"]);
                            const transfereeReqs = filterReqs(["Transferee"]);
                            const alsReqs = filterReqs(["ALS"]);

                            const renderDocList = (title, docList) => `
                                <div style="width: 32%;">
                                    <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">${title}</div>
                                    ${docList.map(r => `<div style="margin-bottom: 3px;"><span style="display:inline-block; width:10px; height:10px; border:1px solid #000; margin-right:4px; margin-bottom:-1px;"></span> ${r.documentName}</div>`).join('')}
                                </div>
                            `;

                            return `
                                ${renderDocList("Freshmen", freshmenReqs)}
                                ${renderDocList("Transferees", transfereeReqs)}
                                ${renderDocList("ALS", alsReqs)}
                            `;
                        })()}
                    </div>
                </div>
            </div>

            <div class="page" style="display: flex; flex-direction: column; justify-content: flex-start; align-items: center; padding: 1in; font-family: Arial, sans-serif; font-size: 14px; text-transform: none; line-height: 2;">
                <h3 style="text-align: center; font-weight: bold; font-size: 16px; margin-top: 50px; margin-bottom: 50px; text-transform: uppercase;">KASUNDUAN</h3>
                
                <p style="text-align: justify; width: 100%; margin-bottom: 20px;">
                    Ako po si <span style="display: inline-block; width: 300px; border-bottom: 1px solid black; text-align: center; text-transform: uppercase; font-weight: bold;"></span> Nakatira sa <span style="display: inline-block; border-bottom: 1px solid black; flex: 1; min-width: 250px; text-align: center; font-weight: bold; text-transform: uppercase;"></span>
                    Edad <span style="display: inline-block; width: 80px; border-bottom: 1px solid black; text-align: center; font-weight: bold;"></span>, ipinanganak noong <span style="display: inline-block; width: 200px; border-bottom: 1px solid black; text-align: center; font-weight: bold;"></span> na nangangako na sa aking
                    pagpasok o pag - enroll sa Dalubhasaang Politekniko ng Lungsod ng Baliwag na ang lahat ng aking
                    mga Dokumentong ipinasa ay magiging pag-aari na ng Eskwelahang ito. Ang mga opisyal na
                    dokumentong aking isinumite sa Admissions Office na Form 138 (SHS Card), Good Moral at
                    Honorable Dismissal (Transferees) ay sinisigurado kong Orihinal at nagmula sa aking
                    pinangalingang eskwelahan. Nangangako ako na hindi babawiin ang mga dokumentong ipinasa
                    kung ako ay lilipat sa ibang Dalubhasaan (College) o Pamantasan (University).
                </p>

                <p style="text-align: justify; width: 100%; margin-bottom: 20px;">
                    Nauunawaan ko na ang tanging dokumento na aking makukuha para sa aking paglipat ay ang
                    Honorable Dismissal, Good Moral, at ang Transcript of Records na magmumula sa
                    eskuwelahang ito.
                </p>

                <p style="text-align: justify; width: 100%; margin-bottom: 60px;">
                    Kasama sa kasunduang ito na pipilitin ko munang tapusin ang Semestreng inenrolan ko bago ako
                    magtangkang lumipat sa ibang Dalubhasaan o Pamantasan.
                </p>

                <p style="width: 100%; text-align: left; margin-bottom: 80px;">
                    Lubos na gumagalang,
                </p>

                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <div style="text-align: center; width: 45%;">
                        <div style="border-bottom: 1px solid black; width: 100%; height: 20px;"></div>
                        <p style="margin-top: 5px;">Buong Pangalan ng Mag-aaral at Lagda</p>
                    </div>
                    <div style="text-align: center; width: 45%;">
                        <div style="border-bottom: 1px solid black; width: 100%; height: 20px;"></div>
                        <p style="margin-top: 5px;">Buong Pangalan ng Magulang at Lagda</p>
                    </div>
                </div>
            </div>

        `;
    };

    const htmlContent = `
      <style>
        @page { size: legal portrait; margin: 0; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; background: #525659; line-height: 1.25; }
        .page { width: 8.5in; height: 14in; padding: 10mm 10mm 2mm 10mm; margin: 10mm auto; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5); box-sizing: border-box; font-size: 8pt; color: #000; text-transform: uppercase; page-break-after: always; overflow: hidden; position: relative; }
        .page:last-child { page-break-after: auto; }
        @media print { body { background: #fff; margin: 0; } .page { margin: 0; padding: 10mm 10mm 2mm 10mm; box-shadow: none; border: none; width: 100%; height: auto; min-height: 100vh; overflow: visible;} }
        .header-container { display: flex; margin-bottom: 8px; align-items: stretch; min-height: 50.8mm; }
        .header-left { flex: 1; display: flex; flex-direction: column; justify-content: space-between; margin-top: 5px; }
        .header-content { display: flex; align-items: center; justify-content: center; padding: 0 10px 10px 0; }
        .btech-logo { width: 100px; height: 100px; object-fit: contain; margin-right: 15px; filter: grayscale(100%); }
        .header-text { text-align: center; }
        .header-text h2 { font-size: 19px; margin: 0; font-weight: bold; line-height: 1.1; text-transform: uppercase; }
        .header-text h3 { font-size: 13px; margin: 0; font-weight: normal; font-style: italic; text-transform: uppercase; letter-spacing: 0.5px; }
        .header-titles { margin-top: 10px; margin-left: auto; margin-right: auto; text-align: center; width: max-content; }
        .header-titles p { font-size: 11px; margin: 0; text-transform: none; }
        .header-titles h1 { font-size: 15px; margin: 0; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
        .instruction-box { border-right: none; padding: 6px; font-size: 11px; font-weight: normal; text-transform: none; line-height: 1.2; }
        .photo-box { width: 51mm; height: 51mm; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-style: italic; font-size: 12px; text-align: center; flex-shrink: 0; }
        .row { display: flex; align-items: flex-end; margin-bottom: 8px; width: 100%; }
        .items-center { align-items: center; }
        .label { font-weight: bold; white-space: nowrap; margin-right: 5px; font-size: 8.5pt;}
        .label-offset { margin-bottom: 11px; }
        .flex-1 { flex: 1; }
        .field-underline { display: flex; flex-direction: column; justify-content: flex-end; margin: 0 5px; min-height: 18px;}
        .field-underline > div:first-child { border-bottom: 1px solid #000; padding: 0 5px; font-weight: bold; min-height: 14px;}
        .sub-label { font-size: 6pt; text-align: center; margin-top: 2px; }
        .text-center { text-align: center; }
        .checkbox-group { display: flex; gap: 15px; font-size: 8.5pt; align-items: center;}
        .section-title { font-weight: bold; font-style: italic; text-decoration: underline; margin-bottom: 6px; margin-top: 6px; font-size: 9pt; }
      </style>
      ${targetApplicants.map(app => generateFormHtml(app)).join('')}
    `;

    setPrintContent(htmlContent);
    setIsExportMenuOpen(false);
  };

  const getInitialNewApplicant = () => ({
    id: `2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    name: "", type: "SENIOR HIGH SCHOOL GRADUATE", location: "PULILAN", date: getTodayStr(),
    interviewSchedule: "", status: "For Interview", interviewRatings: {},
    profile: {
      appDetails: { applicantType: "SENIOR HIGH SCHOOL GRADUATE", firstChoice: "", secondChoice: "" },
      personal: {
        image: null, firstName: "", middleName: "", surname: "", extension: "", dob: "", pob: "", sex: "MALE",
        civilStatus: "SINGLE", spouseName: "", citizenship: "FILIPINO", religion: "", email: "", contact: "",
        permAddress: { region: "", province: "", city: "", barangay: "", houseStreet: "", zip: "", regionCode: "", provinceCode: "", cityCode: "", barangayCode: "" },
        presAddress: { region: "", province: "", city: "", barangay: "", houseStreet: "", zip: "", regionCode: "", provinceCode: "", cityCode: "", barangayCode: "" }
      },
      family: {
        father: { surname: "", firstName: "", middleName: "", contact: "" },
        mother: { surname: "", firstName: "", middleName: "", contact: "" },
      },
      education: {
        elem: { name: "", address: "", type: "PUBLIC", year: "" },
        jhs: { name: "", address: "", type: "PUBLIC", year: "" },
        shs: { name: "", address: "", type: "PUBLIC", year: "", gwa: "", grade11Gwa: "", grade12Gwa: "", track: "", strand: "" },
        tertiary: { name: "", address: "", year: "" }
      },
      otherInfo: { isPwd: false, pwdDetails: "", isIndigenous: false, indigenousDetails: "", isSoloParent: false, soloParentDetails: "", is4Ps: false, fourPsDetails: "" },
      documents: []
    }
  });

  const openAddModal = () => {
    setIsEditMode(false);
    setNewApplicant(getInitialNewApplicant());
    setIsAddModalOpen(true);
  };

  // Utility function to dynamically convert ALL CAPS text to Title Case (handles hyphens and spaces)
  const toTitleCase = (str) => {
    if (!str) return "";
    return str.toLowerCase().replace(/(?:^|\s|-)\w/g, (match) => match.toUpperCase());
  };

  const updateNewApplicant = (path, value) => {
    setNewApplicant(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      let current = updated;
      const keys = path.split('.');
      const targetField = keys[keys.length - 1];

      let processedValue = value;

      // Target specific fields to automatically format as Title Case
      const titleCaseFields = [
        'firstName', 'middleName', 'surname', 'spouseName', 'religion',
        'pob', 'citizenship', 'houseStreet', 'barangay', 'city', 'province',
        'name', 'address'
      ];

      if (titleCaseFields.includes(targetField)) {
        processedValue = toTitleCase(value);
      }

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = processedValue;

      if (path.includes('personal.firstName') || path.includes('personal.surname') || path.includes('personal.middleName')) {
        const p = updated.profile.personal;
        updated.name = `${p.firstName} ${p.middleName ? p.middleName[0] + '.' : ''} ${p.surname}`.trim().toUpperCase();
      }
      if (path === 'profile.appDetails.applicantType') updated.type = processedValue;
      if (path === 'profile.personal.presAddress.city' || path === 'profile.personal.permAddress.city') {
        updated.location = extractCityOrTown(processedValue);
      }

      return updated;
    });
  };

  const handleEditApplicant = () => {
    setIsInlineEditMode(true);
    setNewApplicant(JSON.parse(JSON.stringify(selectedApplicant)));
    // We intentionally keep isModalOpen true and do NOT open isAddModalOpen
  };

  const handleInlineChange = (category, subCategory, field, value) => {
    setNewApplicant(prev => {
      const updated = { ...prev };
      if (!updated.profile) updated.profile = {};
      if (!updated.profile[category]) updated.profile[category] = {};

      let processedValue = value;

      // Target specific fields to automatically format as Title Case during inline edits
      const titleCaseFields = [
        'firstName', 'middleName', 'surname', 'spouseName', 'religion',
        'pob', 'citizenship', 'houseStreet', 'barangay', 'city', 'province',
        'name', 'address'
      ];

      if (titleCaseFields.includes(field)) {
        processedValue = toTitleCase(value);
      }

      if (subCategory) {
        if (!updated.profile[category][subCategory]) updated.profile[category][subCategory] = {};
        updated.profile[category][subCategory][field] = processedValue;
      } else {
        updated.profile[category][field] = processedValue;
      }
      if (field === 'city') {
        updated.location = extractCityOrTown(processedValue);
      }
      return updated;
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageData.subject.trim() || !messageData.message.trim()) {
      toast.warning("Subject and message are required.");
      return;
    }
    try {
      setIsSendingMessage(true);
      const payload = {
        emails: [{
          email: selectedApplicant.profile.personal.email,
          subject: messageData.subject,
          message: messageData.message,
          applicantId: selectedApplicant.id
        }]
      };
      const res = await api.post('/admin/emails/send-bulk', payload);

      let unlockMsg = "";
      if (unlockOnSend) {
        try {
          await unlockApplicant(selectedApplicant._id || selectedApplicant.id);
          unlockMsg = " and application unlocked";
          setApplicants((prev) => prev.map((app) =>
            (app._id === selectedApplicant._id || app.id === selectedApplicant.id)
              ? { ...app, isSubmitted: false, admissionStatus: "Pending" }
              : app
          ));
        } catch (unlockErr) {
          console.error(unlockErr);
          toast.error("Message sent but failed to unlock application.");
        }
      }

      const baseMsg = res.data?.message && !res.data.message.includes("BREVO_API_KEY")
        ? res.data.message
        : "Message sent successfully to applicant";
      toast.success(baseMsg + unlockMsg + "!");
      setIsMessageModalOpen(false);
      setMessageData({ subject: "", message: "" });
      setUnlockOnSend(false);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Failed to send message.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleUnlockApplication = async (appId) => {
    try {
      await unlockApplicant(appId);
      toast.success("Application unlocked successfully. The applicant can now edit their forms and requirements.");
      fetchData();
      setIsMessageModalOpen(false);
      setIsUnlockConfirmOpen(false);
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Failed to unlock application.");
    }
  };

  const saveNewApplicant = async () => {
    const p = newApplicant.profile.personal;
    const e = newApplicant.profile.education;
    const a = newApplicant.profile.appDetails;
    const f = newApplicant.profile.family;

    const isEditing = isEditMode || isInlineEditMode;

    if (!isEditing) {
      const appType = String(a.applicantType || '').toUpperCase();
      const isFreshmen = appType.includes('SHS') || appType.includes('FRESHMEN') || appType.includes('SENIOR HIGH') || appType === 'SELECT APPLICANT TYPE';
      const isTransferee = appType.includes('TRANS');
      const isALS = appType.includes('ALS') || appType.includes('ALTERNATIVE');

      if (!a.applicantType || a.applicantType === "SELECT APPLICANT TYPE" ||
        !a.firstChoice || !a.secondChoice ||
        !p.firstName || !p.surname ||
        !p.dob || !p.civilStatus ||
        !p.email || !p.contact) {
        toast.warning("Please fill out all required fields (marked with *).");
        return;
      }

      if (isFreshmen) {
        if (!e.shs.name || !e.shs.year || !(e.shs.grade11Gwa || e.shs.gwa)) {
          toast.warning("Please fill out Senior High School details and GWA.");
          return;
        }
      } else if (isTransferee) {
        if (!e.tertiary.name) {
          toast.warning("Please fill out College/Tertiary school details.");
          return;
        }
      } else if (isALS) {
        if (!e.tertiary.name) {
          toast.warning("Please fill out ALS Center / School name.");
          return;
        }
      }
    }

    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
      toast.warning("Please enter a valid email address containing '@' (e.g., email@gmail.com).");
      return;
    }
    if (p.contact && !/^09\d{9}$/.test(p.contact)) {
      toast.warning("Applicant Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }
    if (f.father.contact && !/^09\d{9}$/.test(f.father.contact)) {
      toast.warning("Father's Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }
    if (f.mother.contact && !/^09\d{9}$/.test(f.mother.contact)) {
      toast.warning("Mother's Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }

    try {
      setIsLoading(true);

      const payload = {
        email: newApplicant.profile.personal.email,
        applicantType: newApplicant.profile.appDetails.applicantType,
        firstChoice: newApplicant.profile.appDetails.firstChoice,
        secondChoice: newApplicant.profile.appDetails.secondChoice,

        firstName: newApplicant.profile.personal.firstName,
        middleName: newApplicant.profile.personal.middleName,
        lastName: newApplicant.profile.personal.surname,
        suffix: newApplicant.profile.personal.extension,
        gender: newApplicant.profile.personal.sex,
        birthDate: newApplicant.profile.personal.dob,
        placeOfBirth: newApplicant.profile.personal.pob,
        civilStatus: newApplicant.profile.personal.civilStatus,
        spouseName: newApplicant.profile.personal.spouseName,
        contactNumber: newApplicant.profile.personal.contact,

        permanentHouse: newApplicant.profile.personal.permAddress.houseStreet,
        permanentProvince: newApplicant.profile.personal.permAddress.province,
        permanentCity: newApplicant.profile.personal.permAddress.city,
        permanentBarangay: newApplicant.profile.personal.permAddress.barangay,
        permanentZip: newApplicant.profile.personal.permAddress.zip,

        presentHouse: newApplicant.profile.personal.presAddress.houseStreet,
        presentProvince: newApplicant.profile.personal.presAddress.province,
        presentCity: newApplicant.profile.personal.presAddress.city,
        presentBarangay: newApplicant.profile.personal.presAddress.barangay,
        presentZip: newApplicant.profile.personal.presAddress.zip,

        fatherName: `${newApplicant.profile.family.father.firstName} ${newApplicant.profile.family.father.surname}`.trim(),
        fatherContact: newApplicant.profile.family.father.contact,
        motherName: `${newApplicant.profile.family.mother.firstName} ${newApplicant.profile.family.mother.surname}`.trim(),
        motherContact: newApplicant.profile.family.mother.contact,

        elementarySchool: newApplicant.profile.education.elem.name,
        elementaryAddress: newApplicant.profile.education.elem.address,
        elementaryYear: newApplicant.profile.education.elem.year,
        juniorHighSchool: newApplicant.profile.education.jhs.name,
        juniorHighAddress: newApplicant.profile.education.jhs.address,
        juniorHighYear: newApplicant.profile.education.jhs.year,
        seniorHighSchool: newApplicant.profile.education.shs.name,
        seniorHighAddress: newApplicant.profile.education.shs.address,
        seniorHighYear: newApplicant.profile.education.shs.year,
        seniorHighGwa: newApplicant.profile.education.shs.gwa,
        grade11Gwa: newApplicant.profile.education.shs.grade11Gwa || newApplicant.profile.education.shs.gwa,
        grade12Gwa: newApplicant.profile.education.shs.grade12Gwa,
        track: newApplicant.profile.education.shs.track,
        strand: newApplicant.profile.education.shs.strand,
        collegeSchool: newApplicant.profile.education.tertiary.name,
        collegeAddress: newApplicant.profile.education.tertiary.address,
        collegeYear: newApplicant.profile.education.tertiary.year,

        disability: newApplicant.profile.otherInfo.isPwd,
        disabilityDetails: newApplicant.profile.otherInfo.pwdDetails,
        indigenous: newApplicant.profile.otherInfo.isIndigenous,
        indigenousDetails: newApplicant.profile.otherInfo.indigenousDetails,
        soloParent: newApplicant.profile.otherInfo.isSoloParent,
        soloParentDetails: newApplicant.profile.otherInfo.soloParentDetails,
        fourPs: newApplicant.profile.otherInfo.is4Ps,
        fourPsDetails: newApplicant.profile.otherInfo.fourPsDetails
      };

      if (isEditMode || isInlineEditMode) {
        const targetId = selectedApplicant._id || selectedApplicant.id || selectedApplicant.rawId;
        await api.put(`/admin/applicant/${targetId}`, payload);

        const updatedSafe = getSafeApplicant({
          ...selectedApplicant,
          ...newApplicant,
          profile: newApplicant.profile
        });
        setSelectedApplicant(updatedSafe);

        setApplicants(prev => prev.map(a => {
          const currentId = a._id || a.id || a.rawId;
          if (currentId === targetId) {
            return {
              ...a,
              ...updatedSafe,
              name: (updatedSafe.name || `${newApplicant.profile.personal.surname}, ${newApplicant.profile.personal.firstName}`).toUpperCase(),
              type: newApplicant.profile.appDetails.applicantType,
              location: getApplicantCityOrTown(updatedSafe, newApplicant)
            };
          }
          return a;
        }));

        setIsInlineEditMode(false);
        setIsEditMode(false);
        setIsModalOpen(true);
        toast.success("Applicant successfully updated!");
        return;
      } else {
        payload.password = "password123";
        payload.schoolYear = activeYear || "2026";
        payload.status = "Pending Interview";
        await createApplicant(payload);
        setIsAddModalOpen(false);
        toast.success("Applicant successfully generated!");
        window.location.reload();
      }

    } catch (err) {
      setError(err.message || "An error occurred while saving the applicant.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;

      const parseCSVRow = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQuotes = !inQuotes;
          } else if (ch === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
          } else {
            cur += ch;
          }
        }
        result.push(cur.trim());
        return result;
      };

      const rows = text
        .split('\n')
        .map(parseCSVRow)
        .filter(row => row.length >= 4);

      if (rows[0] && rows[0][0].toLowerCase().includes('section')) {
        rows.shift();
      }

      setTempRubricData(prevData => {
        const updatedRubric = JSON.parse(JSON.stringify(prevData));
        rows.forEach(row => {
          const [sectionTitle, critName, critDesc, weightStr] = row;
          if (!sectionTitle) return;

          let section = updatedRubric.find(s => s.title === sectionTitle);
          if (!section) {
            section = {
              id: "S_" + Math.random().toString(36).substring(2, 9),
              title: sectionTitle,
              criteria: []
            };
            updatedRubric.push(section);
          }

          section.criteria.push({
            id: "C_" + Math.random().toString(36).substring(2, 9),
            name: critName || "New Criteria",
            desc: critDesc || "",
            weight: parseFloat(weightStr) || 0
          });
        });
        return updatedRubric;
      });
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const openRubricEditor = () => { setTempRubricData(JSON.parse(JSON.stringify(rubricData))); setIsRubricEditModalOpen(true); };
  const handleEditSectionTitle = (sIndex, newTitle) => { const updated = [...tempRubricData]; updated[sIndex].title = newTitle; setTempRubricData(updated); };
  const handleEditCriteria = (sIndex, cIndex, field, value) => { const updated = [...tempRubricData]; if (field === 'weight') value = parseFloat(value) || 0; updated[sIndex].criteria[cIndex][field] = value; setTempRubricData(updated); };

  const handleAddSection = () => {
    setTempRubricData(prev => [
      ...prev,
      { id: "S_" + Math.random().toString(36).substring(2, 9), title: "NEW SECTION TITLE", criteria: [] }
    ]);
  };

  const handleAddCriteria = (sIndex) => {
    const updated = [...tempRubricData];
    updated[sIndex].criteria.push({ id: "C_" + Math.random().toString(36).substring(2, 9), name: "", desc: "", weight: 0 });
    setTempRubricData(updated);
  };

  const handleRemoveSection = (sIndex) => { setTempRubricData(prev => prev.filter((_, i) => i !== sIndex)); };
  const handleRemoveCriteria = (sIndex, cIndex) => {
    const updated = [...tempRubricData];
    updated[sIndex].criteria = updated[sIndex].criteria.filter((_, i) => i !== cIndex);
    setTempRubricData(updated);
  };

  const handleSaveRubric = async () => {
    try {
      await apiSaveRubric(tempRubricData);
      setRubricData(tempRubricData);
      setIsRubricEditModalOpen(false);
      toast.success("Rubric saved successfully!");
    } catch (err) {
      console.error("Failed to save rubric:", err);
      toast.error("Failed to save rubric.");
    }
  };

  const getEditSectionTotal = (section) => {
    let total = 0;
    section.criteria.forEach(crit => total += (parseFloat(crit.weight) || 0));
    return total;
  };

  const getEditTotalRubricWeight = () => {
    let total = 0;
    tempRubricData.forEach(section => {
      section.criteria.forEach(crit => total += (parseFloat(crit.weight) || 0));
    });
    return total;
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.2));
  const handleResetZoom = () => { setZoomLevel(0.8); setRotationAngle(0); };

  const openPreview = (doc) => {
    const pathString = doc.path || '';
    const cleanPath = pathString.replace(/\\/g, '/');

    let fileExt = doc.format || cleanPath.split('.').pop()?.toLowerCase() || '';

    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(fileExt)) {
      if (fileExt.includes('pdf') || doc.name?.toLowerCase().endsWith('.pdf')) {
        fileExt = 'pdf';
      } else {
        fileExt = 'png';
      }
    }

    setPreviewDoc({
      ...doc,
      url: getImageUrl(cleanPath),
      format: fileExt,
      name: doc.name
    });
    setZoomLevel(0.8);
    setRotationAngle(0);
  };

  const handleRejectChoice = async (applicant) => {
    if (applicant.isReassigned) {
      setConfirmActionModal({
        isOpen: true,
        message: "Are you sure you want to permanently reject this applicant? This is their final reassigned program. They will be completely removed from the system.",
        onConfirm: async () => {
          try {
            const res = await api.put(`/admin/applicant/${applicant._id || applicant.id}/reject-choice`);
            toast.success(res.data.message || "Applicant permanently removed.");
            setIsModalOpen(false);
            setApplicants(prev => prev.filter(a => (a._id || a.id) !== (applicant._id || applicant.id)));
          } catch (err) {
            console.error("Failed to permanently reject:", err);
            toast.error(err.response?.data?.detail || "Failed to reject applicant.");
          }
        }
      });
      return;
    }

    if (applicant.isRejectedFirstChoice) {
      // 2nd choice rejection: prompt to reassign program
      setIsReassignModalOpen(true);
      return;
    }

    setConfirmActionModal({
      isOpen: true,
      message: "Are you sure you want to reject this applicant? They will be removed from your list and fall back to their second choice program.",
      onConfirm: async () => {
        try {
          const res = await api.put(`/admin/applicant/${applicant._id || applicant.id}/reject-choice`);
          toast.success(res.data.message || "Applicant rejected successfully.");
          setIsModalOpen(false);
          setApplicants(prev => prev.filter(a => (a._id || a.id) !== (applicant._id || applicant.id)));
        } catch (err) {
          console.error("Failed to reject applicant:", err);
          toast.error(err.response?.data?.detail || "Failed to reject applicant.");
        }
      }
    });
  };

  const handleSubmitReassign = async () => {
    if (!reassignProgram) {
      toast.error("Please select a new program.");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await api.put(`/admin/applicant/${selectedApplicant._id || selectedApplicant.id}/reassign-program`, {
        newProgram: reassignProgram
      });
      toast.success(res.data.message || "Applicant reassigned successfully.");
      setIsReassignModalOpen(false);
      setIsModalOpen(false);
      setReassignProgram("");
      setApplicants(prev => prev.filter(a => (a._id || a.id) !== (selectedApplicant._id || selectedApplicant.id)));
    } catch (err) {
      console.error("Failed to reassign applicant:", err);
      toast.error(err.response?.data?.detail || "Failed to reassign applicant.");
    } finally {
      setIsProcessing(false);
    }
  };

  const executeAcceptApplication = async (applicant) => {
    const appId = applicant._id || applicant.id;
    if (!appId) return;

    try {
      setIsProcessing(true);
      const res = await api.put(`/admin/applicant/${appId}/accept-application`);
      const isWaived = res.data?.isInterviewWaived ?? (applicant.isInterviewWaived === true || applicant.isInterviewWaived === "true");

      if (isWaived) {
        toast.success("Application accepted! Forwarded to Pre-Admission.");
        setApplicants(prev => prev.filter(a => (a._id || a.id) !== appId));
        setSelectedApplicant(null);
        setIsModalOpen(false);
      } else {
        toast.success("Application accepted! Please conduct the interview.");
        const updatedApp = { ...applicant, isApplicationAccepted: true };
        setSelectedApplicant(prev => prev ? ({ ...prev, isApplicationAccepted: true }) : null);
        setApplicants(prev => prev.map(a => (a._id === appId || a.id === appId) ? { ...a, isApplicationAccepted: true } : a));
        setIsModalOpen(false);
        openInterviewModal(updatedApp);
      }
    } catch (err) {
      console.error("Failed to accept application:", err);
      toast.error(err.response?.data?.detail || "Failed to accept application.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAcceptApplication = (applicant) => {
    if (!applicant) return;
    executeAcceptApplication(applicant);
  };

  const openInterviewModal = (applicant) => {
    const safeApplicant = getSafeApplicant(applicant);
    const appId = applicant._id || applicant.id;
    const draft = draftRatings[appId];

    let draftRatingsObj = {};
    let interviewerName = safeApplicant.interviewer?.trim() || currentAdminUsername;
    let scheduleStr = safeApplicant.interviewSchedule;

    if (draft) {
      draftRatingsObj = draft.ratings || draft;
      if (draft.interviewer) interviewerName = draft.interviewer;
      if (draft.interviewSchedule) scheduleStr = draft.interviewSchedule;
    } else {
      draftRatingsObj = applicant.interviewRatings || {};
    }

    setSelectedApplicant({
      ...safeApplicant,
      interviewer: interviewerName,
      interviewSchedule: scheduleStr
    });
    setInterviewRatings(draftRatingsObj);
    setIsInterviewModalOpen(true);
  };

  const handleRatingChange = (id, value) => {
    if (isArchiveMode || userRole === "SuperAdmin") return;

    if (value === "") {
      setInterviewRatings(prev => ({ ...prev, [id]: "" }));
      return;
    }

    const cleanValue = value.replace(/\D/g, "");
    if (cleanValue === "") return;

    const num = parseInt(cleanValue, 10);
    if (num >= 0 && num <= 100) {
      setInterviewRatings(prev => ({ ...prev, [id]: num.toString() }));
    }
  };

  const getWeightedScore = (rating, weight) => { const r = parseFloat(rating); if (isNaN(r)) return 0; return (r * (weight / 100)); };
  const getSectionTotal = (section) => { let total = 0; section.criteria.forEach(crit => { total += getWeightedScore(interviewRatings[crit.id], crit.weight); }); return total.toFixed(2); };

  const allCriteria = useMemo(() => {
    const list = [];
    rubricData?.forEach(section => {
      section.criteria?.forEach(crit => {
        list.push(crit);
      });
    });
    return list;
  }, [rubricData]);

  const totalCriteriaCount = allCriteria.length;

  const ratedCriteriaCount = useMemo(() => {
    return allCriteria.filter(crit => {
      const val = interviewRatings[crit.id];
      return val !== undefined && val !== null && val !== "" && !isNaN(Number(val));
    }).length;
  }, [allCriteria, interviewRatings]);

  const totalScore = useMemo(() => {
    let total = 0;
    rubricData.forEach(section => {
      section.criteria.forEach(crit => { total += getWeightedScore(interviewRatings[crit.id], crit.weight); });
    });
    return total.toFixed(2);
  }, [interviewRatings, rubricData]);

  const getRemarks = (scoreVal) => {
    const score = parseFloat(scoreVal);
    if (isNaN(score) || score === 0 || ratedCriteriaCount === 0) return { label: "NO REMARKS", color: "bg-gray-100 text-gray-500 border-gray-300" };
    if (score >= 90) return { label: "EXCELLENT", color: "bg-green-50 text-[#376e35] border-green-300" };
    if (score >= 80) return { label: "VERY GOOD", color: "bg-blue-50 text-blue-800 border-blue-300" };
    if (score >= 70) return { label: "GOOD", color: "bg-teal-50 text-teal-800 border-teal-300" };
    if (score >= 60) return { label: "FAIR", color: "bg-yellow-50 text-yellow-800 border-yellow-300" };
    return { label: "POOR", color: "bg-red-50 text-red-800 border-red-300" };
  };
  const currentRemarks = getRemarks(totalScore);

  const executeSaveInterview = async (interviewerName, scoreVal, newStatus, appId) => {
    setIsProcessing(true);
    try {
      await encodeScore(
        appId,
        scoreVal,
        interviewRatings,
        selectedApplicant.interviewSchedule,
        interviewerName
      );

      setApplicants((prev) => prev.map((app) =>
        (app._id === appId || app.id === appId)
          ? {
            ...app,
            interviewStatus: newStatus,
            interviewRatings: { ...interviewRatings },
            interviewScore: scoreVal,
            isInterviewed: true,
            isApplicationAccepted: true,
            interviewer: interviewerName
          }
          : app
      ));

      setDraftRatings(prev => {
        const newDrafts = { ...prev };
        delete newDrafts[appId];
        return newDrafts;
      });

      setIsInterviewModalOpen(false);
      toast.success("Evaluation successfully saved!");
    } catch (err) {
      console.error("Failed to save interview:", err);
      toast.error(err.response?.data?.detail || "Failed to save interview results.");
    } finally {
      setIsProcessing(false);
    }
  };

  const saveInterview = async () => {
    if (isProcessing) return;

    if (ratedCriteriaCount === 0) {
      toast.warning("Cannot submit evaluation without any scores. Please grade the applicant.");
      return;
    }

    const interviewerName = selectedApplicant.interviewer?.trim();
    if (!interviewerName) {
      toast.warning("Please enter the interviewer name before submitting.");
      return;
    }

    const scoreVal = parseFloat(totalScore);
    const newStatus = scoreVal > 69 ? "Passed" : "Failed";
    const appId = selectedApplicant._id || selectedApplicant.id;
    const isAccepted = !!selectedApplicant?.isApplicationAccepted;

    if (!isAccepted && ratedCriteriaCount < totalCriteriaCount) {
      setConfirmActionModal({
        isOpen: true,
        message: `Grading is not yet finished (${ratedCriteriaCount} of ${totalCriteriaCount} criteria rated), and this applicant has not yet been accepted in application details. Are you sure you want to proceed?`,
        onConfirm: () => {
          setConfirmActionModal({ isOpen: false, message: "", onConfirm: null });
          executeSaveInterview(interviewerName, scoreVal, newStatus, appId);
        }
      });
      return;
    }

    if (ratedCriteriaCount < totalCriteriaCount) {
      setConfirmActionModal({
        isOpen: true,
        message: `Evaluation grading is not yet finished (${ratedCriteriaCount} of ${totalCriteriaCount} criteria rated). Are you sure you want to proceed and submit this evaluation?`,
        onConfirm: () => {
          setConfirmActionModal({ isOpen: false, message: "", onConfirm: null });
          executeSaveInterview(interviewerName, scoreVal, newStatus, appId);
        }
      });
      return;
    }

    if (!isAccepted) {
      setConfirmActionModal({
        isOpen: true,
        message: "This applicant has not yet been accepted in application details yet. Are you sure you want to proceed?",
        onConfirm: () => {
          setConfirmActionModal({ isOpen: false, message: "", onConfirm: null });
          executeSaveInterview(interviewerName, scoreVal, newStatus, appId);
        }
      });
      return;
    }

    await executeSaveInterview(interviewerName, scoreVal, newStatus, appId);
  };

  const formatAddress = (addr) => {
    if (!addr) return "N/A";
    return `${addr.houseStreet} ${addr.barangay}, ${addr.city}, ${addr.province} ${addr.zip || ''}`.toUpperCase();
  };

  const formatFamilyName = (person) => {
    if (!person || person.firstName === 'N/A') return "N/A";
    const middle = person.middleName && person.middleName !== 'N/A' ? person.middleName : '';
    return `${person.firstName} ${middle} ${person.surname}`.replace(/\s+/g, ' ').trim().toUpperCase();
  };

  /* --- RENDER --- */
  const is2ndSemesterActive = activeYear ? activeYear.toLowerCase().includes('2nd semester') : false;

  if (isLoading && applicants.length === 0) {
    return <PageLoader message="Loading applications..." />;
  }

  return (
    <div className={`h-screen w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? 'ml-2' : 'ml-2'
      }`}>

      <main className="flex-1 flex flex-col px-6 py-4 w-full h-full relative">

        {/* --- MAIN HEADER & FILTERS --- */}
        <div className="shrink-0">
          <div className="flex justify-between items-start mb-4">
            <div className="w-full">
              

              {isArchiveMode && (
                <div className="mt-4 mb-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex justify-between items-center">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-amber-500">⚠</span>
                    Archive mode — viewing read-only data for A.Y. {activeYear}
                  </div>
                  <button onClick={exitArchiveMode} className="text-xs font-semibold bg-amber-600 text-white px-3 py-1.5 rounded-md hover:bg-amber-700 transition">
                    Return to Live
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4 items-start md:items-center">
            {/* SEARCH */}
            <div className="relative w-full md:w-auto">
              <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-800" />
              <input
                type="text"
                placeholder="Search applicant name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 text-[14px] rounded-lg bg-white border border-gray-100 w-[300px] outline-none shadow-sm"
              />
            </div>

            {/* FILTER */}
            <div className="relative w-full md:w-auto" ref={filterRef} onMouseLeave={() => setShowFilter(false)}>
              <button
                onClick={() => setShowFilter((v) => !v)}
                className="bg-white px-[14px] py-[6px] rounded-lg shadow flex items-center gap-2 font-semibold"
              >
                <FaFilter /> Filter
              </button>
              {showFilter && (
                <div className="absolute left-0 top-full pt-2 z-30">
                  <div className="bg-white border rounded shadow-xl p-4 w-60 max-h-[70vh] overflow-y-auto">
                    <label className="block text-[12px] font-bold mb-1 uppercase tracking-tight">Program</label>
                    <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-[12px] outline-none">
                      <option value="All">All Programs</option>
                      {coursesList.filter(c => (c.institute || "").toUpperCase() === "IITI" || c.abbreviation === "BSIT" || c.name?.toLowerCase().includes("information technology")).map(c => (
                        <option key={c._id} value={c.abbreviation}>{c.abbreviation}</option>
                      ))}
                    </select>

                    <label className="block text-[12px] font-bold mb-1 uppercase tracking-tight">Interview Schedule</label>
                    <select value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-[12px] outline-none">
                      <option value="">All Schedules</option>
                      <option value="today">Today</option>
                      <option value="tomorrow">Tomorrow</option>
                    </select>

                    <label className="block text-[12px] font-bold mb-1 uppercase tracking-tight">Remarks</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-[12px] outline-none">
                      <option value="">All Statuses</option>
                      <option value="For Interview">For Interview</option>
                      <option value="For Docs Submission">For Docs Submission</option>
                      <option value="Passed">Passed</option>
                      <option value="Failed">Failed</option>
                    </select>

                    <label className="block text-[12px] font-bold mb-1 uppercase tracking-tight">Applicant Type</label>
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-[12px] outline-none">
                      <option value="">All Types</option>
                      <option value="SHS GRADUATE">Senior High School Graduate</option>
                      <option value="TRANSFEREE">Transferee</option>
                      <option value="ALS">ALS</option>
                    </select>

                    <label className="block text-[12px] font-bold mb-1 uppercase tracking-tight">Location</label>
                    <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-[12px] outline-none">
                      <option value="">All Locations</option>
                      {uniqueLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>

                    <div className="flex justify-between">
                      <button onClick={() => setShowFilter(false)} className="px-3 py-1 bg-[#376e35] text-white rounded text-xs font-bold">Apply</button>
                      <button onClick={() => {
                        setCourseFilter("All"); setInstituteFilter("All"); setTypeFilter(""); setLocationFilter(""); setStatusFilter("");
                        setScheduleFilter(""); setSortOrder("newest"); setSearchQuery("");
                      }} className="px-3 py-1 bg-gray-100 rounded text-xs font-bold">Clear</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div className="md:ml-auto flex flex-wrap gap-3 z-[45]">
              {(userRole === "SuperAdmin" || userRole === "Admin") && (
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2 font-[600] hover:bg-gray-50 transition"
                  >
                    <FaFileDownload size={14} /> Export <FaChevronDown size={10} className={`ml-1 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isExportMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-50 overflow-hidden">
                      <button onClick={exportToExcel} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                        Export to Excel (.xlsx)
                      </button>

                      <button onClick={() => exportFormsToPDF()} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                        Export PDF (All Forms)
                      </button>
                    </div>
                  )}
                </div>
              )}

              {userRole === "SuperAdmin" && (
                <button
                  onClick={isArchiveMode ? undefined : openRubricEditor}
                  disabled={isArchiveMode}
                  className={`px-[14px] py-[6px] rounded-md shadow-sm flex items-center gap-2 font-black transition ${isArchiveMode
                    ? 'bg-gray-400 text-white opacity-60 cursor-not-allowed'
                    : 'bg-blue-800 text-white hover:bg-blue-700'
                    }`}
                >
                  <FaEdit size={14} /> Edit Rubric
                </button>
              )}

              {(userRole === "SuperAdmin" || userRole === "Admin") && (
                <button
                  onClick={isArchiveMode ? undefined : openAddModal}
                  disabled={isArchiveMode}
                  className={`px-[14px] py-[6px] rounded-md shadow-sm flex items-center gap-2 font-black transition ${isArchiveMode
                    ? 'bg-gray-400 text-white opacity-60 cursor-not-allowed'
                    : 'bg-[#376e35] text-white hover:bg-[#5c9c5a]'
                    }`}
                >
                  <FaPlus size={14} /> Add Applicant
                </button>
              )}
            </div>
          </div>
        </div>

        {/* --- APPLICANTS TABLE CONTAINER --- */}
        <div className="flex-1 relative bg-white rounded-sm shadow overflow-hidden mt-2">
          <div className="absolute inset-0 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#E4F6E2] text-[#2e522a] border-b border-gray-200 sticky top-0 z-20">
                <tr className="text-xs uppercase tracking-wide h-11">
                  <th className="px-4 py-3 text-left text-[11px] font-bold">ID</th>
                  <th
                    onClick={() => { setNameSortOrder(prev => prev === "A-Z" ? "Z-A" : "A-Z"); setActiveSortType("name"); }}
                    className="px-4 py-3 text-left text-[11px] font-bold whitespace-nowrap cursor-pointer select-none hover:bg-[#d5ebd3] transition-colors"
                    title="Click to sort by name (A-Z / Z-A)"
                  >
                    <div className="relative inline-block pr-1">
                      <div className="flex items-center gap-1">
                        <span>Applicant Name</span>
                        {nameSortOrder === "A-Z" ? (
                          <span className="text-[10px] font-black text-[#2e522a]">▲</span>
                        ) : (
                          <span className="text-[10px] font-black text-[#2e522a]">▼</span>
                        )}
                        <span className="ml-0.5 bg-white text-[#2e522a] rounded-full h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center text-[10px] font-bold leading-none border border-gray-200" title="Total Applicants">
                          {filteredApplicants.length}
                        </span>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold">Type</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold">Program</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold">Location</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold">Date Applied</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold">Remarks</th>
                  <th className="px-4 py-3 text-center text-[11px] font-bold">Action</th>
                  {!isArchiveMode && userRole === "Admin" && (
                    <th className="px-4 py-3 pr-6 text-center w-16 relative overflow-visible">
                      <CustomCheckbox
                        checked={isSelectAllChecked}
                        onChange={handleSelectAll}
                        disabled={isProcessing}
                      />
                      {activePopover === 'all' && selectedApplicantIds.length > 0 && (
                        <div className="absolute right-[3.5rem] top-1/2 -translate-y-1/2 mr-1 bg-white border border-[#3a7538] rounded shadow-xl z-[60] flex text-black text-[10px] font-black tracking-wide whitespace-nowrap overflow-hidden">
                          <button onClick={() => triggerConfirmModal('Passed')} className="px-3 py-1.5 hover:bg-gray-100 border-r border-gray-200 transition-colors">PASS ALL</button>
                          <button onClick={() => triggerConfirmModal('Failed')} className="px-3 py-1.5 hover:bg-gray-100 transition-colors">FAIL ALL</button>
                        </div>
                      )}
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={getColSpan()} className="py-16">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#376e35]"></div>
                        <span className="text-gray-500 font-medium">Loading applicants...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredApplicants.map((a, index) => {
                  const isNearBottom = index >= filteredApplicants.length - 2 && filteredApplicants.length > 2;

                  return (
                    <tr key={`${a._id || a.id}-${index}`} className={`hover:bg-gray-50 transition-colors ${selectedApplicantIds.includes(a._id || a.id) ? 'bg-green-50/30' : ''}`}>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-left">{a.id}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-800 text-left">{a.name}</td>
                      <td className="px-[14px] py-[6px] text-[12px] uppercase text-gray-600 text-left">{a.type}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-800 text-left">{getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList)}</td>
                      <td className="px-[14px] py-[6px] text-[12px] uppercase text-gray-600 text-left">{getApplicantCityOrTown(a, a)}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-center">{a.date}</td>
                      <td className="px-[14px] py-[6px] text-center">
                        <span className={`px-2 py-1.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border 
                        ${a.status === 'Passed' ? 'bg-green-100 text-[#376e35] border-green-200' :
                            a.status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200' :
                              (a.status === 'For Docs Submission' || a.status === 'For Document Submission') ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-[14px] py-[6px] text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setSelectedApplicant(getSafeApplicant(a)); setIsModalOpen(true); }}
                            className="group relative flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg transition-all shadow-sm"
                            title="Applicant Details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openInterviewModal(a)}
                            className="group relative flex items-center justify-center w-7 h-7 bg-yellow-50 hover:bg-yellow-100 text-orange-500 border border-yellow-200 rounded-lg transition-all shadow-sm"
                            title={a.isInterviewWaived ? "Document Submission / Notes" : "Interview"}
                          >
                            <MessageSquare size={14} />
                          </button>
                        </div>
                      </td>

                      {!isArchiveMode && userRole === "Admin" && (
                        <td className="px-[14px] py-[6px] pr-6 text-center relative overflow-visible">
                          <CustomCheckbox
                            checked={selectedApplicantIds.includes(a._id || a.id)}
                            onChange={() => handleSelectApplicant(a._id || a.id)}
                            disabled={isProcessing}
                          />

                          {activePopover === (a._id || a.id) && selectedApplicantIds.includes(a._id || a.id) && (
                            <div className={`absolute right-[3.5rem] z-[60] mr-1 bg-white border border-[#3a7538] rounded shadow-xl flex text-black text-[10px] font-black tracking-wide whitespace-nowrap overflow-hidden ${isNearBottom ? 'bottom-2' : 'top-2'}`}>
                              <button onClick={() => triggerConfirmModal('Passed')} className="px-3 py-1.5 hover:bg-gray-100 border-r border-gray-200 transition-colors">PASS</button>
                              <button onClick={() => triggerConfirmModal('Failed')} className="px-3 py-1.5 hover:bg-gray-100 transition-colors">FAIL</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {(!isLoading && filteredApplicants.length === 0) && (
                  <tr><td colSpan={getColSpan()} className="text-center py-8 text-gray-500">No applicants found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* --- ADD APPLICANT MODAL --- */}
      {isAddModalOpen && newApplicant && !isArchiveMode && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">{isEditMode ? "Edit Applicant" : "Add New Applicant"}</h3>
              </div>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsAddModalOpen(false)}>&times;</button>
            </div>

            <div className="p-8 overflow-y-auto bg-gray-50 space-y-8 flex-1">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Application Details" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Applicant Type<span className="text-red-500 ml-1 text-[12px] leading-none">*</span></label>
                    <select
                      value={newApplicant.profile.appDetails.applicantType}
                      onChange={(e) => updateNewApplicant('profile.appDetails.applicantType', e.target.value)}
                      className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm outline-none focus:border-[#3a7538]"
                    >
                      <option value="SELECT APPLICANT TYPE">SELECT APPLICANT TYPE</option>
                      <option value="SHS GRADUATE">SHS GRADUATE</option>
                      <option value="TRANSFEREE">TRANSFEREE</option>
                      <option value="ALS">ALS</option>
                    </select>
                  </div>
                  <SelectFormField required label="First Choice Program" value={newApplicant.profile.appDetails.firstChoice} onChange={e => updateNewApplicant('profile.appDetails.firstChoice', e.target.value)} options={coursesList} />
                  <SelectFormField required label="Second Choice Program" value={newApplicant.profile.appDetails.secondChoice} onChange={e => updateNewApplicant('profile.appDetails.secondChoice', e.target.value)} options={coursesList} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Personal Information" />
                <div className="flex flex-col lg:flex-row gap-8">

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <InputFormField required label="First Name" value={newApplicant.profile.personal.firstName} onChange={e => updateNewApplicant('profile.personal.firstName', e.target.value)} />
                    <InputFormField label="Middle Name" value={newApplicant.profile.personal.middleName} onChange={e => updateNewApplicant('profile.personal.middleName', e.target.value)} />
                    <InputFormField required label="Surname" value={newApplicant.profile.personal.surname} onChange={e => updateNewApplicant('profile.personal.surname', e.target.value)} />
                    <InputFormField label="Suffix" value={newApplicant.profile.personal.extension} onChange={e => updateNewApplicant('profile.personal.extension', e.target.value)} />

                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Date of Birth<span className="text-red-500 ml-1 text-[12px] leading-none">*</span></label>
                      <CustomDatePicker required value={newApplicant.profile.personal.dob} onChange={val => updateNewApplicant('profile.personal.dob', val)} />
                    </div>

                    <InputFormField label="Place of Birth" value={newApplicant.profile.personal.pob} onChange={e => updateNewApplicant('profile.personal.pob', e.target.value)} />

                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Gender</label>
                      <select value={newApplicant.profile.personal.sex} onChange={e => updateNewApplicant('profile.personal.sex', e.target.value)} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm outline-none">
                        <option value="MALE">MALE</option>
                        <option value="FEMALE">FEMALE</option>
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Civil Status<span className="text-red-500 ml-1 text-[12px] leading-none">*</span></label>
                      <select value={newApplicant.profile.personal.civilStatus} onChange={e => updateNewApplicant('profile.personal.civilStatus', e.target.value)} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm outline-none">
                        <option value="SINGLE">SINGLE</option>
                        <option value="MARRIED">MARRIED</option>
                      </select>
                    </div>

                    {newApplicant.profile.personal.civilStatus === 'MARRIED' && (
                      <InputFormField
                        label="Name of Spouse"
                        value={newApplicant.profile.personal.spouseName}
                        onChange={e => updateNewApplicant('profile.personal.spouseName', e.target.value)}
                      />
                    )}

                    <InputFormField required label="Citizenship" value={newApplicant.profile.personal.citizenship} onChange={e => updateNewApplicant('profile.personal.citizenship', e.target.value)} />
                    <InputFormField label="Religion" value={newApplicant.profile.personal.religion} onChange={e => updateNewApplicant('profile.personal.religion', e.target.value)} />

                    <InputFormField required label="Email Address" type="email" value={newApplicant.profile.personal.email} onChange={e => updateNewApplicant('profile.personal.email', e.target.value)} />
                    <InputFormField required label="Contact Number" value={newApplicant.profile.personal.contact} onChange={e => updateNewApplicant('profile.personal.contact', e.target.value.replace(/\D/g, '').slice(0, 11))} />

                    <AddressDropdowns
                      label="Permanent Address"
                      addressData={newApplicant.profile.personal.permAddress}
                      onChange={(field, value) => updateNewApplicant(`profile.personal.permAddress.${field}`, value)}
                    />

                    <AddressDropdowns
                      label="Present Address"
                      addressData={newApplicant.profile.personal.presAddress}
                      onChange={(field, value) => updateNewApplicant(`profile.personal.presAddress.${field}`, value)}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Family Information" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-3 grid grid-cols-1 gap-2">
                    <InputFormField label="Father's Name" value={newApplicant.profile.family.father.firstName} onChange={e => updateNewApplicant('profile.family.father.firstName', e.target.value)} />
                  </div>
                  <div className="md:col-span-1">
                    <InputFormField label="Contact" maxLength={11} value={newApplicant.profile.family.father.contact} onChange={e => updateNewApplicant('profile.family.father.contact', e.target.value.replace(/\D/g, '').slice(0, 11))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-3 grid grid-cols-1 gap-2">
                    <InputFormField label="Mother's Name" value={newApplicant.profile.family.mother.firstName} onChange={e => updateNewApplicant('profile.family.mother.firstName', e.target.value)} />
                  </div>
                  <div className="md:col-span-1">
                    <InputFormField label="Contact" maxLength={11} value={newApplicant.profile.family.mother.contact} onChange={e => updateNewApplicant('profile.family.mother.contact', e.target.value.replace(/\D/g, '').slice(0, 11))} />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Educational Background" />
                {(() => {
                  const currentAppType = String(newApplicant.profile?.appDetails?.applicantType || '').toUpperCase();
                  const isShsApp = currentAppType.includes('SHS') || currentAppType.includes('FRESHMEN') || currentAppType.includes('SENIOR HIGH') || currentAppType === 'SELECT APPLICANT TYPE';
                  return [
                    { title: "Elementary", key: "elem" },
                    { title: "Junior High School", key: "jhs" },
                    { title: "Senior High School", key: "shs" },
                    { title: "Tertiary/ALS", key: "tertiary" }
                  ].map((level) => {
                    const isLevelReq = isShsApp ? (level.key === 'shs') : (level.key === 'tertiary');
                    return (
                      <div key={level.key} className="mb-4 last:mb-0">
                        <div className="text-[12px] font-black text-[#376e35] uppercase mb-2">{level.title}</div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <InputFormField required={isLevelReq} className={(level.key === 'shs' || level.key === 'tertiary') ? "md:col-span-4" : "md:col-span-5"} label="School Name" value={newApplicant.profile.education[level.key].name} onChange={e => updateNewApplicant(`profile.education.${level.key}.name`, e.target.value)} />
                          <InputFormField className={(level.key === 'shs' || level.key === 'tertiary') ? "md:col-span-4" : "md:col-span-5"} label="School Address" value={newApplicant.profile.education[level.key].address} onChange={e => updateNewApplicant(`profile.education.${level.key}.address`, e.target.value)} />
                          <InputFormField required={isLevelReq} className="md:col-span-2" label="Year Graduated" value={newApplicant.profile.education[level.key].year} onChange={e => updateNewApplicant(`profile.education.${level.key}.year`, e.target.value.replace(/\D/g, '').slice(0, 4))} />
                          {level.key === 'shs' && (
                            <InputFormField required={isShsApp} className="md:col-span-2" label="Grade 11 GWA" value={newApplicant.profile.education.shs.grade11Gwa || newApplicant.profile.education.shs.gwa} onChange={e => updateNewApplicant('profile.education.shs.grade11Gwa', e.target.value.replace(/[^0-9.]/g, ''))} />
                          )}
                          {level.key === 'shs' && is2ndSemesterActive && (
                            <InputFormField className="md:col-span-2" label="Grade 12 GWA" value={newApplicant.profile.education.shs.grade12Gwa} onChange={e => updateNewApplicant('profile.education.shs.grade12Gwa', e.target.value.replace(/[^0-9.]/g, ''))} />
                          )}
                          {level.key === 'shs' && (
                            <>
                              <InputFormField className={is2ndSemesterActive ? "md:col-span-5" : "md:col-span-6"} label="Track" value={newApplicant.profile.education.shs.track} onChange={e => updateNewApplicant('profile.education.shs.track', e.target.value)} />
                              <InputFormField className={is2ndSemesterActive ? "md:col-span-5" : "md:col-span-6"} label="Strand/Electives" value={newApplicant.profile.education.shs.strand} onChange={e => updateNewApplicant('profile.education.shs.strand', e.target.value)} />
                            </>
                          )}
                          {level.key === 'tertiary' && (
                            <InputFormField required={!isShsApp} className="md:col-span-2" label="Latest GWA" value={newApplicant.profile.education.tertiary.latestGwa} onChange={e => updateNewApplicant('profile.education.tertiary.latestGwa', e.target.value.replace(/[^0-9.]/g, ''))} />
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Other Information" />
                <div className="space-y-4">
                  {[
                    { label: 'I have a disability', key: 'isPwd', detailsKey: 'pwdDetails' },
                    { label: 'I am part of an indigenous group', key: 'isIndigenous', detailsKey: 'indigenousDetails' },
                    { label: 'I am a solo parent/ child of a solo parent', key: 'isSoloParent', detailsKey: 'soloParentDetails' },
                    { label: 'I am a member of Pantawid Pamilyang Pilipino Course (4Ps)', key: 'is4Ps', detailsKey: 'fourPsDetails' }
                  ].map((item) => (
                    <div key={item.key} className="flex flex-row items-center gap-3">
                      <div
                        className="flex items-center gap-3 p-1 m-0 rounded-lg cursor-pointer w-max"
                        onClick={() => updateNewApplicant(`profile.otherInfo.${item.key}`, !newApplicant.profile.otherInfo[item.key])}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${newApplicant.profile.otherInfo[item.key] ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-400 bg-white hover:border-blue-400'}`}>
                          {newApplicant.profile.otherInfo[item.key] && <CheckCircle size={14} />}
                        </div>
                        <span className="text-xs font-bold text-gray-700 uppercase select-none whitespace-nowrap">{item.label}</span>
                      </div>
                      {newApplicant.profile.otherInfo[item.key] && (item.key === 'isPwd' || item.key === 'isIndigenous') && (
                        <div className="flex-1 max-w-sm">
                          <InputFormField
                            placeholder="Please specify..."
                            value={newApplicant.profile.otherInfo[item.detailsKey]}
                            onChange={e => updateNewApplicant(`profile.otherInfo.${item.detailsKey}`, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="bg-gray-50 border-t border-gray-300 p-4 shrink-0 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={saveNewApplicant}
                className="px-8 py-2 rounded bg-[#2e522a] hover:bg-[#203a1d] text-white font-bold uppercase text-[12px] transition shadow flex items-center gap-2"
              >
                {isEditMode ? "Update Applicant" : "Save Applicant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW APPLICANT MODAL --- */}
      {isModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[1000] flex items-start justify-center pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden">

            <div className="flex flex-wrap items-center justify-between gap-3 bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">Applicant Details</h3>
                <span className=" px-3 py-1 bg-gray-100 rounded text-xs font-mono text-gray-600">{selectedApplicant.id}</span>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 ml-auto">
                {getDocsSubmissionHeaderSchedule(selectedApplicant) && (
                  <span className="text-xs sm:text-[13px] font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded border border-gray-300">
                    {getDocsSubmissionHeaderSchedule(selectedApplicant)}
                  </span>
                )}
                <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none ml-2" onClick={() => setIsModalOpen(false)}>&times;</button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto bg-gray-50 space-y-8 flex-1">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Application Details" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {isInlineEditMode ? (
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Applicant Type</label>
                      <select value={newApplicant?.profile?.appDetails?.applicantType || ""} onChange={(e) => handleInlineChange("appDetails", null, "applicantType", e.target.value)} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm outline-none uppercase">
                        <option value="SELECT APPLICANT TYPE" disabled hidden>SELECT APPLICANT TYPE</option>
                        <option value="SHS GRADUATE">SHS GRADUATE</option>
                        <option value="TRANSFEREE">TRANSFEREE</option>
                        <option value="ALS">ALS</option>
                      </select>
                    </div>
                  ) : (
                    <FormField label="Applicant Type" value={selectedApplicant.profile.appDetails.applicantType} isEditMode={false} />
                  )}
                  <FormField label="Academic Year & Semester" value={selectedApplicant.schoolYear || "N/A"} isEditMode={false} />
                  {(selectedApplicant?.isRejectedFirstChoice || selectedApplicant?.isReassigned) ? (
                    isInlineEditMode ? (
                      <SelectFormField label="Program" value={selectedApplicant?.isReassigned ? (newApplicant?.profile?.appDetails?.firstChoice || "") : (newApplicant?.profile?.appDetails?.secondChoice || "")} onChange={(e) => handleInlineChange("appDetails", null, selectedApplicant?.isReassigned ? "firstChoice" : "secondChoice", e.target.value)} options={coursesList} />
                    ) : (
                      <FormField label="Program" value={selectedApplicant?.isReassigned ? (selectedApplicant.profile.appDetails.firstChoice?.split(" - ")[0].trim() || "") : (selectedApplicant.profile.appDetails.secondChoice?.split(" - ")[0].trim() || "")} isEditMode={false} />
                    )
                  ) : (
                    isInlineEditMode ? (
                      <>
                        <SelectFormField label="First Choice Program" value={newApplicant?.profile?.appDetails?.firstChoice || ""} onChange={(e) => handleInlineChange("appDetails", null, "firstChoice", e.target.value)} options={coursesList} />
                        <SelectFormField label="Second Choice Program" value={newApplicant?.profile?.appDetails?.secondChoice || ""} onChange={(e) => handleInlineChange("appDetails", null, "secondChoice", e.target.value)} options={coursesList} />
                      </>
                    ) : (
                      <>
                        <FormField label="First Choice Program" value={selectedApplicant.profile.appDetails.firstChoice?.split(" - ")[0].trim() || ""} isEditMode={false} />
                        <FormField label="Second Choice Program" value={selectedApplicant.profile.appDetails.secondChoice?.split(" - ")[0].trim() || ""} isEditMode={false} />
                      </>
                    )
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Personal Information" />
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="shrink-0 flex flex-col">
                    <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Applicant Picture</label>
                    <div className="w-48 h-48 bg-white border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center overflow-hidden">
                      {selectedApplicant.profile.personal.image ? (
                        <img
                          src={getImageUrl(selectedApplicant.profile.personal.image)}
                          alt="Profile"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' viewBox='0 0 150 150'><rect width='100%'' height='100%'' fill='%23e5e7eb'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-family='sans-serif' font-size='12'>NO IMAGE</text></svg>";
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center text-gray-400">
                          <FaEye size={32} />
                          <span className="text-[10px] font-bold mt-2">NO IMAGE</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormField label="First Name" value={selectedApplicant.profile.personal.firstName} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.firstName || ""} onChange={(e) => handleInlineChange("personal", null, "firstName", e.target.value)} />
                    <FormField label="Middle Name" value={selectedApplicant.profile.personal.middleName} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.middleName || ""} onChange={(e) => handleInlineChange("personal", null, "middleName", e.target.value)} />
                    <FormField label="Surname" value={selectedApplicant.profile.personal.surname} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.surname || ""} onChange={(e) => handleInlineChange("personal", null, "surname", e.target.value)} />
                    <FormField label="Suffix" value={selectedApplicant.profile.personal.extension} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.extension || ""} onChange={(e) => handleInlineChange("personal", null, "extension", e.target.value)} />
                    {isInlineEditMode ? (
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Date of Birth</label>
                        <CustomDatePicker value={newApplicant?.profile?.personal?.dob || ""} onChange={(val) => handleInlineChange("personal", null, "dob", val)} />
                      </div>
                    ) : (
                      <FormField label="Date of Birth" value={selectedApplicant.profile.personal.dob} isEditMode={false} />
                    )}
                    <FormField label="Place of Birth" value={selectedApplicant.profile.personal.pob} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.pob || ""} onChange={(e) => handleInlineChange("personal", null, "pob", e.target.value)} />
                    {isInlineEditMode ? (
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Gender</label>
                        <select value={newApplicant?.profile?.personal?.sex || ""} onChange={(e) => handleInlineChange("personal", null, "sex", e.target.value)} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm outline-none uppercase">
                          <option value="MALE">MALE</option>
                          <option value="FEMALE">FEMALE</option>
                        </select>
                      </div>
                    ) : (
                      <FormField label="Gender" value={selectedApplicant.profile.personal.sex} isEditMode={false} />
                    )}
                    {isInlineEditMode ? (
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">Civil Status</label>
                        <select value={newApplicant?.profile?.personal?.civilStatus || ""} onChange={(e) => handleInlineChange("personal", null, "civilStatus", e.target.value)} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm outline-none uppercase">
                          <option value="SINGLE">SINGLE</option>
                          <option value="MARRIED">MARRIED</option>
                        </select>
                      </div>
                    ) : (
                      <FormField label="Civil Status" value={selectedApplicant.profile.personal.civilStatus} isEditMode={false} />
                    )}

                    {selectedApplicant.profile.personal.civilStatus === 'MARRIED' && (
                      <FormField label="Name of Spouse" value={selectedApplicant.profile.personal.spouseName} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.spouseName || ""} onChange={(e) => handleInlineChange("personal", null, "spouseName", e.target.value)} />
                    )}

                    <FormField label="Email Address" value={selectedApplicant.profile.personal.email} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.email || ""} onChange={(e) => handleInlineChange("personal", null, "email", e.target.value)} />
                    <FormField label="Contact Number" value={selectedApplicant.profile.personal.contact} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.contact || ""} onChange={(e) => handleInlineChange("personal", null, "contact", e.target.value.replace(/\D/g, '').slice(0, 11))} />
                    <div className="md:col-span-2 lg:col-span-4">
                      {isInlineEditMode ? (
                        <AddressDropdowns
                          label="Permanent Address"
                          addressData={newApplicant?.profile?.personal?.permAddress || {}}
                          onChange={(field, value) => handleInlineChange("personal", "permAddress", field, value)}
                        />
                      ) : (
                        <FormField label="Permanent Address" value={formatAddress(selectedApplicant.profile.personal.permAddress)} />
                      )}
                    </div>
                    <div className="md:col-span-2 lg:col-span-4">
                      {isInlineEditMode ? (
                        <AddressDropdowns
                          label="Present Address"
                          addressData={newApplicant?.profile?.personal?.presAddress || {}}
                          onChange={(field, value) => handleInlineChange("personal", "presAddress", field, value)}
                        />
                      ) : (
                        <FormField label="Present Address" value={formatAddress(selectedApplicant.profile.personal.presAddress)} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Family Information" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-2">
                    {isInlineEditMode ? (
                      <div className="grid grid-cols-1 gap-2">
                        <InputFormField label="Father's Name" value={newApplicant.profile.family.father.firstName} onChange={(e) => handleInlineChange("family", "father", "firstName", e.target.value)} />
                      </div>
                    ) : (
                      <FormField label="FATHER'S NAME" value={formatFamilyName(selectedApplicant.profile.family.father)} />
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="CONTACT" value={selectedApplicant.profile.family.father.contact} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.family?.father?.contact || ""} onChange={(e) => handleInlineChange("family", "father", "contact", e.target.value.replace(/\D/g, '').slice(0, 11))} maxLength={11} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-2">
                    {isInlineEditMode ? (
                      <div className="grid grid-cols-1 gap-2">
                        <InputFormField label="Mother's Name" value={newApplicant.profile.family.mother.firstName} onChange={(e) => handleInlineChange("family", "mother", "firstName", e.target.value)} />
                      </div>
                    ) : (
                      <FormField label="MOTHER'S MAIDEN NAME" value={formatFamilyName(selectedApplicant.profile.family.mother)} />
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="CONTACT" value={selectedApplicant.profile.family.mother.contact} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.family?.mother?.contact || ""} onChange={(e) => handleInlineChange("family", "mother", "contact", e.target.value.replace(/\D/g, '').slice(0, 11))} maxLength={11} />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Educational Background" />
                {[
                  { title: "Elementary", key: "elem", data: selectedApplicant.profile.education.elem },
                  { title: "Junior High School", key: "jhs", data: selectedApplicant.profile.education.jhs },
                  { title: "Senior High School", key: "shs", data: selectedApplicant.profile.education.shs },
                  { title: "Tertiary/ALS", key: "tertiary", data: selectedApplicant.profile.education.tertiary }
                ].map((level, idx) => (
                  <div key={idx} className="mb-4 last:mb-0">
                    <div className="text-[12px] font-black text-[#376e35] uppercase mb-2">{level.title}</div>
                    <hr className="border-gray-200 mb-4" />
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <FormField className={(level.key === 'shs' || level.key === 'tertiary') ? "md:col-span-4" : "md:col-span-5"} label="School Name" value={level.data.name} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.[level.key]?.name || ""} onChange={(e) => handleInlineChange("education", level.key, "name", e.target.value)} />
                      <FormField className={(level.key === 'shs' || level.key === 'tertiary') ? "md:col-span-4" : "md:col-span-5"} label="School Address" value={level.data.address} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.[level.key]?.address || ""} onChange={(e) => handleInlineChange("education", level.key, "address", e.target.value)} />
                      <FormField className="md:col-span-2" label="Year Graduated" value={level.data.year} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.[level.key]?.year || ""} onChange={(e) => handleInlineChange("education", level.key, "year", e.target.value.replace(/\D/g, '').slice(0, 4))} />
                      {level.key === 'shs' && (
                        <FormField className="md:col-span-2" label="Grade 11 GWA" value={level.data.grade11Gwa || level.data.gwa} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.grade11Gwa || newApplicant?.profile?.education?.shs?.gwa || ""} onChange={(e) => handleInlineChange("education", "shs", "grade11Gwa", e.target.value.replace(/[^0-9.]/g, ''))} />
                      )}
                      {level.key === 'shs' && (is2ndSemesterActive || level.data.grade12Gwa) && (
                        <FormField className="md:col-span-2" label="Grade 12 GWA" value={level.data.grade12Gwa} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.grade12Gwa || ""} onChange={(e) => handleInlineChange("education", "shs", "grade12Gwa", e.target.value.replace(/[^0-9.]/g, ''))} />
                      )}
                      {level.key === 'shs' && (
                        <>
                          <FormField className={(is2ndSemesterActive || level.data.grade12Gwa) ? "md:col-span-5" : "md:col-span-6"} label="Track" value={level.data.track} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.track || ""} onChange={(e) => handleInlineChange("education", "shs", "track", e.target.value)} />
                          <FormField className={(is2ndSemesterActive || level.data.grade12Gwa) ? "md:col-span-5" : "md:col-span-6"} label="Strand/Electives" value={level.data.strand} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.strand || ""} onChange={(e) => handleInlineChange("education", "shs", "strand", e.target.value)} />
                        </>
                      )}
                      {level.key === 'tertiary' && (
                        <FormField className="md:col-span-2" label="Latest GWA" value={level.data.latestGwa} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.tertiary?.latestGwa || ""} onChange={(e) => handleInlineChange("education", "tertiary", "latestGwa", e.target.value.replace(/[^0-9.]/g, ''))} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Other Information" />
                <div className="space-y-4">
                  {[
                    { label: 'I have a disability', key: 'isPwd', detailsKey: 'pwdDetails' },
                    { label: 'I am part of an indigenous group', key: 'isIndigenous', detailsKey: 'indigenousDetails' },
                    { label: 'I am a solo parent/ child of a solo parent', key: 'isSoloParent', detailsKey: 'soloParentDetails' },
                    { label: 'I am a member of Pantawid Pamilyang Pilipino Course (4Ps)', key: 'is4Ps', detailsKey: 'fourPsDetails' }
                  ].map((item) => {
                    const isChecked = isInlineEditMode ? newApplicant?.profile?.otherInfo?.[item.key] : selectedApplicant?.profile?.otherInfo?.[item.key];
                    const detailsValue = isInlineEditMode ? newApplicant?.profile?.otherInfo?.[item.detailsKey] : selectedApplicant?.profile?.otherInfo?.[item.detailsKey];
                    return (
                      <div key={item.key} className="flex flex-row items-center gap-3">
                        <div
                          className={`flex items-center gap-3 p-1 m-0 rounded-lg w-max ${isInlineEditMode ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                          onClick={() => {
                            if (isInlineEditMode) {
                              handleInlineChange("otherInfo", null, item.key, !isChecked);
                            }
                          }}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-[#376e35] border-[#376e35] text-white' : 'border-gray-300 bg-white'
                            }`}>
                            {isChecked && <CheckCircle size={14} />}
                          </div>
                          <span className="text-xs font-bold text-gray-700 uppercase select-none whitespace-nowrap">{item.label}</span>
                        </div>
                        {isChecked && (item.key === 'isPwd' || item.key === 'isIndigenous') && (
                          <div className="flex-1 max-w-sm">
                            {isInlineEditMode ? (
                              <InputFormField
                                placeholder="Please specify..."
                                value={detailsValue || ""}
                                onChange={e => handleInlineChange("otherInfo", null, item.detailsKey, e.target.value)}
                              />
                            ) : (
                              <div className="text-[12px] text-gray-800 border-b border-gray-400 w-full pb-0.5 min-w-[150px]">
                                {detailsValue || ""}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Submitted Documents" />
                {selectedApplicant.profile.documents && selectedApplicant.profile.documents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {selectedApplicant.profile.documents.map((doc, idx) => {
                      const isImage = ['png', 'jpg', 'jpeg'].includes(doc.type.toLowerCase());
                      
                      const cleanDocName = (doc.name || "Document").replace(/\.[^/.]+$/, "");

                      return (
                        <div key={idx} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl shadow-sm bg-gray-50 hover:bg-white transition">
                          <div className="flex items-center overflow-hidden w-full">
                            <div className="w-10 h-[36px] bg-green-100 rounded-lg flex items-center justify-center text-[#376e35] mr-3 shrink-0 overflow-hidden">
                              {isImage ? (
                                <img src={getImageUrl(doc.path)} alt="Thumbnail" className="w-full h-full object-cover" />
                              ) : (
                                <FileText size={20} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="text-[10px] font-black text-gray-800 uppercase leading-tight truncate" title={cleanDocName}>
                                {cleanDocName}
                              </div>
                            </div>
                          </div>
                          <button onClick={() => openPreview(doc)} className="ml-2 shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors" title="View">
                            <FaEye size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-500 italic uppercase">No documents submitted.</p>
                )}
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-300 p-4 shrink-0 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              {isInlineEditMode ? (
                <>
                  <button
                    onClick={() => setIsInlineEditMode(false)}
                    className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const prevEdit = isEditMode;
                      setIsEditMode(true);
                      await saveNewApplicant();
                      setIsEditMode(prevEdit);
                      setIsInlineEditMode(false);
                    }}
                    className="px-8 py-2 rounded bg-[#2e522a] hover:bg-[#203a1d] text-white font-bold uppercase text-[12px] transition shadow flex items-center gap-2"
                  >
                    Update Applicant
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => exportFormsToPDF([selectedApplicant])}
                    className="px-6 py-2 rounded bg-blue-700 hover:bg-blue-600 font-bold uppercase text-[12px] text-white transition flex items-center gap-2 shadow"
                  >
                    <FaPrint />
                  </button>

                  <button
                    onClick={() => setIsMessageModalOpen(true)}
                    className="px-6 py-2 rounded bg-[#eab308] hover:bg-[#ca8a04] font-bold uppercase text-[12px] text-white transition flex items-center gap-2 shadow"
                  >
                    <MessageSquare size={14} />
                  </button>
                  <button
                    onClick={handleEditApplicant}
                    className="px-6 py-2 rounded bg-[#2e522a] hover:bg-[#203a1d] font-bold uppercase text-[12px] text-white transition flex items-center gap-2 shadow"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => {
                      setConfirmActionModal({
                        isOpen: true,
                        message: "Are you sure you want to delete this applicant?",
                        onConfirm: () => {
                          api.delete(`/admin/applicant/${selectedApplicant.rawId || selectedApplicant.id}`)
                            .then(() => {
                              setApplicants(prev => prev.filter(a => a.id !== selectedApplicant.id && a.rawId !== selectedApplicant.rawId));
                              setIsModalOpen(false);
                              toast.success("Applicant deleted successfully.");
                            })
                            .catch(err => toast.error("Failed to delete applicant."));
                        }
                      });
                    }}
                    className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 font-bold uppercase text-[12px] text-white transition flex items-center gap-2 shadow"
                    title="Delete Applicant"
                  >
                    <FaTrash />
                  </button>
                  <div className="flex-1"></div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 rounded bg-gray-400 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
                  >
                    Cancel
                  </button>
                  {((["For Interview"].includes(selectedApplicant.status)) || (selectedApplicant.isReassigned && !["Passed", "Failed"].includes(selectedApplicant.status))) && userRole === "Admin" && (
                    <>
                      <button
                        onClick={() => handleRejectChoice(selectedApplicant)}
                        className="px-8 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[12px] transition shadow flex items-center gap-2"
                      >
                        <X size={14} />
                        Reject
                      </button>
                      <button
                        onClick={() => handleAcceptApplication(selectedApplicant)}
                        disabled={isProcessing}
                        className={`px-8 py-2 rounded text-white font-bold uppercase text-[12px] transition shadow flex items-center gap-2 ${
                          isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#376e35] hover:bg-[#3a7538]'
                        }`}
                      >
                        <Check size={14} />
                        Accept
                      </button>
                    </>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- INTERVIEW SCORING MODAL --- */}
      {isInterviewModalOpen && selectedApplicant && (() => {
        const appId = selectedApplicant._id || selectedApplicant.id;
        const hasDraft = !!draftRatings[appId];

        return (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center pt-6">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInterviewModalOpen(false)}></div>
            <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[1280px] w-[96vw] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

              <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">
                    Final Admission Interview Rubric {(isArchiveMode || userRole === "SuperAdmin")}
                  </h3>
                  {hasDraft && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                      <FileText size={11} /> Draft Saved
                    </span>
                  )}
                </div>
                <button onClick={() => setIsInterviewModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none">&times;</button>
              </div>
            <div className="bg-white border-b border-gray-300 px-6 py-2 shrink-0">
              <div className="grid grid-cols-12 gap-4 mt-4 text-[12px]">
                <div className="col-span-8 flex flex-col">
                  <label className="font-bold text-gray-700 uppercase text-xs">Program</label>
                  <div className="border-b border-gray-400 py-1 font-semibold uppercase text-gray-900">{selectedApplicant.profile.appDetails.firstChoice}</div>
                </div>

                <div className="col-span-4 flex flex-col">
                  <label className="font-bold text-gray-700 uppercase text-xs">Interview Date & Session</label>
                  <input
                    type="text"
                    disabled={isArchiveMode || userRole === "SuperAdmin"}
                    value={selectedApplicant.interviewSchedule ? (selectedApplicant.interviewSchedule.includes('Morning') || selectedApplicant.interviewSchedule.includes('Afternoon') || selectedApplicant.interviewSchedule.includes('AM') || selectedApplicant.interviewSchedule.includes('PM') ? selectedApplicant.interviewSchedule : `${selectedApplicant.interviewSchedule}, ${selectedApplicant.profile?.interviewSession === 'Morning' ? 'Morning (8am-12pm)' : selectedApplicant.profile?.interviewSession === 'Afternoon' ? 'Afternoon (1pm-4pm)' : (selectedApplicant.profile?.interviewSession || selectedApplicant.interviewSession || '')}`) : ""}
                    onChange={(e) => setSelectedApplicant(prev => ({ ...prev, interviewSchedule: e.target.value }))}
                    className={`border-b border-gray-400 py-1 font-semibold outline-none focus:border-[#3a7538] bg-transparent w-full transition-colors ${(isArchiveMode || userRole === "SuperAdmin") ? 'text-gray-600 cursor-not-allowed' : 'text-gray-900'}`}
                    placeholder="YYYY-MM-DD, Session [Morning/Afternoon]"
                  />
                </div>

                <div className="col-span-6 flex flex-col">
                  <label className="font-bold text-gray-700 uppercase text-xs">Applicant Name</label>
                  <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">{selectedApplicant.name}</div>
                </div>

                <div className="col-span-6 flex flex-col">
                  <label className="font-bold text-gray-700 uppercase text-xs">Interviewer</label>
                  <input
                    type="text"
                    required
                    disabled={isArchiveMode || userRole === "SuperAdmin"}
                    value={selectedApplicant.interviewer || ""}
                    onChange={(e) => setSelectedApplicant(prev => ({ ...prev, interviewer: e.target.value }))}
                    className={`border-b border-gray-400 py-1 font-semibold outline-none focus:border-[#3a7538] bg-transparent ${(isArchiveMode || userRole === "SuperAdmin") ? 'text-gray-600 cursor-not-allowed' : 'text-gray-900'}`}
                    placeholder="Enter Name"
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="mb-6 border-2 border-black">
                <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 font-bold text-center text-[12px] uppercase">
                  <div className="col-span-2 border-r border-black p-1">Rating</div>
                  <div className="col-span-10 p-1">Professional Description</div>
                </div>
                {[
                  { range: "90-100", label: "Excellent", desc: "Outstanding performance; exceeds the expected readiness for the chosen course." },
                  { range: "80-89", label: "Very Good", desc: "Strong, above-average performance; meets expectations effectively." },
                  { range: "70-79", label: "Good", desc: "Satisfactory performance; meets minimum course standards." },
                  { range: "60-69", label: "Fair", desc: "Needs improvement; partially meets expectations." },
                  { range: "59 Below", label: "Poor", desc: "Does not meet expectations; major weaknesses observed." },
                ].map((row, i) => (
                  <div key={i} className="grid grid-cols-12 border-b border-black last:border-0 text-[12px]">
                    <div className="col-span-2 border-r border-black flex flex-col items-center justify-center p-1 bg-white">
                      <span className="font-bold">{row.range}</span>
                      <span className="text-xs uppercase">{row.label}</span>
                    </div>
                    <div className="col-span-10 p-2 bg-white flex items-center">
                      {row.desc}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                {rubricData.map((section) => (
                  <div key={section.id}>
                    <h4 className="font-bold text-md uppercase mb-1">{section.title}</h4>
                    <table className="w-full border-2 border-black text-[12px] bg-white">
                      <thead className="bg-white text-black uppercase text-xs font-bold border-b-2 border-black">
                        <tr>
                          <th className="border-r border-black p-2 w-1/5 text-left">Criteria</th>
                          <th className="border-r border-black p-2 w-2/5 text-left">Professional Description</th>
                          <th className="border-r border-black p-2 w-20 text-center">Weight (%)</th>
                          <th className="border-r border-black p-2 w-20 text-center">Rating (1-100)</th>
                          <th className="p-2 w-24 text-center">Weighted Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.criteria.map((crit) => (
                          <tr key={crit.id} className="border-b border-black last:border-0">
                            <td className="border-r border-black p-2 font-bold align-top bg-white">{crit.name}</td>
                            <td className="border-r border-black p-2 align-top bg-white">{crit.desc}</td>
                            <td className="border-r border-black p-2 text-center align-middle font-bold bg-white">{crit.weight}%</td>

                            <td
                              className="border-r border-black py-2 text-center align-middle bg-white relative"
                              onMouseLeave={() => setActiveRatingDropdown(null)}
                            >
                              <input
                                type="text"
                                disabled={isArchiveMode || userRole === "SuperAdmin"}
                                inputMode="numeric"
                                maxLength={3}
                                value={interviewRatings[crit.id] !== undefined ? interviewRatings[crit.id] : ""}
                                onChange={(e) => handleRatingChange(crit.id, e.target.value)}
                                onDoubleClick={() => { if (!isArchiveMode && userRole !== "SuperAdmin") setActiveRatingDropdown(crit.id); }}
                                title={(isArchiveMode || userRole === "SuperAdmin") ? "" : "Type a number or double-click for a list"}
                                className={`w-20 text-center font-bold text-[16px] outline-none ${(isArchiveMode || userRole === "SuperAdmin") ? 'bg-transparent text-gray-600 cursor-not-allowed' : 'cursor-text'}`}
                              />

                              {activeRatingDropdown === crit.id && !isArchiveMode && userRole !== "SuperAdmin" && (
                                <div className="absolute top-[80%] left-1/2 -translate-x-1/2 mt-1 w-20 max-h-48 overflow-y-auto bg-white border border-gray-300 shadow-2xl rounded z-[100] flex flex-col">
                                  {Array.from({ length: 101 }, (_, i) => 100 - i).map(num => (
                                    <div
                                      key={num}
                                      onClick={() => {
                                        handleRatingChange(crit.id, num.toString());
                                        setActiveRatingDropdown(null);
                                      }}
                                      className="px-2 py-1.5 hover:bg-[#3a7538] hover:text-white cursor-pointer text-[12px] font-bold text-gray-800 text-center border-b last:border-none border-gray-100 transition-colors"
                                    >
                                      {num}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td className="p-2 text-center align-middle font-black text-[16px] bg-gray-50">
                              {getWeightedScore(interviewRatings[crit.id], crit.weight).toFixed(2) === "0.00" && (interviewRatings[crit.id] === "" || interviewRatings[crit.id] === undefined)
                                ? "-"
                                : getWeightedScore(interviewRatings[crit.id], crit.weight).toFixed(2)
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="bg-gray-100 border-x-2 border-b-2 pr-14 border-black py-1 flex justify-end items-center gap-16">
                      <span className="font-bold text-[15px] uppercase text-gray-800">Total:</span>
                      <span className="font-black text-[16px] text-black">{getSectionTotal(section)}</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div className="bg-white border-t border-gray-300 px-6 py-3.5 shrink-0 flex items-center justify-between gap-6 shadow-sm">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="uppercase text-gray-700 font-bold text-[12px] tracking-wide">General Weighted Average :</span>
                  <span className="text-2xl font-black text-gray-900 tracking-wider">
                    {ratedCriteriaCount === 0 ? "0.00" : totalScore}
                  </span>
                </div>

                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">Remarks:</span>
                  <div className={`px-3 py-1 border rounded text-xs font-black uppercase tracking-wider shadow-sm ${currentRemarks.color}`}>
                    {currentRemarks.label}
                  </div>
                </div>

                <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>

                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">Graded:</span>
                  <div className={`px-3 py-1 border rounded text-xs font-bold uppercase tracking-wider shadow-sm flex items-center ${
                    ratedCriteriaCount === 0
                      ? 'bg-gray-100 text-gray-600 border-gray-300'
                      : ratedCriteriaCount < totalCriteriaCount
                      ? 'bg-amber-50 text-amber-700 border-amber-300'
                      : 'bg-green-50 text-green-700 border-green-300'
                  }`}>
                    {ratedCriteriaCount} / {totalCriteriaCount} Criteria
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => setIsInterviewModalOpen(false)}
                  className="px-6 py-2 rounded bg-gray-700 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition shadow"
                >
                  {(isArchiveMode || userRole === "SuperAdmin") ? "Close" : "Cancel"}
                </button>
                {(!isArchiveMode && userRole === "Admin") && (
                  <button
                    onClick={saveInterview}
                    disabled={isProcessing || ratedCriteriaCount === 0}
                    title={
                      ratedCriteriaCount === 0
                        ? "Please grade at least one criterion before submitting evaluation."
                        : ratedCriteriaCount < totalCriteriaCount
                        ? `Grading is incomplete (${ratedCriteriaCount}/${totalCriteriaCount} criteria rated). Click to proceed with submission.`
                        : "Submit evaluation"
                    }
                    className={`px-7 py-2 rounded text-white font-bold uppercase text-[12px] transition shadow flex items-center gap-2 ${
                      (isProcessing || ratedCriteriaCount === 0)
                        ? 'bg-gray-400 cursor-not-allowed opacity-60'
                        : 'bg-[#376e35] hover:bg-[#2e522a]'
                    }`}
                  >
                    {isProcessing ? 'SAVING...' : 'SUBMIT EVALUATION'}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
        );
      })()}

      {/* --- EDIT RUBRIC MODAL --- */}
      {isRubricEditModalOpen && !isArchiveMode && userRole === "SuperAdmin" && (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsRubricEditModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px] flex items-center gap-3">
                Edit Admission Interview Rubric
              </h3>
              <button onClick={() => setIsRubricEditModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none">&times;</button>
            </div>

            <div className="bg-white border-b border-gray-300 px-6 py-2 shrink-0">
              <div className="flex justify-end mt-4 pb-2">
                <label className="bg-blue-800 hover:bg-blue-700 text-white px-[14px] py-[6px] rounded-lg shadow cursor-pointer flex items-center gap-2 text-[12px] font-bold transition uppercase tracking-wide">
                  <FaUpload />
                  Import CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">

              <div className="mb-6 border-2 border-black opacity-80 pointer-events-none">
                <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 font-bold text-center text-[12px] uppercase">
                  <div className="col-span-2 border-r border-black p-1">Rating</div>
                  <div className="col-span-10 p-1">Professional Description</div>
                </div>
                {[
                  { range: "90-100", label: "Excellent", desc: "Outstanding performance; exceeds the expected readiness for the chosen course." },
                  { range: "80-89", label: "Very Good", desc: "Strong, above-average performance; meets expectations effectively." },
                  { range: "70-79", label: "Good", desc: "Satisfactory performance; meets minimum course standards." },
                  { range: "60-69", label: "Fair", desc: "Needs improvement; partially meets expectations." },
                  { range: "59 Below", label: "Poor", desc: "Does not meet expectations; major weaknesses observed." },
                ].map((row, i) => (
                  <div key={i} className="grid grid-cols-12 border-b border-black last:border-0 text-[12px]">
                    <div className="col-span-2 border-r border-black flex flex-col items-center justify-center p-1 bg-white">
                      <span className="font-bold">{row.range}</span>
                      <span className="text-xs uppercase">{row.label}</span>
                    </div>
                    <div className="col-span-10 p-2 bg-white flex items-center">
                      {row.desc}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-6">
                {tempRubricData.map((section, sIndex) => (
                  <div key={section.id}>
                    <div className="flex items-center gap-3 mb-1">
                      <input
                        value={section.title}
                        onChange={(e) => handleEditSectionTitle(sIndex, e.target.value)}
                        className="font-bold text-md uppercase flex-1 bg-transparent outline-none border-b border-dashed border-gray-400 hover:bg-gray-200 focus:bg-white focus:border-[#3a7538] transition-colors"
                        placeholder="SECTION TITLE"
                      />
                      <button
                        onClick={() => handleRemoveSection(sIndex)}
                        className="text-red-500 hover:text-red-700 transition px-2 py-1 rounded hover:bg-gray-100"
                        title="Remove Entire Section"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>

                    <table className="w-full border-2 border-black text-[12px] bg-white">
                      <thead className="bg-white text-black uppercase text-xs font-bold border-b-2 border-black">
                        <tr>
                          <th className="border-r border-black p-2 w-1/5 text-left">Criteria</th>
                          <th className="border-r border-black p-2 w-2/5 text-left">Professional Description</th>
                          <th className="border-r border-black p-2 w-20 text-center">Weight (%)</th>
                          <th className="border-r border-black p-2 w-20 text-center">Rating (1-100)</th>
                          <th className="p-2 w-24 text-center">Weighted Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.criteria.map((crit, cIndex) => (
                          <tr key={crit.id} className="border-b border-black group">
                            <td className="border-r border-black p-0 align-top bg-white relative">
                              <textarea
                                value={crit.name}
                                onChange={(e) => handleEditCriteria(sIndex, cIndex, 'name', e.target.value)}
                                className="w-full h-full p-2 font-bold resize-none outline-none hover:bg-gray-100 focus:bg-gray-100 transition-colors min-h-[60px]"
                                rows={3}
                              />
                            </td>
                            <td className="border-r border-black p-0 align-top bg-white">
                              <textarea
                                value={crit.desc}
                                onChange={(e) => handleEditCriteria(sIndex, cIndex, 'desc', e.target.value)}
                                className="w-full h-full p-2 resize-none outline-none hover:bg-gray-100 focus:bg-gray-100 transition-colors min-h-[60px]"
                                rows={3}
                              />
                            </td>
                            <td className="border-r border-black p-0 text-center align-middle font-bold bg-white">
                              <input
                                type="number"
                                value={crit.weight}
                                onChange={(e) => handleEditCriteria(sIndex, cIndex, 'weight', e.target.value)}
                                className="w-full text-center p-2 font-bold outline-none hover:bg-gray-100 focus:bg-gray-100 transition-colors"
                              />
                            </td>
                            <td className="border-r border-black py-2 text-center align-middle bg-gray-100">
                              <input disabled className="w-20 text-center font-bold text-[16px] outline-none bg-transparent" placeholder="-" />
                            </td>
                            <td className="p-0 text-center align-middle font-black text-[16px] bg-gray-100 text-gray-400 relative">
                              <span className="group-hover:opacity-0 transition-opacity flex items-center justify-center w-full h-full min-h-[40px]">-</span>
                              <button
                                onClick={() => handleRemoveCriteria(sIndex, cIndex)}
                                className="absolute inset-0 w-full h-full flex items-center justify-center  text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Remove Row"
                              >
                                <FaTrash size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}

                        <tr>
                          <td colSpan={5} className="p-0 bg-gray-50 hover:bg-gray-200 transition-colors cursor-pointer">
                            <button
                              onClick={() => handleAddCriteria(sIndex)}
                              className="w-full py-2 flex justify-center items-center gap-2 text-black hover:text-gray-800 font-bold text-xs uppercase outline-none focus:bg-gray-50"
                            >
                              <FaPlus /> Add Row
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="bg-gray-100 border-x-2 border-b-2 pr-14 border-black py-1 flex justify-end items-center gap-16">
                      <span className="font-bold text-[15px] uppercase text-black">Total Section Weight:</span>
                      <span className="font-black text-[16px] text-black">{getEditSectionTotal(section)}%</span>
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleAddSection}
                  className="w-full py-2 text-[15px] mt-6 border-2 border-gray-400 text-gray-600 font-bold uppercase rounded-lg hover:bg-gray-100 hover:text-gray-800 transition flex justify-center items-center gap-2 shadow-sm"
                >
                  <FaPlus /> Add New Section
                </button>

              </div>

            </div>

            <div className="bg-gray-50 border-t border-gray-400 p-4 shrink-0 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <span className="uppercase text-gray-800 font-bold text-[12px]">General Weighted Total :</span>
                  <span className={`text-3xl font-black tracking-wider ${getEditTotalRubricWeight() === 100 ? 'text-blue-800' : 'text-red-600'}`}>
                    {getEditTotalRubricWeight()}%
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsRubricEditModalOpen(false)}
                  className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRubric}
                  className="px-8 py-2 rounded bg-blue-800 hover:bg-blue-700 text-white font-bold uppercase text-[12px] transition shadow-lg flex items-center gap-2"
                >
                  Save Rubric
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PREVIEW DOCUMENT MODAL --- */}
      {previewDoc && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
            <div className="bg-white text-[#376e35] px-6 py-4 flex justify-between items-center shrink-0 z-10 relative shadow-md">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-bold text-[16px] uppercase tracking-wider">{previewDoc.name}</h3>
                </div>

                {['png', 'jpg', 'jpeg'].includes(previewDoc.format.toLowerCase()) && (
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 ml-6 shadow-inner border ">
                    <button onClick={handleZoomOut} className="p-2 hover:bg-green-400 rounded-md text-[#3a7538] hover:text-green-400 transition-colors active:scale-95" title="Zoom Out">
                      <FaSearchMinus size={14} />
                    </button>
                    <span className="text-xs font-bold w-12 text-center select-none text-[#376e35]">{Math.round(zoomLevel * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-2 hover:bg-green-400 rounded-md text-[#376e35] hover:text-green transition-colors active:scale-95" title="Zoom In">
                      <FaSearchPlus size={14} />
                    </button>
                    <div className="w-px h-4 bg-gray-600 mx-1"></div>
                    <button onClick={handleRotate} className="p-2 hover:bg-green-400 rounded-md text-[#376e35] hover:text-green transition-colors active:scale-95" title="Rotate 90°">
                      <FaRedo size={12} />
                    </button>
                    <button onClick={handleResetZoom} className="px-2 py-1 text-xs hover:bg-green-400 rounded-md text-[#376e35] hover:text-green font-bold transition-colors active:scale-95" title="Reset Zoom">
                      Reset
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="flex-1 bg-gray-100 overflow-auto relative p-4 scroll-smooth flex items-start justify-center">
              {previewDoc.format.toLowerCase() === 'pdf' ? (
                <iframe
                  src={previewDoc.url}
                  className="w-full h-full min-h-[70vh] rounded-lg shadow-lg bg-white border-0 block"
                  title="Document Preview"
                />
              ) : ['png', 'jpg', 'jpeg'].includes(previewDoc.format.toLowerCase()) ? (
                <div className="min-h-full min-w-full flex items-start justify-center">
                  <img
                    src={previewDoc.url}
                    alt="Preview"
                    className="shadow-2xl rounded-lg transition-transform duration-200 ease-out origin-top"
                    style={{
                      width: `${zoomLevel * 100}%`,
                      maxWidth: 'none'
                    }}
                  />
                </div>
              ) : (
                <div className="text-gray-500 flex flex-col items-center justify-center h-full min-h-[70vh] w-full bg-white rounded-lg shadow border border-gray-200">
                  <FileText size={64} className="mb-4 text-gray-300" />
                  <p className="font-bold">Preview not available for this file type.</p>
                  <a href={previewDoc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 underline mt-4 hover:text-blue-800">
                    <FaFileDownload /> Download File
                  </a>
                </div>
              )}
            </div>

            <div className="bg-gray-50 border-t px-6 py-3 text-right z-10 relative shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <button className="px-6 py-2 bg-gray-800 text-white font-bold uppercase text-xs rounded-lg hover:bg-black transition-colors" onClick={() => setPreviewDoc(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MESSAGE APPLICANT MODAL --- */}
      {isMessageModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMessageModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">Message Applicant</h3>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsMessageModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleSendMessage} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">To</label>
                <input
                  type="text"
                  value={`${selectedApplicant.name} <${selectedApplicant.profile.personal.email}>`}
                  disabled
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-100 text-gray-600 font-medium cursor-not-allowed outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Subject <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={messageData.subject}
                  onChange={(e) => setMessageData({ ...messageData, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Message <span className="text-red-500">*</span></label>
                <textarea
                  required
                  rows={6}
                  value={messageData.message}
                  onChange={(e) => setMessageData({ ...messageData, message: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-between items-center mt-4">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setUnlockOnSend(!unlockOnSend)}>
                  <span className="text-[12px] font-bold text-gray-700 uppercase">Unlock Application</span>
                  <div className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${unlockOnSend ? 'bg-red-500' : 'bg-gray-300 hover:bg-gray-400'}`}>
                    <span className={`absolute top-[2px] bg-white w-4 h-4 rounded-full shadow transition-transform ${unlockOnSend ? 'left-5' : 'left-1'}`} />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsMessageModalOpen(false)}
                    className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingMessage}
                    className={`px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow flex items-center gap-2 ${isSendingMessage ? 'bg-yellow-400 cursor-not-allowed' : 'bg-[#eab308] hover:bg-[#ca8a04]'}`}
                  >
                    {isSendingMessage ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {isConfirmModalOpen && !isArchiveMode && userRole === "Admin" && (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsConfirmModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">Confirm Action</h3>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsConfirmModalOpen(false)}>&times;</button>
            </div>

            <div className="p-6 text-center text-gray-700">
              <p className="text-[16px] mb-2">
                Are you sure you want to mark the selected <strong>{selectedApplicantIds.length}</strong> applicant(s) as <span className={`font-black uppercase tracking-wider ${confirmActionStatus === 'Failed' ? 'text-red-600' : 'text-green-600'}`}>{confirmActionStatus}</span>?
              </p>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkUpdate}
                disabled={isProcessing}
                className={`px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow ${
                  isProcessing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : confirmActionStatus === 'Failed'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isProcessing ? 'PROCESSING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- HIDDEN PRINT CONTAINER --- */}
      <div style={{ position: "fixed", opacity: 0, pointerEvents: "none", left: "-99999px", top: "-99999px" }}>
        <div ref={printFormRef} dangerouslySetInnerHTML={{ __html: printContent }} />
      </div>

      {/* --- CUSTOM CONFIRMATION MODAL --- */}
      {confirmActionModal.isOpen && (
        <div className="fixed inset-0 z-[1250] flex items-center justify-center pt-6">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmActionModal({ isOpen: false, message: "", onConfirm: null })}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">Confirm Action</h3>
              <button
                className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none cursor-pointer"
                onClick={() => setConfirmActionModal({ isOpen: false, message: "", onConfirm: null })}
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-full bg-amber-100 text-amber-600 shrink-0 mt-0.5">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="text-gray-700 text-[14px] leading-relaxed font-medium">
                    {confirmActionModal.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmActionModal({ isOpen: false, message: "", onConfirm: null })}
                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmActionModal.onConfirm) confirmActionModal.onConfirm();
                  setConfirmActionModal({ isOpen: false, message: "", onConfirm: null });
                }}
                className="px-8 py-2 rounded bg-[#376e35] hover:bg-[#2e5c2c] font-bold uppercase text-[12px] text-white transition shadow cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- REASSIGN PROGRAM MODAL --- */}
      {isReassignModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="bg-[#376e35] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Reassign Program</h3>
              <button onClick={() => setIsReassignModalOpen(false)} className="text-white/80 hover:text-white transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-[14px] leading-relaxed mb-4">
                This applicant has already been rejected from their first choice. Please select an available program to reassign them to. They will be placed in the new program's queue as a fresh applicant.
              </p>
              <div className="space-y-1">
                <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Select New Program</label>
                <select
                  value={reassignProgram}
                  onChange={(e) => setReassignProgram(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#376e35] transition"
                >
                  <option value="" disabled>-- Select a Program --</option>
                  {coursesList.map((course) => (
                    <option key={course._id} value={`${course.name} - ${course.abbreviation}`}>
                      {course.abbreviation} - {course.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button
                onClick={() => setIsReassignModalOpen(false)}
                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReassign}
                disabled={isProcessing}
                className={`px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#376e35] hover:bg-[#2e5c2c]'}`}
              >
                {isProcessing ? 'Processing...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
