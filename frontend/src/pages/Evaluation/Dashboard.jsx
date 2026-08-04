import React, { useState, useEffect } from 'react';
import './Dashboard.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const Dashboard = () => {
  const [openSection, setOpenSection] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = () => {
    setLoading(true);
    fetch(`${API}/evaluations/dashboard`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          console.log('sectionCounts:', data.stats.sectionCounts);
          setStats(data.stats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  // Helper to get progress for a form type
  const getProgress = (formType) => {
    if (!stats) return { evaluated: 0, total: 0, percent: 0 };
    return stats.progressByForm?.[formType] || { evaluated: 0, total: 0, percent: 0 };
  };

  const selfEval     = getProgress('Self Evaluation');
  const peerEval     = getProgress('Peer to Peer Evaluation');
  const classOnline  = getProgress('Classroom Observation (Online)');
  const studentEval  = getProgress('Student Evaluation');

  const totalFaculty     = stats?.totalFaculty || 0;
  const facultyEvaluated = Math.max(selfEval.evaluated, peerEval.evaluated, classOnline.evaluated);
  const studentResponses = stats?.studentResponses || 0;
  const recentEvals      = stats?.recentEvaluations || [];

  // SVG Icons
  const CalendarIcon = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>;
  const TrendUpIcon = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>;
  
  const FacultyGroupIcon = () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#00923d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="7" r="2.5" />
      <path d="M1 21v-1a4 4 0 0 1 4.5-3.8" />
      <circle cx="19" cy="7" r="2.5" />
      <path d="M23 21v-1a4 4 0 0 0-4.5-3.8" />
      <circle cx="12" cy="11" r="3.5" />
      <path d="M7 21v-1a5 5 0 0 1 10 0v1" />
    </svg>
  );

  const SinglePersonIcon = () => (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#00923d" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
    </svg>
  );

  const ListIcon = () => <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#00923d" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>;
  const ChevronDown = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"></path></svg>;
  const ChevronUp = () => <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 15l7-7 7 7"></path></svg>;

  // IN-UPDATE NA PROGRESS BAR: May kasama nang footer para sa PENDING
  const ProgressBar = ({ label, percent, pendingCount }) => (
    <div className="dash-progress-item">
      <div className="dash-progress-label">{label}</div>
      <div className="dash-progress-track">
        <div className="dash-progress-fill" style={{ width: percent }}></div>
      </div>
      <div className="dash-progress-footer">
        <span className="dash-progress-text">{percent} Completed</span>
        {/* Lilitaw lang ang pending badge kung may ipinasang value */}
        {pendingCount && <span className="dash-progress-pending">{pendingCount} Pending</span>}
      </div>
    </div>
  );

  const SectionProgressBar = ({ label, count = 0 }) => (
    <div className="dash-section-progress">
      <div className="dash-section-progress-top">
        <span className="dash-sp-label">{label}</span>
        <span className="dash-sp-percent" style={{ color: count > 0 ? '#00923d' : '#aaa' }}>
          {count > 0 ? `${count} response${count > 1 ? 's' : ''}` : '0 responses'}
        </span>
      </div>
      <div className="dash-progress-track">
        <div className="dash-progress-fill" style={{ width: count > 0 ? '100%' : '0%' }}></div>
      </div>
    </div>
  );

  const sectionCounts = stats?.sectionCounts || {};

  const classSectionsData = [
    { title: 'BSIT 1ST YEAR', sections: ['BSIT 1A', 'BSIT 1B', 'BSIT 1C', 'BSIT 1D', 'BSIT 1E', 'BSIT 1F', 'BSIT 1G', 'BSIT 1H', 'BSIT 1I', 'BSIT 1J'] },
    { title: 'BSIT 2ND YEAR', sections: ['BSIT 2A', 'BSIT 2B', 'BSIT 2C', 'BSIT 2D', 'BSIT 2E', 'BSIT 2F', 'BSIT 2G', 'BSIT 2H', 'BSIT 2I', 'BSIT 2J'] },
    { title: 'BSIT 3RD YEAR', sections: ['BSIT 3A', 'BSIT 3B', 'BSIT 3C', 'BSIT 3D', 'BSIT 3E', 'BSIT 3F', 'BSIT 3G', 'BSIT 3H', 'BSIT 3I', 'BSIT 3J'] },
    { title: 'BSIT 4TH YEAR', sections: ['BSIT 4A', 'BSIT 4B', 'BSIT 4C', 'BSIT 4D', 'BSIT 4E', 'BSIT 4F', 'BSIT 4G', 'BSIT 4H', 'BSIT 4I', 'BSIT 4J'] }
  ];

  return (
    <div className="dash-container">
      {loading && <div style={{textAlign:'center', padding:'20px', color:'#666'}}>Loading dashboard data...</div>}
      <div className="dash-banner">
        <div className="dash-banner-left">
          <p className="dash-semester"><CalendarIcon /> 2025-2026 2nd Semester</p>
          <h1 className="dash-title">Faculty Evaluation</h1>
          <p className="dash-subtitle">Track and monitor evaluation progress</p>
        </div>
        <div className="dash-banner-right">
        
          <div className="dash-status-box">
            <span className="dash-status-label">Status <TrendUpIcon /></span>
            <strong className="dash-status-value">On-going</strong>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        {/* CARD 1: FACULTY */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Faculty Members Evaluated</h3>
            <FacultyGroupIcon />
          </div>
          <div className="dash-big-num">{facultyEvaluated} <span className="dash-small-num">/ {totalFaculty}</span></div>
          <p className="dash-sub-text">Faculty members have responded</p>
          <hr className="dash-divider" />
          <div className="dash-progress-list">
            <ProgressBar label="Self Evaluation" percent={`${selfEval.percent}%`} pendingCount={selfEval.total - selfEval.evaluated > 0 ? `${selfEval.total - selfEval.evaluated}` : null} />
            <ProgressBar label="Peer to Peer" percent={`${peerEval.percent}%`} pendingCount={peerEval.total - peerEval.evaluated > 0 ? `${peerEval.total - peerEval.evaluated}` : null} />
            <ProgressBar label="Classroom/Teaching Observation (Online)" percent={`${classOnline.percent}%`} pendingCount={classOnline.total - classOnline.evaluated > 0 ? `${classOnline.total - classOnline.evaluated}` : null} />
          </div>
        </div>

        {/* CARD 2: STUDENTS */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Students Evaluated</h3>
            <SinglePersonIcon />
          </div>
          <div className="dash-big-num">{studentResponses} <span className="dash-small-num">/ {totalFaculty > 0 ? '∞' : '0'}</span></div>
          <p className="dash-sub-text">Students have responded</p>
          <hr className="dash-divider" />
          <div className="dash-progress-list">
            <ProgressBar label="Student Evaluation" percent={`${studentEval.percent}%`} />
          </div>
        </div>

        {/* CARD 3: CLASS SECTIONS */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Class Sections</h3>
            <ListIcon />
          </div>
          <hr className="dash-divider" style={{marginTop: '36px'}}/>
          <div className="dash-accordion-list">
            {classSectionsData.map((item, index) => {
              const yearTotal = item.sections.reduce((sum, sec) => sum + (sectionCounts[sec] || 0), 0);
              return (
              <div key={index} className="dash-accordion-item">
                <button className={`dash-accordion-btn ${openSection === item.title ? 'open' : ''}`} onClick={() => toggleSection(item.title)}>
                  <span>{item.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {yearTotal > 0 && <span style={{ backgroundColor: '#00923d', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>{yearTotal} responses</span>}
                    {openSection === item.title ? <ChevronUp /> : <ChevronDown />}
                  </span>
                </button>
                {openSection === item.title && (
                  <div className="dash-accordion-content">
                    <div className="dash-inner-section-list">
                      {item.sections.map((sec, i) => {
                        const count = sectionCounts[sec] || 0;
                        return (
                          <SectionProgressBar key={i} label={sec} count={count} />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="dash-table-wrapper">
        <div className="dash-table-header">All Evaluations</div>
        <table className="dash-table">
          <thead>
            <tr><th>EVALUATION TYPE</th><th>DATE</th><th>TIME</th><th>STATUS</th></tr>
          </thead>
          <tbody>
            {recentEvals.length === 0 ? (
              <>
                <tr><td colSpan="4" style={{textAlign:'center', color:'#aaa', padding:'16px'}}>No evaluations yet</td></tr>
                <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
                <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
              </>
            ) : (
              recentEvals.map((ev, i) => {
                const d = new Date(ev.submittedAt);
                const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                return (
                  <tr key={i}>
                    <td>{ev.formType}</td>
                    <td>{date}</td>
                    <td>{time}</td>
                    <td>Posted</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;