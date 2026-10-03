import React from 'react';
import '../../stylesheets/Portal/header.css';

export function Header({ title }) {
  const activeYear = localStorage.getItem("adminSchoolYear") || "2026-2027";
  const activeSemester = localStorage.getItem("adminSchoolSemester") || "2nd Semester";

  const isPreOrPostAdmission = title.includes('Pre-Admission') || title.includes('Post-Admission');

  const getSubtitle = (t) => {
    if (t.includes('Dashboard')) return 'Overview of applicant data and statistics';
    if (t.includes('Applications')) return 'Manage applicant records';
    if (t === 'Pre-Admission') return 'Manage admission processes';
    if (t.includes('Post-Admission')) return 'Manage admitted students';
    if (t.includes('Settings')) return 'System configurations and preferences';
    return 'Overview and management controls';
  };

  if (!isPreOrPostAdmission) {
    return (
      <header className="admin-header">
        <div>
          <h1 className="header-title">{title}</h1>
          <p className="header-subtitle">Overview and management controls</p>
        </div>
      </header>
    );
  }

  return (
    <header className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h1 className="header-title">{title}</h1>
        <p className="header-subtitle">{getSubtitle(title)}</p>
      </div>
      <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', padding: '4px 12px', borderRadius: '6px', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2e522a' }}>A.Y. {activeYear} {activeSemester}</span>
      </div>
    </header>
  );
}