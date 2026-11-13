import React, { useMemo, useEffect, useState } from 'react';
import Modal from '../components/Modal';
import StudentsTable from '../components/StudentsTable';
import api from "../lib/axios";
import toast from "react-hot-toast";
import PageHeader from "../components/ui/PageHeader";
import StatCard from "../components/ui/StatCard";
import QuickActionCard from "../components/ui/QuickActionCard";
import LoadingState from "../components/ui/LoadingState";
import Panel from "../components/ui/Panel";
import { buildScheduleKey, buildScheduleMap, buildStudentScheduleKeys, formatScheduleTimeRange } from "../lib/scheduleUtils";
import { pushImportNotification } from "../lib/notificationUtils";
import { exportStudentAsPdf, exportSectionAsPdf } from "../utils/studentFiles";
import { getStudentSectionDisplay, getStudentYearDisplay } from "../utils/studentDisplay";

function Dashboard() {
    const [modalOpen, setModalOpen] = useState(false);
    const [modalTitle, setModalTitle] = useState("");
    const [students, setStudents] = useState([]);
    const [sections, setSections] = useState([]);
    const [scheduleMap, setScheduleMap] = useState(new Map());
    const [pendingApplicants, setPendingApplicants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalQuery, setModalQuery] = useState("");
    const [yearFilter, setYearFilter] = useState("All Year");
    const [individualEnrollingId, setIndividualEnrollingId] = useState(null);
    const [isBatchEnrolling, setIsBatchEnrolling] = useState(false);
    const [selectedSectionGroup, setSelectedSectionGroup] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [showEnrollmentPreview, setShowEnrollmentPreview] = useState(false);
    const [showBlockedList, setShowBlockedList] = useState(false);
    const [curriculumApplicant, setCurriculumApplicant] = useState(null);
    const [curriculumSubjects, setCurriculumSubjects] = useState([]);
    const [curriculumLoading, setCurriculumLoading] = useState(false);
    const [curriculumError, setCurriculumError] = useState("");
    const [scheduleApplicant, setScheduleApplicant] = useState(null);
    const [applicantScheduleRows, setApplicantScheduleRows] = useState([]);
    const [applicantScheduleLoading, setApplicantScheduleLoading] = useState(false);
    const [applicantScheduleError, setApplicantScheduleError] = useState("");
    const [exportTypeOpen, setExportTypeOpen] = useState(false);
    const [studentExportOpen, setStudentExportOpen] = useState(false);
    const [sectionExportOpen, setSectionExportOpen] = useState(false);
    const [studentExportQuery, setStudentExportQuery] = useState("");
    const [sectionExportQuery, setSectionExportQuery] = useState("");
    const [exportingId, setExportingId] = useState(null);
    const [studentNumberStudent, setStudentNumberStudent] = useState(null);
    const [studentNumberInput, setStudentNumberInput] = useState("");
    const [assigningStudentNumber, setAssigningStudentNumber] = useState(false);
    const [studentToView, setStudentToView] = useState(null);

    // Real-time duplicate check: find any existing student whose studentNumber matches the input
    const matchingExistingStudent = useMemo(() => {
        if (!studentNumberInput) return null;
        return students.find(s => String(s.studentNumber) === studentNumberInput) || null;
    }, [studentNumberInput, students]);
    const isDisplayedStudent = (student) => student.status !== "Pending" && student.status !== "Advised";
    const hasApplicantId = (student) =>
        Object.prototype.hasOwnProperty.call(student, "applicantId") &&
        String(student.applicantId ?? "").trim().length > 0;
    const isNewStudent = (student) =>
        hasApplicantId(student) &&
        String(student.year) === "1" &&
        String(student.semester) === "1st" &&
        student.status !== "Pending" &&
        student.status !== "Advised";

    const newStudentsCount = students.filter((student) => isDisplayedStudent(student) && isNewStudent(student)).length;
    const blockCount = students.filter(s => s.status === "Block").length;
    const pendingCount = pendingApplicants.length;
    const irregularCount = students.filter(s => s.status === "Irregular").length;
    const totalCount = students.filter(isDisplayedStudent).length;

    useMemo(() => {
        document.title = "Dashboard - IITI Enrollment System";
    }, []);

    const recentNonPending = React.useMemo(() => {
        return students
            .filter(isDisplayedStudent)
            .slice(0, 100);
    }, [students]);

    const openModal = (title) => {
        setModalTitle(title);
        setModalQuery("");
        setYearFilter("All Year");
        setSelectedSectionGroup(null);
        setShowEnrollmentPreview(false);
        setPreviewData(null);
        setModalOpen(true);
    };

    const openStudentNumberDialog = (student) => {
        setStudentNumberStudent(student);
        setStudentNumberInput("");
    };

    const confirmStudentNumber = async () => {
        if (!studentNumberStudent || !/^\d+$/.test(studentNumberInput)) {
            toast.error("Enter a numeric student number.");
            return;
        }
        try {
            setAssigningStudentNumber(true);
            await api.post(`/students/${studentNumberStudent._id}/assign-number`, {
                studentNumber: studentNumberInput,
            });
            setStudentNumberStudent(null);
            setStudentNumberInput("");
            await fetchStudents();
            toast.success("Student number assigned successfully.");
        } catch (error) {
            toast.error(error?.response?.data?.message || "Failed to assign student number.");
        } finally {
            setAssigningStudentNumber(false);
        }
    };

    const fetchStudents = async () => {
        try {
            const [studentsRes, pendingRes] = await Promise.all([
                api.get("/students", { params: { t: Date.now() } }),
                api.get("/students/applicants", { params: { t: Date.now() } }),
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

    const fetchMasterSchedule = async () => {
        try {
            const schedulesRes = await api.get("/schedules");
            const availableSchedules = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];

            if (availableSchedules.length === 0) {
                setScheduleMap(new Map());
                return;
            }

            const scheduleDetailResults = await Promise.allSettled(
                availableSchedules.map(async (schedule) => {
                    if (!schedule?._id) return null;

                    const detailsRes = await api.get(`/schedules/${schedule._id}`);
                    return detailsRes.data;
                })
            );

            const scheduleDetails = scheduleDetailResults
                .map((result) => (result.status === "fulfilled" ? result.value : null))
                .filter(Boolean);

            setScheduleMap(buildScheduleMap(scheduleDetails));
        } catch (error) {
            console.error("Error fetching master schedule", error);
            setScheduleMap(new Map());
        }
    };

    useEffect(() => {
        fetchStudents();
        fetchSections();
        fetchMasterSchedule();
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

        return [...result].sort((left, right) => {
            const leftId = String(left.applicantID ?? "");
            const rightId = String(right.applicantID ?? "");
            return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: "base" });
        });
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
            result = result.filter(isDisplayedStudent);
        }

        if (modalQuery) {
            const q = modalQuery.trim().toLowerCase();
            result = result.filter(s => {
                const firstName = String(s.firstName ?? "").trim().toLowerCase();
                const lastName = String(s.lastName ?? "").trim().toLowerCase();
                const num = String(s.studentNumber ?? s.applicantId ?? s.applicantID ?? "").toLowerCase();
                const name = `${firstName} ${lastName}`.trim().toLowerCase();
                const reverseName = `${lastName} ${firstName}`.trim().toLowerCase();

                if (/^[a-z]/i.test(q)) return firstName.includes(q) || lastName.includes(q) || name.includes(q) || reverseName.includes(q);
                return num.includes(q);
            });
        }
        return result;
    }, [students, modalTitle, modalQuery]);

    const exportableStudents = useMemo(() => {
        const q = studentExportQuery.trim().toLowerCase();
        const list = students.filter(isDisplayedStudent);
        if (!q) return list;

        return list.filter((s) => {
            const studentNumber = String(s.studentNumber ?? s.applicantId ?? s.applicantID ?? "").toLowerCase();
            const fullName = `${String(s.firstName ?? "")} ${String(s.lastName ?? "")}`.trim().toLowerCase();
            const section = String(s.section ?? "").toLowerCase();
            const year = String(s.year ?? "").toLowerCase();
            return studentNumber.includes(q) || fullName.includes(q) || section.includes(q) || year.includes(q);
        });
    }, [students, studentExportQuery]);

    const exportableSections = useMemo(() => {
        const totalsBySectionKey = new Map();
        students
            .filter(isDisplayedStudent)
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

    // Year filter mapping: display labels -> numeric values used in data
    const yearFilterOptions = [
        { label: "All Year", value: null },
        { label: "First Year", value: "1" },
        { label: "Second Year", value: "2" },
        { label: "Third Year", value: "3" },
        { label: "Fourth Year", value: "4" },
    ];

    // Group pending applicants by year, semester, section for the "To Be Enrolled" UI
    const applicantSectionGroups = useMemo(() => {
        const groups = {};
        pendingModalApplicants.forEach((applicant) => {
            const year = String(applicant.year ?? "N/A").trim();
            const semester = String(applicant.semester ?? "N/A").trim();
            const section = String(applicant.section ?? "N/A").trim();
            const key = `${year}::${semester}::${section}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    year,
                    semester,
                    section,
                    applicants: [],
                };
            }
            groups[key].applicants.push(applicant);
        });
        return Object.values(groups).filter((group) => {
            if (yearFilter === "All Year") return true;
            return group.year === yearFilter;
        }).sort((a, b) => {
            const yearCmp = a.year.localeCompare(b.year, undefined, { numeric: true, sensitivity: "base" });
            if (yearCmp !== 0) return yearCmp;
            const semesterCmp = a.semester.localeCompare(b.semester, undefined, { numeric: true, sensitivity: "base" });
            if (semesterCmp !== 0) return semesterCmp;
            return a.section.localeCompare(b.section, undefined, { numeric: true, sensitivity: "base" });
        });
    }, [pendingModalApplicants, yearFilter]);

    const handlePreviewBatchEnroll = async (applicantIDs) => {
        if (!selectedSectionGroup || isBatchEnrolling) return;
        const idsToPreview = Array.isArray(applicantIDs)
            ? applicantIDs
            : selectedSectionGroup.applicants.map((a) => a.applicantID).filter(Boolean);
        if (idsToPreview.length === 0) return;

        try {
            setIsBatchEnrolling(true);
            const response = await api.post("/students/batch-enroll-preview", { applicantIDs: idsToPreview });
            const { placements, blocked, notFound } = response.data;
            setPreviewData({ placements, blocked, notFound });
            setShowEnrollmentPreview(true);
        } catch (error) {
            console.error("Preview failed", error);
            toast.error(error?.response?.data?.message || "Failed to preview enrollment");
        } finally {
            setIsBatchEnrolling(false);
        }
    };

    const handlePreviewSectionChange = (applicantID, sectionValue) => {
        setPreviewData((current) => {
            if (!current) return current;
            return {
                ...current,
                placements: current.placements.map((placement) => {
                    if (placement.applicantID !== applicantID) return placement;
                    const selected = (placement.available_sections ?? []).find((section) => section.section === sectionValue);
                    if (!selected) return placement;
                    return {
                        ...placement,
                        assigned_section: selected.section,
                        assigned_year: selected.year,
                        assigned_semester: selected.semester,
                        assigned_sections: (placement.assigned_sections ?? []).map((section, index) =>
                            index === 0 ? { ...section, ...selected, isMain: true } : section
                        ),
                    };
                }),
            };
        });
    };

    const getSelectedPreviewSection = (placement) =>
        (placement?.available_sections ?? []).find((section) => section.section === placement.assigned_section);

    const normalizeCurriculumYear = (year) => {
        const value = String(year ?? "").trim().toLowerCase();
        const yearMap = {
            "1": "1st", "1st": "1st", first: "1st", "first year": "1st",
            "2": "2nd", "2nd": "2nd", second: "2nd", "second year": "2nd",
            "3": "3rd", "3rd": "3rd", third: "3rd", "third year": "3rd",
            "4": "4th", "4th": "4th", fourth: "4th", "fourth year": "4th",
        };
        return yearMap[value] || "1st";
    };

    const getCurriculumSemesterIndex = (semester) => {
        const value = String(semester ?? "").trim().toLowerCase();
        return ["2", "2nd", "second", "second semester", "2nd semester"].includes(value) ? 1 : 0;
    };

    const handleOpenApplicantCurriculum = async (applicant) => {
        setCurriculumApplicant(applicant);
        setCurriculumSubjects([]);
        setCurriculumError("");
        setCurriculumLoading(true);

        try {
            const yearKey = normalizeCurriculumYear(applicant?.year);
            const response = await api.get(`/curriculum/${yearKey}`);
            const semesterIndex = getCurriculumSemesterIndex(applicant?.semester);
            const subjects = response.data?.semesters?.[semesterIndex]?.subjects;

            if (!Array.isArray(subjects) || subjects.length === 0) {
                setCurriculumError("No curriculum subjects found for this year and semester.");
            } else {
                setCurriculumSubjects(subjects);
            }
        } catch (error) {
            setCurriculumError(error?.response?.data?.message || "Failed to load curriculum details.");
        } finally {
            setCurriculumLoading(false);
        }
    };

    const closeApplicantCurriculum = () => {
        setCurriculumApplicant(null);
        setCurriculumSubjects([]);
        setCurriculumError("");
    };

    const handleOpenApplicantSchedule = async (placement) => {
        const scheduleStudent = {
            year: placement?.assigned_year,
            semester: placement?.assigned_semester,
            section: placement?.assigned_section,
        };
        setScheduleApplicant(placement);
        setApplicantScheduleRows([]);
        setApplicantScheduleError("");
        setApplicantScheduleLoading(true);

        try {
            let activeMap = scheduleMap;
            if (!activeMap || activeMap.size === 0) {
                const schedulesRes = await api.get("/schedules");
                const schedules = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];
                const scheduleDetails = (await Promise.allSettled(
                    schedules.map(async (schedule) => {
                        if (!schedule?._id) return null;
                        const detailsRes = await api.get(`/schedules/${schedule._id}`);
                        return detailsRes.data;
                    })
                ))
                    .map((result) => (result.status === "fulfilled" ? result.value : null))
                    .filter(Boolean);
                activeMap = buildScheduleMap(scheduleDetails);
            }

            const irregularSubjects = Array.isArray(placement?.irregularSubjects)
                ? placement.irregularSubjects
                : [];
            if (placement?.isIrregular && irregularSubjects.length > 0) {
                const matchedRows = irregularSubjects.flatMap((subject) => {
                    const subjectId = String(subject?.subjectId ?? "").trim().toLowerCase();
                    const scheduleKey = buildScheduleKey({
                        year: subject?.targetYear,
                        semester: subject?.targetSemester ?? placement?.assigned_semester,
                        section: subject?.targetSection,
                    });
                    if (!subjectId || !scheduleKey) return [];

                    return (activeMap.get(scheduleKey) ?? [])
                        .filter((classEntry) =>
                            String(classEntry?.subjectCode ?? classEntry?.subject_code ?? "").trim().toLowerCase() === subjectId
                        )
                        .map((classEntry) => ({
                            ...classEntry,
                            day: Array.isArray(classEntry?.days)
                                ? classEntry.days.filter(Boolean).join(", ")
                                : classEntry?.day ?? "-",
                        }));
                });

                if (!matchedRows.length) {
                    setApplicantScheduleError("No matching schedule found for the student's irregular subjects.");
                } else {
                    setApplicantScheduleRows(matchedRows);
                }
                return;
            }

            const scheduleKeys = buildStudentScheduleKeys(scheduleStudent);
            const lookupKey = scheduleKeys.find((key) => activeMap.has(key));
            const rows = lookupKey ? activeMap.get(lookupKey) : null;
            if (!rows?.length) {
                setApplicantScheduleError(`No schedule found for Section ${placement?.assigned_year || "-"}-${placement?.assigned_section || "-"}.`);
            } else {
                setApplicantScheduleRows(rows);
            }
        } catch (error) {
            setApplicantScheduleError(error?.response?.data?.message || "Failed to load schedule details.");
        } finally {
            setApplicantScheduleLoading(false);
        }
    };

    const closeApplicantSchedule = () => {
        setScheduleApplicant(null);
        setApplicantScheduleRows([]);
        setApplicantScheduleError("");
    };

    const handleIndividualEnroll = async (applicant) => {
        const applicantID = applicant?.applicantID;
        if (!applicantID || individualEnrollingId || isBatchEnrolling) return;

        try {
            setIndividualEnrollingId(applicantID);
            await handlePreviewBatchEnroll([applicantID]);
        } catch (error) {
            console.error("Individual enrollment preview failed", error);
        } finally {
            setIndividualEnrollingId(null);
        }
    };

    const handleConfirmBatchEnroll = async () => {
        if (!previewData || isBatchEnrolling) return;
        const applicantIDs = previewData.placements.map((p) => p.applicantID).filter(Boolean);
        const selectedSections = Object.fromEntries(
            previewData.placements
                .filter((placement) => placement.applicantID && placement.assigned_section)
                .map((placement) => [placement.applicantID, placement.assigned_section])
        );
        if (applicantIDs.length === 0) {
            setShowEnrollmentPreview(false);
            return;
        }

        try {
            setIsBatchEnrolling(true);
            const response = await api.post("/students/batch-enroll", { applicantIDs, selectedSections });
            const { enrolled, blocked, notFound } = response.data;

            enrolled.forEach((item) => {
                const msg = `Enrolled ${item.applicant_name} (${item.applicantID}) successfully`;
                pushImportNotification(msg, "success");
            });
            blocked.forEach((item) => {
                let blockReason = "Enrollment blocked";
                if (item.reason === "student_exists") {
                    blockReason = `Student number ${item.studentNumber ?? ""} already exists`;
                } else if (item.reason === "internal_error") {
                    blockReason = item.error || "Internal server error";
                } else if (item.reason) {
                    blockReason = String(item.reason);
                }
                const msg = `${item.applicant_name} (${item.applicantID}) : ${blockReason}`;
                pushImportNotification(msg, "error");
            });
            notFound.forEach((item) => {
                pushImportNotification(`Applicant (${item.applicantID}) not found`, "error");
            });

            if (enrolled.length > 0) {
                toast.success(`Enrolled ${enrolled.length} applicant(s) from ${selectedSectionGroup.year}-${selectedSectionGroup.section}`);
            }
            if (blocked.length > 0) {
                toast.error(`${blocked.length} applicant(s) blocked`);
            }

            await fetchStudents();
            await fetchSections();
            const pendingRes = await api.get("/students/applicants", { params: { t: Date.now() } });
            setPendingApplicants(Array.isArray(pendingRes.data) ? pendingRes.data : []);
            setSelectedSectionGroup(null);
            setShowEnrollmentPreview(false);
            setPreviewData(null);
            setShowBlockedList(false);
        } catch (error) {
            console.error("Batch enroll failed", error);
            toast.error(error?.response?.data?.message || "Failed to batch enroll");
        } finally {
            setIsBatchEnrolling(false);
        }
    };

    const handleExportStudent = async (student) => {
        const id = student?._id || student?.studentNumber;
        try {
            setExportingId(id);
            toast.loading("Generating Student COR PDF...", { id: "export-toast" });
            await exportStudentAsPdf(student);
            toast.success("Student COR PDF downloaded", { id: "export-toast" });
        } catch (error) {
            console.error("Failed to export student COR PDF", error);
            toast.error(error?.response?.data?.message || "Failed to generate student COR PDF", { id: "export-toast" });
        } finally {
            setExportingId(null);
        }
    };

    const handleExportSection = async (section) => {
        try {
            setExportingId(section.key);
            toast.loading(`Generating Section ${section.year}-${section.section} COR batch...`, { id: "export-toast" });
            await exportSectionAsPdf(section);
            toast.success(`Section ${section.year}-${section.section} CORs downloaded`, { id: "export-toast" });
        } catch (error) {
            console.error("Failed to export section COR batch PDF", error);
            toast.error(error?.response?.data?.message || "Failed to generate section COR batch PDF", { id: "export-toast" });
        } finally {
            setExportingId(null);
        }
    };

    const getAssignedSectionsForPreview = (placement) => {
        const sectionsList = [];
        const seen = new Map();
        const fallbackYear = String(placement?.assigned_year ?? selectedSectionGroup?.year ?? "").trim();

        const pushSection = (yearValue, sectionValue, isMain = false) => {
            const section = String(sectionValue ?? "").trim();
            if (!section) return;
            const year = String(yearValue ?? "").trim() || fallbackYear;
            const key = `${year}::${section.toUpperCase()}`;

            if (seen.has(key)) {
                const existingIndex = seen.get(key);
                if (isMain) sectionsList[existingIndex].isMain = true;
                return;
            }

            seen.set(key, sectionsList.length);
            sectionsList.push({ year, section, isMain });
        };

        const explicitAssignedSections = Array.isArray(placement?.assigned_sections)
            ? placement.assigned_sections
            : [];

        if (explicitAssignedSections.length > 0) {
            explicitAssignedSections.forEach((entry, index) => {
                pushSection(
                    entry?.year,
                    entry?.section,
                    Boolean(entry?.isMain) || index === 0
                );
            });
        } else {
            pushSection(placement?.assigned_year, placement?.assigned_section, true);

            const irregularSections = Array.isArray(placement?.irregularSection)
                ? placement.irregularSection
                : [];
            const irregularYears = Array.isArray(placement?.irregularYear)
                ? placement.irregularYear
                : [];

            irregularSections.forEach((sectionName, index) => {
                const indexedYear = irregularYears[index];
                const sharedYear = irregularYears.length === 1 ? irregularYears[0] : undefined;
                pushSection(indexedYear ?? sharedYear, sectionName, false);
            });
        }

        if (sectionsList.length > 0 && sectionsList.every((entry) => !entry.isMain)) {
            sectionsList[0].isMain = true;
        }

        return sectionsList;
    };

    return (
        <>
            <section className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 p-4 sm:p-6 lg:p-8">
                <PageHeader
                    title="Enrollment Dashboard"
                    description="Monitor student registration, admission, and enrollment activity from one place."
                />

                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                    <StatCard
                        label="New Students"
                        value={newStudentsCount}
                        caption="First-year registrations"
                        icon="fa-solid fa-user-check"
                        tone="slate"
                        onClick={() => openModal("New Students")}
                    />
                    <StatCard
                        label="Block"
                        value={blockCount}
                        caption="Block students"
                        icon="fa-solid fa-ban"
                        tone="lightGreen"
                        onClick={() => openModal("Block Students")}
                    />
                    <StatCard
                        label="Irregular"
                        value={irregularCount}
                        caption="Irregular students"
                        icon="fa-solid fa-shuffle"
                        tone="yellow"
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

                <div className="-mb-4">
                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">Quick actions</h3>
                    <p className="mt-1 text-sm text-slate-500">Complete common enrollment tasks without leaving the dashboard.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <QuickActionCard
                        icon="fa-solid fa-user-plus"
                        title={`To be enrolled (${pendingCount})`}
                        description="Review approved applicants and enroll them."
                        onClick={() => openModal("To Be Enrolled")}
                    />
                    <QuickActionCard
                        icon="fa-solid fa-file-arrow-down"
                        title="Export records"
                        description="Download individual or section records."
                        onClick={() => setExportTypeOpen(true)}
                    />
                </div>

                <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3 sm:items-end">
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Recently registered students</h3>
                            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">The latest non-pending student records.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openModal("All Students")}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 hover:text-emerald-900 active:scale-95 sm:px-3.5 sm:py-2 sm:text-sm"
                        >
                            <span>View all</span>
                            <i className="fa-solid fa-arrow-right text-xs" />
                        </button>
                    </div>

                    <Panel className="min-h-[420px] overflow-hidden">
                        {loading ? (
                            <LoadingState label="Loading student records..." />
                        ) : (
                            <StudentsTable
                                students={recentNonPending}
                                scheduleMap={scheduleMap}
                                className="w-full border-0 shadow-none"
                                initialPageSize={10}
                                pageSizeOptions={[10, 20, 50]}
                            />
                        )}
                    </Panel>
                </div>
            </section>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={modalTitle}>
                <div className={`flex flex-col gap-4 p-4 md:p-6 overflow-hidden ${modalTitle === "To Be Enrolled" ? "h-[70vh]" : "max-h-[80vh] h-full"}`}>
                    <div className="relative flex w-full shrink-0">
                        {modalTitle === "To Be Enrolled" && !selectedSectionGroup ? (
                            <div className="flex flex-wrap gap-2 w-full">
                                {yearFilterOptions.map((opt) => {
                                    const isActive = yearFilter === (opt.value ?? "All Year");
                                    return (
                                        <button
                                            key={opt.label}
                                            type="button"
                                            onClick={() => setYearFilter(opt.value ?? "All Year")}
                                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#2E522A] focus:ring-offset-1 ${
                                                isActive
                                                    ? "bg-[#2E522A] text-white "
                                                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : modalTitle === "To Be Enrolled" && selectedSectionGroup ? null : (
                            <>
                                <input
                                    type="text"
                                    inputMode="search"
                                    placeholder="Search by Student Name or Number..."
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
                            </>
                        )}
                    </div>
                    <div className="rounded-xl border border-gray-200 flex-1 bg-white min-h-0 overflow-hidden flex flex-col">
                        {modalTitle === "To Be Enrolled" ? (
                            selectedSectionGroup && showEnrollmentPreview && previewData ? (
                                // Show enrollment preview (Confirm Enrollment view)
                                <div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => { setShowEnrollmentPreview(false); setPreviewData(null); }}
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                                        >
                                            <i className="fa-solid fa-arrow-left text-xs" />
                                            Back to applicants
                                        </button>
                                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Confirm Enrollment
                                        </span>
                                    </div>
                                    <div className="flex flex-col flex-1 min-h-0">
                                        <div className="px-4 pt-4 pb-2 shrink-0">
                                            {previewData.blocked.length > 0 && (
                                                <div
                                                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 cursor-pointer transition hover:bg-red-100"
                                                    onClick={() => setShowBlockedList(!showBlockedList)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-red-700">
                                                            {previewData.blocked.length} applicant(s) blocked (student number already exists)
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setShowBlockedList(!showBlockedList); }}
                                                            className="grid h-8 w-8 place-items-center rounded-lg text-red-600 transition hover:bg-red-100"
                                                            aria-label="Show blocked applicants"
                                                            title="Show blocked applicants"
                                                        >
                                                            <i className={`fa-solid ${showBlockedList ? 'fa-eye-slash' : 'fa-eye'} text-sm`} />
                                                        </button>
                                                    </div>
                                                    {showBlockedList && (
                                                        <div className="mt-3 overflow-y-auto max-h-[30vh] rounded-lg border border-red-200 bg-red-50/50">
                                                            <table className="min-w-full text-sm">
                                                                <thead className="sticky top-0 z-10 bg-red-100 border-b border-red-200 text-red-800 uppercase text-xs">
                                                                    <tr>
                                                                        <th className="px-4 py-2.5 text-left font-semibold">Applicant ID</th>
                                                                        <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-red-100">
                                                                    {previewData.blocked.map((item, idx) => (
                                                                        <tr key={item.applicantID || idx} className="hover:bg-red-100/50">
                                                                            <td className="px-4 py-2.5 font-medium text-red-900">{item.applicantID}</td>
                                                                            <td className="px-4 py-2.5 text-red-800">{item.applicant_name}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {previewData.notFound.length > 0 && (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                                    <p className="text-sm font-semibold text-amber-700">
                                                        {previewData.notFound.length} applicant(s) not found
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-h-0 overflow-y-auto px-4">
                                            <div className="rounded-xl border border-gray-200 bg-white h-full">
                                                <table className="min-w-full text-sm">
                                                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 text-gray-600 uppercase text-xs">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left">Applicant ID</th>
                                                            <th className="px-4 py-3 text-left">Name</th>
                                                            <th className="px-4 py-3 text-center">Schedule</th>
                                                            <th className="px-4 py-3 text-center">Assigned Section</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {previewData.placements.map((p, idx) => (
                                                            <tr key={p.applicantID || idx} className="hover:bg-gray-50/80">
                                                                <td className="px-4 py-3 font-medium text-gray-900">{p.applicantID}</td>
                                                                <td className="px-4 py-3 text-gray-800">{p.applicant_name}</td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenApplicantSchedule(p)}
                                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                                                                    >
                                                                        <i className="fa-solid fa-calendar-days" />
                                                                        Schedule
                                                                    </button>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    {p.isIrregular ? (
                                                                        <div className="inline-flex items-center gap-2 text-xs font-semibold">
                                                                            {p.assigned_sections.map((sectionEntry, sectionIndex) => (
                                                                                <React.Fragment key={`${p.applicantID}-${sectionEntry.section}-${sectionIndex}`}>
                                                                                    {sectionIndex > 0 && <span className="text-gray-400">|</span>}
                                                                                    <span className={sectionEntry.isMain ? "text-gray-800" : "text-red-600"}>
                                                                                        {sectionEntry.isMain ? "Section " : ""}
                                                                                        {sectionEntry.year}-{sectionEntry.section} ({sectionEntry.displayCount}/{sectionEntry.displayCapacity})
                                                                                    </span>
                                                                                    {sectionEntry.capacityAdjusted && (
                                                                                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-[0.65rem] font-bold text-amber-700">
                                                                                            To be adjusted
                                                                                        </span>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <select
                                                                                value={p.assigned_section || ""}
                                                                                onChange={(event) => handlePreviewSectionChange(p.applicantID, event.target.value)}
                                                                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                                                                                aria-label={`Assigned section for ${p.applicant_name}`}
                                                                            >
                                                                                {(p.available_sections ?? []).map((section) => (
                                                                                    <option key={`${section.year}-${section.section}-${section.semester}`} value={section.section}>
                                                                                        Section {section.year}-{section.section} ({section.displayCount}/{section.displayCapacity})
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                            {(() => {
                                                                                const selectedSection = getSelectedPreviewSection(p);
                                                                                return selectedSection ? (
                                                                                    <span className={`ml-1.5 inline-flex items-center rounded-full px-2 py-1 text-[0.65rem] font-bold ${
                                                                                        selectedSection.isExisting
                                                                                            ? "bg-emerald-50 text-emerald-700"
                                                                                            : "bg-amber-50 text-amber-700"
                                                                                    }`}>
                                                                                        {selectedSection.isExisting ? "Existing" : "To be Created"}
                                                                                    </span>
                                                                                ) : null;
                                                                            })()}
                                                                        </>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center justify-end gap-3 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => { setShowEnrollmentPreview(false); setPreviewData(null); }}
                                                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleConfirmBatchEnroll}
                                                disabled={isBatchEnrolling || previewData.placements.length === 0}
                                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isBatchEnrolling ? (
                                                    <>
                                                        <i className="fa-solid fa-spinner fa-spin" />
                                                        Enrolling...
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="fa-solid fa-check" />
                                                        Confirm Enroll {previewData.placements.length > 0 && `(${previewData.placements.length})`}
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : selectedSectionGroup ? (
                                // Show applicants within the selected section group
                                <div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSectionGroup(null)}
                                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
                                        >
                                            <i className="fa-solid fa-arrow-left text-xs" />
                                            Back to groups
                                        </button>
                                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            {selectedSectionGroup.year} - {selectedSectionGroup.section} ({selectedSectionGroup.semester})
                                        </span>
                                    </div>
                                    <div className="overflow-y-auto flex-1 min-h-0">
                                        <table className="min-w-full border-collapse text-left text-sm md:text-base whitespace-nowrap">
                                            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-700">
                                                <tr>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                                                        {selectedSectionGroup.applicants.some((applicant) => applicant.isAdvisingRecord) ? "Student Number" : "Applicant ID"}
                                                    </th>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">Student Name</th>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center border-b border-gray-200">Curriculum</th>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center border-b border-gray-200">Status</th>
                                                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-gray-500 text-center border-b border-gray-200">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {selectedSectionGroup.applicants.map((applicant, index) => (
                                                    <tr key={`${applicant.applicantID || 'applicant'}-${index}`} className="hover:bg-gray-50/80 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-gray-900">
                                                            {applicant.isAdvisingRecord ? (applicant.studentNumber || applicant.applicantID || '-') : (applicant.applicantID || '-')}
                                                        </td>
                                                        <td className="px-6 py-4 text-gray-800">{applicant.applicant_name || '-'}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenApplicantCurriculum(applicant)}
                                                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                                                            >
                                                                <i className="fa-solid fa-book-open" />
                                                                Curriculum
                                                            </button>
                                                        </td>
                                                        <td className="px-6 py-4 text-center text-gray-700">
                                                            {applicant.isIrregular === true ||
                                                            String(applicant.status ?? "").trim().toLowerCase() === "irregular"
                                                                ? "Irregular"
                                                                : "Regular"}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleIndividualEnroll(applicant)}
                                                                disabled={Boolean(individualEnrollingId) || isBatchEnrolling}
                                                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                            >
                                                                {individualEnrollingId === applicant.applicantID ? (
                                                                    <>
                                                                        <i className="fa-solid fa-spinner fa-spin" />
                                                                        Enrolling...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <i className="fa-solid fa-user-plus" />
                                                                        Enroll
                                                                    </>
                                                                )}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="border-t border-gray-200 bg-white px-4 py-3 flex justify-end shrink-0">
                                        <button
                                            type="button"
                                            onClick={handlePreviewBatchEnroll}
                                            disabled={isBatchEnrolling}
                                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isBatchEnrolling ? (
                                                <>
                                                    <i className="fa-solid fa-spinner fa-spin mr-2" />
                                                    Loading...
                                                </>
                                            ) : (
                                                <>
                                                    <i className="fa-solid fa-user-plus mr-2" />
                                                    Enroll All ({selectedSectionGroup.applicants.length})
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Show section groups
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    {applicantSectionGroups.length > 0 ? (
                                        <div className="divide-y divide-gray-100">
                                            {applicantSectionGroups.map((group) => (
                                                <button
                                                    key={group.key}
                                                    type="button"
                                                    onClick={() => setSelectedSectionGroup(group)}
                                                    className="w-full flex items-center justify-between px-3 py-4 text-left hover:bg-gray-50/80 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                                                            <i className="fa-solid fa-layer-group text-xs" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                                Year {group.year} - Section {group.section}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                {group.semester} Semester &middot; {group.applicants.length} applicant(s)
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="inline-flex items-center justify-center min-w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-[0.65rem] font-bold">
                                                            {group.applicants.length}
                                                        </span>
                                                        <i className="fa-solid fa-chevron-right text-[0.6rem] text-gray-400" />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-gray-500">
                                            <i className="fa-regular fa-folder-open text-3xl opacity-50"></i>
                                            <p>No applicants found.</p>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <StudentsTable
                                key={studentToView?._id || "new-students-table"}
                                students={modalStudents}
                                scheduleMap={scheduleMap}
                                isPendingView={false}
                                identifierLabel={modalTitle === "New Students" ? "Applicant Number" : undefined}
                                onApplicantIdClick={modalTitle === "New Students" ? openStudentNumberDialog : undefined}
                                detailStudentToOpen={studentToView}
                                onDetailStudentClose={() => setStudentToView(null)}
                            />
                        )}
                    </div>
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
                            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm"
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
                                    <tr key={student._id || student.studentNumber}>
                                        <td className="px-4 py-3">{student.studentNumber ?? student.applicantId ?? student.applicantID ?? "—"}</td>
                                        <td className="px-4 py-3">{`${student.firstName ?? ""} ${student.lastName ?? ""}${student.suffix ? " " + String(student.suffix).trim() : ""}`.trim()}</td>
                                        <td className="px-4 py-3">{getStudentSectionDisplay(student)}</td>
                                        <td className="px-4 py-3">{getStudentYearDisplay(student)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                disabled={exportingId === (student._id || student.studentNumber)}
                                                onClick={() => handleExportStudent(student)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E522A] hover:bg-[#234120] text-white text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                                            >
                                                <i className="fa-solid fa-file-pdf text-[0.8rem]" />
                                                {exportingId === (student._id || student.studentNumber) ? "Exporting..." : "Export PDF"}
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
                            className="block w-full h-11 rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-10 text-gray-900 focus:ring-2 focus:ring-[#2E522A] focus:border-transparent outline-none transition-all text-sm"
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
                                                disabled={exportingId === section.key}
                                                onClick={() => handleExportSection(section)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2E522A] hover:bg-[#234120] text-white text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer"
                                            >
                                                <i className="fa-solid fa-file-pdf text-[0.8rem]" />
                                                {exportingId === section.key ? "Exporting..." : "Export PDF Batch"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <Modal
                open={Boolean(curriculumApplicant)}
                onClose={closeApplicantCurriculum}
                title="Current Curriculum"
                size="lg"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm font-medium text-slate-600">
                        {curriculumApplicant?.applicant_name || "Applicant"}
                        <span className="mx-1.5">&bull;</span>
                        Year {curriculumApplicant?.year || "-"}
                        <span className="mx-1.5">&bull;</span>
                        {curriculumApplicant?.semester || "1st"} Semester
                    </p>

                    {curriculumLoading ? (
                        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-500">
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-700" />
                            <p className="text-sm font-semibold">Loading curriculum details...</p>
                        </div>
                    ) : curriculumError ? (
                        <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center text-slate-500">
                            <i className="fa-regular fa-calendar-xmark text-4xl text-slate-300" />
                            <p className="text-base font-bold text-slate-700">Curriculum details not available</p>
                            <p className="max-w-md text-xs text-slate-500">{curriculumError}</p>
                        </div>
                    ) : (
                        <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white">
                            <table className="min-w-full border-collapse text-sm">
                                <thead className="sticky top-0 border-b border-[#d3dfd1] bg-[#edf3ec] text-[#315B46]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Code</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Title</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Lec</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Lab</th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">Units</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {curriculumSubjects.map((subject, index) => (
                                        <tr key={`${subject.subject_code || subject.code || "subject"}-${index}`} className="hover:bg-slate-50/80">
                                            <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-slate-800">
                                                {subject.subject_code || subject.code || "-"}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{subject.title || "-"}</td>
                                            <td className="px-4 py-3 text-center text-xs text-slate-600">{subject.lecture ?? 0}</td>
                                            <td className="px-4 py-3 text-center text-xs text-slate-600">{subject.laboratory ?? 0}</td>
                                            <td className="px-4 py-3 text-center text-xs font-bold text-emerald-800">{subject.units ?? 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                open={Boolean(scheduleApplicant)}
                onClose={closeApplicantSchedule}
                title="Class Schedule"
                size="lg"
            >
                <div className="flex flex-col gap-4">
                    <p className="text-sm font-medium text-slate-600">
                        {scheduleApplicant?.applicant_name || "Applicant"}
                        <span className="mx-1.5">&bull;</span>
                        Section {scheduleApplicant?.assigned_year || "-"}-{scheduleApplicant?.assigned_section || "-"}
                        <span className="mx-1.5">&bull;</span>
                        {scheduleApplicant?.assigned_semester || "1st"} Semester
                    </p>

                    {applicantScheduleLoading ? (
                        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-500">
                            <i className="fa-solid fa-circle-notch fa-spin text-3xl text-emerald-700" />
                            <p className="text-sm font-semibold">Loading schedule details...</p>
                        </div>
                    ) : applicantScheduleError ? (
                        <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 text-center text-slate-500">
                            <i className="fa-regular fa-calendar-xmark text-4xl text-slate-300" />
                            <p className="text-base font-bold text-slate-700">Schedule details not available</p>
                            <p className="max-w-md text-xs text-slate-500">{applicantScheduleError}</p>
                        </div>
                    ) : (
                        <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white">
                            <table className="min-w-full border-collapse text-sm">
                                <thead className="sticky top-0 border-b border-[#d3dfd1] bg-[#edf3ec] text-[#315B46]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Subject</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Day</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Time</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Room</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Professor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {applicantScheduleRows.map((classRow, index) => (
                                        <tr key={`${classRow.subjectCode || classRow.subject_code || "subject"}-${index}`} className="hover:bg-slate-50/80">
                                            <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{classRow.subjectCode ?? classRow.subject_code ?? "-"}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{classRow.day || "-"}</td>
                                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{formatScheduleTimeRange(classRow.startTime, classRow.endTime)}</td>
                                            <td className="px-4 py-3 text-xs text-slate-700">{classRow.roomName ?? classRow.room_name ?? "-"}</td>
                                            <td className="px-4 py-3 text-xs text-slate-700">{classRow.progName ?? classRow.profName ?? "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                open={Boolean(studentNumberStudent)}
                onClose={() => {
                    if (!assigningStudentNumber) {
                        setStudentNumberStudent(null);
                        setStudentNumberInput("");
                    }
                }}
                title="Insert Student Number"
            >
                <div className="flex flex-col gap-5">
                    <p className="text-sm text-slate-600">
                        Enter the numeric student number for {studentNumberStudent?.firstName || "this student"}.
                    </p>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={studentNumberInput}
                        onChange={(event) => setStudentNumberInput(event.target.value.replace(/\D/g, ""))}
                        placeholder="Student number"
                        autoFocus
                        className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-4 ${
                            matchingExistingStudent
                                ? "border-red-400 focus:border-red-500 focus:ring-red-500/10"
                                : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/10"
                        }`}
                    />
                    {matchingExistingStudent && (
                        <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                            <i className="fa-solid fa-circle-exclamation mt-0.5 text-sm text-red-500" />
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                    <p className="text-xs font-semibold text-red-700">Student number already exists</p>
                                    <p className="text-xs text-red-600">
                                        <span className="font-mono font-bold">{matchingExistingStudent.studentNumber}</span>
                                        {" — "}
                                        {[matchingExistingStudent.firstName, matchingExistingStudent.lastName, matchingExistingStudent.suffix].filter(Boolean).join(" ")}
                                        {" — "}
                                        {matchingExistingStudent.year || "?"}-{matchingExistingStudent.section || "?"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStudentToView(matchingExistingStudent);
                                        setStudentNumberStudent(null);
                                        setStudentNumberInput("");
                                    }}
                                    className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                                >
                                    View
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setStudentToView(studentNumberStudent);
                                setStudentNumberStudent(null);
                                setStudentNumberInput("");
                            }}
                            disabled={assigningStudentNumber || !studentNumberStudent}
                            className="mr-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            View
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setStudentNumberStudent(null);
                                setStudentNumberInput("");
                            }}
                            disabled={assigningStudentNumber}
                            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmStudentNumber}
                            disabled={assigningStudentNumber || !studentNumberInput || !!matchingExistingStudent}
                            className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {assigningStudentNumber ? "Confirming..." : "Confirm"}
                        </button>
                    </div>
                </div>
            </Modal>

        </>
    );
}

export default Dashboard;