import React from 'react';
import './PeerEvaluation.css';

const PeerEvaluation = ({ setActivePage, evaluationSections }) => {

  // Icons para sa header information
  const IconUser = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
  const IconPeer = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
  const IconBuilding = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1v1H9V7zm5 0h1v1h-1V7zm-5 4h1v1H9v-1zm5 0h1v1h-1v-1zm-5 4h1v1H9v-1zm5 0h1v1h-1v-1z" /></svg>;
  const IconCalendar = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M16 2v4M8 2v4M3 10h18"/></svg>;

  // Loading state kung wala pang data na naipapasa mula sa App.jsx
  if (!evaluationSections || evaluationSections.length === 0) {
    return <div className="pe-loading">Loading evaluation sections...</div>;
  }

  // Kukunin natin yung questions sa unang section ng Peer Evaluation array
  const questions = evaluationSections[0].questions;

  return (
    <div className="pe-container">
      {/* Navigation and Print Buttons */}
      <div className="pe-top-actions no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="pe-btn-back" onClick={() => setActivePage('Evaluation Criteria')} style={{ cursor: 'pointer' }}>
          ← Back to Criteria
        </button>
        <button className="pe-btn-print" onClick={() => window.print()} style={{ cursor: 'pointer' }}>
          Print
        </button>
      </div>
      <div className="pe-paper">
        
        {/* Edge-to-Edge Main Title Banner */}
        <div className="pe-header-banner">
          <h2>PEER EVALUATION / FACULTY COMPENDIUM</h2>
          <p>Rating form for faculty members by peers or program directors</p>
        </div>

        {/* Info Grid - 2 columns para maayos tingnan */}
        <div className="pe-info-grid">
          <div className="pe-info-box">
            <label className="pe-info-label"><IconUser/> Name of Faculty Member</label>
            <div className="pe-info-view-box">Enter faculty name</div>
          </div>
          <div className="pe-info-box">
            <label className="pe-info-label"><IconPeer/> Evaluator's Name (PD/Peer)</label>
            <div className="pe-info-view-box">Enter evaluator name</div>
          </div>
          <div className="pe-info-box">
            <label className="pe-info-label"><IconBuilding/> Institute</label>
            <div className="pe-info-view-box">Enter institute</div>
          </div>
          <div className="pe-info-box">
            <label className="pe-info-label"><IconCalendar/> Date</label>
            <div className="pe-info-view-box">mm/dd/yyyy</div>
          </div>
        </div>

        {/* Evaluation Scale Legend */}
        <h3 className="pe-scale-legend-title">Evaluation Scale</h3>
        <div className="pe-scale-legend-container">
          {[
            { num: 5, text: "Excellent" },
            { num: 4, text: "Very Good; Very Effective" },
            { num: 3, text: "Good; Acceptable Performance" },
            { num: 2, text: "Fair; Needs Improvement" },
            { num: 1, text: "Poor; Immediate actions for remedy are needed" }
          ].map((item, idx) => (
            <div key={idx} className="pe-scale-row">
              <span className="pe-scale-text">{item.text}</span>
              <span className="pe-scale-num">{item.num}</span>
            </div>
          ))}
        </div>

        <p className="pe-instruction">The evaluator will rate the Faculty Member based on the following criteria:</p>

        {/* List of Questions with Box Rating Style */}
        <div className="pe-questions-container">
          {questions.map((qText, index) => (
            <div key={index} className="pe-question-card">
              <div className="pe-q-num">
                {index + 1}
              </div>
              
              <div className="pe-q-content">
                <p className="pe-q-text">{qText}</p>
                
                {/* View-only Rating Boxes (1-5) */}
                <div className="pe-rating-group">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div key={num} className="pe-rating-box">
                      {num}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Comments and Recommendations Section */}
        <div className="pe-comments-section">
          <label className="pe-comments-label">COMMENTS AND RECOMMENDATIONS:</label>
          <div className="pe-textarea-view-box">
            No comments provided yet.
          </div>
        </div>

      </div>
    </div>
  );
};

export default PeerEvaluation;