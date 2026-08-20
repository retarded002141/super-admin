import { useState, useRef, useMemo, useEffect } from "react";
import api from "../../../services/api";
import {
  FaSearch, FaFilter, FaFileExport, FaFileImport, FaCheck, FaChevronDown,
  FaEye, FaTimes, FaSearchPlus, FaSearchMinus, FaRedo, FaFileDownload, FaPrint, FaPlus, FaEnvelope
} from "react-icons/fa";
import { FileText, CheckCircle, MessageSquare, Eye, Edit, MailCheck } from "lucide-react";
import { useToast } from "../context/ToastContext.jsx";
import { ButtonSpinner, PageLoader } from "../components/Loaders.jsx";

import * as XLSX from "xlsx-js-style";

/** CONSTANTS & HELPERS */
const token = localStorage.getItem('token');
const BASE_URL = "http://localhost:8000";

const getImageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('blob:') || path.startsWith('http')) return path;
  let cleanPath = path.replace(/\\/g, '/');
  cleanPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  return `${BASE_URL}${cleanPath}?token=${token}`;
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
  { id: "III", title: "III. Program Awareness & Academic Readiness (25%)", criteria: [{ id: "3_1", name: "Understanding of Chosen Program", desc: "Shows awareness of program content, expectations, and career paths.", weight: 10 }, { id: "3_2", name: "Logical & Critical Thinking", desc: "Demonstrates reasoning, problem-solving, and analytical skills.", weight: 10 }, { id: "3_3", name: "Alignment of Skills & Interests", desc: "Shows that abilities and interests fit the chosen program.", weight: 5 }] },
  { id: "IV", title: "IV. Motivation, Goals & Overall Impression (20%)", criteria: [{ id: "4_1", name: "Motivation for the Program", desc: "Shows genuine reason for choosing the program.", weight: 10 }, { id: "4_2", name: "Career Goals", desc: "Presents realistic, clear, and purposeful future plans.", weight: 5 }, { id: "4_3", name: "Overall Impression", desc: "Demonstrates potential to succeed in the program.", weight: 5 }] }
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
  return (info.isPwd || info.isIndigenous || info.isSoloParent || info.is4Ps) ? 5 : 0;
};

const calculateTotal = (app) => {
  const bcet = parseFloat(app.examScore) || 0;
  const interview = parseFloat(app.interviewScore) || 0;
  const gwa = getGWA(app);
  const bonus = getBonus(app);

  if (bcet === 0 && interview === 0 && gwa === 0) return 0;

  const total = ((bcet / 100) * 50) + ((gwa / 100) * 20) + ((interview / 100) * 25) + bonus;
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
  if (normalized === "CONFIRMED" || normalized === "ACCEPTED") return "Confirmed";
  if (normalized === "PASSED" || normalized === "ADMITTED") return "Passed";
  if (normalized === "FAILED" || normalized === "REJECTED") return "Failed";
  if (normalized === "FORFEIT" || normalized === "NO-SHOW" || normalized === "DECLINED") return "Forfeit";
  return "Pending";
};

const StatusTag = ({ status }) => {
  const displayStatus = normalizeAdmissionRemark(status);
  let colors = "bg-yellow-100 text-yellow-700 border-yellow-200";
  if (displayStatus === "Confirmed") colors = "bg-blue-600 text-white border-blue-700";
  if (displayStatus === "Passed") colors = "bg-green-100 text-green-800 border-green-200";
  if (displayStatus === "Failed") colors = "bg-red-100 text-red-700 border-red-200";
  if (displayStatus === "Forfeit") colors = "bg-gray-200 text-gray-600 border-gray-300";
  return (
    <span className={`px-3 py-1.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border ${colors}`}>
      {displayStatus}
    </span>
  );
};

const FormField = ({ label, value, className = "" }) => (
  <div className={`flex flex-col ${className}`}>
    <label className="text-[10px] font-bold text-gray-700 uppercase mb-1">{label}</label>
    <div className="h-[36px] w-full px-3 py-2 bg-white border border-gray-400 rounded-md text-[12px] text-gray-800 uppercase truncate cursor-default flex items-center shadow-sm">
      {value || "N/A"}
    </div>
  </div>
);

const SectionHeader = ({ title }) => (
  <div className="mb-4 pb-2 border-b border-gray-200">
    <h3 className="text-[12px] font-black text-[#376e35] uppercase tracking-wide">{title}</h3>
  </div>
);

export default function Admission({ navigateToTab }) {
  const { toast } = useToast();

  // --- STATES ---
  const [loading, setLoading] = useState(true);
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

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [instituteFilter, setInstituteFilter] = useState("All");
  const [courseFilter, setCourseFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [selectedIds, setSelectedIds] = useState([]);
  const [activePopupId, setActivePopupId] = useState(null);

  // Modal States
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmActionStatus, setConfirmActionStatus] = useState(null);
  const [confirmTargetId, setConfirmTargetId] = useState(null);

  // View Only Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(0.8);

  // Email Modal States
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("Admission Qualification Notice");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailTarget, setEmailTarget] = useState("");

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

  // --- API DATA FETCHING ---
  const exitArchiveMode = () => {
    sessionStorage.removeItem("archiveViewYear");
    window.location.reload();
  };

  const fetchApplicants = async () => {
    try {
      setLoading(true);

      const [profileRes, coursesRes, institutesRes, settingsRes] = await Promise.all([
        api.get('/admin/profile'),
        api.get('/admin/courses'),
        api.get('/admin/institutes'),
        api.get('/public/settings')
      ]);

      setUserRole(profileRes.data.role || "Admin");
      setUserInstitute(profileRes.data.institute || "IITI");
      setCoursesList(coursesRes.data || []);
      setInstitutesList(institutesRes.data || []);

      const archiveYear = sessionStorage.getItem("archiveViewYear");

      const currentViewYear = archiveYear || settingsRes.data.schoolYear;
      setActiveYear(currentViewYear);
      if (archiveYear) setIsArchiveMode(true);

      const res = await api.get('/admin/applicants', { params: { schoolYear: currentViewYear } });
      if (res.data && Array.isArray(res.data)) {
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
            intStatus = app.interviewScore >= 75 ? "Passed" : "Failed";
          } else if (app.interviewStatus === 'Passed' || app.admissionStatus === 'Admitted' || app.status === 'Passed') {
            intStatus = "Passed";
          } else if (app.interviewStatus === 'Failed' || app.status === 'Failed') {
            intStatus = "Failed";
          }

          let bcetStatus = "Pending";
          if (app.examScore !== undefined && app.examScore !== null && app.examScore > 0) {
            bcetStatus = app.examScore >= 75 ? "Passed" : "Failed";
          } else if (app.examStatus === "Passed" || app.examStatus === "Failed") {
            bcetStatus = app.examStatus;
          }

          const tempApp = { ...safe, examScore: app.examScore || 0, interviewScore: app.interviewScore || 0 };
          const totalPerc = parseFloat(calculateTotal(tempApp));

          let admStatus = app.admissionStatus || app.status || "Pending";
          const savedRemarks = app.admissionRemarks || "";

          // Compute Passed/Failed if admission status is not Confirmed or Forfeit
          // Also check admissionRemarks since admissionStatus stores "Admitted" for confirmed
          if (admStatus !== "Confirmed" && admStatus !== "Forfeit" && savedRemarks !== "Confirmed" && savedRemarks !== "Forfeit") {
            if (intStatus === "Pending" || bcetStatus === "Pending") {
              admStatus = "Pending";
            } else if (totalPerc >= 75) {
              admStatus = "Passed";
            } else {
              admStatus = "Failed";
            }
          } else if (savedRemarks === "Confirmed") {
            admStatus = "Confirmed";
          } else if (savedRemarks === "Forfeit") {
            admStatus = "Forfeit";
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
            admissionRemarks: savedRemarks || admStatus,
            admissionStatus: admStatus,
            status: admStatus,

            isEmailSent: app.isEmailSent || false,
            interviewRatings: app.interviewRatings || {},
            interviewer: app.interviewer || "",
            interviewScore: app.interviewScore || 0,
            examScore: app.examScore || 0,
            interviewSchedule: app.interviewDate || app.interviewSchedule || ""
          };
        });
        setApplicants(formatted);
      }

      try {
        const rubricRes = await api.get('/admin/rubric');
        if (rubricRes.data && rubricRes.data.length > 0) setRubricData(rubricRes.data);
      } catch (e) { }

    } catch (err) {
      console.error("Failed to fetch admission list:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApplicants(); }, []);

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

    // 1. THE RBAC SECURITY FILTER 
    if (userRole === "SuperAdmin" && instituteFilter !== "All") {
      result = result.filter(app => {
        return String(app.institute).trim().toUpperCase() === String(instituteFilter).trim().toUpperCase();
      });
    }

    // 2. SEARCH FILTER
    if (searchQuery) {
      const lowerTerm = searchQuery.toLowerCase();
      result = result.filter(app =>
        app.name.toLowerCase().includes(lowerTerm) ||
        (app.id && app.id.toLowerCase().includes(lowerTerm)) ||
        (app.email && app.email.toLowerCase().includes(lowerTerm))
      );
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
        const secondAbbr = getCourseAbbreviation(app.profile?.appDetails?.secondChoice, coursesList);
        return firstAbbr === courseFilter || secondAbbr === courseFilter;
      });
    }

    return result;
  }, [applicants, searchQuery, typeFilter, statusFilter, courseFilter, userRole, instituteFilter, coursesList]);

  const eligibleApplicants = filteredApplicants.filter((a) => a.admissionRemarks !== "Pending" && a.admissionStatus !== "Forfeit");
  const isAllSelected = eligibleApplicants.length > 0 && eligibleApplicants.every((a) => selectedIds.includes(a.id));

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
    const app = applicants.find(a => a.id === id);
    let dbStatus = newStatus;
    if (newStatus === "Passed") dbStatus = "Admitted";
    if (newStatus === "Failed") dbStatus = "Failed";

    setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, admissionRemarks: newStatus, admissionStatus: newStatus, status: newStatus } : a)));
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
  };

  const handleBulkAction = async (newStatus) => {
    let dbStatus = newStatus;
    if (newStatus === "Passed") dbStatus = "Admitted";
    if (newStatus === "Failed") dbStatus = "Failed";

    setApplicants((prev) => prev.map((app) => (selectedIds.includes(app.id) ? { ...app, admissionRemarks: newStatus, admissionStatus: newStatus, status: newStatus } : app)));

    try {
      const targets = applicants.filter(a => selectedIds.includes(a.id)).map(a => a.rawId);
      await api.put(`/admin/applicants/bulk-status`, { ids: targets, status: dbStatus })
        .catch(() => api.patch(`/admin/applicants/bulk-status`, { ids: targets, status: dbStatus }));

      if (newStatus === "Confirmed" || newStatus === "Forfeit") {
        await fetchApplicants();
      }
    } catch (e) { console.error(e); }

    setSelectedIds([]);
  };

  const openInterviewModal = (applicant) => {
    setSelectedApplicant(getSafeApplicant(applicant));
    setIsInterviewModalOpen(true);
  };

  const getEmailRequirements = (appType) => {
    const type = (appType || "").toUpperCase();
    if (type === 'TRANSFEREE') {
      return `1. Original Honorable Dismissal\n2. Certificate of Copy of Grades\n3. Original Transcript of Records\n4. Photocopy of PSA Birth Certificate\n5. 2 pcs. 2x2 Picture`;
    } else if (type === 'ALS' || type === 'ALS GRADUATE') {
      return `1. Original Certificate of Rating\n2. Original ALS Certification\n3. Photocopy of PSA Birth Certificate\n4. 2 pcs. 2x2 Picture`;
    }
    return `1. Original Grade 12 Report Card\n2. Original Certificate of Good Moral Character\n3. Photocopy of SHS Diploma\n4. Photocopy of PSA Birth Certificate\n5. 2 pcs. 2x2 Picture`;
  };


  const openEmailModal = () => {
    const targets = getTargetApplicants();
    if (targets.length === 0) {
      toast.warning("Please select at least one applicant using the checkboxes before sending emails.");
      return;
    }

    let toText = "";
    let defaultMsg = "";
    const currentAY = activeYear || "2024-2025";

    if (targets.length === 1) {
      const app = targets[0];
      const appType = app.profile?.appDetails?.applicantType || app.type || "";
      const requirements = getEmailRequirements(appType);

      const upperName = (app.name || "").toUpperCase();
      const applicantNo = app.id || "N/A";
      const course = app.profile?.appDetails?.firstChoice || "N/A";

      toText = app.profile?.personal?.email || "No email available";

      defaultMsg = `Dear ${upperName},\n\nCongratulations! We are pleased to inform you that you have successfully passed the admission process and officially accepted to Baliwag Polytechnic College for the Academic Year ${currentAY}.\n\nApplicant No.: ${applicantNo}\nName: ${upperName}\nCourse: ${course}\n\nTo officially accept your offer of admission, please visit the Admission Office to reserve your slot.\n\nThe enrollment schedule will be posted on our FB Page BTECH Admission Office.\n\nPlease prepare the following documents before your Enrollment Schedule:\n${requirements}\n\nNote:\nPlease be sure to enroll on your scheduled date. If you do not show up on time, you may lose your slot to another student. Please also bring a long brown envelope for your documents.\n\nBest regards,\n\nOffice of Admissions\nBaliwag Polytechnic College`;
    } else {
      toText = `${targets.length} Applicants selected`;

      defaultMsg = `Dear [APPLICANT NAME],\n\nCongratulations! We are pleased to inform you that you have successfully passed the admission process and officially accepted to Baliwag Polytechnic College for the Academic Year ${currentAY}.\n\nApplicant No.: [APPLICANT NO]\nName: [APPLICANT NAME]\nCourse: [COURSE]\n\nTo officially accept your offer of admission, please visit the Admission Office to reserve your slot.\n\nThe enrollment schedule will be posted on our FB Page BTECH Admission Office.\n\nPlease prepare the following documents before your Enrollment Schedule:\n[REQUIREMENTS]\n\nNote:\nPlease be sure to enroll on your scheduled date. If you do not show up on time, you may lose your slot to another student. Please also bring a long brown envelope for your documents.\n\nBest regards,\n\nOffice of Admissions\nBaliwag Polytechnic College`;
    }

    setEmailSubject("Congratulations: Admission Qualification Notice");
    setEmailTarget(toText);
    setEmailMessage(defaultMsg);
    setIsEmailModalOpen(true);
  };

  const handleSendEmails = async () => {
    const targets = getTargetApplicants();
    if (targets.length === 0) return;

    const alreadySentCount = targets.filter(app => app.isEmailSent).length;
    if (alreadySentCount > 0) {
      const proceed = window.confirm(`${alreadySentCount} of the selected applicant(s) have ALREADY been sent an email. Do you want to send it again?`);
      if (!proceed) return;
    }

    const emailPayloads = targets.map(app => {
      const appType = app.profile?.appDetails?.applicantType || app.type || "";
      const reqs = getEmailRequirements(appType);
      const toEmail = app.profile?.personal?.email || "";

      const upperName = (app.name || "").toUpperCase();
      const applicantNo = app.id || "N/A";
      const course = app.profile?.appDetails?.firstChoice || "N/A";

      let finalMessage = emailMessage;

      if (targets.length > 1) {
        finalMessage = finalMessage.replace(/\[APPLICANT NAME\]/gi, upperName);
        finalMessage = finalMessage.replace(/\[APPLICANT NO\]/gi, applicantNo);
        finalMessage = finalMessage.replace(/\[COURSE\]/gi, course);
        finalMessage = finalMessage.replace(/\[REQUIREMENTS\]/gi, reqs);
      }

      return {
        email: toEmail,
        subject: emailSubject,
        message: finalMessage,
        applicantId: app.rawId
      };
    });

    console.log("Preparing to send the following personalized emails:", emailPayloads);

    try {
      await api.post('/admin/emails/send-bulk', { emails: emailPayloads });

      setApplicants(prev => prev.map(app =>
        targets.some(t => t.id === app.id) ? { ...app, isEmailSent: true } : app
      ));

      toast.success(`Successfully generated and sent ${targets.length} individually personalized email(s)!`);
      setIsEmailModalOpen(false);
      setSelectedIds([]);
    } catch (err) {
      console.error("Failed to send emails:", err);
      toast.error("An error occurred while sending emails. Please check the console.");
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
        const scoreIdx = headers.findIndex(h => h.includes('score') || h.includes('bcet') || h.includes('grade') || h.includes('remark'));

        if (nameIdx === -1 || scoreIdx === -1) {
          toast.warning("Could not find a 'Name' and 'BCET/Score/Remarks' column. Please check your Excel file headers.");
          setLoading(false); return;
        }

        let matchCount = 0;
        const updatesToPush = [];
        const emailsToSend = [];
        const updatedApplicants = [...applicants];

        for (let i = 1; i < validRows.length; i++) {
          const row = validRows[i];
          const rawName = row[nameIdx];
          const rawValue = row[scoreIdx];

          if (!rawName || rawValue === undefined || rawValue === null || rawValue === "") continue;

          let newBcetStatus = "Pending";
          let numericScore = 0;
          const stringValue = String(rawValue).trim().toLowerCase();

          if (stringValue === "passed" || stringValue === "pass") {
            newBcetStatus = "Passed"; numericScore = 75;
          } else if (stringValue === "failed" || stringValue === "fail") {
            newBcetStatus = "Failed"; numericScore = 74;
          } else {
            const score = parseFloat(rawValue);
            if (!isNaN(score)) {
              numericScore = score;
              newBcetStatus = score >= 75 ? "Passed" : "Failed";
            } else { continue; }
          }

          const appIndex = updatedApplicants.findIndex(a => a.name.trim().toLowerCase() === String(rawName).trim().toLowerCase());

          if (appIndex !== -1) {
            const currentApplicant = updatedApplicants[appIndex];
            const storedScore = parseFloat(currentApplicant.examScore) || 0;

            // --- DUPLICATE / CHANGE DETECTION ---
            // Case 1: Applicant already exists AND their BCET score is unchanged → skip entirely (no remark regeneration)
            if (storedScore > 0 && storedScore === numericScore) {
              continue;
            }

            // Case 2: Brand-new import (applicant has no prior BCET score)
            // Case 3: Score changed (applicant existed but incoming BCET score differs from stored score)
            // Both cases proceed to generate new remarks and push a DB update.

            const interviewStatus = currentApplicant.interviewRemarks;

            const tempAppForTotal = { ...currentApplicant, examScore: numericScore };
            const totalPerc = parseFloat(calculateTotal(tempAppForTotal));

            let newAdmissionStatus = "Pending";
            if (interviewStatus === "Pending" || newBcetStatus === "Pending") {
              newAdmissionStatus = "Pending";
            } else if (totalPerc >= 75) {
              newAdmissionStatus = "Passed";
            } else {
              newAdmissionStatus = "Failed";
            }

            updatedApplicants[appIndex] = {
              ...currentApplicant,
              examScore: numericScore,
              bcetRemarks: newBcetStatus,
              admissionRemarks: newAdmissionStatus,
              admissionStatus: newAdmissionStatus,
              status: newAdmissionStatus
            };

            updatesToPush.push({
              rawId: currentApplicant.rawId,
              examScore: numericScore,
              status: newAdmissionStatus === "Passed" ? "Admitted" : (newAdmissionStatus === "Failed" ? "Failed" : "Pending")
            });

            if (newAdmissionStatus === "Passed" && !currentApplicant.isEmailSent) {
              const appType = currentApplicant.profile?.appDetails?.applicantType || currentApplicant.type || "";
              const reqs = getEmailRequirements(appType);
              const toEmail = currentApplicant.profile?.personal?.email || "";
              const upperName = (currentApplicant.name || "").toUpperCase();
              const applicantNo = currentApplicant.id || "N/A";
              const course = currentApplicant.profile?.appDetails?.firstChoice || "N/A";
              const currentAY = activeYear || "2026-2027";

              const defaultMsg = `Dear ${upperName},\n\nCongratulations! We are pleased to inform you that you have successfully passed the admission process and officially accepted to Baliwag Polytechnic College for the Academic Year ${currentAY}.\n\nApplicant No.: ${applicantNo}\nName: ${upperName}\nCourse: ${course}\n\nTo officially accept your offer of admission, please visit our Institute Office to reserve your slot or visit the portal.\n\nThe enrollment schedule will be posted on our FB Page BTECH Admission Office.\n\nPlease prepare the following documents before your Enrollment Schedule:\n${reqs}\n\nNote:\nPlease be sure to enroll on your scheduled date. If you do not show up on time, you may lose your slot to another student. Please also bring a long brown envelope for your documents.\n\nBest regards,\n\nOffice of Admissions\nBaliwag Polytechnic College`;

              emailsToSend.push({
                email: toEmail,
                subject: "Congratulations: Admission Qualification Notice",
                message: defaultMsg,
                applicantId: currentApplicant.rawId
              });

              updatedApplicants[appIndex].isEmailSent = true;
            }

            matchCount++;
          }
        }

        if (updatesToPush.length > 0) {
          for (const update of updatesToPush) {
            try {
              await api.put(`/admin/applicant/${update.rawId}/status`, { status: update.status, examScore: update.examScore })
                .catch(() => api.patch(`/admin/applicant/${update.rawId}/status`, { status: update.status, examScore: update.examScore }));
            } catch (dbErr) {
              console.error(`Failed to update DB for applicant ${update.rawId}:`, dbErr);
            }
          }
        }

        if (emailsToSend.length > 0) {
          try {
            await api.post('/admin/emails/send-bulk', { emails: emailsToSend });
            console.log(`Automatically sent ${emailsToSend.length} admission qualification emails.`);
          } catch (emailErr) {
            console.error("Failed to auto-send emails:", emailErr);
          }
        }

        setApplicants(updatedApplicants);
        toast.success(`Import successful! Evaluated and fully saved ${matchCount} applicants to the database.${emailsToSend.length > 0 ? `\n\nAutomatically sent emails to ${emailsToSend.length} newly passed applicant(s).` : ''}`);

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

  // --- VIEW ONLY MODAL HELPERS ---
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
  const getTargetApplicants = () => selectedIds.length > 0 ? filteredApplicants.filter(a => selectedIds.includes(a.id)) : filteredApplicants;

  const handleExportPDF = () => {
    const targetApps = getTargetApplicants();
    const printWindow = window.open('', '_blank');
    const tableHtml = `
      <html>
        <head>
          <title>Admission List</title> 
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
          <h1 class="main-title">Admission Lists (For Enrollment)</h1>
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Applicant Name</th><th>1st Choice</th><th>BCET Score</th><th>Interview Score</th><th>GWA</th><th>Total (%)</th><th>Admission</th>
              </tr>
            </thead>
            <tbody>
              ${targetApps.map(a => `
                <tr>
                  <td>${a.admissionStatus === 'Forfeit' ? 'FORFEIT' : a.id}</td>
                  <td>${a.name}</td>
                  <td>${getCourseAbbreviation(a.profile?.appDetails?.firstChoice, coursesList)}</td>
                  <td>${a.examScore || 0}/100</td>
                  <td>${a.interviewScore || 0}/100</td>
                  <td>${getGWA(a).toFixed(2)}/100</td>
                  <td>${calculateTotal(a)}%</td>
                </tr>
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

  const handleExportExcel = () => {
    const targetApps = getTargetApplicants();

    const headers = [
      "APPLICANT TYPE", "1ST CHOICE COURSE", "2ND CHOICE COURSE", "APPLICANT FULL NAME",
      "FULL PERMANENT ADDRESS", "FULL PRESENT ADDRESS", "GENDER", "DATE OF BIRTH", "PLACE OF BIRTH",
      "CIVIL STATUS", "NAME OF SPOUSE IF MARRIED", "EMAIL ADDRESS", "CONTACT NUMBER",
      "ELEMENTARY SCHOOL", "ELEMENTARY ADDRESS", "ELEM YEAR",
      "JHS SCHOOL", "JHS ADDRESS", "JHS YEAR",
      "SHS SCHOOL", "SHS ADDRESS", "GRADE 11 GWA", "SHS YEAR",
      "TERTIARY SCHOOL", "TERTIARY ADDRESS", "TERTIARY YEAR",
      "FATHER'S NAME", "CONTACT NUMBER", "MOTHER'S MAIDEN NAME", "CONTACT NUMBER",
      "INDIGENOUS", "SOLO PARENT/ CHILD OF SOLO PARENT", "PWD", "4PS",
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

      const rawRow = [
        a.applicantType || app.type || "N/A",
        getCourseAbbreviation(a.firstChoice, coursesList),
        getCourseAbbreviation(a.secondChoice, coursesList),
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
        o.is4Ps ? "YES" : "NO",
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
                        <span>${chk(appType === 'FRESHMEN' || appType === 'SENIOR HIGH SCHOOL GRADUATE')} Freshmen</span>
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
                            <div>☐ 2pcs. 2x2 Picture</div>
                        </div>
                        <div style="width: 32%;">
                            <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">Transferees</div>
                            <div>☐ Original Honorable Dismissal</div>
                            <div>☐ Certificate of Copy of Grades</div>
                            <div>☐ Original Transcript of Records</div>
                            <div>☐ Photocopy of PSA Birth Certificate</div>
                            <div>☐ 2pcs. 2x2 Picture</div>
                        </div>
                        <div style="width: 32%;">
                            <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">ALS</div>
                            <div>☐ Original Certificate of Rating</div>
                            <div>☐ Original ALS Certification</div>
                            <div>☐ Photocopy of PSA Birth Certificate</div>
                            <div>☐ 2pcs. 2x2 Picture</div>
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

  const getColSpan = () => {
    let cols = 8;
    if ((userRole === "Admin" || userRole === "SuperAdmin") && !isArchiveMode) cols += 1;
    return cols;
  };

  if (loading && applicants.length === 0) {
    return <PageLoader message="Loading admission data..." />;
  }

  return (
    <div className="h-[calc(100vh-90px)] w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ml-2">

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
                placeholder="Search applicant..."
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
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full mb-4 p-2 border rounded text-xs outline-none">
                      <option value="All">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Passed">Passed</option>
                      <option value="Failed">Failed</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Forfeit">Forfeit</option>
                    </select>

                    <div className="flex justify-between gap-2">
                      <button onClick={() => setShowFilter(false)} className="flex-1 py-1 bg-[#376e35] text-white rounded text-xs font-bold">Apply</button>
                      <button onClick={() => { setStatusFilter("All"); setCourseFilter("All"); setTypeFilter(""); setSearchQuery(""); setInstituteFilter("All"); }} className="flex-1 py-1 bg-gray-100 rounded text-xs font-bold hover:bg-gray-200">Clear</button>
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
                    <button onClick={handleExportExcel} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                      Export to Excel (.xlsx)
                    </button>
                    <button onClick={handleExportPDF} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                      Export PDF (Table)
                    </button>
                    <button onClick={() => exportFormsToPDF()} className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-[#fafdfa]">
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
                const isAllEmailed = targets.length > 0 && targets.every(a => a.isEmailSent === true);

                return (
                  <>
                    {/* SEND EMAILS: Only visible if nothing is selected OR only Passed applicants are selected */}
                    {(selectedIds.length === 0 || isAllPassed) && (
                      <button
                        onClick={openEmailModal}
                        className="bg-blue-600 text-white px-[14px] py-1.5 rounded-lg shadow-sm flex items-center gap-2 font-black hover:bg-blue-700 transition"
                      >
                        <FaEnvelope size={14} /> Send Emails
                      </button>
                    )}

                    {/* BULK CONFIRM: Only visible if ALL selected are Passed AND have already been emailed */}
                    {isAllPassed && isAllEmailed && (
                      <button
                        onClick={() => triggerConfirmModal('bulk', 'Confirmed')}
                        className="bg-green-600 text-white px-[14px] py-[6px] rounded-lg shadow-sm flex items-center gap-2 font-black hover:bg-green-700 transition"
                      >
                        <FaCheck size={14} /> Bulk Confirm
                      </button>
                    )}

                    {/* BULK FORFEIT: Only visible if ALL selected are Passed AND have already been emailed */}
                    {isAllPassed && isAllEmailed && (
                      <button
                        onClick={() => triggerConfirmModal('bulk', 'Forfeit')}
                        className="bg-gray-800 text-white px-[14px] py-[6px] rounded-lg shadow-sm flex items-center gap-2 font-black hover:bg-black transition"
                      >
                        <FaTimes size={14} /> Bulk Forfeit Slots
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
                );
              })()}

              {/* IMPORT BCET  */}
              {userRole === "SuperAdmin" && (
                <>
                  <button
                    onClick={() => { if (!isArchiveMode) fileInputRef.current?.click(); }}
                    disabled={isArchiveMode}
                    className={`px-3 py-2 rounded-lg shadow-sm flex items-center gap-2 font-black transition ${isArchiveMode
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

                  <th className="px-[14px] py-[6px] text-[11px] text-left font-bold whitespace-nowrap">
                    <div className="relative inline-block pr-1">
                      Applicant Name
                      <span className="ml-1.5 bg-white text-[#2e522a] rounded-full h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center text-[10px] font-bold leading-none border border-gray-200" title="Total Applicants">
                        {filteredApplicants.length}
                      </span>
                    </div>
                  </th>
                  <th className="px-[14px] py-[6px] text-[11px] text-center font-bold">Interview Score</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">BCET Score</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">GWA</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">Total (%)</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">Remarks</th>
                  <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">Action</th>

                  {/* HEADER CHECKBOX  */}
                  {!isArchiveMode && (userRole === "Admin" || userRole === "SuperAdmin") && (
                    <th className="px-[14px] py-[6px] pr-12 text-center w-16 relative overflow-visible">
                      <CustomCheckbox checked={isAllSelected} onChange={handleSelectAll} disabled={eligibleApplicants.length === 0} />
                    </th>
                  )}
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
                    <tr key={a.rawId || a.id} className={`h-[44px] hover:bg-gray-50 transition-colors ${isChecked ? "bg-green-50/30" : ""}`}>

                      {/* If they forfeit, show FORFEIT instead of their blank/missing ID */}
                      <td className="px-4 py-1 text-xs text-gray-600 font-mono">
                        {a.admissionStatus === 'Forfeit' ? <span className="text-gray-400 font-bold tracking-widest text-xs">FORFEIT</span> : a.id}
                      </td>

                      <td className="px-4 py-1 text-xs text-gray-800">{a.name}</td>

                      <td className="px-4 py-1 text-center text-xs  text-gray-600">
                        {a.interviewScore > 0 ? `${a.interviewScore}/100` : <span className="font-black text-xs text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center text-xs text-gray-600">
                        {a.examScore > 0 ? `${a.examScore}/100` : <span className="font-black text-xs text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center text-xs text-gray-600">
                        {getGWA(a) > 0 ? `${getGWA(a).toFixed(2)}/100` : <span className="font-black text-xs text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center text-xs text-gray-600">
                        {parseFloat(calculateTotal(a)) > 0 ? `${calculateTotal(a)}%` : <span className="font-black text-xs text-gray-500">—</span>}
                      </td>

                      <td className="px-4 py-1 text-center"><StatusTag status={a.admissionRemarks || a.status} /></td>

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
                          {(a.admissionRemarks === 'Passed' || a.admissionStatus === 'Passed' || a.admissionStatus === 'Admitted' || a.admissionStatus === 'Confirmed') && !['Confirmed', 'Forfeit'].includes(normalizeAdmissionRemark(a.admissionRemarks)) && (
                            <>
                              <button
                                onClick={() => triggerConfirmModal(a.id, "Confirmed")}
                                className="group relative flex items-center justify-center w-6 h-6 bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 rounded-md transition-all shadow-sm"
                                title="Confirm Student's Enrollment"
                              >
                                <CheckCircle size={14} />
                              </button>
                              <button
                                onClick={() => triggerConfirmModal(a.id, "Forfeit")}
                                className="group relative flex items-center justify-center w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-md transition-all shadow-sm"
                                title="Forfeit Student's Enrollment"
                              >
                                <FaTimes size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* ROW CHECKBOX  */}
                      {!isArchiveMode && (userRole === "Admin" || userRole === "SuperAdmin") && (
                        <td className="px-4 py-1 pr-12 text-center relative overflow-visible">
                          <div className="flex items-center justify-center">
                            <CustomCheckbox
                              checked={isChecked}
                              onChange={() => handleSelectRow(a.id)}
                              disabled={a.admissionRemarks === 'Pending' || a.admissionStatus === 'Forfeit'}
                            />

                            {a.isEmailSent && (
                              <div className="absolute right-0 top-1/2 mr-4 -translate-y-1/2" title="Email Sent">
                                <MailCheck size={18} className="text-green-600" />
                              </div>
                            )}
                          </div>
                        </td>
                      )}
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
                Are you sure you want to mark the selected <strong>{confirmTargetId === 'bulk' ? selectedIds.length : 1}</strong> applicant(s) as <span className="font-black uppercase tracking-wider text-green-600">{confirmActionStatus}</span>?
              </p>
              <p className="text-[12px] text-gray-500 mt-3">This action will immediately update their admission status in the system.</p>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button onClick={() => setIsConfirmModalOpen(false)} className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition">Cancel</button>
              <button onClick={executeConfirmedAction} className="px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow bg-green-600 hover:bg-green-700">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* --- EMAIL MODAL --- */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsEmailModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl z-10 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">Send Emails</h3>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsEmailModalOpen(false)}>&times;</button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Subject</label>
                <input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-xs outline-none focus:border-blue-500" />
              </div>
              <div className="flex flex-col">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Sent to</label>
                <input type="text" value={emailTarget} disabled className="w-full border border-gray-300 rounded px-3 py-2 text-xs bg-gray-100 text-gray-600 cursor-not-allowed" />
              </div>
              <div className="flex flex-col relative">
                <label className="text-xs font-bold text-gray-700 uppercase mb-1">Message</label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={16} className="w-full border border-gray-300 rounded px-3 py-2 text-xs outline-none focus:border-blue-500 resize-none"></textarea>
                {selectedIds.length > 1 && (
                  <span className="text-[10px] text-gray-500 italic mt-1">
                    Note: Placeholders [Applicant Name] and [Requirements based on your applicant type] will be dynamically replaced for each recipient before sending.
                  </span>
                )}
              </div>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button onClick={() => setIsEmailModalOpen(false)} className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition">Cancel</button>
              <button onClick={handleSendEmails} className="px-8 py-2 rounded font-bold uppercase text-[12px] text-white transition shadow bg-green-600 hover:bg-green-700">Send</button>
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW APPLICANT MODAL --- */}
      {isModalOpen && selectedApplicant && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden">

            <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[16px]">Applicant Details</h3>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded text-xs font-mono">{selectedApplicant.id}</span>
              </div>
              <button className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>

            <div className="p-8 overflow-y-auto bg-gray-50 space-y-8 flex-1">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <SectionHeader title="Application Details" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                  <FormField label="Applicant Type" value={selectedApplicant.profile.appDetails.applicantType} />
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
                className="px-6 py-2 rounded bg-blue-700 hover:bg-blue-600 font-bold uppercase text-[12px] text-white transition flex items-center gap-2 shadow"
              >
                <FaPrint /> Print Form
              </button>
              <div className="flex-1"></div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 rounded bg-gray-400 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
              >
                Close
              </button>
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

      {/* --- INTERVIEW SCORING MODAL --- */}
      {isInterviewModalOpen && selectedApplicant && (() => {
        const ratings = selectedApplicant.interviewRatings || {};
        let interviewTotal = 0;
        rubricData.forEach(section => {
          section.criteria.forEach(crit => { interviewTotal += getWeightedScore(ratings[crit.id], crit.weight); });
        });
        const currentRemarks = getRemarks(interviewTotal.toFixed(2));

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center pt-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInterviewModalOpen(false)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

              <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">Final Admission Interview Rubric</h3>
                <button onClick={() => setIsInterviewModalOpen(false)} className="text-gray-400 hover:text-gray-700 transition text-2xl font-bold leading-none">&times;</button>
              </div>

              <div className="bg-white border-b border-gray-300 px-6 py-2 shrink-0">
                <div className="grid grid-cols-12 gap-4 mt-4 text-xs">
                  <div className="col-span-8 flex flex-col">
                    <label className="font-bold text-gray-700 uppercase text-xs">Program</label>
                    <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">{selectedApplicant.profile.appDetails.firstChoice}</div>
                  </div>

                  <div className="col-span-4 flex flex-col">
                    <label className="font-bold text-gray-700 uppercase text-xs">Interview Date</label>
                    <div className="border-b border-gray-400 py-1 font-semibold text-gray-900">{selectedApplicant.interviewSchedule || "N/A"}</div>
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

                              <td className="border-r border-black py-2 text-center align-middle bg-gray-100 font-bold text-base text-gray-700">
                                {ratings[crit.id] !== undefined && ratings[crit.id] !== "" ? ratings[crit.id] : "-"}
                              </td>

                              <td className="p-2 text-center align-middle font-black text-base bg-gray-50">
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
                        <span className="font-bold text-base uppercase text-gray-800">Total:</span>
                        <span className="font-black text-base text-[#376e35]">{getSectionTotal(section, ratings)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 border-t border-gray-400 text-white p-4 shrink-0 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <span className="uppercase text-gray-800 font-bold text-xs">General Weighted Average :</span>
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

    </div>
  );
}