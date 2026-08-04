import { useEffect, useRef, useState, useMemo } from "react";
import api from "../../services/api";
import { FaUser, FaUserCheck, FaClock, FaMapMarkerAlt } from "react-icons/fa";
import { Eye, MessageSquare } from "lucide-react";
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController } from "chart.js";
Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, DoughnutController, BarController);

export default function Dashboard({ navigateToTab }) {
  const pieChartRef = useRef(null);
  const barChartRef = useRef(null);
  const interviewChartRef = useRef(null);
  const bcetChartRef = useRef(null);

  const pieChartInstance = useRef(null);
  const barChartInstance = useRef(null);
  const interviewChartInstance = useRef(null);
  const bcetChartInstance = useRef(null);

  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("SuperAdmin");
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
  }, [applicants, userRole, userInstitute]);

  const totalApplicants = filteredDashboardApplicants.length;
  const forInterviewCount = filteredDashboardApplicants.filter(a => a.status === "For Interview" && !a.isInterviewed).length;

  const admittedApplicants = filteredDashboardApplicants.filter(a => {
    const finalStatus = (a.admissionStatus || a.status || "").toUpperCase();

    return finalStatus === "PASSED" || finalStatus === "ADMITTED" || finalStatus === "CONFIRMED";
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

    // --- 3. INTERVIEW AND BCET DOUGHNUT CHARTS (SUPERADMIN ONLY) ---
    const PASSING_SCORE = 75;
    const getPassFailStatus = (status, score, isComplete = false) => {
      const parsedScore = Number(score);
      if (!Number.isNaN(parsedScore) && (isComplete || parsedScore > 0)) {
        return parsedScore >= PASSING_SCORE ? "Passed" : "Failed";
      }

      const normalizedStatus = (status || "").toString().trim().toUpperCase();
      if (normalizedStatus.includes("PASSED") || normalizedStatus === "ADMITTED") return "Passed";
      if (normalizedStatus.includes("FAILED")) return "Failed";

      return null;
    };

    const interviewSummary = filteredDashboardApplicants.reduce((acc, app) => {
      const result = getPassFailStatus(
        app.interviewStatus || app.status || app.admissionStatus,
        app.interviewScore,
        app.isInterviewed
      );
      if (result) acc[result] += 1;
      return acc;
    }, { Passed: 0, Failed: 0 });

    const bcetSummary = filteredDashboardApplicants.reduce((acc, app) => {
      const result = getPassFailStatus(
        app.examStatus || app.admissionStatus,
        app.examScore,
        app.isExamined
      );
      if (result) acc[result] += 1;
      return acc;
    }, { Passed: 0, Failed: 0 });

    const doughnutOptions = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, boxWidth: 8, padding: 16, font: { size: 12, weight: "bold" } }
        }
      }
    };

    if (userRole === "SuperAdmin") {
      if (interviewChartInstance.current) interviewChartInstance.current.destroy();
      if (interviewChartRef.current) {
        interviewChartInstance.current = new Chart(interviewChartRef.current, {
          type: "doughnut",
          data: {
            labels: ["Passed", "Failed"],
            datasets: [{
              data: [interviewSummary.Passed, interviewSummary.Failed],
              backgroundColor: ["#376e35", "#dc2626"],
              borderColor: "#ffffff",
              borderWidth: 3,
              hoverOffset: 4
            }]
          },
          options: doughnutOptions
        });
      }

      if (bcetChartInstance.current) bcetChartInstance.current.destroy();
      if (bcetChartRef.current) {
        bcetChartInstance.current = new Chart(bcetChartRef.current, {
          type: "doughnut",
          data: {
            labels: ["Passed", "Failed"],
            datasets: [{
              data: [bcetSummary.Passed, bcetSummary.Failed],
              backgroundColor: ["#376e35", "#dc2626"],
              borderWidth: 3,
              hoverOffset: 4
            }]
          },
          options: doughnutOptions
        });
      }
    }

    return () => {
      if (pieChartInstance.current) pieChartInstance.current.destroy();
      if (barChartInstance.current) barChartInstance.current.destroy();
      if (interviewChartInstance.current) interviewChartInstance.current.destroy();
      if (bcetChartInstance.current) bcetChartInstance.current.destroy();
    };
  }, [filteredDashboardApplicants, loading, userRole]);

  const recentApplicants = filteredDashboardApplicants.filter(a => a.status === "For Interview" && !a.isInterviewed);

  return (
    <div className="h-full w-full bg-gray-50 font-sans overflow-hidden flex flex-col transition-all duration-300 ease-in-out ml-2">

      {/* Main container */}
      <main className="flex-1 p-[10px] w-full relative overflow-y-auto ">        <div className="mb-6">

        {/* --- ARCHIVE BANNER --- */}
        {isArchiveMode ? (
          <div className="mt-2 bg-red-100 border border-red-400 text-red-700 px-3 py-1.5 rounded-md w-full flex justify-between items-center shadow-sm">
            <span className="font-bold">⚠️ YOU ARE IN ARCHIVE MODE. Viewing read-only data for AY {activeYear}.</span>
            <button onClick={exitArchiveMode} className="bg-red-700 text-white px-3 py-1 rounded text-xs uppercase font-black hover:bg-red-800 transition">Return to Live</button>
          </div>
        ) : (
          <p className="text-md text-gray-500 mt-1">
          </p>
        )}
      </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <KPICard title="Total Applicants" count={totalApplicants} icon={<FaUser />} color="bg-blue-800" />
          <KPICard title="For Interview" count={forInterviewCount} icon={<FaClock />} color="bg-yellow-500" onClick={() => navigateToTab('pre-admission-applications')} />
          <KPICard title="Admitted Applicants" count={admittedApplicants} icon={<FaUserCheck />} color="bg-[#2e522a]" onClick={() => navigateToTab('pre-admission-admission')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center">
            <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2 w-full text-left uppercase border-gray-300  border-b pb-2"><FaUser className="text-[#2e522a]" />Applicant Type</h3>
            <div className="w-full h-72"> {loading ? <div className="flex h-full items-center justify-center text-gray-400">Loading chart...</div> : <canvas ref={pieChartRef}></canvas>}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 md:col-span-2">
            <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center uppercase gap-2 border-gray-300  border-b pb-2"><FaMapMarkerAlt className="text-[#2e522a]" /> Applicant Locations</h3>
            <div className="h-64 max-w-xl"> {loading ? <div className="flex h-full items-center justify-center text-gray-400">Loading chart...</div> : <canvas ref={barChartRef}></canvas>}</div>
          </div>
        </div>

        {/* --- CONDITIONAL RENDER BASED ON ROLE --- */}
        {userRole === "SuperAdmin" ? (

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden p-6">
              <h3 className="text-base font-bold text-gray-800 uppercase tracking-wide border-b border-gray-300 pb-4 mb-4">Interview Results</h3>
              <div className="w-full h-80">
                {loading ? <div className="flex h-full items-center justify-center text-gray-400">Loading chart...</div> : <canvas ref={interviewChartRef}></canvas>}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm overflow-hidden p-6">
              <h3 className="text-base font-bold text-gray-800 uppercase tracking-wide border-b border-gray-300 pb-4 mb-4">BCET Test Results</h3>
              <div className="w-full h-80">
                {loading ? <div className="flex h-full items-center justify-center text-gray-400">Loading chart...</div> : <canvas ref={bcetChartRef}></canvas>}
              </div>
            </div>
          </div>

        ) : (

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">For Interviews <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">{recentApplicants.length}</span></h3>
              <button onClick={() => navigateToTab('pre-admission-applications')} className="text-xs text-[#2e522a] font-bold hover:underline">View All Applications</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-800 uppercase text-xs font-bold">
                  <tr><th className="p-4">ID</th><th className="p-4">Applicant Name</th><th className="p-4">Type</th><th className="p-4">Location</th><th className="p-4">Date Applied</th><th className="p-4">Status</th><th className="p-4 text-center">Action</th></tr>
                </thead>
                <tbody className="text-xs divide-y divide-gray-100">
                  {loading ? (<tr><td colSpan="7" className="p-8 text-center text-gray-400 italic">Loading applicants...</td></tr>
                  ) : recentApplicants.length > 0 ? (
                    recentApplicants.map((app) => (
                      <tr key={app.rawId} className="hover:bg-[#fafdfa] transition">
                        <td className="px-4 py-2 text-xs text-gray-600 ">{app.id}</td>
                        <td className="px-4 py-2 text-xs text-gray-800  uppercase">{app.name}</td>
                        <td className="px-4 py-2 text-xs text-gray-600  uppercase">{app.type}</td>
                        <td className="px-4 py-2 text-xs text-gray-600  uppercase">{app.location}</td>
                        <td className="px-4 py-2 text-xs text-gray-600 ">{app.date}</td>
                        <td className="px-4"><span className="px-3 py-1.5 rounded-md text-[11px] font-extrabold uppercase tracking-wide border bg-yellow-100 text-yellow-800 border-yellow-200">{app.status}</span></td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => navigateToTab('pre-admission-applications', { applicantId: app.rawId })} className="flex items-center justify-center w-8 h-8 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg transition-all shadow-sm" title="View Details"><Eye size={16} /></button>
                            <button onClick={() => navigateToTab('pre-admission-applications', { applicantId: app.rawId, openInterview: true })} className="flex items-center justify-center w-8 h-8 bg-yellow-50 hover:bg-yellow-100 text-orange-500 border border-yellow-200 rounded-lg transition-all shadow-sm" title={isArchiveMode ? "View Interview" : "Interview"}><MessageSquare size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (<tr><td colSpan="7" className="p-8 text-center text-gray-400 italic">No applicants found.</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

        )}

      </main>
    </div>
  );
}

function KPICard({ title, count, icon, color, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white p-8 rounded-xl shadow-sm border-l-4 border-l-[#2e522a] flex items-center justify-between hover:shadow-md transition ${onClick ? 'cursor-pointer hover:scale-[1.02]' : ''}`}>
      <div><p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">{title}</p><h3 className="text-3xl font-black text-gray-800">{count}</h3></div>
      <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white text-lg shadow-lg`}>{icon}</div>
    </div>
  );
}