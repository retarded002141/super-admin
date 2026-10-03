import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { FaCog, FaUser } from "react-icons/fa";
import api from "../../services/api.js";
import { getImageUrl } from "../../utils/imageHelper.jsx";

export default function Sidebar({ username = "admin" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isExpanded, setIsExpanded] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState("all");

  // State for dynamic profile data matching the exact database schema from Profile.jsx
  const [profileImage, setProfileImage] = useState(null);
  const [profileName, setProfileName] = useState(username);
  const [profileRole, setProfileRole] = useState("Administrator");

  const notifRef = useRef(null);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const res = await api.get('/admin/profile');
        if (res.data) {
          if (res.data.image) {
            const imageUrl = getImageUrl(res.data.image);
            setProfileImage(`${imageUrl}?t=${new Date().getTime()}`);
          } else {
            setProfileImage(null);
          }

          setProfileName(res.data.name || res.data.username || "Administrator");
          setProfileRole(res.data.role || res.data.position || "Admin");
        }
      } catch (error) {
        console.error("Failed to fetch profile data", error);
      }
    };

    const fetchNotifications = async () => {
      try {
        const res = await api.get('/notifications');
        setNotifications(res.data);
      } catch (error) {
        console.error("Failed to fetch notifications", error);
      }
    };

    fetchProfileData();
    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications();
      fetchProfileData();
    }, 30000);

    window.addEventListener('profileUpdated', fetchProfileData);

    return () => {
      clearInterval(interval);
      window.removeEventListener('profileUpdated', fetchProfileData);
    };
  }, [username]);

  const handleLogoutClick = () => setShowLogoutModal(true);
  const confirmLogout = () => {
    localStorage.removeItem("adminToken");
    sessionStorage.removeItem("archiveViewYear");
    setShowLogoutModal(false);
    navigate("/admin_login", { replace: true });
  };

  const markAllAsRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, isUnread: false })));
      await api.put('/notifications/read-all');
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const clearAllNotifications = async () => {
    if (!window.confirm("Are you sure you want to permanently delete all notifications?")) return;
    try {
      await api.delete('/notifications/clear-all');
      setNotifications([]);
    } catch (err) {
      console.error("Failed to clear notifications", err);
    }
  };

  const markAsRead = async (id) => {
    try {
      setNotifications(prev => prev.map(n =>
        (n._id === id || n.id === id) ? { ...n, isUnread: false } : n
      ));
      await api.put(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Failed to mark as read", err);
    }
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notifRef]);

  const getNavClass = (path) => {
    const isActive = location.pathname === path;
    return `flex items-center gap-4 p-3 rounded-lg transition-all overflow-hidden ${isActive
      ? "bg-white text-[#2e522a] font-bold"
      : "text-white hover:bg-white hover:text-[#2e522a] "
      }`;
  };

  const unreadCount = notifications.filter(n => n.isUnread).length;
  const displayedNotifications = activeTab === 'all' ? notifications : notifications.filter(n => n.isUnread);
  const isSuperAdmin = profileRole?.toString().trim().toLowerCase() === "superadmin";
  const schoolName = "BTECH";
  const systemName = "Pre-Admission System";

  return (
    <>
      <aside
        className={`relative bg-[#2e522a] text-white shadow-xl h-full flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out z-40 ${isExpanded ? "w-64" : "w-20"
          }`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute -right-3.5 top-8 bg-[#2e522a] rounded-md w-7 h-7 flex items-center justify-center hover:bg-[#34642f] hover:scale-110 transition-all shadow-md z-50 border-2 border-white/20"
          title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          <i className={`fa-solid text-white fa-chevron-${isExpanded ? "left" : "right"} text-xs`}></i>
        </button>

        {/* Branding Section */}
        <div className={`p-4 flex items-center gap-3 overflow-hidden ${isExpanded ? "" : "justify-center"}`}>
          <div className={`flex shrink-0 ${isExpanded ? "items-center gap-2" : "flex-col  items-center gap-1"}`}>
            <img src="/img/btech.png" alt="IITI" className={`${isExpanded ? "h-15 w-15" : "h-14 w-14"}  min-w-[36px] rounded-full bg-white object-contain shrink-0`} />
          </div>
          {isExpanded && (
            <div className="leading-tight transition-opacity duration-300 whitespace-nowrap overflow-hidden text-white flex flex-col justify-center">
              <h1 className="font-bold text-xl tracking-wide uppercase truncate">{schoolName}</h1>
              <span className="font-semibold text-[14px] truncate opacity-90">{systemName}</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 mt-6 px-3 overflow-y-auto overflow-x-hidden">
          <ul className="flex flex-col gap-2">
            {[
              { path: "/admin_dashboard", label: "Dashboard", icon: "fa-chart-line" },
              { path: "/admin_applications", label: "Applications", icon: "fa-folder-open" },
              { path: "/admin_admission", label: "Pre-Admission", icon: "fa-user" },
              { path: "/admin_post_admission", label: "Post-Admission", icon: "fa-user-check" },
              { path: "/admin_settings", label: "Settings", icon: "fa-cog" },
            ].map((item) => (
              <li key={item.path}>
                <Link to={item.path} className={getNavClass(item.path)}>
                  <i className={`fa-solid ${item.icon} text-[14px] w-6 shrink-0 text-center`}></i>
                  {isExpanded && <span className="text-[14px] font-medium whitespace-nowrap">{item.label}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-white/20 flex flex-col gap-4">

          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className={`flex items-center gap-4 w-full p-3 rounded-lg transition-all overflow-hidden ${isNotifOpen
                ? "bg-white text-[#2e522a] font-bold"
                : "text-white hover:bg-white hover:text-[#2e522a]"
                } ${isExpanded ? "" : "justify-center"}`}
              title="Notifications"
            >
              <div className="relative flex items-center justify-center shrink-0 w-6">
                <i className={`fa-solid fa-bell text-base ${isNotifOpen ? "text-[#2e522a]" : ""}`}></i>
                {unreadCount > 0 && (
                  <span className={`absolute -top-1 -right-1 bg-red-500 h-2 w-2 rounded-full border-2 ${isNotifOpen ? "border-white" : "border-[#2e522a]"
                    }`}></span>
                )}
              </div>
              {isExpanded && <span className="text-xs font-medium whitespace-nowrap">Notifications</span>}
            </button>

            {/* Notification Popup */}
            {isNotifOpen && (
              <div className="absolute left-full bottom-0 ml-8 mb-2 w-[380px] bg-white rounded-lg shadow-2xl z-50 text-gray-800 border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-lg text-[#2e522a]">All Notifications</h3>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex gap-2">
                      <button onClick={() => setActiveTab('all')} className={`px-3 py-1 rounded-md transition-colors ${activeTab === 'all' ? 'font-semibold text-white bg-[#2e522a]' : 'text-gray-500 hover:text-[#2e522a] bg-gray-100'}`}>All</button>
                      <button onClick={() => setActiveTab('unread')} className={`px-3 py-1 rounded-md transition-colors ${activeTab === 'unread' ? 'font-semibold text-white bg-[#2e522a]' : 'text-gray-500 hover:text-[#2e522a] bg-gray-100'}`}>Unread</button>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={markAllAsRead} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Mark read</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={clearAllNotifications} className="text-red-500 hover:text-red-700 text-xs font-medium">Clear all</button>
                    </div>
                  </div>
                </div>
                <div className="h-64 overflow-y-auto bg-white">
                  {displayedNotifications.length > 0 ? (
                    <ul>
                      {displayedNotifications.map((notif) => (
                        <li key={notif._id || notif.id} onClick={() => markAsRead(notif._id || notif.id)} className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer flex gap-3 ${notif.isUnread ? 'bg-blue-50/30' : ''}`}>
                          <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${notif.isUnread ? 'bg-blue-500' : 'bg-transparent'}`}></div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={`text-sm ${notif.isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{notif.title}</h4>
                            </div>
                            <p className="text-xs text-gray-600 leading-snug">{notif.message}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="h-full flex items-center justify-center"><p className="text-sm text-gray-500">No notifications</p></div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Profile Card Section */}
          <Link
            to="/admin_profile"
            className={`group flex items-center gap-3 p-3 rounded-lg transition-all overflow-hidden ${location.pathname === "/admin_profile"
              ? "bg-white text-[#2e522a] font-bold"
              : "text-white hover:bg-white hover:text-[#2e522a] "
              } ${isExpanded ? "" : "justify-center"}`}
            title="Profile"
          >
            <div className={`h-10 w-10 shrink-0 rounded-full overflow-hidden flex items-center justify-center border-2 transition-colors ${location.pathname === "/admin_profile"
              ? "border-[#2e522a] bg-white text-[#2e522a]"
              : "border-white/80 bg-[#2e522a] text-white group-hover:border-[#2e522a] group-hover:bg-white group-hover:text-[#2e522a]"
              }`}>
              {profileImage ? <img src={profileImage} className="h-full w-full object-cover" alt="Profile" /> : <FaUser className="text-lg" />}
            </div>

            {isExpanded && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <span className="text-xs font-bold truncate tracking-wide leading-tight">{profileName}</span>
                <span className={`text-[10px] font-medium truncate transition-colors ${location.pathname === "/admin_profile"
                  ? "text-[#2e522a]"
                  : "text-white/80 group-hover:text-[#2e522a]"
                  }`}>
                  {profileRole}
                </span>
              </div>
            )}
          </Link>

          {/* Logout */}
          <button onClick={handleLogoutClick} className={`flex items-center gap-4 w-full p-2 text-white hover:bg-red-600 hover:text-white rounded-lg transition-colors ${isExpanded ? "" : "justify-center"}`} title="Logout">
            <i className="fa-solid fa-right-from-bracket text-base shrink-0"></i>
            {isExpanded && <span className="text-xs font-medium">Logout</span>}
          </button>
        </div>

        {/* Logout Modal via Portal */}
        {showLogoutModal && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-[360px] text-center transform transition-all animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-red-50">
                <i className="fa-solid fa-right-from-bracket text-red-500 text-2xl ml-1"></i>
              </div>
              <h3 className="text-xl font-extrabold text-gray-900 mb-2 tracking-tight">Confirm Logout</h3>
              <p className="text-gray-500 mb-8 text-[14px] font-medium leading-relaxed">
                Are you sure you want to end your current session and log out?
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="flex-1 px-4 py-3 text-sm font-bold text-gray-700 bg-gray-100 border border-transparent rounded-xl hover:bg-gray-200 hover:border-gray-300 transition-all duration-200 shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-red-600 border border-transparent rounded-xl hover:bg-red-700 hover:shadow-lg "
                >
                  Logout
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </aside>
    </>
  );
}