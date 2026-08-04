import React, { useState } from 'react';
import iitiLogo from '../../assets/iitilogo.png';
import '../../stylesheets/Portal/sidebar.css';

export function Sidebar({ activeTab, setActiveTab, onLogout }) {
  const [isPreAdmissionExpanded, setIsPreAdmissionExpanded] = useState(false);
  const [isPortalExpanded, setIsPortalExpanded] = useState(false);

  const mainMenuItems = [
    { id: 'pre-enrollment', label: 'Pre-Enrollment' },
    { id: 'pre-advising', label: 'Pre-Advising' },
    { id: 'evaluation', label: 'Evaluation System' },
    { id: 'grading', label: 'Grading System' },
  ];

  const preAdmissionMenuItems = [
    { id: 'pre-admission-dashboard', label: 'Dashboard' },
    { id: 'pre-admission-applications', label: 'Applications' },
    { id: 'pre-admission-admission', label: 'Admission' },
    { id: 'pre-admission-settings', label: 'Settings' },
  ];

  const portalMenuItems = [
    { id: 'user-management', label: 'User Management' },
    { id: 'broadcast', label: 'Broadcast' },
    { id: 'students-request', label: 'Students Request' },
  ];

  return (
    <aside className="admin-sidebar">
      <div className="brand-container">
        <img src={iitiLogo} alt="IITI Logo" className="brand-logo" />
        <div>
          <h2 className="brand-title">Admin</h2>
          <span className="brand-sub">IITI System</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {/* Pre-Admission Dropdown */}
        <div className="nav-group">
          <button
            onClick={() => setIsPreAdmissionExpanded(!isPreAdmissionExpanded)}
            className={`nav-item nav-item-dropdown ${activeTab.startsWith('pre-admission-') ? 'active' : ''}`}
          >
            <span>Pre-Admission</span>
            <span className={`dropdown-arrow ${isPreAdmissionExpanded ? 'open' : ''}`}>▼</span>
          </button>

          {/* Expanded Submenu */}
          {isPreAdmissionExpanded && (
            <div className="submenu">
              {preAdmissionMenuItems.map((subItem) => (
                <button
                  key={subItem.id}
                  onClick={() => setActiveTab(subItem.id)}
                  className={`submenu-item ${activeTab === subItem.id ? 'active' : ''}`}
                >
                  {subItem.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Nav Items */}
        {mainMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          >
            <span>{item.label}</span>
          </button>
        ))}


        {/* Student Portal Dropdown */}
        <div className="nav-group">
          <button
            onClick={() => setIsPortalExpanded(!isPortalExpanded)}
            className={`nav-item nav-item-dropdown ${activeTab.startsWith('portal-') || ['user-management', 'broadcast', 'students-request'].includes(activeTab) ? 'active' : ''}`}
          >
            <span>Student Portal</span>
            <span className={`dropdown-arrow ${isPortalExpanded ? 'open' : ''}`}>▼</span>
          </button>

          {/* Expanded Submenu */}
          {isPortalExpanded && (
            <div className="submenu">
              {portalMenuItems.map((subItem) => (
                <button
                  key={subItem.id}
                  onClick={() => setActiveTab(subItem.id)}
                  className={`submenu-item ${activeTab === subItem.id ? 'active' : ''}`}
                >
                  {subItem.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="admin-user-details">
          <div className="admin-avatar">A</div>
          <div className="admin-info">
            <div className="admin-name">System Admin</div>
            <div className="admin-role">Administrator</div>
          </div>
        </div>

        <button
          className="logout-btn"
          onClick={onLogout}
          title="Sign Out"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </aside>
  );
}
