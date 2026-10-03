import { useState, useRef, useMemo, useEffect } from "react";
import api, { BASE_URL } from "../../../services/api.js";
import {
  FaSearch, FaFilter, FaFileExport, FaFileImport, FaCheck, FaChevronDown,
  FaEye, FaTimes, FaSearchPlus, FaSearchMinus, FaRedo, FaFileDownload, FaPrint, FaPlus, FaEnvelope, FaEdit, FaTrash, FaExclamationTriangle
} from "react-icons/fa";
import { FileText, CheckCircle, MessageSquare, Eye, Edit, Mail, MailCheck, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign, ImageRun, Footer } from "docx";
import { saveAs } from "file-saver";
import { regions, provinces, cities, barangays } from 'select-philippines-address';

import { useToast } from "../context/ToastContext.jsx";
import { ButtonSpinner, PageLoader } from "../components/Loaders.jsx";

import * as XLSX from "xlsx-js-style";
import { useReactToPrint } from "react-to-print";

/** CONSTANTS & HELPERS */
const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('blob:') || path.startsWith('http')) return path;

  let cleanPath = path.replace(/\\/g, '/');
  cleanPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  if (!cleanPath.startsWith('/uploads/')) {
    cleanPath = `/uploads${cleanPath}`;
  }

  return `${BASE_URL}${cleanPath}`;
};

const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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
  if (!courseName || courseName === "N/A") return "N/A";

  if (coursesList && coursesList.length > 0) {
    const haystack = courseName.trim().toLowerCase();
  
    const sortedCourses = [...coursesList].sort((a, b) => (b.name || "").length - (a.name || "").length);
    const foundCourse = sortedCourses.find(c => {
      const dbName = (c.name || "").trim().toLowerCase();
      return dbName && haystack.includes(dbName);
    });
  
    if (foundCourse && foundCourse.abbreviation) {
      return foundCourse.abbreviation.toUpperCase();
    }
  }
  return getCourseAbbr(courseName);
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

const getInstituteByCourse = (courseName, coursesList) => {
  if (!courseName || !coursesList || coursesList.length === 0) return "UNKNOWN";
  const haystack = courseName.trim().toLowerCase();

  const sortedCourses = [...coursesList].sort((a, b) => (b.name || "").length - (a.name || "").length);

  let foundCourse = sortedCourses.find(c => {
    if (!c) return false;
    const dbName = (c.name || "").trim().toLowerCase();
    const dbAbbr = (c.abbreviation || "").trim().toLowerCase();

    if (dbName && haystack === dbName) return true;
    if (dbAbbr && haystack === dbAbbr) return true;
    if (dbName && dbAbbr && haystack === `${dbName} (${dbAbbr})`) return true;
    if (dbName && haystack.includes(dbName)) return true;
    if (dbAbbr && haystack.includes(`(${dbAbbr})`)) return true;

    return false;
  });

  return foundCourse ? foundCourse.institute : "UNKNOWN";
};

const INITIAL_RUBRIC_SECTIONS = [
  { id: "I", title: "I. Communication Skills (30%)", criteria: [{ id: "1_1", name: "Articulation & Clarity", desc: "Expresses ideas logically, clearly, and confidently.", weight: 15 }, { id: "1_2", name: "Language Proficiency", desc: "Uses correct grammar, vocabulary, and appropriate tone.", weight: 10 }, { id: "1_3", name: "Active Listening", desc: "Responds appropriately, shows understanding, and answers questions directly.", weight: 5 }] },
  { id: "II", title: "II. Personality, Behaviour & Interpersonal Skills (25%)", criteria: [{ id: "2_1", name: "Professional Attitude", desc: "Shows respectfulness, politeness, and appropriate behaviour.", weight: 10 }, { id: "2_2", name: "Confidence & Composure", desc: "Maintains calmness, self-assurance, and professionalism.", weight: 10 }, { id: "2_3", name: "Interpersonal Skills", desc: "Interacts positively and engages appropriately during the interview.", weight: 5 }] },
  { id: "III", title: "III. Course Awareness & Academic Readiness (25%)", criteria: [{ id: "3_1", name: "Understanding of Chosen Course", desc: "Shows awareness of course content, expectations, and career paths.", weight: 10 }, { id: "3_2", name: "Logical & Critical Thinking", desc: "Demonstrates reasoning, problem-solving, and analytical skills.", weight: 10 }, { id: "3_3", name: "Alignment of Skills & Interests", desc: "Shows that abilities and interests fit the chosen course.", weight: 5 }] },
  { id: "IV", title: "IV. Motivation, Goals & Overall Impression (20%)", criteria: [{ id: "4_1", name: "Motivation for the Course", desc: "Shows genuine reason for choosing the course.", weight: 10 }, { id: "4_2", name: "Career Goals", desc: "Presents realistic, clear, and purposeful future plans.", weight: 5 }, { id: "4_3", name: "Overall Impression", desc: "Demonstrates potential to succeed in the course.", weight: 5 }] }
];

const getGWA = (app) => {
  const rawGwa = app.gwa ||
    app.profile?.education?.shs?.seniorHighGwa ||
    app.profile?.education?.shs?.gwa ||
    app.seniorHighGwa ||
    "0";
  const numGwa = parseFloat(rawGwa);
  return isNaN(numGwa) ? 0 : numGwa;
};

const getBonus = (app) => {
  const info = app.profile?.otherInfo || {};
  const isALS = (app.applicantType || app.type || app.profile?.appDetails?.applicantType || "").toUpperCase() === "ALS";
  return (info.isPwd || info.isIndigenous || info.isSoloParent || info.is4Ps || info.isOfw || isALS) ? 5 : 0;
};

const calculateTotal = (app) => {
  const bcet = parseFloat(app.examScore) || 0;
  const interview = parseFloat(app.interviewScore) || 0;
  const gwa = getGWA(app);
  const bonus = getBonus(app);

  if (bcet === 0 && interview === 0 && gwa === 0) return 0;

  const total = bcet + ((gwa / 100) * 20) + ((interview / 100) * 25) + bonus;
  return Math.min(total, 100).toFixed(2);
};

/**
 * --- REUSABLE COMPONENTS ---
 */
const CustomCheckbox = ({ checked, onChange, disabled }) => (
  <div
    onClick={(e) => {
      if (disabled) return;
      e.stopPropagation();
      onChange({ target: { checked: !checked } });
    }}
    className={`w-[18px] h-[18px] mx-auto rounded-[3px] border flex items-center justify-center cursor-pointer transition-all shadow-sm ${disabled ? "opacity-40 cursor-not-allowed border-gray-400 bg-gray-100" : checked ? "bg-[#10dc60] border-[#10dc60]" : "bg-white border-gray-400 hover:border-[#10dc60]"
      }`}
  >
    {checked && <FaCheck size={10} className="text-white" />}
  </div>
);

const normalizeAdmissionRemark = (status) => {
  const normalized = (status || "Pending").toString().trim().toUpperCase();
  if (normalized === "ACCEPTED") return "Accepted";
  if (normalized === "PASSED" || normalized === "ADMITTED") return "Passed";
  if (normalized === "WAITLISTED") return "Waitlisted";
  if (normalized === "FAILED" || normalized === "REJECTED") return "Failed";
  if (normalized === "FORFEIT" || normalized === "NO-SHOW" || normalized === "DECLINED") return "Forfeit";
  return "Pending";
};

const hasSentEmailType = (app, type) => {
  return (app?.sentEmails || []).some(email => email?.type === type);
};

const StatusTag = ({ status }) => {
  const displayStatus = normalizeAdmissionRemark(status);
  let colors = "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (displayStatus === "Accepted") colors = "bg-blue-600 text-white border-blue-700";
  if (displayStatus === "Passed") colors = "bg-green-100 text-green-800 border-green-200";
  if (displayStatus === "Waitlisted") colors = "bg-blue-100 text-blue-700 border-blue-200";
  if (displayStatus === "Failed") colors = "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`px-3 py-1.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border ${colors}`}>
      {displayStatus}
    </span>
  );
};

const FormField = ({ label, value, isEditMode, editValue, onChange, type = "text", className = "", required = false }) => (
  <div className={`flex flex-col ${className}`}>
    <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">
      {label}{isEditMode && required && <span className="text-red-500 ml-1 text-[12px] leading-none">*</span>}
    </label>
    {isEditMode ? (
      <input
        type={type}
        value={editValue !== undefined ? editValue : value}
        onChange={onChange}
        className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none transition-colors uppercase"
      />
    ) : (
      <div className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 uppercase truncate cursor-default flex items-center shadow-sm">
        {value || "N/A"}
      </div>
    )}
  </div>
);

const InputFormField = ({ label, value, onChange, type = "text", className = "", placeholder = "", disabled = false, required = false }) => (
  <div className={`flex flex-col ${className}`}>
    {label && <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">{label}{required && <span className="text-red-500 ml-1 text-[12px] leading-none">*</span>}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
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
        <option value="" disabled hidden>SELECT COURSE</option>
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
            {provinceList.map(p => <option key={p.province_code} value={p.province_code}>{p.province_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <select disabled={disabled || !addressData.provinceCode} value={addressData.cityCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('city', 'cityCode', e.target.value, name);
            handleChange('barangay', 'barangayCode', "", "");
          }} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">CITY/MUNI</option>
            {cityList.map(c => <option key={c.city_code} value={c.city_code}>{c.city_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <select disabled={disabled || !addressData.cityCode} value={addressData.barangayCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('barangay', 'barangayCode', e.target.value, name);
          }} className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">BARANGAY</option>
            {barangayList.map(b => <option key={b.brgy_code} value={b.brgy_code}>{b.brgy_name}</option>)}
          </select>
        </div>

        <InputFormField placeholder="ZIP Code" value={addressData.zip} onChange={e => onChange('zip', e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
};

const SectionHeader = ({ title }) => (
  <div className="mb-4 pb-2 border-b border-gray-200">
    <h3 className="text-[12px] font-black text-[#376e35] uppercase tracking-wide">{title}</h3>
  </div>
);

export default function PreAdmission({ navigateToTab, navigationState }) {
  const { toast } = useToast();
  
  

  // --- STATES ---
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [applicants, setApplicants] = useState([]);
  const [activeYear, setActiveYear] = useState("");
  const [isArchiveMode, setIsArchiveMode] = useState(false);
  const [rubricData, setRubricData] = useState(INITIAL_RUBRIC_SECTIONS);

  // --- DYNAMIC DATA STATES ---
  const [coursesList, setCoursesList] = useState([]);
  const [institutesList, setInstitutesList] = useState([]);

  // Role and Institute State
  const [userRole, setUserRole] = useState("Admin");
  const [userInstitute, setUserInstitute] = useState("IITI");
  const [portalSettings, setPortalSettings] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [instituteFilter, setInstituteFilter] = useState("All");
  const [courseFilter, setCourseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Total %: Highest to Lowest");
  const [nameSortOrder, setNameSortOrder] = useState("A-Z");
  const [activeSortType, setActiveSortType] = useState("total");

  const [selectedIds, setSelectedIds] = useState([]);
  const [activePopupId, setActivePopupId] = useState(null);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmActionStatus, setConfirmActionStatus] = useState(null);
  const [confirmTargetId, setConfirmTargetId] = useState(null);



  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInlineEditMode, setIsInlineEditMode] = useState(false);
  const [newApplicant, setNewApplicant] = useState(null);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(0.8);

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [capacityWarningModal, setCapacityWarningModal] = useState(null);
  const [missingPlaceholdersModal, setMissingPlaceholdersModal] = useState(null);
  const [emailSubject, setEmailSubject] = useState("Admission Qualification Notice");
  const [emailMessage, setEmailMessage] = useState("");
  const [selectedEmailTemplateType, setSelectedEmailTemplateType] = useState("Admission Qualification Notice");
  const [reconsiderationProgram, setReconsiderationProgram] = useState("");
  const [emailTargetIds, setEmailTargetIds] = useState([]);
  const [selectedDropdownTarget, setSelectedDropdownTarget] = useState("all");

  // --- BCET IMPORT CONFIRMATION ---
  const [pendingBcetData, setPendingBcetData] = useState(null);
  const [isBcetConfirmOpen, setIsBcetConfirmOpen] = useState(false);

  // --- PRINT STATE ---
  const printFormRef = useRef(null);
  const [printContent, setPrintContent] = useState('');

  const handlePrintApplication = useReactToPrint({
    contentRef: printFormRef,
    documentTitle: 'Application_Form',
    onAfterPrint: () => setPrintContent('')
  });

  useEffect(() => {
    if (printContent) {
      handlePrintApplication();
    }
  }, [printContent, handlePrintApplication]);

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageData, setMessageData] = useState({ subject: "", message: "" });
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const filterRef = useRef(null);
  const fileInputRef = useRef(null);
  const exportMenuRef = useRef(null);

  // --- BULLETPROOF SAFETY NET ---
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

    return {
      ...app,
      _id: app._id || app.id,
      id: app.applicantId || app.applicationId || app.id || app._id,
      institute: app.institute || "N/A",
      interviewer: app.interviewer || "",
      interviewRatings: app.interviewRatings || {},
      profile: {
        appDetails: {
          applicantType: app.profile?.appDetails?.applicantType || app.applicantType || app.type || "N/A",
          firstChoice: app.profile?.appDetails?.firstChoice || app.firstChoice || "N/A",
          secondChoice: app.profile?.appDetails?.secondChoice || app.secondChoice || "N/A"
        },
        personal: app.profile?.personal || {
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
          permAddress: { houseStreet: app.permanentHouse || "", barangay: app.permanentBarangay || "", city: app.permanentCity || "", province: app.permanentProvince || "", zip: app.permanentZip || "" },
          presAddress: { houseStreet: app.presentHouse || "", barangay: app.presentBarangay || "", city: app.presentCity || "", province: app.presentProvince || "", zip: app.presentZip || "" }
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

  // --- API DATA FETCHING ---
  const exitArchiveMode = () => {
    sessionStorage.removeItem("archiveViewYear");
    window.location.reload();
  };

  const fetchApplicants = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);

      const [profileRes, coursesRes, institutesRes, settingsRes] = await Promise.all([
        api.get('/admin/profile'),
        api.get('/admin/courses'),
        api.get('/admin/institutes'),
        api.get('/public/settings')
      ]);

      setUserRole("Admin");
      setUserInstitute(profileRes.data.institute || "IITI");
      setCoursesList(coursesRes.data || []);
      setInstitutesList(institutesRes.data || []);

      const archiveYear = sessionStorage.getItem("archiveViewYear");
      if (settingsRes.data) {
        setActiveYear(settingsRes.data.schoolYear || "");
        setPortalSettings(settingsRes.data.portalSettings || null);
      }

      const currentViewYear = archiveYear || settingsRes.data.schoolYear;
      setActiveYear(currentViewYear);
      if (archiveYear) setIsArchiveMode(true);

      const res = await api.get('/admin/applicants', { params: { schoolYear: currentViewYear } });
      if (res.data) {
        const interviewedApps = res.data.filter(app => {
          if (!currentViewYear || currentViewYear.trim() === "") return false;
          if (app.schoolYear !== currentViewYear) return false;

          return app.isInterviewed ||
            app.interviewStatus === 'Passed' ||
            app.interviewStatus === 'Failed' ||
            app.admissionStatus === 'Admitted' ||
            app.admissionStatus === 'Passed' ||
            app.admissionStatus === 'Failed' ||
            app.status === 'Passed' ||
            app.status === 'Admitted';
        });

        const formatted = interviewedApps.map(app => {
          const safe = getSafeApplicant(app);

          let intStatus = "Pending";
          if (app.interviewScore !== undefined && app.interviewScore !== null) {
            intStatus = "Passed";
          } else if (app.interviewStatus === 'Passed' || app.admissionStatus === 'Admitted' || app.status === 'Passed') {
            intStatus = "Passed";
          } else if (app.interviewStatus === 'Failed' || app.status === 'Failed') {
            intStatus = "Failed";
          }

          let bcetStatus = "Pending";
          if (app.examScore !== undefined && app.examScore !== null && app.examScore > 0) {
            bcetStatus = "Passed";
          } else if (app.examStatus === "Passed" || app.examStatus === "Failed") {
            bcetStatus = app.examStatus;
          }

          const tempApp = { ...safe, examScore: app.examScore || 0, interviewScore: app.interviewScore || 0, bcetRawScore: app.bcetRawScore || null, bcetHighestScore: app.bcetHighestScore || null };
          const totalPerc = parseFloat(calculateTotal(tempApp));

          let admStatus = app.admissionStatus || app.status || "Pending";
          const savedRemarks = app.admissionRemarks || "";

          // Admission Remarks: Passed, Waitlisted, Failed, Pending
          let computedAdmissionRemarks = "Pending";
          const dbRemarks = app.admissionRemarks || "";

          if (intStatus === "Pending" || bcetStatus === "Pending") {
            computedAdmissionRemarks = "Pending";
          } else if (["Passed", "Waitlisted", "Failed", "Admitted", "Confirmed"].includes(dbRemarks)) {
            computedAdmissionRemarks = dbRemarks;
          } else if (["Passed", "Waitlisted", "Failed", "Admitted", "Confirmed"].includes(app.admissionStatus)) {
            computedAdmissionRemarks = app.admissionStatus;
          } else if (intStatus === "Failed" || bcetStatus === "Failed") {
            computedAdmissionRemarks = "Failed";
          } else {
            // By default, if they have all scores but no db status, keep them as Pending
            // The dynamic ranker below will upgrade them to Passed or Waitlisted
            computedAdmissionRemarks = "Pending";
          }

          // Slot Status
          let slotStatus = app.slotStatus || "Pending";
          if (!["Admitted", "Forfeit", "Forfeited"].includes(slotStatus)) {
            if (admStatus === "Admitted") {
              slotStatus = "Admitted";
            } else if (admStatus === "Forfeit" || admStatus === "Forfeited") {
              slotStatus = "Forfeited";
            } else {
              slotStatus = "Pending";
            }
          }

          return {
            ...safe,
            rawId: app._id || app.id,
            id: app.applicantId || app.applicationId || safe.id,
            name: (app.name || `${safe.profile.personal.surname}, ${safe.profile.personal.firstName}`).toUpperCase(),
            type: app.type || app.applicantType || "N/A",
            location: app.location || app.presentCity?.toUpperCase() || "N/A",
            interviewRemarks: intStatus,
            bcetRemarks: bcetStatus,
            admissionRemarks: computedAdmissionRemarks,
            slotStatus: slotStatus,
            admissionStatus: admStatus,
            status: admStatus,

            isEmailSent: app.isEmailSent || false,
            sentEmails: app.sentEmails || [],
            interviewRatings: app.interviewRatings || {},
            interviewer: app.interviewer || "",
            interviewScore: app.interviewScore || 0,
            examScore: app.examScore || 0,
            bcetRawScore: app.bcetRawScore || null,
            bcetHighestScore: app.bcetHighestScore || null,
            interviewSchedule: app.interviewDate || app.interviewSchedule || ""
          };
        });

        // Re-evaluate Waitlisted vs Passed dynamically based on program capacity
        const currentCourses = coursesRes.data || [];
        const activePrograms = [...new Set(formatted.map(a => getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), currentCourses)))];

        activePrograms.forEach(abbr => {
          const course = currentCourses.find(c => c.abbreviation === abbr);
          if (!course) return;

          const limit = parseInt(course.limit) || 0;

          // Find all apps for this program who have completed BOTH interview and BCET
          const programApps = formatted.filter(a => {
            const activeAbbr = getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), currentCourses);
            return activeAbbr === abbr && a.interviewRemarks && a.interviewRemarks !== "Pending" && a.bcetRemarks && a.bcetRemarks !== "Pending";
          });

          // Confirmed/admitted AND forfeited applicants hold seats.
          // Forfeited applicants keep their seat locked until the admin explicitly sends
          // a Letter of Reconsideration — only then does a waitlisted applicant get promoted.
          const seated = programApps.filter(a => {
            const slot = (a.slotStatus || "").toString().toLowerCase();
            const admissionStatus = (a.admissionStatus || a.status || "").toString().toLowerCase();
            return slot === "admitted" || slot === "accepted" || slot === "forfeit" || slot === "forfeited" ||
              admissionStatus === "confirmed" || admissionStatus === "admitted" || admissionStatus === "forfeit" || admissionStatus === "forfeited";
          }).length;

          // Apps eligible for ranking: not fixed or failed
          const rankableApps = programApps.filter(a => {
            const slot = (a.slotStatus || "").toString().toLowerCase();
            const admissionStatus = (a.admissionStatus || a.status || "").toString().toLowerCase();
            const remark = normalizeAdmissionRemark(a.admissionRemarks);
            return !["admitted", "accepted", "forfeit", "forfeited"].includes(slot) &&
              !["confirmed", "admitted", "forfeit", "forfeited"].includes(admissionStatus) &&
              remark !== "Failed";
          });

          // Sort by total score descending
          rankableApps.sort((a, b) => parseFloat(calculateTotal(b)) - parseFloat(calculateTotal(a)));

          let currentSeated = seated;
          rankableApps.forEach(app => {
            if (currentSeated < limit) {
              const wasWaitlisted = normalizeAdmissionRemark(app.admissionRemarks) === "Waitlisted" || normalizeAdmissionRemark(app.admissionStatus) === "Waitlisted";
              app.isSlidUp = wasWaitlisted && !hasSentEmailType(app, "Letter of Reconsideration");
              app.admissionRemarks = "Passed";
              app.status = "Passed";
              currentSeated++;
            } else {
              app.admissionRemarks = "Waitlisted";
              app.status = "Waitlisted";
              app.isSlidUp = false;
            }
          });
        });
        setApplicants(prev => {
          if (isSilent && JSON.stringify(prev) === JSON.stringify(formatted)) return prev;
          return formatted;
        });
      }

      try {
        const rubricRes = await api.get('/admin/rubric');
        if (rubricRes.data && rubricRes.data.length > 0) setRubricData(rubricRes.data);
      } catch (e) { }

    } catch (err) {
      console.error("Failed to fetch admission list:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => { fetchApplicants(); }, []);

  useEffect(() => {
    let timeoutId;
    const poll = async () => {
      await fetchApplicants(true);
      timeoutId = setTimeout(poll, 15000);
    };
    timeoutId = setTimeout(poll, 15000);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) setIsExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- FILTERING LOGIC ---
  const filteredApplicants = useMemo(() => {
    let result = applicants;

    result = result.filter(app => {
      const remark = normalizeAdmissionRemark(app.admissionRemarks);
      const status = (app.admissionStatus || app.status || "").toString().trim();
      const slot = (app.slotStatus || "").toString().trim();
      const isPassedInDb = ["Passed", "Admitted", "Confirmed"].includes(normalizeAdmissionRemark(app.admissionStatus));
      const isForfeited = ['Forfeit', 'Forfeited'].includes(slot) || ['Forfeit', 'Forfeited'].includes(status) || ['Forfeit', 'Forfeited'].includes(remark);
      const hasInterview = app.isInterviewed === true || (app.interviewScore !== undefined && app.interviewScore !== null && app.interviewScore > 0) || status === 'Passed' || status === 'Failed' || status === 'Waitlisted';
      
      return hasInterview && !['Admitted', 'Forfeit', 'Forfeited'].includes(app.slotStatus) && app.admissionStatus !== "Confirmed" && !isForfeited && (!isPassedInDb || app.isSlidUp);
    });

    // 1. THE RBAC SECURITY FILTER 
    if (userRole === "SuperAdmin" && instituteFilter !== "All") {
      result = result.filter(a => {
        const activeChoice = a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice);
        const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
        const activeCourse = coursesList.find(c => c.abbreviation === activeAbbr);
        return activeCourse?.institute === instituteFilter;
      });
    }

    // 2. SEARCH FILTER
    if (searchQuery) {
      const lowerTerm = searchQuery.toLowerCase();
      result = result.filter(app => {
        const appName = (app.name || "").toLowerCase();
        const appId = (app.id || "").toString().toLowerCase();
        const rawId = (app.rawId || "").toString().toLowerCase();
        return appName.includes(lowerTerm) || appId.includes(lowerTerm) || rawId.includes(lowerTerm);
      });
    }

    // 3. DROPDOWN FILTERS
    if (typeFilter) {
      result = result.filter(app => {
        const appType = (app.type || "").toUpperCase();
        return appType === typeFilter.toUpperCase();
      });
    }

    if (statusFilter !== "All") {
      result = result.filter(app => normalizeAdmissionRemark(app.admissionRemarks || app.status || app.admissionStatus) === statusFilter);
    }

    if (courseFilter !== "All") {
      result = result.filter(app => {
        const firstAbbr = getCourseAbbreviation(app.profile?.appDetails?.firstChoice, coursesList);
        return firstAbbr === courseFilter;
      });
    }
    if (activeSortType === "name") {
      if (nameSortOrder === "A-Z") {
        result.sort((a, b) => {
          const statusA = normalizeAdmissionRemark(a.admissionRemarks || a.status || a.admissionStatus);
          const statusB = normalizeAdmissionRemark(b.admissionRemarks || b.status || b.admissionStatus);
          if (statusA === "Forfeit" && statusB !== "Forfeit") return 1;
          if (statusB === "Forfeit" && statusA !== "Forfeit") return -1;
          return (a.name || "").localeCompare(b.name || "");
        });
      } else {
        result.sort((a, b) => {
          const statusA = normalizeAdmissionRemark(a.admissionRemarks || a.status || a.admissionStatus);
          const statusB = normalizeAdmissionRemark(b.admissionRemarks || b.status || b.admissionStatus);
          if (statusA === "Forfeit" && statusB !== "Forfeit") return 1;
          if (statusB === "Forfeit" && statusA !== "Forfeit") return -1;
          return (b.name || "").localeCompare(a.name || "");
        });
      }
    } else {
      if (sortOrder === "Total %: Lowest to Highest") {
        result.sort((a, b) => {
          const statusA = normalizeAdmissionRemark(a.admissionRemarks || a.status || a.admissionStatus);
          const statusB = normalizeAdmissionRemark(b.admissionRemarks || b.status || b.admissionStatus);
          if (statusA === "Forfeit" && statusB !== "Forfeit") return 1;
          if (statusB === "Forfeit" && statusA !== "Forfeit") return -1;

          const totalA = parseFloat(calculateTotal(a)) || 0;
          const totalB = parseFloat(calculateTotal(b)) || 0;
          return totalA - totalB;
        });
      } else {
        // Default: Total %: Highest to Lowest
        result.sort((a, b) => {
          const statusA = normalizeAdmissionRemark(a.admissionRemarks || a.status || a.admissionStatus);
          const statusB = normalizeAdmissionRemark(b.admissionRemarks || b.status || b.admissionStatus);
          if (statusA === "Forfeit" && statusB !== "Forfeit") return 1;
          if (statusB === "Forfeit" && statusA !== "Forfeit") return -1;

          const totalA = parseFloat(calculateTotal(a)) || 0;
          const totalB = parseFloat(calculateTotal(b)) || 0;
          return totalB - totalA;
        });
      }
    }

    return result;
  }, [applicants, searchQuery, typeFilter, statusFilter, courseFilter, userRole, instituteFilter, coursesList, sortOrder, nameSortOrder, activeSortType]);

  const eligibleApplicants = filteredApplicants.filter((a) => a.admissionRemarks !== "Pending" && a.admissionStatus !== "Forfeit");
  const isAllSelected = eligibleApplicants.length > 0 && eligibleApplicants.every((a) => selectedIds.includes(a.id));

  const eligibleWaitlistedIds = useMemo(() => {
    const ids = [];
    if (userRole === "SuperAdmin") return ids; // Only for institute admins

    const activePrograms = [...new Set(applicants.map(a => getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList)))];

    activePrograms.forEach(abbr => {
      const course = coursesList.find(c => c.abbreviation === abbr);
      if (!course) return;

      const limit = parseInt(course.limit) || 0;
      const seated = applicants.filter(a => {
        const activeAbbr = getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList);
        return activeAbbr === abbr && ['Passed', 'Admitted', 'Confirmed', 'Accepted'].includes(normalizeAdmissionRemark(a.admissionRemarks || a.status));
      }).length;

      const capacityAvailable = limit - seated;

      if (capacityAvailable > 0) {
        const waitlistedApps = applicants.filter(a => {
          const activeAbbr = getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList);
          return activeAbbr === abbr && normalizeAdmissionRemark(a.admissionRemarks || a.status) === 'Waitlisted';
        });

        if (waitlistedApps.length > 0) {
          waitlistedApps.sort((a, b) => calculateTotal(b) - calculateTotal(a));
          for (let i = 0; i < Math.min(capacityAvailable, waitlistedApps.length); i++) {
            ids.push(waitlistedApps[i].id);
          }
        }
      }
    });

    return ids;
  }, [applicants, coursesList, userRole]);

  // --- HANDLERS ---
  const handleSelectAll = (e) => {
    if (isArchiveMode) return;
    if (e.target.checked) {
      setSelectedIds(eligibleApplicants.map((a) => a.id));
      setActivePopupId("header");
    } else {
      setSelectedIds([]);
      setActivePopupId(null);
    }
  };

  const handleSelectRow = (id) => {
    if (isArchiveMode) return;
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
      if (activePopupId === id || activePopupId === "header") setActivePopupId(null);
    } else {
      setSelectedIds((prev) => [...prev, id]);
      setActivePopupId(id);
    }
  };

  const triggerConfirmModal = (targetId, status) => {
    setConfirmActionStatus(status);
    setConfirmTargetId(targetId);
    setIsConfirmModalOpen(true);
    setActivePopupId(null);
  };

  const executeConfirmedAction = async () => {
    if (confirmTargetId === "bulk") {
      await handleBulkAction(confirmActionStatus);
    } else {
      await handleRowAction(confirmTargetId, confirmActionStatus);
    }
    setIsConfirmModalOpen(false);
    setConfirmActionStatus(null);
    setConfirmTargetId(null);
  };

  const handleRowAction = async (id, newStatus) => {
    if (isProcessing) return; // Prevent double clicks
    setIsProcessing(true); // Lock the UI
    const app = applicants.find(a => a.id === id);
    let dbStatus = newStatus;
    if (newStatus === "Passed") dbStatus = "Admitted";
    if (newStatus === "Failed") dbStatus = "Failed";

    setApplicants((prev) => prev.map((a) => {
      if (a.id === id) {
        if (newStatus === "Confirmed" || newStatus === "Forfeit") {
          return { ...a, admissionStatus: newStatus, status: newStatus, slotStatus: newStatus === "Confirmed" ? "Pending" : "Forfeited" };
        }
        return { ...a, admissionRemarks: newStatus, admissionStatus: newStatus, status: newStatus };
      }
      return a;
    }));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));

    try {
      const res = await api.put(`/admin/applicant/${app.rawId}/status`, { status: dbStatus })
        .catch(() => api.patch(`/admin/applicant/${app.rawId}/status`, { status: dbStatus }));

      const updatedApplicant = res?.data?.applicant;
      if (updatedApplicant && updatedApplicant.applicantId) {
        setApplicants((prev) => prev.map((a) =>
          a.rawId === app.rawId
            ? { ...a, id: updatedApplicant.applicantId }
            : a
        ));
      }
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); } // Unlock the UI
  };

  const handleBulkAction = async (newStatus) => {
    if (isProcessing) return; // Prevent double clicks
    setIsProcessing(true); // Lock the UI
    let dbStatus = newStatus;
    if (newStatus === "Passed") dbStatus = "Admitted";
    if (newStatus === "Failed") dbStatus = "Failed";

    setApplicants((prev) => prev.map((app) => {
      if (selectedIds.includes(app.id)) {
        if (newStatus === "Confirmed" || newStatus === "Forfeit") {
          return { ...app, admissionStatus: newStatus, status: newStatus, slotStatus: newStatus === "Confirmed" ? "Pending" : "Forfeited" };
        }
        return { ...app, admissionRemarks: newStatus, admissionStatus: newStatus, status: newStatus };
      }
      return app;
    }));

    try {
      const targets = applicants.filter(a => selectedIds.includes(a.id)).map(a => a.rawId);

      // Process sequentially with a slight delay to avoid triggering the 429 Rate Limiter
      for (const targetId of targets) {
        await api.put(`/admin/applicant/${targetId}/status`, { status: dbStatus })
          .catch(() => api.patch(`/admin/applicant/${targetId}/status`, { status: dbStatus }));
        await new Promise(resolve => setTimeout(resolve, 150)); // 150ms delay between requests
      }

      if (newStatus === "Confirmed" || newStatus === "Forfeit") {
        await fetchApplicants();
      }
    } catch (e) { console.error(e); }
    finally { setIsProcessing(false); } // Unlock the UI

    setSelectedIds([]);
  };

  const openInterviewModal = (applicant) => {
    setSelectedApplicant(getSafeApplicant(applicant));
    setIsInterviewModalOpen(true);
  };

  const getEmailRequirements = (app, emailType = "Admission Qualification Notice") => {
    const rawType = (app?.profile?.appDetails?.applicantType || app?.type || "").toUpperCase();
    
    let type = "SHS Graduate";
    if (rawType === 'TRANSFEREE') type = "Transferee";
    else if (rawType === 'ALS' || rawType === 'ALS GRADUATE') type = "ALS";

    // Extract uploaded keys from applicant documents
    const uploadedKeys = (app?.documents || []).map(doc => {
      const filename = doc.filename || "";
      return filename.includes("___") ? filename.split("___")[0] : "";
    });

    const generateKey = (name) => {
      const legacyMap = {
        "Photocopy of PSA Birth Certificate": "birth_cert",
        "Original Grade 12 Report Card (Form 138)": "form_138",
        "Original Good Moral Certificate": "good_moral",
        "Original Certificate of Good Moral Character": "good_moral",
        "Photocopy of SHS Diploma": "diploma",
        "Photocopy of Grade 11 Report Card with Certified True Copy": "grade_11_card",
        "Original Transcript of Records (TOR)": "tor",
        "Original Transcript of Records": "tor",
        "Honorable Dismissal": "honorable_dismissal",
        "Original Honorable Dismissal": "honorable_dismissal",
        "Certificate of Copy of Grades": "copy_grades",
        "Original Certificate of Rating": "cert_rating",
        "Original ALS Certification Test Result Document": "als_cert",
        "Certificate of Disability": "cert_disability",
        "Certificate of Indigenous People": "cert_ip",
        "Photocopy of Solo Parent ID": "solo_parent_id",
        "Photocopy of 4Ps ID": "proof_4ps",
        "Copy of OFW Document (e.g. Contract or ID)": "ofw_document"
      };
      if (legacyMap[name]) return legacyMap[name];
      return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    };

    let reqs = "";
    let counter = 1;

    // Only include physical requirements for Application Received, not for Admission Qualification / Reconsideration
    if (emailType === "Application Received") {
      reqs = "1. Printed Application Form (Back to Back)\n2. 2pcs 2x2 ID picture with a white background\n3. Long brown envelope\n";
      counter = 4;
    }

    const appReqs = portalSettings?.applicantRequirements || [];
    if (!appReqs.length) {
      if (type === 'TRANSFEREE') {
        return reqs + `${counter}. Original Transcript of Records\n${counter+1}. Original Honorable Dismissal\n${counter+2}. Original Good Moral Certificate`;
      } else if (type === 'ALS') {
        return reqs + `${counter}. Original Certificate of Rating\n${counter+1}. Original ALS Certification Test Result Document`;
      } else {
        return reqs + `${counter}. Original Grade 12 Report Card (Form 138)\n${counter+1}. Original Good Moral Certificate\n${counter+2}. Photocopy of SHS Diploma`;
      }
    }

    for (const req of appReqs) {
      const isTarget = !req.targetApplicant || req.targetApplicant.length === 0 || req.targetApplicant.includes(type);
      
      // Check DEI docs based on condition
      const condition = req.condition;
      if (condition === "disability" && !app?.profile?.appDetails?.disability) continue;
      if (condition === "indigenous" && !app?.profile?.appDetails?.indigenous) continue;
      if (condition === "soloParent" && !app?.profile?.appDetails?.soloParent) continue;
      if (condition === "fourPs" && !app?.profile?.appDetails?.fourPs) continue;
      if (condition === "ofw" && !app?.profile?.appDetails?.ofw) continue;

      const docKey = generateKey(req.documentName);

      if (emailType === "Admission Qualification Notice" || emailType === "Letter of Reconsideration") {
         // ONLY include if the applicant has NOT uploaded it
         if (uploadedKeys.includes(docKey)) continue;
      } else if (emailType === "Application Received") {
         // ONLY include if the applicant HAS uploaded it
         if (!uploadedKeys.includes(docKey)) continue;
      }

      if (isTarget) {
        reqs += `${counter}. ${req.documentName}\n`;
        counter++;
      }
    }

    if (reqs === "") {
        return "All required documents have been submitted.";
    }

    return reqs.trimEnd();
  };


  const loadEmailTemplate = async (templateType) => {
    const currentAY = activeYear || "2026-2027";
    const defaultQualificationMsg = `Dear [APPLICANT NAME],\n\nCongratulations! We are pleased to inform you that you have successfully passed the admission process and officially accepted to Baliwag Polytechnic College for the Academic Year ${currentAY} 1st Semester.\n\nApplicant No.: [APPLICANT NO]\nName: [APPLICANT NAME]\nProgram: [PROGRAM]\n\nThe enrollment schedule will be posted on our FB Page BTECH Admission Office.\n\nPlease prepare the following documents before your Enrollment Schedule:\n[REQUIREMENTS]\n\nTo officially accept your offer of admission, please click the button below:\n\n[Accept Slot]\n\nNote: Please be sure to enroll on your scheduled date. If you do not show up on time, you may lose your slot to another student. Please also bring a long brown envelope for your documents.\n\nBest regards,\n\nBTECH Admission Office`;
    const defaultReconsiderationMsg = `Dear [APPLICANT NAME],

We are pleased to inform you that your application for admission has been reconsidered. After a thorough review of your file, we are happy to offer you admission to Baliwag Polytechnic College for the upcoming Academic Year [Year & Semester].

Applicant No.: [APPLICANT NO.]
Applicant Name: [APPLICANT NAME]
Program: [PROGRAM]

The enrollment schedule will be posted on our FB Page BTECH Admission Office.

Please prepare the following documents before your Enrollment Schedule:
[REQUIREMENTS]

To officially accept your offer of admission, please visit your Institute or click the button below:

[Accept Slot]

Note: Please be sure to enroll on your scheduled date. If you do not show up on time, you may lose your slot to another student. Please also bring a long brown envelope for your documents.

Best regards,

BTECH Admission`;
    const defaultApplicationReceivedMsg = `Dear [APPLICANT NAME],

Thank you for submitting your application to Baliwag Polytechnic College for the Academic Year ${currentAY}.

We are pleased to invite you to your admission interview. Please note that interviews are conducted on a first-come, first-served basis on your scheduled date:

Applicant No: [APPLICANT NO]
Date & Session: [Interview Date]
Time: [Interview Time]
Location: [Interview Location]

Please bring the following initial requirements with you on the day of your interview:

[REQUIREMENTS]

Please ensure that you print your application form and bring it with you.

Best regards,

Office of Admissions
Baliwag Polytechnic College`;

    let finalMsg = defaultQualificationMsg;
    if (templateType === "Letter of Reconsideration") finalMsg = defaultReconsiderationMsg;
    if (templateType === "Application Received") finalMsg = defaultApplicationReceivedMsg;

    try {
      const res = await api.get('/public/settings');
      const templates = res.data?.emailTemplate?.templates || [];
      const savedTpl = templates.find(t => t.title === templateType);

      if (savedTpl) {
        setEmailSubject(savedTpl.subject || templateType);
        setEmailMessage(savedTpl.message || finalMsg);
      } else {
        const savedTemplate = res.data?.emailTemplate;
        if (templateType === "Admission Qualification Notice" && savedTemplate && !savedTemplate.templates) {
          setEmailSubject(savedTemplate.subject || "Admission Qualification Notice");
          setEmailMessage(savedTemplate.message || finalMsg);
        } else {
          setEmailSubject(templateType);
          setEmailMessage(finalMsg);
        }
      }
    } catch (error) {
      setEmailSubject(templateType);
      setEmailMessage(finalMsg);
    }
  };

  const checkIsCapacityFull = (targetId, choice) => {
    if (!targetId) return false;
    const targetApp = applicants.find(a => a.id === targetId);
    if (!targetApp) return false;

    const activeChoice = choice 
      ? getProgramForChoice(targetApp, choice)
      : (targetApp.reconsiderationProgram || (targetApp.isRejectedFirstChoice ? targetApp.profile?.appDetails?.secondChoice : targetApp.profile?.appDetails?.firstChoice));
    
    const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
    const course = coursesList.find(c => c.abbreviation === activeAbbr);
    if (!course) return false;

    const limit = parseInt(course.limit) || 0;
    if (limit <= 0) return false;

    const seated = applicants.filter(a => {
      const aAbbr = getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList);
      const slot = (a.slotStatus || "").toString().toLowerCase();
      const admStatus = (a.admissionStatus || a.status || "").toString().toLowerCase();
      const remark = normalizeAdmissionRemark(a.admissionRemarks || a.status);

      // Forfeited applicants do NOT count toward capacity
      const isForfeited = slot === "forfeit" || slot === "forfeited" ||
        admStatus === "forfeit" || admStatus === "forfeited" ||
        remark === "Forfeit";

      return aAbbr === activeAbbr &&
        ['Passed', 'Admitted', 'Confirmed', 'Accepted'].includes(remark) &&
        !isForfeited;
    }).length;

    return seated >= limit;
  };

  const handleTemplateTypeChange = async (newType) => {
    if (newType === "Letter of Reconsideration" && emailTargetIds && emailTargetIds.length === 1) {
      const isFull = checkIsCapacityFull(emailTargetIds[0]);
      if (isFull) {
        setIsEmailModalOpen(false);
        setCapacityWarningModal({
          templateType: newType,
          targetIds: emailTargetIds
        });
        return;
      }
    }
    setSelectedEmailTemplateType(newType);
    await loadEmailTemplate(newType);
  };

  const getProgramForChoice = (app, choice) => {
    if (!app) return "";
    const details = app.profile?.appDetails || {};
    return choice === "second" ? details.secondChoice : details.firstChoice;
  };

  const getProgramLabelForChoice = (app, choice) => {
    const program = getProgramForChoice(app, choice);
    return getCourseAbbreviation(program, coursesList);
  };

  const openEmailModal = async (defaultTemplateType = "Admission Qualification Notice", targetIds = selectedIds, skipCapacityCheck = false) => {
    const typeStr = typeof defaultTemplateType === "string" ? defaultTemplateType : "Admission Qualification Notice";

    if (typeStr === "Letter of Reconsideration" && !skipCapacityCheck && targetIds && targetIds.length === 1) {
      const isFull = checkIsCapacityFull(targetIds[0]);
      if (isFull) {
        setCapacityWarningModal({
          templateType: typeStr,
          targetIds: targetIds
        });
        return;
      }
    }

    setSelectedEmailTemplateType(typeStr);
    setEmailTargetIds(targetIds);
    setSelectedDropdownTarget("all");
    await loadEmailTemplate(typeStr);

    if (targetIds.length === 1) {
      const app = applicants.find(a => a.id === targetIds[0]);
      setReconsiderationProgram(app?.isRejectedFirstChoice ? "second" : "first");
    } else {
      setReconsiderationProgram("");
    }

    setIsEmailModalOpen(true);
  };
  const handleInlineChange = (category, subCategory, field, value) => {
    setNewApplicant(prev => {
      const updated = { ...prev };
      if (!updated.profile) updated.profile = {};
      if (!updated.profile[category]) updated.profile[category] = {};

      if (subCategory) {
        if (!updated.profile[category][subCategory]) updated.profile[category][subCategory] = {};
        updated.profile[category][subCategory][field] = value;
      } else {
        updated.profile[category][field] = value;
      }
      return updated;
    });
  };

  const saveNewApplicant = async () => {
    const p = newApplicant.profile.personal;
    const e = newApplicant.profile.education;
    const a = newApplicant.profile.appDetails;
    const f = newApplicant.profile.family;

    if (!isEditMode && (!a.applicantType || !a.firstChoice || !a.secondChoice ||
      !p.firstName || !p.middleName || !p.surname ||
      !p.dob || !p.sex || !p.civilStatus ||
      !p.email || !p.contact ||
      !p.permAddress.houseStreet || !p.permAddress.province || !p.permAddress.city || !p.permAddress.barangay || !p.permAddress.zip ||
      !e.elem.name || !e.elem.address || !e.elem.year ||
      !e.jhs.name || !e.jhs.address || !e.jhs.year ||
      !e.shs.name || !e.shs.address || !e.shs.year || !e.shs.gwa)) {
      toast.warning("Please fill out all required fields (marked with *).");
      return;
    }

    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
      toast.warning("Please enter a valid email address containing '@' (e.g., email@gmail.com).");
      return;
    }
    if (p.contact && !/^09\d{9}$/.test(p.contact)) {
      toast.warning("Applicant Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        email: p.email,
        applicantType: a.applicantType,
        firstChoice: a.firstChoice,
        secondChoice: a.secondChoice,

        firstName: p.firstName,
        middleName: p.middleName,
        lastName: p.surname,
        suffix: p.extension,
        gender: p.sex,
        birthDate: p.dob,
        placeOfBirth: p.pob,
        civilStatus: p.civilStatus,
        spouseName: p.spouseName,
        contactNumber: p.contact,

        permanentHouse: p.permAddress.houseStreet,
        permanentProvince: p.permAddress.province,
        permanentCity: p.permAddress.city,
        permanentBarangay: p.permAddress.barangay,
        permanentZip: p.permAddress.zip,

        presentHouse: p.presAddress.houseStreet,
        presentProvince: p.presAddress.province,
        presentCity: p.presAddress.city,
        presentBarangay: p.presAddress.barangay,
        presentZip: p.presAddress.zip,

        fatherName: `${f.father.firstName} ${f.father.surname}`.trim(),
        fatherContact: f.father.contact,
        motherName: `${f.mother.firstName} ${f.mother.surname}`.trim(),
        motherContact: f.mother.contact,

        elementarySchool: e.elem.name,
        elementaryAddress: e.elem.address,
        elementaryYear: e.elem.year,
        juniorHighSchool: e.jhs.name,
        juniorHighAddress: e.jhs.address,
        juniorHighYear: e.jhs.year,
        seniorHighSchool: e.shs.name,
        seniorHighAddress: e.shs.address,
        seniorHighYear: e.shs.year,
        seniorHighGwa: e.shs.gwa,
        grade11Gwa: e.shs.grade11Gwa || e.shs.gwa,
        grade12Gwa: e.shs.grade12Gwa,
        track: e.shs.track,
        strand: e.shs.strand,
        collegeSchool: e.tertiary.name,
        collegeAddress: e.tertiary.address,
        collegeYear: e.tertiary.year,

        disability: newApplicant.profile.otherInfo.isPwd,
        indigenous: newApplicant.profile.otherInfo.isIndigenous,
        soloParent: newApplicant.profile.otherInfo.isSoloParent,
        fourPs: newApplicant.profile.otherInfo.is4Ps
      };

      await api.put(`/admin/applicant/${selectedApplicant._id || selectedApplicant.id}`, payload);
      toast.success("Applicant successfully updated! Refreshing database...");

      setIsInlineEditMode(false);
      fetchApplicants();

    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d.msg || d).join(", ") : "An error occurred while saving the applicant."));
    } finally {
      setLoading(false);
    }
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
      toast.success(res.data.message || "Message sent successfully!");
      setIsMessageModalOpen(false);
      setMessageData({ subject: "", message: "" });
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => d.msg || d).join(", ") : "Failed to send message."));
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleCancelEmailModal = () => {
    setIsEmailModalOpen(false);
    if (pendingBcetData) {
      handleCancelBcetImport();
    }
  };

  const handleSendEmailFromModal = async () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      toast.warning("Subject and message are required.");
      return;
    }

    let currentApplicants = applicants;
    if (pendingBcetData) {
      const success = await handleConfirmBcetImport();
      if (!success) return;
      currentApplicants = pendingBcetData.updatedApplicants;
    }

    const currentAY = activeYear || "2026-2027";
    let targets = currentApplicants.filter(a => emailTargetIds.includes(a.id));

    if (selectedDropdownTarget !== "all") {
      targets = targets.filter(a => a.id === selectedDropdownTarget);
    }

    // Prevent duplicate emails for admission notice
    if (selectedEmailTemplateType === "Admission Qualification Notice") {
      // Only send to applicants that have PASSED (i.e. reached program capacity or been confirmed as passed)
      targets = targets.filter(a => {
        const remark = normalizeAdmissionRemark(a.admissionRemarks);
        return remark === "Passed" || remark === "Accepted";
      });
      // Prevent duplicate emails
      targets = targets.filter(a => !(a.sentEmails && a.sentEmails.some(e => e.type === "Admission Qualification Notice")));
      if (targets.length === 0) {
        toast.info("No eligible applicants to notify. Only Passed applicants who have not yet received the notice will be included.");
        setIsEmailModalOpen(false);
        return;
      }
    } else if (targets.length === 0) {
      toast.warning("No applicants selected.");
      return;
    }

    const emailsToSend = targets.map(app => {
      const appType = app.profile?.appDetails?.applicantType || app.type || "";
      const reqs = getEmailRequirements(app, selectedEmailTemplateType);
      const toEmail = app.profile?.personal?.email || app.email || "";
      const upperName = (app.name || "").toUpperCase();
      const applicantNo = app.id || "N/A";
      const activeProgram = app.isReassigned
        ? (app.profile?.appDetails?.firstChoice || "N/A")
        : (app.isRejectedFirstChoice ? (app.profile?.appDetails?.secondChoice || "N/A") : (app.profile?.appDetails?.firstChoice || "N/A"));

      const reconsiderationChoice = selectedEmailTemplateType === "Letter of Reconsideration" && reconsiderationProgram && emailTargetIds.length === 1
        ? reconsiderationProgram
        : null;
      const course = reconsiderationChoice
        ? getProgramForChoice(app, reconsiderationChoice)
        : activeProgram;

      const interviewDate = app.profile?.interviewDate ? app.profile.interviewDate.split(" ")[0] : "TBA";
      const interviewTime = app.profile?.interviewSession === 'Morning' ? 'Morning Session (8am-12pm)' : app.profile?.interviewSession === 'Afternoon' ? 'Afternoon Session (1pm-4pm)' : (app.profile?.interviewSession || app.profile?.interviewTime || "8:00 AM - 5:00 PM");
      const interviewLocation = app.profile?.interviewLocation || "TBA";

      const displayCourse = course ? course.split(" - ")[0].trim() : "N/A";

      let personalizedMsg = emailMessage
        .replace(/\[APPLICANT NAME\]/g, upperName)
        .replace(/\[APPLICANT NO\.?\]/gi, applicantNo)
        .replace(/\[COURSE\]/gi, displayCourse)
        .replace(/\[PROGRAM\]/gi, displayCourse)
        .replace(/\[REQUIREMENTS\]/g, reqs)
        .replace(/\[Year & Semester\]/g, currentAY)
        .replace(/\[Interview Date\]/gi, interviewDate)
        .replace(/\[Interview Time\]/gi, interviewTime)
        .replace(/\[Interview Location\]/gi, interviewLocation);

      let htmlMessage = `<div style="font-family: sans-serif; white-space: pre-wrap;">${personalizedMsg}</div>`;
      if (htmlMessage.includes("[Accept Slot]") || htmlMessage.includes("[Accept Offer]")) {
        const baseUrl = import.meta.env.VITE_APPLICANT_URL || import.meta.env.VITE_FRONTEND_URL || window.location.origin;
        const acceptLink = `${baseUrl}/accept-offer?id=${app.rawId || app._id}`;
        const buttonHtml = `
          <div style="margin-top: 5px; margin-bottom: 5px;">
            <a href="${acceptLink}" style="display: inline-block; padding: 10px 24px; background-color: #376e35; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; border: 1px solid black;">Accept Slot</a>
          </div>
        `;
        htmlMessage = htmlMessage.replace(/\[Accept Slot\]|\[Accept Offer\]/g, buttonHtml);
        personalizedMsg = personalizedMsg.replace(/\[Accept Slot\]|\[Accept Offer\]/g, `Accept Slot: ${acceptLink}`);
      } else if (selectedEmailTemplateType === "Admission Qualification Notice" || selectedEmailTemplateType === "Letter of Reconsideration") {
        const baseUrl = import.meta.env.VITE_APPLICANT_URL || import.meta.env.VITE_FRONTEND_URL || window.location.origin;
        const acceptLink = `${baseUrl}/accept-offer?id=${app.rawId || app._id}`;
        const buttonHtml = `
          <div style="margin-top: 5px; margin-bottom: 5px;">
            <a href="${acceptLink}" style="display: inline-block; padding: 10px 24px; background-color: #376e35; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; border: 1px solid black;">Accept Slot</a>
          </div>
        `;
        if (htmlMessage.includes("Note:")) {
          htmlMessage = htmlMessage.replace("Note:", buttonHtml + "Note:");
        } else {
          htmlMessage += buttonHtml;
        }
      }

      return {
        email: toEmail,
        subject: emailSubject,
        message: personalizedMsg,
        htmlMessage: htmlMessage,
        applicantId: app.rawId || app._id,
        type: selectedEmailTemplateType || "Admission Qualification Notice"
      };
    }).filter(e => e.email);

    if (emailsToSend.length === 0) {
      toast.warning("Selected applicants do not have valid email addresses.");
      return;
    }

    try {
      setIsSendingMessage(true);
      const res = await api.post('/admin/emails/send-bulk', { emails: emailsToSend });

      if (selectedEmailTemplateType === "Letter of Reconsideration") {
        for (const target of targets) {
          const selectedProgram = getProgramForChoice(target, reconsiderationProgram);
          await api.put(`/admin/applicant/${target.rawId}`, {
            isRejectedFirstChoice: reconsiderationProgram === "second",
            isRejectedSecondChoice: false,
            reconsiderationProgram: selectedProgram || "",
            reconsiderationProgramChoice: reconsiderationProgram || "first"
          });
          await api.put(`/admin/applicant/${target.rawId}/status`, { status: "Passed" })
            .catch(() => api.patch(`/admin/applicant/${target.rawId}/status`, { status: "Passed" }));
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      toast.success(res.data.message || `Successfully sent ${emailsToSend.length} emails!`);

      setApplicants(prev => prev.map(a => {
        if (emailTargetIds.includes(a.id)) {
          return {
            ...a,
            isEmailSent: true,
            sentEmails: [...(a.sentEmails || []), { type: selectedEmailTemplateType }],
            ...(selectedEmailTemplateType === "Letter of Reconsideration"
              ? {
                admissionRemarks: "Passed",
                admissionStatus: "Passed",
                status: "Passed",
                slotStatus: "Pending",
                isRejectedFirstChoice: reconsiderationProgram === "second",
                isRejectedSecondChoice: false,
                reconsiderationProgram: getProgramForChoice(a, reconsiderationProgram),
                reconsiderationProgramChoice: reconsiderationProgram || "first",
                isSlidUp: false
              }
              : {})
          };
        }
        return a;
      }));

      setIsEmailModalOpen(false);
      setSelectedIds([]);
      if (selectedEmailTemplateType === "Letter of Reconsideration") {
        await fetchApplicants();
      }
    } catch (err) {
      console.error(err);
      let errorMsg = "Failed to send emails.";
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMsg = err.response.data.detail.map(d => typeof d === 'string' ? d : d.msg).join(", ");
        } else if (typeof err.response.data.detail === 'string') {
          errorMsg = err.response.data.detail;
        } else {
          errorMsg = JSON.stringify(err.response.data.detail);
        }
      }
      toast.error(errorMsg);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSaveEmailTemplate = async (forceSave = false) => {
    // Protect placeholders - check that required placeholders are still present
    const requiredPlaceholders = ['[APPLICANT NAME]', '[REQUIREMENTS]']; // Relaxed APPLICANT NO requirement to allow dot variation
    const missingPlaceholders = requiredPlaceholders.filter(p => !emailMessage.includes(p));

    if (missingPlaceholders.length > 0 && !forceSave) {
      setMissingPlaceholdersModal(missingPlaceholders);
      return;
    }

    try {
      const res = await api.get('/public/settings');
      let templates = res.data?.emailTemplate?.templates || [];

      const idx = templates.findIndex(t => t.title === selectedEmailTemplateType);
      if (idx !== -1) {
        templates[idx].subject = emailSubject;
        templates[idx].message = emailMessage;
      } else {
        templates.push({ title: selectedEmailTemplateType, subject: emailSubject, message: emailMessage });
      }

      await api.put('/admin/settings/email-template', { templates, subject: "LEGACY_SUBJECT", message: "LEGACY_MESSAGE" });
      toast.success(`${selectedEmailTemplateType} template saved successfully!`);
    } catch (err) {
      toast.error("Failed to save template.");
    }
  };

  // --- CSV IMPORT ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setLoading(true);
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const validRows = rows.filter(row => row.length > 0);

        if (validRows.length < 2) { toast.warning("File appears empty or invalid."); setLoading(false); return; }

        const headers = validRows[0].map(h => String(h || "").toLowerCase());
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const idIdx = headers.findIndex(h => h.includes('applicant id') || h.includes('student id') || h === 'id');
        const scoreIdx = headers.findIndex(h => h.includes('test score') || h.includes('raw score') || h.includes('score') || h.includes('bcet') || h.includes('grade') || h.includes('remark'));
        const highestScoreIdx = headers.findIndex(h => h.includes('highest') || h.includes('max') || h.includes('total score') || h.includes('possible'));

        if (nameIdx === -1 && idIdx === -1) {
          toast.warning("Could not find a 'Name' or 'ID' column. Please check your Excel file headers.");
          setLoading(false); return;
        }
        if (scoreIdx === -1) {
          toast.warning("Could not find a 'Score' column. Please check your Excel file headers.");
          setLoading(false); return;
        }

        let importMatchCount = 0;
        let newImportCount = 0;

        // Fetch ALL submitted applicants from the API (not just interviewed ones)
        // so that CSV names can match anyone who has submitted, regardless of interview status
        let allApplicantsRaw = [];
        try {
          const allRes = await api.get('/admin/applicants', { params: { schoolYear: activeYear } });
          allApplicantsRaw = allRes.data || [];
        } catch (e) {
          allApplicantsRaw = [];
        }

        // Format them the same way fetchApplicants does, but include ALL submitted applicants
        const formatRaw = (app) => {
          const safe = getSafeApplicant(app);
          const fullName = `${app.lastName || ''}, ${app.firstName || ''}${app.middleName ? ' ' + app.middleName : ''}`.trim().toUpperCase();
          return {
            ...safe,
            rawId: app._id || app.id,
            id: app.applicantId || app.applicationId || safe.id,
            name: (app.name || fullName).toUpperCase(),
            type: app.type || app.applicantType || "N/A",
            location: app.location || app.presentCity?.toUpperCase() || "N/A",
            interviewRemarks: app.interviewScore !== undefined && app.interviewScore !== null ? "Passed"
              : (app.interviewStatus === 'Passed' ? "Passed" : (app.interviewStatus === 'Failed' ? "Failed" : "Pending")),
            bcetRemarks: (app.examScore && app.examScore > 0) ? (app.examScore >= 37.5 ? "Passed" : "Failed")
              : (app.examStatus === "Passed" || app.examStatus === "Failed" ? app.examStatus : "Pending"),
            admissionRemarks: app.admissionRemarks || app.admissionStatus || app.status || "Pending",
            admissionStatus: app.admissionStatus || app.status || "Pending",
            status: app.admissionStatus || app.status || "Pending",
            slotStatus: app.slotStatus || "Pending",
            isEmailSent: app.isEmailSent || false,
            sentEmails: app.sentEmails || [],
            interviewRatings: app.interviewRatings || {},
            interviewer: app.interviewer || "",
            interviewScore: app.interviewScore || 0,
            examScore: app.examScore || 0,
            bcetRawScore: app.bcetRawScore || null,
            bcetHighestScore: app.bcetHighestScore || null,
            isRejectedFirstChoice: app.isRejectedFirstChoice === true,
            isRejectedSecondChoice: app.isRejectedSecondChoice === true,
            reconsiderationProgram: app.reconsiderationProgram || "",
          };
        };

        const updatedApplicants = allApplicantsRaw.map(formatRaw);

        // 1. First, apply all BCET scores from the CSV to the applicants in memory
        for (let i = 1; i < validRows.length; i++) {
          const row = validRows[i];
          const rawName = nameIdx !== -1 ? row[nameIdx] : null;
          const rawId = idIdx !== -1 ? row[idIdx] : null;
          const rawValue = row[scoreIdx];

          if ((!rawName && !rawId) || rawValue === undefined || rawValue === null || rawValue === "") continue;

          const rawHighest = highestScoreIdx !== -1 ? row[highestScoreIdx] : null;

          let numericScore = 0;
          const stringValue = String(rawValue).trim().toLowerCase();

          if (stringValue === "passed" || stringValue === "pass") {
            numericScore = 37.5;
          } else if (stringValue === "failed" || stringValue === "fail") {
            numericScore = 37;
          } else {
            const score = parseFloat(rawValue);
            if (!isNaN(score)) {
              if (rawHighest !== null && rawHighest !== undefined && rawHighest !== "") {
                const highest = parseFloat(rawHighest);
                if (!isNaN(highest) && highest > 0) {
                  numericScore = (score / highest) * 50;
                } else {
                  numericScore = score;
                }
              } else {
                numericScore = score;
              }
            } else { continue; }
          }

          const appIndex = updatedApplicants.findIndex(a => {
            if (rawId && a.id && String(a.id).trim().toLowerCase() === String(rawId).trim().toLowerCase()) return true;
            if (rawName && a.name && a.name.trim().toLowerCase() === String(rawName).trim().toLowerCase()) return true;
            return false;
          });

          if (appIndex !== -1) {
            importMatchCount++;
            const existingScore = updatedApplicants[appIndex].examScore;
            if (!existingScore || existingScore === 0) {
              newImportCount++;
            }
            const rawTestScore = parseFloat(rawValue);
            const rawHighestVal = (rawHighest !== null && rawHighest !== undefined && rawHighest !== "") ? parseFloat(rawHighest) : null;
            updatedApplicants[appIndex] = {
              ...updatedApplicants[appIndex],
              examScore: numericScore,
              bcetRawScore: !isNaN(rawTestScore) ? rawTestScore : null,
              bcetHighestScore: (rawHighestVal !== null && !isNaN(rawHighestVal) && rawHighestVal > 0) ? rawHighestVal : null,
              bcetRemarks: numericScore >= 37.5 ? "Passed" : "Failed",
            };
          }
        }

        if (importMatchCount === 0) {
          toast.warning("No applicants matched the names in the Excel file.");
          setLoading(false);
          return;
        }

        const updatesToPush = [];
        const passedIdsToEmail = [];

        const activePrograms = [...new Set(updatedApplicants.map(a => getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList)))];

        activePrograms.forEach(abbr => {
          const course = coursesList.find(c => c.abbreviation === abbr);
          if (!course) return;

          const parsedLimit = parseInt(course.limit) || 0;
          const limit = parsedLimit > 0 ? parsedLimit : Infinity;

          // Find all applicants for this program who have a BCET score from the CSV import
          const programApps = updatedApplicants.filter(a => {
            const activeAbbr = getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList);
            return activeAbbr === abbr && a.bcetRemarks && a.bcetRemarks !== "Pending";
          });

          // Confirmed/admitted AND forfeited applicants hold seats.
          // Forfeited applicants keep their seat locked until the admin explicitly sends
          // a Letter of Reconsideration — only then does a waitlisted applicant get promoted.
          const seated = programApps.filter(a => {
            const slot = (a.slotStatus || "").toString().toLowerCase();
            const admissionStatus = (a.admissionStatus || a.status || "").toString().toLowerCase();
            return slot === "admitted" || slot === "accepted" || slot === "forfeit" || slot === "forfeited" ||
              admissionStatus === "confirmed" || admissionStatus === "admitted" || admissionStatus === "forfeit" || admissionStatus === "forfeited";
          }).length;

          // Apps eligible for ranking: not fixed or failed
          const rankableApps = programApps.filter(a => {
            const slot = (a.slotStatus || "").toString().toLowerCase();
            const admissionStatus = (a.admissionStatus || a.status || "").toString().toLowerCase();
            const remark = normalizeAdmissionRemark(a.admissionRemarks);
            return !["admitted", "accepted", "forfeit", "forfeited"].includes(slot) &&
              !["confirmed", "admitted", "forfeit", "forfeited"].includes(admissionStatus) &&
              remark !== "Failed";
          });

          // Calculate total_percentage for each and split into Passed/Failed based on 75 cutoff
          const passingApps = [];

          rankableApps.forEach(app => {
            const totalPerc = parseFloat(calculateTotal(app));
            const appIndex = updatedApplicants.findIndex(x => x.rawId === app.rawId);

            if (totalPerc < 75) {
              const newStatus = "Failed";
              updatedApplicants[appIndex] = { ...updatedApplicants[appIndex], admissionRemarks: newStatus, admissionStatus: newStatus, status: newStatus };
              updatesToPush.push({ rawId: app.rawId, examScore: updatedApplicants[appIndex].examScore, status: "Failed" });
            } else {
              passingApps.push({ app: updatedApplicants[appIndex], totalPerc, appIndex });
            }
          });

          // Sort passing apps descending
          passingApps.sort((a, b) => b.totalPerc - a.totalPerc);

          // Apply capacity limit
          let currentSeated = seated;
          const programPassedIds = [];
          passingApps.forEach((item) => {
            let newStatus = currentSeated < limit ? "Passed" : "Waitlisted";
            if (newStatus === "Passed") {
              currentSeated++;
            }
            let dbStatus = newStatus;

            updatedApplicants[item.appIndex] = {
              ...updatedApplicants[item.appIndex],
              admissionRemarks: newStatus,
              admissionStatus: newStatus,
              status: newStatus
            };

            updatesToPush.push({ rawId: item.app.rawId, examScore: item.app.examScore, bcetRawScore: item.app.bcetRawScore, bcetHighestScore: item.app.bcetHighestScore, status: dbStatus });

            const hasReceivedAdmissionEmail = item.app.sentEmails && item.app.sentEmails.some(e => e.type === "Admission Qualification Notice");

            if (newStatus === "Passed" && !hasReceivedAdmissionEmail) {
              programPassedIds.push(item.app.id);
            }
          });

          // Queue emails for all applicants who successfully secured a slot
          passedIdsToEmail.push(...programPassedIds);
        });

        // Dedup updatesToPush to only get the latest for each rawId
        const uniqueUpdates = Array.from(new Map(updatesToPush.map(u => [u.rawId, u])).values());

        // Store pending data and show confirmation modal instead of saving immediately
        const passedCount = uniqueUpdates.filter(u => u.status === "Passed").length;
        const failedCount = uniqueUpdates.filter(u => u.status === "Failed").length;
        const waitlistedCount = uniqueUpdates.filter(u => u.status === "Waitlisted").length;

        const newPendingData = {
          updatedApplicants,
          uniqueUpdates,
          passedIdsToEmail,
          importMatchCount: newImportCount,
          summary: { passed: passedCount, failed: failedCount, waitlisted: waitlistedCount, total: uniqueUpdates.length }
        };

        const uniquePassedIds = [...new Set(passedIdsToEmail)];
        if (uniquePassedIds.length > 0) {
          setPendingBcetData(newPendingData);
          setSelectedIds(uniquePassedIds);
          openEmailModal("Admission Qualification Notice", uniquePassedIds);
        } else {
          // If no one passed, just save immediately
          await handleConfirmBcetImport(newPendingData);
        }

      } catch (err) {
        console.error("Error processing Excel file:", err);
        toast.error("Failed to parse the Excel file.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = null;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmBcetImport = async (directData = null) => {
    const dataToUse = directData || pendingBcetData;
    if (!dataToUse) return false;
    try {
      setLoading(true);
      const { updatedApplicants, uniqueUpdates } = dataToUse;

      if (uniqueUpdates.length > 0) {
        for (const update of uniqueUpdates) {
          try {
            await api.put(`/admin/applicant/${update.rawId}/status`, { status: update.status, examScore: update.examScore, bcetRawScore: update.bcetRawScore, bcetHighestScore: update.bcetHighestScore })
              .catch(() => api.patch(`/admin/applicant/${update.rawId}/status`, { status: update.status, examScore: update.examScore, bcetRawScore: update.bcetRawScore, bcetHighestScore: update.bcetHighestScore }));
          } catch (dbErr) {
            console.error(`Failed to update DB for applicant ${update.rawId}:`, dbErr);
          }
        }
      }

      setApplicants(updatedApplicants);
      toast.success(`Import successful! Evaluated and saved ${uniqueUpdates.length} applicants.`);
      return true;
    } catch (err) {
      console.error("Error saving BCET data:", err);
      toast.error("Failed to save BCET data.");
      return false;
    } finally {
      setLoading(false);
      setPendingBcetData(null);
    }
  };

  const handleCancelBcetImport = () => {
    setPendingBcetData(null);
    setIsBcetConfirmOpen(false);
    toast.info("BCET import cancelled. No changes were saved.");
  };

  const formatAddress = (addr) => {
    if (!addr) return "N/A";
    return `${addr.houseStreet} ${addr.barangay}, ${addr.city}, ${addr.province}`.toUpperCase();
  };

  const formatFamilyName = (person) => {
    if (!person || person.firstName === 'N/A') return "N/A";
    const middle = person.middleName && person.middleName !== 'N/A' ? person.middleName : '';
    return `${person.firstName} ${middle} ${person.surname}`.replace(/\s+/g, ' ').trim().toUpperCase();
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.2));
  const handleResetZoom = () => setZoomLevel(0.8);
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
  };

  const getWeightedScore = (rating, weight) => { const r = parseFloat(rating); if (isNaN(r)) return 0; return (r * (weight / 100)); };
  const getSectionTotal = (section, ratings) => { let total = 0; section.criteria.forEach(crit => { total += getWeightedScore(ratings?.[crit.id], crit.weight); }); return total.toFixed(2); };

  const getRemarks = (scoreVal) => {
    const score = parseFloat(scoreVal);
    if (isNaN(score) || score === 0) return { label: "NO RATING", color: " text-gray-500 border rounded" };
    if (score >= 90) return { label: "EXCELLENT", color: "text-green-800 border rounded" };
    if (score >= 80) return { label: "VERY GOOD", color: " text-blue-800 border rounded" };
    if (score >= 70) return { label: "GOOD", color: " text-teal-800 border rounded" };
    if (score >= 60) return { label: "FAIR", color: " text-yellow-800 border rounded" };
    return { label: "POOR", color: " text-red-800 border rounded" };
  };

  // --- EXPORT LOGIC ---
  const getTargetApplicants = (passedOnly = false) => {
    let apps = selectedIds.length > 0 ? filteredApplicants.filter(a => selectedIds.includes(a.id)) : [...filteredApplicants];
    if (passedOnly) {
      apps = apps.filter(a => a.admissionRemarks === 'Passed');
    }
    return apps.sort((a, b) => {
      const getFullName = (app) => {
        const p = app.profile?.personal || {};
        return p.surname ? `${p.surname}, ${p.firstName}${p.middleName && p.middleName !== 'N/A' ? ' ' + p.middleName : ''}` : (app.name || "");
      };
      return getFullName(a).localeCompare(getFullName(b));
    });
  };

  const handleExportPDF = () => {
    const targetApps = getTargetApplicants(true);
    const programNames = [...new Set(targetApps.map(a => getCourseFullName(a.profile?.appDetails?.firstChoice, coursesList)))];
    const displayProgram = programNames.length === 1 ? programNames[0].toUpperCase() : "ALL PROGRAMS";

    const printWindow = window.open('', '_blank');
    const htmlContent = `
      <html>
        <head>
          <title>BTECH COLLEGE ENTRANCE TEST</title> 
          <style>
            @page { size: letter portrait; margin: 0.5in 0.75in 0.5in 0.75in; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; line-height: 1.5; color: #000; font-size: 11pt; padding-bottom: 100px; }
            .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; }
            .header img { width: 80px; height: auto; }
            .header-text h3 { margin: 0; font-size: 16pt; text-transform: uppercase; font-weight: bold; color: #002060; line-height: 1.1; }
            .header-text h4 { margin: 2px 0 0 0; font-size: 10pt; text-transform: uppercase; font-weight: normal; color: #002060; }
            .intro { text-align: justify; margin-bottom: 30px; text-indent: 0.5in; }
            .name-list { column-count: 2; column-gap: 40px; margin-top: 20px; }
            .name-list div { margin-bottom: 5px; font-weight: normal; }
            .pabatid { position: fixed; bottom: 0; left: 0; right: 0; text-align: justify; font-size: 11pt; padding-bottom: 20px; background-color: #fff; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${window.location.origin}/img/btech.png" alt="BTECH Logo" />
            <div class="header-text">
                <h3>BTECH COLLEGE</h3>
                <h3>ENTRANCE TEST</h3>
                <h4>(${activeYear ? activeYear : "SEMESTER, ACADEMIC YEAR"})</h4>
            </div>
          </div>
          <p class="intro">
            Narito ang talaan ng mga pangalan ng mga nakapasa sa BTECH College Entrance Test (BCET) para sa Taong Panuruan ${activeYear} na inirerekomenda para sa kursong ${displayProgram}.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tbody>
              ${(() => {
        let rowsHtml = '';
        const itemsPerColumn = 26;
        const numPages = Math.ceil(targetApps.length / (itemsPerColumn * 2)) || 1;
        for (let p = 0; p < numPages; p++) {
          const pageStartIndex = p * itemsPerColumn * 2;
          for (let r = 0; r < itemsPerColumn; r++) {
            const leftIndex = pageStartIndex + r;
            const rightIndex = pageStartIndex + itemsPerColumn + r;

            if (leftIndex >= targetApps.length && rightIndex >= targetApps.length) {
              break;
            }

            const app1 = targetApps[leftIndex];
            const app2 = targetApps[rightIndex];

            const getName = (a) => {
              if (!a) return "";
              const p = a.profile?.personal || {};
              return (p.surname ? `${p.surname}, ${p.firstName} ${p.middleName && p.middleName !== 'N/A' ? p.middleName : ''}` : (a.name || "")).toUpperCase().trim();
            };

            rowsHtml += `<tr>
                              <td style="width: 50%; padding-bottom: 5px;">${getName(app1)}</td>
                              <td style="width: 50%; padding-bottom: 5px;">${getName(app2)}</td>
                          </tr>`;
          }
        }
        return rowsHtml;
      })()}
            </tbody>
          </table>
          <p class="pabatid">
            PABATID: Ang lahat ng nakapasa sa pagsusulit ay kailangang ipagpatuloy ang proseso ng enrollment. Ang bawat Instituto ay magsasagawa ng karagdagang ebalwasyon at pagsasala bilang bahagi ng opisyal na proseso ng pagtanggap ng mag-aaral.
          </p>
          <script>setTimeout(() => { window.print(); window.close(); }, 250);</script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setIsExportMenuOpen(false);
  };

  const handleExportDOCX = async () => {
    const targetApps = getTargetApplicants(true);
    const programNames = [...new Set(targetApps.map(a => getCourseFullName(a.profile?.appDetails?.firstChoice, coursesList)))];
    const displayProgram = programNames.length === 1 ? programNames[0].toUpperCase() : "ALL PROGRAMS";

    let logoBlob = null;
    try {
      const res = await fetch('/img/btech.png');
      logoBlob = await res.arrayBuffer();
    } catch (e) {
      console.error("Failed to load logo", e);
    }

    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: logoBlob ? [new ImageRun({ data: logoBlob, transformation: { width: 80, height: 80 } })] : []
                })
              ]
            }),
            new TableCell({
              width: { size: 85, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({ spacing: { after: 0, before: 0 }, children: [new TextRun({ text: "BTECH COLLEGE", size: 32, font: "Arial", color: "002060", bold: true })] }),
                new Paragraph({ spacing: { after: 0, before: 0 }, children: [new TextRun({ text: "ENTRANCE TEST", size: 32, font: "Arial", color: "002060", bold: true })] }),
                new Paragraph({ spacing: { after: 0, before: 0 }, children: [new TextRun({ text: `(${activeYear || "SEMESTER, ACADEMIC YEAR"})`, size: 22, font: "Arial", color: "002060" })] })
              ]
            })
          ]
        })
      ]
    });

    const introText = new Paragraph({
      children: [
        new TextRun({ text: `Narito ang talaan ng mga pangalan ng mga nakapasa sa BTECH College Entrance Test (BCET) para sa Taong Panuruan ${activeYear} na inirerekomenda para sa kursong ${displayProgram}.`, size: 22, font: "Arial" })
      ],
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: 720 },
      spacing: { before: 400, after: 400 }
    });

    const nameRows = [];
    const itemsPerColumn = 26;
    const numPages = Math.ceil(targetApps.length / (itemsPerColumn * 2)) || 1;

    for (let p = 0; p < numPages; p++) {
      const pageStartIndex = p * itemsPerColumn * 2;
      for (let r = 0; r < itemsPerColumn; r++) {
        const leftIndex = pageStartIndex + r;
        const rightIndex = pageStartIndex + itemsPerColumn + r;

        if (leftIndex >= targetApps.length && rightIndex >= targetApps.length) {
          break;
        }

        const app1 = targetApps[leftIndex];
        const app2 = targetApps[rightIndex];

        const getName = (a) => {
          if (!a) return "";
          const p = a.profile?.personal || {};
          return (p.surname ? `${p.surname}, ${p.firstName} ${p.middleName && p.middleName !== 'N/A' ? p.middleName : ''}` : (a.name || "")).toUpperCase().trim();
        };

        nameRows.push(new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: getName(app1), size: 20, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: getName(app2), size: 20, font: "Arial" })] })]
            })
          ]
        }));
      }
    }

    const namesTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
      rows: nameRows
    });

    const pabatidText = new Paragraph({
      children: [
        new TextRun({ text: "PABATID: Ang lahat ng nakapasa sa pagsusulit ay kailangang ipagpatuloy ang proseso ng enrollment. Ang bawat Instituto ay magsasagawa ng karagdagang ebalwasyon at pagsasala bilang bahagi ng opisyal na proseso ng pagtanggap ng mag-aaral.", size: 22, font: "Arial" })
      ],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 800 }
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 1080,
              right: 1080
            }
          }
        },
        children: [headerTable, introText, namesTable, pabatidText]
      }]
    });

    Packer.toBlob(doc).then(blob => {
      saveAs(blob, `Applicants_${displayProgram}.docx`);
    });
    setIsExportMenuOpen(false);
  };

  const handleExportExcel = () => {
    const targetApps = getTargetApplicants();

    const headers = [
      "APPLICANT ID", "APPLICANT TYPE", "PROGRAM", "APPLICANT FULL NAME",
      "FULL PERMANENT ADDRESS", "FULL PRESENT ADDRESS", "GENDER", "DATE OF BIRTH", "PLACE OF BIRTH",
      "CIVIL STATUS", "NAME OF SPOUSE IF MARRIED", "EMAIL ADDRESS", "CONTACT NUMBER",
      "ELEMENTARY SCHOOL", "ELEMENTARY ADDRESS", "ELEM YEAR",
      "JHS SCHOOL", "JHS ADDRESS", "JHS YEAR",
      "SHS SCHOOL", "SHS ADDRESS", "GRADE 11 GWA", "GRADE 12 GWA", "SHS YEAR", "TRACK", "STRAND/ELECTIVES",
      "TERTIARY/ALS SCHOOL", "TERTIARY/ALS ADDRESS", "TERTIARY/ALS YEAR GRADUATED", "LATEST GWA",
      "FATHER'S NAME", "CONTACT NUMBER", "MOTHER'S MAIDEN NAME", "CONTACT NUMBER",
      "ICC/IP", "SOLO PARENT", "SSN/DISABILITY", "4PS", "OFW",
    ];

    const formatFam = (person) => {
      if (!person || person.firstName === 'N/A') return "N/A";
      const middle = person.middleName && person.middleName !== 'N/A' ? person.middleName : '';
      return `${person.firstName} ${middle} ${person.surname}`.replace(/\s+/g, ' ').trim();
    };

    const formatAddr = (addr) => {
      if (!addr) return "N/A";
      return `${addr.houseStreet || ''} ${addr.barangay || ''}, ${addr.city || ''}, ${addr.province || ''}`.replace(/\s+/g, ' ').trim();
    };

    const excelData = [headers];

    targetApps.forEach(app => {
      const p = app.profile?.personal || {};
      const f = app.profile?.family || {};
      const ed = app.profile?.education || {};
      const o = app.profile?.otherInfo || {};
      const a = app.profile?.appDetails || {};
      const edElem = ed.elem || {};
      const edJhs = ed.jhs || {};
      const edShs = ed.shs || {};
      const edTert = ed.tertiary || {};

      const activeAbbr = getCourseFullName(
        app.isReassigned
          ? a.firstChoice
          : (app.isRejectedFirstChoice ? a.secondChoice : a.firstChoice),
        coursesList
      );

      const rawRow = [
        app.id || "N/A",
        a.applicantType || app.type || "N/A",
        activeAbbr,
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
          ws[cellRef].s = { alignment: { horizontal: "center", vertical: "center" }, font: { bold: true } };
        } else {
          ws[cellRef].s = { alignment: { horizontal: "left", vertical: "center" } };
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AdmissionResults");
    XLSX.writeFile(wb, `Applicant Details ${activeYear}.xlsx`);
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
                        <span>${chk(appType === 'FRESHMEN' || appType === 'SENIOR HIGH SCHOOL GRADUATE')} Freshmen</span>
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

                <div style="margin-top: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                        <div style="flex: 1; padding-right: 15px;">MEMBER OF AN INDIGENOUS CULTURAL COMMUNITY (ICC) /INDIGENOUS PEOPLE (IP)?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isIndig)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isIndig)} NO <span style="flex: 1; border-bottom: 1px solid black; margin-left: 10px; display: inline-block; height: 12px; font-size: 8px; text-align: center; padding-top: 2px;">${indigenousSpec}</span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <div style="flex: 1; padding-right: 15px;">CHILD OF A SOLO PARENT OR SOLO PARENT?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isSolo)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isSolo)} NO <span style="flex: 1; border-bottom: 1px solid black; margin-left: 10px; display: inline-block; height: 12px;"></span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <div style="flex: 1; padding-right: 15px;">STUDENT WITH SPECIAL NEEDS (SSN) AND OTHER TYPES OF DISABILITIES?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isPwd)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isPwd)} NO <span style="flex: 1; border-bottom: 1px solid black; margin-left: 10px; display: inline-block; height: 12px; font-size: 8px; text-align: center; padding-top: 2px;">${pwdSpec}</span></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <div style="flex: 1; padding-right: 15px;">MEMBER OF PANTAWID PAMILYANG PILIPINO PROGRAM (4PS)?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(is4Ps)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!is4Ps)} NO</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                        <div style="flex: 1; padding-right: 15px;">CHILD OF OVERSEAS FILIPINO WORKER/S (OFW)?</div>
                        <div style="width: 200px; display: flex; align-items: center; white-space: nowrap;">${chk(isOfw)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isOfw)} NO</div>
                    </div>
                </div>

                <div class="row items-center" style="margin-top: 5px; margin-bottom: 5px;">
                    <span class="label">DEGREE COURSE(S) APPLIED FOR</span>
                    <span class="label" style="margin-left: 20px;">1<sup>ST</sup> Choice</span>
                    <div class="flex-1 field-underline"><div${app.isRejectedFirstChoice ? ' style="text-decoration: line-through; color: #999;"' : ''}>${a.firstChoice ? a.firstChoice.split(' - ')[0].trim() : ''}</div></div>
                    <span class="label" style="margin-left: 20px;">2<sup>nd</sup> Choice</span>
                    <div class="flex-1 field-underline"><div>${app.isReassigned ? '' : (a.secondChoice ? a.secondChoice.split(' - ')[0].trim() : '')}</div></div>
                </div>

                <div style="font-size: 10px; margin-bottom: 5px;">
                    <p style="margin-bottom: 5px; font-weight: bold;">I HEREBY AFFIRM THAT:</p>
                    <ul style="margin-top: 0; padding-left: 20px;">
                        <li>THE ABOVE INFORMATION GIVEN ARE TRUE AND CORRECT.</li>
                        <li>I UNDERSTAND THAT GIVING FALSE INFORMATION WILL AUTOMATICALLY DISQUALIFY ME FOR ADMISSION.</li>
                        <li>IF ADMITTED, BY THE RULES AND REGULATIONS OF THE BTECH, I HEREBY ALLOW/AUTHORIZE THE BTECH TO USE, COLLECT, AND PROCESS THE INFORMATION FOR LEGITIMATE PURPOSES SPECIFICALLY THE PROMOTION OF THE COLLEGE COURSES AND SERVICES.</li>
                        <li>I ALLOW AUTHORIZED PERSONNEL TO PROCESS THE INFORMATION PURSUANT TO THE DATA PRIVACY OF POLICIES OF THE COLLEGE.</li>
                        <li>I ACKNOWLEDGE THAT ALL DOCUMENTS SUBMITTED FOR ADMISSION SHALL BECOME THE PROPERTY OF THE BTECH, AND THAT TRANSFER CREDENTIALS WILL BE ISSUED IF I TRANSFER TO ANOTHER EDUCATIONAL INSTITUTION.</li>
                    </ul>
                </div>

                <div style="display: flex; justify-content: flex-end; margin-bottom: 5px;">
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
                    <p style="font-weight: bold; margin-bottom: 3px;">Documents Submitted: (Please submit your documents inside <span style="text-decoration: underline;">Long Brown Envelope</span>.)</p>
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

  const getColSpan = () => {
    return 8;
  };

  const is2ndSemesterActive = activeYear ? activeYear.toLowerCase().includes('2nd semester') : false;

  if (loading && applicants.length === 0) {
    return <PageLoader message="Loading admission data..." />;
  }

  return (
    <div className={`h-screen w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${false ? 'ml-2' : 'ml-2'
      }`}>

      <main className="flex-1 flex flex-col px-6 py-4 w-full h-full relative">
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
                placeholder="Search applicant name or ID"
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
                    <label className="block text-xs font-semibold mb-1 uppercase tracking-tight">Admission Status</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full mb-4 p-2 border rounded text-[12px] outline-none">
                      <option value="All">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Passed">Passed</option>
                      <option value="Failed">Failed</option>
                      <option value="Waitlisted">Waitlisted</option>
                    </select>

                    <label className="block text-xs font-semibold mb-1 uppercase tracking-tight">Sort By</label>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full mb-4 p-2 border rounded text-[12px] outline-none">
                      <option value="Total %: Highest to Lowest">Total %: Highest to Lowest</option>
                      <option value="Total %: Lowest to Highest">Total %: Lowest to Highest</option>
                    </select>

                    <label className="block text-xs font-semibold mb-1 uppercase tracking-tight">Program</label>
                    <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full mb-4 p-2 border rounded text-[12px] outline-none">
                      <option value="All">All Programs</option>
                      {coursesList.map(c => (
                        <option key={c._id || c.id} value={c.abbreviation}>{c.abbreviation}</option>
                      ))}
                    </select>

                    {userRole === "SuperAdmin" && (
                      <>
                        <label className="block text-xs font-semibold mb-1 uppercase tracking-tight">Institute</label>
                        <select value={instituteFilter} onChange={(e) => setInstituteFilter(e.target.value)} className="w-full mb-4 p-2 border rounded text-[12px] outline-none">
                          <option value="All">All Institutes</option>
                          {institutesList.map(inst => (
                            <option key={inst._id} value={inst.abbreviation}>{inst.abbreviation}</option>
                          ))}
                        </select>
                      </>
                    )}

                    <div className="flex justify-between gap-2">
                      <button onClick={() => setShowFilter(false)} className="flex-1 py-1 bg-[#376e35] text-white rounded text-xs font-bold">Apply</button>
                      <button onClick={() => { setStatusFilter("All"); setCourseFilter("All"); setTypeFilter(""); setSearchQuery(""); setInstituteFilter("All"); setSortOrder("Total %: Highest to Lowest"); }} className="flex-1 py-1 bg-gray-100 rounded text-xs font-bold hover:bg-gray-200">Clear</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div className="md:ml-auto flex flex-wrap gap-3 z-[45]">

              {/* EXPORT DROPDOWN */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                  className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2 font-[600] hover:bg-gray-50 transition"
                >
                  <FaFileExport size={14} /> Export <FaChevronDown size={10} className={`ml-1 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isExportMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <button onClick={handleExportExcel} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                      Export to Excel (.xlsx)
                    </button>
                    <button onClick={() => exportFormsToPDF()} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                      Export PDF (All Forms)
                    </button>
                  </div>
                )}
              </div>

              {/* DYNAMIC ACTION BUTTONS */}
              {(() => {
                const targets = filteredApplicants.filter(a => selectedIds.includes(a.id));
                const isAllPassed = targets.length > 0 && targets.every(a => a.admissionRemarks === 'Passed' || a.admissionStatus === 'Admitted' || a.admissionStatus === 'Passed');
                const isAllFailed = targets.length > 0 && targets.every(a => a.admissionRemarks === 'Failed' || a.admissionStatus === 'Failed');

                return !isArchiveMode ? (
                  <>
                    {/* EMAIL TEMPLATES / SEND EMAILS */}
                    {(selectedIds.length > 0 && isAllPassed && !targets.some(a => a.sentEmails && a.sentEmails.some(e => e.type === "Admission Qualification Notice"))) && (
                      <button
                        onClick={() => openEmailModal("Admission Qualification Notice")}
                        className="bg-blue-600 text-white px-[14px] py-1.5 rounded-lg shadow-sm flex items-center gap-2 font-black hover:bg-blue-700 transition"
                      >
                        <FaEnvelope size={14} /> Send Emails
                      </button>
                    )}
                    {userRole === "SuperAdmin" && (
                      <button
                        onClick={() => openEmailModal("Admission Qualification Notice", [])}
                        className="bg-blue-800 text-white px-[14px] py-1.5 rounded-md shadow-sm flex items-center gap-2 font-black hover:bg-blue-700 transition"
                      >
                        <Edit size={14} /> Email Templates
                      </button>
                    )}

                    {/* BULK PASS: Only visible if ALL selected applicants are Failed */}
                    {isAllFailed && (
                      <button
                        onClick={() => triggerConfirmModal('bulk', 'Passed')}
                        className="bg-green-600 text-white px-[14px] py-[6px] rounded-lg shadow-sm flex items-center gap-2 font-black hover:bg-green-700 transition"
                      >
                        <FaCheck size={14} /> Bulk Pass
                      </button>
                    )}
                  </>
                ) : null;
              })()}

              {/* IMPORT BCET  */}
              {userRole === "SuperAdmin" && (
                <>
                  <button
                    onClick={() => { if (!isArchiveMode) fileInputRef.current?.click(); }}
                    disabled={isArchiveMode}
                    className={`px-3 py-2 rounded-md shadow-sm flex items-center gap-2 font-black transition ${isArchiveMode
                      ? 'bg-gray-400 text-white opacity-60 cursor-not-allowed'
                      : 'bg-[#376e35] text-white hover:bg-[#3a7538]'
                      }`}
                  >
                    <FaFileImport size={14} /> Import BCET
                  </button>
                  <input
                    type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    ref={fileInputRef} className="hidden" onChange={handleFileUpload} disabled={isArchiveMode}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* TABLE SECTION */}
        <div className="flex-1 relative bg-white rounded-sm shadow overflow-hidden mt-2">
          <div className="absolute inset-0 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#E4F6E2] text-[#2e522a] border-b border-gray-200 sticky top-0 z-20">
                <tr className="text-xs uppercase tracking-wide h-11">
                  <th className="px-[14px] py-[6px] text-left text-[11px] font-bold">ID</th>

                  <th
                    onClick={() => { setNameSortOrder(prev => prev === "A-Z" ? "Z-A" : "A-Z"); setActiveSortType("name"); }}
                    className="px-[14px] py-[6px] text-[11px] text-left font-bold whitespace-nowrap cursor-pointer select-none hover:bg-[#d5ebd3] transition-colors"
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
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-left">Program</th>
                  <th className="px-[14px] py-[6px] text-[11px] text-center font-bold">Interview Score (25%)</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">BCET Score (50%)</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">GWA (20%)</th>
                  <th
                    onClick={() => { setSortOrder(prev => prev === "Total %: Highest to Lowest" ? "Total %: Lowest to Highest" : "Total %: Highest to Lowest"); setActiveSortType("total"); }}
                    className="px-[14px] py-[6px] text-[11px] font-bold text-center cursor-pointer select-none hover:bg-[#d5ebd3] transition-colors"
                    title="Click to toggle sorting (Highest to Lowest / Lowest to Highest)"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Total (%)</span>
                      {sortOrder === "Total %: Highest to Lowest" ? (
                        <span className="text-[10px] font-black text-[#2e522a]">▼</span>
                      ) : (
                        <span className="text-[10px] font-black text-[#2e522a]">▲</span>
                      )}
                    </div>
                  </th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">Admission Remarks</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">Action</th>

                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={getColSpan()} className="py-16">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#376e35]"></div>
                        <span className="text-gray-500 font-medium">Loading admission data...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredApplicants.map((a, index) => {
                  const isPending = a.bcetRemarks === "Pending" || a.interviewRemarks === "Pending";
                  const isChecked = selectedIds.includes(a.id);

                  return (
                    <tr key={`${a.rawId || a.id}-${index}`} className={`h-[44px] hover:bg-gray-50 transition-colors ${isChecked ? "bg-green-50/30" : ""}`}>

                      <td className="px-4 py-1 text-[12px] text-gray-600 font-mono">
                        {a.admissionStatus === 'Forfeit' ? <span className="text-gray-400 font-bold tracking-widest text-xs">FORFEIT</span> : a.id}
                      </td>

                      <td className="px-4 py-1 text-[12px] text-gray-800">{a.name}</td>
                      <td className="px-4 py-1 text-[12px] text-gray-800 ">{getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice) || a.activeProgram || a.program, coursesList)}</td>

                      <td className="px-4 py-1 text-center text-[12px]  text-gray-600">
                        {a.interviewScore > 0 ? `${a.interviewScore}/100` : <span className="font-black text-[12px] text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center text-[12px] text-gray-600">
                        {a.examScore > 0 ? (a.bcetRawScore !== null && a.bcetHighestScore !== null ? `${a.bcetRawScore}/${a.bcetHighestScore}` : `${a.examScore.toFixed(2)}/50`) : <span className="font-black text-[12px]  text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center text-[12px] text-gray-600">
                        {getGWA(a) > 0 ? `${getGWA(a).toFixed(2)}/100` : <span className="font-black text-[12px] text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center text-[12px] text-gray-600">
                        {parseFloat(calculateTotal(a)) > 0 ? `${calculateTotal(a)}%` : <span className="font-black text-[12px]  text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center"><StatusTag status={a.admissionRemarks} /></td>

                      {/* ACTIONS */}
                      <td className="px-4 py-1 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setSelectedApplicant(a); setIsModalOpen(true); }}
                            className="group relative flex items-center justify-center w-6 h-6 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-md transition-all shadow-sm"
                            title="Applicant Details"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openInterviewModal(a)}
                            className="group relative flex items-center justify-center w-6 h-6 bg-yellow-50 hover:bg-yellow-100 text-orange-500 border border-yellow-200 rounded-md transition-all shadow-sm"
                            title="View Interview Rubric"
                          >
                            <MessageSquare size={14} />
                          </button>
                          {(!isArchiveMode && a.admissionRemarks === 'Waitlisted') && (
                            <button
                              onClick={() => openEmailModal("Letter of Reconsideration", [a.id])}
                              className="group relative flex items-center justify-center w-6 h-6 bg-purple-50 hover:bg-purple-100 text-green-700 border border-purple-200 rounded-md transition-all shadow-sm"
                              title="Send Reconsideration Email"
                            >
                              <Mail size={14} />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
                {!loading && filteredApplicants.length === 0 && (
                  <tr><td colSpan={getColSpan()} className="text-center py-6 text-gray-500">No applicants found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* --- CONFIRMATION MODAL --- */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsConfirmModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">Confirm Action</h3>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsConfirmModalOpen(false)}>&times;</button>
            </div>
            <div className="p-6 text-center text-gray-700">
              <p className="text-[16px] mb-2">
                Are you sure you want to mark the selected <strong>{confirmTargetId === 'bulk' ? selectedIds.length : 1}</strong> applicant(s) as <span className="font-black uppercase tracking-wider text-[#376e35]">{confirmActionStatus}</span>?
              </p>
              <p className="text-[12px] text-gray-500 mt-3">This action will immediately update their admission status in the system.</p>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button onClick={() => setIsConfirmModalOpen(false)} className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition">Cancel</button>
              <button
                onClick={executeConfirmedAction}
                disabled={isProcessing}
                className={`px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#376e35] hover:bg-[#2c582a]'
                  }`}
              >
                {isProcessing ? 'PROCESSING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- EMAIL MODAL --- */}
      {/* --- MESSAGE APPLICANT MODAL --- */}
      {isMessageModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMessageModalOpen(false)}></div>
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

              <div className="flex justify-end gap-3 mt-4">
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
            </form>
          </div>
        </div>
      )}

      {/* --- SEND BULK EMAIL MODAL --- */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsEmailModalOpen(false)}></div>
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-2xl z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">
                {emailTargetIds.length > 0 ? "Send Email" : "Edit Email Template"}
              </h3>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsEmailModalOpen(false)}>&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Template Type</label>
                <select value={selectedEmailTemplateType} onChange={(e) => handleTemplateTypeChange(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-[12px] outline-none focus:border-blue-500 bg-white">
                  <option value="Application Received">Application Received</option>
                  <option value="Admission Qualification Notice">Admission Qualification Notice</option>
                  <option value="Letter of Reconsideration">Letter of Reconsideration</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Subject</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-[12px] outline-none focus:border-blue-500" />
              </div>

              {selectedEmailTemplateType === "Letter of Reconsideration" && emailTargetIds.length === 1 && (
                <div className="flex flex-col">
                  <label className="text-xs font-bold text-gray-700 uppercase mb-1">Select Program</label>
                  <select value={reconsiderationProgram} onChange={(e) => setReconsiderationProgram(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-[12px] outline-none focus:border-blue-500 bg-white">
                    <option value="">-- Select a Program --</option>
                    <option value="first">
                      {getProgramLabelForChoice(applicants.find(a => a.id === emailTargetIds[0]), "first")} (1st Choice)
                    </option>
                    <option value="second">
                      {getProgramLabelForChoice(applicants.find(a => a.id === emailTargetIds[0]), "second")} (2nd Choice)
                    </option>
                  </select>
                </div>
              )}

              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Send to ({emailTargetIds.length} Applicants)</label>
                <details className="w-full relative group">
                  <summary className="w-full border border-gray-300 rounded px-3 py-2 text-[12px] outline-none bg-white text-gray-700 cursor-pointer flex justify-between items-center list-none [&::-webkit-details-marker]:hidden">
                    <span>All Applicants in List ({emailTargetIds.length})</span>
                    <span className="text-[10px]">▼</span>
                  </summary>
                  <div className="absolute top-[100%] left-0 w-full bg-white border border-gray-300 rounded shadow-lg max-h-40 overflow-y-auto z-50 mt-1">
                    <div 
                      className="px-3 py-2 bg-gray-50 text-[12px] font-semibold border-b border-gray-100 cursor-pointer hover:bg-gray-100"
                      onClick={() => setSelectedDropdownTarget('all')}
                    >
                      All Applicants in List ({emailTargetIds.length})
                    </div>
                    {[...new Set(emailTargetIds)].map(id => {
                      const app = applicants.find(a => a.id === id);
                      return (
                        <div key={id} className="px-3 py-2 text-[12px] text-gray-500 border-b border-gray-50 cursor-not-allowed bg-white">
                          {app?.name || id}
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
              <div className="flex flex-col relative">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Message</label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={16} className="w-full border border-gray-300 rounded px-3 py-2 text-[12px] outline-none focus:border-blue-500 resize-none"></textarea>
                <span className="text-[10px] text-gray-500 italic mt-1">
                  Note: Placeholders [APPLICANT NAME], [APPLICANT NO], [PROGRAM], [REQUIREMENTS], [Interview Date], [Interview Time], [Interview Location], and [Accept Slot] will be dynamically replaced for each recipient before sending automatically.
                </span>
              </div>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-between gap-3">
              <button onClick={handleCancelEmailModal} className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition">Cancel</button>
              <div className="flex gap-2">

                {emailTargetIds.length > 0 && (
                  <button onClick={handleSendEmailFromModal} disabled={isSendingMessage} className="px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow bg-blue-800 hover:bg-blue-700 disabled:opacity-50">
                    {isSendingMessage ? "Sending..." : "Send"}
                  </button>
                )}
                {emailTargetIds.length === 0 && (
                  <button onClick={() => handleSaveEmailTemplate(false)} disabled={isSendingMessage} className="px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow bg-blue-800 hover:bg-blue-700 disabled:opacity-50">
                    Save Template
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MISSING PLACEHOLDERS MODAL --- */}
      {missingPlaceholdersModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMissingPlaceholdersModal(null)}></div>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative z-10 border-t-4 border-yellow-500">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition" onClick={() => setMissingPlaceholdersModal(null)}>&times;</button>
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2"><FaExclamationTriangle className="text-yellow-500" /> Missing Placeholders</h3>
            <p className="text-sm text-gray-700 mb-4">
              Warning: The following placeholders are missing from your template:
            </p>
            <ul className="list-disc pl-5 mb-4 text-sm font-semibold text-gray-800">
              {missingPlaceholdersModal.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <p className="text-sm text-gray-700 mb-6">
              These placeholders are automatically replaced with actual data when sending emails. Without them, recipients won't see their personalized information.
            </p>
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
              <button onClick={() => setMissingPlaceholdersModal(null)} className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition">Cancel</button>
              <button onClick={() => { setMissingPlaceholdersModal(null); handleSaveEmailTemplate(true); }} className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 font-bold uppercase text-[12px] text-white transition shadow">Save Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* --- CAPACITY WARNING MODAL --- */}
      {capacityWarningModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCapacityWarningModal(null)}></div>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10">
            <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition" onClick={() => setCapacityWarningModal(null)}>&times;</button>
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FaExclamationTriangle className="text-yellow-500" /> Capacity Warning
            </h3>
            <p className="text-sm text-gray-700 mb-6 font-medium">
              The program capacity is full. Are you sure you want to continue?
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setCapacityWarningModal(null)}
                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
              >
                No
              </button>
              <button
                onClick={() => {
                  const { templateType, targetIds } = capacityWarningModal;
                  setCapacityWarningModal(null);
                  openEmailModal(templateType, targetIds, true);
                }}
                className="px-6 py-2 rounded bg-yellow-500 hover:bg-yellow-600 font-bold uppercase text-[12px] text-white transition shadow"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW APPLICANT MODAL --- */}
      {isModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden">

            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">Applicant Details</h3>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded text-xs font-mono">{selectedApplicant.id}</span>
              </div>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none ml-2" onClick={() => setIsModalOpen(false)}>&times;</button>
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
                    <FormField label="Contact Number" value={selectedApplicant.profile.personal.contact} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.personal?.contact || ""} onChange={(e) => handleInlineChange("personal", null, "contact", e.target.value)} />
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
                    <FormField label="CONTACT" value={selectedApplicant.profile.family.father.contact} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.family?.father?.contact || ""} onChange={(e) => handleInlineChange("family", "father", "contact", e.target.value)} />
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
                    <FormField label="CONTACT" value={selectedApplicant.profile.family.mother.contact} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.family?.mother?.contact || ""} onChange={(e) => handleInlineChange("family", "mother", "contact", e.target.value)} />
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
                      <FormField className="md:col-span-2" label="Year Graduated" value={level.data.year} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.[level.key]?.year || ""} onChange={(e) => handleInlineChange("education", level.key, "year", e.target.value)} />
                      {level.key === 'shs' && (
                        <FormField className="md:col-span-2" label="Grade 11 GWA" value={level.data.grade11Gwa || level.data.gwa} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.grade11Gwa || newApplicant?.profile?.education?.shs?.gwa || ""} onChange={(e) => handleInlineChange("education", "shs", "grade11Gwa", e.target.value)} />
                      )}
                      {level.key === 'shs' && (is2ndSemesterActive || level.data.grade12Gwa) && (
                        <FormField className="md:col-span-2" label="Grade 12 GWA" value={level.data.grade12Gwa} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.grade12Gwa || ""} onChange={(e) => handleInlineChange("education", "shs", "grade12Gwa", e.target.value)} />
                      )}
                      {level.key === 'shs' && (
                        <>
                          <FormField className={(is2ndSemesterActive || level.data.grade12Gwa) ? "md:col-span-5" : "md:col-span-6"} label="Track" value={level.data.track} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.track || ""} onChange={(e) => handleInlineChange("education", "shs", "track", e.target.value)} />
                          <FormField className={(is2ndSemesterActive || level.data.grade12Gwa) ? "md:col-span-5" : "md:col-span-6"} label="Strand/Electives" value={level.data.strand} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.shs?.strand || ""} onChange={(e) => handleInlineChange("education", "shs", "strand", e.target.value)} />
                        </>
                      )}
                      {level.key === 'tertiary' && (
                        <FormField className="md:col-span-2" label="Latest GWA" value={level.data.latestGwa} isEditMode={isInlineEditMode} editValue={newApplicant?.profile?.education?.tertiary?.latestGwa || ""} onChange={(e) => handleInlineChange("education", "tertiary", "latestGwa", e.target.value)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Diversity, Equity, and Inclusion (DEI)" />
                <div className="space-y-4">
                  {[
                    { label: 'Student with Special Needs (SSN) and other Types of Disabilities', key: 'isPwd', detailsKey: 'pwdDetails' },
                    { label: 'Member of an Indigenous Cultural Community (ICC) /Indigenous People (IP)', key: 'isIndigenous', detailsKey: 'indigenousDetails' },
                    { label: 'Child of a Solo Parent or Solo Parent', key: 'isSoloParent', detailsKey: 'soloParentDetails' },
                    { label: 'Member of Pantawid Pamilyang Pilipino Program (4Ps)', key: 'is4Ps', detailsKey: 'fourPsDetails' },
                    { label: 'Child of Overseas Filipino Worker/s (OFW)', key: 'isOfw', detailsKey: 'ofwDetails' }
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
                      await saveNewApplicant();
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
                    className="px-6 py-2 rounded bg-blue-700 hover:bg-blue-600 text-white flex items-center justify-center transition shadow"
                    title="Print Form"
                  >
                    <FaPrint />
                  </button>
                  {!isArchiveMode && (
                    <>
                      <button
                        onClick={() => {
                          setIsMessageModalOpen(true);
                          setIsModalOpen(false);
                        }}
                        className="px-6 py-2 rounded bg-[#eab308] hover:bg-[#ca8a04] text-white flex items-center justify-center transition shadow"
                        title="Message"
                      >
                        <MessageSquare size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setNewApplicant(JSON.parse(JSON.stringify(selectedApplicant)));
                          setIsInlineEditMode(true);
                        }}
                        className="px-6 py-2 rounded bg-[#2e522a] hover:bg-[#203a1d] text-white flex items-center justify-center transition shadow"
                        title="Edit"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("Are you sure you want to delete this applicant?")) {
                            api.delete(`/admin/applicant/${selectedApplicant.rawId || selectedApplicant.id}`)
                              .then(() => {
                                setApplicants(prev => prev.filter(a => a.id !== selectedApplicant.id && a.rawId !== selectedApplicant.rawId));
                                setIsModalOpen(false);
                              })
                              .catch(err => alert("Failed to delete applicant."));
                          }
                        }}
                        className="px-6 py-2S rounded bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition shadow"
                        title="Delete Applicant"
                      >
                        <FaTrash />
                      </button>
                    </>
                  )}
                  <div className="flex-1"></div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 rounded bg-gray-400 hover:bg-gray-500 font-bold uppercase text-[12px] text-white transition"
                  >
                    Close
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- PREVIEW DOCUMENT MODAL --- */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
            <div className="bg-white text-[#376e35] px-6 py-4 flex justify-between items-center shrink-0 z-10 relative shadow-md">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-bold text-[16px] uppercase tracking-wider">{previewDoc.name}</h3>
                </div>

                {['png', 'jpg', 'jpeg'].includes(previewDoc.format.toLowerCase()) && (
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 ml-6 shadow-inner border ">
                    <button onClick={handleZoomOut} className="p-2 hover:bg-green-400 rounded-md text-green-600 hover:text-green-400 transition-colors active:scale-95" title="Zoom Out">
                      <FaSearchMinus size={14} />
                    </button>
                    <span className="text-xs font-bold w-12 text-center select-none text-[#376e35]">{Math.round(zoomLevel * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-2 hover:bg-green-400 rounded-md text-[#376e35] hover:text-green transition-colors active:scale-95" title="Zoom In">
                      <FaSearchPlus size={14} />
                    </button>
                    <div className="w-px h-4 bg-gray-600 mx-1"></div>
                    <button onClick={handleResetZoom} className="p-2 hover:bg-green-400 rounded-md text-[#376e35] hover:text-green transition-colors active:scale-95" title="Reset Zoom">
                      <FaRedo size={12} />
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

      {/* --- INTERVIEW SCORING MODAL --- */}
      {isInterviewModalOpen && selectedApplicant && (() => {
        const ratings = selectedApplicant.interviewRatings || {};
        let interviewTotal = 0;
        rubricData.forEach(section => {
          section.criteria.forEach(crit => { interviewTotal += getWeightedScore(ratings[crit.id], crit.weight); });
        });
        const currentRemarks = getRemarks(interviewTotal.toFixed(2));

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center pt-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInterviewModalOpen(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

              <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">Final Admission Interview Rubric</h3>
                <button onClick={() => setIsInterviewModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none">&times;</button>
              </div>

              <div className="bg-white border-b border-gray-300 px-6 py-2 shrink-0">
                <div className="grid grid-cols-12 gap-4 mt-4 text-[12px]">
                  <div className="col-span-8 flex flex-col">
                    <label className="font-bold text-gray-700 uppercase text-xs">Program</label>
                    <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">{selectedApplicant.isRejectedFirstChoice ? selectedApplicant.profile.appDetails.secondChoice : selectedApplicant.profile.appDetails.firstChoice}</div>
                  </div>

                  <div className="col-span-4 flex flex-col">
                    <label className="font-bold text-gray-700 uppercase text-xs">Interview Date & Session</label>
                    <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">
                      {selectedApplicant.interviewSchedule ? `${selectedApplicant.interviewSchedule}, ${selectedApplicant.profile?.interviewSession === 'Morning' ? 'Morning (8am-12pm)' : selectedApplicant.profile?.interviewSession === 'Afternoon' ? 'Afternoon (1pm-4pm)' : (selectedApplicant.profile?.interviewSession || selectedApplicant.interviewSession || '')}` : "N/A"}
                    </div>
                  </div>

                  <div className="col-span-6 flex flex-col">
                    <label className="font-bold text-gray-700 uppercase text-xs">Applicant Name</label>
                    <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">{selectedApplicant.name}</div>
                  </div>

                  <div className="col-span-6 flex flex-col">
                    <label className="font-bold text-gray-700 uppercase text-xs">Interviewer</label>
                    <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">{selectedApplicant.interviewer || "N/A"}</div>
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

                              <td className="border-r border-black py-2 text-center align-middle bg-gray-100 font-bold text-[16px] text-gray-700">
                                {ratings[crit.id] !== undefined && ratings[crit.id] !== "" ? ratings[crit.id] : "-"}
                              </td>

                              <td className="p-2 text-center align-middle font-black text-[16px] bg-gray-50">
                                {getWeightedScore(ratings[crit.id], crit.weight).toFixed(2) === "0.00" && (ratings[crit.id] === "" || ratings[crit.id] === undefined)
                                  ? "-"
                                  : getWeightedScore(ratings[crit.id], crit.weight).toFixed(2)
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="bg-gray-100 border-x-2 border-b-2 pr-14 border-black py-1 flex justify-end items-center gap-16">
                        <span className="font-bold text-[15px] uppercase text-gray-800">Total:</span>
                        <span className="font-black text-[16px] text-[#376e35]">{getSectionTotal(section, ratings)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 border-t border-gray-400 text-white p-4 shrink-0 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <span className="uppercase text-gray-800 font-bold text-[12px]">General Weighted Average :</span>
                    <span className="text-3xl font-black text-[#376e35] tracking-wider">{interviewTotal.toFixed(2)}</span>
                  </div>

                  <div className="h-8 w-px bg-gray-300"></div>

                  <div className="flex gap-2.5">
                    <span className="text-[15px] font-bold pt-2 text-gray-700 uppercase leading-none mb-1">Remarks:</span>
                    <div className={`px-4 py-1.5 border rounded text-xs font-black uppercase tracking-wider shadow-sm ${currentRemarks.color}`}>
                      {currentRemarks.label}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsInterviewModalOpen(false)}
                    className="px-8 py-2 rounded bg-gray-700 hover:bg-gray-600 font-bold uppercase text-[12px] transition text-white"
                  >
                    Close View
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* --- HIDDEN PRINT CONTAINER --- */}
      <div style={{ display: "none" }}>
        <div ref={printFormRef} dangerouslySetInnerHTML={{ __html: printContent }} />
      </div>

    </div>
  );
}
