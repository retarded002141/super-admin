import React, { useState } from 'react';
import './EditQuestionnaire.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const EditQuestionnaire = ({ formsData, setFormsData }) => {
  const [selectedForm, setSelectedForm] = useState("Student Evaluation");
  const [saving, setSaving] = useState(false);

  const handleQuestionChange = (sectionIndex, questionIndex, newText) => {
    const updatedData = JSON.parse(JSON.stringify(formsData)); 
    updatedData[selectedForm][sectionIndex].questions[questionIndex] = newText;
    setFormsData(updatedData);
  };

  const handleAddQuestion = (sectionIndex) => {
    const updatedData = JSON.parse(JSON.stringify(formsData));
    updatedData[selectedForm][sectionIndex].questions.push("");
    setFormsData(updatedData);
  };

  const handleDeleteQuestion = (sectionIndex, questionIndex) => {
    if (window.confirm("Are you sure you want to delete this question?")) {
      const updatedData = JSON.parse(JSON.stringify(formsData));
      updatedData[selectedForm][sectionIndex].questions.splice(questionIndex, 1);
      setFormsData(updatedData);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/questionnaires/${encodeURIComponent(selectedForm)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: formsData[selectedForm] }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${selectedForm} saved successfully! Changes will now reflect on the actual form.`);
      } else {
        alert('Save failed: ' + data.message);
      }
    } catch {
      alert('Could not connect to server.');
    } finally {
      setSaving(false);
    }
  };

  const currentFormSections = formsData[selectedForm] || [];

  return (
    <div className="eq-container">
      
      {/* HEADER */}
      <div className="eq-header-row">
        <h2 className="eq-page-title">Edit Questionnaires</h2>
        <button className="eq-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* FORM SELECTOR */}
      <div className="eq-selector-card">
        <label className="eq-selector-label">Select Form to Edit:</label>
        <select 
          className="eq-select"
          value={selectedForm} 
          onChange={(e) => setSelectedForm(e.target.value)}
        >
          {Object.keys(formsData).map((formName) => (
            <option key={formName} value={formName}>{formName}</option>
          ))}
        </select>
      </div>

      {/* SECTIONS & QUESTIONS */}
      {currentFormSections.map((section, sIndex) => (
        <div key={sIndex} className="eq-section-card">
          
          <div className="eq-section-header">
            <h3 className="eq-section-title">{section.title}</h3>
          </div>

          <div className="eq-question-list">
            {section.questions.map((q, qIndex) => (
              <div key={qIndex} className="eq-question-row">
                <span className="eq-question-num">{qIndex + 1}.</span>
                <textarea 
                  className="eq-question-input" 
                  value={q} 
                  onChange={(e) => handleQuestionChange(sIndex, qIndex, e.target.value)}
                  placeholder="Type question here..."
                  rows="2" 
                  style={{ resize: 'vertical' }}
                />
                <button 
                  className="eq-delete-btn" 
                  onClick={() => handleDeleteQuestion(sIndex, qIndex)}
                  title="Delete Question"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <button className="eq-add-btn" onClick={() => handleAddQuestion(sIndex)}>
            + Add New Question
          </button>

        </div>
      ))}

    </div>
  );
};

export default EditQuestionnaire;