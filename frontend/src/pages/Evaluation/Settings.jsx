import React from 'react';
import './Settings.css';

const Settings = () => {
  return (
    <div>
      <h2 className="page-title">System Settings</h2>
      <div className="settings-section">
        <div className="form-group">
          <label>Current Academic Year</label>
          <select className="form-control">
            <option>2025-2026 2nd Semester</option>
            <option>2025-2026 1st Semester</option>
          </select>
        </div>
        <div className="form-group">
          <label>Evaluation Deadline</label>
          <input type="date" className="form-control" defaultValue="2026-03-30" />
        </div>
        <button className="btn-save">Save Changes</button>
      </div>
    </div>
  );
};

export default Settings;