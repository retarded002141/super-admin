import { useState, useRef, useEffect } from "react";
import Sidebar from "../../components/admin/Sidebar.jsx";
import { Mail, Briefcase, User, X, Camera, ArrowLeft, Eye, EyeOff, Shield, Key } from "lucide-react"; 
import api from "../../services/api";
import { getImageUrl } from "../../utils/imageHelper.jsx";
import AdminHeader from "../../components/admin/AdminHeader";
import { useToast } from "../../context/ToastContext.jsx";
import { PageLoader } from "../../components/Loaders.jsx";

export default function Profile() {
  const { toast } = useToast();
  const [profile, setProfile] = useState({
    username: "", 
    email: "", 
    role: "Administrator", 
    roleDisplay: "Admin",
  });
  const [tempProfile, setTempProfile] = useState(profile);
  const [profileImage, setProfileImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });

  const fetchAdminProfile = async () => {
    try {
      const res = await api.get('/admin/profile');
      if (res.data) {
        const fetchedProfile = {
          username: res.data.username || res.data.name || "IITIAdmin",
          email: res.data.email || "admin.iiti@gmail.com",
          role: res.data.role || res.data.position || "Administrator", 
          roleDisplay: "Admin",
        };
        setProfile(fetchedProfile);
        setTempProfile(fetchedProfile);
        
        if (res.data.image) {
          const imageUrl = getImageUrl(res.data.image);
          const separator = imageUrl.includes('?') ? '&' : '?';
          setProfileImage(`${imageUrl}${separator}t=${new Date().getTime()}`);
        }
      }
    } catch (error) {
      console.error("Failed to fetch admin profile:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminProfile();
  }, []);

  // === Profile Edit ===
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setTempProfile({ ...tempProfile, [name]: value });
  };

  const handleSaveProfile = async () => {
    const username = tempProfile.username.trim();
    if (!username) {
      toast.warning("Username is required.");
      return;
    }

    setIsSaving(true);
    try {
      await api.put('/admin/profile', {
        username
      });
      setProfile(prev => ({ ...prev, username }));
      setTempProfile(prev => ({ ...prev, username }));
      setIsEditing(false);
      window.dispatchEvent(new Event('profileUpdated')); 
    } catch {
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setTempProfile(profile);
    setIsEditing(false);
  };

  // === Image Upload ===
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const localUrl = URL.createObjectURL(file);
      setProfileImage(localUrl);

      const formData = new FormData();
      formData.append("image", file);
      formData.append("username", profile.username);
      
      try {
        const res = await api.put('/admin/profile', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        const uploadedImage = res.data.image || res.data.profile?.image;
        if (uploadedImage) {
            const imageUrl = getImageUrl(uploadedImage);
            const separator = imageUrl.includes('?') ? '&' : '?';
            setProfileImage(`${imageUrl}${separator}t=${new Date().getTime()}`);
        } else {
            fetchAdminProfile();
        }
        
        window.dispatchEvent(new Event('profileUpdated')); 
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Failed to upload image. Please check your backend storage.");
      }
    }
  };

  const closePasswordModal = () => {
    setIsChangingPassword(false);
    setIsForgotPasswordMode(false); 
    setPasswords({ current: "", new: "", confirm: "" });
  };

  // ===  Change Password Logic ===
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
        toast.warning("New passwords do not match!");
        return;
    }
    
    setIsUpdatingPassword(true);
    try {
        const res = await api.put('/admin/change-password', {
            currentPassword: passwords.current,
            newPassword: passwords.new
        });
        toast.success(res.data?.msg || "Password successfully updated!");
        closePasswordModal();
    } catch (err) {
        toast.error(err.response?.data?.msg || "Failed to update password. Check your current password.");
    } finally {
        setIsUpdatingPassword(false);
    }
  };

  // ===  Send Reset Link / Temporary Password Logic ===
  const handlePasswordReset = async (e) => {
      e.preventDefault();
      if (!profile.email) {
          toast.warning("No email address is associated with this profile.");
          return;
      }

      setIsSendingReset(true);
      try {
          const res = await api.post('/admin/forgot-password', { email: profile.email });
          toast.success(res.data?.msg || `A password reset email has been sent to ${profile.email}!`);
          closePasswordModal();
      } catch (error) {
          console.error("Reset Error:", error);
          toast.error(error.response?.data?.msg || "Failed to send reset link. Please try again.");
      } finally {
          setIsSendingReset(false);
      }
  };

  if (loading) {
    return <PageLoader message="Loading profile..." />;
  }

  return (
    <div className="bg-gray-50 min-h-screen w-full font-sans">
      <main className=" w-full p-6 lg:p-8">
        
        <div className="mb-8">
            <AdminHeader title="My Profile" subtitle="Manage your account details" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Profile Picture Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center text-center">
              <div className="relative group mb-6">
                <div 
                  onClick={() => fileInputRef.current.click()}
                  className="h-32 w-32 rounded-full ring-4 ring-gray-50 flex items-center justify-center cursor-pointer overflow-hidden transition-transform hover:scale-105 bg-gray-100"
                >
                  {profileImage ? (
                    <img 
                      src={profileImage} 
                      alt="Admin" 
                      className="h-full w-full object-cover" 
                      onError={() => setProfileImage(null)} 
                    />
                  ) : (
                    <User size={56} className="text-gray-400" />
                  )}
                  
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white mb-1" size={24} />
                    <span className="text-white text-xs font-semibold uppercase tracking-wider">Upload</span>
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>

              <h2 className="text-xl font-bold text-gray-900">{profile.username}</h2>
              <p className="text-[#376e35] font-medium text-[12px] mt-1">{profile.role}</p>
            </div>
          </div>

          {/* Info & Settings */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Personal Information Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-white">
                <div>
                  <h3 className="text-[16px] font-bold text-gray-900">Personal Information</h3>
                </div>
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="text-[12px] bg-gray-50 hover:bg-gray-100 text-gray-700 px-[14px] py-[6px] rounded-lg font-semibold transition border border-gray-200">
                    Edit Details
                  </button>
                )}
              </div>

              <div className="p-6 sm:p-8">
                <div className="space-y-2">
                  <InfoItem 
                    icon={<User size={20} />} 
                    label="Username"
                    value={isEditing ? tempProfile.username : profile.username}
                    isEditing={isEditing}
                    name="username" 
                    onChange={handleInputChange}
                    editable
                  />
                  <InfoItem 
                    icon={<Mail size={20} />}
                    label="Email Address"
                    value={isEditing ? tempProfile.email : profile.email}
                    isEditing={isEditing}
                    name="email"
                    onChange={handleInputChange}
                  />
                  <InfoItem 
                    icon={<Briefcase size={20} />} 
                    label="Role"
                    value={isEditing ? tempProfile.role : profile.role}
                    isEditing={isEditing}
                    name="role" 
                    onChange={handleInputChange}
                  />
                </div>

                {isEditing && (
                  <div className="mt-8 flex gap-3 justify-end border-t border-gray-100 pt-6">
                    <button onClick={handleCancelEdit} className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-50 transition">
                      Cancel
                    </button>
                    <button onClick={handleSaveProfile} disabled={isSaving} className={`px-6 py-2 rounded-lg font-semibold text-white transition ${isSaving ? 'bg-green-400 cursor-wait' : 'bg-[#376e35] hover:bg-green-800 shadow-sm'}`}>
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Security Settings Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-gray-100 bg-white">
                <h3 className="text-[16px] font-bold text-gray-900">Security</h3>
                <p className="text-[12px] text-gray-500 mt-1">Manage your password and security settings.</p>
              </div>
              <div className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                       <Key size={18} className="text-gray-400"/> Account Password
                    </h4>
                  </div>
                  <button 
                    onClick={() => setIsChangingPassword(true)}
                    className="whitespace-nowrap bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-[18px] py-[6px] rounded-lg font-semibold transition"
                  >
                    Change Password
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* === Change Password Modal === */}
      {isChangingPassword && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 sm:p-8 relative animate-fade-in border border-gray-100">
            <button onClick={closePasswordModal} className="absolute top-5 right-5 text-gray-400 hover:text-gray-800 transition-colors bg-gray-50 rounded-full p-1">
              <X size={20} />
            </button>
            
            {!isForgotPasswordMode ? (
              <>
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <Shield className="text-[#376e35]" size={24}/> Change Password
                </h3>
                <form className="space-y-5" onSubmit={handlePasswordUpdate}>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[12px] font-medium text-gray-700">Current Password</label>
                      <button type="button" onClick={() => setIsForgotPasswordMode(true)} className="text-xs text-[#376e35] hover:text-green-800 font-medium hover:underline">
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                        <input 
                            type={showPasswords.current ? "text" : "password"} 
                            required 
                            value={passwords.current}
                            onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                            className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-600 focus:border-transparent focus:bg-white outline-none transition-all" 
                        />
                        <button type="button" onClick={() => setShowPasswords({...showPasswords, current: !showPasswords.current})} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                            {showPasswords.current ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                    </div>
                  </div>
                  
                  <div className="w-full h-px bg-gray-100 my-2"></div>

                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 mb-1.5">New Password</label>
                    <div className="relative">
                        <input 
                            type={showPasswords.new ? "text" : "password"} 
                            required 
                            value={passwords.new}
                            onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                            className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-600 focus:border-transparent focus:bg-white outline-none transition-all" 
                        />
                        <button type="button" onClick={() => setShowPasswords({...showPasswords, new: !showPasswords.new})} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                            {showPasswords.new ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                    <div className="relative">
                        <input 
                            type={showPasswords.confirm ? "text" : "password"} 
                            required 
                            value={passwords.confirm}
                            onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                            className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-600 focus:border-transparent focus:bg-white outline-none transition-all" 
                        />
                        <button type="button" onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                            {showPasswords.confirm ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end gap-3">
                    <button type="button" onClick={closePasswordModal} className="px-[18px] py-[6px].5 text-gray-700 font-medium bg-gray-100 hover:bg-gray-200 rounded-xl transition">Cancel</button>
                    <button type="submit" disabled={isUpdatingPassword} className={`px-[18px] py-[6px].5 font-medium rounded-xl text-white transition shadow-sm ${isUpdatingPassword ? 'bg-green-500 cursor-wait' : 'bg-[#376e35] hover:bg-green-800'}`}>
                      {isUpdatingPassword ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => setIsForgotPasswordMode(false)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 text-gray-500 transition">
                    <ArrowLeft size={20} />
                  </button>
                  <h3 className="text-xl font-bold text-gray-900">Reset Password</h3>
                </div>
                <p className="text-gray-500 text-[12px] mb-6 leading-relaxed">
                  Click the button below and we'll send instructions/credentials to the email associated with your account to securely access your profile.
                </p>
                <form className="space-y-5" onSubmit={handlePasswordReset}>
                  <div>
                    <label className="block text-[12px] font-medium text-gray-700 mb-1.5">Email Address</label>
                    <input 
                        type="email" 
                        readOnly
                        defaultValue={profile.email} 
                        className="w-full px-[14px] py-[6px].5 bg-gray-100 border border-gray-200 text-gray-500 rounded-xl focus:outline-none cursor-not-allowed" 
                    />
                  </div>
                  <div className="pt-2 flex flex-col gap-3">
                    <button type="submit" disabled={isSendingReset} className={`w-full px-4 py-3 font-medium rounded-xl text-white transition shadow-sm ${isSendingReset ? 'bg-green-500 cursor-wait' : 'bg-[#376e35] hover:bg-green-800'}`}>
                      {isSendingReset ? "Sending Request..." : "Send Reset Email"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// === Helper Component ===
function InfoItem({ icon, label, value, isEditing, name, onChange, editable = false }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-4 border-b border-gray-50 last:border-0 gap-2 sm:gap-6">
      <div className="flex items-center gap-3 sm:w-1/3">
        <div className="p-2 bg-green-50 text-[#376e35] rounded-lg shrink-0">
          {icon}
        </div>
        <span className="text-[12px] font-medium text-gray-600">{label}</span>
      </div>
      <div className="sm:w-2/3">
        {isEditing && editable ? (
          <input 
            type="text" 
            name={name}
            value={value}
            required
            onChange={onChange}
            className="w-full max-w-md px-[14px] py-[6px] bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-600 focus:bg-white focus:outline-none transition-all"
          />
        ) : (
          <p className="text-[15px] font-medium text-gray-900">{value}</p>
        )}
      </div>
    </div>
  );
}