import { useState, useRef, useMemo, useEffect } from "react";
import api, { BASE_URL } from "../../../services/api.js";
import {
    FaSearch, FaFilter, FaFileExport, FaFileImport, FaCheck, FaChevronDown,
    FaEye, FaTimes, FaSearchPlus, FaSearchMinus, FaRedo, FaFileDownload, FaPrint, FaPlus, FaEnvelope, FaEdit, FaTrash, FaExclamationTriangle
} from "react-icons/fa";
import { FileText, CheckCircle, MessageSquare, Eye, Edit, MailCheck, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, BorderStyle } from "docx";
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
    const appType = String(app.profile?.appDetails?.applicantType || app.applicantType || app.type || '').toUpperCase();
    const isTransfereeOrAls = appType.includes("TRANS") || appType.includes("ALS") || appType.includes("RETURN");

    let rawGwa = "0";
    if (isTransfereeOrAls) {
        rawGwa = app.profile?.education?.tertiary?.latestGwa || app.profile?.education?.tertiary?.gwa || app.latestGwa || app.gwa || "0";
    } else {
        rawGwa = app.profile?.education?.shs?.seniorHighGwa || app.profile?.education?.shs?.gwa || app.seniorHighGwa || app.gwa || "0";
    }

    const numGwa = parseFloat(rawGwa);
    return isNaN(numGwa) ? 0 : numGwa;
};

const getBonus = (app) => {
    const info = app.profile?.otherInfo || {};

    const isTrue = (val) => {
        if (val === true) return true;
        if (typeof val === 'string' && val.toLowerCase() === 'true') return true;
        return false;
    };

    const isALS = (app.applicantType || app.type || app.profile?.appDetails?.applicantType || "").toUpperCase() === "ALS";
    return (isTrue(info.isPwd) || isTrue(info.isIndigenous) || isTrue(info.isSoloParent) || isTrue(info.is4Ps) || isTrue(info.isOfw) || isALS) ? 5 : 0;
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
    if (normalized === "CONFIRMED" || normalized === "ACCEPTED" || normalized === "ADMITTED") return "Admitted";
    if (normalized === "PASSED") return "Passed";
    if (normalized === "FAILED" || normalized === "REJECTED") return "Failed";
    if (normalized === "FORFEIT" || normalized === "NO-SHOW" || normalized === "DECLINED") return "Forfeit";
    return "Pending";
};

const StatusTag = ({ status }) => {
    const displayStatus = normalizeAdmissionRemark(status);
    let colors = "bg-yellow-100 text-yellow-700 border-yellow-200";
    if (displayStatus === "Admitted") colors = "bg-[#3a7538] text-white border-[#3a7538]";
    if (displayStatus === "Passed") colors = "bg-green-100 text-green-800 border-green-200";
    if (displayStatus === "Failed") colors = "bg-red-100 text-red-700 border-red-200";
    if (displayStatus === "Forfeit") colors = "bg-gray-200 text-gray-600 border-gray-300";
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

export default function PostAdmission({ navigateToTab, navigationState }) {
    const { toast } = useToast();
    
    

    // --- STATES ---
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [applicants, setApplicants] = useState([]);
    const [activeYear, setActiveYear] = useState("");
    const [isArchiveMode, setIsArchiveMode] = useState(false);
    const [rubricData, setRubricData] = useState(INITIAL_RUBRIC_SECTIONS);

    // --- PRINT STATE ---
    const [isConfirmSlotModalOpen, setIsConfirmSlotModalOpen] = useState(false);
    const [confirmSlotApplicant, setConfirmSlotApplicant] = useState(null);
    const [isForfeitModalOpen, setIsForfeitModalOpen] = useState(false);
    const [forfeitApplicant, setForfeitApplicant] = useState(null);
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

    // --- DYNAMIC DATA STATES ---
    const [coursesList, setCoursesList] = useState([]);
    const [institutesList, setInstitutesList] = useState([]);

    // Role and Institute State
    const [userRole, setUserRole] = useState("Admin");
    const [userInstitute, setUserInstitute] = useState("IITI");

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


    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isInlineEditMode, setIsInlineEditMode] = useState(false);
    const [newApplicant, setNewApplicant] = useState(null);

    const [selectedApplicant, setSelectedApplicant] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(0.8);
    const [capacityWarningModal, setCapacityWarningModal] = useState(null);
    const [portalSettings, setPortalSettings] = useState(null);



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
                    shs: app.profile?.education?.shs || { name: app.seniorHighSchool || app.education?.seniorHighSchool || "N/A", address: app.seniorHighAddress || app.education?.seniorHighAddress || "N/A", year: app.seniorHighYear || app.education?.seniorHighYear || "N/A", gwa: app.seniorHighGwa || app.education?.seniorHighGwa || app.gwa || "N/A", grade11Gwa: app.grade11Gwa || "", grade12Gwa: app.grade12Gwa || "", track: app.track || "", strand: app.strand || "" },
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

            const currentViewYear = archiveYear || settingsRes.data.schoolYear;
            setActiveYear(currentViewYear);
            if (archiveYear) setIsArchiveMode(true);
            if (settingsRes.data.portalSettings) {
                setPortalSettings(settingsRes.data.portalSettings);
            }

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

                    const tempApp = { ...safe, examScore: app.examScore || 0, interviewScore: app.interviewScore || 0 };
                    const totalPerc = parseFloat(calculateTotal(tempApp));

                    let admStatus = app.admissionStatus || app.status || "Pending";

                    // Slot Status: Admitted (accepted offer), Forfeit (declined offer), Pending (no decision)
                    let slotStatus = app.slotStatus || "Pending";
                    if (!["Admitted", "Accepted", "Forfeit", "Forfeited"].includes(slotStatus)) {
                        if (admStatus === "Admitted" || admStatus === "Confirmed") {
                            slotStatus = "Admitted";
                        } else if (admStatus === "Forfeit" || admStatus === "Forfeited") {
                            slotStatus = "Forfeit";
                        } else {
                            slotStatus = "Pending";
                        }
                    }

                    return {
                        ...safe,
                        rawId: app._id || app.id,
                        id: (app.applicantId || app.applicationId || safe.id)?.toString().startsWith('A-') ? (app.applicantId || app.applicationId || safe.id) : `A-${app.applicantId || app.applicationId || safe.id}`,
                        name: (app.name || `${safe.profile.personal.surname}, ${safe.profile.personal.firstName}`).toUpperCase(),
                        type: app.type || app.applicantType || "N/A",
                        location: app.location || app.presentCity?.toUpperCase() || "N/A",
                        interviewRemarks: intStatus,
                        bcetRemarks: bcetStatus,
                        admissionRemarks: app.admissionRemarks || "Pending",
                        slotStatus: slotStatus,
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

    const checkIsCapacityFull = (applicant) => {
        if (!applicant) return false;

        const activeChoice = applicant.reconsiderationProgram || (applicant.isRejectedFirstChoice ? applicant.profile?.appDetails?.secondChoice : applicant.profile?.appDetails?.firstChoice);
        const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
        const course = coursesList.find(c => c.abbreviation === activeAbbr);
        if (!course) return false;

        const limit = parseInt(course.limit) || 0;
        if (limit <= 0) return false;

        const seated = applicants.filter(a => {
            const aAbbr = getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList);
            return aAbbr === activeAbbr && ['Passed', 'Admitted', 'Confirmed', 'Accepted'].includes(normalizeAdmissionRemark(a.slotStatus || a.admissionRemarks || a.status));
        }).length;

        return seated >= limit;
    };

    const handleConfirmSlot = (applicant) => {
        setConfirmSlotApplicant(applicant);
        setIsConfirmSlotModalOpen(true);
    };

    const executeConfirmSlot = async (applicant, skipCapacityCheck = false) => {
        if (!skipCapacityCheck && checkIsCapacityFull(applicant)) {
            setCapacityWarningModal({ applicant });
            return;
        }
        try {
            await api.put(`/admin/applicant/${applicant.rawId}/status`, { slotStatus: "Admitted", status: "Admitted" })
                .catch(() => api.patch(`/admin/applicant/${applicant.rawId}/status`, { slotStatus: "Admitted", status: "Admitted" }));
            setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, slotStatus: "Admitted", status: "Admitted", admissionStatus: "Admitted", admissionRemarks: "Passed" } : a));
            toast.success(`${applicant.name} has accepted the slot!`);
            // Silent re-fetch to sync with backend
            fetchApplicants(true);
        } catch (err) {
            console.error(err);
            toast.error("Failed to update slot status.");
        } finally {
            setIsConfirmSlotModalOpen(false);
            setConfirmSlotApplicant(null);
        }
    };

    const handleForfeitSlot = (applicant) => {
        setForfeitApplicant(applicant);
        setIsForfeitModalOpen(true);
    };

    const confirmForfeitSlot = async () => {
        if (!forfeitApplicant) return;
        const applicant = forfeitApplicant;
        try {
            await api.put(`/admin/applicant/${applicant.rawId}/status`, { slotStatus: "Forfeit", status: "Forfeit" })
                .catch(() => api.patch(`/admin/applicant/${applicant.rawId}/status`, { slotStatus: "Forfeit", status: "Forfeit" }));
            setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, slotStatus: "Forfeit", status: "Forfeit", admissionStatus: "Forfeit", admissionRemarks: "Forfeit" } : a));
            toast.success(`${applicant.name} has forfeited the slot!`);
            // Silent re-fetch to sync with backend
            fetchApplicants(true);
        } catch (err) {
            console.error(err);
            toast.error("Failed to update slot status.");
        } finally {
            setIsForfeitModalOpen(false);
            setForfeitApplicant(null);
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

        // 0. ONLY INCLUDE ACCEPTED, FORFEITED, OR PASSED
        result = result.filter(app => {
            const remark = normalizeAdmissionRemark(app.admissionRemarks);
            const status = (app.admissionStatus || app.status || "").toString().trim();
            const slotStat = (app.slotStatus || "").toString().trim();
            return ['Admitted', 'Passed'].includes(remark) ||
                ['Accepted', 'Admitted', 'Confirmed', 'Passed'].includes(status) ||
                ['Accepted', 'Forfeit', 'Forfeited'].includes(slotStat);
        });

        // 1. THE RBAC SECURITY FILTER 
        if (userRole === "SuperAdmin" && instituteFilter !== "All") {
            result = result.filter(a => {
                const activeChoice = a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice);
                const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
                const activeCourse = coursesList.find(c => c.abbreviation === activeAbbr);
                return activeCourse?.institute === instituteFilter;
            });
        } else if (userRole !== "SuperAdmin") {
            result = result.filter(a => {
                const activeChoice = a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice);
                const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
                const activeCourse = coursesList.find(c => c.abbreviation === activeAbbr);
                return activeCourse?.institute === userInstitute;
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
                const activeChoice = app.reconsiderationProgram || (app.isRejectedFirstChoice ? app.profile?.appDetails?.secondChoice : app.profile?.appDetails?.firstChoice);
                const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
                return activeAbbr === courseFilter;
            });
        }

        let finalResult = result.filter(app =>
            app.admissionRemarks === 'Passed' ||
            ['Confirmed', 'Accepted', 'Admitted'].includes(app.admissionStatus) ||
            ['Admitted', 'Forfeit'].includes(app.slotStatus)
        );

        if (activeSortType === "name") {
            if (nameSortOrder === "A-Z") {
                finalResult.sort((a, b) => {
                    if (a.slotStatus === 'Forfeit' && b.slotStatus !== 'Forfeit') return 1;
                    if (b.slotStatus === 'Forfeit' && a.slotStatus !== 'Forfeit') return -1;
                    return (a.name || "").localeCompare(b.name || "");
                });
            } else {
                finalResult.sort((a, b) => {
                    if (a.slotStatus === 'Forfeit' && b.slotStatus !== 'Forfeit') return 1;
                    if (b.slotStatus === 'Forfeit' && a.slotStatus !== 'Forfeit') return -1;
                    return (b.name || "").localeCompare(a.name || "");
                });
            }
        } else {
            if (sortOrder === "Total %: Lowest to Highest") {
                finalResult.sort((a, b) => {
                    if (a.slotStatus === 'Forfeit' && b.slotStatus !== 'Forfeit') return 1;
                    if (b.slotStatus === 'Forfeit' && a.slotStatus !== 'Forfeit') return -1;

                    const totalA = parseFloat(calculateTotal(a)) || 0;
                    const totalB = parseFloat(calculateTotal(b)) || 0;
                    if (totalA !== totalB) return totalA - totalB;
                    const statusA = normalizeAdmissionRemark(a.admissionRemarks || a.status || a.admissionStatus);
                    const statusB = normalizeAdmissionRemark(b.admissionRemarks || b.status || b.admissionStatus);
                    if (statusA === 'Admitted' && statusB !== 'Admitted') return -1;
                    if (statusB === 'Admitted' && statusA !== 'Admitted') return 1;
                    return (a.name || "").localeCompare(b.name || "");
                });
            } else {
                // Default: Total %: Highest to Lowest
                finalResult.sort((a, b) => {
                    if (a.slotStatus === 'Forfeit' && b.slotStatus !== 'Forfeit') return 1;
                    if (b.slotStatus === 'Forfeit' && a.slotStatus !== 'Forfeit') return -1;

                    const totalA = parseFloat(calculateTotal(a)) || 0;
                    const totalB = parseFloat(calculateTotal(b)) || 0;
                    if (totalB !== totalA) return totalB - totalA;
                    const statusA = normalizeAdmissionRemark(a.admissionRemarks || a.status || a.admissionStatus);
                    const statusB = normalizeAdmissionRemark(b.admissionRemarks || b.status || b.admissionStatus);
                    if (statusA === 'Admitted' && statusB !== 'Admitted') return -1;
                    if (statusB === 'Admitted' && statusA !== 'Admitted') return 1;
                    return (a.name || "").localeCompare(b.name || "");
                });
            }
        }

        return finalResult;
    }, [applicants, searchQuery, typeFilter, statusFilter, courseFilter, userRole, instituteFilter, coursesList, sortOrder, nameSortOrder, activeSortType]);

    // --- KPI DATA COMPUTATION ---
    const kpiData = useMemo(() => {
        let accepted = 0;
        const programSeated = {};

        let displayedCourses = coursesList;
        if (userRole !== "SuperAdmin") {
            displayedCourses = coursesList.filter(c => c.institute === userInstitute);
        }

        displayedCourses.forEach(c => {
            programSeated[c.abbreviation] = 0;
        });

        let totalForfeited = 0;

        applicants.forEach(app => {
            // THE RBAC KPI FILTER
            if (userRole !== "SuperAdmin") {
                const activeChoice = app.reconsiderationProgram || (app.isRejectedFirstChoice ? app.profile?.appDetails?.secondChoice : app.profile?.appDetails?.firstChoice);
                const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
                const activeCourse = coursesList.find(c => c.abbreviation === activeAbbr);
                if (activeCourse?.institute !== userInstitute) return;
            }
            if (userRole === "SuperAdmin" && instituteFilter !== "All") {
                const activeChoice = app.reconsiderationProgram || (app.isRejectedFirstChoice ? app.profile?.appDetails?.secondChoice : app.profile?.appDetails?.firstChoice);
                const activeAbbr = getCourseAbbreviation(activeChoice, coursesList);
                const activeCourse = coursesList.find(c => c.abbreviation === activeAbbr);
                if (activeCourse?.institute !== instituteFilter) return;
            }

            const slot = (app.slotStatus || "").toString().toLowerCase();
            if (slot === "admitted") {
                accepted++;

                const firstChoice = getCourseAbbreviation(app.reconsiderationProgram || (app.isRejectedFirstChoice ? app.profile?.appDetails?.secondChoice : app.profile?.appDetails?.firstChoice), coursesList);
                if (programSeated[firstChoice] !== undefined) {
                    programSeated[firstChoice]++;
                }
            } else if (slot === "forfeit" || slot === "forfeited" || app.admissionRemarks === "Forfeit" || app.status === "Forfeit") {
                totalForfeited++;
            }
        });

        return {
            totalAdmitted: accepted,
            totalForfeited,
            programSeated,
            displayedCourses
        };
    }, [applicants, coursesList, userRole, userInstitute, instituteFilter]);

    const eligibleApplicants = filteredApplicants.filter((a) => a.admissionRemarks !== "Pending");
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




    const handleEditApplicant = () => {
        setIsInlineEditMode(true);
        setNewApplicant(JSON.parse(JSON.stringify(selectedApplicant)));
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
            toast.error(err.response?.data?.detail || "An error occurred while saving the applicant.");
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
            toast.error(err.response?.data?.detail || "Failed to send message.");
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handleSaveEmailTemplate = async () => {
        try {
            await api.put('/admin/settings/email-template', {
                subject: emailSubject,
                message: emailMessage
            });

            toast.success(`Email template saved successfully! Emails will be sent automatically when applicants pass.`);
            setIsEmailModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Failed to save template:", err);
            toast.error("An error occurred while saving the email template.");
        }
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



    // --- EXPORT LOGIC ---
    const fetchExportPassedApplicants = async () => {
        try {
            const currentViewYear = activeYear || sessionStorage.getItem("archiveViewYear");
            const res = await api.get('/admin/applicants', { params: { schoolYear: currentViewYear } });
            if (!res.data) return [];

            // Format applicants and calculate admission remarks
            const formatted = res.data.map(app => {
                const safe = getSafeApplicant(app);
                let admStatus = app.admissionStatus || app.status || "Pending";
                let slotStatus = app.slotStatus || "Pending";
                if (!["Admitted", "Accepted", "Forfeit", "Forfeited"].includes(slotStatus)) {
                    if (admStatus === "Admitted" || admStatus === "Confirmed") {
                        slotStatus = "Admitted";
                    } else if (admStatus === "Forfeit" || admStatus === "Forfeited") {
                        slotStatus = "Forfeit";
                    } else {
                        slotStatus = "Pending";
                    }
                }
                const finalRemarks = app.admissionRemarks || admStatus;
                return {
                    ...safe,
                    rawId: app._id || app.id,
                    id: (app.applicantId || app.applicationId || safe.id)?.toString().startsWith('A-') ? (app.applicantId || app.applicationId || safe.id) : `A-${app.applicantId || app.applicationId || safe.id}`,
                    name: (app.name || `${safe.profile.personal.surname}, ${safe.profile.personal.firstName}`).toUpperCase(),
                    type: app.type || app.applicantType || "N/A",
                    admissionRemarks: finalRemarks,
                    slotStatus: slotStatus,
                    status: admStatus
                };
            });

            // Filter for PASSED applicants ONLY (strictly exclude Admitted, Waitlisted, Failed, Forfeit, Pending)
            const passedOnly = formatted.filter(a => {
                const rem = (a.admissionRemarks || "").trim();
                const status = (a.status || "").trim();
                return rem === "Passed" || status === "Passed";
            });

            return passedOnly.sort((a, b) => {
                const getFullName = (app) => {
                    const p = app.profile?.personal || {};
                    return p.surname ? `${p.surname}, ${p.firstName}${p.middleName && p.middleName !== 'N/A' ? ' ' + p.middleName : ''}` : (app.name || "");
                };
                return getFullName(a).localeCompare(getFullName(b));
            });
        } catch (e) {
            console.error("Failed to fetch passed applicants for export:", e);
            toast.error("Failed to fetch applicants for export.");
            return [];
        }
    };

    const handleExportPDF = async () => {
        const targetApps = await fetchExportPassedApplicants();
        if (targetApps.length === 0) {
            toast.info("No passed applicants found to export.");
            setIsExportMenuOpen(false);
            return;
        }

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
        const targetApps = await fetchExportPassedApplicants();
        if (targetApps.length === 0) {
            toast.info("No passed applicants found to export.");
            setIsExportMenuOpen(false);
            return;
        }

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

            const activeChoice = app.isRejectedFirstChoice ? a.secondChoice : a.firstChoice;

            const rawRow = [
                app.id || "N/A",
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
                edShs.name || "N/A", edShs.address || "N/A", edShs.grade11Gwa || edShs.seniorHighGwa || edShs.gwa || "N/A", edShs.grade12Gwa || "N/A", edShs.year || "N/A", edShs.track || "N/A", edShs.strand || "N/A",
                edTert.name || "N/A", edTert.address || "N/A", edTert.year || "N/A", edTert.latestGwa || edTert.gwa || "N/A",
                formatFam(f.father), f.father?.contact || "N/A",
                formatFam(f.mother), f.mother?.contact || "N/A",
                o.isIndigenous ? (o.indigenousDetails || o.indigenousSpec || app.indigenousSpec || app.indigenousDetails || "YES") : "NO",
                o.isSoloParent ? (o.soloParentDetails || o.soloParentSpec || app.soloParentSpec || app.soloParentDetails || "YES") : "NO",
                o.isPwd ? (o.pwdDetails || o.pwdSpec || app.disabilitySpec || app.disabilityDetails || "YES") : "NO",
                o.is4Ps ? (o.fourPsDetails || o.fourPsSpec || app.fourPsSpec || app.fourPsDetails || "YES") : "NO",
                o.isOfw ? "YES" : "NO",
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
            const isTransferee = appType.includes('TRANS');
            const isAls = appType.includes('ALS');

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
                    <div class="flex-1 field-underline"><div${a.isRejectedFirstChoice ? ' style="text-decoration: line-through; color: #999;"' : ''}>${a.isReassigned ? a.firstChoice || '' : a.firstChoice || ''}</div></div>
                    <span class="label" style="margin-left: 20px;">2<sup>nd</sup> Choice</span>
                    <div class="flex-1 field-underline"><div>${a.isReassigned ? '' : (a.secondChoice || '')}</div></div>
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

    const getColSpan = () => {
        return 6;
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div className="bg-white rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-gray-200 p-4 flex flex-col justify-center">
                            <p className="text-[12px] font-bold text-gray-600 uppercase ">Total Admitted</p>
                            <p className="text-[28px] leading-tight font-black text-[#1b4332] mt-2">{kpiData.totalAdmitted}</p>
                        </div>
                        <div className="bg-white rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-gray-200 p-4 flex flex-col justify-center">
                            <p className="text-[12px] font-bold text-gray-600 uppercase ">Total Forfeited</p>
                            <p className="text-[28px] leading-tight font-black text-gray-600 mt-2">{kpiData.totalForfeited}</p>
                        </div>
                        <div className="bg-white rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-gray-200 p-4 flex flex-col justify-start overflow-hidden">
                            <p className="text-[12px] font-bold text-gray-600 uppercase  mb-3 shrink-0">Seated / Capacity</p>
                            <div className="flex flex-col gap-2 overflow-y-auto max-h-[50px] pr-2 custom-scrollbar">
                                {kpiData.displayedCourses.map(c => {
                                    const seated = kpiData.programSeated[c.abbreviation] || 0;
                                    const limit = c.limit || 0;
                                    return (
                                        <div key={c._id} className="flex justify-between items-center w-full">
                                            <span className="text-[11px] font-bold text-gray-700">{c.abbreviation}</span>
                                            <span className="text-[11px] font-bold text-gray-800">{seated} / {limit > 0 ? limit : '∞'}</span>
                                        </div>
                                    );
                                })}
                            </div>
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
                                        <div className="mb-4">
                                            <label className="block text-xs font-semibold mb-1 uppercase tracking-tight text-gray-600">Program</label>
                                            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="w-full p-2 border border- rounded text-[12px] outline-none bg-gray-50">
                                                <option value="All">All Programs</option>
                                                {coursesList.map(c => (
                                                    <option key={c._id} value={c.abbreviation}>{c.abbreviation}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {userRole === "SuperAdmin" && (
                                            <div className="mb-4">
                                                <label className="block text-xs font-semibold mb-1 uppercase tracking-tight text-gray-600">Institute</label>
                                                <select value={instituteFilter} onChange={(e) => setInstituteFilter(e.target.value)} className="w-full p-2 border rounded text-[12px] outline-none bg-gray-50">
                                                    <option value="All">All Institutes</option>
                                                    {institutesList.map(inst => (
                                                        <option key={inst._id} value={inst.abbreviation}>{inst.abbreviation}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="mb-4">
                                            <label className="block text-xs font-semibold mb-1 uppercase tracking-tight text-gray-600">Sort By</label>
                                            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full p-2 border rounded text-[12px] outline-none bg-gray-50">
                                                <option value="Total %: Highest to Lowest">Total %: Highest to Lowest</option>
                                                <option value="Total %: Lowest to Highest">Total %: Lowest to Highest</option>
                                            </select>
                                        </div>

                                        <label className="block text-xs font-semibold mb-1 uppercase tracking-tight">Slot Status</label>
                                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full mb-4 p-2 border rounded text-[12px] outline-none">
                                            <option value="All">All Statuses</option>
                                            <option value="Admitted">Admitted</option>
                                            <option value="Forfeit">Forfeit</option>
                                            <option value="Pending">Pending</option>
                                        </select>

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
                                        <button onClick={handleExportPDF} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                                            Export PDF
                                        </button>
                                        <button onClick={handleExportDOCX} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-100 border-b border-gray-100">
                                            Export DOCX
                                        </button>
                                        <button onClick={() => exportFormsToPDF()} className="w-full text-left px-4 py-3 text-[12px] font-bold text-gray-700 hover:bg-gray-50">
                                            Export PDF (All Forms)
                                        </button>
                                    </div>
                                )}
                            </div>
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
                                    <th className="px-[14px] py-[6px] text-[11px] font-bold text-center">Slot Status</th>
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

                                            {/* If they forfeit, show FORFEIT instead of their blank/missing ID */}
                                            <td className="px-4 py-1 text-[12px] text-gray-600 font-mono">
                                                {a.admissionStatus === 'Forfeit' ? <span className="text-gray-400 font-bold tracking-widest text-xs">FORFEIT</span> : (a.id && a.id.startsWith('A-') ? a.id : `A-${a.id}`)}
                                            </td>

                                            <td className="px-4 py-1 text-[12px] text-gray-800">{a.name}</td>

                                            <td className="px-4 py-1 text-left text-[12px] text-gray-800 uppercase">
                                                {getCourseAbbreviation(a.reconsiderationProgram || (a.isRejectedFirstChoice ? a.profile?.appDetails?.secondChoice : a.profile?.appDetails?.firstChoice), coursesList)}
                                            </td>

                                            <td className="px-4 py-1 text-center text-[12px] text-gray-600">
                                                {parseFloat(calculateTotal(a)) > 0 ? `${calculateTotal(a)}%` : <span className="font-black text-[12px]  text-gray-500">—</span>}
                                            </td>

                                            <td className="px-4 py-1 text-center"><StatusTag status={a.slotStatus} /></td>

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

                                                    {a.slotStatus !== "Accepted" && a.slotStatus !== "Forfeit" && a.slotStatus !== "Forfeited" && a.slotStatus !== "Admitted" && a.slotStatus !== "admitted" && (
                                                        <>
                                                            <button
                                                                onClick={() => handleConfirmSlot(a)}
                                                                className="group relative flex items-center justify-center w-6 h-6 bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 rounded-md transition-all shadow-sm"
                                                                title="Confirm Slot"
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleForfeitSlot(a)}
                                                                className="group relative flex items-center justify-center w-6 h-6 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-md transition-all shadow-sm"
                                                                title="Forfeit Slot"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </>
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

            {/* --- VIEW APPLICANT MODAL --- */}
            {isModalOpen && selectedApplicant && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-6">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative bg-white rounded-[10px] shadow-2xl w-11/12 max-w-[1400px] z-10 flex flex-col max-h-[95vh] overflow-hidden">

                        <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-4 shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="text-gray-800 font-bold uppercase tracking-wide text-[15px]">Applicant Details</h3>
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
                                    <FormField label="Program" value={selectedApplicant.isRejectedFirstChoice ? selectedApplicant.profile.appDetails.secondChoice : selectedApplicant.profile.appDetails.firstChoice} isEditMode={false} />
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
                                            if (window.confirm("Are you sure you want to delete this applicant?")) {
                                                api.delete(`/admin/applicant/${selectedApplicant.rawId || selectedApplicant.id}`)
                                                    .then(() => {
                                                        setApplicants(prev => prev.filter(a => a.id !== selectedApplicant.id && a.rawId !== selectedApplicant.rawId));
                                                        setIsModalOpen(false);
                                                    })
                                                    .catch(err => alert("Failed to delete applicant."));
                                            }
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

            {/* --- CAPACITY WARNING MODAL --- */}
            {capacityWarningModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCapacityWarningModal(null)}></div>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10 border-t-4 border-yellow-500 animate-in fade-in zoom-in duration-200">
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
                                    const { applicant } = capacityWarningModal;
                                    setCapacityWarningModal(null);
                                    executeConfirmSlot(applicant, true);
                                }}
                                className="px-6 py-2 rounded bg-blue-800 hover:bg-blue-700 font-bold uppercase text-[12px] text-white transition shadow"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {isConfirmSlotModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsConfirmSlotModalOpen(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10 animate-in fade-in zoom-in duration-200">
                        <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition" onClick={() => setIsConfirmSlotModalOpen(false)}>&times;</button>
                        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                            Confirm Slot
                        </h3>
                        <p className="text-sm text-gray-700 mb-6 font-medium">
                            Are you sure you want to confirm the slot for <strong className="uppercase">{confirmSlotApplicant?.name}</strong>?
                        </p>
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button
                                onClick={() => setIsConfirmSlotModalOpen(false)}
                                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
                            >
                                NO
                            </button>
                            <button
                                onClick={() => executeConfirmSlot(confirmSlotApplicant)}
                                className="px-6 py-2 rounded bg-green-700 hover:bg-green-600 font-bold uppercase text-[12px] text-white transition shadow"
                            >
                                YES
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isForfeitModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsForfeitModalOpen(false)}></div>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative z-10 animate-in fade-in zoom-in duration-200">
                        <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition" onClick={() => setIsForfeitModalOpen(false)}>&times;</button>
                        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                            Forfeit Confirmation
                        </h3>
                        <p className="text-sm text-gray-700 mb-6 font-medium">
                            Are you sure you want to forfeit the slot for <strong className="uppercase">{forfeitApplicant?.name}</strong>?
                        </p>
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button
                                onClick={() => setIsForfeitModalOpen(false)}
                                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
                            >
                                NO
                            </button>
                            <button
                                onClick={confirmForfeitSlot}
                                className="px-6 py-2 rounded bg-red-700 hover:bg-red-600 font-bold uppercase text-[12px] text-white transition shadow"
                            >
                                YES
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- HIDDEN PRINT CONTAINER --- */}
            <div style={{ display: "none" }}>
                <div ref={printFormRef} dangerouslySetInnerHTML={{ __html: printContent }} />
            </div>

        </div>
    );
}
