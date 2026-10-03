import { useState, useEffect, useRef, useContext } from "react";

import api, { BASE_URL } from "../../../services/api";
import { ToastContext } from "../context/ToastContext.jsx";
import { PageLoader, ButtonSpinner } from "../components/Loaders.jsx";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save, Edit3, Shield, Activity, AlertTriangle, Trash2, Clock, User, CheckCircle, UserCog,
  Wrench, Bell, Archive, Database, RefreshCw, History, Eye, EyeOff, UserPlus, BookOpen, Plus, Landmark, Image as ImageIcon, Layout, X
} from "lucide-react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

export default function Settings() {
  const { toast } = useContext(ToastContext);

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("adminSettingsTab") || "general");

  useEffect(() => {
    localStorage.setItem("adminSettingsTab", activeTab);
  }, [activeTab]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [academicYears, setAcademicYears] = useState([]);
  const [pastAcademicYears, setPastAcademicYears] = useState([]);
  const [systemAdminEmail, setSystemAdminEmail] = useState("");

  const [currentUserRole, setCurrentUserRole] = useState("SuperAdmin");

  const [isArchiveMode, setIsArchiveMode] = useState(false);
  const [targetYear, setTargetYear] = useState("");
  const [dbSchoolYear, setDbSchoolYear] = useState("");
  const [activeYear, setActiveYear] = useState("");

  const [modals, setModals] = useState({
    restart: false,
    restartMessage: "",
    reset: false,
    resetCode: "",
    toggleAdmission: false,
    saveAdmission: false
  });

  const defaultSettings = {
    systemName: "Pre-Admission",
    schoolName: "Baliwag Polytechnic College (BTECH)",
    contactInfo: "(044) 802 6795",
    email: "admissions@btech.edu.ph",
    admissionStatus: "Open",
    admissionOpen: true,
    schoolYear: "",
    applicationStart: "",
    applicationDeadline: "",
    allowedApplicantTypes: ["SHS Graduate", "Transferee", "ALS"],
    portalSettings: {
      portalName: "Baliwag Polytechnic College\nADMISSION",
      backgroundUrl: "",
      documentaryRequirements: `<p>Before you begin, please prepare photos or scans of your required documents. Make sure they are saved as JPEG, JPG, or PNG files and are smaller than 200 KB.</p><h3>NEW STUDENTS (FRESHMEN)</h3><ul><li>2pcs 2X2 picture with white background</li><li>Original Grade 12 Report Card (Form 138)</li><li>Original Good Moral Certificate</li><li>Photocopy of SHS Diploma</li><li>Photocopy of Grade 11 Report Card with Certified True Copy</li><li>Photocopy of PSA Birth Certificate</li></ul><h3>TRANSFEREE</h3><ul><li>Original Transcript of Records</li><li>Honorable Dismissal</li><li>Original Good Moral Certificate</li><li>Photocopy of PSA Birth Certificate</li></ul><h3>ALS GRADUATE</h3><ul><li>Original Certificate of Rating</li><li>Original ALS Certification Test Result Document</li><li>Photocopy of PSA Birth Certificate</li></ul><h3>RETURNING STUDENTS</h3><ul><li>Clearance for enrollment from the Registrar</li></ul>`,
      gradeRequirements: `<ul><li><strong>Board / Licensure Programs:</strong> You must obtain a GWA of 87 or above.</li><li><strong>Non-Board / Non-Licensure Programs:</strong> You must obtain a GWA of 85 or above.</li></ul>`,
      applicationGuidelines: `<p>If you're a new student and wish to register for admission, please follow the instructions below:</p><ol><li>Click on the <strong>Register</strong> tab to start your registration or <strong>Login</strong> if you already have an account.</li><li>Enter your email address and a secure password to create an account. Ensure that the email address is valid and active.</li><li>A 6-digit verification code (OTP) will be sent to your email. Enter the verification code in the prompt to verify your email address.</li><li>Once verified, you will be automatically logged into the portal (or you can log in using your newly created credentials).</li><li>Navigate to the portal and fill out your application with all necessary information such as application details, personal information, educational background, upload requirements and schedule an interview.</li><li>Ensure all necessary data has been filled in correctly.</li><li>Once you've reviewed all your data, agree to the declaration and submit your application.</li><li>After submission, you'll be redirected back to your dashboard.</li><li>A confirmation email will be sent to your registered email address confirming your submission and interview schedule.</li></ol>`,
      applicantRequirements: [
        { documentName: "Photocopy of PSA Birth Certificate", targetApplicant: ["SHS Graduate", "Transferee", "ALS"], isRequired: true },
        { documentName: "Photocopy of Grade 11 Report Card with Certified True Copy", targetApplicant: ["SHS Graduate"], isRequired: true },
        { documentName: "Original Grade 12 Report Card (Form 138)", targetApplicant: ["SHS Graduate"], isRequired: false },
        { documentName: "Photocopy of SHS Diploma", targetApplicant: ["SHS Graduate"], isRequired: false },
        { documentName: "Original Certificate of Good Moral Character", targetApplicant: ["SHS Graduate"], isRequired: false },
        { documentName: "Original Honorable Dismissal", targetApplicant: ["Transferee"], isRequired: false },
        { documentName: "Certificate of Copy of Grades", targetApplicant: ["Transferee"], isRequired: false },
        { documentName: "Original Transcript of Records (TOR)", targetApplicant: ["Transferee"], isRequired: false },
        { documentName: "Original Certificate of Rating", targetApplicant: ["ALS"], isRequired: false },
        { documentName: "Original ALS Certification Test Result Document", targetApplicant: ["ALS"], isRequired: false },
        { documentName: "Certificate of Disability", targetApplicant: ["SHS Graduate", "Transferee", "ALS"], isRequired: true, condition: "disability" },
        { documentName: "Certificate of Indigenous People", targetApplicant: ["SHS Graduate", "Transferee", "ALS"], isRequired: true, condition: "indigenous" },
        { documentName: "Photocopy of Solo Parent ID", targetApplicant: ["SHS Graduate", "Transferee", "ALS"], isRequired: true, condition: "soloParent" },
        { documentName: "Photocopy of 4Ps ID", targetApplicant: ["SHS Graduate", "Transferee", "ALS"], isRequired: true, condition: "fourPs" },
        { documentName: "Copy of OFW Document (e.g. Contract or ID)", targetApplicant: ["SHS Graduate", "Transferee", "ALS"], isRequired: true, condition: "ofw" },
      ]
    }
  };

  const [settings, setSettings] = useState({ ...defaultSettings });

  // Specific Institute Settings for Standard Admins
  const [myInstitute, setMyInstitute] = useState({
    _id: "", name: "", abbreviation: "", address: "", dailyLimit: ""
  });

  const [securitySettings, setSecuritySettings] = useState({ twoFactorAuth: false });
  const [notifSettings, setNotifSettings] = useState({
    emailNewApp: true,
    docUploads: true,
    emailDeadline: true,
    sysMaintenance: true
  });

  const DEFAULT_CRITERIA_WEIGHTS = { bcet: 50, gwa: 20, interview: 25, dei: 5 };
  const [criteriaWeights, setCriteriaWeights] = useState(DEFAULT_CRITERIA_WEIGHTS);
  const [isSavingWeights, setIsSavingWeights] = useState(false);

  const [activityLogs, setActivityLogs] = useState([]);
  const [confirmActionModal, setConfirmActionModal] = useState({ isOpen: false, message: "", onConfirm: null });

  const [adminList, setAdminList] = useState([]);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [adminRole, setAdminRole] = useState("Admin");
  const [adminInstitute, setAdminInstitute] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");

  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);

  const [editAdminModal, setEditAdminModal] = useState({ isOpen: false, admin: null });

  const [courses, setCourses] = useState([]);
  const [institutes, setInstitutes] = useState([]);
  const [filterInstitute, setFilterInstitute] = useState("All");
  const [courseModal, setCourseModal] = useState({ isOpen: false, data: { name: "", abbreviation: "", institute: "", limit: 0, applicationLimit: 0, hasBoardExam: false }, isEdit: false });

  const [instituteModal, setInstituteModal] = useState({
    isOpen: false,
    data: { name: "", abbreviation: "", address: "", dailyLimit: "" },
    isEdit: false
  });

  const [reqModal, setReqModal] = useState({
    isOpen: false,
    data: { documentName: "", targetApplicant: [], isRequired: true },
    isEdit: false,
    editIndex: -1
  });

  const [newBlockedDate, setNewBlockedDate] = useState("");
  const [isBlockedDateModalOpen, setIsBlockedDateModalOpen] = useState(false);

  const availableApplicantTypes = ["SHS Graduate", "Transferee", "ALS"];
  const [isMatrixOpen, setIsMatrixOpen] = useState(false);

  const rolePermissions = {
    SuperAdmin: {
      applicantManagement: true, admissionStatus: true, systemProfile: true, systemMaintenance: true, activityLogs: true, manageAdmins: true
    },
    Admin: {
      applicantManagement: true, admissionStatus: false, systemProfile: false, systemMaintenance: false, activityLogs: true, manageAdmins: false
    }
  };

  const hasPermission = rolePermissions[currentUserRole] || rolePermissions.Admin;
  const canEditAdmission = hasPermission.admissionStatus;
  const canEditProfile = hasPermission.systemProfile;
  const canEditMaintenance = hasPermission.systemMaintenance;
  const canManageAdmins = hasPermission.manageAdmins;

  useEffect(() => {
    const now = new Date();
    let baseYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Assuming 2nd Semester is roughly Jan (0) to May (4)
    const isSecondSem = currentMonth >= 0 && currentMonth <= 4;

    if (isSecondSem) {
      baseYear -= 1;
    }

    const futureYears = [];
    for (let i = 0; i < 4; i++) {
      futureYears.push(`${baseYear + i}-${baseYear + i + 1}`);
    }
    setAcademicYears(futureYears);

    const checkArchive = sessionStorage.getItem("archiveViewYear");
    if (checkArchive) {
      setIsArchiveMode(true);
      setActiveYear(checkArchive);
    }

    const fetchInitialData = async () => {
      let currentRole = "Admin";
      let instAbbr = "";

      try {
        const profileRes = await api.get('/admin/profile');
        if (profileRes.data && profileRes.data.role) {
          currentRole = "Admin";
          instAbbr = profileRes.data.institute;

          setCurrentUserRole(currentRole);
          if (profileRes.data.email) {
            setSystemAdminEmail(profileRes.data.email);
          }
          if (profileRes.data.username) {
            setCurrentUsername(profileRes.data.username);
          }
          if (currentRole !== "SuperAdmin" && (activeTab === "admin" || activeTab === "maintenance" || activeTab === "institutes_programs")) {
            setActiveTab("general");
          }
          if (activeTab === "notification") setActiveTab("general");
        } else {
          setCurrentUserRole("Admin");
          if (activeTab === "admin" || activeTab === "maintenance" || activeTab === "institutes_programs" || activeTab === "notification") setActiveTab("general");
        }
      } catch (error) {
        console.error("Failed to fetch profile role");
        setCurrentUserRole("Admin");
        if (activeTab === "admin" || activeTab === "maintenance" || activeTab === "institutes_programs" || activeTab === "notification") setActiveTab("general");
      }

      try {
        const instRes = await api.get('/admin/institutes');
        setInstitutes(instRes.data);
        if (currentRole !== "SuperAdmin") {
          const userInst = instRes.data.find(i => i.abbreviation === instAbbr);
          if (userInst) {
            setMyInstitute({
              _id: userInst._id,
              name: userInst.name || "",
              abbreviation: userInst.abbreviation || "",
              address: userInst.address || "",
              dailyLimit: userInst.dailyLimit || ""
            });
          }
        }
      } catch (e) { console.error(e); }

      try {
        const res = await api.get('/admin/archived-years');
        if (res.data) setPastAcademicYears(res.data);
      } catch (err) {
        try {
          const appsRes = await api.get('/admin_applicants');
          const years = [...new Set(appsRes.data.map(a => a.schoolYear))];
          const activeRes = await api.get('/admin/settings');
          const currentActiveYear = activeRes.data ? activeRes.data.schoolYear : "";
          const archived = years.filter(y => y && y !== currentActiveYear).sort().reverse();
          setPastAcademicYears(archived);
        } catch (fallbackErr) { }
      }
    };

    const loadAll = async () => {
      try {
        await Promise.all([
          fetchInitialData(),
          fetchSettings(),
          fetchLogs()
        ]);
      } catch (err) {
        console.error(err);
      } finally {
        setInitialLoading(false);
      }
    };
    loadAll();
  }, []);

  const fetchSettings = async () => {
    try {
      const archiveYear = sessionStorage.getItem("archiveViewYear");
      const res = await api.get('/admin/settings');
      if (res.data) {
        let isOpen = false;

        let deadline = "";
        let start = "";

        if (res.data.applicationStart) {
          const sd = new Date(res.data.applicationStart);
          if (!isNaN(sd.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            start = `${sd.getFullYear()}-${pad(sd.getMonth() + 1)}-${pad(sd.getDate())}T${pad(sd.getHours())}:${pad(sd.getMinutes())}`;
          }
        }

        if (res.data.applicationDeadline) {
          const d = new Date(res.data.applicationDeadline);
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            deadline = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
        }

        if (start && deadline) {
          const now = new Date();
          if (now >= new Date(start) && now <= new Date(deadline)) {
            isOpen = true;
          }
        }

        setDbSchoolYear(res.data.schoolYear || "");
        setActiveYear(archiveYear || res.data.schoolYear || "");

        // Deep-merge portalSettings so defaults (like seeded applicantRequirements) are preserved
        const mergedPortalSettings = {
          ...defaultSettings.portalSettings,
          ...(res.data.portalSettings || {}),
        };
        // If backend has no applicantRequirements or it's empty, use the defaults
        if (!mergedPortalSettings.applicantRequirements || mergedPortalSettings.applicantRequirements.length === 0) {
          mergedPortalSettings.applicantRequirements = defaultSettings.portalSettings.applicantRequirements;
        }

        if (archiveYear) {
          setIsArchiveMode(true);
          setSettings({
            ...defaultSettings, ...res.data, portalSettings: mergedPortalSettings, schoolYear: archiveYear, admissionOpen: false, admissionStatus: "Closed", applicationStart: "", applicationDeadline: ""
          });
        } else {
          setSettings({
            ...defaultSettings, ...res.data, portalSettings: mergedPortalSettings, schoolYear: res.data.schoolYear || "", admissionOpen: isOpen, admissionStatus: isOpen ? "Open" : "Closed", applicationStart: start || res.data.applicationStart || "", applicationDeadline: deadline || res.data.applicationDeadline || ""
          });
        }

        if (res.data.notifications) setNotifSettings(res.data.notifications);
        if (res.data.security) setSecuritySettings(res.data.security);
        if (res.data.criteriaWeights) setCriteriaWeights({ ...DEFAULT_CRITERIA_WEIGHTS, ...res.data.criteriaWeights });
      }
    } catch (err) {
      console.error("Failed to load settings");
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await api.get('/admin/logs');
      if (res.data) setActivityLogs(res.data);
    } catch (err) {
      console.error("Failed to load logs");
    }
  };

  const fetchAdmins = async () => {
    try {
      const res = await api.get('/admin/list');
      setAdminList(res.data);
    } catch (err) {
      console.error("Failed to load admins", err);
    }
  };

  const fetchCourses = async () => {
    try {
      const res = await api.get('/admin/courses');
      setCourses(res.data);
    } catch (err) {
      console.error("Failed to load courses");
    }
  };

  const fetchInstitutes = async () => {
    try {
      const res = await api.get('/admin/institutes');
      setInstitutes(res.data);
    } catch (err) {
      console.error("Failed to load institutes");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (settings.applicationStart && settings.applicationDeadline && !isArchiveMode) {
        const now = new Date();
        const start = new Date(settings.applicationStart);
        const end = new Date(settings.applicationDeadline);

        let newStatus = settings.admissionStatus;
        if (now < start) newStatus = "Scheduled";
        else if (now >= start && now <= end) newStatus = "Open";
        else if (now > end) newStatus = "Closed";

        if (newStatus !== settings.admissionStatus) {
          setSettings(prev => ({ ...prev, admissionStatus: newStatus, admissionOpen: newStatus === "Open" }));
        }
      }
    }, 10000); // Check every 10 seconds
    return () => clearInterval(timer);
  }, [settings.applicationStart, settings.applicationDeadline, settings.admissionStatus, settings.resetPromptDismissed, isArchiveMode]);

  useEffect(() => {
    if (currentUserRole === "SuperAdmin") {
      if (activeTab === "admin") {
        fetchAdmins();
      } else if (activeTab === "institutes_programs") {
        fetchInstitutes();
        fetchCourses();
      } else if (activeTab === "content") {
        fetchSettings();
      }
    } else {
      if (activeTab === "general") {
        fetchCourses();
      }
    }
  }, [activeTab, currentUserRole]);

  const logAction = async (action, status = "Success") => {
    try {
      await api.post('/admin/logs', {
        action,
        status,
        role: currentUserRole,
        user: currentUsername || "System"
      });
      fetchLogs();
    } catch (err) {
      console.error("Log failed");
    }
  };

  const exitArchiveMode = () => {
    sessionStorage.removeItem("archiveViewYear");
    window.location.reload();
  };
  // The portal toggle is now fully automatic. We no longer need toggle modals or handlers.
  const handleChange = (e) => {
    if (isArchiveMode) return;
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value || "" }));
  };

  const handlePortalContentChange = (name, value) => {
    if (isArchiveMode) return;
    setSettings(prev => ({
      ...prev,
      portalSettings: { ...prev.portalSettings, [name]: value }
    }));
  };

  const handleBackgroundUpload = async (e) => {
    if (isArchiveMode) return;
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      toast.info("Uploading background image...");
      const res = await api.post("/admin/upload-background", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      handlePortalContentChange("backgroundUrl", res.data.url);
      toast.info("Background uploaded successfully.");
    } catch (err) {
      toast.info("Failed to upload background.");
    }
  };

  const handleDateChange = (name, dateString) => {
    if (isArchiveMode || !canEditAdmission) return;
    setSettings(prev => ({ ...prev, [name]: dateString || "" }));
  };

  const handleMatrixToggle = (courseIndex, applicantType) => {
    if (isArchiveMode || !canEditAdmission) return;
    setSettings(prev => {
      const updatedCourses = [...(prev.courses || [])];
      if (!updatedCourses[courseIndex]) return prev;

      const course = { ...updatedCourses[courseIndex] };
      const types = course.allowedApplicantTypes || ["SHS Graduate", "Transferee", "ALS"];

      if (types.includes(applicantType)) {
        course.allowedApplicantTypes = types.filter(t => t !== applicantType);
      } else {
        course.allowedApplicantTypes = [...types, applicantType];
      }
      updatedCourses[courseIndex] = course;
      return { ...prev, courses: updatedCourses };
    });
  };


  const handleInitiateSaveAdmission = () => {
    if (!settings.schoolYear || !settings.applicationStart || !settings.applicationDeadline) {
      toast.info("Validation Error: Academic Year, Application Start, and Application Deadline MUST be filled out.");
      return;
    }
    handleConfirmSaveAdmission();
  };

  const formatPayloadSettings = (baseSettings) => {
    let properDeadline = baseSettings.applicationDeadline;

    if (properDeadline && !properDeadline.includes('Z') && !properDeadline.includes('+')) {
      properDeadline = new Date(properDeadline).toISOString();
    }

    const now = new Date();
    const sDate = new Date(baseSettings.applicationStart);
    const eDate = new Date(baseSettings.applicationDeadline);
    let computedStatus = "Closed";
    if (now < sDate) computedStatus = "Scheduled";
    else if (now >= sDate && now <= eDate) computedStatus = "Open";

    return {
      ...baseSettings,
      applicationDeadline: properDeadline,
      notifications: notifSettings,
      security: securitySettings,
      admissionStatus: computedStatus,
      admissionOpen: computedStatus === "Open",
      resetPromptDismissed: false
    };
  };

  const handleConfirmSaveAdmission = async () => {
    try {
      setModals(prev => ({ ...prev, saveAdmission: false }));
      setIsLoading(true);

      const fullSettings = formatPayloadSettings(settings);

      await api.put('/admin/settings', fullSettings);

      setDbSchoolYear(fullSettings.schoolYear);
      setActiveYear(fullSettings.schoolYear);

      setSettings(prev => ({ ...prev, admissionOpen: fullSettings.admissionOpen, admissionStatus: fullSettings.admissionStatus }));

      await logAction(`Admission Portal Settings Saved`);
      toast.info("Admission settings saved successfully!");
    } catch (err) {
      toast.info("Failed to save admission settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSystemProfile = async () => {
    if (isLoading) return; // Anti-spam lock
    try {
      setIsLoading(true);
      const cleanedSettings = { ...settings };
      const fallbackFields = ['systemName', 'schoolName', 'contactInfo', 'email', 'address', 'facebookPage', 'website'];

      fallbackFields.forEach(field => {
        if (!cleanedSettings[field] || cleanedSettings[field].toString().trim() === "") {
          cleanedSettings[field] = defaultSettings[field];
        }
      });

      const fullSettings = formatPayloadSettings(cleanedSettings);

      await api.put('/admin/settings', fullSettings);
      setSettings(cleanedSettings);
      setIsEditingProfile(false);

      await logAction("Updated System Configuration Profile");
      toast.info("System profile saved successfully!");

    } catch (err) {
      toast.info("Failed to save profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMyInstitute = async () => {
    try {
      setIsLoading(true);
      await api.put(`/admin/institutes/${myInstitute._id}`, myInstitute);
      setIsEditingProfile(false);
      await logAction("Updated Institute Profile");
      toast.info("Institute profile saved successfully!");
      fetchInstitutes();
    } catch (err) {
      toast.info("Failed to save institute profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (isLoading) return; // Anti-spam lock
    try {
      setIsLoading(true);
      const fullSettings = formatPayloadSettings(settings);

      await api.put('/admin/settings', fullSettings);
      await logAction("Updated Notification Settings");
      toast.info("Notification preferences saved successfully!");
    } catch (err) {
      toast.info("Failed to save notification preferences.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle2FA = async () => {
    if (isLoading) return; // Anti-spam lock
    if (isArchiveMode || currentUserRole !== "SuperAdmin") return;
    const newState = !securitySettings.twoFactorAuth;
    const updatedSecurity = { ...securitySettings, twoFactorAuth: newState };
    setSecuritySettings(updatedSecurity);

    try {
      setIsLoading(true);
      const fullSettings = {
        ...settings, notifications: notifSettings, security: updatedSecurity
      };
      await api.put('/admin/settings', fullSettings);

      logAction(`${newState ? "Enabled" : "Disabled"} Two-Factor Authentication`);

      if (newState === true) {
        toast.info("2FA is now ENABLED. For your security, you will be logged out to verify your login.");
        localStorage.removeItem("adminToken");
        window.location.href = "/admin_login";
      } else {
        toast.info("2FA is now DISABLED and saved!");
      }
    } catch (err) {
      toast.info("Failed to save 2FA setting.");
      setSecuritySettings({ ...securitySettings, twoFactorAuth: !newState });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNotifToggle = (key) => {
    if (isArchiveMode) return;
    const newState = !notifSettings[key];
    setNotifSettings(prev => ({ ...prev, [key]: newState }));
  };

  const handleClearLogs = async () => {
    if (activityLogs.length === 0 || isArchiveMode || !canManageAdmins) return;
    setConfirmActionModal({
      isOpen: true,
      message: "Are you sure you want to clear all activity logs? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await api.delete('/admin/logs');
          setActivityLogs([]);
        } catch (err) { toast.error("Failed to clear logs."); }
      }
    });
  };

  const handleInitiateDataSwitch = () => {
    if (isArchiveMode || !canEditMaintenance) return;
    if (!targetYear) {
      toast.info("Please select a past academic year first.");
      return;
    }
    setModals(prev => ({ ...prev, restart: true, restartMessage: `Are you sure you want to view Archived Data for Academic Year ${targetYear}?` }));
  };

  const handleConfirmRestart = async () => {
    try {
      setIsLoading(true);
      setModals(prev => ({ ...prev, restart: false }));
      sessionStorage.setItem("archiveViewYear", targetYear);
      logAction(`Viewing Historical Data: AY ${targetYear}`);
      toast.info(`Now viewing archived data for ${targetYear}.\n\nTo return to the current live system, click the "Return to Live" button on the Applications page.`);
      setTargetYear("");
      window.location.href = "/admin_applications";
    } catch (err) {
      toast.info("Failed to load archive.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiateReset = () => {
    if (isArchiveMode || !canEditMaintenance) return;
    setModals(prev => ({ ...prev, reset: true, resetCode: "" }));
  };

  const handleConfirmReset = async () => {
    if (modals.resetCode !== "RESET") {
      toast.info("Incorrect confirmation code. Please type RESET.");
      return;
    }

    try {
      setModals(prev => ({ ...prev, reset: false }));
      setIsLoading(true);

      // Pointing to the corrected backend router URL path
      const res = await api.post('/admin/reset-system');
      toast.info(res.data.msg || "System successfully archived and reset. You will now be logged out.");

      localStorage.removeItem("adminToken");
      window.location.href = "/admin_login";

    } catch (err) {
      toast.info("Reset failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (isLoading) return; // Anti-spam lock
    if (isArchiveMode || !canManageAdmins) return;

    if (!adminUsername.trim() || !adminEmail.trim() || !adminPassword.trim() || !adminConfirmPassword.trim()) {
      toast.info("Please enter all details.");
      return;
    }

    if (adminPassword !== adminConfirmPassword) {
      toast.info("Passwords do not match!");
      return;
    }

    try {
      setIsLoading(true);

      const payloadInstitute = adminRole === "SuperAdmin" ? "Admission" : adminInstitute;

      const res = await api.post("/admin/create-admin", {
        username: adminUsername,
        institute: payloadInstitute,
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
        role: adminRole
      });

      toast.info(res.data.msg);

      setAdminUsername("");
      setAdminEmail("");
      setAdminPassword("");
      setAdminConfirmPassword("");
      setAdminRole("Admin");
      setAdminInstitute("");

      fetchLogs();
      fetchAdmins();

    } catch (err) {
      toast.info(err.response?.data?.msg || "Failed to create admin account.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAdmin = async (id) => {
    if (isArchiveMode || !canManageAdmins) return;
    setConfirmActionModal({
      isOpen: true,
      message: "Are you sure you want to delete this administrator account?",
      onConfirm: async () => {
        try {
          await api.delete(`/admin/user/${id}`);
          toast.success("Admin deleted successfully.");
          fetchAdmins();
        } catch (err) {
          toast.error("Failed to delete admin.");
        }
      }
    });
  };

  const handleUpdateAdmin = async () => {
    if (isArchiveMode || !canManageAdmins) return;
    try {
      const payload = {
        ...editAdminModal.admin,
        email: editAdminModal.admin.email.trim().toLowerCase()
      };
      await api.put(`/admin/user/${editAdminModal.admin._id}`, payload);
      toast.info("Admin updated successfully.");
      setEditAdminModal({ isOpen: false, admin: null });
      fetchAdmins();
    } catch (err) {
      toast.info("Failed to update admin.");
    }
  };

  const handleSaveInstitute = async () => {
    if (!instituteModal.data.name.trim() || !instituteModal.data.abbreviation.trim()) {
      toast.info("Please provide both the Full Name and Abbreviation.");
      return;
    }
    try {
      if (instituteModal.isEdit) {
        await api.put(`/admin/institutes/${instituteModal.data._id}`, instituteModal.data);
        toast.info("Institute updated successfully!");
      } else {
        await api.post('/admin/institutes', instituteModal.data);
        toast.info("Institute added successfully!");
      }
      setInstituteModal({ isOpen: false, data: { name: "", abbreviation: "", address: "", dailyLimit: "" }, isEdit: false });
      fetchInstitutes();
    } catch (err) {
      console.error("Institute Save Error:", err);
      toast.info(err.response?.data?.msg || "Failed to save institute.");
    }
  };

  const handleDeleteInstitute = async (id, abbr) => {
    setConfirmActionModal({
      isOpen: true,
      message: `Are you sure you want to delete "${abbr}"?`,
      onConfirm: async () => {
        try {
          await api.delete(`/admin/institutes/${id}`);
          toast.success("Institute deleted successfully.");
          fetchInstitutes();
        } catch (err) { toast.error("Failed to delete institute."); }
      }
    });
  };

  const handleSaveCourse = async () => {
    const payload = {
      name: courseModal.data.name.trim(),
      abbreviation: courseModal.data.abbreviation.trim().toUpperCase(),
      institute: courseModal.data.institute,
      limit: parseInt(courseModal.data.limit) || 0,
      applicationLimit: parseInt(courseModal.data.applicationLimit) || 0,
      hasBoardExam: Boolean(courseModal.data.hasBoardExam)
    };

    if (!payload.name || !payload.abbreviation || !payload.institute) {
      toast.info("Please fill out Program Name, Abbreviation, and ensure Institute is set.");
      return;
    }

    const isDuplicate = courses.some(c =>
      c.abbreviation.toUpperCase() === payload.abbreviation &&
      c.institute === payload.institute &&
      c._id !== courseModal.data._id
    );

    if (isDuplicate) {
      toast.info(`A course with the abbreviation '${payload.abbreviation}' already exists for your institute.`);
      return;
    }

    try {
      setIsLoading(true);
      if (courseModal.isEdit) {
        await api.put(`/admin/courses/${courseModal.data._id}`, payload);
        toast.info("Course updated successfully!");
        logAction(`Updated Program: ${payload.name}`);
      } else {
        await api.post('/admin/courses', payload);
        toast.info("Course added successfully!");
        logAction(`Added new Program: ${payload.name}`);
      }
      setCourseModal({ isOpen: false, data: { name: "", abbreviation: "", institute: "", limit: 0, applicationLimit: 0, hasBoardExam: false }, isEdit: false });
      fetchCourses();
    } catch (err) {
      console.error("Course Save Error:", err);
      toast.info(err.response?.data?.msg || "Failed to save course to the database.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCourse = async (id, name) => {
    setConfirmActionModal({
      isOpen: true,
      message: `Are you sure you want to delete the course "${name}"? It will be removed from the student application choices.`,
      onConfirm: async () => {
        try {
          await api.delete(`/admin/courses/${id}`);
          toast.success("Course deleted successfully.");
          logAction(`Deleted Program: ${name}`);
          fetchCourses();
        } catch (err) {
          toast.error("Failed to delete course.");
        }
      }
    });
  };

  const TABS = [
    { label: 'General Settings', key: 'general' },
    ...(currentUserRole === "SuperAdmin" ? [
      { label: 'Manage Admins', key: 'admin' },
      { label: 'Institutes & Programs', key: 'institutes_programs' },
      { label: 'Content Management', key: 'content' }
    ] : []),
    { label: 'Security & Logs', key: 'security' },
    ...(currentUserRole === "SuperAdmin" ? [
      { label: 'System Maintenance', key: 'maintenance' }
    ] : [])
  ];

  if (initialLoading) {
    return <PageLoader message="Loading settings configurations..." />;
  }

  const currentAcYear = settings.schoolYear ? settings.schoolYear.substring(0, 9) : "";
  const currentSem = settings.schoolYear ? settings.schoolYear.substring(10) : "";

  return (
    <div className={`h-full w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${false ? 'ml-2' : 'ml-2'
      }`}>

      {/* Main container */}
      <main className="flex-1 flex flex-col px-6 py-4 w-full relative overflow-y-auto pb-12">

        {/* Header (scrolls with content) */}
        <div className="mb-6 flex-none">
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

        <div className="bg-white rounded-xl shadow-md p-8 h-fit relative">

          {/* === MODALS === */}

          {instituteModal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-[16px] mb-4 text-[#376e35] flex items-center gap-2"><BookOpen size={20} /> {instituteModal.isEdit ? "Edit Institute" : "Add Institute"}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Institute Name</label>
                    <input type="text" value={instituteModal.data.name} onChange={e => setInstituteModal({ ...instituteModal, data: { ...instituteModal.data, name: e.target.value } })} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Abbreviation</label>
                    <input type="text" value={instituteModal.data.abbreviation} onChange={e => setInstituteModal({ ...instituteModal, data: { ...instituteModal.data, abbreviation: e.target.value.toUpperCase() } })} className="w-full border uppercase p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                  <button onClick={() => setInstituteModal({ isOpen: false, data: { name: "", abbreviation: "", address: "", dailyLimit: "" }, isEdit: false })} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-[12px]">Cancel</button>
                  <button onClick={handleSaveInstitute} className="px-[18px] py-[6px] bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] text-[12px] shadow-md">Save</button>
                </div>
              </div>
            </div>
          )}

          {courseModal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-[16px] mb-4 text-[#376e35] flex items-center gap-2"><BookOpen size={20} /> {courseModal.isEdit ? "Edit Course" : "Add Program"}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Institute</label>
                    <select
                      value={courseModal.data.institute || ""}
                      onChange={e => { const val = e.target.value; setCourseModal(prev => ({ ...prev, data: { ...prev.data, institute: val } })); }}
                      className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium"
                    >
                      <option value="" disabled>Select Institute</option>
                      {institutes.map(inst => (
                        <option key={inst._id} value={inst.abbreviation}>{inst.abbreviation} - {inst.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Program Name</label>
                    <input type="text" value={courseModal.data.name} onChange={e => { const val = e.target.value; setCourseModal(prev => ({ ...prev, data: { ...prev.data, name: val } })); }} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Abbreviation</label>
                    <input type="text" value={courseModal.data.abbreviation} onChange={e => { const val = e.target.value.toUpperCase(); setCourseModal(prev => ({ ...prev, data: { ...prev.data, abbreviation: val } })); }} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium uppercase" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Application Limit (Max Submissions)</label>
                    <input type="number" min="0" value={courseModal.data.applicationLimit || ""} onChange={e => { const val = e.target.value; setCourseModal(prev => ({ ...prev, data: { ...prev.data, applicationLimit: val } })); }} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Program Capacity (Target Intake)</label>
                    <input type="number" min="0" value={courseModal.data.limit || ""} onChange={e => { const val = e.target.value; setCourseModal(prev => ({ ...prev, data: { ...prev.data, limit: val } })); }} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div className="space-y-1 flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="hasBoardExam"
                      checked={courseModal.data.hasBoardExam || false}
                      onChange={e => { const val = e.target.checked; setCourseModal(prev => ({ ...prev, data: { ...prev.data, hasBoardExam: val } })); }}
                      className="w-4 h-4 text-[#376e35] focus:ring-[#376e35] border-gray-300 rounded"
                    />
                    <label htmlFor="hasBoardExam" className="text-[13px] font-bold text-gray-700 tracking-wide cursor-pointer">Has Board Exam?</label>
                  </div>
                </div>
                <div className="mt-8 flex justify-end gap-3 border-t pt-4">
                  <button onClick={() => setCourseModal({ isOpen: false, data: { name: "", abbreviation: "", institute: "", limit: 0, applicationLimit: 0, hasBoardExam: false }, isEdit: false })} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-[12px]">Cancel</button>
                  <button onClick={handleSaveCourse} disabled={isLoading} className={`px-[18px] py-[6px] text-white font-bold rounded-lg text-[12px] shadow-md transition-colors ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#376e35] hover:bg-[#376e35]"}`}>
                    {isLoading ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {modals.restart && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-2 text-[#376e35] mb-2">
                  <History size={24} />
                  <h3 className="font-bold text-[16px]">Archive Data?</h3>
                </div>
                <p className="text-gray-600 text-[12px] mb-2 leading-relaxed">
                  {modals.restartMessage}
                </p>
                <div className="bg-green-50 p-3 rounded-lg mb-6 border border-green-100">
                  <p className="text-xs text-green-800 font-medium flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    The system will switch to View-Only Archived Mode.
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, restart: false }))} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-colors text-[12px]">Cancel</button>
                  <button onClick={handleConfirmRestart} className="px-[14px] py-[6px] bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] transition-all text-[12px] flex items-center gap-2 shadow-lg shadow-green-100">
                    <RefreshCw size={14} /> Confirm Archive
                  </button>
                </div>
              </div>
            </div>
          )}

          {modals.reset && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-2 text-red-600 mb-2">
                  <AlertTriangle size={24} />
                  <h3 className="font-bold text-[16px]">System Reset Confirmation</h3>
                </div>
                <p className="text-gray-600 text-[12px] mb-4 leading-relaxed">
                  Warning: <strong>All data will be archived in the database</strong>, and the active portal records will be completely <strong>wiped out/removed</strong>.
                </p>
                <div className="mb-6">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Type "RESET" to confirm</label>
                  <input
                    type="text"
                    value={modals.resetCode}
                    onChange={(e) => setModals(prev => ({ ...prev, resetCode: e.target.value }))}
                    placeholder="RESET"
                    className="w-full mt-1 p-2 border-2 border-red-100 rounded-lg focus:border-red-500 focus:outline-none font-bold text-red-600"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, reset: false }))} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-[12px]">Cancel</button>
                  <button onClick={handleConfirmReset} disabled={modals.resetCode !== "RESET"} className={`px-[14px] py-[6px] text-white font-bold rounded-lg text-[12px] flex items-center gap-2 ${modals.resetCode === "RESET" ? "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200" : "bg-gray-300 cursor-not-allowed"}`}>
                    <Trash2 size={14} /> Confirm Reset
                  </button>
                </div>
              </div>
            </div>
          )}



          {modals.toggleAdmission && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className={`flex items-center gap-2 mb-2 ${settings.admissionOpen ? "text-red-600" : "text-[#376e35]"}`}>
                  <AlertTriangle size={24} />
                  <h3 className="font-bold text-[16px]">
                    {settings.admissionOpen ? "Close Admission Portal?" : "Open Admission Portal?"}
                  </h3>
                </div>
                <p className="text-gray-600 text-[12px] mb-6 leading-relaxed">
                  Are you sure you want to <strong>{settings.admissionOpen ? "CLOSE" : "OPEN"}</strong> the admission portal?
                  {settings.admissionOpen
                    ? " Students will no longer be able to register. Logged-in students will be switched to Read-Only mode."
                    : " You must set an Academic Year and Deadline to begin accepting applications."}
                </p>
                {!settings.admissionOpen && (
                  <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="font-bold text-[12px] text-gray-700 mb-3">Open Application for:</p>
                    <div className="space-y-2">
                      {["SHS Graduate", "Transferee", "ALS"].map(type => (
                        <label key={type} className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer font-medium">
                          <input
                            type="checkbox"
                            checked={settings.allowedApplicantTypes?.includes(type) ?? true}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSettings(prev => ({ ...prev, allowedApplicantTypes: [...(prev.allowedApplicantTypes || []), type] }));
                              } else {
                                setSettings(prev => ({ ...prev, allowedApplicantTypes: (prev.allowedApplicantTypes || []).filter(t => t !== type) }));
                              }
                            }}
                            className="w-4 h-4 text-[#376e35] rounded focus:ring-[#376e35] cursor-pointer"
                          />
                          {type}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, toggleAdmission: false }))} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-[12px]">Cancel</button>
                  <button onClick={confirmToggleAdmission} className={`px-[14px] py-[6px] text-white font-bold rounded-lg text-[12px] flex items-center gap-2 shadow-lg ${settings.admissionOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-[#376e35] hover:bg-[#376e35]'}`}>
                    <CheckCircle size={14} /> Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {modals.saveAdmission && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center gap-2 text-[#376e35] mb-2">
                  <Save size={24} />
                  <h3 className="font-bold text-[16px]">Save Changes?</h3>
                </div>
                <p className="text-gray-600 text-[12px] mb-6 leading-relaxed">
                  Are you sure you want to save? The portal will be set to <strong>{settings.admissionOpen ? "OPEN" : "CLOSED"}</strong>. {settings.admissionOpen && "The Academic Year dropdown will be locked to prevent accidental changes."}
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, saveAdmission: false }))} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-[12px]">Cancel</button>
                  <button onClick={handleConfirmSaveAdmission} className="px-[14px] py-[6px] bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] text-[12px] flex items-center gap-2 shadow-lg">
                    <CheckCircle size={14} /> Confirm Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {editAdminModal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-[16px] mb-4 text-[#376e35] flex items-center gap-2"><Edit3 size={20} /> Edit Administrator</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Username</label>
                    <input type="text" value={editAdminModal.admin.username} onChange={e => setEditAdminModal({ ...editAdminModal, admin: { ...editAdminModal.admin, username: e.target.value } })} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Email Address</label>
                    <input type="email" value={editAdminModal.admin.email} onChange={e => setEditAdminModal({ ...editAdminModal, admin: { ...editAdminModal.admin, email: e.target.value } })} className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase">Role</label>
                      <select
                        value={editAdminModal.admin.role}
                        onChange={e => {
                          const newRole = e.target.value;
                          setEditAdminModal({
                            ...editAdminModal,
                            admin: {
                              ...editAdminModal.admin,
                              role: newRole,
                              institute: newRole === "SuperAdmin" ? "Admission" : "IITI"
                            }
                          });
                        }}
                        className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium"
                      >
                        <option value="Admin">Standard Admin</option>
                        <option value="SuperAdmin">Super Admin</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                  <button onClick={() => setEditAdminModal({ isOpen: false, admin: null })} className="px-[14px] py-[6px] text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-[12px]">Cancel</button>
                  <button onClick={handleUpdateAdmin} className="px-[18px] py-[6px] bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] text-[12px] shadow-md">Save Changes</button>
                </div>
              </div>
            </div>
          )}


          {/* === TABS NAVIGATION === */}
          <div className="flex justify-center mb-8">
            <div className="flex flex-wrap border border-gray-400 rounded-lg sm:rounded-full overflow-hidden w-full max-w-7xl shadow-sm bg-white">
              {TABS.map((tab, idx) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 px-2 sm:px-4 text-center font-bold text-xs sm:text-[12px] md:text-[15px] whitespace-nowrap ${activeTab === tab.key
                    ? "bg-[#376e35] text-white"
                    : "bg-white text-black hover:bg-gray-50 " + (idx > 0 ? "border-l border-gray-400" : "")
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* === GENERAL SETTINGS === */}
          {activeTab === "general" && (
            <div className="animate-fade-in space-y-12">

              {/* === SUPER ADMIN VIEW: FULL SETTINGS === */}
              {currentUserRole === "SuperAdmin" ? (
                <>
                  {/* TOP ROW: ADMISSION STATUS */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 lg:p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl lg:text-2xl font-bold text-black flex items-center gap-3">
                        <Activity className="text-[#376e35]" size={28} /> Admission Status & Academic Year & Semester
                      </h2>
                    </div>
                    <hr className="border-gray-300 mb-8" />

                    <div className="flex flex-col gap-8 items-stretch">

                      {/* Status Toggle */}
                      <div className={`rounded-xl p-8 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm border ${settings.admissionStatus === 'Open' ? 'bg-gray-50 border-gray-200' : settings.admissionStatus === 'Scheduled' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-100'}`}>
                        <div className="text-center sm:text-left">
                          <h3 className="font-bold text-2xl text-black">Admission Portal</h3>
                          <p className="text-gray-700">Currently <strong className={settings.admissionStatus === "Open" ? "text-[#376e35]" : settings.admissionStatus === "Scheduled" ? "text-amber-500" : "text-red-600"}>{settings.admissionStatus?.toUpperCase() || "CLOSED"}</strong> for applicants.</p>
                        </div>

                        <div
                          className={`relative w-14 h-7 shrink-0 rounded-full transition-colors duration-300 opacity-60 pointer-events-none ${settings.admissionStatus === 'Open' ? 'bg-[#376e35]' : settings.admissionStatus === 'Scheduled' ? 'bg-amber-500' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 bg-white w-6 h-6 rounded-full shadow transition-transform duration-300 ${settings.admissionStatus === 'Open' ? 'translate-x-7' : settings.admissionStatus === 'Scheduled' ? 'translate-x-3.5' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      {/* Academic Year & Dates Combined */}
                      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        {/* Academic Year Full Width */}
                        <div className="space-y-2 mb-6">
                          <label className={`font-bold text-[16px] flex items-center gap-2 ${settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission ? 'text-gray-400' : 'text-black'}`}>
                            <CalendarIcon size={18} /> Current Academic Year & Semester
                          </label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Academic Year Dropdown */}
                            <div className="relative">
                              <select
                                value={currentAcYear}
                                onChange={(e) => {
                                  const yr = e.target.value;
                                  let sem = currentSem || "1st Semester";
                                  if (pastAcademicYears.includes(`${yr} ${sem}`)) {
                                    sem = sem === "1st Semester" ? "2nd Semester" : "1st Semester";
                                  }
                                  handleChange({ target: { name: 'schoolYear', value: yr ? `${yr} ${sem}` : "" } });
                                }}
                                disabled={settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission}
                                className={`w-full appearance-none border rounded-lg px-4 py-3 outline-none ${(settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission)
                                  ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80"
                                  : "bg-white border-black text-black focus:ring-2 focus:ring-[#376e35] cursor-pointer"
                                  }`}
                              >
                                <option value="">Select Academic Year</option>
                                {currentAcYear && !academicYears.includes(currentAcYear) && !isArchiveMode && (
                                  <option value={currentAcYear}>{currentAcYear}</option>
                                )}
                                {academicYears
                                  .filter(year => pastAcademicYears.filter(py => py.includes(year)).length < 2)
                                  .map((year) => (
                                    <option key={year} value={year}>{year}</option>
                                  ))
                                }
                                {isArchiveMode && <option value={currentAcYear}>{currentAcYear}</option>}
                              </select>
                              <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 ${settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission ? 'text-gray-300' : 'text-gray-700'}`}>
                                <ChevronRight className="rotate-90" size={20} />
                              </div>
                            </div>

                            {/* Semester Dropdown */}
                            <div className="relative">
                              <select
                                value={currentSem}
                                onChange={(e) => {
                                  const sem = e.target.value;
                                  const yr = currentAcYear || academicYears[0];
                                  handleChange({ target: { name: 'schoolYear', value: sem ? `${yr} ${sem}` : "" } });
                                }}
                                disabled={settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission}
                                className={`w-full appearance-none border rounded-lg px-4 py-3 outline-none ${(settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission)
                                  ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80"
                                  : "bg-white border-black text-black focus:ring-2 focus:ring-[#376e35] cursor-pointer"
                                  }`}
                              >
                                <option value="">Select Semester</option>
                                <option value="1st Semester" disabled={pastAcademicYears.includes(`${currentAcYear} 1st Semester`)}>1st Semester</option>
                                <option value="2nd Semester" disabled={pastAcademicYears.includes(`${currentAcYear} 2nd Semester`)}>2nd Semester</option>
                                {isArchiveMode && !["1st Semester", "2nd Semester"].includes(currentSem) && currentSem && (
                                  <option value={currentSem}>{currentSem}</option>
                                )}
                              </select>
                              <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 ${settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission ? 'text-gray-300' : 'text-gray-700'}`}>
                                <ChevronRight className="rotate-90" size={20} />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className={`font-bold text-[16px] flex items-center gap-2 ${settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission ? 'text-gray-400' : 'text-black'}`}>
                              <Clock size={18} /> Admission Application Start
                            </label>
                            <CustomDateTimePicker
                              value={settings.applicationStart}
                              onChange={(val) => handleDateChange('applicationStart', val)}
                              name="applicationStart"
                              disabled={settings.admissionOpen || (settings.applicationDeadline && new Date() > new Date(settings.applicationDeadline)) || isArchiveMode || !canEditAdmission}
                              placeholder="Select Date & Time"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className={`font-bold text-[16px] flex items-center gap-2 ${isArchiveMode || !canEditAdmission ? 'text-gray-400' : 'text-black'}`}>
                              <Clock size={18} /> Admission Application Ends
                            </label>
                            <CustomDateTimePicker
                              value={settings.applicationDeadline}
                              onChange={(val) => handleDateChange('applicationDeadline', val)}
                              name="applicationDeadline"
                              disabled={isArchiveMode || !canEditAdmission}
                              placeholder="Select Date & Time"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Matrix Configuration Accordion (Super Admin Only) */}
                      {currentUserRole === "SuperAdmin" && (
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mt-6">
                          <button
                            onClick={() => setIsMatrixOpen(!isMatrixOpen)}
                            className="w-full bg-gray-50 p-6 flex justify-between items-center hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex flex-col items-start">
                              <h3 className="font-bold text-xl text-black">Program & Applicant Type Matrix</h3>
                              <p className="text-gray-600 text-sm mt-1">Configure which programs accept which type of applicants</p>
                            </div>
                            <div className="p-2 bg-white rounded-full shadow-sm border border-gray-200">
                              <ChevronRight className={`transition-transform duration-300 ${isMatrixOpen ? 'rotate-90' : ''}`} size={24} />
                            </div>
                          </button>

                          {isMatrixOpen && (
                            <div className="p-6 border-t border-gray-200 bg-white">
                              {(!settings.courses || settings.courses.length === 0) ? (
                                <p className="text-gray-500 text-center py-8">No programs configured yet. Add programs in the Institutes & Programs tab.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse min-w-[600px]">
                                    <thead>
                                      <tr className="bg-gray-50 border-y border-gray-200">
                                        <th className="py-2 px-4 font-bold text-gray-700">Program</th>
                                        {availableApplicantTypes.map(type => (
                                          <th key={type} className="py-2 px-4 font-bold text-gray-700 text-center">{type}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {settings.courses.map((course, idx) => {
                                        const allowed = course.allowedApplicantTypes || availableApplicantTypes;
                                        return (
                                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="py-2 px-4">
                                              <div className="font-semibold text-black">{course.abbreviation || course.name}</div>
                                              <div className="text-xs text-gray-500">{course.name}</div>
                                            </td>
                                            {availableApplicantTypes.map(type => (
                                              <td key={type} className="py-2 px-4 text-center">
                                                <label className="inline-flex items-center cursor-pointer justify-center w-full h-full">
                                                  <input
                                                    type="checkbox"
                                                    checked={allowed.includes(type)}
                                                    onChange={() => handleMatrixToggle(idx, type)}
                                                    disabled={isArchiveMode || !canEditAdmission}
                                                    className="w-5 h-5 rounded border-gray-300 text-[#376e35] focus:ring-[#376e35] cursor-pointer"
                                                  />
                                                </label>
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!isArchiveMode && (
                      <div className="pt-8 flex justify-end">
                        <button
                          onClick={handleInitiateSaveAdmission}
                          disabled={isLoading || !canEditAdmission}
                          className={`flex items-center gap-2 font-bold py-3 px-8 rounded-lg shadow-md transition-transform ${(isLoading || !canEditAdmission) ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-80' : 'bg-[#376e35] hover:bg-[#376e35] text-white active:scale-95'
                            }`}
                        >
                          <Save size={20} /> Save Admission Settings
                        </button>
                      </div>
                    )}
                  </div>

                  {/* BOTTOM ROW: SYSTEM PROFILE */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 lg:p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl lg:text-2xl font-bold text-black flex items-center gap-3">
                        <UserCog className="text-[#376e35]" size={28} /> System Profile
                      </h2>
                      {!isArchiveMode && (
                        <button
                          onClick={() => setIsEditingProfile(!isEditingProfile)}
                          disabled={!canEditProfile}
                          className={`flex items-center gap-2 font-bold py-2 px-5 text-[12px] rounded shadow transition-colors ${!canEditProfile ? "bg-gray-300 text-gray-500 cursor-not-allowed" :
                            isEditingProfile ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-[#376e35] hover:bg-[#376e35] text-white"
                            }`}
                        >
                          {isEditingProfile ? "Cancel Editing" : <><Edit3 size={14} /> Edit Profile</>}
                        </button>
                      )}
                    </div>
                    <hr className="border-gray-300 mb-8" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <InputGroup label="System Name">
                        <input
                          type="text"
                          name="systemName"
                          value={settings.systemName || ""}
                          onChange={handleChange}
                          disabled={!isEditingProfile || isArchiveMode || !canEditProfile}
                          className={`w-full border rounded-lg px-4 py-3 outline-none ${isEditingProfile && !isArchiveMode && canEditProfile ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
                        />
                      </InputGroup>

                      <InputGroup label="School Name">
                        <input
                          type="text"
                          name="schoolName"
                          value={settings.schoolName || ""}
                          onChange={handleChange}
                          disabled={!isEditingProfile || isArchiveMode || !canEditProfile}
                          className={`w-full border rounded-lg px-4 py-3 outline-none ${isEditingProfile && !isArchiveMode && canEditProfile ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
                        />
                      </InputGroup>

                      <InputGroup label="Email Address">
                        <input
                          type="text"
                          name="email"
                          value={systemAdminEmail || ""}
                          readOnly
                          disabled={true}
                          className="w-full border rounded-lg px-4 py-3 outline-none border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                          title="Fetched automatically from your administrator account"
                        />
                      </InputGroup>

                    </div>

                    {!isArchiveMode && (
                      <div className="pt-8 flex justify-end">
                        <button
                          onClick={handleSaveSystemProfile}
                          disabled={isLoading || !isEditingProfile || !canEditProfile}
                          className={`flex items-center gap-2 font-bold py-3 px-8 rounded-lg shadow-md active:scale-95 transition-transform ${isLoading || !isEditingProfile || !canEditProfile ? "bg-gray-400 text-gray-200 cursor-not-allowed opacity-80" : "bg-[#376e35] hover:bg-[#376e35] text-white"
                            }`}
                        >
                          <Save size={20} /> Save System Profile
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* === STANDARD ADMIN VIEW: INSTITUTE PROFILE & COURSES === */
                <div className="space-y-8">
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 lg:p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl lg:text-2xl font-bold text-black flex items-center gap-3">
                        <BookOpen className="text-[#376e35]" size={28} /> Institute Profile
                      </h2>
                      {!isArchiveMode && (
                        <button
                          onClick={() => setIsEditingProfile(!isEditingProfile)}
                          className={`flex items-center gap-2 font-bold py-2 px-5 text-[12px] rounded shadow transition-colors ${isEditingProfile ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-[#376e35] hover:bg-[#376e35] text-white"
                            }`}
                        >
                          {isEditingProfile ? "Cancel Editing" : <><Edit3 size={14} /> Edit Profile</>}
                        </button>
                      )}
                    </div>
                    <hr className="border-gray-300 mb-8" />

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <InputGroup label="Institute Name">
                        <input
                          type="text"
                          name="instituteName"
                          value={myInstitute.name || ""}
                          onChange={(e) => setMyInstitute({ ...myInstitute, name: e.target.value })}
                          disabled={!isEditingProfile || isArchiveMode}
                          className={`w-full border rounded-lg px-4 py-3 outline-none uppercase ${isEditingProfile && !isArchiveMode ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
                        />
                      </InputGroup>



                      <InputGroup label="Daily Applicant Limit">
                        <input
                          type="number"
                          min="0"
                          value={myInstitute.dailyLimit || ""}
                          onChange={(e) => setMyInstitute({ ...myInstitute, dailyLimit: parseInt(e.target.value) || "" })}
                          disabled={!isEditingProfile || isArchiveMode}
                          className={`w-full border rounded-lg px-4 py-3 outline-none uppercase ${isEditingProfile && !isArchiveMode ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
                        />
                      </InputGroup>

                      <div className="lg:col-span-2">
                        <InputGroup label="Institute Location">
                          <textarea
                            name="instituteAddress"
                            value={myInstitute.address || ""}
                            onChange={(e) => setMyInstitute({ ...myInstitute, address: e.target.value })}
                            disabled={!isEditingProfile || isArchiveMode}
                            rows={2}
                            className={`w-full border rounded-lg px-4 py-3 outline-none resize-none uppercase ${isEditingProfile && !isArchiveMode ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                              }`}
                          />
                        </InputGroup>
                      </div>
                    </div>

                    {!isArchiveMode && (
                      <div className="pt-8 flex justify-end">
                        <button
                          onClick={handleSaveMyInstitute}
                          disabled={isLoading || !isEditingProfile}
                          className={`flex items-center gap-2 font-bold py-3 px-8 rounded-lg shadow-md active:scale-95 transition-transform ${isLoading || !isEditingProfile ? "bg-gray-400 text-gray-200 cursor-not-allowed opacity-80" : "bg-[#376e35] hover:bg-[#376e35] text-white"
                            }`}
                        >
                          <Save size={20} /> Save Institute Profile
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* === MANAGE ADMINS === */}
          {activeTab === "admin" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-black mb-1 flex items-center gap-2">
                  <UserPlus className="text-[#376e35]" size={24} /> Manage Administrators
                </h2>
                <hr className="border-gray-300 mb-6 mt-2" />

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

                  {/* LEFT COLUMN: CREATE ADMIN ACCOUNT */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 xl:col-span-4">
                    <h3 className="text-[16px] font-bold text-black mb-1 flex items-center gap-2">
                      Create Admin Account
                    </h3>

                    <form onSubmit={handleCreateAdmin} className="space-y-4">

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Admin Role</label>
                        <select
                          value={adminRole}
                          onChange={(e) => {
                            setAdminRole(e.target.value);
                            if (e.target.value === "SuperAdmin") setAdminInstitute("Admission");
                          }}
                          disabled={isArchiveMode || !canManageAdmins}
                          className={`w-full border rounded-md px-[14px] py-[8px] text-[12px] focus:outline-none transition-all font-medium ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 text-gray-700 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                        >
                          <option value="Admin">Standard Admin</option>
                          <option value="SuperAdmin">Super Admin</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Institute</label>
                        <select
                          value={adminRole === "SuperAdmin" ? "Admission" : adminInstitute}
                          onChange={(e) => setAdminInstitute(e.target.value)}
                          disabled={adminRole === "SuperAdmin" || isArchiveMode || !canManageAdmins}
                          className={`w-full border rounded-md px-[14px] py-[8px] text-[12px] focus:outline-none transition-all font-medium ${adminRole === "SuperAdmin" || isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 text-gray-700 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                        >
                          <option value="" disabled>Select Institute</option>
                          {adminRole === "SuperAdmin" && (
                            <option value="Admission">Admission (Super Admin)</option>
                          )}
                          {institutes.map(inst => (
                            <option key={inst._id} value={inst.abbreviation}>{inst.abbreviation} - {inst.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Username</label>
                        <input
                          type="text"
                          value={adminUsername}
                          onChange={(e) => setAdminUsername(e.target.value)}
                          required
                          disabled={isArchiveMode || !canManageAdmins}
                          className={`w-full border rounded-md px-[14px] py-[8px] text-[12px] focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Email Address</label>
                        <input
                          type="email"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          required
                          disabled={isArchiveMode || !canManageAdmins}
                          className={`w-full border rounded-md px-[14px] py-[8px] text-[12px] focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Temporary Password</label>
                        <div className="relative">
                          <input
                            type={showAdminPassword ? "text" : "password"}
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            required
                            disabled={isArchiveMode || !canManageAdmins}
                            className={`w-full border rounded-md px-[14px] py-[8px] pr-10 text-[12px] focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                          />
                          <button
                            type="button"
                            onClick={() => (!isArchiveMode && canManageAdmins) && setShowAdminPassword(!showAdminPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#376e35] transition-colors"
                          >
                            {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Confirm Password</label>
                        <div className="relative">
                          <input
                            type={showAdminConfirmPassword ? "text" : "password"}
                            value={adminConfirmPassword}
                            onChange={(e) => setAdminConfirmPassword(e.target.value)}
                            required
                            disabled={isArchiveMode || !canManageAdmins}
                            className={`w-full border rounded-md px-[14px] py-[8px] pr-10 text-[12px] focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                          />
                          <button
                            type="button"
                            onClick={() => (!isArchiveMode && canManageAdmins) && setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#376e35] transition-colors"
                          >
                            {showAdminConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      {!isArchiveMode && (
                        <div className="pt-4 flex justify-center">
                          <button
                            type="submit"
                            disabled={isLoading || !canManageAdmins}
                            className={`w-full py-3 rounded-xl font-bold text-[12px] shadow-md uppercase tracking-wider transition-colors ${isLoading || !canManageAdmins ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-80' : 'bg-[#376e35] text-white hover:bg-green-800'
                              }`}
                          >
                            {isLoading ? "Creating..." : "Create Account"}
                          </button>
                        </div>
                      )}
                    </form>
                  </div>

                  {/* RIGHT COLUMN: ADMIN ACCOUNTS TABLE */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 flex flex-col h-full xl:col-span-8">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="font-bold text-[16px] text-black flex items-center gap-2">
                          <UserCog className="text-[#376e35]" size={20} /> Admin Accounts
                        </h3>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-gray-100 rounded-xl flex-1 min-h-[300px]">
                      <table className="w-full text-left border-collapse text-[12px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-gray-50 text-gray-600 text-[11px] uppercase">
                            <th className="px-4 py-2.5 font-bold border-b border-gray-200">Username</th>
                            <th className="px-4 py-2.5 font-bold border-b border-gray-200">Email</th>
                            <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">Institute</th>
                            <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">Role</th>
                            <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center w-[100px]">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {adminList.length > 0 ? adminList.map(admin => (
                            <tr key={admin._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                              <td className="px-4 py-2.5 font-medium text-gray-800">{admin.username || "N/A"}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-800">{admin.email}</td>
                              <td className="px-4 py-2.5 font-medium text-gray-800 text-center">
                                {admin.institute || "N/A"}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-gray-800 text-center">
                                {admin.role === "SuperAdmin" ? "Super Admin" : "Admin"}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                <div className="flex justify-center gap-3">
                                  <button
                                    onClick={() => setEditAdminModal({ isOpen: true, admin })}
                                    className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-all shadow-sm"
                                    title="Edit"
                                  >
                                    <Edit3 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAdmin(admin._id)}
                                    className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all shadow-sm"
                                    title="Delete"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="4" className="p-8 text-center text-gray-400 italic">No admins found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}

          {/* === INSTITUTES & PROGRAMS SETTINGS === */}
          {activeTab === "institutes_programs" && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 lg:p-10 shadow-sm animate-fade-in relative z-0">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl lg:text-2xl font-bold text-black flex items-center gap-3">
                    <BookOpen className="text-[#376e35]" size={28} /> Institutes & Programs
                  </h2>
                  <select
                    value={filterInstitute}
                    onChange={(e) => setFilterInstitute(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:border-[#376e35] text-gray-700 bg-gray-50"
                  >
                    <option value="All">All Institutes</option>
                    {institutes.map(inst => (
                      <option key={inst._id} value={inst.abbreviation}>{inst.abbreviation}</option>
                    ))}
                  </select>
                </div>
                {!isArchiveMode && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInstituteModal({ isOpen: true, data: { abbreviation: "", name: "", address: "", dailyLimit: 30 }, isEdit: false })}
                      className="flex items-center gap-2 font-bold py-2 px-4 text-[12px] rounded shadow transition-colors bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      <Plus size={14} /> Add Institute
                    </button>
                    <button
                      onClick={() => setCourseModal({ isOpen: true, data: { name: "", abbreviation: "", institute: "", limit: 0, applicationLimit: 0, hasBoardExam: false }, isEdit: false })}
                      className="flex items-center gap-2 font-bold py-2 px-4 text-[12px] rounded shadow transition-colors bg-[#376e35] text-white hover:bg-green-800"
                    >
                      <Plus size={14} /> Add Program
                    </button>
                  </div>
                )}
              </div>
              <hr className="border-gray-300 mb-8" />

              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 text-gray-600 text-[11px] uppercase">
                      <th className="px-4 py-2.5 font-bold border-b border-gray-200">Institute</th>
                      <th className="px-4 py-2.5 font-bold border-b border-gray-200">Program Name</th>
                      <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">Abbr.</th>
                      <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">App. Limit</th>
                      <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">Capacity</th>
                      <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center w-[100px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {(filterInstitute === "All" ? courses : courses.filter(c => c.institute === filterInstitute)).length > 0 ? (
                      (filterInstitute === "All" ? courses : courses.filter(c => c.institute === filterInstitute)).map(c => (
                        <tr key={c._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                          <td className="px-4 py-2.5 font-medium text-gray-800 uppercase">
                            {c.institute || "N/A"}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-800 uppercase">
                            {c.name}
                            {c.hasBoardExam && <span className="ml-2 px-1.5 py-0.5 text-[9px] font-bold text-white bg-blue-500 rounded-md">BOARD</span>}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-800 text-center">{c.abbreviation}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-800 text-center">
                            {c.applicationLimit && c.applicationLimit > 0 ? c.applicationLimit : "∞"}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-800 text-center">
                            <span className={c.seated >= c.limit && c.limit > 0 ? "text-red-500 font-bold" : "text-gray-700"}>
                              {c.seated || 0}
                            </span> / {c.limit && c.limit > 0 ? c.limit : "∞"}
                          </td>
                          <td className="px-4 py-2.5 text-center flex justify-center gap-2">
                            <button onClick={() => { fetchInstitutes(); setCourseModal({ isOpen: true, data: c, isEdit: true }); }} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg transition-all shadow-sm" title="Edit Program">
                              <Edit3 size={14} />
                            </button>
                            <button onClick={() => handleDeleteCourse(c._id, c.name)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-all shadow-sm" title="Delete Program">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-gray-400 italic">No programs configured.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}


          {/* === SECURITY & LOGS === */}
          {activeTab === "security" && (
            <div className="space-y-8 animate-fade-in">
              {currentUserRole === "SuperAdmin" && (
                <div>
                  <h2 className="text-xl font-bold text-black mb-1 flex items-center gap-2">
                    <Shield className="text-[#376e35]" size={24} /> Security Settings
                  </h2>
                  <hr className="border-gray-300 mb-6 mt-2" />
                  <div className="flex justify-between items-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <div>
                      <h3 className="font-bold text-[16px] text-gray-800">Two-Factor Authentication (2FA)</h3>

                      <p className="text-[12px] text-gray-600 mt-1">Require verification code for Admin login.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold ${securitySettings.twoFactorAuth ? "text-[#376e35]" : "text-gray-500"}`}>{securitySettings.twoFactorAuth ? "ENABLED" : "DISABLED"}</span>
                      <ToggleSwitch disabled={isArchiveMode} checked={securitySettings.twoFactorAuth} onChange={handleToggle2FA} />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-1">
                  <h2 className="text-xl font-bold text-black flex items-center gap-2">
                    <Activity className="text-[#376e35]" size={24} /> Activity Logs
                  </h2>
                  {activityLogs.length > 0 && !isArchiveMode && canManageAdmins && (
                    <button
                      onClick={handleClearLogs}
                      className="text-red-500 hover:text-red-700 text-[12px] font-bold flex items-center gap-1 hover:bg-red-50 px-3 py-1 rounded transition-colors"
                    >
                      <Trash2 size={14} /> Clear All
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-[500px] overflow-y-auto mt-4">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 text-gray-600 text-[11px] uppercase">
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200">Username</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">Role</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200">Action</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center">Date & Time</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center w-[100px]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {activityLogs.length > 0 ? (
                        activityLogs.map((log) => (
                          <tr key={log._id || log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                            <td className="px-4 py-2.5 font-medium text-gray-800 flex items-center gap-2">
                              <div className="bg-gray-200 p-1.5 rounded-full"><User size={14} /></div>
                              {log.user || "System"}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-800 text-center">
                              {(() => {
                                const roleStr = (log.role || "").toLowerCase().replace(/\s/g, '');
                                if (roleStr === "superadmin") return "Super Admin";
                                if (roleStr === "admin") return "Admin";
                                return log.role || "System";
                              })()}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{log.action}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-800 text-center">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${log.status === 'Success' ? 'bg-green-100 text-[#376e35]' : 'bg-red-100 text-red-700'}`}>
                                {log.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="p-8 text-center text-gray-400 italic">
                            No activity logs found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* === SYSTEM MAINTENANCE === */}
          {activeTab === "maintenance" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-black mb-1 flex items-center gap-2">
                  <Wrench className="text-[#376e35]" size={24} />System Maintenance</h2>
                <hr className="border-gray-300 my-4" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Archived Data */}
                  <div className={`border border-green-200 rounded-xl p-6 relative overflow-hidden group ${isArchiveMode || !canEditMaintenance ? 'bg-gray-50 opacity-60 pointer-events-none' : 'bg-white hover:shadow-lg transition-shadow'}`}>
                    <div className="w-12 h-12 bg-green-50  rounded-full flex items-center justify-center mb-4 text-[#376e35] z-10 relative"><Database size={24} /></div>
                    <h3 className="font-bold text-[16px] text-[#376e35] mb-2 relative z-10">Archive Data</h3>
                    <p className="text-[12px] text-gray-600 mb-4 relative z-10">Select an Academic Year & Semester to switch to past records.</p>

                    <div className="relative z-10 space-y-3">
                      <div className="relative">
                        <select
                          value={targetYear}
                          onChange={(e) => setTargetYear(e.target.value)}
                          disabled={isArchiveMode || pastAcademicYears.length === 0 || !canEditMaintenance}
                          className={`w-full appearance-none border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 font-medium cursor-pointer ${isArchiveMode || pastAcademicYears.length === 0 || !canEditMaintenance ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-80' : 'bg-green-50 border-green-300 text-gray-800'}`}
                        >
                          <option value="">{pastAcademicYears.length === 0 ? "No Archives Available" : "Select Academic Year & Semester"}</option>
                          {pastAcademicYears.map((year) => <option key={year} value={year}>{year}</option>)}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#376e35]">
                          <ChevronRight className="rotate-90" size={20} />
                        </div>
                      </div>

                      <button
                        onClick={handleInitiateDataSwitch}
                        disabled={isArchiveMode || pastAcademicYears.length === 0 || !targetYear || !canEditMaintenance}
                        className={`w-full flex items-center justify-center gap-2 py-3 transition-colors font-bold rounded-lg shadow-sm ${(pastAcademicYears.length === 0 || !targetYear || !canEditMaintenance) ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-80' : 'bg-[#376e35] hover:bg-[#376e35] text-white'}`}
                      >
                        <RefreshCw size={18} /> Archive Data
                      </button>
                    </div>
                  </div>

                  {/* Pre-Admission Reset Card */}
                  <div className={`border border-red-200 rounded-xl p-6 relative overflow-hidden ${isArchiveMode || !canEditMaintenance ? 'bg-gray-50 opacity-60 pointer-events-none' : 'bg-red-50 hover:shadow-lg transition-shadow'}`}>
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600"><Archive size={24} /></div>
                    <h3 className="font-bold text-[16px] text-red-800 mb-2">Pre-Admission Reset</h3>
                    <p className="text-[12px] text-red-700/80 mb-6 h-[36px]">All data will be archived in the database and active records will be wiped out/removed.</p>

                    <button
                      onClick={handleInitiateReset}
                      disabled={isArchiveMode || !canEditMaintenance}
                      className={`w-full flex items-center justify-center gap-2 py-4 font-bold rounded-lg shadow-sm transition-colors ${isArchiveMode || !canEditMaintenance ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-80' : 'bg-red-600 hover:bg-red-700 text-white active:scale-[0.98]'
                        }`}
                    >
                      <Trash2 size={20} /> Reset System
                    </button>
                  </div>

                  {/* Download Backup Card */}
                  <div className="border border-blue-200 rounded-xl p-6 relative overflow-hidden bg-blue-50 hover:shadow-lg transition-shadow">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 text-blue-600"><Database size={24} /></div>
                    <h3 className="font-bold text-[16px] text-blue-800 mb-2">Download Backup</h3>
                    <p className="text-[12px] text-blue-700/80 mb-6">Export all applicant records, settings, and audit logs as a JSON backup file.</p>

                    <a
                      href={`${BASE_URL}/api/admin/backup`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-4 font-bold rounded-lg shadow-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors active:scale-[0.98] text-[14px]"
                    >
                      <Database size={20} /> Download Backup
                    </a>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* === CONTENT MANAGEMENT === */}
          {activeTab === "content" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-xl font-bold text-black flex items-center gap-2">
                    <Layout className="text-[#376e35]" size={24} /> Content Management
                  </h2>
                  <p className="text-[13px] text-gray-500 mt-1">Edit the content displayed on the Applicant Portal.</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      const fullSettings = { ...settings, portalSettings: settings.portalSettings };
                      await api.put('/admin/settings', fullSettings);
                      toast.info("Portal content saved successfully!");
                    } catch (err) {
                      toast.error("Failed to save portal content.");
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isArchiveMode || isLoading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#376e35] hover:bg-[#2c582a] text-white font-bold text-[13px] rounded-lg shadow transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Save size={16} /> {isLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <hr className="border-gray-200" />

              {/* Portal Name & Background */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Portal Header Name</label>
                  <input
                    type="text"
                    disabled={isArchiveMode}
                    value={settings.portalSettings?.portalName || ""}
                    onChange={(e) => handlePortalContentChange("portalName", e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-[14px] text-gray-800 focus:ring-2 focus:ring-[#376e35]/30 focus:border-[#376e35] outline-none transition"
                    placeholder="e.g. Baliwag Polytechnic College ADMISSION"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Background Image</label>
                  <div className="flex items-center gap-3">
                    {settings.portalSettings?.backgroundUrl && (
                      <img src={settings.portalSettings.backgroundUrl.startsWith('http') ? settings.portalSettings.backgroundUrl : `${BASE_URL}${settings.portalSettings.backgroundUrl}`} alt="BG" className="w-14 h-14 object-cover rounded border" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isArchiveMode}
                      onChange={handleBackgroundUpload}
                      className="text-[13px] file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-bold file:bg-[#376e35] file:text-white hover:file:bg-[#2c582a] file:cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Documentary Requirements */}
              <div>
                <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Documentary Requirements</label>
                <ReactQuill
                  theme="snow"
                  value={settings.portalSettings?.documentaryRequirements || ""}
                  onChange={(val) => handlePortalContentChange("documentaryRequirements", val)}
                  readOnly={isArchiveMode}
                  className="bg-white rounded-lg"
                  style={{ minHeight: "200px" }}
                />
              </div>

              {/* Grade Requirements */}
              <div>
                <label className="block text-[13px] font-bold text-gray-700 mb-1">Grade Requirements</label>
                <ReactQuill
                  theme="snow"
                  value={settings.portalSettings?.gradeRequirements || ""}
                  onChange={(val) => handlePortalContentChange("gradeRequirements", val)}
                  readOnly={isArchiveMode}
                  className="bg-white rounded-lg"
                  style={{ minHeight: "150px" }}
                />
              </div>

              {/* Application Guidelines */}
              <div>
                <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Application Guidelines</label>
                <ReactQuill
                  theme="snow"
                  value={settings.portalSettings?.applicationGuidelines || ""}
                  onChange={(val) => handlePortalContentChange("applicationGuidelines", val)}
                  readOnly={isArchiveMode}
                  className="bg-white rounded-lg"
                  style={{ minHeight: "200px" }}
                />
              </div>

              {/* Applicant Requirements */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-[13px] font-bold text-gray-700">Applicant Requirements</label>
                  {!isArchiveMode && (
                    <button
                      onClick={() => setReqModal({ isOpen: true, data: { documentName: "", targetApplicant: [], isRequired: true, condition: "" }, isEdit: false, editIndex: -1 })}
                      className="flex items-center gap-1.5 font-bold py-1.5 px-3 text-[12px] rounded border bg-[#376e35] text-white hover:bg-green-800 transition-colors"
                    >
                      <Plus size={14} /> Add Document
                    </button>
                  )}
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden" style={{ minHeight: "300px", maxHeight: "450px", overflowY: "auto" }}>
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 text-gray-600 text-[11px] uppercase">
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200">Document Name</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200">Target Applicant</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200">Initial Submission</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center w-[100px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {settings.portalSettings?.applicantRequirements && settings.portalSettings.applicantRequirements.length > 0 ? (
                        settings.portalSettings.applicantRequirements.map((req, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                            <td className="px-4 py-2.5 font-medium text-gray-800">
                              {req.documentName}
                              {req.condition && (
                                <span className="ml-2 text-[10px] bg-gray-50 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                  {req.condition}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600">{req.targetApplicant?.join(", ") || "All"}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[11px] font-semibold text-gray-600`}>
                                {req.isRequired ? "Required" : "Optional"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {!isArchiveMode && (
                                <div className="flex justify-center gap-2">
                                  <button onClick={() => setReqModal({ isOpen: true, data: { ...req }, isEdit: true, editIndex: index })} className="text-blue-500 hover:text-blue-700" title="Edit">
                                    <Edit3 size={14} />
                                  </button>
                                  <button onClick={() => {
                                    setConfirmActionModal({
                                      isOpen: true,
                                      message: `Are you sure you want to delete "${req.documentName}"?`,
                                      onConfirm: async () => {
                                        const newReqs = [...settings.portalSettings.applicantRequirements];
                                        newReqs.splice(index, 1);
                                        handlePortalContentChange("applicantRequirements", newReqs);
                                        try {
                                          const fullSettings = { ...settings, portalSettings: { ...settings.portalSettings, applicantRequirements: newReqs } };
                                          await api.put('/admin/settings', fullSettings);
                                          toast.info("Requirement deleted and saved successfully.");
                                        } catch (err) {
                                          toast.error("Failed to save changes.");
                                        }
                                      }
                                    });
                                  }} className="text-red-500 hover:text-red-700" title="Delete">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="px-4 py-6 text-center text-gray-400 text-[12px]">No applicant requirements added.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Blocked Dates */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-[13px] font-bold text-gray-700">Blocked Dates in Schedule</label>
                  {!isArchiveMode && (
                    <button
                      onClick={() => {
                        setNewBlockedDate("");
                        setIsBlockedDateModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 font-bold py-1.5 px-3 text-[12px] rounded border bg-[#376e35] text-white hover:bg-green-800 transition-colors shadow-sm"
                    >
                      <Plus size={14} /> Add Date
                    </button>
                  )}
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-gray-50 text-gray-600 text-[11px] uppercase">
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200">Date</th>
                        <th className="px-4 py-2.5 font-bold border-b border-gray-200 text-center w-[100px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {settings.portalSettings?.blockedDates && settings.portalSettings.blockedDates.length > 0 ? (
                        settings.portalSettings.blockedDates.map((date, index) => (
                          <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                            <td className="px-4 py-2.5 font-medium text-gray-800">
                              {new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {!isArchiveMode && (
                                <button
                                  onClick={async () => {
                                    const newBlocked = settings.portalSettings.blockedDates.filter((_, i) => i !== index);
                                    handlePortalContentChange("blockedDates", newBlocked);
                                    try {
                                      setIsLoading(true);
                                      const updatedSettings = { ...settings, portalSettings: { ...settings.portalSettings, blockedDates: newBlocked } };
                                      await api.put('/admin/settings', formatPayloadSettings(updatedSettings));
                                      toast.info("Blocked date removed!");
                                    } catch (err) {
                                      toast.error("Failed to update blocked dates.");
                                    } finally {
                                      setIsLoading(false);
                                    }
                                  }}
                                  className="text-red-500 hover:text-red-700 transition-colors p-1"
                                  title="Remove Date"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="2" className="px-4 py-6 text-center text-gray-400 text-[12px]">No blocked dates added.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pre-Admission Scoring Criteria */}
              <div className="mt-8 border border-[#376e35]/20 rounded-xl p-6 bg-green-50/30">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <h3 className="font-bold text-[15px] text-gray-800 flex items-center gap-2">
                      <Activity size={18} className="text-[#376e35]" /> Pre-Admission Scoring Criteria
                    </h3>
                    <p className="text-[12px] text-gray-500 mt-0.5">Set the weight (%) of each factor in the final admission score. Total must equal 100%.</p>
                  </div>
                  <button
                    disabled={isArchiveMode || isSavingWeights}
                    onClick={async () => {
                      const total = Object.values(criteriaWeights).reduce((a, b) => a + Number(b), 0);
                      if (total !== 100) {
                        toast.warning(`Total weight must be 100%. Current total: ${total}%`);
                        return;
                      }
                      try {
                        setIsSavingWeights(true);
                        const fullSettings = { ...settings, criteriaWeights };
                        await api.put('/admin/settings', fullSettings);
                        toast.info("Scoring criteria saved successfully!");
                        logAction("Updated Pre-Admission Scoring Criteria");
                      } catch { toast.error("Failed to save criteria weights."); }
                      finally { setIsSavingWeights(false); }
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-[#376e35] hover:bg-[#2c582a] text-white font-bold text-[12px] rounded-lg shadow transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Save size={14} /> {isSavingWeights ? "Saving..." : "Save Weights"}
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                  {[
                    { key: "bcet", label: "BCET / Entrance Exam", color: "blue" },
                    { key: "gwa", label: "GWA", color: "green" },
                    { key: "interview", label: "Interview", color: "purple" },
                    { key: "dei", label: "DEI Bonus", color: "orange" },
                  ].map(({ key, label, color }) => (
                    <div key={key} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex flex-col gap-2">
                      <div>
                        <p className="font-bold text-[13px] text-gray-800 text-center">{label}</p>
                      </div>
                      <div className="flex items-center gap-1 mt-auto">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={isArchiveMode}
                          value={criteriaWeights[key]}
                          onChange={(e) => setCriteriaWeights(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center font-bold text-[16px] text-gray-800 focus:outline-none focus:border-[#376e35]"
                        />
                        <span className="font-bold text-gray-500 text-[16px]">%</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Total */}
                {(() => {
                  const total = Object.values(criteriaWeights).reduce((a, b) => a + Number(b), 0);
                  return (
                    <div className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold ${total === 100 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      {total === 100 ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                      Total: {total}% {total !== 100 ? `— needs to be 100% (${total > 100 ? "over" : "under"} by ${Math.abs(100 - total)}%)` : "— Ready to save"}
                    </div>
                  );
                })()}
              </div>

            </div>
          )}

        </div>
      </main>

      {/* --- CUSTOM CONFIRMATION MODAL --- */}
      {confirmActionModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="bg-[#376e35] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Confirm Action</h3>
              <button onClick={() => setConfirmActionModal({ isOpen: false, message: "", onConfirm: null })} className="text-white/80 hover:text-white transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-[14px] leading-relaxed">{confirmActionModal.message}</p>
            </div>
            <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmActionModal({ isOpen: false, message: "", onConfirm: null })}
                className="px-6 py-2 rounded bg-gray-500 hover:bg-gray-600 font-bold uppercase text-[12px] text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmActionModal.onConfirm) confirmActionModal.onConfirm();
                  setConfirmActionModal({ isOpen: false, message: "", onConfirm: null });
                }}
                className="px-8 py-2 rounded bg-[#376e35] hover:bg-[#2e5c2c] font-bold uppercase text-[12px] text-white transition shadow"
              >
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD BLOCKED DATE MODAL --- */}
      {isBlockedDateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-md w-full max-w-sm shadow-xl animate-fade-in-up">
            <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-[15px]">Add Blocked Date</h3>
              <button onClick={() => setIsBlockedDateModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-gray-500 text-[12px]">Select a date to block from the applicant's scheduling calendar.</p>
              <CustomDatePicker
                value={newBlockedDate}
                onChange={(val) => setNewBlockedDate(val)}
                placeholder="Select a date"
              />
            </div>
            <div className="p-4 flex justify-end gap-2 border-t border-gray-100">
              <button
                onClick={() => setIsBlockedDateModalOpen(false)}
                className="px-4 py-1.5 rounded-md text-gray-600 hover:bg-gray-100 font-medium text-[12px] transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newBlockedDate) {
                    toast.warning("Please select a date first.");
                    return;
                  }
                  const currentBlocked = settings.portalSettings?.blockedDates || [];
                  if (!currentBlocked.includes(newBlockedDate)) {
                    const newBlocked = [...currentBlocked, newBlockedDate].sort();
                    handlePortalContentChange("blockedDates", newBlocked);
                    try {
                      setIsLoading(true);
                      const updatedSettings = { ...settings, portalSettings: { ...settings.portalSettings, blockedDates: newBlocked } };
                      await api.put('/admin/settings', formatPayloadSettings(updatedSettings));
                      toast.info("Blocked date saved successfully!");
                      setIsBlockedDateModalOpen(false);
                    } catch (err) {
                      toast.error("Failed to save blocked date.");
                      setIsLoading(false);
                    } finally {
                      setIsLoading(false);
                    }
                  } else {
                    toast.warning("This date is already blocked.");
                  }
                }}
                disabled={isLoading}
                className="px-5 py-1.5 rounded-md bg-[#376e35] hover:bg-[#2e5c2c] font-medium text-[12px] text-white transition shadow-sm disabled:opacity-50"
              >
                {isLoading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ADD/EDIT REQUIREMENT MODAL --- */}
      {reqModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-[14px] text-gray-800">
                {reqModal.isEdit ? "Edit Requirement" : "Add Requirement"}
              </h3>
              <button onClick={() => setReqModal({ ...reqModal, isOpen: false })} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">Document Name</label>
                <input
                  type="text"
                  value={reqModal.data.documentName}
                  onChange={(e) => setReqModal({ ...reqModal, data: { ...reqModal.data, documentName: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-[13px] focus:border-[#376e35] outline-none"
                  placeholder="e.g. PSA Birth Certificate"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">Target Applicant</label>
                <div className="flex flex-col gap-1.5">
                  {availableApplicantTypes.map(type => (
                    <label key={type} className="flex items-center gap-2 text-[13px] text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reqModal.data.targetApplicant.includes(type)}
                        onChange={(e) => {
                          const currentTypes = [...reqModal.data.targetApplicant];
                          if (e.target.checked) {
                            currentTypes.push(type);
                          } else {
                            const idx = currentTypes.indexOf(type);
                            if (idx > -1) currentTypes.splice(idx, 1);
                          }
                          setReqModal({ ...reqModal, data: { ...reqModal.data, targetApplicant: currentTypes } });
                        }}
                        className="rounded"
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">Initial Submission</label>
                <select
                  value={reqModal.data.isRequired ? "true" : "false"}
                  onChange={(e) => setReqModal({ ...reqModal, data: { ...reqModal.data, isRequired: e.target.value === "true" } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-[13px] focus:border-[#376e35] outline-none"
                >
                  <option value="true">Required</option>
                  <option value="false">Optional</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">Condition (Optional)</label>
                <select
                  value={reqModal.data.condition || ""}
                  onChange={(e) => setReqModal({ ...reqModal, data: { ...reqModal.data, condition: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-[13px] focus:border-[#376e35] outline-none"
                >
                  <option value="">None (Applies to all target applicants)</option>
                  <option value="disability">Has Disability</option>
                  <option value="indigenous">Is Indigenous</option>
                  <option value="soloParent">Is Solo Parent</option>
                  <option value="fourPs">Is 4Ps Beneficiary</option>
                  <option value="ofw">Is OFW</option>
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setReqModal({ ...reqModal, isOpen: false })}
                className="px-4 py-1.5 rounded text-[12px] font-semibold text-gray-600 border border-gray-300 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!reqModal.data.documentName.trim()) {
                    toast.info("Document Name is required.");
                    return;
                  }
                  if (reqModal.data.targetApplicant.length === 0) {
                    toast.info("Please select at least one target applicant.");
                    return;
                  }
                  const currentReqs = [...(settings.portalSettings?.applicantRequirements || [])];
                  if (reqModal.isEdit) {
                    currentReqs[reqModal.editIndex] = reqModal.data;
                  } else {
                    currentReqs.push(reqModal.data);
                  }
                  handlePortalContentChange("applicantRequirements", currentReqs);

                  try {
                    const fullSettings = { ...settings, portalSettings: { ...settings.portalSettings, applicantRequirements: currentReqs } };
                    await api.put('/admin/settings', fullSettings);
                    toast.info("Requirement saved successfully!");
                  } catch (err) {
                    toast.error("Failed to save requirement.");
                  }

                  setReqModal({ ...reqModal, isOpen: false });
                }}
                className="px-4 py-1.5 rounded text-[12px] font-semibold bg-[#376e35] text-white hover:bg-[#2c582a] transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// === UTILITY COMPONENTS ===

function InputGroup({ label, icon, children }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 font-bold text-gray-800 text-[15px]">
        {icon} {label}
      </label>
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, color = "green", disabled = false }) {
  const bgColor = disabled ? 'bg-gray-200' : (checked
    ? (color === 'blue' ? 'bg-blue-600' : 'bg-[#376e35]')
    : 'bg-gray-300');

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onChange}
      className={`relative w-14 h-8 shrink-0 rounded-full focus:outline-none transition-colors ${bgColor} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  );
}

const CustomDateTimePicker = ({ value, onChange, disabled, placeholder = "Select Date & Time" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const parts = value.split('T')[0].split('-');
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  });
  const dateRef = useRef(null);

  const [time, setTime] = useState(() => {
    if (value && value.includes('T')) return value.split('T')[1].substring(0, 5);
    return "23:59";
  });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dateRef.current && !dateRef.current.contains(event.target)) {
        setIsOpen(false);
        setShowTimeMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (value) {
      const parts = value.split('T')[0].split('-');
      setViewDate(new Date(parts[0], parts[1] - 1, parts[2]));
      if (value.includes('T')) {
        setTime(value.split('T')[1].substring(0, 5));
      }
    }
  }, [value]);

  const handleDateClick = (day) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newDate < today) return;

    const pad = n => String(n).padStart(2, '0');
    const dateString = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;

    onChange(`${dateString}T${time}`);
    setIsOpen(false);
    setShowTimeMenu(false);
  };

  const [h24Str, mStr] = time.split(':');
  const h24 = parseInt(h24Str, 10);
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12Str = String(h24 % 12 || 12).padStart(2, '0');

  const handleTimeSelect = (type, val) => {
    let newH24 = h24;
    let newM = mStr;
    let newAmPm = ampm;

    if (type === 'hour') {
      const valNum = parseInt(val, 10);
      if (newAmPm === "PM" && valNum !== 12) newH24 = valNum + 12;
      else if (newAmPm === "AM" && valNum === 12) newH24 = 0;
      else newH24 = valNum;
    } else if (type === 'minute') {
      newM = val;
    } else if (type === 'ampm') {
      newAmPm = val;
      const currentH12 = h24 % 12 || 12;
      if (val === "PM" && currentH12 !== 12) newH24 = currentH12 + 12;
      else if (val === "AM" && currentH12 === 12) newH24 = 0;
      else if (val === "AM" && currentH12 !== 12) newH24 = currentH12;
    }

    const pad = n => String(n).padStart(2, '0');
    const newTime24 = `${pad(newH24)}:${newM}`;

    setTime(newTime24);
    if (value) {
      const datePart = value.split('T')[0];
      onChange(`${datePart}T${newTime24}`);
    }
  };

  useEffect(() => {
    if (showTimeMenu) {
      setTimeout(() => {
        document.getElementById(`menu-hour-${h12Str}`)?.scrollIntoView({ block: 'center' });
        document.getElementById(`menu-min-${mStr}`)?.scrollIntoView({ block: 'center' });
      }, 10);
    }
  }, [showTimeMenu, h12Str, mStr]);

  const changeMonth = (offset) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  const handleYearChange = (e) => {
    setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1));
  };

  const handleMonthChange = (e) => {
    setViewDate(new Date(viewDate.getFullYear(), parseInt(e.target.value), 1));
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear + i);

  const renderDays = () => {
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let selectedDateObj = null;
    if (value) {
      const parts = value.split('T')[0].split('-');
      selectedDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const thisDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), i);
      const isPast = thisDate < today;

      const isSelected = selectedDateObj && selectedDateObj.getDate() === i && selectedDateObj.getMonth() === viewDate.getMonth() && selectedDateObj.getFullYear() === viewDate.getFullYear();
      const isToday = new Date().getDate() === i && new Date().getMonth() === viewDate.getMonth() && new Date().getFullYear() === viewDate.getFullYear();

      days.push(
        <button
          key={i}
          type="button"
          onClick={(e) => { e.preventDefault(); if (!isPast) handleDateClick(i); }}
          disabled={isPast}
          className={`h-8 w-8 rounded-full flex items-center justify-center text-[12px] transition-colors
            ${isPast ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-green-100 text-gray-700'}
            ${isSelected ? 'bg-[#376e35] text-white font-bold hover:bg-green-800' : ''}
            ${isToday && !isSelected && !isPast ? 'border border-[#376e35] font-bold text-[#376e35]' : ''}
          `}
        >
          {i}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="relative w-full" ref={dateRef}>
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setShowTimeMenu(false);
          }
        }}
        className={`flex items-center justify-between w-full border rounded-lg px-2 py-1 h-[52px] transition-all ${disabled
          ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-80'
          : `bg-white border-black cursor-pointer ${isOpen ? 'ring-2 ring-[#376e35] border-transparent' : 'hover:border-[#376e35]'}`
          }`}
      >
        <span className={`text-md truncate pl-2 ${disabled ? "text-gray-500" : "text-black font-medium"}`}>
          {value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : placeholder}
        </span>
        <CalendarIcon size={14} className={disabled ? "text-gray-400" : "text-[#376e35]"} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-[340px] z-50 animate-in fade-in zoom-in duration-200">
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronLeft size={18} /></button>
            <div className="flex gap-1">
              <select
                value={viewDate.getMonth()}
                onChange={handleMonthChange}
                className="bg-transparent font-bold text-[12px] text-gray-800 outline-none cursor-pointer hover:text-[#376e35] transition-colors"
              >
                {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
              </select>
              <select
                value={viewDate.getFullYear()}
                onChange={handleYearChange}
                className="bg-transparent font-bold text-[12px] text-gray-800 outline-none cursor-pointer hover:text-[#376e35] transition-colors"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 place-items-center mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <span key={day} className="text-[10px] font-bold text-gray-400 uppercase">{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 place-items-center">
            {renderDays()}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between relative">
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Deadline Time</span>

            <button
              type="button"
              onClick={() => setShowTimeMenu(!showTimeMenu)}
              className="bg-gray-50 border border-green-300 text-[#376e35] text-[12px] rounded-lg outline-none px-3 py-2 font-bold shadow-sm hover:bg-green-100 transition-colors"
            >
              {h12Str}:{mStr} {ampm} <Clock size={12} className="inline ml-1 mb-0.5" />
            </button>

            {showTimeMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-xl p-2 flex gap-2 h-48 z-[60] animate-in fade-in zoom-in duration-100">

                {/* Hours Column */}
                <div className="overflow-y-auto w-12 flex flex-col gap-1 no-scrollbar">
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                    <div
                      key={h} id={`menu-hour-${h}`}
                      onClick={() => handleTimeSelect('hour', h)}
                      className={`cursor-pointer text-[12px] text-center py-1.5 rounded transition-colors ${h12Str === h ? 'bg-[#376e35] text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}`}
                    >
                      {h}
                    </div>
                  ))}
                </div>

                {/* Minutes Column */}
                <div className="overflow-y-auto w-12 flex flex-col gap-1 no-scrollbar">
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <div
                      key={m} id={`menu-min-${m}`}
                      onClick={() => handleTimeSelect('minute', m)}
                      className={`cursor-pointer text-[12px] text-center py-1.5 rounded transition-colors ${mStr === m ? 'bg-[#376e35] text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}`}
                    >
                      {m}
                    </div>
                  ))}
                </div>

                {/* AM/PM Column */}
                <div className="flex flex-col gap-1 w-12 border-l border-gray-100 pl-2">
                  {["AM", "PM"].map(period => (
                    <div
                      key={period}
                      onClick={() => handleTimeSelect('ampm', period)}
                      className={`cursor-pointer text-[12px] text-center py-1.5 rounded transition-colors ${ampm === period ? 'bg-[#376e35] text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}`}
                    >
                      {period}
                    </div>
                  ))}
                </div>

                <style>{`
                          .no-scrollbar::-webkit-scrollbar { display: none; }
                          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                      `}</style>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}

const CustomDatePicker = ({ value, onChange, disabled, placeholder = "Select Date" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const parts = value.split('-');
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  });
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
    if (value) {
      const parts = value.split('-');
      setViewDate(new Date(parts[0], parts[1] - 1, parts[2]));
    }
  }, [value]);

  const handleDateClick = (day) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newDate < today) return;

    const pad = n => String(n).padStart(2, '0');
    const dateString = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;

    onChange(dateString);
    setIsOpen(false);
  };

  const changeMonth = (offset) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  const handleYearChange = (e) => {
    setViewDate(new Date(parseInt(e.target.value), viewDate.getMonth(), 1));
  };

  const handleMonthChange = (e) => {
    setViewDate(new Date(viewDate.getFullYear(), parseInt(e.target.value), 1));
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear + i);

  const renderDays = () => {
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let selectedDateObj = null;
    if (value) {
      const parts = value.split('-');
      selectedDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const thisDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), i);
      const isPast = thisDate < today;

      const isSelected = selectedDateObj && selectedDateObj.getDate() === i && selectedDateObj.getMonth() === viewDate.getMonth() && selectedDateObj.getFullYear() === viewDate.getFullYear();
      const isToday = new Date().getDate() === i && new Date().getMonth() === viewDate.getMonth() && new Date().getFullYear() === viewDate.getFullYear();

      days.push(
        <button
          key={i}
          type="button"
          onClick={(e) => { e.preventDefault(); if (!isPast) handleDateClick(i); }}
          disabled={isPast}
          className={`h-8 w-8 rounded-full flex items-center justify-center text-[12px] transition-colors
            ${isPast ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-green-100 text-gray-700'}
            ${isSelected ? 'bg-[#376e35] text-white font-bold hover:bg-green-800' : ''}
            ${isToday && !isSelected && !isPast ? 'border border-[#376e35] font-bold text-[#376e35]' : ''}
          `}
        >
          {i}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="relative w-full" ref={dateRef}>
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
          }
        }}
        className={`flex items-center justify-between w-full border rounded-lg px-2 h-[34px] transition-all ${disabled
          ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-80'
          : `bg-white border-gray-300 cursor-pointer ${isOpen ? 'ring-1 ring-[#376e35] border-[#376e35]' : 'hover:border-[#376e35]'}`
          }`}
      >
        <span className={`text-[12px] truncate pl-1 ${disabled ? "text-gray-500" : (value ? "text-black font-medium" : "text-gray-400")}`}>
          {value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder}
        </span>
        <CalendarIcon size={14} className={disabled ? "text-gray-400" : "text-[#376e35]"} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute bottom-full mb-2 right-0 md:left-0 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-[280px] z-[70] animate-in fade-in zoom-in duration-200">
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronLeft size={18} /></button>
            <div className="flex gap-1">
              <select
                value={viewDate.getMonth()}
                onChange={handleMonthChange}
                className="bg-transparent font-bold text-[12px] text-gray-800 outline-none cursor-pointer hover:text-[#376e35] transition-colors"
              >
                {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
              </select>
              <select
                value={viewDate.getFullYear()}
                onChange={handleYearChange}
                className="bg-transparent font-bold text-[12px] text-gray-800 outline-none cursor-pointer hover:text-[#376e35] transition-colors"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 place-items-center mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <span key={day} className="text-[10px] font-bold text-gray-400 uppercase">{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 place-items-center">
            {renderDays()}
          </div>
        </div>
      )}
    </div>
  );
}
