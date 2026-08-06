import React from 'react';
import './SelfEvaluation.css';

const SelfEvaluation = ({ setActivePage, evaluationSections }) => {

  // Icons para sa header information
  const IconUser = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
  const IconBuilding = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1v1H9V7zm5 0h1v1h-1V7zm-5 4h1v1H9v-1zm5 0h1v1h-1v-1zm-5 4h1v1H9v-1zm5 0h1v1h-1v-1z" /></svg>;
  const IconPen = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
  const IconCalendar = () => <svg style={{marginRight: '8px'}} width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M16 2v4M8 2v4M3 10h18"/></svg>;

  if (!evaluationSections || evaluationSections.length === 0) {
    return <div className="se-loading">Loading evaluation sections...</div>;
  }

  const questions = evaluationSections[0].questions;

  return (
    <div className="se-container">
      
      {/* Navigation and Print Buttons */}
      <div className="se-top-actions no-print">
        <button className="se-btn-back" onClick={() => setActivePage('Evaluation Criteria')}>
          ← Back to Criteria
        </button>
        <button className="se-btn-print" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="se-paper">
        
        {/* Main Title Banner */}
        <div className="se-header-banner">
          SELF-EVALUATION
        </div>

        {/* Faculty Information Grid */}
        <div className="se-info-grid">
          <div className="se-info-box">
            <label className="se-info-label"><IconUser/> Name of Faculty Member</label>
            <div className="se-info-view-box">Enter your full name</div>
          </div>
          <div className="se-info-box">
            <label className="se-info-label"><IconBuilding/> Institute</label>
            <div className="se-info-view-box">Enter your institute</div>
          </div>
          <div className="se-info-box">
            <label className="se-info-label"><IconCalendar/> Date</label>
            <div className="se-info-view-box">mm/dd/yyyy</div>
          </div>
        </div>

        {/* Evaluation Scale Legend */}
        <h3 className="se-scale-legend-title">Evaluation Scale</h3>
        <div className="se-scale-legend-container">
          {[
            { num: 5, text: "Excellent" },
            { num: 4, text: "Very Good; Very Effective" },
            { num: 3, text: "Good; Acceptable Performance" },
            { num: 2, text: "Fair; Needs Improvement" },
            { num: 1, text: "Poor; Immediate actions for remedy are needed" }
          ].map((item, idx) => (
            <div key={idx} className="se-scale-row">
              <span className="se-scale-text">{item.text}</span>
              <span className="se-scale-num">{item.num}</span>
            </div>
          ))}
        </div>

        <p className="se-instruction">Please rate yourself on the following criteria:</p>

        {/* List of Questions with Box Rating Style */}
        <div className="se-questions-container">
          {questions.map((qText, index) => (
            <div key={index} className="se-question-card">
              <div className="se-q-num">
                {index + 1}
              </div>
              
              <div className="se-q-content">
                <p className="se-q-text">{qText}</p>
                
                {/* View-only Rating Boxes (1-5) */}
                <div className="se-rating-group">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div key={num} className="se-rating-box">
                      {num}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};

export default SelfEvaluation;