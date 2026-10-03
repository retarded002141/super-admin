import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import api, { BASE_URL } from "../../services/api";
import { getImageUrl } from "../../utils/imageHelper.jsx";

export default function Header({ hideOnTop = false }) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const [profilePhoto, setProfilePhoto] = useState(null);
  const [systemInfo, setSystemInfo] = useState({
    schoolName: "BALIWAG POLYTECHNIC COLLEGE",
    logo: "/img/btech.png",
  });
  const token = localStorage.getItem("studentToken");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.get('/public/settings');
        if (res.data) {
          setSystemInfo(prev => ({
            ...prev,
            schoolName: res.data.schoolName || "DALUBHASAANG POLETIKNIKO NG LUNGSOD NG BALIWAG (BTECH)",
          }));
        }
      } catch (err) {
        console.error("Failed to load system settings");
      }
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchStudentProfile = async () => {
      try {
        const currentToken = localStorage.getItem("studentToken");
        if (!currentToken) return;

        try {
          const payload = JSON.parse(atob(currentToken.split('.')[1]));
          if (payload.role !== 'applicant') return;
        } catch (e) {
          return;
        }

        const res = await api.get("/applicant/profile");
        if (res.data && res.data.photo) {
          setProfilePhoto(getImageUrl(res.data.photo));
        }
      } catch (err) {
        if (err.response?.status !== 403) {
          console.error("HEADER PROFILE ERROR:", err);
        }
      }
    };

    fetchStudentProfile();

    window.addEventListener('studentProfileUpdated', fetchStudentProfile);

    return () => window.removeEventListener('studentProfileUpdated', fetchStudentProfile);
  }, []);

  useEffect(() => {
    if (!hideOnTop) return;
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hideOnTop]);

  const handleLogout = () => {
    localStorage.removeItem("studentToken");
    console.log("Session cleared. Redirecting...");
    setShowConfirm(false);
    navigate("/");
  };

  const headerClass = hideOnTop
    ? `bg-[#376e35] text-white shadow-md w-full fixed top-0 left-0 z-50 transition-transform duration-300 ${isScrolled ? 'translate-y-0' : '-translate-y-full'}`
    : "bg-[#376e35] text-white shadow-md w-full relative z-50";

  return (
    <>
      <header className={headerClass}>
        <div className="flex justify-between items-center px-2 sm:px-4 py-1 md:py-4 gap-3">

          {/*  Logo and Title Group */}
          <div className="flex items-center gap-2 sm:gap-4 flex-1 overflow-hidden">
            <div className="flex shrink-0">
              <img
                src={systemInfo.logo}
                alt="BTECH"
                className="bg-white rounded-full h-8 w-8 xs:h-10 xs:w-10 sm:h-12 sm:w-12 md:h-14 md:w-14 object-contain drop-shadow-md"
              />
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="font-bold font-sans uppercase tracking-wider leading-[1.1]
                               text-[12px] xs:text-[11px] sm:text-base md:text-xl lg:text-2xl
                               text-white drop-shadow-sm">
                {systemInfo.schoolName}
              </h1>
            </div>
          </div>

          {/*  Logout Button*/}
          {token && (
            <div className="shrink-0 pl-2 sm:pl-4 flex items-center gap-3">
              <button
                onClick={() => setShowConfirm(true)}
                title="Logout"
                className="p-2 rounded-full hover:bg-white/20 text-green-100 hover:text-white transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-white/50 active:scale-95"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 sm:h-7 sm:w-7 md:h-8 md:w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="w-full border-t border-white/10" aria-hidden="true"></div>
      </header>

      {/* Logout Confirmation Modal */}
      {showConfirm && token && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto">
          <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setShowConfirm(false)}
          ></div>

          <div className="relative bg-white rounded-md shadow-md max-w-sm w-full p-6 md:p-8 transform transition-all scale-100 animate-in fade-in zoom-in duration-200 ">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-5 shadow-inner">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>

              <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight mb-2">
                Are you sure you <br />want to log out?
              </h2>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md uppercase text-xs tracking-widest border border-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 px-4 py-3.5 bg-[#376e35] hover:bg-green-600 text-white font-bold rounded-md uppercase text-xs tracking-widest "
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}