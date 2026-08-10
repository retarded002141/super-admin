import { useState, useEffect, useRef } from "react";
import api from "../../services/api";
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save, Edit3, Shield, Activity, AlertTriangle, Trash2, Clock, User, CheckCircle, UserCog,
  Wrench, Bell, Archive, Database, RefreshCw, History, Eye, EyeOff, UserPlus, BookOpen, Plus, Landmark
} from "lucide-react";

export default function Settings({ navigateToTab }) {

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("adminSettingsTab") || "general");

  useEffect(() => {
    localStorage.setItem("adminSettingsTab", activeTab);
  }, [activeTab]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [academicYears, setAcademicYears] = useState([]);
  const [pastAcademicYears, setPastAcademicYears] = useState([]);

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
    applicationDeadline: "",
  };

  const [settings, setSettings] = useState({ ...defaultSettings });

  // Specific Institute Settings for Standard Admins
  const [myInstitute, setMyInstitute] = useState({
    _id: "", name: "", abbreviation: "", address: "", openingDays: "", openingTime: "", closingTime: "", dailyLimit: ""
  });

  const [securitySettings, setSecuritySettings] = useState({ twoFactorAuth: false, applicantEmailAuth: true });
  const [notifSettings, setNotifSettings] = useState({
    emailNewApp: true,
    docUploads: true,
    emailDeadline: true,
    sysMaintenance: true
  });

  const [activityLogs, setActivityLogs] = useState([]);

  // --- ADMIN ACCOUNTS STATE ---
  const [adminList, setAdminList] = useState([]);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [adminRole, setAdminRole] = useState("Admin");

  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false);

  const [editAdminModal, setEditAdminModal] = useState({ isOpen: false, admin: null });

  // --- COURSES & INSTITUTES STATE ---
  const [courses, setCourses] = useState([]);
  const [institutes, setInstitutes] = useState([]);
  const [courseModal, setCourseModal] = useState({ isOpen: false, data: { name: "", abbreviation: "", institute: "", limit: 0 }, isEdit: false });

  const [instituteModal, setInstituteModal] = useState({
    isOpen: false,
    data: { name: "", abbreviation: "", address: "", openingDays: "", openingTime: "", closingTime: "", dailyLimit: "" },
    isEdit: false
  });

  // Permissions config
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
    const currentYear = new Date().getFullYear();
    const futureYears = [];
    for (let i = -1; i < 5; i++) {
      futureYears.push(`${currentYear + i}-${currentYear + i + 1}`);
    }
    setAcademicYears(futureYears);

    const checkArchive = sessionStorage.getItem("archiveViewYear");
    if (checkArchive) {
      setIsArchiveMode(true);
      setActiveYear(checkArchive);
    }

    const fetchInitialData = async () => {
      let currentRole = "SuperAdmin";
      let instAbbr = "";

      try {
        const profileRes = await api.get('/admin/profile');
        if (profileRes.data && profileRes.data.role) {
          currentRole = profileRes.data.role;
          setCurrentUserRole(profileRes.data.role);
          instAbbr = profileRes.data.institute;
        }
      } catch (error) {
        console.error("Failed to fetch profile role");
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
              openingDays: userInst.openingDays || "",
              openingTime: userInst.openingTime || "",
              closingTime: userInst.closingTime || "",
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
          const appsRes = await api.get('/admin/applicants');
          const years = [...new Set(appsRes.data.map(a => a.schoolYear))];
          const activeRes = await api.get('/admin/settings');
          const currentActiveYear = activeRes.data ? activeRes.data.schoolYear : "";
          const archived = years.filter(y => y && y !== currentActiveYear).sort().reverse();
          setPastAcademicYears(archived);
        } catch (fallbackErr) { }
      }
    };

    fetchInitialData();
    fetchSettings();
    fetchLogs();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await api.get('/admin/settings');
      if (res.data) {
        const archiveYear = sessionStorage.getItem("archiveViewYear");
        let isOpen = res.data.admissionStatus === "Open";

        let deadline = "";
        if (res.data.applicationDeadline) {
          const d = new Date(res.data.applicationDeadline);
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            deadline = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
          }
        }

        if (deadline && new Date() > new Date(deadline)) {
          isOpen = false;
        }

        setDbSchoolYear(res.data.schoolYear || "");
        setActiveYear(archiveYear || res.data.schoolYear || "");

        if (archiveYear) {
          setIsArchiveMode(true);
          setSettings({
            ...defaultSettings, ...res.data, schoolYear: archiveYear, admissionOpen: false, admissionStatus: "Closed", applicationDeadline: ""
          });
        } else {
          setSettings({
            ...defaultSettings, ...res.data, schoolYear: res.data.schoolYear || "", admissionOpen: isOpen, admissionStatus: isOpen ? "Open" : "Closed", applicationDeadline: deadline
          });
        }

        if (res.data.notifications) setNotifSettings(res.data.notifications);
        if (res.data.security) setSecuritySettings(res.data.security);
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
    if (activeTab === "general") {
      fetchSettings();
      if (currentUserRole !== "SuperAdmin") {
        fetchCourses();
      }
    } else if (activeTab === "admin" && currentUserRole === "SuperAdmin") {
      fetchAdmins();
    } else if (activeTab === "notification") {
      fetchSettings();
    } else if (activeTab === "security") {
      fetchSettings();
      fetchLogs();
    } else if (activeTab === "maintenance" && currentUserRole === "SuperAdmin") {
      fetchSettings();
    }
  }, [activeTab, currentUserRole]);

  const logAction = async (action, status = "Success") => {
    try {
      await api.post('/admin/logs', {
        action,
        status,
        role: currentUserRole
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

  const handleToggleAdmissionClick = () => {
    if (isArchiveMode || !canEditAdmission) return;
    setModals(prev => ({ ...prev, toggleAdmission: true }));
  };

  const confirmToggleAdmission = async () => {
    const isOpening = !settings.admissionOpen;

    if (!isOpening) {
      let updatedPastYears = pastAcademicYears;
      if (settings.schoolYear && !pastAcademicYears.includes(settings.schoolYear)) {
        updatedPastYears = [...pastAcademicYears, settings.schoolYear].sort().reverse();
        setPastAcademicYears(updatedPastYears);
      }

      const newSettings = {
        ...settings, admissionOpen: false, admissionStatus: "Closed", schoolYear: "", applicationDeadline: ""
      };

      setSettings(newSettings);
      setDbSchoolYear("");
      setModals(prev => ({ ...prev, toggleAdmission: false }));

      try {
        setIsLoading(true);
        await api.put('/admin/settings', {
          ...newSettings, notifications: notifSettings, security: securitySettings
        });
        await logAction(`Admission Portal set to CLOSED`);
      } catch (error) {
        console.error("Failed to auto-save closed status", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setSettings(prev => ({ ...prev, admissionOpen: true, admissionStatus: "Open" }));
      setModals(prev => ({ ...prev, toggleAdmission: false }));
    }
  };

  const handleChange = (e) => {
    if (isArchiveMode) return;
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value || "" }));
  };

  const handleDateChange = (dateString) => {
    if (isArchiveMode || !canEditAdmission) return;
    setSettings(prev => ({ ...prev, applicationDeadline: dateString || "" }));
  };

  const handleInitiateSaveAdmission = () => {
    if (settings.admissionOpen) {
      if (!settings.schoolYear || !settings.applicationDeadline) {
        alert("Validation Error: Academic Year and Application Deadline MUST be filled out before saving an Open admission portal.");
        return;
      }
    }
    setModals(prev => ({ ...prev, saveAdmission: true }));
  };

  const formatPayloadSettings = (baseSettings) => {
    let properDeadline = baseSettings.applicationDeadline;

    if (properDeadline && !properDeadline.includes('Z') && !properDeadline.includes('+')) {
      properDeadline = new Date(properDeadline).toISOString();
    }

    return {
      ...baseSettings,
      applicationDeadline: properDeadline,
      notifications: notifSettings,
      security: securitySettings,
      admissionStatus: baseSettings.admissionOpen ? "Open" : "Closed"
    };
  };

  const handleConfirmSaveAdmission = async () => {
    try {
      setModals(prev => ({ ...prev, saveAdmission: false }));
      setIsLoading(true);

      const fullSettings = formatPayloadSettings(settings);

      await api.put('/admin/settings', fullSettings);

      if (settings.admissionOpen) {
        setDbSchoolYear(settings.schoolYear);
        setActiveYear(settings.schoolYear);
      }

      await logAction(`Admission Portal set to ${settings.admissionOpen ? 'OPEN' : 'CLOSED'}`);
      alert("Admission settings saved successfully!");
    } catch (err) {
      alert("Failed to save admission settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSystemProfile = async () => {
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
      alert("System profile saved successfully!");

    } catch (err) {
      alert("Failed to save profile.");
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
      alert("Institute profile saved successfully!");
      fetchInstitutes();
    } catch (err) {
      alert("Failed to save institute profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    try {
      setIsLoading(true);
      const fullSettings = formatPayloadSettings(settings);

      await api.put('/admin/settings', fullSettings);
      await logAction("Updated Notification Settings");
      alert("Notification preferences saved successfully!");
    } catch (err) {
      alert("Failed to save notification preferences.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSecurity = async (key) => {
    if (isArchiveMode || currentUserRole !== "SuperAdmin") return; 
    const newState = !securitySettings[key];
    const updatedSecurity = { ...securitySettings, [key]: newState };
    setSecuritySettings(updatedSecurity);

    try {
      setIsLoading(true);
      const fullSettings = {
        ...settings, notifications: notifSettings, security: updatedSecurity
      };
      await api.put('/admin/settings', fullSettings);

      logAction(`${newState ? "Enabled" : "Disabled"} Two-Factor Authentication`);

      if (newState === true) {
        alert("2FA is now ENABLED. For your security, you will be logged out to verify your login.");
        localStorage.removeItem("adminToken");
        localStorage.removeItem('isAdminAuthenticated');
        window.location.reload();
      } else {
        alert("2FA is now DISABLED and saved!");
      }
    } catch (err) {
      alert("Failed to save 2FA setting.");
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
    const confirm = window.confirm("Are you sure you want to clear all activity logs? This action cannot be undone.");
    if (confirm) {
      try {
        await api.delete('/admin/logs');
        setActivityLogs([]);
      } catch (err) { alert("Failed to clear logs."); }
    }
  };

  const handleInitiateDataSwitch = () => {
    if (isArchiveMode || !canEditMaintenance) return;
    if (!targetYear) {
      alert("Please select a past academic year first.");
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
      alert(`Now viewing archived data for ${targetYear}.\n\nTo return to the current live system, click the "Return to Live" button on the Applications page.`);
      setTargetYear("");
      navigateToTab('pre-admission-applications');
    } catch (err) {
      alert("Failed to load archive.");
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
      alert("Incorrect confirmation code. Please type RESET.");
      return;
    }

    try {
      setModals(prev => ({ ...prev, reset: false }));
      setIsLoading(true);

      const res = await api.post('/admin/applicants/reset-system');
      alert(res.data.msg || "System successfully archived and reset. You will now be logged out.");

      localStorage.removeItem("adminToken");
      localStorage.removeItem('isAdminAuthenticated');
      window.location.reload();

    } catch (err) {
      alert("Reset failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (isArchiveMode || !canManageAdmins) return;

    if (!adminUsername.trim() || !adminEmail.trim() || !adminPassword.trim() || !adminConfirmPassword.trim()) {
      alert("Please enter all details.");
      return;
    }

    if (adminPassword !== adminConfirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    try {
      setIsLoading(true);

      const payloadInstitute = adminRole === "SuperAdmin" ? "Admission" : "IITI";

      const res = await api.post("/admin/create-admin", {
        username: adminUsername,
        institute: payloadInstitute,
        email: adminEmail,
        password: adminPassword,
        role: adminRole
      });

      alert(res.data.msg);

      setAdminUsername("");
      setAdminEmail("");
      setAdminPassword("");
      setAdminConfirmPassword("");
      setAdminRole("Admin");

      fetchLogs();
      fetchAdmins();

    } catch (err) {
      alert(err.response?.data?.msg || "Failed to create admin account.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAdmin = async (id) => {
    if (isArchiveMode || !canManageAdmins) return;
    if (window.confirm("Are you sure you want to delete this administrator account?")) {
      try {
        await api.delete(`/admin/user/${id}`);
        alert("Admin deleted successfully.");
        fetchAdmins();
      } catch (err) {
        alert("Failed to delete admin.");
      }
    }
  };

  const handleUpdateAdmin = async () => {
    if (isArchiveMode || !canManageAdmins) return;
    try {
      const payload = { ...editAdminModal.admin };
      await api.put(`/admin/user/${editAdminModal.admin._id}`, payload);
      alert("Admin updated successfully.");
      setEditAdminModal({ isOpen: false, admin: null });
      fetchAdmins();
    } catch (err) {
      alert("Failed to update admin.");
    }
  };

  const handleSaveInstitute = async () => {
    if (!instituteModal.data.name.trim() || !instituteModal.data.abbreviation.trim()) {
      alert("Please provide both the Full Name and Abbreviation.");
      return;
    }
    try {
      if (instituteModal.isEdit) {
        await api.put(`/admin/institutes/${instituteModal.data._id}`, instituteModal.data);
        alert("Institute updated successfully!");
      } else {
        await api.post('/admin/institutes', instituteModal.data);
        alert("Institute added successfully!");
      }
      setInstituteModal({ isOpen: false, data: { name: "", abbreviation: "", address: "", openingDays: "", openingTime: "", closingTime: "", dailyLimit: "" }, isEdit: false });
      fetchInstitutes();
    } catch (err) {
      console.error("Institute Save Error:", err);
      alert(err.response?.data?.msg || "Failed to save institute.");
    }
  };

  const handleDeleteInstitute = async (id, abbr) => {
    if (window.confirm(`Are you sure you want to delete "${abbr}"?`)) {
      try {
        await api.delete(`/admin/institutes/${id}`);
        alert("Institute deleted successfully.");
        fetchInstitutes();
      } catch (err) { alert("Failed to delete institute."); }
    }
  };

  const handleSaveCourse = async () => {
    const payload = {
      name: courseModal.data.name.trim(),
      abbreviation: courseModal.data.abbreviation.trim().toUpperCase(),
      institute: myInstitute.abbreviation,
      limit: parseInt(courseModal.data.limit) || 0
    };

    if (!payload.name || !payload.abbreviation || !payload.institute) {
      alert("Please fill out Course Name, Abbreviation, and ensure Institute is set.");
      return;
    }

    const isDuplicate = courses.some(c =>
      c.abbreviation.toUpperCase() === payload.abbreviation &&
      c.institute === payload.institute &&
      c._id !== courseModal.data._id
    );

    if (isDuplicate) {
      alert(`A course with the abbreviation '${payload.abbreviation}' already exists for your institute.`);
      return;
    }

    try {
      setIsLoading(true);
      if (courseModal.isEdit) {
        await api.put(`/admin/courses/${courseModal.data._id}`, payload);
        alert("Course updated successfully!");
        logAction(`Updated Course: ${payload.name}`);
      } else {
        await api.post('/admin/courses', payload);
        alert("Course added successfully!");
        logAction(`Added new Course: ${payload.name}`);
      }
      setCourseModal({ isOpen: false, data: { name: "", abbreviation: "", institute: "", limit: 0 }, isEdit: false });
      fetchCourses();
    } catch (err) {
      console.error("Course Save Error:", err);
      alert(err.response?.data?.msg || "Failed to save course to the database.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCourse = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete the course "${name}"? It will be removed from the student application choices.`)) {
      try {
        await api.delete(`/admin/courses/${id}`);
        alert("Course deleted successfully.");
        logAction(`Deleted Course: ${name}`);
        fetchCourses();
      } catch (err) {
        alert("Failed to delete course.");
      }
    }
  };

  const TABS = [
    { label: 'General Settings', key: 'general' },
    ...(currentUserRole === "SuperAdmin" ? [
      { label: 'Manage Admins', key: 'admin' }
    ] : []),
    { label: 'Notification Settings', key: 'notification' },
    { label: 'Security & Logs', key: 'security' },
    ...(currentUserRole === "SuperAdmin" ? [
      { label: 'System Maintenance', key: 'maintenance' }
    ] : [])
  ];

  return (
    <div className="h-full w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ml-2">

      {/* Main container */}
      <main className="flex-1 flex flex-col p-[10px] w-full relative overflow-y-auto pb-12">

        {/* Header (scrolls with content) */}
        <div className="mb-6 flex-none">

          {isArchiveMode ? (
            <div className="mt-2 bg-red-100 border border-red-400 text-red-700 px-3 py-1.5 rounded-md w-full flex justify-between items-center shadow-sm">
              <span className="font-bold">⚠️ YOU ARE IN ARCHIVE MODE. Viewing read-only data for AY {activeYear}.</span>
              <button onClick={exitArchiveMode} className="bg-red-700 text-white px-3 py-1 rounded text-xs uppercase font-black hover:bg-red-800 transition">Return to Live</button>
            </div>
          ) : (
            <p className="text-gray-600"></p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-md p-8 max-h-[1500px] h-auto relative">

          {/* === MODALS === */}

          {instituteModal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-base mb-4 text-[#376e35] flex items-center gap-2"><BookOpen size={20} /> {instituteModal.isEdit ? "Edit Institute" : "Add Institute"}</h3>
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
                  <button onClick={() => setInstituteModal({ isOpen: false, data: { name: "", abbreviation: "", address: "", openingDays: "", openingTime: "", closingTime: "", dailyLimit: "" }, isEdit: false })} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleSaveInstitute} className="px-5 py-2 bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] text-xs shadow-md">Save</button>
                </div>
              </div>
            </div>
          )}

          {courseModal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-base mb-4 text-[#376e35] flex items-center gap-2"><BookOpen size={20} /> {courseModal.isEdit ? "Edit Course" : "Add Course"}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Institute</label>
                    <input type="text" value={myInstitute.abbreviation} disabled className="w-full border p-2.5 rounded-lg bg-gray-100 text-gray-500 font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Course Name</label>
                    <input type="text" value={courseModal.data.name} onChange={e => setCourseModal({ ...courseModal, data: { ...courseModal.data, name: e.target.value } })} placeholder="e.g. BS Information Technology" className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Abbreviation</label>
                    <input type="text" value={courseModal.data.abbreviation} onChange={e => setCourseModal({ ...courseModal, data: { ...courseModal.data, abbreviation: e.target.value.toUpperCase() } })} placeholder="e.g. BSIT" className="w-full border p-2.5 rounded-lg outline-none focus:border-[#376e35] font-medium uppercase" />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                  <button onClick={() => setCourseModal({ isOpen: false, data: { name: "", abbreviation: "", institute: "", limit: 0 }, isEdit: false })} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleSaveCourse} disabled={isLoading} className={`px-5 py-2 text-white font-bold rounded-lg text-xs shadow-md transition-colors ${isLoading ? "bg-gray-400 cursor-not-allowed" : "bg-[#376e35] hover:bg-[#376e35]"}`}>
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
                  <h3 className="font-bold text-base">Archive Data?</h3>
                </div>
                <p className="text-gray-600 text-xs mb-2 leading-relaxed">
                  {modals.restartMessage}
                </p>
                <div className="bg-green-50 p-3 rounded-lg mb-6 border border-green-100">
                  <p className="text-xs text-green-800 font-medium flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    The system will switch to View-Only Archived Mode.
                  </p>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, restart: false }))} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-colors text-xs">Cancel</button>
                  <button onClick={handleConfirmRestart} className="px-4 py-2 bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] transition-all text-xs flex items-center gap-2 shadow-lg shadow-green-100">
                    <RefreshCw size={16} /> Confirm Archive
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
                  <h3 className="font-bold text-base">System Reset Confirmation</h3>
                </div>
                <p className="text-gray-600 text-xs mb-4 leading-relaxed">
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
                  <button onClick={() => setModals(prev => ({ ...prev, reset: false }))} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleConfirmReset} disabled={modals.resetCode !== "RESET"} className={`px-4 py-2 text-white font-bold rounded-lg text-xs flex items-center gap-2 ${modals.resetCode === "RESET" ? "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200" : "bg-gray-300 cursor-not-allowed"}`}>
                    <Trash2 size={16} /> Confirm Reset
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
                  <h3 className="font-bold text-base">
                    {settings.admissionOpen ? "Close Admission Portal?" : "Open Admission Portal?"}
                  </h3>
                </div>
                <p className="text-gray-600 text-xs mb-6 leading-relaxed">
                  Are you sure you want to <strong>{settings.admissionOpen ? "CLOSE" : "OPEN"}</strong> the admission portal?
                  {settings.admissionOpen
                    ? " Students will no longer be able to register. Logged-in students will be switched to Read-Only mode."
                    : " You must set an Academic Year and Deadline to begin accepting applications."}
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, toggleAdmission: false }))} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-xs">Cancel</button>
                  <button onClick={confirmToggleAdmission} className={`px-4 py-2 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-lg ${settings.admissionOpen ? 'bg-red-600 hover:bg-red-700' : 'bg-[#376e35] hover:bg-[#376e35]'}`}>
                    <CheckCircle size={16} /> Confirm
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
                  <h3 className="font-bold text-base">Save Changes?</h3>
                </div>
                <p className="text-gray-600 text-xs mb-6 leading-relaxed">
                  Are you sure you want to save? The portal will be set to <strong>{settings.admissionOpen ? "OPEN" : "CLOSED"}</strong>. {settings.admissionOpen && "The Academic Year dropdown will be locked to prevent accidental changes."}
                </p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setModals(prev => ({ ...prev, saveAdmission: false }))} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleConfirmSaveAdmission} className="px-4 py-2 bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] text-xs flex items-center gap-2 shadow-lg">
                    <CheckCircle size={16} /> Confirm Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {editAdminModal.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
                <h3 className="font-bold text-base mb-4 text-[#376e35] flex items-center gap-2"><Edit3 size={20} /> Edit Administrator</h3>
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
                  <button onClick={() => setEditAdminModal({ isOpen: false, admin: null })} className="px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-xs">Cancel</button>
                  <button onClick={handleUpdateAdmin} className="px-5 py-2 bg-[#376e35] text-white font-bold rounded-lg hover:bg-[#376e35] text-xs shadow-md">Save Changes</button>
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
                  className={`flex-1 py-2 px-2 sm:px-4 text-center font-bold text-xs sm:text-xs md:text-base whitespace-nowrap ${activeTab === tab.key
                    ? "bg-[#376e35] text-white"
                    : "bg-white text-black hover:bg-[#fafdfa] " + (idx > 0 ? "border-l border-gray-400" : "")
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
                      <h2 className="text-lg lg:text-xl font-bold text-black flex items-center gap-3">
                        <Activity className="text-[#376e35]" size={28} /> Admission Status & Academic Year
                      </h2>
                    </div>
                    <hr className="border-gray-300 mb-8" />

                    <div className="flex flex-col gap-8 items-stretch">

                      {/* Status Toggle */}
                      <div className={`rounded-xl p-8 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm border ${settings.admissionOpen ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                        <div className="text-center sm:text-left">
                          <h3 className="font-bold text-xl text-black">Admission Portal</h3>
                          <p className="text-gray-700">Currently <strong className={settings.admissionOpen ? "text-[#376e35]" : "text-red-600"}>{settings.admissionOpen ? "OPEN" : "CLOSED"}</strong> for new applicants.</p>
                        </div>

                        <button
                          onClick={handleToggleAdmissionClick}
                          disabled={isArchiveMode || !canEditAdmission}
                          className={`relative w-20 h-10 shrink-0 rounded-full focus:outline-none shadow-inner ${(isArchiveMode || !canEditAdmission) ? 'bg-gray-300 cursor-not-allowed opacity-80' : (settings.admissionOpen ? 'bg-[#376e35]' : 'bg-gray-400')
                            }`}
                        >
                          <span className={`absolute top-1 left-1 bg-white w-8 h-8 rounded-full shadow-md transform flex items-center justify-center transition-transform ${settings.admissionOpen ? 'translate-x-10' : 'translate-x-0'}`}>
                            <div className={`w-2 h-2 rounded-full ${settings.admissionOpen ? 'bg-green-500' : 'bg-gray-300'}`} />
                          </span>
                        </button>
                      </div>

                      {/* Academic Year & Deadline */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-xl border border-gray-200">
                        <div className="space-y-2">
                          <label className={`font-bold text-base flex items-center gap-2 ${!settings.admissionOpen || isArchiveMode || !canEditAdmission || !!dbSchoolYear ? 'text-gray-400' : 'text-black'}`}>
                            <CalendarIcon size={18} /> Current Academic Year {(!settings.admissionOpen && !isArchiveMode) && ""}
                          </label>
                          <div className="relative">
                            <select
                              name="schoolYear"
                              value={settings.schoolYear || ""}
                              onChange={handleChange}
                              disabled={!settings.admissionOpen || isArchiveMode || !canEditAdmission || !!dbSchoolYear}
                              className={`w-full appearance-none border rounded-lg px-4 py-3 outline-none ${(!settings.admissionOpen || isArchiveMode || !canEditAdmission || !!dbSchoolYear)
                                ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80"
                                : "bg-white border-black text-black focus:ring-2 focus:ring-[#376e35] cursor-pointer"
                                }`}
                            >
                              <option value="">Select Academic Year</option>
                              {academicYears
                                .filter(year => !pastAcademicYears.includes(year))
                                .map((year) => (
                                  <option key={year} value={year}>{year}</option>
                                ))
                              }
                              {isArchiveMode && <option value={settings.schoolYear}>{settings.schoolYear}</option>}
                            </select>
                            <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 ${!settings.admissionOpen || isArchiveMode || !canEditAdmission || !!dbSchoolYear ? 'text-gray-300' : 'text-gray-700'}`}>
                              <ChevronRight className="rotate-90" size={20} />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className={`font-bold text-base flex items-center gap-2 ${!settings.admissionOpen || isArchiveMode || !canEditAdmission ? 'text-gray-400' : 'text-black'}`}>
                            <Clock size={18} /> Application Deadline {(!settings.admissionOpen && !isArchiveMode) && ""}
                          </label>
                          <CustomDateTimePicker
                            value={settings.applicationDeadline}
                            onChange={handleDateChange}
                            disabled={!settings.admissionOpen || isArchiveMode || !canEditAdmission}
                            placeholder="Select Date & Time"
                          />
                        </div>
                      </div>
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
                      <h2 className="text-lg lg:text-xl font-bold text-black flex items-center gap-3">
                        <UserCog className="text-[#376e35]" size={28} /> System Profile
                      </h2>
                      {!isArchiveMode && (
                        <button
                          onClick={() => setIsEditingProfile(!isEditingProfile)}
                          disabled={!canEditProfile}
                          className={`flex items-center gap-2 font-bold py-2 px-5 text-xs rounded shadow transition-colors ${!canEditProfile ? "bg-gray-300 text-gray-500 cursor-not-allowed" :
                            isEditingProfile ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-[#376e35] hover:bg-[#376e35] text-white"
                            }`}
                        >
                          {isEditingProfile ? "Cancel Editing" : <><Edit3 size={16} /> Edit Profile</>}
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

                      <InputGroup label="Contact No.">
                        <input
                          type="text"
                          name="contactInfo"
                          value={settings.contactInfo || ""}
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
                          value={settings.email || ""}
                          onChange={handleChange}
                          disabled={!isEditingProfile || isArchiveMode || !canEditProfile}
                          className={`w-full border rounded-lg px-4 py-3 outline-none ${isEditingProfile && !isArchiveMode && canEditProfile ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
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
                      <h2 className="text-lg lg:text-xl font-bold text-black flex items-center gap-3">
                        <BookOpen className="text-[#376e35]" size={28} /> Institute Profile
                      </h2>
                      {!isArchiveMode && (
                        <button
                          onClick={() => setIsEditingProfile(!isEditingProfile)}
                          className={`flex items-center gap-2 font-bold py-2 px-5 text-xs rounded shadow transition-colors ${isEditingProfile ? "bg-gray-600 hover:bg-gray-700 text-white" : "bg-[#376e35] hover:bg-[#376e35] text-white"
                            }`}
                        >
                          {isEditingProfile ? "Cancel Editing" : <><Edit3 size={16} /> Edit Profile</>}
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

                      <InputGroup label="Opening Days">
                        <select
                          name="openingDays"
                          value={myInstitute.openingDays || ""}
                          onChange={(e) => setMyInstitute({ ...myInstitute, openingDays: e.target.value })}
                          disabled={!isEditingProfile || isArchiveMode}
                          className={`w-full border rounded-lg px-4 py-3 outline-none uppercase ${isEditingProfile && !isArchiveMode ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
                        >
                          <option value="">Select Days</option>
                          <option value="Monday to Friday">Monday to Friday</option>
                          <option value="Monday to Saturday">Monday to Saturday</option>
                          <option value="Monday to Sunday">Monday to Sunday</option>
                        </select>
                      </InputGroup>

                      <InputGroup label="Opening Time">
                        <input
                          type="time"
                          name="openingTime"
                          value={myInstitute.openingTime || ""}
                          onChange={(e) => setMyInstitute({ ...myInstitute, openingTime: e.target.value })}
                          disabled={!isEditingProfile || isArchiveMode}
                          className={`w-full border rounded-lg px-4 py-3 outline-none uppercase ${isEditingProfile && !isArchiveMode ? "border-gray-500 bg-white focus:ring-2 focus:ring-gray-200" : "border-gray-300 bg-gray-50 text-gray-600 cursor-not-allowed opacity-80"
                            }`}
                        />
                      </InputGroup>

                      <InputGroup label="Closing Time">
                        <input
                          type="time"
                          name="closingTime"
                          value={myInstitute.closingTime || ""}
                          onChange={(e) => setMyInstitute({ ...myInstitute, closingTime: e.target.value })}
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

                  {/* ADMIN GENERAL SETTINGS: COURSES OFFERED SECTION */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 lg:p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg lg:text-xl font-bold text-black flex items-center gap-3">
                        <BookOpen className="text-[#376e35]" size={28} /> Courses Offered
                      </h2>
                      {!isArchiveMode && (
                        <button
                          onClick={() => setCourseModal({ isOpen: true, data: { name: "", abbreviation: "", institute: myInstitute.abbreviation, limit: 0 }, isEdit: false })}
                          className="flex items-center gap-2 font-bold py-2 px-5 text-xs rounded shadow transition-colors bg-[#376e35] hover:bg-[#376e35] text-white"
                        >
                          <Plus size={16} /> Add Course
                        </button>
                      )}
                    </div>
                    <hr className="border-gray-300 mb-6" />

                    <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-100 shadow-sm">
                          <tr className="text-gray-700 text-xs uppercase tracking-wide">
                            <th className="px-4 py-2 font-bold border-b">Abbreviation</th>
                            <th className="px-4 py-2 font-bold border-b">Course Name</th>
                            <th className="px-4 py-2 font-bold border-b text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {courses.filter(c => c.institute === myInstitute.abbreviation).length > 0 ? (
                            courses.filter(c => c.institute === myInstitute.abbreviation).map(c => (
                              <tr key={c._id} className="hover:bg-[#fafdfa] border-b border-gray-100">
                                <td className="px-4 py-2 text-xs font-bold text-gray-800">{c.abbreviation}</td>
                                <td className="px-4 py-2 text-xs uppercase font-medium">{c.name}</td>
                                <td className="px-4 py-2 flex justify-center gap-2">
                                  <button onClick={() => setCourseModal({ isOpen: true, data: c, isEdit: true })} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded transition shadow-sm">
                                    <Edit3 size={16} />
                                  </button>
                                  <button onClick={() => handleDeleteCourse(c._id, c.name)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded transition shadow-sm">
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="3" className="p-8 text-center text-gray-400 italic">No courses found for this institute.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === MANAGE ADMINS === */}
          {activeTab === "admin" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-black mb-1 flex items-center gap-2">
                  <UserPlus className="text-[#376e35]" size={24} /> Manage Administrators
                </h2>
                <hr className="border-gray-300 mb-6 mt-2" />

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">

                  {/* LEFT COLUMN: CREATE ADMIN ACCOUNT */}
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 xl:col-span-4">
                    <h3 className="text-base font-bold text-black mb-1 flex items-center gap-2">
                      Create Admin Account
                    </h3>

                    <form onSubmit={handleCreateAdmin} className="space-y-4">

                      <div className="space-y-1">
                        <label className="font-bold text-gray-700 text-xs uppercase tracking-wide block">Admin Role</label>
                        <select
                          value={adminRole}
                          onChange={(e) => setAdminRole(e.target.value)}
                          disabled={isArchiveMode || !canManageAdmins}
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-all font-medium ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 text-gray-700 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
                        >
                          <option value="Admin">Standard Admin</option>
                          <option value="SuperAdmin">Super Admin</option>
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
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
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
                          className={`w-full border rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
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
                            className={`w-full border rounded-xl px-4 py-2.5 pr-10 text-xs focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
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
                            className={`w-full border rounded-xl px-4 py-2.5 pr-10 text-xs focus:outline-none transition-all ${isArchiveMode || !canManageAdmins ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-80' : 'bg-gray-50 border-gray-300 placeholder-gray-400 focus:ring-2 focus:ring-[#376e35] focus:border-[#376e35]'}`}
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
                            className={`w-full py-3 rounded-xl font-bold text-xs shadow-md uppercase tracking-wider transition-colors ${isLoading || !canManageAdmins ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-80' : 'bg-[#376e35] text-white hover:bg-green-800'
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
                        <h3 className="font-bold text-base text-black flex items-center gap-2">
                          <UserCog className="text-[#376e35]" size={20} /> Admin Accounts
                        </h3>
                      </div>
                      <button
                        onClick={fetchAdmins}
                        title="Refresh List"
                        className="p-2 text-gray-500 hover:text-[#376e35] bg-gray-100 rounded hover:bg-green-50 transition"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-100 rounded-xl flex-1 min-h-[300px]">
                      <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                          <tr className="text-gray-700 text-xs uppercase font-black tracking-widest">
                            <th className="p-5 border-b text-left">Username</th>
                            <th className="p-5 border-b text-left">Email</th>
                            <th className="p-5 border-b text-center">Role</th>
                            <th className="p-5 border-b text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {adminList.length > 0 ? adminList.map(admin => (
                            <tr key={admin._id} className="hover:bg-[#fafdfa] border-b border-gray-100 transition-colors">
                              <td className="p-5 text-xs font-bold text-gray-800 text-left">{admin.username || "N/A"}</td>
                              <td className="p-5 text-xs text-gray-600 text-left">{admin.email}</td>
                              <td className="p-5 text-xs text-gray-600 text-center">
                                {admin.role === "SuperAdmin" ? "Super Admin" : "Admin"}
                              </td>
                              <td className="p-5 text-center">
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

          {/* === NOTIFICATION SETTINGS === */}
          {activeTab === "notification" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-black mb-1 flex items-center gap-2">
                  <Bell className="text-[#376e35]" size={24} /> Notification Preferences
                </h2>
                <hr className="border-gray-300 mb-6 mt-2" />

                <div className="grid grid-cols-1 gap-8">
                  <div className="space-y-10">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">

                      <div className="flex justify-between items-center">
                        <div className="pr-4">
                          <p className="font-bold text-gray-800">New Application Received</p>

                          <p className="text-xs text-gray-500">Get notified when an applicant submits a new application.</p>
                        </div>
                        <ToggleSwitch disabled={isArchiveMode} checked={notifSettings.emailNewApp} onChange={() => handleNotifToggle('emailNewApp')} />
                      </div>

                      <hr className="border-gray-200" />

                      <div className="flex justify-between items-center">
                        <div className="pr-4">
                          <p className="font-bold text-gray-800">Documents Uploaded</p>

                          <p className="text-xs text-gray-500">Get notified when an applicant uploads their requirement documents.</p>
                        </div>
                        <ToggleSwitch disabled={isArchiveMode} checked={notifSettings.docUploads} onChange={() => handleNotifToggle('docUploads')} />
                      </div>

                      <hr className="border-gray-200" />

                      <div className="flex justify-between items-center">
                        <div className="pr-4">
                          <p className="font-bold text-gray-800">Pre-Admission Deadline</p>

                          <p className="text-xs text-gray-500">Automatic system reminder when the admission period reaches its deadline.</p>
                        </div>
                        <ToggleSwitch disabled={isArchiveMode} checked={notifSettings.emailDeadline} onChange={() => handleNotifToggle('emailDeadline')} />
                      </div>

                      <hr className="border-gray-200" />

                      <div className="flex justify-between items-center">
                        <div className="pr-4">
                          <p className="font-bold text-gray-800">System Configuration Updates</p>

                          <p className="text-xs text-gray-500">Get notified when an administrator changes the admission status or system settings.</p>
                        </div>
                        <ToggleSwitch disabled={isArchiveMode} checked={notifSettings.sysMaintenance} onChange={() => handleNotifToggle('sysMaintenance')} />
                      </div>

                    </div>
                  </div>
                </div>
              </div>
              {!isArchiveMode && (
                <div className="pt-4 border-t border-gray-100 mt-2 flex justify-end">
                  <button
                    onClick={handleSaveNotifications}
                    disabled={isLoading}
                    className={`font-bold py-2 px-6 rounded-lg shadow transition-colors ${isLoading ? 'bg-gray-400 text-gray-200 cursor-not-allowed' : 'bg-[#376e35] hover:bg-[#376e35] text-white'}`}
                  >
                    {isLoading ? "Saving..." : "Save Preferences"}
                  </button>
                </div>
              )}
            </div>
          )}


          {/* === SECURITY & LOGS === */}
          {activeTab === "security" && (
            <div className="space-y-8 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-black mb-1 flex items-center gap-2">
                  <Shield className="text-[#376e35]" size={24}/> Security Settings
                </h2>
                <hr className="border-gray-300 mb-6 mt-2" />
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <div>
                      <h3 className="font-bold text-[16px] text-gray-800">Two-Factor Authentication (2FA)</h3>
                      <p className="text-[12px] text-gray-600 mt-1">Require verification code for Admin login.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold ${securitySettings.twoFactorAuth ? "text-[#376e35]" : "text-gray-500"}`}>{securitySettings.twoFactorAuth ? "ENABLED" : "DISABLED"}</span>
                      <ToggleSwitch disabled={isArchiveMode || currentUserRole !== "SuperAdmin"} checked={securitySettings.twoFactorAuth} onChange={() => handleToggleSecurity('twoFactorAuth')} />
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-gray-50 p-6 rounded-xl border border-gray-200">
                    <div>
                      <h3 className="font-bold text-[16px] text-gray-800">Applicant Email Authentication</h3>
                      <p className="text-[12px] text-gray-600 mt-1">Require OTP verification for new applicant registration.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold ${securitySettings.applicantEmailAuth ? "text-[#376e35]" : "text-gray-500"}`}>{securitySettings.applicantEmailAuth ? "ENABLED" : "DISABLED"}</span>
                      <ToggleSwitch disabled={isArchiveMode || currentUserRole !== "SuperAdmin"} checked={securitySettings.applicantEmailAuth ?? true} onChange={() => handleToggleSecurity('applicantEmailAuth')} />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <h2 className="text-lg font-bold text-black flex items-center gap-2">
                    <Activity className="text-[#376e35]" size={24} /> Activity Logs
                  </h2>
                  {activityLogs.length > 0 && !isArchiveMode && canManageAdmins && (
                    <button
                      onClick={handleClearLogs}
                      className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center gap-1 hover:bg-red-50 px-3 py-1 rounded transition-colors"
                    >
                      <Trash2 size={16} /> Clear All
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto border border-gray-100 rounded-xl max-h-[500px] overflow-y-auto mt-4">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-gray-50 z-20 shadow-sm">
                      <tr className="text-gray-700 text-xs uppercase font-black tracking-widest">
                        <th className="p-5 border-b text-left">Username</th>
                        <th className="p-5 border-b text-center">Role</th>
                        <th className="p-5 border-b text-left">Action</th>
                        <th className="p-5 border-b text-center">Date & Time</th>
                        <th className="p-5 border-b text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {activityLogs.length > 0 ? (
                        activityLogs.map((log) => (
                          <tr key={log._id || log.id} className="hover:bg-[#fafdfa] border-b border-gray-100 last:border-0 transition-colors">
                            <td className="p-5 text-gray-800 font-bold text-xs text-left flex items-center gap-2">
                              <div className="bg-gray-200 p-1.5 rounded-full"><User size={14} /></div>
                              {log.user || "System"}
                            </td>
                            <td className="p-5 text-gray-600 text-xs text-center font-medium">
                              {(() => {
                                const roleStr = (log.role || "").toLowerCase().replace(/\s/g, '');
                                if (roleStr === "superadmin") return "Super Admin";
                                if (roleStr === "admin") return "Admin";
                                return log.role || "System";
                              })()}
                            </td>
                            <td className="p-5 text-gray-800 text-xs text-left">{log.action}</td>
                            <td className="p-5 text-gray-500 text-xs text-center">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="p-5 text-center">
                              <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${log.status === 'Success' ? 'bg-green-100 text-[#376e35]' : 'bg-red-100 text-red-700'}`}>
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
                <h2 className="text-lg font-bold text-black mb-1 flex items-center gap-2">
                  <Wrench className="text-[#376e35]" size={24} />System Maintenance</h2>
                <hr className="border-gray-300 my-4" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Archived Data */}
                  <div className={`border border-green-200 rounded-xl p-6 relative overflow-hidden group ${isArchiveMode || !canEditMaintenance ? 'bg-gray-50 opacity-60 pointer-events-none' : 'bg-white hover:shadow-lg transition-shadow'}`}>
                    <div className="w-12 h-12 bg-green-50  rounded-full flex items-center justify-center mb-4 text-[#376e35] z-10 relative"><Database size={24} /></div>
                    <h3 className="font-bold text-base text-[#376e35] mb-2 relative z-10">Archive Data</h3>
                    <p className="text-xs text-gray-600 mb-4 relative z-10">Select an Academic Year to switch to past academic year's admission records. </p>

                    <div className="relative z-10 space-y-3">
                      <div className="relative">
                        <select
                          value={targetYear}
                          onChange={(e) => setTargetYear(e.target.value)}
                          disabled={isArchiveMode || pastAcademicYears.length === 0 || !canEditMaintenance}
                          className={`w-full appearance-none border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-green-500 font-medium cursor-pointer ${isArchiveMode || pastAcademicYears.length === 0 || !canEditMaintenance ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-80' : 'bg-green-50 border-green-300 text-gray-800'}`}
                        >
                          <option value="">{pastAcademicYears.length === 0 ? "No Archives Available" : "Select Academic Year"}</option>
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
                    <h3 className="font-bold text-base text-red-800 mb-2">Pre-Admission Reset</h3>
                    <p className="text-xs text-red-700/80 mb-6 h-10">All data will be archived in the database and active records will be wiped out/removed.</p>

                    <button
                      onClick={handleInitiateReset}
                      disabled={isArchiveMode || !canEditMaintenance}
                      className={`w-full flex items-center justify-center gap-2 py-4 font-bold rounded-lg shadow-sm transition-colors ${isArchiveMode || !canEditMaintenance ? 'bg-gray-400 text-gray-200 cursor-not-allowed opacity-80' : 'bg-red-600 hover:bg-red-700 text-white active:scale-[0.98]'
                        }`}
                    >
                      <Trash2 size={20} /> Reset System
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// === UTILITY COMPONENTS ===

function InputGroup({ label, icon, children }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 font-bold text-gray-800 text-base">
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
          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs transition-colors
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
        <CalendarIcon size={16} className={disabled ? "text-gray-400" : "text-[#376e35]"} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-[340px] z-50 animate-in fade-in zoom-in duration-200">
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"><ChevronLeft size={18} /></button>
            <div className="flex gap-1">
              <select
                value={viewDate.getMonth()}
                onChange={handleMonthChange}
                className="bg-transparent font-bold text-xs text-gray-800 outline-none cursor-pointer hover:text-[#376e35] transition-colors"
              >
                {monthNames.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
              </select>
              <select
                value={viewDate.getFullYear()}
                onChange={handleYearChange}
                className="bg-transparent font-bold text-xs text-gray-800 outline-none cursor-pointer hover:text-[#376e35] transition-colors"
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
              className="bg-gray-50 border border-green-300 text-[#376e35] text-xs rounded-lg outline-none px-3 py-2 font-bold shadow-sm hover:bg-green-100 transition-colors"
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
                      className={`cursor-pointer text-xs text-center py-1.5 rounded transition-colors ${h12Str === h ? 'bg-[#376e35] text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}`}
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
                      className={`cursor-pointer text-xs text-center py-1.5 rounded transition-colors ${mStr === m ? 'bg-[#376e35] text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}`}
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
                      className={`cursor-pointer text-xs text-center py-1.5 rounded transition-colors ${ampm === period ? 'bg-[#376e35] text-white font-bold shadow-md' : 'hover:bg-green-50 text-gray-700'}`}
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
