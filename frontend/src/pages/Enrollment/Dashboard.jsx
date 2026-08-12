import React, { useMemo, useEffect, useState, useRef } from 'react';
import Modal from './components/Modal';
import StudentsTable from './components/StudentsTable';
import api from "./lib/axios";
import toast from "./lib/toast";
import PageHeader from "./components/ui/PageHeader";
import StatCard from "./components/ui/StatCard";
import QuickActionCard from "./components/ui/QuickActionCard";
import LoadingState from "./components/ui/LoadingState";
import Panel from "./components/ui/Panel";
import {
    exportStudentsAsCsv,
    exportStudentsAsXlsx,
    parseStudentTemplateFile,
    sanitizeFileName,
} from "./utils/studentFiles";

const IMPORT_NOTIFICATION_STORAGE_KEY = "dashboardImportNotificationLog";
const IMPORT_NOTIFICATION_UNREAD_KEY = "dashboardImportNotificationUnreadCount";

function Dashboard() {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [students, setStudents] = useState([]);
    const [sections, setSections] = useState([]);
    const [pendingApplicants, setPendingApplicants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalQuery, setModalQuery] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [exportTypeOpen, setExportTypeOpen] = useState(false);
    const [studentExportOpen, setStudentExportOpen] = useState(false);
    const [sectionExportOpen, setSectionExportOpen] = useState(false);
    const [exportFormatOpen, setExportFormatOpen] = useState(false);
    const [exportTarget, setExportTarget] = useState(null);
    const [studentExportQuery, setStudentExportQuery] = useState("");
    const [sectionExportQuery, setSectionExportQuery] = useState("");
    const [importLogOpen, setImportLogOpen] = useState(false);
    const [importNotifications, setImportNotifications] = useState(() => {
        try {
            const raw = window.localStorage.getItem(IMPORT_NOTIFICATION_STORAGE_KEY);
            const parsed = JSON.parse(raw ?? "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [atPageBottom, setAtPageBottom] = useState(false);
    const [bottomSheetDismissed, setBottomSheetDismissed] = useState(false);
    const [unreadImportNotifications, setUnreadImportNotifications] = useState(() => {
        try {
            const raw = window.localStorage.getItem(IMPORT_NOTIFICATION_UNREAD_KEY);
            const parsed = Number(raw ?? 0);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        } catch {
            return 0;
        }
    });
    const importInputRef = useRef(null);

    const pushImportNotification = (message, type = "info") => {
        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            message: String(message ?? ""),
            type,
            createdAt: new Date().toISOString(),
        };

        setImportNotifications((prev) => {
            const next = [entry, ...prev].slice(0, 200);
            window.localStorage.setItem(IMPORT_NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
        setUnreadImportNotifications((prev) => {
            const nextUnread = prev + 1;
            window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, String(nextUnread));
            return nextUnread;
        });
    };

    const clearImportNotifications = () => {
        setImportNotifications([]);
        setUnreadImportNotifications(0);
        window.localStorage.removeItem(IMPORT_NOTIFICATION_STORAGE_KEY);
        window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, "0");
    };

    const openImportLog = () => {
        setImportLogOpen(true);
        setUnreadImportNotifications(0);
        window.localStorage.setItem(IMPORT_NOTIFICATION_UNREAD_KEY, "0");
    };

    const isNewStudent = (student) => String(student.year) === "1" && String(student.semester) === "1st" && student.status !== "Pending";

    const newStudentsCount = students.filter(isNewStudent).length;
    const blockCount = students.filter(s => s.status === "Block").length;
    const pendingCount = pendingApplicants.length;
    const irregularCount = students.filter(s => s.status === "Irregular").length;
    const totalCount = students.filter(s => s.status !== "Pending").length;

    useMemo(() => {
        document.title = "Dashboard - IITI Enrollment System";
    }, []);

    const recentNonPending = React.useMemo(() => {
        return students
            .filter(s => s.status !== 'Pending')
            .slice(0, 100);
    }, [students]);

    const openModal = (title) => {
        setBottomSheetDismissed(true);
        setModalTitle(title);
        setModalQuery("");
        setModalOpen(true);
    };

    const fetchStudents = async () => {
        try {
            const [studentsRes, pendingRes] = await Promise.all([
                api.get("/students", { params: { t: Date.now() } }),
                api.get("/students/pre-admission/admitted-applicants", { params: { t: Date.now() } }),
            ]);

            setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : []);
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
        } catch (error) {
            console.error("Error fetching students", error.response);
            if (error.response?.status === 429) {
                toast.error("Too many requests. Please try again shortly.");
            } else {
                toast.error("Failed to load students");
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchSections = async () => {
        try {
            const sectionsRes = await api.get("/sections", { params: { t: Date.now() } });
            setSections(Array.isArray(sectionsRes.data) ? sectionsRes.data : []);
        } catch (error) {
            console.error("Error fetching sections", error);
        }
    };

    useEffect(() => {
        fetchStudents();
        fetchSections();
    }, []);

    useEffect(() => {
        let animationFrame = null;

        const updateBottomState = () => {
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            animationFrame = window.requestAnimationFrame(() => {
                const documentHeight = document.documentElement.scrollHeight;
                const viewportBottom = window.scrollY + window.innerHeight;
                const reachedBottom = window.scrollY > 160 && viewportBottom >= documentHeight - 24;

                setAtPageBottom((previous) => previous === reachedBottom ? previous : reachedBottom);
                if (!reachedBottom) setBottomSheetDismissed(false);
            });
        };

        updateBottomState();
        window.addEventListener("scroll", updateBottomState, { passive: true });
        window.addEventListener("resize", updateBottomState);

        return () => {
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            window.removeEventListener("scroll", updateBottomState);
            window.removeEventListener("resize", updateBottomState);
        };
    }, []);

    const pendingModalApplicants = useMemo(() => {
        let result = pendingApplicants;

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter((item) => {
                const applicantID = String(item.applicantID ?? "").toLowerCase();
                const applicantName = String(item.applicant_name ?? "").toLowerCase();
                const status = String(item.status ?? "").toLowerCase();
                return applicantID.includes(q) || applicantName.includes(q) || status.includes(q);
            });
        }

        return result;
    }, [pendingApplicants, modalQuery]);

    const modalStudents = useMemo(() => {
        let result = students;

        if (modalTitle === "New Students") {
            result = result.filter(isNewStudent);
        } else if (modalTitle === "Block Students") {
            result = result.filter(s => s.status === "Block");
        } else if (modalTitle === "Irregular Students") {
            result = result.filter(s => s.status === "Irregular");
        } else if (modalTitle === "All Students") {
            result = result.filter(s => s.status !== "Pending");
        }

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter(s => {
                const first_name = String(s.first_name ?? "").trim().toLowerCase();
                const last_name = String(s.last_name ?? "").trim().toLowerCase();
                const num = String(s.student_number ?? "").toLowerCase();
                const name = `${first_name} ${last_name}`.trim().toLowerCase();
                const reverse_name = `${last_name} ${first_name}`.trim().toLowerCase();

                if (/^[a-z]/i.test(q)) return first_name.includes(q) || last_name.includes(q) || name.includes(q) || reverse_name.includes(q);
                return num.includes(q);
            });
        }
        return result;
    }, [students, modalTitle, modalQuery]);

    const exportableStudents = useMemo(() => {
        const q = studentExportQuery.trim().toLowerCase();
        const list = students.filter((s) => s.status !== "Pending");
        if (!q) return list;

        return list.filter((s) => {
            const studentNumber = String(s.student_number ?? "").toLowerCase();
            const fullName = `${String(s.first_name ?? "")} ${String(s.last_name ?? "")}`.trim().toLowerCase();
            const section = String(s.section ?? "").toLowerCase();
            const year = String(s.year ?? "").toLowerCase();
            return studentNumber.includes(q) || fullName.includes(q) || section.includes(q) || year.includes(q);
        });
    }, [students, studentExportQuery]);

    const exportableSections = useMemo(() => {
        const totalsBySectionKey = new Map();
        students
            .filter((s) => s.status !== "Pending")
            .forEach((s) => {
                const year = String(s.year ?? "").trim();
                const section = String(s.section ?? "").trim();
                const semester = String(s.semester ?? "").trim() || "N/A";
                if (!year || !section) return;
                const key = `${year}-${section}-${semester}`;
                totalsBySectionKey.set(key, Number(totalsBySectionKey.get(key) || 0) + 1);
            });

        let list = (sections || []).map((sec) => {
            const year = String(sec.year ?? "").trim();
            const section = String(sec.section ?? "").trim();
            const semester = String(sec.semester ?? "").trim() || "N/A";
            const key = `${year}-${section}-${semester}`;
            return {
                key,
                year,
                section,
                semester,
                total: Number(totalsBySectionKey.get(key) || 0),
            };
        }).sort((a, b) => {
            const yearCompare = String(a.year).localeCompare(String(b.year), undefined, { numeric: true, sensitivity: "base" });
            if (yearCompare !== 0) return yearCompare;
            const sectionCompare = String(a.section).localeCompare(String(b.section), undefined, { numeric: true, sensitivity: "base" });
            if (sectionCompare !== 0) return sectionCompare;
            return String(a.semester).localeCompare(String(b.semester), undefined, { numeric: true, sensitivity: "base" });
        });

        const q = sectionExportQuery.trim().toLowerCase();
        if (!q) return list;

        list = list.filter((section) =>
            section.year.toLowerCase().includes(q) ||
            section.section.toLowerCase().includes(q) ||
            section.semester.toLowerCase().includes(q)
        );
        return list;
    }, [students, sections, sectionExportQuery]);

    const openExportFormat = (target) => {
        setExportTarget(target);
        setExportFormatOpen(true);
    };

    const handleQuickImport = () => {
        if (isImporting) return;
        importInputRef.current?.click();
    };

    const handleEnrollApplicant = async (applicant) => {
        if (isEnrolling) return;
        try {
            setIsEnrolling(true);
            await api.post("/students/enroll-from-to-be-admitted", {
                applicantID: applicant.applicantID,
            });
            toast.success(`Enrolled ${applicant.applicant_name} successfully`);
            await fetchStudents();
            await fetchSections();
            const pendingRes = await api.get("/students/pre-admission/admitted-applicants", { params: { t: Date.now() } });
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
        } catch (error) {
            console.error("Enroll failed", error);
            toast.error(error?.response?.data?.message || "Failed to enroll applicant");
        } finally {
            setIsEnrolling(false);
        }
    };

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setIsImporting(true);
            const parsedStudents = await parseStudentTemplateFile(file);
            
            // Determine import type based on filename
            const fileName = String(file.name ?? "").toLowerCase();
            const importType = fileName.includes("section") ? "section" : "student";
            
            console.log(`[Frontend] Importing ${importType} type with ${parsedStudents.length} students from ${file.name}`);
            
            const response = await api.post("/students/import", { 
                students: parsedStudents,
                importType: importType
            });

            try {
                await api.post("/sections/sync");
            } catch (syncError) {
                console.warn("[Frontend] Section sync after import failed", syncError);
            }
            
            console.log(`[Frontend] Import response:`, response.data);
            await fetchStudents();
            await fetchSections();
            
            // Show import results
            const imported = response?.data?.imported ?? 0;
            const blocked = response?.data?.blocked ?? [];
            
            console.log(`[Frontend] Import completed - imported: ${imported}, blocked: ${blocked.length}`);
            
            if (blocked.length > 0 && importType === "section") {
                // For section imports, show each blocked student
                blocked.forEach((student) => {
                    const name = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
                    const studentNumber = String(student.student_number ?? "").trim();
                    console.log(`[Frontend] Showing error for blocked student: ${name}`);
                    const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                    toast.error(msg);
                    pushImportNotification(msg, "error");
                });
                if (imported > 0) {
                    const blockedNumbers = new Set(
                        blocked.map((student) => String(student.student_number ?? "").trim())
                    );
                    const importedStudents = parsedStudents.filter(
                        (student) => !blockedNumbers.has(String(student.student_number ?? "").trim())
                    );

                    importedStudents.forEach((student) => {
                        const studentNumber = String(student.student_number ?? "").trim();
                        const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
                        const detailMsg = `${studentNumber} - ${name} : Imported successfully`;
                        pushImportNotification(detailMsg, "success");
                    });

                    const msg = `Imported ${imported} student records from section`;
                    toast.success(msg);
                }
            } else {
                const msg = `Imported ${imported} student records`;
                toast.success(
                    msg
                );

                parsedStudents.forEach((student) => {
                    const studentNumber = String(student.student_number ?? "").trim();
                    const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
                    const detailMsg = `${studentNumber} - ${name} : Imported successfully`;
                    pushImportNotification(detailMsg, "success");
                });
            }
        } catch (error) {
            console.error("[Frontend] Import failed", error);
            console.error("[Frontend] Error response:", error?.response?.data);
            
            const blockReason = error?.response?.data?.blockReason;
            const message = error?.response?.data?.message;
            const responseStatus = error?.response?.status;
            
            console.log(`[Frontend] blockReason: ${blockReason}, status: ${responseStatus}`);
            
            // Handle 409 Conflict errors (blocked imports)
            if (responseStatus === 409) {
                if (blockReason === "student_exists") {
                    // For student imports, show the blocking error
                    console.log(`[Frontend] Student import blocked - showing error`);
                    const duplicates = error?.response?.data?.duplicates ?? [];
                    if (duplicates.length > 0) {
                        duplicates.forEach((student) => {
                            const studentNumber = String(student.student_number ?? "").trim();
                            const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
                            const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                            toast.error(msg);
                            pushImportNotification(msg, "error");
                        });
                    } else {
                        const msg = "Import Blocked: Student Number Already Exist";
                        toast.error(msg);
                        pushImportNotification(msg, "error");
                    }
                } else if (blockReason === "all_students_exist") {
                    // For section imports where all students exist
                    const blocked = error?.response?.data?.blocked ?? [];
                    if (blocked.length > 0) {
                        blocked.forEach((student) => {
                            const name = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
                            const studentNumber = String(student.student_number ?? "").trim();
                            console.log(`[Frontend] Showing error for blocked student: ${name}`);
                            const msg = `${studentNumber} - ${name} : Student number already exist in the database`;
                            toast.error(msg);
                            pushImportNotification(msg, "error");
                        });
                    } else {
                        const msg = message || "All students in this section already exist";
                        toast.error(msg);
                        pushImportNotification(msg, "error");
                    }
                }
            } else {
                // Handle other errors
                const msg = message || error?.message || "Failed to import file";
                toast.error(msg);
                pushImportNotification(msg, "error");
            }
        } finally {
            setIsImporting(false);
            event.target.value = "";
        }
    };

    const handleExportAs = (format) => {
        if (!exportTarget) return;

        if (exportTarget.kind === "student") {
            const student = exportTarget.student;
            const name = `${String(student.first_name ?? "").trim()} ${String(student.last_name ?? "").trim()}`.trim();
            const base = sanitizeFileName(`${student.student_number}_${name}`);
            const rows = [student];
            if (format === "xlsx") {
                exportStudentsAsXlsx(rows, base || String(student.student_number));
            } else {
                exportStudentsAsCsv(rows, base || String(student.student_number));
            }
        }

        if (exportTarget.kind === "section") {
            const section = exportTarget.section;
            const rows = students.filter(
                (student) =>
                    String(student.status ?? "") !== "Pending" &&
                    String(student.year ?? "") === String(section.year) &&
                    String(student.section ?? "") === String(section.section) &&
                    (String(student.semester ?? "").trim() || "N/A") === String(section.semester)
            );

            const semesterSuffix = section.semester && section.semester !== "N/A" ? `-${section.semester}` : "";
            const base = sanitizeFileName(`${section.year}-${section.section}${semesterSuffix}`);
            if (format === "xlsx") {
                exportStudentsAsXlsx(rows, base || "section");
            } else {
                exportStudentsAsCsv(rows, base || "section");
            }
        }

        setExportFormatOpen(false);
        setExportTarget(null);
        toast.success("Export completed");
    };

    const bottomSheetVisible =
        atPageBottom &&
        !bottomSheetDismissed &&
        !loading &&
        recentNonPending.length > 0 &&
        !modalOpen &&
        !importLogOpen &&
        !exportTypeOpen &&
        !studentExportOpen &&
        !sectionExportOpen &&
        !exportFormatOpen;

    return (
        <>
<section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-4 sm:p-6 lg:p-8">
            <PageHeader
                eyebrow="Overview"
                title="Enrollment Dashboard"
                description="Monitor student registration, admission, and enrollment activity from one place."
                actions={
                    <button
                        type="button"
                        onClick={openImportLog}
                        className="relative grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                        aria-label="Open import notification log"
                        title="Import notification log"
                    >
                        <i className="fa-regular fa-bell" />
                        {unreadImportNotifications > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[0.65rem] font-bold leading-5 text-white">
                                {Math.min(unreadImportNotifications, 99)}
                            </span>
                        )}
                    </button>
                }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="New Students"
                    value={newStudentsCount}
                    caption="First-year registrations"
                    icon="fa-solid fa-user-plus"
                    tone="slate"
                    onClick={() => openModal("New Students")}
                />
                <StatCard
                    label="Block"
                    value={blockCount}
                    caption="Block students"
                    icon="fa-solid fa-ban"
                    tone="blue"
                    onClick={() => openModal("Block Students")}
                />
                <StatCard
                    label="Irregular"
                    value={irregularCount}
                    caption="Irregular students"
                    icon="fa-solid fa-shuffle"
                    tone="red"
                    onClick={() => openModal("Irregular Students")}
                />
                <StatCard
                    label="Enrolled"
                    value={totalCount}
                    caption="Enrolled students"
                    icon="fa-solid fa-users"
                    tone="green"
                    featured
                    onClick={() => openModal("All Students")}
                />
            </div>

            <div>
                <h3 className="text-lg font-extrabold tracking-tight text-slate-900">Quick actions</h3>
                <p className="mt-1 text-sm text-slate-500">Complete common enrollment tasks without leaving the dashboard.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <QuickActionCard
                    icon="fa-solid fa-user-check"
                    title={`To be admitted (${pendingCount})`}
                    description="Review approved applicants and enroll them."
                    onClick={() => openModal("To Be Admitted")}
                />
                <QuickActionCard
                    icon="fa-solid fa-file-arrow-up"
                    title={isImporting ? "Importing records..." : "Import student file"}
                    description="Upload student records using CSV or XLSX."
                    onClick={handleQuickImport}
                    disabled={isImporting}
                />
                <QuickActionCard
                    icon="fa-solid fa-file-arrow-down"
                    title="Export records"
                    description="Download individual or section records."
                    onClick={() => setExportTypeOpen(true)}
                />
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 className="text-lg font-extrabold tracking-tight text-slate-900">Recently registered students</h3>
                        <p className="mt-1 text-sm text-slate-500">The latest non-pending student records.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => openModal("All Students")}
                        className="inline-flex items-center gap-2 self-start rounded-xl px-3 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50 sm:self-auto"
                    >
                        View all
                        <i className="fa-solid fa-arrow-right text-xs" />
                    </button>
                </div>

                <Panel className="min-h-[420px] overflow-hidden">
                    {loading ? (
                        <LoadingState label="Loading student records..." />
                    ) : (
                        <StudentsTable
                            students={recentNonPending}
                            className="w-full border-0 shadow-none"
                            initialPageSize={10}
                            pageSizeOptions={[10, 20, 50]}
                        />
                    )}
                </Panel>
            </div>
        </section>

        <div
            className={`fixed inset-0 z-[80] flex items-center justify-center p-3 transition-opacity duration-700 sm:p-6 md:left-[260px] ${
                bottomSheetVisible
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!bottomSheetVisible}
            inert={bottomSheetVisible ? undefined : ""}
        >
            <div className="absolute inset-0 bg-slate-950/20" aria-hidden="true" />

            <section
                role="dialog"
                aria-modal="false"
                aria-label="Student records preview"
                className={`relative flex max-h-[84vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl shadow-slate-950/25 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    bottomSheetVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-20 scale-[0.98] opacity-0"
                }`}
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-emerald-700">End of dashboard</p>
                        <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Student records preview</h3>
                        <p className="mt-1 text-xs text-slate-500 sm:text-sm">This centered panel rises into view at the bottom of the dashboard and lowers when you scroll away.</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setBottomSheetDismissed(true);
                                openModal("All Students");
                            }}
                            className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 sm:inline-flex"
                        >
                            View all students
                        </button>
                        <button
                            type="button"
                            onClick={() => setBottomSheetDismissed(true)}
                            className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
                            aria-label="Close student records preview"
                        >
                            <i className="fa-solid fa-xmark" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden bg-slate-50/50 p-2 sm:p-4">
                    <StudentsTable
                        students={recentNonPending}
                        className="w-full border-0 shadow-none"
                        initialPageSize={5}
                        pageSizeOptions={[5, 10, 20]}
                        tableHeightClass="h-[42vh] min-h-[260px]"
                    />
                </div>
            </section>
        </div>

    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle}>
        <div className="flex flex-col gap-4 p-4 md:p-6 max-h-[80vh] overflow-hidden">
            <div className="relative flex w-full shrink-0">
                <input
                    type="text"
                    inputMode="search"
                    placeholder={modalTitle === "To Be Admitted" ? "Search by Applicant Name or Number..." : "Search by Student Name or Number..."}
                    value={modalQuery}
                    onChange={e => setModalQuery(e.target.value)}
                    className="rounded-xl border border-gray-300 p-3 pl-11 pr-10 w-full focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-shadow"
                />
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                </div>
                {modalQuery && (
                    <button
                        type="button"
                        onClick={() => setModalQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1"
                        aria-label="Clear search"
                    >
                        ✕
                    </button>
                )}
            </div>
            <div className="overflow-y-auto rounded-xl border border-gray-200 flex-1 bg-white">
                {modalTitle === "To Be Admitted" ? (
                    <div className="rounded-xl bg-white overflow-hidden">
                        <table className="min-w-full border-collapse text-left text-sm md:text-base whitespace-nowrap">
                            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 text-gray-700">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Applicant ID</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500">Applicant Name</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center">Status</th>
                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pendingModalApplicants.length > 0 ? (
                                    pendingModalApplicants.map((applicant, index) => (
                                        <tr key={`${applicant.applicantID || 'applicant'}-${index}`} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{applicant.applicantID || '-'}</td>
                                            <td className="px-6 py-4 text-gray-800">{applicant.applicant_name || '-'}</td>
                                            <td className="px-6 py-4 text-center text-gray-700">{applicant.status || '-'}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEnrollApplicant(applicant)}
                                                    disabled={isEnrolling}
                                                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isEnrolling ? "Enrolling..." : "Enroll"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-gray-500">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <i className="fa-regular fa-folder-open text-3xl opacity-50"></i>
                                                <p>No applicants found.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <StudentsTable students={modalStudents} isPendingView={false} />
                )}
            </div>
        </div>
    </Modal>

    <Modal open={importLogOpen} onClose={() => setImportLogOpen(false)} title="Notifications" size="md">
        <div className="flex flex-col gap-3 max-h-[70vh] min-h-[18rem]">
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={clearImportNotifications}
                    disabled={!importNotifications.length}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Clear Log
                </button>
            </div>
            {importNotifications.length ? (
                <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                    <ul className="divide-y divide-gray-100">
                        {importNotifications.map((item) => {
                            const when = new Date(item.createdAt);
                            const timeLabel = Number.isNaN(when.getTime())
                                ? "Unknown time"
                                : when.toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                });
                            const toneClass = item.type === "error"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700";

                            return (
                                <li key={item.id} className="p-3 sm:p-4">
                                    <div className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide w-fit ${toneClass}`}>
                                        {item.type === "error" ? "Blocked/Error" : "Success"}
                                    </div>
                                    <p className="mt-2 text-sm text-gray-800 leading-relaxed">{item.message}</p>
                                    <p className="mt-1 text-xs text-gray-500">{timeLabel}</p>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <div className="flex-1 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-6 text-sm text-gray-500 text-center">
                    No import notifications yet.
                </div>
            )}
        </div>
    </Modal>

    <Modal open={exportTypeOpen} onClose={() => setExportTypeOpen(false)} title="Export Options" size="sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
                type="button"
                onClick={() => {
                    setExportTypeOpen(false);
                    setStudentExportOpen(true);
                }}
                className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold"
            >
                Export Student
            </button>
            <button
                type="button"
                onClick={() => {
                    setExportTypeOpen(false);
                    setSectionExportOpen(true);
                }}
                className="px-6 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-semibold"
            >
                Export Section
            </button>
        </div>
    </Modal>

    <Modal open={studentExportOpen} onClose={() => setStudentExportOpen(false)} title="Export Student" size="lg">
        <div className="flex flex-col gap-4 max-h-[75vh]">
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search Student Name or Number..."
                    value={studentExportQuery}
                    onChange={(e) => setStudentExportQuery(e.target.value)}
                    className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
                />
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                </div>
            </div>
            <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 text-left">Student Number</th>
                            <th className="px-4 py-3 text-left">Student Name</th>
                            <th className="px-4 py-3 text-left">Section</th>
                            <th className="px-4 py-3 text-left">Year</th>
                            <th className="px-4 py-3 text-center">Export</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {exportableStudents.map((student) => (
                            <tr key={student._id || student.student_number}>
                                <td className="px-4 py-3">{student.student_number}</td>
                                <td className="px-4 py-3">{`${student.first_name ?? ""} ${student.last_name ?? ""}`.trim()}</td>
                                <td className="px-4 py-3">{student.section}</td>
                                <td className="px-4 py-3">{student.year}</td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        type="button"
                                        onClick={() => openExportFormat({ kind: "student", student })}
                                        className="px-3 py-1.5 rounded-lg bg-[#2E522A] text-white text-xs font-semibold"
                                    >
                                        Export
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </Modal>

    <Modal open={sectionExportOpen} onClose={() => setSectionExportOpen(false)} title="Export Section" size="lg">
        <div className="flex flex-col gap-4 max-h-[75vh]">
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search Year, Section, or Semester..."
                    value={sectionExportQuery}
                    onChange={(e) => setSectionExportQuery(e.target.value)}
                    className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm shadow-sm"
                />
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i className="fa-solid fa-magnifying-glass text-gray-400"></i>
                </div>
            </div>
            <div className="overflow-y-auto rounded-xl border border-gray-200 bg-white">
                <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                        <tr>
                            <th className="px-4 py-3 text-left">Year</th>
                            <th className="px-4 py-3 text-left">Section</th>
                            <th className="px-4 py-3 text-left">Semester</th>
                            <th className="px-4 py-3 text-left">Students</th>
                            <th className="px-4 py-3 text-center">Export</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {exportableSections.map((section) => (
                            <tr key={section.key}>
                                <td className="px-4 py-3">{section.year}</td>
                                <td className="px-4 py-3">{section.section}</td>
                                <td className="px-4 py-3">{section.semester}</td>
                                <td className="px-4 py-3">{section.total}</td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        type="button"
                                        onClick={() => openExportFormat({ kind: "section", section })}
                                        className="px-3 py-1.5 rounded-lg bg-[#2E522A] text-white text-xs font-semibold"
                                    >
                                        Export
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </Modal>

    <Modal open={exportFormatOpen} onClose={() => setExportFormatOpen(false)} title="Export as" size="sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
                type="button"
                onClick={() => handleExportAs("xlsx")}
                className="px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
                XLSX
            </button>
            <button
                type="button"
                onClick={() => handleExportAs("csv")}
                className="px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
                CSV
            </button>
        </div>
    </Modal>

    <input
        ref={importInputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={handleImportFile}
    />
        </>
    );
}

export default Dashboard;