import React, { useState } from 'react';
import './StudentEvaluation.css';

const StudentEvaluation = ({ 
  isViewOnly = false, 
  setActivePage,
  evaluationSections = [] // Dito papasok yung mga tanong galing sa Parent component
}) => {
  const [step, setStep] = useState(0); 
  const [formData, setFormData] = useState({
    email: '',
    instructor: '',
    subject: '',
    ratings: {}, 
    likes: '',
    dislikes: ''
  });

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);
  const handleClear = () => {
    if(window.confirm('Are you sure you want to clear the form?')) {
      setFormData({ email: '', instructor: '', subject: '', ratings: {}, likes: '', dislikes: '' });
      setStep(0);
    }
  };

  const handleRatingChange = (sectionTitle, questionIndex, value) => {
    if (isViewOnly) return; 
    setFormData(prev => ({
      ...prev,
      ratings: {
        ...prev.ratings,
        [`${sectionTitle}-${questionIndex}`]: value
      }
    }));
  };

  // step 0 - instructions
  if (step === 0) {
    return (
      <div className="gray-bg">
        <div className="eval-container">
          
          {isViewOnly && (
            <div className="preview-header">
              <button onClick={() => setActivePage('Evaluation Criteria')} className="btn-back-admin">
                ← Back to Evaluation Criteria
              </button>
              <div className="preview-banner">
                PREVIEW MODE: You are viewing this form as an Admin. (Read-Only)
              </div>
            </div>
          )}

          <div className="eval-card top-border">
            <h1>Student Evaluation</h1>
            <p className="intro-text">Dear Students,</p>
            <p className="intro-text">Your feedback is invaluable in helping us maintain and improve the quality of education at Dalubhasang Politekniko ng Lungsod ng Baliwag. We sincerely appreciate your time and insights. By sharing your thoughts and observations, you contribute to the enhancement of the learning experience for both current and future students. Please take a few moments to complete this evaluation form, sharing your thoughts on your educational experience with us.</p>
            
            <div className="eval-instructions">
              <p><b>Student Evaluation Form Instructions:</b></p>
              <p>Below are instructions for filling out the student evaluation form. Your honest and constructive feedback is highly encouraged and will be kept confidential:</p>

              <h4>1. Program and Instructor Information:</h4>
              <ul>
                <li>Select the subject and section handled by the instructor. Kindly review your answer before submitting the form. You can only respond once and cannot change your response once it has been submitted.</li>
              </ul>
              
              <h4>2. Evaluation Scale:</h4>
              <ul>
                <li>Please rate your instructors honestly. Use the provided scale to rate various aspects of the program and instructor. Be guided by the following</li>
              </ul>
              <table className="scale-table">
                <thead>
                  <tr><th>Descriptor</th><th>Score</th><th>Interpretation</th></tr>
                </thead>
                <tbody>
                  <tr><td>Strongly Agree</td><td>4</td><td>Almost all students have frequently observed the statements.</td></tr>
                  <tr><td>Agree</td><td>3</td><td>Most of the students have observed the statements.</td></tr>
                  <tr><td>Disagree</td><td>2</td><td>Only a few students have observed the statements.</td></tr>
                  <tr><td>Strongly Disagree</td><td>1</td><td>Almost all of the students have not observed the statements.</td></tr>
                </tbody>
              </table>

              <h4>3. Written Comments:</h4>
              <ul>
                <li>In the open-text sections, please share detailed feedback on the following areas:
                  <ul style={{ marginTop: '5px' }}>
                    <li><b>Course Content:</b> Comment on the relevance, depth, and clarity of the course material.</li>
                    <li><b>Instructor's Performance:</b> Share your thoughts on the instructor's teaching style, communication, and responsiveness.</li>
                    <li><b>Teaching Methods:</b> Describe what teaching methods were effective or suggest improvements.</li>
                    <li><b>Classroom Environment:</b> Discuss the classroom atmosphere, interaction, and any suggestions for improvement.</li>
                    <li><b>Overall Experience:</b> Summarize your overall experience and any additional comments or suggestions you may have.</li>
                  </ul>
                </li>
              </ul>

              <h4>4. Honesty and Constructiveness:</h4>
              <ul>
                <li>Be honest and specific in your feedback. Your insights, whether positive or constructive, are essential for improvement.</li>
                <li>If you have concerns or suggestions for improvement, please provide details and examples.</li>
              </ul>

              <h4>5. Confidentiality:</h4>
              <ul>
                <li><u>Your responses will be kept confidential</u>, and your name will not be associated with your feedback.</li>
              </ul>

              <h4>6. Submission:</h4>
              <ul>
                <li>Submit the form after completing the evaluation.</li>
              </ul>

              <p style={{ marginTop: '20px', lineHeight: '1.5' }}>Your feedback plays a vital role in enhancing the educational experience for everyone. Thank you for taking the time to help us continually improve our courses and instructors.</p>
            </div>
          </div>

          <div className="eval-card email-card" style={{ padding: '20px 30px' }}>
            <label className="checkbox-label" style={{ display: 'flex', gap: '10px', alignItems: 'center', opacity: isViewOnly ? 0.6 : 1 }}>
              <input type="checkbox" required disabled={isViewOnly} />
              <div>
                <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '2px' }}>Email*</div>
                <span>Record <b>202310048@btech.ph.education</b> as the email to be included with my response</span>
              </div>
            </label>
          </div>

          <div className="form-actions-bottom" style={{ justifyContent: 'flex-end' }}>
            <div className="right-actions">
              {!isViewOnly && <button className="btn-clear-form" onClick={handleClear}>Clear Form</button>}
              <button className="btn-next-step" onClick={handleNext}>NEXT</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // step 6 - done na, success page
  if (step === 6) {
    return (
      <div className="gray-bg">
        <div className="eval-container">
          <div className="eval-card top-border">
            <h1>Student Evaluation</h1>
            <p>{isViewOnly ? "You have reached the end of the form preview." : "Your response has been recorded."}</p>
            {isViewOnly && (
              <button 
                onClick={() => setActivePage('Evaluation Criteria')}
                style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Go Back to Criteria List
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // steps 1-5 - yung actual questions

  // Kung wala pang laman ang evaluationSections, huwag muna mag-render para iwas error
  if (!evaluationSections || evaluationSections.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading evaluation sections...</div>;
  }

  const currentSection = evaluationSections[step - 1];

  // Logic para sa Dropdown: Naka-enable lang siya kung nasa Form 1 (step === 1)
  const isDropdownDisabled = step > 1;

  return (
    <div className="gray-bg">
      <div className="eval-container">
        
        {/* GREEN HEADER WITH DYNAMIC DROPDOWNS */}
        <div className="form-header-green">
          
          {/* INSTRUCTOR: Mas malapad (flex: 2 at max-width 400px) */}
          <select 
            className={`form-select-green ${isDropdownDisabled ? 'locked' : ''}`}
            style={{ flex: 2, maxWidth: '320px' }} 
            disabled={isDropdownDisabled} 
            value={formData.instructor} 
            onChange={e => setFormData({...formData, instructor: e.target.value})}
          >
            <option value="" disabled>Select Instructor...</option>
            <option value="Marvic Ablaza">Marvic Ablaza</option>
            <option value="Juan Dela Cruz">Juan Dela Cruz</option>
          </select>

          {/* SUBJECT: Mas maikli (flex: 1 at max-width 180px) */}
          <select 
            className={`form-select-green ${isDropdownDisabled ? 'locked' : ''}`}
            style={{ flex: 1, maxWidth: '180px' }} 
            disabled={isDropdownDisabled} 
            value={formData.subject} 
            onChange={e => setFormData({...formData, subject: e.target.value})}
          >
            <option value="" disabled>Select Subject...</option>
            <option value="IPT101">IPT101</option>
            <option value="ITP102">ITP102</option>
          </select>
          
        </div>

        {/* EVALUATION SCALE CARD */}
        <div className="eval-card scale-guide-card">
           <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Evaluation Scale</h3>
           <table className="scale-table mini-scale">
                <thead>
                  <tr>
                    <th style={{width: '15%'}}>Descriptor</th>
                    <th style={{width: '30%', textAlign: 'center'}}>Score</th>
                    <th>Interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Strongly Agree</td><td style={{textAlign: 'center'}}>4</td><td>Almost all students have frequently observed the statements.</td></tr>
                  <tr><td>Agree</td><td style={{textAlign: 'center'}}>3</td><td>Most of the students have observed the statements.</td></tr>
                  <tr><td>Disagree</td><td style={{textAlign: 'center'}}>2</td><td>Only a few students have observed the statements.</td></tr>
                  <tr><td>Strongly Disagree</td><td style={{textAlign: 'center'}}>1</td><td>Almost all of the students have not observed the statements.</td></tr>
                </tbody>
            </table>
        </div>

        {/* QUESTIONS CONTAINER */}
        <div className="questions-container">
          <div className="section-title-banner">
            {currentSection?.title?.toUpperCase()}
          </div>
          
          <div className="questions-body">
            <h4 className="teacher-is-title">The teacher is</h4>
            
            {currentSection?.questions?.map((q, idx) => (
              <div className="q-row" key={idx}>
                <div className="q-text">{q}</div>
                <div className="q-radios">
                  {[1, 2, 3, 4].map(num => (
                    <label 
                      key={num} 
                      className={`q-radio-label ${formData.ratings[`${currentSection.title}-${idx}`] === num ? 'selected' : ''}`}
                      style={{ cursor: isViewOnly ? 'not-allowed' : 'pointer', opacity: isViewOnly ? 0.7 : 1 }}
                    >
                      <input 
                        type="radio" 
                        name={`${currentSection.title}-${idx}`} 
                        value={num}
                        checked={formData.ratings[`${currentSection.title}-${idx}`] === num}
                        onChange={() => handleRatingChange(currentSection.title, idx, num)}
                        disabled={isViewOnly}
                      />
                      {num}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OPEN TEXT AREAS (Lumalabas lang sa Step 5) */}
        {step === 5 && (
          <>
            <div className="eval-card open-text-card">
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '15px' }}>What do you like about this teacher, the class, or the course?</label>
              <textarea 
                disabled={isViewOnly} 
                placeholder="Your answer" 
                value={formData.likes} 
                onChange={e => setFormData({...formData, likes: e.target.value})}
                style={{ width: '100%', minHeight: '80px', border: 'none', borderBottom: '1px solid #ccc', outline: 'none', resize: 'vertical', fontFamily: 'inherit', padding: '5px 0' }}
              ></textarea>
            </div>
            <div className="eval-card open-text-card">
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '15px' }}>What do you not like about this teacher, the class, or the course?</label>
              <textarea 
                disabled={isViewOnly} 
                placeholder="Your answer" 
                value={formData.dislikes} 
                onChange={e => setFormData({...formData, dislikes: e.target.value})}
                style={{ width: '100%', minHeight: '80px', border: 'none', borderBottom: '1px solid #ccc', outline: 'none', resize: 'vertical', fontFamily: 'inherit', padding: '5px 0' }}
              ></textarea>
            </div>
          </>
        )}

        {/* BOTTOM ACTIONS */}
        <div className="form-actions-bottom">
          <button className="btn-back-step" onClick={handleBack}>BACK</button>
          
          <div className="right-actions">
            {!isViewOnly && <button className="btn-clear-form" onClick={handleClear}>Clear Form</button>}
            <button className="btn-next-step" onClick={handleNext}>
              {step === 5 ? (isViewOnly ? 'FINISH' : 'SUBMIT') : 'NEXT'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default StudentEvaluation;