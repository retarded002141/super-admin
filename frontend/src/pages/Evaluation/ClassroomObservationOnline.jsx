import React from 'react';
// Pwede mong gamitin yung same CSS ng F2F file mo dito para parehas sila ng itsura
import './ClassroomObservationF2F.css'; 

const ClassroomObservationOnline = ({ setActivePage, evaluationSections = [] }) => {
  
  // VIEW ONLY SCALE
  const renderScale = () => {
    return (
      <div className="co-scale-container" style={{ pointerEvents: 'none', marginTop: '10px' }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <div key={num} className="co-radio-circle-view">
            {num}
          </div>
        ))}
      </div>
    );
  };

  // ICONS (Outline, Black/Gray)
  const IconUser = () => <svg style={{marginRight: '8px', verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
  const IconBook = () => <svg style={{marginRight: '8px', verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
  const IconTarget = () => <svg style={{marginRight: '8px', verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
  const IconCalendar = () => <svg style={{marginRight: '8px', verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M16 2v4M8 2v4M3 10h18"/></svg>;
  const IconClock = () => <svg style={{marginRight: '8px', verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/></svg>;
  const IconLink = () => <svg style={{marginRight: '8px', verticalAlign: 'middle'}} xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;

  // STYLES PARA SA SCORE BOXES
  const scoreBoxStyle = {
    backgroundColor: '#3b5f41', // Dark green na kapareho nung nasa design mo
    color: '#ffffff',
    padding: '12px 25px',
    borderRadius: '4px',
    fontWeight: '550',
    fontSize: '15px',
    display: 'inline-block'
  };

  // Kung wala pang data, magpakita ng loading
  if (!evaluationSections || evaluationSections.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading evaluation sections...</div>;
  }

  return (
    <div className="co-main-container">
      <div className="co-top-actions no-print">
        <button className="co-btn-back" onClick={() => setActivePage('Evaluation Criteria')}>
          ← Back to Criteria
        </button>
        <button className="co-btn-print" onClick={() => window.print()}> Print</button>
      </div>

      <div className="co-paper">
        {/* BANNER HEADER FOR ONLINE */}
        <div className="co-header-banner">
          <div className="co-banner-content">
            <h2>CLASSROOM / TEACHING OBSERVATION</h2>
            <p>Online Evaluation</p>
          </div>
        </div>

        {/* INPUT FIELDS WITH OUTLINE ICONS */}
         <div className="co-info-grid">
          <div className="co-info-box">
            <label style={{ display: 'flex', alignItems: 'center' }}><IconUser /> Name of Faculty Observed</label>
            <div className="co-info-view-box">Enter faculty name</div>
          </div>
          <div className="co-info-box">
            <label style={{ display: 'flex', alignItems: 'center' }}><IconBook /> Subject</label>
            <div className="co-info-view-box">Enter subject</div>
          </div>
          <div className="co-info-box">
            <label style={{ display: 'flex', alignItems: 'center' }}><IconTarget /> Topic</label>
            <div className="co-info-view-box">Enter topic</div>
          </div>
          <div className="co-info-box">
            <label style={{ display: 'flex', alignItems: 'center' }}><IconCalendar /> Academic Year</label>
            <div className="co-info-view-box">e.g., 2024-2025</div>
          </div>
          <div className="co-info-box">
            <label style={{ display: 'flex', alignItems: 'center' }}><IconCalendar /> Date</label>
            <div className="co-info-view-box">mm/dd/yyyy</div>
          </div>
          <div className="co-info-box">
            <label style={{ display: 'flex', alignItems: 'center' }}><IconClock /> Time</label>
            <div className="co-info-view-box">--:-- --</div>
          </div>
        </div>


        <p className="co-instruction" style={{ marginTop: '40px', marginBottom: '40px', fontWeight: '500' }}>
          Directions: Choose the rating that best describes your observation using the scale 1 to 10.
        </p>

        {/* DYNAMIC SECTIONS & QUESTIONS */}
        {evaluationSections.map((section, sIndex) => {
          // Dynamic calculation: Ilang tanong x 10 = Max Score para sa section na ito
          const maxScore = section.questions.length * 10;

          return (
            <div className="co-category-section" style={{ marginBottom: '60px' }} key={sIndex}>
              <div className="co-category-header" style={{ marginBottom: '30px' }}>{section.title}</div>
              
              <div className="co-questions-list">
                {section.questions.map((qText, idx) => (
                  <div className="co-question-row" key={`q-${sIndex}-${idx}`} style={{ marginBottom: '30px', alignItems: 'flex-start' }}>
                    <span className="co-q-num" style={{ marginTop: '2px' }}>{idx + 1}</span>
                    <div className="co-q-content">
                      <p style={{ margin: '0 0 10px 0', fontWeight: '500' }}>{qText}</p>
                      {renderScale()}
                    </div>
                  </div>
                ))}
              </div>

              {/* CATEGORY SCORES - DYNAMIC MAX SCORE */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '10px' }}>
                <div style={scoreBoxStyle}>Subtotal: 0/{maxScore}</div>
                <div style={scoreBoxStyle}>Average: 0.00</div>
              </div>
            </div>
          );
        })}

        {/* COMMENTS SECTION */}
        <div className="co-comments-section" style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          <div className="co-comment-box">
            <label style={{ fontWeight: '600', marginBottom: '10px', display: 'block' }}>Comments:</label>
            <div className="co-textarea-view-box" style={{ minHeight: '100px', padding: '15px' }}>Enter your comments / observations here...</div>
          </div>
          <div className="co-comment-box">
            <label style={{ fontWeight: '600', marginBottom: '10px', display: 'block' }}>Recommendations:</label>
            <div className="co-textarea-view-box" style={{ minHeight: '100px', padding: '15px' }}>Enter your recommendations here...</div>
          </div>
        </div>

        {/* SIGNATURES (Base sa Online form) */}
        <div className="co-signatures" style={{ marginTop: '60px' }}>
          <div className="co-sig-item"><label>Evaluated By:</label><div className="co-info-view-box">Enter your name</div></div>
          <div className="co-sig-item"><label>Acknowledged By:</label><div className="co-info-view-box">Faculty Signature</div></div>
          <div className="co-sig-item"><label>Date:</label><div className="co-info-view-box">mm/dd/yyyy</div></div>
        </div>

      </div>
    </div>
  );
};

export default ClassroomObservationOnline;