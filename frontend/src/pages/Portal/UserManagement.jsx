import React, { useState } from 'react';
import '../../stylesheets/Portal/userManagement.css';

export function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');

  // Active Student Portal Accounts
  const [portalUsers, setPortalUsers] = useState([
    { id: 1, studentNumber: '202310488', name: 'Justin Dela Cruz', course: 'BSIT 3A' },
    { id: 2, studentNumber: '202310102', name: 'Maria Santos', course: 'BSIT 3A' },
    { id: 3, studentNumber: '202310901', name: 'Juan Reyes', course: 'BSIT 2B' },
  ]);

  // Handle Delete/Remove Account
  const handleDeleteUser = (id, name) => {
    if (window.confirm(`Are you sure you want to remove the portal account for ${name}?`)) {
      setPortalUsers((prev) => prev.filter((user) => user.id !== id));
    }
  };

  const filteredPortalUsers = portalUsers.filter(
    (u) =>
      u.studentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.course.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="user-mgmt-container">
      <div className="mgmt-card">
        <div className="table-header-actions">
          <div className="title-with-counter">
            <div>
              <h3 className="card-title">Portal Users Directory</h3>
              <p className="card-description">
                Active registered accounts in the student portal system
              </p>
            </div>
            {/* User Counter Badge */}
            <div className="user-counter-badge">
              <span className="counter-number">{portalUsers.length}</span>
              <span className="counter-label">Total Users</span>
            </div>
          </div>

          <input
            type="text"
            className="search-input"
            placeholder="Search student number, name, or section..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student Number</th>
                <th>Full Name</th>
                <th>Year & Section</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPortalUsers.length > 0 ? (
                filteredPortalUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.studentNumber}</strong>
                    </td>
                    <td>{user.name}</td>
                    <td>{user.course}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteUser(user.id, user.name)}
                      >
                        Remove Account
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No matching student portal accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}