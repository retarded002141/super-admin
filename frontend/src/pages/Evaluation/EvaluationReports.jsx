import React, { useState, useEffect } from 'react';
import './EvaluationReports.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const FORM_TYPE_MAP = {
  'Student Evaluation':                            'Student Evaluation',
  'Self Evaluation':                               'Self Evaluation',
  'Peer to Peer':                                  'Peer to Peer Evaluation',
  'Classroom/Teaching Observation (Online)':       'Classroom/Teaching Observation (Online)',
};

// Each evaluation type uses a different rating scale on its fillable form:
// Student Evaluation = 1-4, Self Evaluation = 1-5, Peer to Peer = 1-5,
// Classroom/Teaching Observation (Online) = 1-10.
const MAX_SCORE_MAP = {
  'Student Evaluation':                      4.0,
  'Self Evaluation':                         5.0,
  'Peer to Peer':                            5.0,
  'Classroom/Teaching Observation (Online)': 10.0,
};

const SECTIONS = ['A','B','C','D','E','F','G','H','I','J'];

const EvaluationReports = () => {
  const [facultyList, setFacultyList] = useState([]);
  const [faculty, setFaculty]         = useState('');
  const [evalType, setEvalType]       = useState('Student Evaluation');
  const [filterBy, setFilterBy]       = useState('Per Section');
  const [yearLevel, setYearLevel]     = useState('');
  const [section, setSection]         = useState('');
  const [showReport, setShowReport]   = useState(false);
  const [report, setReport]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [noData, setNoData]           = useState(false);

  // Load faculty from API
  useEffect(() => {
    fetch(`${API}/faculty/`)
      .then(r => r.json())
      .then(data => { if (data.success) setFacultyList(data.faculty); })
      .catch(() => {});
  }, []);

  const handleFilterByChange = (e) => {
    setFilterBy(e.target.value);
    setYearLevel('');
    setSection('');
    setShowReport(false);
    setReport(null);
  };

  const handleEvalTypeChange = (e) => {
    setEvalType(e.target.value);
    setShowReport(false);
    setReport(null);
  };

  const getSelectedFacultyName = () => {
    const f = facultyList.find(f => f._id === faculty);
    return f ? f.name : '';
  };

  const getEvaluatedByText = () => {
    if (evalType !== 'Student Evaluation') {
      if (evalType === 'Self Evaluation') return 'Self (Faculty)';
      if (evalType === 'Peer to Peer') return 'Co-Faculty';
      if (evalType.includes('Observation')) return 'Observer / Admin';
    } else {
      if (filterBy === 'Per Year') return `${yearLevel} (Per Year)`;
      if (filterBy === 'Per Section') return `BSIT ${yearLevel[0]}${section} (Per Section)`;
    }
    return 'N/A';
  };

  const handleGenerate = async () => {
    if (!faculty) return alert('Please select a Faculty first.');
    if (evalType === 'Student Evaluation') {
      if ((filterBy === 'Per Year' || filterBy === 'Per Section') && !yearLevel)
        return alert('Please select a Year Level.');
      if (filterBy === 'Per Section' && !section)
        return alert('Please select a Section.');
    }
    setLoading(true);
    setShowReport(false);
    setNoData(false);
    setReport(null);

    try {
      const formType = FORM_TYPE_MAP[evalType] || evalType;
      let url = `${API}/evaluations/report/${faculty}?formType=${encodeURIComponent(formType)}`;

      if (evalType === 'Student Evaluation') {
        if (filterBy === 'Per Year') {
          url += `&yearLevel=${encodeURIComponent(yearLevel)}`;
        } else if (filterBy === 'Per Section') {
          const sectionVal = `BSIT ${yearLevel[0]}${section}`;
          url += `&yearLevel=${encodeURIComponent(yearLevel)}&section=${encodeURIComponent(sectionVal)}`;
        }
      }
      // Self Eval, Peer to Peer, Observations — no extra filters needed

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && data.report && data.report.totalResponses > 0) {
        setReport(data.report);
        setShowReport(true);
      } else {
        setNoData(true);
        setShowReport(true);
      }
    } catch {
      alert('Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  const isObservationType = evalType.includes('Observation');

  const getPerformanceLevel = (pct) => {
    if (isObservationType) {
      if (pct >= 90) return { label: 'Excellent',           color: '#2e5a2c', dot: 'green' };
      if (pct >= 80) return { label: 'Very Satisfactory',   color: '#4caf50', dot: 'light-green' };
      if (pct >= 70) return { label: 'Satisfactory',        color: '#ff9800', dot: 'yellow' };
      return           { label: 'Needs Improvement',        color: '#f44336', dot: 'orange' };
    }
    if (pct >= 95) return { label: 'Excellent',      color: '#2e5a2c', dot: 'green' };
    if (pct >= 85) return { label: 'Above Average',  color: '#4caf50', dot: 'light-green' };
    if (pct >= 75) return { label: 'Average',        color: '#ff9800', dot: 'yellow' };
    return           { label: 'Below Average',       color: '#f44336', dot: 'orange' };
  };

  // Classroom/Teaching Observation is rated on a 1-10 performance scale
  const getInterpretation = (pct) => {
    if (isObservationType) {
      if (pct >= 90) return 'Excellent';
      if (pct >= 80) return 'Very Satisfactory';
      if (pct >= 70) return 'Satisfactory';
      return 'Needs Improvement';
    }
    if (pct >= 87.5) return 'Strongly Agree';
    if (pct >= 62.5) return 'Agree';
    if (pct >= 37.5) return 'Disagree';
    return 'Strongly Disagree';
  };

  const maxScore    = MAX_SCORE_MAP[evalType] || 4.0;
  const overallAvg  = report?.overallAverage || 0;
  const percentage  = maxScore > 0 ? Math.round((overallAvg / maxScore) * 1000) / 10 : 0;
  const perf        = getPerformanceLevel(percentage);

  return (
    <div className="er-container">

      <div className="er-header-row no-print">
        <h2 className="er-page-title">Evaluation Reports</h2>
      </div>

      <div className="er-filters-card no-print">
        <div className="er-grid-2col">

          {/* Faculty */}
          <div className="er-filter-group">
            <label>Select Faculty:</label>
            <select value={faculty} onChange={e => { setFaculty(e.target.value); setShowReport(false); setReport(null); }} className="er-select">
              <option value="">-- Choose Instructor --</option>
              {facultyList.map(f => (
                <option key={f._id} value={f._id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Evaluation Type */}
          <div className="er-filter-group">
            <label>Evaluation Type:</label>
            <select value={evalType} onChange={handleEvalTypeChange} className="er-select">
              <option value="Self Evaluation">Self Evaluation</option>
              <option value="Student Evaluation">Student Evaluation</option>
              <option value="Classroom/Teaching Observation (Online)">Classroom/Teaching Observation (Online)</option>
              <option value="Peer to Peer">Peer to Peer</option>
            </select>
          </div>

          {/* Student Evaluation filters */}
          {evalType === 'Student Evaluation' && (
            <>
              <div className="er-filter-group">
                <label>Generate By:</label>
                <select value={filterBy} onChange={handleFilterByChange} className="er-select">
                  <option value="Per Year">Per Year</option>
                  <option value="Per Section">Per Section</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="er-filter-group" style={{ flex: 1 }}>
                  <label>Year Level:</label>
                  <select value={yearLevel} onChange={e => { setYearLevel(e.target.value); setSection(''); }} className="er-select">
                    <option value="">-- Select Year --</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>

                {filterBy === 'Per Section' && (
                  <div className="er-filter-group" style={{ flex: 1 }}>
                    <label>Section:</label>
                    <select value={section} onChange={e => setSection(e.target.value)} disabled={!yearLevel} className="er-select">
                      <option value="">{yearLevel ? '-- Select Section --' : '-- Choose Year First --'}</option>
                      {yearLevel && SECTIONS.map(sec => (
                        <option key={sec} value={sec}>BSIT {yearLevel[0]}{sec}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="er-action-buttons">
          <button className="er-btn-generate" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Loading...' : 'Generate'}
          </button>
          {showReport && !noData && (
            <button className="er-btn-print" onClick={() => window.print()}>Print</button>
          )}
        </div>
      </div>

      {/* No data message */}
      {showReport && noData && (
        <div className="er-report-paper" style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <p style={{ fontSize: 16 }}>No evaluations found for the selected filters.</p>
          <p style={{ fontSize: 13 }}>Try a different faculty, evaluation type, or filter.</p>
        </div>
      )}

      {/* Report */}
      {showReport && !noData && report && (
        <div className="er-report-paper">

          <div className="er-report-info">
            <p><strong>Faculty Name:</strong> {getSelectedFacultyName()}</p>
            <p><strong>Evaluation Type:</strong> {evalType}</p>
            <p><strong>Evaluated By:</strong> {getEvaluatedByText()}</p>
            <p><strong>Total Responses:</strong> {report.totalResponses}</p>
            <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
          </div>

          <div className="er-summary-container">
            <h4 className="er-summary-title">Evaluation summary</h4>

            {/* Per-section score cards */}
            <div className="er-cards-grid">
              {report.sectionScores && Object.entries(report.sectionScores).map(([title, avg]) => {
                const pct = Math.round((avg / maxScore) * 1000) / 10;
                const interp = getInterpretation(pct);
                return (
                  <div className="er-card" key={title}>
                    <span className="er-card-title">{title}</span>
                    <span className="er-card-score">{avg.toFixed(2)} <small>/ {maxScore.toFixed(1)}</small></span>
                    <span className="er-card-subtext">Interpretation: {interp}</span>
                  </div>
                );
              })}
            </div>

            <hr className="er-divider" />

            <div className="er-overall-grid">
              <div className="er-overall-box">
                <span className="er-overall-label">Total Average Grade</span>
                <span className="er-overall-value">{overallAvg.toFixed(2)} <small>/ {maxScore.toFixed(1)}</small></span>
              </div>
              <div className="er-overall-box">
                <span className="er-overall-label">Final Grade Percentage</span>
                <span className="er-overall-value">{percentage}%</span>
              </div>
              <div className="er-overall-box">
                <span className="er-overall-label">Performance Level</span>
                <span className="er-overall-value" style={{ color: perf.color }}>
                  <span className={`status-dot ${perf.dot}`}></span> {perf.label}
                </span>
              </div>
            </div>

            <div className="er-legend-row">
              {isObservationType ? (
                <>
                  <div className="er-legend-item"><span className="status-dot green"></span> Excellent: 90-100</div>
                  <div className="er-legend-item"><span className="status-dot light-green"></span> Very Satisfactory: 80-89</div>
                  <div className="er-legend-item"><span className="status-dot yellow"></span> Satisfactory: 70-79</div>
                  <div className="er-legend-item"><span className="status-dot orange"></span> Needs Improvement: below 70</div>
                </>
              ) : (
                <>
                  <div className="er-legend-item"><span className="status-dot green"></span> Excellent: 95-100</div>
                  <div className="er-legend-item"><span className="status-dot light-green"></span> Above Average: 85-94</div>
                  <div className="er-legend-item"><span className="status-dot yellow"></span> Average: 75-84</div>
                  <div className="er-legend-item"><span className="status-dot orange"></span> Below Average: 65-74</div>
                </>
              )}
            </div>

            {/* Comments */}
            {report.comments && report.comments.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ color: '#2e5a2c', borderBottom: '1px solid #ccc', paddingBottom: 8 }}>
                  {isObservationType ? "Observer's Comments" : "Student Comments"}
                </h4>
                {report.comments.map((c, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: '10px 14px', background: '#f9f9f9', borderRadius: 6, fontSize: 13 }}>
                    {isObservationType ? (
                      <>
                        {c.likes    && <p style={{ margin: '0 0 4px' }}><strong>Comments:</strong> {c.likes}</p>}
                        {c.dislikes && <p style={{ margin: 0 }}><strong>Recommendations:</strong> {c.dislikes}</p>}
                      </>
                    ) : (
                      <>
                        {c.likes    && <p style={{ margin: '0 0 4px' }}><strong>Likes:</strong> {c.likes}</p>}
                        {c.dislikes && <p style={{ margin: 0 }}><strong>Improve:</strong> {c.dislikes}</p>}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="er-report-signatures">
            <div className="sig-block">
              <span className="sig-line"></span>
              <span className="sig-title">Prepared By (Admin)</span>
            </div>
            <div className="sig-block">
              <span className="sig-line"></span>
              <span className="sig-title">Noted By (Dean/HR)</span>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

export default EvaluationReports;
