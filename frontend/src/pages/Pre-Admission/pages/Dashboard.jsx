import { useEffect, useRef, useState, useMemo } from "react";
import api from "../../../services/api";
import { FaUser, FaUserCheck, FaClock, FaMapMarkerAlt } from "react-icons/fa";
import { Eye, MessageSquare } from "lucide-react";
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineElement, PointElement, LineController, Filler } from "chart.js";
Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController, LineElement, PointElement, LineController, Filler);

export default function Dashboard({ navigateToTab }) {
  const pieChartRef = useRef(null);
  const barChartRef = useRef(null);
  const timelineChartRef = useRef(null);

  const pieChartInstance = useRef(null);
  const barChartInstance = useRef(null);
  const timelineChartInstance = useRef(null);

  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userInstitute, setUserInstitute] = useState("IITI");

  // --- ARCHIVE STATE ---
  const [activeYear, setActiveYear] = useState("");
  const [isArchiveMode, setIsArchiveMode] = useState(false);

  const exitArchiveMode = () => {
    sessionStorage.removeItem("archiveViewYear");
    window.location.reload();
  };

  useEffect(() => {
    // Fetch user profile
    const fetchUserProfile = async () => {
      try {
        const res = await api.get('/admin/profile');
        if (res.data) {
          setUserInstitute(res.data.institute || "IITI");
        }
      } catch (err) {
        console.error("Failed to fetch profile for role checking", err);
      }
    };

    // Fetch Applicants
    const fetchApplicants = async () => {
      try {
        const settingsRes = await api.get('/public/settings');
        const archiveYear = sessionStorage.getItem("archiveViewYear");
        const currentViewYear = archiveYear || settingsRes.data.schoolYear;

        setActiveYear(currentViewYear);
        if (archiveYear) setIsArchiveMode(true);

        const res = await api.get('/admin/applicants', { params: { schoolYear: currentViewYear } });

        if (res.data && Array.isArray(res.data)) {
          const activeApplicants = res.data.filter(app => !currentViewYear || app.schoolYear === currentViewYear);

          const formattedApplicants = activeApplicants.map(app => {
            const rawStatus = app.status;
            const actualStatus = (rawStatus === 'Pending Interview' || rawStatus === 'Pending' || rawStatus?.toLowerCase() === 'pending')
              ? 'For Interview' : (rawStatus || 'For Interview');

            const fName = app.firstName || app.profile?.personal?.firstName || "";
            const lName = app.lastName || app.profile?.personal?.surname || "";
            const fullName = app.name || `${fName} ${lName}`.trim().toUpperCase() || "UNKNOWN";
            const appType = app.applicantType || app.profile?.appDetails?.applicantType || app.type || "N/A";
            const city = app.presentCity || app.profile?.personal?.presAddress?.city || app.location || "N/A";
            const applyDate = app.createdAt ? new Date(app.createdAt).toISOString().split('T')[0] : (app.date || "N/A");
            const hasFinishedInterview = app.isInterviewed === true || app.interviewStatus === 'Passed' || app.interviewStatus === 'Failed' || (app.interviewScore !== undefined && app.interviewScore !== null && app.interviewScore > 0);

            // Extract Course Choices
            const firstChoice = app.profile?.appDetails?.firstChoice || app.firstChoice || "N/A";
            const secondChoice = app.profile?.appDetails?.secondChoice || app.secondChoice || "N/A";

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
              secondChoice
            };
          });
          setApplicants(formattedApplicants);
        }
      } catch (error) { console.error(error); } finally { setLoading(false); }
    };

    fetchUserProfile().then(() => fetchApplicants());
  }, []);

  const filteredDashboardApplicants = useMemo(() => {
    return applicants;
  }, [applicants, userInstitute]);

  const totalApplicants = filteredDashboardApplicants.length;
  const forInterviewCount = filteredDashboardApplicants.filter(a => a.status === "For Interview" && !a.isInterviewed).length;

  const admittedApplicants = filteredDashboardApplicants.filter(a => {
    // Rely purely on the admissionStatus column which we now heavily control.
    const status = String(a.admissionStatus || "").trim().toUpperCase();

    // Strict matching: Only count them if their core admission journey is Passed or Confirmed.
    return status === "PASSED" || status === "CONFIRMED";
  }).length;

  useEffect(() => {
    if (loading || filteredDashboardApplicants.length === 0) return;

    const btechPalette = ["#1e3a8a", "#eab308", "#376e35", "#dc2626"];

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
            backgroundColor: [btechPalette[0], btechPalette[1], btechPalette[2]],
            borderColor: "#ffffff",
            borderWidth: 3,
            hoverOffset: 4,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 15, font: { size: 13, weight: "normal" } } } } }
      });
    }

    // --- 2. LOCATION BAR CHART ---
    const locationCounts = filteredDashboardApplicants.reduce((acc, curr) => {
      const loc = curr.location && curr.location !== "UNKNOWN" && curr.location !== "N/A" ? curr.location : "Other";
      acc[loc] = (acc[loc] || 0) + 1; return acc;
    }, {});
    const sortedLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    if (barChartInstance.current) barChartInstance.current.destroy();
    if (barChartRef.current) {
      barChartInstance.current = new Chart(barChartRef.current, {
        type: "bar",
        data: {
          labels: sortedLocations.map(i => i[0]),
          datasets: [{
            label: "Number of Applicants",
            data: sortedLocations.map(i => i[1]),
            backgroundColor: sortedLocations.map((_, index) => btechPalette[index % btechPalette.length]),
            borderRadius: 5
          }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { display: false } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
      });
    }



    // --- 4. APPLICATION TIMELINE LINE CHART ---
    const validDates = filteredDashboardApplicants
      .map(a => new Date(a.date))
      .filter(d => !isNaN(d));

    let chartLabels = [];
    let timelineData = {};

    if (validDates.length === 0) {
      chartLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      timelineData = chartLabels.reduce((acc, m) => ({ ...acc, [m]: 0 }), {});
    } else {
      const minDate = new Date(Math.min(...validDates));
      const maxDate = new Date(Math.max(...validDates));

      let currentDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

      while (currentDate <= endDate) {
        const monthYear = currentDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        chartLabels.push(monthYear);
        timelineData[monthYear] = 0;
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    filteredDashboardApplicants.forEach(app => {
      if (app.date && app.date !== "N/A") {
        const dateObj = new Date(app.date);
        if (!isNaN(dateObj)) {
          const key = validDates.length === 0
            ? dateObj.toLocaleString('default', { month: 'short' })
            : dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });

          if (timelineData[key] !== undefined) {
            timelineData[key] += 1;
          }
        }
      }
    });

    if (timelineChartInstance.current) timelineChartInstance.current.destroy();
    if (timelineChartRef.current) {
      timelineChartInstance.current = new Chart(timelineChartRef.current, {
        type: "line",
        data: {
          labels: chartLabels,
          datasets: [{
            label: "Applications",
            data: chartLabels.map(m => timelineData[m]),
            borderColor: "#2e522a",
            backgroundColor: "rgba(46, 82, 42, 0.08)",
            borderWidth: 2,
            pointBackgroundColor: "#2e522a",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: 4,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, color: "#9ca3af", font: { size: 11 } }, grid: { color: "#f3f4f6" }, border: { display: false } },
            x: { ticks: { color: "#6b7280", font: { size: 11 } }, grid: { display: false }, border: { display: false } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { title: (context) => context[0].label } }
          }
        }
      });
    }

    return () => {
      if (pieChartInstance.current) pieChartInstance.current.destroy();
      if (barChartInstance.current) barChartInstance.current.destroy();

      if (timelineChartInstance.current) timelineChartInstance.current.destroy();
    };
  }, [filteredDashboardApplicants, loading]);

  const recentApplicants = filteredDashboardApplicants.filter(a => a.status === "For Interview" && !a.isInterviewed);

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
          <KPICard title="Admitted" count={admittedApplicants} icon={<FaUserCheck />} accent="#2e522a" loading={loading} onClick={() => navigateToTab('pre-admission-admission')} />
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
            <SectionLabel icon={<FaMapMarkerAlt className="text-[#2e522a]" />} label="Applicant Locations" />
            <div className="flex-1 min-h-[220px] mt-3">
              {loading ? <ChartSkeleton /> : <canvas ref={barChartRef} />}
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <SectionLabel label="Monthly Applicant Trend" />
          <div className="h-72 mt-3">
            {loading ? <ChartSkeleton /> : <canvas ref={timelineChartRef} />}
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
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
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