import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { Eye, EyeOff } from "lucide-react";
import { useToast } from "../../context/ToastContext.jsx";
import { ButtonSpinner } from "../../components/Loaders.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [otp, setOtp] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !password.trim()) {
      toast.warning("Please enter email and password.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/admin/login", {
        email: email.trim().toLowerCase(),
        password: password.trim()
      });

      if (response.data.requires2FA) {
        setNeeds2FA(true);
      } else if (response.data.token) {
        localStorage.setItem("adminToken", response.data.token);
        try {
          const settingsRes = await api.get("/admin/settings");
          if (!settingsRes.data.schoolYear) {
            navigate("/admin_settings");
            return;
          }
        } catch (e) {
          console.error("Failed to fetch settings during login:", e);
        }
        navigate("/admin_dashboard");
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || err.response?.data?.msg || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!otp.trim()) {
      toast.warning("Please enter the verification code.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/admin/verify-2fa", {
        email: email.trim().toLowerCase(),
        otp: otp.trim()
      });

      localStorage.setItem("adminToken", response.data.token);
      try {
        const settingsRes = await api.get("/admin/settings");
        if (!settingsRes.data.schoolYear) {
          navigate("/admin_settings");
          return;
        }
      } catch (e) {
        console.error("Failed to fetch settings during login:", e);
      }
      navigate("/admin_dashboard");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Verification failed. The code may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (loading) return; // Prevents double-click race condition
    try {
      setLoading(true);
      // Force the reset email to lowercase so it perfectly matches the database
      const res = await api.post("/admin/forgot-password", { email: resetEmail.trim().toLowerCase() });
      toast.success(res.data.msg);
      setIsModalOpen(false);
      setResetEmail("");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to reset password. Please check the email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center p-4 font-sans">
      <main className="w-full max-w-md lg:max-w-lg transition-all duration-300">
        <section className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 md:p-8">
          <div className="flex flex-col items-center space-y-2">
            <div className="flex">
              <img src="/img/btech.png" alt="BTECH logo" className="h-16 w-16 object-contain" />
            </div>
            <div className="text-center">
              <h4 className="text-[#2e522a] font-extrabold text-3xl tracking-tight">BTECH PRE-ADMISSION</h4>
              <p className="text-gray-600 font-medium mt-1">Pre-Admission Management System</p>
            </div>
          </div>

          {needs2FA ? (
            <form onSubmit={handleVerify2FA} className="mt-8 text-center bg-green-50 p-6 rounded-xl border border-green-200 animate-in fade-in zoom-in duration-300">
              <h3 className="text-lg font-bold text-[#2e522a]  mb-2">Two-Factor Authentication</h3>
              <p className="text-gray-700 text-sm mb-4">A 6-digit verification code has been sent to your email.</p>
              <input
                type="text"
                maxLength="6"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit Code"
                required
                className="w-full text-center tracking-[0.5em] font-bold text-xl bg-white border border-green-300 rounded-xl px-3 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2e522a] text-white py-3 rounded-xl font-bold hover:bg-[#203a1d] transition-colors disabled:opacity-70 mb-3"
              >
                {loading ? <><ButtonSpinner /> Verifying...</> : "Verify Code"}
              </button>
              <button
                type="button"
                onClick={() => { setNeeds2FA(false); setOtp(""); }}
                className="text-sm font-bold text-[#2e522a] underline hover:text-green-900"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5 animate-in fade-in duration-300">
              <div className="space-y-1">
                <label className="font-bold text-gray-700 text-sm block">Email Address</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com" required
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-700 text-sm block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password" required
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-700">
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button type="button" onClick={() => setIsModalOpen(true)} className="text-sm font-semibold text-gray-600 hover:text-green-700 hover:underline">
                  Forgot Password?
                </button>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={loading} className="w-full bg-[#2e522a] text-white py-3 rounded-xl font-bold shadow-md hover:bg-[#203a1d] transition-colors disabled:opacity-70">
                  {loading ? <><ButtonSpinner /> Authenticating...</> : "Login"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
            <h3 className="text-2xl font-extrabold text-[#2e522a] mb-2">Reset Password</h3>
            <p className="text-gray-600 text-sm mb-5">Enter your email address below to reset your password.</p>
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <input
                type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                placeholder="name@example.com" required
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="w-1/2 bg-gray-100 py-3 rounded-xl font-bold hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={loading} className="w-1/2 bg-[#2e522a] text-white py-3 rounded-xl font-bold hover:bg-[#203a1d] transition-colors disabled:opacity-70">
                  {loading ? <><ButtonSpinner /> Sending...</> : "Send Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
