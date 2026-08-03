import { useEffect, useRef, useState, useMemo } from "react";
import api from "../../services/api";
import {
  FaSearch, FaFilter, FaEye, FaTimes, FaFileDownload,
  FaSearchPlus, FaSearchMinus, FaRedo, FaCheckCircle,
  FaEdit, FaUpload, FaPlus, FaCheck, FaTrash, FaChevronDown, FaPrint
} from "react-icons/fa";
import { FileText, CheckCircle, MessageSquare, Eye, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  createApplicant, bulkUpdateStatus, encodeScore,
  getRubric, saveRubric as apiSaveRubric, updateApplicantStatus
} from "../../services/adminService.js";
import * as XLSX from "xlsx-js-style";
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
  return getCourseAbbr(courseName);
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
    id: "III", title: "III. Program Awareness & Academic Readiness (25%)",
    criteria: [
      { id: "3_1", name: "Understanding of Chosen Program", desc: "Shows awareness of program content, expectations, and career paths.", weight: 10 },
      { id: "3_2", name: "Logical & Critical Thinking", desc: "Demonstrates reasoning, problem-solving, and analytical skills.", weight: 10 },
      { id: "3_3", name: "Alignment of Skills & Interests", desc: "Shows that abilities and interests fit the chosen program.", weight: 5 },
    ]
  },
  {
    id: "IV", title: "IV. Motivation, Goals & Overall Impression (20%)",
    criteria: [
      { id: "4_1", name: "Motivation for the Program", desc: "Shows genuine reason for choosing the program.", weight: 10 },
      { id: "4_2", name: "Career Goals", desc: "Presents realistic, clear, and purposeful future plans.", weight: 5 },
      { id: "4_3", name: "Overall Impression", desc: "Demonstrates potential to succeed in the program.", weight: 5 },
    ]
  }
];

/* --- REUSABLE COMPONENTS --- */
const CustomCheckbox = ({ checked, onChange }) => (
  <div
    onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
    className={`w-[18px] h-[18px] mx-auto rounded-[3px] border flex items-center justify-center cursor-pointer transition-all shadow-sm ${checked ? 'bg-[#10dc60] border-[#10dc60]' : 'bg-white border-gray-400 hover:border-[#10dc60]'}`}
  >
    {checked && <FaCheck size={10} className="text-white" />}
  </div>
);

const FormField = ({ label, value, className = "" }) => (
  <div className={`flex flex-col ${className}`}>
    <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">{label}</label>
    <div className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 uppercase truncate cursor-default flex items-center shadow-sm">
      {value || "N/A"}
    </div>
  </div>
);

const InputFormField = ({ label, value, onChange, type = "text", className = "", placeholder = "", disabled = false, required = false }) => (
  <div className={`flex flex-col ${className}`}>
    {label && <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">{label}{required && <span className="text-red-500 ml-1 text-xs leading-none">*</span>}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm focus:border-[#3a7538] outline-none transition-colors uppercase ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
    />
  </div>
);

const SelectFormField = ({ label, value, onChange, options, className = "", disabled = false, required = false }) => (
  <div className={`flex flex-col ${className}`}>
    <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">{label}{required && <span className="text-red-500 ml-1 text-xs leading-none">*</span>}</label>
    <div className="relative">
      <select
        value={value || ""}
        onChange={onChange}
        disabled={disabled}
        className={`h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs shadow-sm focus:border-[#3a7538] outline-none transition-colors uppercase appearance-none ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : (value ? 'text-gray-800' : 'text-gray-400')}`}
      >
        <option value="" disabled hidden>SELECT COURSE</option>
        {(options || []).map((option, index) => {
          const optName = typeof option === 'string' ? option : (option?.name || "UNKNOWN COURSE");
          return (
            <option key={index} value={optName.toUpperCase()} className="text-gray-800">
              {optName.toUpperCase()}
            </option>
          );
        })}
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
        className={`h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs shadow-sm flex items-center justify-between outline-none transition-colors ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'cursor-pointer hover:border-[#3a7538]'}`}
      >
        <span className="text-gray-800 uppercase">{value || "YYYY-MM-DD"}</span>
        <CalendarIcon className="text-gray-500 w-4 h-4" />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-3">
          <div className="flex justify-between items-center mb-2">
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronLeft size={16} /></button>
            <div className="font-bold text-xs uppercase text-gray-800">{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
            <button type="button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-1 hover:bg-gray-100 rounded text-gray-600"><ChevronRight size={16} /></button>
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
    // Fetch all provinces by first fetching all regions
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
      <label className="text-[11px] font-bold text-gray-700 uppercase mb-1 border-b pb-1 block">{label}{required && <span className="text-red-500 ml-1 text-xs leading-none">*</span>}</label>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mt-2">
        <InputFormField placeholder="House/Street" value={addressData.houseStreet} onChange={e => onChange('houseStreet', e.target.value)} disabled={disabled} />

        <div className="flex flex-col">
          <select disabled={disabled} value={addressData.provinceCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('province', 'provinceCode', e.target.value, name);
            handleChange('city', 'cityCode', "", "");
            handleChange('barangay', 'barangayCode', "", "");
          }} className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">PROVINCE</option>
            {provinceList.map(p => <option key={p.province_code} value={p.province_code}>{p.province_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <select disabled={disabled || !addressData.provinceCode} value={addressData.cityCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('city', 'cityCode', e.target.value, name);
            handleChange('barangay', 'barangayCode', "", "");
          }} className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
            <option value="">CITY/MUNI</option>
            {cityList.map(c => <option key={c.city_code} value={c.city_code}>{c.city_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <select disabled={disabled || !addressData.cityCode} value={addressData.barangayCode || ""} onChange={(e) => {
            const name = e.target.options[e.target.selectedIndex].text;
            handleChange('barangay', 'barangayCode', e.target.value, name);
          }} className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm focus:border-[#3a7538] outline-none uppercase appearance-none">
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
    <h3 className="text-xs font-black text-[#376e35] uppercase tracking-wide">{title}</h3>
  </div>
);

const token = localStorage.getItem('token');
const BASE_URL = "http://localhost:8000";

const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('blob:') || path.startsWith('http')) return path;

  let cleanPath = path.replace(/\\/g, '/');
  cleanPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  return `${BASE_URL}${cleanPath}?token=${token}`;
};

/* --- MAIN COMPONENT --- */
export default function Applications({ navigateToTab, navigationState }) {

  /* --- DYNAMIC STATES --- */
  const [coursesList, setCoursesList] = useState([]);
  const [institutesList, setInstitutesList] = useState([]);

  /* --- ROLE STATE --- */
  const [userRole, setUserRole] = useState("SuperAdmin");
  const [userInstitute, setUserInstitute] = useState("IITI");
  const [currentAdminUsername, setCurrentAdminUsername] = useState("");

  /* --- STATE --- */
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [isRubricEditModalOpen, setIsRubricEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmActionStatus, setConfirmActionStatus] = useState(null);

  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(0.8);

  const [selectedApplicantIds, setSelectedApplicantIds] = useState([]);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [activePopover, setActivePopover] = useState(null);

  const [rubricData, setRubricData] = useState(INITIAL_RUBRIC_SECTIONS);
  const [tempRubricData, setTempRubricData] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const filterRef = useRef(null);
  const exportMenuRef = useRef(null);

  const [interviewRatings, setInterviewRatings] = useState({});
  const [draftRatings, setDraftRatings] = useState({});
  const [newApplicant, setNewApplicant] = useState(null);
  const [activeRatingDropdown, setActiveRatingDropdown] = useState(null);

  const [applicants, setApplicants] = useState([]);
  const [activeYear, setActiveYear] = useState("");
  const [isArchiveMode, setIsArchiveMode] = useState(false);

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

    return {
      ...app,
      _id: app._id || app.id,
      id: app.id || app._id,
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
          shs: app.profile?.education?.shs || { name: app.seniorHighSchool || app.education?.seniorHighSchool || "N/A", address: app.seniorHighAddress || app.education?.seniorHighAddress || "N/A", year: app.seniorHighYear || app.education?.seniorHighYear || "N/A", gwa: app.seniorHighGwa || app.education?.seniorHighGwa || "N/A" },
          tertiary: app.profile?.education?.tertiary || { name: app.collegeSchool || "N/A", address: app.collegeAddress || "N/A", year: app.collegeYear || "N/A" }
        },
        otherInfo: app.profile?.otherInfo || {
          isPwd: app.disability || false,
          isIndigenous: app.indigenous || false,
          isSoloParent: app.soloParent || false,
          is4Ps: app.fourPs || false
        },
        documents: normalizedDocs
      }
    };
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

        setUserInstitute(profileRes.data.institute || "IITI");
        setCurrentAdminUsername(profileRes.data.username || profileRes.data.name || "");
        
        // --- BULLETPROOF COURSE FALLBACK ---
        let fetchedCourses = [];
        if (Array.isArray(coursesRes.data) && coursesRes.data.length > 0) {
          fetchedCourses = coursesRes.data;
        } else if (settingsRes.data && Array.isArray(settingsRes.data.courses) && settingsRes.data.courses.length > 0) {
          fetchedCourses = settingsRes.data.courses;
        } else {
          // Fallback data if database returns completely empty
          fetchedCourses = [
            { name: "Bachelor of Science in Information Technology" },
            { name: "Bachelor of Science in Hospitality Management" },
            { name: "Bachelor of Science in Business Administration" },
            { name: "Bachelor of Elementary Education" }
          ];
        }
        setCoursesList(fetchedCourses);
        setInstitutesList(institutesRes.data || []);

        const archiveYear = sessionStorage.getItem("archiveViewYear");
        const currentYearToFetch = archiveYear || settingsRes.data.schoolYear;
        setActiveYear(currentYearToFetch);

        if (archiveYear) {
          setIsArchiveMode(true);
        }

        const applicantsRes = await api.get('/admin/applicants', { params: { schoolYear: currentYearToFetch } });

        const applicantsData = Array.isArray(applicantsRes.data) ? applicantsRes.data : [];
        const mappedData = applicantsData.map(app => {
          const safe = getSafeApplicant(app);

          const dbStatus = (app.interviewStatus && app.interviewStatus !== 'Pending')
            ? app.interviewStatus
            : (app.admissionStatus || 'Pending');

          const actualStatus = (dbStatus === 'Pending Interview' || dbStatus === 'Pending' || dbStatus?.toLowerCase() === 'pending')
            ? 'For Interview'
            : dbStatus;

          const actualSchedule = app.interviewSchedule || app.interviewDate || "";

          return {
            ...safe,
            id: app.applicantId || app.id || app._id,
            name: (app.name || `${safe.profile.personal.surname}, ${safe.profile.personal.firstName}`).toUpperCase(),
            type: safe.profile.appDetails.applicantType,
            location: safe.location || safe.profile.personal.presAddress.city?.toUpperCase() || "N/A",
            date: safe.createdAt ? new Date(safe.createdAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : (safe.date || getTodayStr()),
            status: actualStatus,
            interviewSchedule: actualSchedule,
            interviewRatings: app.interviewRatings || {},
            interviewer: app.interviewer || "",
            examScore: app.examScore,
            isExamined: app.isExamined || false,
            admissionStatus: app.admissionStatus
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
    if (navigationState?.applicantId) {
      setSearchQuery(navigationState.applicantId);
      if (navigationState.openInterview) {
        // Ensure applicants are loaded before trying to open the modal
        const attemptOpen = setInterval(() => {
          setApplicants((prev) => {
            const app = prev.find(a => a.rawId === navigationState.applicantId);
            if (app) {
              setSelectedApplicant(app);
              setIsViewModalOpen(true);
              if (navigationState.openInterview && (app.status === 'For Interview' || app.status === 'Admitted' || app.status === 'Rejected' || app.status === 'Pending Admission' || app.status === 'Waitlisted')) {
                setIsInterviewModalOpen(true);
              }
              clearInterval(attemptOpen);
            }
            return prev;
          });
        }, 500);
        setTimeout(() => clearInterval(attemptOpen), 5000);
      }
      navigateToTab('pre-admission-applications', {});
    }
  }, [navigationState]);

  useEffect(() => {
    if (isInterviewModalOpen && selectedApplicant && !isArchiveMode && userRole === "Admin") {
      const appId = selectedApplicant._id || selectedApplicant.id;
      setDraftRatings(prev => ({
        ...prev,
        [appId]: interviewRatings
      }));
    }
  }, [interviewRatings, selectedApplicant, isInterviewModalOpen, isArchiveMode, userRole]);

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
      if (a.isExamined === true || (a.examScore !== undefined && a.examScore !== null && a.examScore > 0)) return false;
      if (a.admissionStatus === 'Admitted') return false;
      if (a.schoolYear !== activeYear) return false;

      const text = `${a.id} ${a.name} ${a.type} ${a.location} ${a.date}`.toLowerCase();
      if (searchQuery && !text.includes(searchQuery.toLowerCase())) return false;
      if (typeFilter && (!a.type || a.type.toUpperCase() !== typeFilter.toUpperCase())) return false;
      if (locationFilter && (!a.location || a.location.toUpperCase() !== locationFilter.toUpperCase())) return false;
      if (statusFilter && (!a.status || a.status.toUpperCase() !== statusFilter.toUpperCase())) return false;

      if (scheduleFilter) {
        const today = getTodayStr();
        const tomorrow = getTomorrowStr();
        if (scheduleFilter === 'today' && !a.interviewSchedule?.startsWith(today)) return false;
        if (scheduleFilter === 'tomorrow' && !a.interviewSchedule?.startsWith(tomorrow)) return false;
      }
      return true;
    });

    // 3. SORTING
    result.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [applicants, activeYear, searchQuery, typeFilter, locationFilter, statusFilter, scheduleFilter, sortOrder]);

  const uniqueLocations = useMemo(() => {
    const baseApplicants = applicants.filter(a => {
      if (a.isExamined === true || (a.examScore !== undefined && a.examScore !== null && a.examScore > 0)) return false;
      if (a.admissionStatus === 'Admitted') return false;
      if (a.schoolYear !== activeYear) return false;
      return true;
    });

    const locs = baseApplicants.map(a => a.location?.toUpperCase()).filter(Boolean);
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
    try {
      await bulkUpdateStatus(selectedApplicantIds, newStatus);

      const scoreOverride = newStatus === 'Passed' ? 100 : 0;
      const autoRatings = {};
      rubricData.forEach(section => {
        section.criteria.forEach(crit => {
          autoRatings[crit.id] = scoreOverride.toString();
        });
      });

      const today = getTodayStr();
      const interviewerName = currentAdminUsername || "Admin";
      await Promise.all(
        selectedApplicantIds.map(id => encodeScore(id, scoreOverride, autoRatings, today, interviewerName))
      );

      setApplicants(prev => prev.map(app =>
        selectedApplicantIds.includes(app._id || app.id)
          ? { ...app, status: newStatus, interviewRatings: autoRatings, interviewScore: scoreOverride, isInterviewed: true, interviewer: interviewerName }
          : app
      ));

      setSelectedApplicantIds([]);
      setIsSelectAllChecked(false);
      setActivePopover(null);
    } catch (err) {
      console.error("Bulk update failed:", err);
      alert("Failed to update applicant statuses.");
    }
  };

  /* --- EXPORT HANDLERS --- */
  const getTargetApplicants = () => selectedApplicantIds.length > 0
    ? filteredApplicants.filter(a => selectedApplicantIds.includes(a._id || a.id))
    : filteredApplicants;

  const exportToExcel = () => {
    const data = getTargetApplicants();

    const headers = [
      "APPLICANT TYPE", "1ST CHOICE COURSE", "2ND CHOICE COURSE", "APPLICANT FULL NAME",
      "PERMANENT ADDRESS", "PRESENT ADDRESS", "GENDER", "DATE OF BIRTH", "PLACE OF BIRTH",
      "CIVIL STATUS", "NAME OF SPOUSE", "EMAIL ADDRESS", "CONTACT NUMBER",
      "ELEMENTARY SCHOOL", "ELEMENTARY ADDRESS", "ELEMENTARY YEAR GRADUATED",
      "JHS SCHOOL", "JHS ADDRESS", "JHS YEAR GRADUATED",
      "SHS SCHOOL", "SHS ADDRESS", "GRADE 11 GWA", "SHS YEAR GRADUATED",
      "TERTIARY SCHOOL", "TERTIARY ADDRESS", "TERTIARY YEAR GRADUATED",
      "FATHER'S NAME", "FATHER'S CONTACT NUMBER", "MOTHER'S MAIDEN NAME", "MOTHER'S CONTACT NUMBER",
      "INDIGENOUS PEOPLE", "SOLO PARENT/CHILD OF SOLO PARENT", "PWD", "4PS"
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

      const rawRow = [
        a.applicantType || app.type || "N/A",
        getCourseAbbr(a.firstChoice),
        getCourseAbbr(a.secondChoice),
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
        edShs.name || "N/A", edShs.address || "N/A", edShs.gwa || "N/A", edShs.year || "N/A",
        edTert.name || "N/A", edTert.address || "N/A", edTert.year || "N/A",
        formatFam(f.father), f.father?.contact || "N/A",
        formatFam(f.mother), f.mother?.contact || "N/A",
        o.isIndigenous ? "YES" : "NO",
        o.isSoloParent ? "YES" : "NO",
        o.isPwd ? "YES" : "NO",
        o.is4Ps ? "YES" : "NO"
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
    XLSX.writeFile(wb, `Applicants Details ${activeYear}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const exportTableToPDF = () => {
    const targetApplicants = getTargetApplicants();
    const printWindow = window.open('', '_blank');
    const tableHtml = `
      <html>
        <head>
          <title>Applicant List</title> 
          <style>
            @page { margin: 0; }
            body { font-family: sans-serif; background: #fff; color: #000; padding: 20mm; }
            .main-title { text-align: center; text-transform: uppercase; font-size: 20px; font-weight: bold; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
            th { font-weight: bold; background: #eee; color: #000; }
            @media print { body { padding: 15mm; } }
          </style>
        </head>
        <body>
          <h1 class="main-title">Application Lists</h1>
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Applicant Name</th><th>Type</th><th>Location</th><th>Date Applied</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${targetApplicants.map(a => `
                <tr><td>${a.id}</td><td>${a.name}</td><td>${a.type}</td><td>${a.location}</td><td>${a.date}</td><td>${a.status}</td></tr>
              `).join('')}
            </tbody>
          </table>
          <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 250); }</script>
        </body>
      </html>
    `;
    printWindow.document.write(tableHtml);
    printWindow.document.close();
    setIsExportMenuOpen(false);
  };

  const exportFormsToPDF = (specificApplicants = null) => {
    const targetApplicants = specificApplicants || getTargetApplicants();
    const printWindow = window.open('', '_blank');

    const generateFormHtml = (app) => {
      const p = app.profile.personal;
      const f = app.profile.family;
      const ed = app.profile.education;
      const o = app.profile.otherInfo;
      const a = app.profile.appDetails;

      const chk = (condition) => condition ? '☑' : '☐';

      const civilStatus = String(p.civilStatus || '').toUpperCase();
      const gender = String(p.sex || '').toUpperCase();
      const appType = String(a.applicantType || '').toUpperCase();

      const isIndig = String(o.isIndigenous).toLowerCase() === 'true';
      const isSolo = String(o.isSoloParent).toLowerCase() === 'true';
      const isPwd = String(o.isPwd).toLowerCase() === 'true';
      const is4Ps = String(o.is4Ps).toLowerCase() === 'true';

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
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.houseStreet || ''}</div><div class="sub-label">HOUSE NO. & STREET</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.barangay || ''}</div><div class="sub-label">BARANGAY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.city || ''}</div><div class="sub-label">TOWN/CITY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.permAddress.province || ''}</div><div class="sub-label">PROVINCE</div></div>
                    <div style="width: 80px;" class="field-underline text-center"><div>${p.permAddress.zip || ''}</div><div class="sub-label">ZIP CODE</div></div>
                </div>

                <div class="row">
                    <span class="label label-offset">PRESENT ADDRESS:</span>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.houseStreet || ''}</div><div class="sub-label">HOUSE NO. & STREET</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.barangay || ''}</div><div class="sub-label">BARANGAY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.city || ''}</div><div class="sub-label">TOWN/CITY</div></div>
                    <div class="flex-1 field-underline text-center"><div>${p.presAddress.province || ''}</div><div class="sub-label">PROVINCE</div></div>
                    <div style="width: 80px;" class="field-underline text-center"><div>${p.presAddress.zip || ''}</div><div class="sub-label">ZIP CODE</div></div>
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
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.elem?.year || ''}</div><div class="sub-label">YEAR COMPLETED/GRADUATED</div></div>
                </div>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">JUNIOR HIGH SCHOOL:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.jhs?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.jhs?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.jhs?.year || ''}</div><div class="sub-label">YEAR COMPLETED/GRADUATED</div></div>
                </div>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">SENIOR HIGH SCHOOL:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.shs?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.shs?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.shs?.year || ''}</div><div class="sub-label">YEAR COMPLETED/GRADUATED</div></div>
                    <div style="width: 100px;" class="field-underline text-center"><div>${ed.shs?.gwa || ''}</div><div class="sub-label">GRADE 11 GWA</div></div>
                </div>
                <div class="row">
                    <span class="label label-offset" style="width: 150px;">TERTIARY:</span>
                    <div class="flex-1 field-underline text-center"><div>${ed.tertiary?.name || ''}</div><div class="sub-label">NAME OF SCHOOL</div></div>
                    <div class="flex-1 field-underline text-center"><div>${ed.tertiary?.address || ''}</div><div class="sub-label">ADDRESS</div></div>
                    <div style="width: 150px;" class="field-underline text-center"><div>${ed.tertiary?.year || ''}</div><div class="sub-label">YEAR COMPLETED/GRADUATED</div></div>
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
                        <div style="flex: 1; padding-right: 15px;">ARE YOU AN INDIGENOUS PERSON OR A MEMBER OF AN INDIGENOUS TRIBE?</div>
                        <div style="width: 120px; white-space: nowrap;">${chk(isIndig)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isIndig)} NO</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">ARE YOU A SOLO PARENT OR A CHILD OF A SOLO PARENT?</div>
                        <div style="width: 120px; white-space: nowrap;">${chk(isSolo)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isSolo)} NO</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">ARE YOU DIFFERENTLY ABLED?</div>
                        <div style="width: 120px; white-space: nowrap;">${chk(isPwd)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!isPwd)} NO</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="flex: 1; padding-right: 15px;">ARE YOU A BENEFICIARY OF THE 4PS PROGRAM OF THE GOVERNMENT?</div>
                        <div style="width: 120px; white-space: nowrap;">${chk(is4Ps)} YES &nbsp;&nbsp;&nbsp;&nbsp; ${chk(!is4Ps)} NO</div>
                    </div>
                </div>

                <div class="row items-center" style="margin-top: 8px; margin-bottom: 8px;">
                    <span class="label">DEGREE PROGRAM(S) APPLIED FOR</span>
                    <span class="label" style="margin-left: 20px;">1<sup>ST</sup> Choice</span>
                    <div class="flex-1 field-underline"><div>${a.firstChoice || ''}</div></div>
                    <span class="label" style="margin-left: 20px;">2<sup>nd</sup> Choice</span>
                    <div class="flex-1 field-underline"><div>${a.secondChoice || ''}</div></div>
                </div>

                <div style="font-size: 10px; margin-bottom: 8px;">
                    <p style="margin-bottom: 5px; font-weight: bold;">I HEREBY AFFIRM THAT:</p>
                    <ul style="margin-top: 0; padding-left: 20px;">
                        <li>THE ABOVE INFORMATION GIVEN ARE TRUE AND CORRECT.</li>
                        <li>I UNDERSTAND THAT GIVING FALSE INFORMATION WILL AUTOMATICALLY DISQUALIFY ME FOR ADMISSION.</li>
                        <li>IF ADMITTED, BY THE RULES AND REGULATIONS OF THE BTECH, I HEREBY ALLOW/AUTHORIZE THE BTECH TO USE, COLLECT, AND PROCESS THE INFORMATION FOR LEGITIMATE PURPOSES SPECIFICALLY THE PROMOTION OF THE COLLEGE PROGRAMS AND SERVICES.</li>
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
                        <div style="width: 32%;">
                            <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">Freshmen</div>
                            <div>☐ Original Grade 12 Report Card/F138</div>
                            <div>☐ Original Certificate of Good Moral</div>
                            <div>☐ Photocopy of Diploma</div>
                            <div>☐ Photocopy of PSA Birth Certificate</div>
                            <div>☐ 3 pcs. 2x2 Picture</div>
                        </div>
                        <div style="width: 32%;">
                            <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">Transferees</div>
                            <div>☐ Original Honorable Dismissal</div>
                            <div>☐ Certificate of Copy of Grades</div>
                            <div>☐ Original Transcript of Records</div>
                            <div>☐ Photocopy of PSA Birth Certificate</div>
                            <div>☐ 3 pcs. 2x2 Picture</div>
                        </div>
                        <div style="width: 32%;">
                            <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">ALS</div>
                            <div>☐ Original Certificate of Rating</div>
                            <div>☐ Original ALS Certification</div>
                            <div>☐ Photocopy of PSA Birth Certificate</div>
                            <div>☐ 3pcs. 2x2 Picture</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    const templateHtml = `
      <html>
        <head>
          <title></title> <style>
            @page { size: A4 portrait; margin: 0; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #525659; }
            .page { width: 210mm; height: 297mm; padding: 8mm 15mm; margin: 10mm auto; background: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.5); box-sizing: border-box; font-size: 10px; color: #000; text-transform: uppercase; page-break-after: always; overflow: hidden; position: relative; }
            .page:last-child { page-break-after: auto; }
            @media print { body { background: #fff; margin: 0; } .page { margin: 0; padding: 10mm 15mm; box-shadow: none; border: none; width: 100%; height: 100vh;} }
            .header-container { display: flex; margin-bottom: 8px; align-items: stretch; min-height: 50.8mm; }
            .header-left { flex: 1; display: flex; flex-direction: column; justify-content: space-between; margin-top: 5px; }
            .header-content { display: flex; align-items: center; justify-content: center; padding: 0 10px 10px 0; }
            .btech-logo { width: 65px; height: 65px; object-fit: contain; margin-right: 15px; filter: grayscale(100%); }
            .header-text { text-align: center; }
            .header-text h2 { font-size: 16px; margin: 0; font-weight: bold; line-height: 1.1; text-transform: uppercase; }
            .header-text h3 { font-size: 11px; margin: 0; font-weight: normal; font-style: italic; text-transform: uppercase; letter-spacing: 0.5px; }
            .header-titles { margin-top: 10px; margin-left: auto; margin-right: auto; text-align: center; width: max-content; }
            .header-titles p { font-size: 11px; margin: 0; text-transform: none; }
            .header-titles h1 { font-size: 17px; margin: 0; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; }
            .instruction-box { border-right: none; padding: 6px; font-size: 11px; font-weight: normal; text-transform: none; line-height: 1.2; }
            .photo-box { width: 50.8mm; height: 50.8mm; border: 1px solid #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-style: italic; font-size: 12px; text-align: center; flex-shrink: 0; }
            .row { display: flex; align-items: flex-end; margin-bottom: 5px; width: 100%; }
            .items-center { align-items: center; }
            .label { font-weight: bold; white-space: nowrap; margin-right: 5px; font-size: 10px;}
            .label-offset { margin-bottom: 11px; }
            .flex-1 { flex: 1; }
            .field-underline { display: flex; flex-direction: column; justify-content: flex-end; margin: 0 5px; min-height: 18px;}
            .field-underline > div:first-child { border-bottom: 1px solid #000; padding: 0 5px; font-weight: bold; min-height: 14px;}
            .sub-label { font-size: 7px; text-align: center; margin-top: 2px; }
            .text-center { text-align: center; }
            .checkbox-group { display: flex; gap: 15px; font-size: 10px; align-items: center;}
            .section-title { font-weight: bold; font-style: italic; text-decoration: underline; margin-bottom: 6px; margin-top: 6px; font-size: 10px; }
          </style>
        </head>
        <body>
            ${targetApplicants.map(app => generateFormHtml(app)).join('')}
            <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
        </body>
      </html>
    `;

    printWindow.document.write(templateHtml);
    printWindow.document.close();
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
        shs: { name: "", address: "", type: "PUBLIC", year: "", gwa: "" },
        tertiary: { name: "", address: "", year: "" }
      },
      otherInfo: { isPwd: false, isIndigenous: false, isSoloParent: false, is4Ps: false },
      documents: []
    }
  });

  const openAddModal = () => {
    setNewApplicant(getInitialNewApplicant());
    setIsAddModalOpen(true);
  };

  const toTitleCase = (str) => {
    if (!str) return "";
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  };

  const updateNewApplicant = (path, value) => {
    setNewApplicant(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      let current = updated;
      const keys = path.split('.');

      // Auto-format names to Title Case
      let processedValue = value;
      if (['firstName', 'middleName', 'surname', 'spouseName'].some(k => path.includes(k))) {
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
      if (path === 'profile.personal.presAddress.city') updated.location = processedValue.toUpperCase();

      return updated;
    });
  };

  const saveNewApplicant = async () => {
    const p = newApplicant.profile.personal;
    const e = newApplicant.profile.education;
    const a = newApplicant.profile.appDetails;
    const f = newApplicant.profile.family;

    if (!a.applicantType || !a.firstChoice || !a.secondChoice ||
      !p.firstName || !p.middleName || !p.surname ||
      !p.dob || !p.sex || !p.civilStatus || !p.citizenship ||
      !p.email || !p.contact ||
      !p.permAddress.houseStreet || !p.permAddress.province || !p.permAddress.city || !p.permAddress.barangay || !p.permAddress.zip ||
      !e.elem.name || !e.elem.address || !e.elem.year ||
      !e.jhs.name || !e.jhs.address || !e.jhs.year ||
      !e.shs.name || !e.shs.address || !e.shs.year || !e.shs.gwa) {
      alert("Please fill out all required fields (marked with *).");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
      alert("Please enter a valid email address containing '@' (e.g., email@gmail.com).");
      return;
    }
    if (!/^09\d{9}$/.test(p.contact)) {
      alert("Applicant Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }
    if (f.father.contact && !/^09\d{9}$/.test(f.father.contact)) {
      alert("Father's Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }
    if (f.mother.contact && !/^09\d{9}$/.test(f.mother.contact)) {
      alert("Mother's Contact Number must start with '09' and be exactly 11 digits.");
      return;
    }

    try {
      setIsLoading(true);

      const payload = {
        password: "password123",
        email: newApplicant.profile.personal.email,
        applicantType: newApplicant.profile.appDetails.applicantType,
        firstChoice: newApplicant.profile.appDetails.firstChoice,
        secondChoice: newApplicant.profile.appDetails.secondChoice,
        schoolYear: activeYear || "2026",

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
        collegeSchool: newApplicant.profile.education.tertiary.name,
        collegeAddress: newApplicant.profile.education.tertiary.address,
        collegeYear: newApplicant.profile.education.tertiary.year,

        disability: newApplicant.profile.otherInfo.isPwd,
        indigenous: newApplicant.profile.otherInfo.isIndigenous,
        soloParent: newApplicant.profile.otherInfo.isSoloParent,
        fourPs: newApplicant.profile.otherInfo.is4Ps,
        status: "Pending Interview"
      };

      await createApplicant(payload);

      alert("Applicant successfully generated! Refreshing database...");

      window.location.reload();

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
      alert("Rubric saved successfully!");
    } catch (err) {
      console.error("Failed to save rubric:", err);
      alert("Failed to save rubric.");
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

  const openInterviewModal = (applicant) => {
    const safeApplicant = getSafeApplicant(applicant);
    const interviewerName = safeApplicant.interviewer?.trim() || currentAdminUsername;
    setSelectedApplicant({ ...safeApplicant, interviewer: interviewerName });
    const appId = applicant._id || applicant.id;

    if (draftRatings[appId]) {
      setInterviewRatings(draftRatings[appId]);
    } else {
      setInterviewRatings(applicant.interviewRatings || {});
    }

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

  const totalScore = useMemo(() => {
    let total = 0;
    rubricData.forEach(section => {
      section.criteria.forEach(crit => { total += getWeightedScore(interviewRatings[crit.id], crit.weight); });
    });
    return total.toFixed(2);
  }, [interviewRatings, rubricData]);

  const getRemarks = (scoreVal) => {
    const score = parseFloat(scoreVal);
    if (isNaN(score) || score === 0) return { label: "NO REMARKS", color: " text-gray-500 border rounded" };
    if (score >= 90) return { label: "EXCELLENT", color: "text-[#5c9c5a] border rounded" };
    if (score >= 80) return { label: "VERY GOOD", color: " text-blue-800 border rounded" };
    if (score >= 70) return { label: "GOOD", color: " text-teal-800 border rounded" };
    if (score >= 60) return { label: "FAIR", color: " text-yellow-800 border rounded" };
    return { label: "POOR", color: " text-red-800 border rounded" };
  };
  const currentRemarks = getRemarks(totalScore);

  const saveInterview = async () => {
    const scoreVal = parseFloat(totalScore);
    const newStatus = scoreVal > 69 ? "Passed" : "Failed";
    const appId = selectedApplicant._id || selectedApplicant.id;
    const interviewerName = selectedApplicant.interviewer?.trim();

    if (!interviewerName) {
      alert("Please enter the interviewer name before submitting.");
      return;
    }

    try {
      await encodeScore(
        appId,
        scoreVal,
        interviewRatings,
        selectedApplicant.interviewSchedule,
        interviewerName
      );

      try {
        await updateApplicantStatus(appId, newStatus);
      } catch (statusErr) {
        console.warn("Admission status update skipped:", statusErr);
      }

      setApplicants((prev) => prev.map((app) =>
        (app._id === appId || app.id === appId)
          ? {
            ...app,
            status: newStatus,
            interviewRatings: { ...interviewRatings },
            interviewScore: scoreVal,
            isInterviewed: true,
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
      alert("Evaluation successfully saved!");
    } catch (err) {
      console.error("Failed to save interview:", err);
      alert("Failed to save interview results.");
    }
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

  const getColSpan = () => {
    let cols = 6;
    if (userRole === "Admin" && !isArchiveMode) cols += 1;
    return cols;
  };

  /* --- RENDER --- */
  return (
    <div className="h-[calc(100vh-90px)] w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ml-2">

      <main className="flex-1 flex flex-col p-[10px] w-full h-full relative">

        {/* --- MAIN HEADER & FILTERS --- */}
        <div className="flex-none flex flex-col">

          {isArchiveMode ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-1.5 rounded-md mb-4 flex justify-between items-center shadow-sm">
              <span className="font-bold">⚠️ YOU ARE IN ARCHIVE MODE. Viewing read-only data for AY {activeYear}.</span>
              <button onClick={exitArchiveMode} className="bg-red-700 text-white px-3 py-1 rounded text-xs uppercase font-black hover:bg-red-800 transition">Return to Live</button>
            </div>
          ) : (
            <p className="text-gray-600 mb-4">
            </p>
          )}

          <div className="flex gap-3 mb-4 items-center justify-between">
            <div className="flex gap-3 items-center">

              <div className="relative">
                <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="text"
                  placeholder="Search applicant..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-4 py-2 text-[14px] rounded-lg bg-white border border-gray-100 w-[300px] outline-none shadow-sm"
                />
              </div>

              <div
                className="relative"
                ref={filterRef}
                onMouseLeave={() => setShowFilter(false)}
              >
                <button onClick={() => setShowFilter((v) => !v)} className="bg-white px-3 py-1.5 rounded-md shadow flex items-center gap-2 font-semibold">
                  <FaFilter /> Filter
                </button>
                {showFilter && (
                  <div className="absolute left-0 top-full pt-2 z-30">
                    <div className="bg-white border rounded shadow-xl p-4 w-60 max-h-[70vh] overflow-y-auto">

                      <label className="block text-xs font-bold mb-1 uppercase tracking-tight">Interview Schedule</label>
                      <select value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-xs outline-none">
                        <option value="">All Schedules</option>
                        <option value="today">Today</option>
                        <option value="tomorrow">Tomorrow</option>
                      </select>

                      <label className="block text-xs font-bold mb-1 uppercase tracking-tight">Status</label>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-xs outline-none">
                        <option value="">All Statuses</option>
                        <option value="For Interview">For Interview</option>
                        <option value="Passed">Passed</option>
                        <option value="Failed">Failed</option>
                      </select>

                      <label className="block text-xs font-bold mb-1 uppercase tracking-tight">Applicant Type</label>
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-xs outline-none">
                        <option value="">All Types</option>
                        <option value="SHS Graduate">SHS Graduate</option>
                        <option value="TRANSFEREE">Transferee</option>
                        <option value="ALS Graduate">ALS</option>
                      </select>

                      <label className="block text-xs font-bold mb-1 uppercase tracking-tight">Location</label>
                      <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full mb-3 p-2 border rounded text-xs outline-none">
                        <option value="">All Locations</option>
                        {uniqueLocations.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>

                      <div className="flex justify-between">
                        <button onClick={() => setShowFilter(false)} className="px-3 py-1 bg-[#376e35] text-white rounded text-xs font-bold">Apply</button>
                        <button onClick={() => {
                          setTypeFilter(""); setLocationFilter(""); setStatusFilter("");
                          setScheduleFilter(""); setSortOrder("newest"); setSearchQuery("");
                        }} className="px-3 py-1 bg-gray-100 rounded text-xs font-bold">Clear</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="md:ml-auto flex flex-wrap gap-3 z-[45]">
              {userRole === "SuperAdmin" && (
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                    className="bg-white text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2 font-[600] hover:bg-gray-50 transition"
                  >
                    <FaFileDownload size={14} /> Export <FaChevronDown size={10} className={`ml-1 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isExportMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-50 overflow-hidden">
                      <button onClick={exportToExcel} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                        Export to Excel (.xlsx)
                      </button>
                      <button onClick={exportTableToPDF} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                        Export PDF (Table)
                      </button>
                      <button onClick={() => exportFormsToPDF()} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-[#fafdfa]">
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
                  className={`px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 font-[600] transition ${isArchiveMode
                    ? 'bg-gray-400 text-white opacity-60 cursor-not-allowed'
                    : 'bg-blue-700 text-white hover:bg-blue-500'
                    }`}
                >
                  <FaEdit size={16} /> Edit Rubric
                </button>
              )}

              {(userRole === "SuperAdmin" || userRole === "Admin") && (
                <button
                  onClick={isArchiveMode ? undefined : openAddModal}
                  disabled={isArchiveMode}
                  className={`px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 font-[600] transition ${isArchiveMode
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
              <thead className="bg-[#E4F6E2] text-[#2e522a] sticky top-0 z-20">
                <tr className="text-[13.5px] border-b border-[#cbd5e1]">
                  <th className="px-4 py-3 text-left text-[14px] font-bold">ID</th>
                  <th className="px-4 py-3 text-left text-[14px] font-bold whitespace-nowrap">
                    <div className="relative inline-block pr-1 mt-1">
                      Applicant Name
                      <span className="absolute -top-2 -right-5 bg-yellow-400 text-yellow-900 rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] font-black shadow-sm leading-none" title="Total Applicants">
                        {filteredApplicants.length}
                      </span>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-[14px] font-bold">Type</th>
                  <th className="px-4 py-3 text-left text-[14px] font-bold">Location</th>
                  <th className="px-4 py-3 text-center text-[14px] font-bold">Date Applied</th>
                  <th className="px-4 py-3 text-center text-[14px] font-bold">Status</th>
                  <th className="px-4 py-3 text-center text-[14px] font-bold">Action</th>
                  {!isArchiveMode && userRole === "Admin" && (
                    <th className="px-4 py-3 pr-6 text-center w-16 relative overflow-visible">
                      <CustomCheckbox
                        checked={isSelectAllChecked}
                        onChange={handleSelectAll}
                      />
                      {activePopover === 'all' && selectedApplicantIds.length > 0 && (
                        <div className="absolute right-[3.5rem] top-1/2 -translate-y-1/2 mr-1 bg-white border border-[#3a7538] rounded shadow-xl z-[60] flex text-black text-[11px] font-black tracking-wide whitespace-nowrap overflow-hidden">
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
                  <tr><td colSpan={getColSpan()} className="text-center py-8 text-gray-500">Loading applicants...</td></tr>
                ) : filteredApplicants.map((a, index) => {
                  const isNearBottom = index >= filteredApplicants.length - 2 && filteredApplicants.length > 2;

                  return (
                    <tr key={a._id || a.id} className={`hover:bg-[#fafdfa] transition-colors ${selectedApplicantIds.includes(a._id || a.id) ? 'bg-[#e4f6e2]' : ''}`}>
                      <td className="px-4 py-2 text-xs text-gray-600 text-left">{a.id}</td>
                      <td className="px-4 py-2 text-xs text-gray-800 text-left">{a.name}</td>
                      <td className="px-4 py-2 text-xs uppercase text-gray-600 text-left">{a.type}</td>
                      <td className="px-4 py-2 text-xs uppercase text-gray-600 text-left">{a.location}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 text-center">{a.date}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-1.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border 
                        ${a.status === 'Passed' ? 'bg-green-100 text-[#376e35] border-green-200' :
                            a.status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setSelectedApplicant(getSafeApplicant(a)); setIsModalOpen(true); }}
                            className="group relative flex items-center justify-center w-7 h-7 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg transition-all shadow-sm"
                            title="Applicant Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => openInterviewModal(a)}
                            className="group relative flex items-center justify-center w-7 h-7 bg-yellow-50 hover:bg-yellow-100 text-orange-500 border border-yellow-200 rounded-lg transition-all shadow-sm"
                            title="Interview"
                          >
                            <MessageSquare size={16} />
                          </button>
                        </div>
                      </td>

                      {!isArchiveMode && userRole === "Admin" && (
                        <td className="px-4 py-2 pr-6 text-center relative overflow-visible">
                          <CustomCheckbox
                            checked={selectedApplicantIds.includes(a._id || a.id)}
                            onChange={() => handleSelectApplicant(a._id || a.id)}
                          />

                          {activePopover === (a._id || a.id) && selectedApplicantIds.includes(a._id || a.id) && (
                            <div className={`absolute right-[3.5rem] z-[60] mr-1 bg-white border border-[#3a7538] rounded shadow-xl flex text-black text-[11px] font-black tracking-wide whitespace-nowrap overflow-hidden ${isNearBottom ? 'bottom-2' : 'top-2'}`}>
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
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="flex items-center justify-between rounded-t-[10px] bg-[#376e35] text-white px-6 py-2.5 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-[15px] uppercase tracking-wider">Add New Applicant</h3>
              </div>
              <button className="text-white hover:text-red-200 transition text-3xl font-bold" onClick={() => setIsAddModalOpen(false)}>&times;</button>
            </div>

            <div className="p-8 overflow-y-auto bg-gray-50 space-y-8 flex-1">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Application Details" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex flex-col">
                    <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">Applicant Type<span className="text-red-500 ml-1 text-xs leading-none">*</span></label>
                    <select
                      value={newApplicant.profile.appDetails.applicantType}
                      onChange={(e) => updateNewApplicant('profile.appDetails.applicantType', e.target.value)}
                      className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm outline-none focus:border-[#3a7538]"
                    >
                      <option value="SELECT APPLICANT TYPE">SELECT APPLICANT TYPE</option>
                      <option value="SHS GRADUATE">SHS GRADUATE</option>
                      <option value="TRANSFEREE">TRANSFEREE</option>
                      <option value="ALS">ALS</option>
                    </select>
                  </div>
                  <SelectFormField required label="First Choice Course" value={newApplicant.profile.appDetails.firstChoice} onChange={e => updateNewApplicant('profile.appDetails.firstChoice', e.target.value)} options={coursesList} />
                  <SelectFormField required label="Second Choice Course" value={newApplicant.profile.appDetails.secondChoice} onChange={e => updateNewApplicant('profile.appDetails.secondChoice', e.target.value)} options={coursesList} />
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
                      <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">Date of Birth<span className="text-red-500 ml-1 text-xs leading-none">*</span></label>
                      <CustomDatePicker required value={newApplicant.profile.personal.dob} onChange={val => updateNewApplicant('profile.personal.dob', val)} />
                    </div>

                    <InputFormField label="Place of Birth" value={newApplicant.profile.personal.pob} onChange={e => updateNewApplicant('profile.personal.pob', e.target.value)} />

                    <div className="flex flex-col">
                      <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">Gender<span className="text-red-500 ml-1 text-xs leading-none">*</span></label>
                      <select value={newApplicant.profile.personal.sex} onChange={e => updateNewApplicant('profile.personal.sex', e.target.value)} className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm outline-none">
                        <option value="MALE">MALE</option>
                        <option value="FEMALE">FEMALE</option>
                      </select>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">Civil Status<span className="text-red-500 ml-1 text-xs leading-none">*</span></label>
                      <select value={newApplicant.profile.personal.civilStatus} onChange={e => updateNewApplicant('profile.personal.civilStatus', e.target.value)} className="h-10 w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-xs text-gray-800 shadow-sm outline-none">
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
                    <InputFormField required label="Contact Number" value={newApplicant.profile.personal.contact} onChange={e => updateNewApplicant('profile.personal.contact', e.target.value)} />

                    <AddressDropdowns
                      required
                      label="Permanent Address"
                      addressData={newApplicant.profile.personal.permAddress}
                      onChange={(field, value) => updateNewApplicant(`profile.personal.permAddress.${field}`, value)}
                    />

                    <AddressDropdowns
                      required
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
                  <div className="md:col-span-3 grid grid-cols-3 gap-2">
                    <InputFormField label="Father First Name" value={newApplicant.profile.family.father.firstName} onChange={e => updateNewApplicant('profile.family.father.firstName', e.target.value)} />
                    <InputFormField label="Father Middle Name" value={newApplicant.profile.family.father.middleName} onChange={e => updateNewApplicant('profile.family.father.middleName', e.target.value)} />
                    <InputFormField label="Father Surname" value={newApplicant.profile.family.father.surname} onChange={e => updateNewApplicant('profile.family.father.surname', e.target.value)} />
                  </div>
                  <div className="md:col-span-1">
                    <InputFormField label="Contact" value={newApplicant.profile.family.father.contact} onChange={e => updateNewApplicant('profile.family.father.contact', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-3 grid grid-cols-3 gap-2">
                    <InputFormField label="Mother First Name" value={newApplicant.profile.family.mother.firstName} onChange={e => updateNewApplicant('profile.family.mother.firstName', e.target.value)} />
                    <InputFormField label="Mother Middle Name" value={newApplicant.profile.family.mother.middleName} onChange={e => updateNewApplicant('profile.family.mother.middleName', e.target.value)} />
                    <InputFormField label="Mother Maiden Surname" value={newApplicant.profile.family.mother.surname} onChange={e => updateNewApplicant('profile.family.mother.surname', e.target.value)} />
                  </div>
                  <div className="md:col-span-1">
                    <InputFormField label="Contact" value={newApplicant.profile.family.mother.contact} onChange={e => updateNewApplicant('profile.family.mother.contact', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Educational Background" />
                {[
                  { title: "Elementary", key: "elem" },
                  { title: "Junior High School", key: "jhs" },
                  { title: "Senior High School", key: "shs" },
                  { title: "Tertiary", key: "tertiary" }
                ].map((level) => (
                  <div key={level.key} className="mb-4 last:mb-0">
                    <div className="text-xs font-black text-[#376e35] uppercase mb-2">{level.title}</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <InputFormField required={level.key !== 'tertiary'} className={level.key === 'shs' ? "md:col-span-4" : "md:col-span-5"} label="School Name" value={newApplicant.profile.education[level.key].name} onChange={e => updateNewApplicant(`profile.education.${level.key}.name`, e.target.value)} />
                      <InputFormField required={level.key !== 'tertiary'} className={level.key === 'shs' ? "md:col-span-4" : "md:col-span-5"} label="School Address" value={newApplicant.profile.education[level.key].address} onChange={e => updateNewApplicant(`profile.education.${level.key}.address`, e.target.value)} />
                      <InputFormField required={level.key !== 'tertiary'} className="md:col-span-2" label="Year Graduated" value={newApplicant.profile.education[level.key].year} onChange={e => updateNewApplicant(`profile.education.${level.key}.year`, e.target.value)} />
                      {level.key === 'shs' && (
                        <InputFormField required className="md:col-span-2" label="Grade 11 GWA" value={newApplicant.profile.education.shs.gwa} onChange={e => updateNewApplicant('profile.education.shs.gwa', e.target.value)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Other Information" />
                <div className="space-y-1">
                  {[
                    { label: 'I have a disability', key: 'isPwd' },
                    { label: 'I am part of an indigenous group', key: 'isIndigenous' },
                    { label: 'I am a solo parent/ child of a solo parent', key: 'isSoloParent' },
                    { label: 'I am a member of Pantawid Pamilyang Pilipino Program (4Ps)', key: 'is4Ps' }
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-1 p-1 m-0 rounded-lg cursor-pointer w-max"
                      onClick={() => updateNewApplicant(`profile.otherInfo.${item.key}`, !newApplicant.profile.otherInfo[item.key])}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${newApplicant.profile.otherInfo[item.key] ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-400 bg-white hover:border-blue-400'}`}>
                        {newApplicant.profile.otherInfo[item.key] && <CheckCircle size={14} />}
                      </div>
                      <span className="text-xs font-bold text-gray-700 uppercase select-none">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="bg-gray-50 border-t border-gray-300 p-4 shrink-0 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-md bg-gray-500 hover:bg-gray-600 font-bold uppercase text-xs text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={saveNewApplicant}
                className="px-6 py-2 rounded-md bg-[#376e35] hover:bg-[#5c9c5a] text-white font-bold uppercase text-xs transition shadow flex items-center gap-2"
              >
                Save Applicant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW APPLICANT MODAL --- */}
      {isModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden">

            <div className="flex items-center justify-between rounded-t-[10px] bg-[#376e35] text-white px-6 py-2.5 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="font-black text-[15px] uppercase tracking-wider">Applicant Details</h3>
                <span className=" px-3 py-1 rounded text-xs font-mono">{selectedApplicant.id}</span>
              </div>
              <button className="text-white hover:text-red-200 transition text-3xl font-bold" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>

            <div className="p-8 overflow-y-auto bg-gray-50 space-y-8 flex-1">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Application Details" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                  <div>
                    <FormField label="Applicant Type" value={selectedApplicant.profile.appDetails.applicantType} />
                  </div>
                  <FormField label="First Choice Course" value={selectedApplicant.profile.appDetails.firstChoice} />
                  <FormField label="Second Choice Course" value={selectedApplicant.profile.appDetails.secondChoice} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Personal Information" />
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="shrink-0 flex flex-col">
                    <label className="text-[11px] font-bold text-gray-700 uppercase mb-1">Applicant Picture</label>
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
                    <FormField label="First Name" value={selectedApplicant.profile.personal.firstName} />
                    <FormField label="Middle Name" value={selectedApplicant.profile.personal.middleName} />
                    <FormField label="Surname" value={selectedApplicant.profile.personal.surname} />
                    <FormField label="Suffix" value={selectedApplicant.profile.personal.extension} />
                    <FormField label="Date of Birth" value={selectedApplicant.profile.personal.dob} />
                    <FormField label="Place of Birth" value={selectedApplicant.profile.personal.pob} />
                    <FormField label="Gender" value={selectedApplicant.profile.personal.sex} />
                    <FormField label="Civil Status" value={selectedApplicant.profile.personal.civilStatus} />

                    {selectedApplicant.profile.personal.civilStatus === 'MARRIED' && (
                      <FormField label="Name of Spouse" value={selectedApplicant.profile.personal.spouseName} />
                    )}

                    <FormField label="Email Address" value={selectedApplicant.profile.personal.email} />
                    <FormField label="Contact Number" value={selectedApplicant.profile.personal.contact} />
                    <div className="md:col-span-2 lg:col-span-4">
                      <FormField label="Permanent Address" value={formatAddress(selectedApplicant.profile.personal.permAddress)} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-4">
                      <FormField label="Present Address" value={formatAddress(selectedApplicant.profile.personal.presAddress)} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Family Information" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <FormField label="FATHER'S NAME" value={formatFamilyName(selectedApplicant.profile.family.father)} />
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="CONTACT" value={selectedApplicant.profile.family.father.contact} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <FormField label="MOTHER'S MAIDEN NAME" value={formatFamilyName(selectedApplicant.profile.family.mother)} />
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="CONTACT" value={selectedApplicant.profile.family.mother.contact} />
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Educational Background" />
                {[
                  { title: "Elementary", key: "elem", data: selectedApplicant.profile.education.elem },
                  { title: "Junior High School", key: "jhs", data: selectedApplicant.profile.education.jhs },
                  { title: "Senior High School", key: "shs", data: selectedApplicant.profile.education.shs },
                  { title: "Tertiary", key: "tertiary", data: selectedApplicant.profile.education.tertiary }
                ].map((level, idx) => (
                  <div key={idx} className="mb-4 last:mb-0">
                    <div className="text-xs font-black text-[#376e35] uppercase mb-2">{level.title}</div>
                    <hr className="border-gray-200 mb-4" />
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      <FormField className={level.key === 'shs' ? "md:col-span-4" : "md:col-span-5"} label="School Name" value={level.data.name} />
                      <FormField className={level.key === 'shs' ? "md:col-span-4" : "md:col-span-5"} label="School Address" value={level.data.address} />
                      <FormField className="md:col-span-2" label="Year Graduated" value={level.data.year} />
                      {level.key === 'shs' && (
                        <FormField className="md:col-span-2" label="Grade 11 GWA" value={level.data.gwa} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Other Information" />
                <div className="space-y-4">
                  {[
                    { label: 'I have a disability', key: 'isPwd' },
                    { label: 'I am part of an indigenous group', key: 'isIndigenous' },
                    { label: 'I am a solo parent/ child of a solo parent', key: 'isSoloParent' },
                    { label: 'I am a member of Pantawid Pamilyang Pilipino Program (4Ps)', key: 'is4Ps' }
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-3 p-1 m-0 rounded-lg  ">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedApplicant.profile.otherInfo[item.key] ? 'bg-[#376e35] border-[#376e35] text-white' : 'border-gray-300 bg-white'}`}>
                        {selectedApplicant.profile.otherInfo[item.key] && <CheckCircle size={14} />}
                      </div>
                      <span className="text-xs font-bold text-gray-700 uppercase">{item.label}</span>
                    </div>
                  ))}
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
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-[#376e35] mr-3 shrink-0 overflow-hidden">
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
                  <p className="text-xs text-gray-500 italic uppercase">No documents submitted.</p>
                )}
              </div>
            </div>

            <div className="bg-gray-50 border-t border-gray-300 p-4 shrink-0 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <button
                onClick={() => exportFormsToPDF([selectedApplicant])}
                className="px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-600 font-bold uppercase text-xs text-white transition flex items-center gap-2 shadow"
              >
                <FaPrint /> Print Form
              </button>
              <div className="flex-1"></div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-md bg-gray-400 hover:bg-gray-600 font-bold uppercase text-xs text-white transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  openInterviewModal(selectedApplicant);
                }}
                className="px-6 py-2 rounded-md bg-[#376e35] hover:bg-[#3a7538] text-white font-bold uppercase text-xs transition shadow flex items-center gap-2"
              >
                <MessageSquare size={16} />
                Interview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- INTERVIEW SCORING MODAL --- */}
      {isInterviewModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInterviewModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="flex items-center justify-between rounded-t-[10px] bg-[#376e35] text-white px-6 py-2.5 shrink-0">
              <div className="flex items-center justify-between w-full ">
                <h3 className="font-black text-[15px] uppercase tracking-tight text-white">Interview Rubric {(isArchiveMode || userRole === "SuperAdmin")}</h3>
                <button onClick={() => setIsInterviewModalOpen(false)} className=" text-gray-100 hover:text-red-200 font-bold text-3xl leading-none">&times;</button>
              </div>
            </div>
            <div className="bg-white border-b border-gray-300 px-6 py-2 shrink-0">
              <div className="grid grid-cols-12 gap-4 mt-4 text-xs">
                <div className="col-span-8 flex flex-col">
                  <label className="font-bold text-gray-700 uppercase text-xs">Program</label>
                  <div className="border-b border-gray-400 py-1 font-semibold uppercase text-gray-900">{selectedApplicant.profile.appDetails.firstChoice}</div>
                </div>

                <div className="col-span-4 flex flex-col">
                  <label className="font-bold text-gray-700 uppercase text-xs">Interview Date</label>
                  <input
                    type="text"
                    disabled={isArchiveMode || userRole === "SuperAdmin"}
                    value={selectedApplicant.interviewSchedule || ""}
                    onChange={(e) => setSelectedApplicant(prev => ({ ...prev, interviewSchedule: e.target.value }))}
                    className={`border-b border-gray-400 py-1 font-semibold outline-none focus:border-[#3a7538] bg-transparent w-full transition-colors ${(isArchiveMode || userRole === "SuperAdmin") ? 'text-gray-600 cursor-not-allowed' : 'text-gray-900'}`}
                    placeholder="YYYY-MM-DD"
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
                <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 font-bold text-center text-xs uppercase">
                  <div className="col-span-2 border-r border-black p-1">Rating</div>
                  <div className="col-span-10 p-1">Professional Description</div>
                </div>
                {[
                  { range: "90-100", label: "Excellent", desc: "Outstanding performance; exceeds the expected readiness for the chosen program." },
                  { range: "80-89", label: "Very Good", desc: "Strong, above-average performance; meets expectations effectively." },
                  { range: "70-79", label: "Good", desc: "Satisfactory performance; meets minimum program standards." },
                  { range: "60-69", label: "Fair", desc: "Needs improvement; partially meets expectations." },
                  { range: "59 Below", label: "Poor", desc: "Does not meet expectations; major weaknesses observed." },
                ].map((row, i) => (
                  <div key={i} className="grid grid-cols-12 border-b border-black last:border-0 text-xs">
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
                    <table className="w-full border-2 border-black text-xs bg-white">
                      <thead className="bg-gray-100 uppercase text-xs font-bold border-b-2 border-black">
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
                                title={(isArchiveMode || userRole === "SuperAdmin") ? "Read only" : "Type a number or double-click for a list"}
                                className={`w-20 text-center font-bold text-base outline-none ${(isArchiveMode || userRole === "SuperAdmin") ? 'bg-transparent text-gray-600 cursor-not-allowed' : 'cursor-text'}`}
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
                                      className="px-2 py-1.5 hover:bg-[#3a7538] hover:text-white cursor-pointer text-xs font-bold text-gray-800 text-center border-b last:border-none border-gray-100 transition-colors"
                                    >
                                      {num}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td className="p-2 text-center align-middle font-black text-base bg-gray-50">
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
                      <span className="font-bold text-base uppercase text-gray-800">Total:</span>
                      <span className="font-black text-base text-[#376e35]">{getSectionTotal(section)}</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            <div className="bg-gray-50 border-t border-gray-400 text-white p-4 shrink-0 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <span className="uppercase text-gray-800 font-bold text-xs">General Weighted Average :</span>
                  <span className="text-3xl font-black text-[#376e35] tracking-wider">{totalScore}</span>
                </div>

                <div className="h-8 w-px bg-gray-300"></div>

                <div className="flex gap-2.5">
                  <span className="text-[15px] font-bold pt-2 text-gray-700 uppercase leading-none mb-1">Remarks:</span>
                  <div className={`px-4 py-2 border rounded  text-xs font-black uppercase tracking-wider shadow-sm ${currentRemarks.color}`}>
                    {currentRemarks.label}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsInterviewModalOpen(false)}
                  className="px-4 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 font-bold uppercase text-xs transition"
                >
                  {(isArchiveMode || userRole === "SuperAdmin") ? "Close " : "Cancel"}
                </button>
                {(!isArchiveMode && userRole === "Admin") && (
                  <button
                    onClick={saveInterview}
                    className="px-6 py-1.5 rounded-md bg-[#376e35] hover:bg-[#5c9c5a] text-white font-bold uppercase text-xs transition shadow-lg flex items-center gap-2"
                  >
                    Submit Evaluation
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- EDIT RUBRIC MODAL --- */}
      {isRubricEditModalOpen && !isArchiveMode && userRole === "SuperAdmin" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsRubricEditModalOpen(false)}></div>
          <div className="relative bg-white rounded-[10px] shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className="flex items-center justify-between rounded-t-[10px] bg-[#376e35] text-white px-6 py-2.5 shrink-0">
              <div className="flex items-center justify-between w-full ">
                <h3 className="font-black text-[15px] uppercase tracking-tight text-white flex items-center gap-3">
                  Edit Interview Rubric
                </h3>
                <button onClick={() => setIsRubricEditModalOpen(false)} className=" text-gray-100 hover:text-red-200 font-bold text-3xl leading-none">&times;</button>
              </div>
            </div>

            <div className="bg-white border-b border-gray-300 px-6 py-2 shrink-0">
              <div className="flex justify-end mt-4 pb-2">
                <label className="bg-[#376e35] hover:bg-[#3a7538] text-white px-3 py-1.5 rounded-md shadow cursor-pointer flex items-center gap-2 text-xs font-bold transition uppercase tracking-wide">
                  <FaUpload />
                  Import CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">

              <div className="mb-6 border-2 border-black opacity-80 pointer-events-none">
                <div className="grid grid-cols-12 border-b-2 border-black bg-gray-200 font-bold text-center text-xs uppercase">
                  <div className="col-span-2 border-r border-black p-1">Rating</div>
                  <div className="col-span-10 p-1">Professional Description</div>
                </div>
                {[
                  { range: "90-100", label: "Excellent", desc: "Outstanding performance; exceeds the expected readiness for the chosen program." },
                  { range: "80-89", label: "Very Good", desc: "Strong, above-average performance; meets expectations effectively." },
                  { range: "70-79", label: "Good", desc: "Satisfactory performance; meets minimum program standards." },
                  { range: "60-69", label: "Fair", desc: "Needs improvement; partially meets expectations." },
                  { range: "59 Below", label: "Poor", desc: "Does not meet expectations; major weaknesses observed." },
                ].map((row, i) => (
                  <div key={i} className="grid grid-cols-12 border-b border-black last:border-0 text-xs">
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

                    <table className="w-full border-2 border-black text-xs bg-white">
                      <thead className="bg-gray-100 uppercase text-xs font-bold border-b-2 border-black">
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
                              <input disabled className="w-20 text-center font-bold text-base outline-none bg-transparent" placeholder="-" />
                            </td>
                            <td className="p-0 text-center align-middle font-black text-base bg-gray-100 text-gray-400 relative">
                              <span className="group-hover:opacity-0 transition-opacity flex items-center justify-center w-full h-full min-h-[40px]">-</span>
                              <button
                                onClick={() => handleRemoveCriteria(sIndex, cIndex)}
                                className="absolute inset-0 w-full h-full flex items-center justify-center  text-red-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Remove Row"
                              >
                                <FaTrash size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}

                        <tr>
                          <td colSpan={5} className="p-0 bg-gray-50 hover:bg-gray-200 transition-colors cursor-pointer">
                            <button
                              onClick={() => handleAddCriteria(sIndex)}
                              className="w-full py-2 flex justify-center items-center gap-2 text-[#376e35] hover:text-[#5c9c5a] font-bold text-xs uppercase outline-none focus:bg-green-50"
                            >
                              <FaPlus /> Add Row
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="bg-gray-100 border-x-2 border-b-2 pr-14 border-black py-1 flex justify-end items-center gap-16">
                      <span className="font-bold text-base uppercase text-[#376e35]">Total Section Weight:</span>
                      <span className="font-black text-base text-[#376e35]">{getEditSectionTotal(section)}%</span>
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleAddSection}
                  className="w-full py-2 text-base mt-6 border-2 border-dashed border-[#3a7538] text-[#376e35] font-bold uppercase rounded-lg hover:bg-green-50 hover:text-[#5c9c5a] transition flex justify-center items-center gap-2 shadow-sm"
                >
                  <FaPlus /> Add New Section
                </button>

              </div>

            </div>

            <div className="bg-gray-50 border-t border-gray-400 p-4 shrink-0 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <span className="uppercase text-gray-800 font-bold text-xs">General Weighted Total :</span>
                  <span className={`text-3xl font-black tracking-wider ${getEditTotalRubricWeight() === 100 ? 'text-[#376e35]' : 'text-red-600'}`}>
                    {getEditTotalRubricWeight()}%
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsRubricEditModalOpen(false)}
                  className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 font-bold uppercase text-xs text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRubric}
                  className="px-6 py-2 rounded-md bg-[#376e35] hover:bg-[#5c9c5a] text-white font-bold uppercase text-xs transition shadow-lg flex items-center gap-2"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
            <div className="bg-white text-[#376e35] px-6 py-4 flex justify-between items-center shrink-0 z-10 relative shadow-md">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-bold text-base uppercase tracking-wider">{previewDoc.name}</h3>
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
                <FaTimes size={16} />
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

      {/* --- CONFIRMATION MODAL --- */}
      {isConfirmModalOpen && !isArchiveMode && userRole === "Admin" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsConfirmModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

            <div className={`flex items-center justify-between px-6 py-4 shrink-0 ${confirmActionStatus === 'Passed' ? 'bg-[#3a7538]' : 'bg-red-600'}`}>
              <h3 className="font-bold text-base text-white uppercase tracking-wider">Confirm Action</h3>
              <button className="text-white hover:text-gray-200 transition text-xl font-bold leading-none" onClick={() => setIsConfirmModalOpen(false)}>&times;</button>
            </div>

            <div className="p-6 text-center text-gray-700">
              <p className="text-base mb-2">
                Are you sure you want to mark the selected <strong>{selectedApplicantIds.length}</strong> applicant(s) as <span className={`font-black uppercase tracking-wider ${confirmActionStatus === 'Passed' ? 'text-[#3a7538]' : 'text-red-600'}`}>{confirmActionStatus}</span>?
              </p>
            </div>

            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-1.5 rounded-md bg-gray-500 hover:bg-gray-600 font-bold uppercase text-xs text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkUpdate}
                className={`px-6 py-1.5 rounded-md font-bold uppercase text-xs text-white transition shadow ${confirmActionStatus === 'Passed' ? 'bg-[#3a7538] hover:bg-[#5c9c5a]' : 'bg-red-600 hover:bg-red-500'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
