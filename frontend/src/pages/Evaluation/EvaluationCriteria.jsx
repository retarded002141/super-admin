import React, { useState, useEffect } from 'react';
import './EvaluationCriteria.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const LETTERS = ['A','B','C','D','E','F','G','H','I','J'];
const SECTIONS = YEAR_LEVELS.flatMap(yr =>
  LETTERS.map(l => ({ label: `BSIT ${yr[0]}${l}`, yearLevel: yr, letter: l }))
);

const EvaluationCriteria = ({ setActivePage }) => {
  const [criteria, setCriteria] = useState([
    { id: 1, title: 'Self Evaluation', date: 'February 7', year: '2025-2026', isPinned: false },
    { id: 2, title: 'Student Evaluation', date: 'December 15', year: '2025-2026', isPinned: false },
    { id: 3, title: 'Classroom/Teaching Observation (Online)', date: 'February 7', year: '2025-2026', isPinned: false },
    { id: 4, title: 'Peer to Peer Evaluation', date: 'February 7', year: '2025-2026', isPinned: false },
  ]);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [sendModal, setSendModal] = useState(null);

  // Whether the Student Evaluation option is turned on for the Student
  // Portal's sidebar. Read/written via /api/settings/studentEvaluation.
  const [studentEvalEnabled, setStudentEvalEnabled] = useState(false);
  const [studentEvalUpdatedAt, setStudentEvalUpdatedAt] = useState(null);
  const [loadingToggle, setLoadingToggle] = useState(true);
  const [togglingEval, setTogglingEval] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false); // true = confirming a pending toggle

  useEffect(() => {
    fetch(`${API}/settings/studentEvaluation`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStudentEvalEnabled(data.enabled);
          setStudentEvalUpdatedAt(data.updatedAt);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingToggle(false));
  }, []);

  const handleConfirmToggle = async () => {
    const next = !studentEvalEnabled;
    setTogglingEval(true);
    try {
      const res = await fetch(`${API}/settings/studentEvaluation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (data.success) {
        setStudentEvalEnabled(data.enabled);
        setStudentEvalUpdatedAt(data.updatedAt);
      } else {
        alert('Failed to update. Please try again.');
      }
    } catch {
      alert('Could not connect to server.');
    } finally {
      setTogglingEval(false);
      setConfirmToggle(false);
    }
  };

  const formatUpdatedAt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // For student eval — section picker + generated link
  const [selectedSection, setSelectedSection] = useState('');
  const [generatedLinks, setGeneratedLinks] = useState({}); // { 'BSIT 1A': url }
  const [generating, setGenerating] = useState(false);
  const [copiedSection, setCopiedSection] = useState('');

  // For other evals — single link
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const toggleMenu = (id) => setOpenMenuId(openMenuId === id ? null : id);

  const handlePin = (id) => {
    setCriteria(prev => {
      const updated = prev.map(item =>
        item.id === id ? { ...item, isPinned: !item.isPinned } : item
      );
      return updated.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
    });
    setOpenMenuId(null);
  };

  const handleDeleteClick = (id) => { setItemToDelete(id); setOpenMenuId(null); };
  const confirmDelete = () => { setCriteria(prev => prev.filter(item => item.id !== itemToDelete)); setItemToDelete(null); };
  const cancelDelete = () => setItemToDelete(null);

  const handleSendClick = async (title) => {
    setSendModal({ title });
    setGeneratedLink('');
    setGeneratedLinks({});
    setSelectedSection('');
    setCopied(false);
    setCopiedSection('');

    if (title !== 'Student Evaluation') {
      // Single link for non-student evals
      setGenerating(true);
      try {
        const res = await fetch(`${API}/links/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formType: title }),
        });
        const data = await res.json();
        if (data.success) setGeneratedLink(`${window.location.origin}/evaluate/${data.token}`);
      } catch {
        setGeneratedLink('Error generating link. Please try again.');
      } finally {
        setGenerating(false);
      }
    }
  };

  const handleGenerateSectionLink = async () => {
    if (!selectedSection) return alert('Please select a section first.');
    if (generatedLinks[selectedSection]) return; // already generated

    setGenerating(true);
    const sec = SECTIONS.find(s => s.label === selectedSection);
    try {
      const res = await fetch(`${API}/links/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType: 'Student Evaluation',
          yearLevel: sec.yearLevel,
          section: selectedSection,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedLinks(prev => ({
          ...prev,
          [selectedSection]: `${window.location.origin}/evaluate/${data.token}`,
        }));
      }
    } catch {
      alert('Error generating link.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text, key = '') => {
    navigator.clipboard.writeText(text);
    if (key) {
      setCopiedSection(key);
      setTimeout(() => setCopiedSection(''), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <h2 className="page-title">Evaluation Criteria</h2>

      {criteria.map((item) => (
        <div key={item.id} className="criteria-row" style={{ backgroundColor: item.isPinned ? '#f0fdf4' : 'white' }}>
          <div className="row-main-text">
            {item.isPinned && <span style={{ marginRight: '8px' }}>pin</span>}
            {item.title}
          </div>
          <div className="row-date">{item.date}</div>
          <div className="row-year">{item.year}</div>
          <div className="row-actions" style={{ position: 'relative' }}>
            {item.title === 'Student Evaluation' ? (
              <div style={{ textAlign: 'right' }}>
                <button
                  className="btn-send"
                  onClick={() => setConfirmToggle(true)}
                  disabled={loadingToggle || togglingEval}
                  style={{
                    backgroundColor: studentEvalEnabled ? '#00923d' : '#94a3b8',
                    minWidth: '84px',
                  }}
                  title="Controls whether this shows up as available in the Student Portal sidebar"
                >
                  {loadingToggle ? '...' : (studentEvalEnabled ? 'Enabled' : 'Disabled')}
                </button>
                {studentEvalUpdatedAt && (
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
                    Last changed: {formatUpdatedAt(studentEvalUpdatedAt)}
                  </div>
                )}
              </div>
            ) : (
              <button className="btn-send" onClick={() => handleSendClick(item.title)}>Send</button>
            )}
            <button className="dots-btn" onClick={() => toggleMenu(item.id)}>...</button>
            {openMenuId === item.id && (
              <div className="action-dropdown-menu">
                <button className="close-dropdown" onClick={() => setOpenMenuId(null)}>X</button>
                <button className="dropdown-item" onClick={() => { setActivePage(`View ${item.title}`); setOpenMenuId(null); }}>View</button>
                {item.title === 'Student Evaluation' && (
                  <button
                    className="dropdown-item"
                    onClick={() => { handleSendClick(item.title); setOpenMenuId(null); }}
                  >
                    Copy Link (demo)
                  </button>
                )}
                <button className="dropdown-item" onClick={() => handlePin(item.id)}>{item.isPinned ? 'Unpin' : 'Pin'}</button>
                <button className="dropdown-item" onClick={() => handleDeleteClick(item.id)}>Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {sendModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, width: '480px' }}>
            <h3 style={{ marginTop: 0, color: '#1e293b' }}>Send Evaluation Link</h3>
            <p style={{ color: '#475569', fontSize: '14px' }}>Form: <strong>{sendModal.title}</strong></p>

            {sendModal.title === 'Student Evaluation' ? (
              <>
                <p style={{ color: '#475569', fontSize: '13px', marginBottom: '10px' }}>
                  Select a section to generate its link:
                </p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <select
                    value={selectedSection}
                    onChange={e => setSelectedSection(e.target.value)}
                    style={{ ...styles.linkInput, flex: 2 }}
                  >
                    <option value="">-- Select Section --</option>
                    {SECTIONS.map(s => (
                      <option key={s.label} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                  <button onClick={handleGenerateSectionLink} style={styles.btnCopy} disabled={generating || !selectedSection}>
                    {generating ? '...' : 'Generate'}
                  </button>
                </div>

                {/* Show all generated links */}
                {Object.keys(generatedLinks).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                    {Object.entries(generatedLinks).map(([sec, url]) => (
                      <div key={sec}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e5631', marginBottom: '3px' }}>{sec}</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input readOnly value={url} style={styles.linkInput} />
                          <button onClick={() => handleCopy(url, sec)} style={styles.btnCopy}>
                            {copiedSection === sec ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ color: '#475569', fontSize: '13px', marginBottom: '12px' }}>
                  Share this link so faculty can fill out the evaluation:
                </p>
                {generating ? (
                  <div style={{ color: '#64748b', padding: '12px', textAlign: 'center' }}>Generating link...</div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                    <input readOnly value={generatedLink} style={styles.linkInput} />
                    <button onClick={() => handleCopy(generatedLink)} style={styles.btnCopy}>{copied ? 'Copied!' : 'Copy'}</button>
                  </div>
                )}
              </>
            )}

            <button onClick={() => setSendModal(null)} style={styles.btnClose}>Close</button>
          </div>
        </div>
      )}

      {itemToDelete !== null && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>!</div>
            <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#1e293b' }}>Confirm Delete</h3>
            <p style={{ color: '#475569', fontSize: '14px', marginBottom: '25px' }}>
              Are you sure you want to delete this evaluation? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
              <button onClick={cancelDelete} style={styles.btnDiscard}>Discard</button>
              <button onClick={confirmDelete} style={styles.btnYes}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {confirmToggle && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContentCard, textAlign: 'center' }}>
            <h3 style={{ marginTop: 0, marginBottom: '10px', color: '#1e293b' }}>
              {studentEvalEnabled ? 'Disable Student Evaluation?' : 'Enable Student Evaluation?'}
            </h3>
            <p style={{ color: '#475569', fontSize: '14px', marginBottom: '25px' }}>
              {studentEvalEnabled
                ? 'Students will no longer be able to open or submit the Student Evaluation form, including any links already sent out.'
                : 'Students will be able to see and open the Student Evaluation form from the Student Portal.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
              <button onClick={() => setConfirmToggle(false)} style={styles.btnDiscard} disabled={togglingEval}>
                Cancel
              </button>
              <button onClick={handleConfirmToggle} style={styles.btnConfirmGreen} disabled={togglingEval}>
                {togglingEval ? 'Saving...' : (studentEvalEnabled ? 'Yes, Disable' : 'Yes, Enable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex',
    justifyContent: 'center', alignItems: 'center', zIndex: 9999,
  },
  modalContent: {
    backgroundColor: '#fff', padding: '30px', borderRadius: '10px',
    width: '440px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
  },
  modalContentCard: {
    backgroundColor: '#fff', padding: '30px',
    border: '1px solid #d1d5db', borderRadius: '8px',
    width: '440px', boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
  },
  btnConfirmGreen: {
    padding: '10px 24px', backgroundColor: '#00923d', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
    fontFamily: "'montserrat', sans-serif",
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
  },
  linkInput: {
    flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1',
    borderRadius: '6px', fontSize: '12px', color: '#334155',
    backgroundColor: '#f8fafc', outline: 'none', width: '100%',
  },
  btnCopy: {
    padding: '8px 14px', backgroundColor: '#00923d', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap',
  },
  btnClose: {
    padding: '10px 24px', backgroundColor: '#f1f5f9', color: '#475569',
    border: '1px solid #cbd5e1', borderRadius: '6px',
    cursor: 'pointer', fontWeight: 'bold', width: '100%', marginTop: '8px',
  },
  btnDiscard: {
    padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#475569',
    border: '1px solid #cbd5e1', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold',
    fontFamily: "'montserrat', sans-serif",
    boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
  },
  btnYes: {
    padding: '10px 20px', backgroundColor: '#dc2626', color: '#fff',
    border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold',
  },
};

export default EvaluationCriteria;
