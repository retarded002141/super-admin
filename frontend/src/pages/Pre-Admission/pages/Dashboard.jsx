import { useEffect, useRef, useState, useMemo } from "react";
import api from "../../../services/api.js";
import { FaUser, FaUserCheck, FaClock, FaMapMarkerAlt, FaUniversity, FaChartLine } from "react-icons/fa";
import { Eye, MessageSquare, ArrowRight } from "lucide-react";
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineElement, PointElement, LineController, Filler } from "chart.js";
import { PageLoader } from "../components/Loaders.jsx";
Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineElement, PointElement, LineController, Filler);

export default function Dashboard({ navigateToTab, navigationState }) {
  const pieChartRef = useRef(null);
  const barChartRef = useRef(null);

  const pieChartInstance = useRef(null);
  const barChartInstance = useRef(null);

  const [barChartCount, setBarChartCount] = useState(0);

  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("Admin");
  const [userInstitute, setUserInstitute] = useState("IITI");

  // --- ARCHIVE STATE ---
  const [activeYear, setActiveYear] = useState("");
  const [isArchiveMode, setIsArchiveMode] = useState(false);

  const exitArchiveMode = () => {
    sessionStorage.removeItem("archiveViewYear");
    window.location.reload();
  };

  const [publicSettings, setPublicSettings] = useState(null);
  const [selectedInstitute, setSelectedInstitute] = useState("All");

  const [backendStats, setBackendStats] = useState(null);

  useEffect(() => {
    // Fetch User Profile
    const fetchUserProfile = async () => {
      try {
        const res = await api.get('/admin/profile');
        setUserRole(res.data?.role || "Admin");
        setUserInstitute(res.data?.institute || "Admission");
      } catch (error) {
        console.error("Failed to load user profile:", error);
        setUserRole("Admin");
        setUserInstitute("Admission");
      }
    };

    // Fetch Applicants
    const fetchApplicants = async () => {
      try {
        const settingsRes = await api.get('/public/settings');
        setPublicSettings(settingsRes.data);
        const archiveYear = sessionStorage.getItem("archiveViewYear");
        const currentViewYear = archiveYear || settingsRes.data.schoolYear;

        setActiveYear(currentViewYear);
        if (archiveYear) setIsArchiveMode(true);

        try {
          const statsRes = await api.get('/admin/dashboard/stats', { params: { schoolYear: currentViewYear, archive: !!archiveYear } });
          if (statsRes.data) {
            setBackendStats(statsRes.data);
          }
        } catch (e) {
          console.warn("Backend stats endpoint fallback:", e);
        }

        // Include the 'archive' param to signal the backend to query the archive collection
        const res = await api.get('/admin/applicants', { params: { schoolYear: currentViewYear, archive: !!archiveYear } });

        if (res.data && Array.isArray(res.data)) {
          const activeApplicants = res.data.filter(app => !currentViewYear || app.schoolYear === currentViewYear);

          const formattedApplicants = activeApplicants.map(app => {
            const rawStatus = app.status;
            const actualStatus = (
              rawStatus === 'For Interview' ||
              rawStatus === 'Pending Interview' ||
              rawStatus === 'Pending' ||
              rawStatus?.toLowerCase() === 'pending' ||
              app.admissionStatus === 'For Interview'
            ) ? 'For Interview' : (rawStatus || 'For Interview');

            const fName = app.firstName || app.profile?.personal?.firstName || "";
            const lName = app.lastName || app.profile?.personal?.surname || "";
            const fullName = app.name || `${fName} ${lName}`.trim().toUpperCase() || "UNKNOWN";
            const appType = app.applicantType || app.profile?.appDetails?.applicantType || app.type || "N/A";
            const city = app.presentCity || app.profile?.personal?.presAddress?.city || app.location || "N/A";
            const applyDate = app.createdAt ? new Date(app.createdAt).toISOString().split('T')[0] : (app.date || "N/A");
            const hasFinishedInterview = (actualStatus !== 'For Interview') && (
              app.isInterviewed === true ||
              app.interviewStatus === 'Passed' ||
              app.interviewStatus === 'Failed' ||
              (app.interviewScore !== undefined && app.interviewScore !== null && app.interviewScore > 0)
            );

            const firstChoice = app.profile?.appDetails?.firstChoice || app.firstChoice || "N/A";
            const secondChoice = app.profile?.appDetails?.secondChoice || app.secondChoice || "N/A";

            let slotStatus = app.slotStatus || "Pending";
            let admStatus = app.admissionStatus || app.status || "Pending";
            if (!["Admitted", "Accepted", "Forfeit", "Forfeited"].includes(slotStatus)) {
              if (["Admitted", "Confirmed", "Enrolled", "Advising Completed"].includes(admStatus) || app.status === "Enrolled") {
                slotStatus = "Admitted";
              } else if (["Forfeit", "Forfeited"].includes(admStatus)) {
                slotStatus = "Forfeit";
              } else {
                slotStatus = "Pending";
              }
            }

            return {
              id: app.applicantId || (app._id ? `2026-${app._id.toString().slice(-4).toUpperCase()}` : "UNKNOWN"),
              rawId: app._id || app.id,
              name: fullName, type: appType.toUpperCase(), location: city.toUpperCase(),
              date: applyDate, status: actualStatus, isInterviewed: hasFinishedInterview,
              admissionRemarks: app.admissionStatus || app.status,
              admissionStatus: app.admissionStatus,
              interviewStatus: app.interviewStatus,
              interviewScore: app.interviewScore,
              examStatus: app.examStatus,
              examScore: app.examScore,
              isExamined: app.isExamined === true,
              firstChoice,
              secondChoice,
              slotStatus,
              activeProgram: app.activeProgram || firstChoice,
              isRejectedFirstChoice: app.isRejectedFirstChoice === true,
              isRejectedSecondChoice: app.isRejectedSecondChoice === true,
              reconsiderationProgram: app.reconsiderationProgram || "",
              interviewDate: app.interviewDate || app.interviewSchedule || "",
              interviewSession: app.interviewSession || "Morning"
            };
          });
          setApplicants(formattedApplicants);
        }
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    fetchUserProfile().then(() => fetchApplicants());
  }, []);

  // Auto-update applicants every 5 seconds
  useEffect(() => {
    if (!activeYear || isArchiveMode) return;

    const fetchApplicantsOnly = async () => {
      try {
        try {
          const statsRes = await api.get('/admin/dashboard/stats', { params: { schoolYear: activeYear } });
          if (statsRes.data) {
            setBackendStats(statsRes.data);
          }
        } catch (e) { }

        const res = await api.get('/admin/applicants', { params: { schoolYear: activeYear } });

        if (res.data && Array.isArray(res.data)) {
          const activeApplicants = res.data.filter(app => !activeYear || app.schoolYear === activeYear);

          const formattedApplicants = activeApplicants.map(app => {
            const rawStatus = app.status;
            const actualStatus = (
              rawStatus === 'For Interview' ||
              rawStatus === 'Pending Interview' ||
              rawStatus === 'Pending' ||
              rawStatus?.toLowerCase() === 'pending' ||
              app.admissionStatus === 'For Interview'
            ) ? 'For Interview' : (rawStatus || 'For Interview');

            const fName = app.firstName || app.profile?.personal?.firstName || "";
            const lName = app.lastName || app.profile?.personal?.surname || "";
            const fullName = app.name || `${fName} ${lName}`.trim().toUpperCase() || "UNKNOWN";
            const appType = app.applicantType || app.profile?.appDetails?.applicantType || app.type || "N/A";
            const city = app.presentCity || app.profile?.personal?.presAddress?.city || app.location || "N/A";
            const applyDate = app.createdAt ? new Date(app.createdAt).toISOString().split('T')[0] : (app.date || "N/A");
            const hasFinishedInterview = (actualStatus !== 'For Interview') && (
              app.isInterviewed === true ||
              app.interviewStatus === 'Passed' ||
              app.interviewStatus === 'Failed' ||
              (app.interviewScore !== undefined && app.interviewScore !== null && app.interviewScore > 0)
            );

            const firstChoice = app.profile?.appDetails?.firstChoice || app.firstChoice || "N/A";
            const secondChoice = app.profile?.appDetails?.secondChoice || app.secondChoice || "N/A";

            let slotStatus = app.slotStatus || "Pending";
            let admStatus = app.admissionStatus || app.status || "Pending";
            if (!["Admitted", "Accepted", "Forfeit", "Forfeited"].includes(slotStatus)) {
              if (["Admitted", "Confirmed", "Enrolled", "Advising Completed"].includes(admStatus) || app.status === "Enrolled") {
                slotStatus = "Admitted";
              } else if (["Forfeit", "Forfeited"].includes(admStatus)) {
                slotStatus = "Forfeit";
              } else {
                slotStatus = "Pending";
              }
            }

            return {
              id: app.applicantId || (app._id ? `2026-${app._id.toString().slice(-4).toUpperCase()}` : "UNKNOWN"),
              rawId: app._id || app.id,
              name: fullName, type: appType.toUpperCase(), location: city.toUpperCase(),
              date: applyDate, status: actualStatus, isInterviewed: hasFinishedInterview,
              admissionRemarks: app.admissionStatus || app.status,
              admissionStatus: app.admissionStatus,
              interviewStatus: app.interviewStatus,
              interviewScore: app.interviewScore,
              examStatus: app.examStatus,
              examScore: app.examScore,
              isExamined: app.isExamined === true,
              firstChoice,
              secondChoice,
              slotStatus,
              activeProgram: app.activeProgram || firstChoice,
              isRejectedFirstChoice: app.isRejectedFirstChoice === true,
              isRejectedSecondChoice: app.isRejectedSecondChoice === true,
              reconsiderationProgram: app.reconsiderationProgram || "",
              interviewDate: app.interviewDate || app.interviewSchedule || "",
              interviewSession: app.interviewSession || "Morning"
            };
          });
          setApplicants(prev => {
            if (JSON.stringify(prev) === JSON.stringify(formattedApplicants)) return prev;
            return formattedApplicants;
          });
        }
      } catch (error) { console.error("Auto-update failed:", error); }
      finally {
        timeoutId = setTimeout(fetchApplicantsOnly, 15000);
      }
    };

    let timeoutId = setTimeout(fetchApplicantsOnly, 15000); // 15 seconds
    return () => clearTimeout(timeoutId);
  }, [activeYear, isArchiveMode]);

  const filteredDashboardApplicants = useMemo(() => {
    const courses = publicSettings?.courses || [];
    const iitiCourses = courses.filter(c => 
      (c.institute && String(c.institute).toUpperCase() === "IITI") ||
      c.abbreviation === "BSIT" ||
      c.name?.toLowerCase().includes("information technology")
    );
    const iitiCourseNames = iitiCourses.map(c => c.name.toLowerCase());
    const iitiCourseAbbrs = iitiCourses.map(c => c.abbreviation?.toUpperCase()).filter(Boolean);

    return applicants.filter(app => {
      let activeProgram = app.reconsiderationProgram || (app.isRejectedFirstChoice ? app.secondChoice : app.firstChoice);
      if (!activeProgram || activeProgram === "N/A") return false;
      const lowerProg = activeProgram.toLowerCase();
      const upperProg = activeProgram.toUpperCase();

      if (iitiCourseNames.length > 0 || iitiCourseAbbrs.length > 0) {
        return (
          iitiCourseNames.some(name => lowerProg.includes(name) || name.includes(lowerProg)) ||
          iitiCourseAbbrs.some(abbr => upperProg === abbr || upperProg.includes(`- ${abbr}`) || upperProg.includes(`${abbr} -`))
        );
      }

      return lowerProg.includes("information technology") || upperProg.includes("BSIT");
    });
  }, [applicants, publicSettings]);

  const totalApplicants = backendStats?.totalApplicants ?? filteredDashboardApplicants.length;
  
  const recentApplicants = useMemo(() => {
    return filteredDashboardApplicants.filter(a => a.status === "For Interview");
  }, [filteredDashboardApplicants]);

  const forInterviewCount = backendStats?.forInterviewCount ?? recentApplicants.length;

  const normalizeAdmissionRemark = (status) => {
    const normalized = (status || "Pending").toString().trim().toUpperCase();
    if (normalized === "CONFIRMED" || normalized === "ACCEPTED" || normalized === "ADMITTED") return "Admitted";
    if (normalized === "PASSED") return "Passed";
    if (normalized === "FAILED" || normalized === "REJECTED") return "Failed";
    if (normalized === "FORFEIT" || normalized === "NO-SHOW" || normalized === "DECLINED") return "Forfeit";
    return "Pending";
  };

  const admittedApplicants = useMemo(() => {
    if (backendStats?.admittedCount !== undefined && backendStats?.admittedCount !== null) {
      return backendStats.admittedCount;
    }
    return filteredDashboardApplicants.filter(a => {
      const slotStatus = a.slotStatus || "Pending";
      const admStatus = a.admissionStatus || a.status || "Pending";
      return (
        ["Admitted", "Accepted"].includes(slotStatus) ||
        a.status === "Enrolled" ||
        ["Admitted", "Confirmed", "Advising Completed"].includes(admStatus)
      );
    }).length;
  }, [backendStats, filteredDashboardApplicants]);

  useEffect(() => {
    if (loading) return;

    // --- 1. APPLICANT TYPE DOUGHNUT CHART ---
    const shsGraduateCount = filteredDashboardApplicants.filter((a) => a.type?.includes("SHS") || a.type?.includes("SENIOR HIGH")).length;
    const transfereesCount = filteredDashboardApplicants.filter((a) => a.type?.includes("TRANSFEREE")).length;
    const alsCount = filteredDashboardApplicants.filter((a) => a.type?.includes("ALS")).length;

    if (pieChartInstance.current) pieChartInstance.current.destroy();
    if (pieChartRef.current) {
      pieChartInstance.current = new Chart(pieChartRef.current, {
        type: "doughnut",
        data: {
          labels: ["SHS Graduate", "Transferees", "ALS"],
          datasets: [{
            data: [shsGraduateCount, transfereesCount, alsCount],
            backgroundColor: ["#1e3a8a", "#d97706", "#2e522a"],
            borderColor: "#ffffff",
            borderWidth: 3,
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "65%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, boxWidth: 8, padding: 16, font: { size: 12 }, color: "#6b7280" }
            }
          }
        }
      });
    }

    // --- 2. APPLICANT PER PROGRAM BAR CHART ---
    const courses = publicSettings?.courses || [];
    const targetInst = (userInstitute && userInstitute !== "Admission") ? userInstitute : "IITI";

    // Strictly filter to normal admin's institute courses (IITI -> BSIT)
    let filteredCourses = courses.filter(c => c.institute === targetInst);
    if (filteredCourses.length === 0) {
      filteredCourses = courses.filter(c => c.abbreviation === "BSIT" || c.name?.includes("Information Technology"));
    }
    if (filteredCourses.length === 0) {
      filteredCourses = [{ abbreviation: "BSIT", name: "Bachelor of Science in Information Technology", applicationLimit: 8, limit: 4 }];
    }

    // Calculate active program for each applicant
    const programCounts = {};
    const capacities = {};

    filteredCourses.forEach(c => {
      programCounts[c.abbreviation] = 0;
      capacities[c.abbreviation] = c.applicationLimit || c.limit || 0;
    });

    filteredDashboardApplicants.forEach(app => {
      let activeProgram = app.firstChoice;
      if (app.isRejectedFirstChoice) {
        activeProgram = app.secondChoice;
        if (app.isRejectedSecondChoice || app.reconsiderationProgram) {
          activeProgram = app.reconsiderationProgram;
        }
      }

      if (!activeProgram || activeProgram === "N/A") return;

      const course = filteredCourses.find(c =>
        c.name === activeProgram ||
        activeProgram.includes(c.name) ||
        (c.abbreviation && activeProgram.includes(c.abbreviation))
      );
      if (course) {
        programCounts[course.abbreviation] = (programCounts[course.abbreviation] || 0) + 1;
      }
    });

    const abbreviations = Object.keys(programCounts);
    setBarChartCount(abbreviations.length);
    const counts = abbreviations.map(abbr => programCounts[abbr]);
    const caps = abbreviations.map(abbr => capacities[abbr]);

    // Dynamic colors based on capacity usage
    const bgColors = counts.map((count, index) => {
      const cap = caps[index];
      if (!cap || cap === 0) return "rgba(46, 82, 42, 0.85)";
      const ratio = count / cap;
      if (ratio >= 1) return "rgba(220, 38, 38, 0.85)";
      return "rgba(46, 82, 42, 0.85)";
    });

    if (barChartInstance.current) barChartInstance.current.destroy();
    if (barChartRef.current) {
      barChartInstance.current = new Chart(barChartRef.current, {
        type: "bar",
        data: {
          labels: abbreviations,
          datasets: [
            {
              label: "Applicants",
              data: counts,
              backgroundColor: bgColors,
              hoverBackgroundColor: bgColors.map(c => c.replace('0.85', '1')),
              borderRadius: 4,
              maxBarThickness: 200,
              barPercentage: 0.8,
              categoryPercentage: 0.9,
              borderSkipped: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: "#374151", font: { size: 11, weight: 'normal', family: "'Inter', sans-serif" } },
              grid: { color: "#f3f4f6", drawBorder: false },
              border: { display: false }
            },
            x: {
              ticks: { color: "#374151", font: { size: 11, weight: 'normal', family: "'Inter', sans-serif" }, autoSkip: false },
              grid: { display: false },
              border: { display: false }
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                title: (items) => {
                  if (!items.length) return '';
                  const abbr = items[0].label;
                  const c = filteredCourses.find(course => course.abbreviation === abbr);
                  return c ? c.name : abbr;
                },
                label: (context) => {
                  const count = context.raw;
                  const index = context.dataIndex;
                  const cap = caps[index];

                  if (cap && cap > 0) {
                    const ratio = count / cap;
                    let status = "";
                    if (ratio >= 1) status = " (FULL)";

                    return `Applicants: ${count} / ${cap}${status}`;
                  }
                  return `Applicants: ${count}`;
                }
              }
            }
          }
        }
      });
    }

    return () => {
      if (pieChartInstance.current) pieChartInstance.current.destroy();
      if (barChartInstance.current) barChartInstance.current.destroy();
    };
  }, [filteredDashboardApplicants, loading, userInstitute, publicSettings]);


  const getInstituteLimit = () => {
    if (!publicSettings || !publicSettings.institutes) return 30; // Default fallback
    if (userRole === "SuperAdmin") return 30; // Global, fallback
    const inst = publicSettings.institutes.find(i =>
      String(i.abbreviation).toLowerCase() === String(userInstitute).toLowerCase() ||
      String(i.name).toLowerCase() === String(userInstitute).toLowerCase()
    );
    return inst?.dailyLimit || 30;
  };

  if (loading) {
    return <PageLoader message="Loading dashboard statistics..." />;
  }

  return (
    <div className="h-full w-full bg-gray-50 font-sans overflow-hidden flex flex-col">
      <main className="flex-1 px-6 py-4 w-full overflow-y-auto">

        {/* --- ARCHIVE BANNER --- */}
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

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 mb-6">
          <KPICard title="Total Applicants" count={totalApplicants} icon={<FaUser />} accent="#1e3a8a" loading={loading} />
          <KPICard title="For Interview" count={forInterviewCount} icon={<FaClock />} accent="#d97706" loading={loading} onClick={() => navigateToTab('pre-admission-applications')} />
          <KPICard title="Admitted" count={admittedApplicants} icon={<FaUserCheck />} accent="#2e522a" loading={loading} onClick={() => navigateToTab('pre-admission-post-admission')} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Doughnut */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
            <SectionLabel icon={<FaUser className="text-[#2e522a]" />} label="Applicant Type" />
            <div className="flex-1 min-h-[220px] mt-3">
              {loading ? <ChartSkeleton /> : <canvas ref={pieChartRef} />}
            </div>
          </div>

          {/* Bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:col-span-2 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <SectionLabel icon={<FaUniversity className="text-[#2e522a]" />} label="Applications Per Program" />
            </div>
            <div className="flex-1 min-h-[220px] overflow-x-auto scrollbar-thin">
              <div style={{ minWidth: barChartCount > 8 ? `${barChartCount * 60}px` : '100%', height: '220px' }}>
                {loading ? <ChartSkeleton /> : <canvas ref={barChartRef} />}
              </div>
            </div>

            {/* Legend for Program Capacity */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-[11px] text-gray-600 font-medium">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[rgba(220,38,38,0.85)]"></span> Full Capacity</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[rgba(46,82,42,0.85)]"></span> Available</div>
            </div>
          </div>
        </div>


        {/* Bottom Section - Normal Admin For Interview Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          {/* Table Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">For Interview</span>
              <span className="bg-white text-[#2e522a] text-xs font-semibold px-2 py-0.5 rounded-full">
                {recentApplicants.length}
              </span>
            </div>
            <button
              onClick={() => navigateToTab('pre-admission-applications')}
              className="flex items-center gap-1 text-xs font-medium text-[#2e522a] hover:underline transition"
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#E4F6E2] text-[#2e522a] text-[11px] font-semibold uppercase tracking-wide">
                  <th className="px-5 py-3">ID</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Date Applied</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-16">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#376e35]"></div>
                        <span className="text-gray-500 font-medium">Loading applicants...</span>
                      </div>
                    </td>
                  </tr>
                ) : recentApplicants.length > 0 ? (
                  recentApplicants.map((app) => (
                    <tr key={app.rawId} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-left">{app.id}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-800 text-left uppercase">{app.name}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-left">{app.type}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-left">{app.location}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-left">{app.date}</td>
                      <td className="px-[14px] py-[6px] text-[12px] text-gray-600 text-left">
                        <span className={`px-2 py-1.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide border 
                        ${app.status === 'Passed' ? 'bg-green-100 text-[#376e35] border-green-200' :
                            app.status === 'Failed' ? 'bg-red-100 text-red-700 border-red-200' :
                              'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <ActionBtn title="View Details" onClick={() => navigateToTab('pre-admission-applications', { applicantId: app.rawId })} color="blue">
                            <Eye size={13} />
                          </ActionBtn>
                          <ActionBtn title={isArchiveMode ? "View Interview" : "Interview"} onClick={() => navigateToTab('pre-admission-applications', { applicantId: app.rawId, openInterview: true })} color="amber">
                            <MessageSquare size={13} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="7" className="px-5 py-10 text-center text-sm text-gray-400">No applicants pending interview.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────── */

function KPICard({ title, count, icon, accent, loading, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ borderLeftColor: accent }}
      className={`bg-white rounded-xl border border-gray-100 shadow-sm border-l-4 px-5 py-4 flex items-center justify-between transition-all
        ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""}`}
    >
      <div>
        <p className="text-[12px] font-bold text-gray-600 uppercase  mb-1">{title}</p>
        {loading ? (
          <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
        ) : (
          <p className="text-3xl font-bold text-gray-900">{count}</p>
        )}
      </div>
      <div
        style={{ backgroundColor: accent }}
        className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-base shadow-sm opacity-90"
      >
        {icon}
      </div>
    </div>
  );
}

function SectionLabel({ icon, label }) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-sm">{icon}</span>}
      <span className="text-sm font-semibold text-gray-700">{label}</span>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="space-y-2 w-full px-4">
        <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4 mx-auto" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2 mx-auto" />
        <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mx-auto" />
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, title, color }) {
  const colorMap = {
    blue: "bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-100",
    amber: "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-100",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${colorMap[color]}`}
    >
      {children}
    </button>
  );
}
