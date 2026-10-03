import { useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useSessionTimeout } from "../../utils/useSessionTimeout";
import api from "../../services/api";
import { Lock, LogOut, Eye, EyeOff } from "lucide-react";

function SessionLockScreen({ onUnlock }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/admin/verify-password", { password });
      onUnlock();
      setPassword("");
    } catch {
      setError("Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin_login");
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-lg">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-[#376e35] p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-3">
            <Lock size={32} className="text-white" />
          </div>
          <h2 className="text-white font-bold text-xl">Session Locked</h2>
          <p className="text-green-100 text-sm mt-1 text-center">
            You were inactive for 15 minutes.
          </p>
        </div>
        <form onSubmit={handleUnlock} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">
              Enter your password to continue
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-[#376e35] focus:ring-2 focus:ring-[#376e35]/20"
                placeholder="Password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {error && <p className="text-red-500 text-xs mt-1.5 font-medium">{error}</p>}
          </div>
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full py-2.5 bg-[#376e35] hover:bg-[#2c582a] text-white font-bold rounded-lg text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Unlock"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2.5 border border-gray-300 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg text-sm transition flex items-center justify-center gap-2"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { isLocked, unlock } = useSessionTimeout();
  const adminToken = localStorage.getItem("adminToken");

  if (!adminToken || adminToken === "undefined") {
    return <Navigate to="/admin_login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Wrapped Outlet in flex-1 to force the dashboard to fill the remaining space */}
      <main className={`flex-1 w-full h-full overflow-y-auto transition-all ${isLocked ? "blur-sm pointer-events-none select-none" : ""}`}>
        <Outlet context={{ isSidebarOpen }} />
      </main>

      {isLocked && <SessionLockScreen onUnlock={unlock} />}
    </div>
  );
}
