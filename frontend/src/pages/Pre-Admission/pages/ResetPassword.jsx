import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext.jsx";
import { Shield, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [passwords, setPasswords] = useState({ new: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toast.warning("Passwords do not match!");
      return;
    }

    setLoading(true);
    try {
      // Calls your new backend route: POST /admin/reset-password/:token
      const res = await api.post(`/admin/reset-password/${token}`, { 
        password: passwords.new 
      });
      toast.success(res.data.msg || "Password reset successfully!");
      navigate("/admin_login");
    } catch (err) {
      toast.error(err.response?.data?.msg || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="text-green-700" /> Set New Password
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input 
              type={show ? "text" : "password"}
              required
              value={passwords.new}
              onChange={(e) => setPasswords({...passwords, new: e.target.value})}
              className="w-full px-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-green-600 outline-none"
            />
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input 
              type={show ? "text" : "password"}
              required
              value={passwords.confirm}
              onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
              className="w-full px-4 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-green-600 outline-none"
            />
          </div>

          <button 
            type="button" 
            onClick={() => setShow(!show)}
            className="text-sm text-green-700 font-medium hover:underline flex items-center gap-1"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />} 
            {show ? "Hide Passwords" : "Show Passwords"}
          </button>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-green-700 text-white font-bold rounded-lg hover:bg-green-800 transition disabled:bg-gray-400"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}