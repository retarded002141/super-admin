import React, { useState, useEffect } from 'react';
import '../../stylesheets/Portal/studentsRequest.css';

const API_BASE_URL = "http://127.0.0.1:8000/api/student/records";

export function StudentsRequest() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState(null);

  const fetchRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/all`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (e) {
      console.error("Failed to fetch student requests from server:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusChange = async (reqItem, newStatus) => {
    try {
      const response = await fetch(`${API_BASE_URL}/status-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentNumber: reqItem.studentNumber,
          requestId: reqItem.id,
          requestIndex: reqItem.requestIndex,
          newStatus: newStatus,
        }),
      });

      if (response.ok) {
        // If moved to Ready for Pickup / Approved, backend auto-archives the item
        fetchRequests();
      } else {
        alert("Failed to update status on server.");
      }
    } catch (err) {
      console.error("Error updating request status:", err);
    }
  };

  const promptDelete = (req) => {
    setRequestToDelete(req);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (requestToDelete) {
      try {
        const response = await fetch(`${API_BASE_URL}/admin-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentNumber: requestToDelete.studentNumber,
            requestId: requestToDelete.id,
            requestIndex: requestToDelete.requestIndex,
          }),
        });

        if (response.ok) {
          fetchRequests();
        } else {
          alert("Failed to delete request from server.");
        }
      } catch (e) {
        console.error("Error deleting request:", e);
      }
    }
    setDeleteModalOpen(false);
    setRequestToDelete(null);
  };

  const filteredRequests = requests.filter((req) => {
    const sName = (req.studentName || '').toLowerCase();
    const sNum = (req.studentNumber || '').toLowerCase();
    const dType = (req.documentType || '').toLowerCase();
    const reasonText = (req.reason || '').toLowerCase();
    const q = searchQuery.toLowerCase();

    const matchesSearch =
      sName.includes(q) ||
      sNum.includes(q) ||
      dType.includes(q) ||
      reasonText.includes(q);

    const matchesStatus =
      statusFilter === 'all' || (req.status || '').toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="students-request-container">
      <div className="requests-card">
        <div className="table-header-actions">
          <div>
            <h3 className="card-title">Student Record Requests</h3>
            <p className="card-description">
              Review and manage student requests for academic documents and certificates
            </p>
          </div>

          <div className="filters-row">
            <select
              className="status-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ready for pickup">Ready for Pickup</option>
            </select>

            <input
              type="text"
              className="search-input"
              placeholder="Search student, document, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student Details</th>
                <th>Requested Document</th>
                <th>Reason</th>
                <th>Year / Semester</th>
                <th>Date Requested</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>
                    Loading record requests...
                  </td>
                </tr>
              ) : filteredRequests.length > 0 ? (
                filteredRequests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <div className="student-info-cell">
                        <strong>{req.studentName}</strong>
                        <span className="sub-text">{req.studentNumber}</span>
                      </div>
                    </td>
                    <td>{req.documentType}</td>
                    <td style={{ maxWidth: '240px', fontSize: '13px', color: '#475569', wordBreak: 'break-word' }}>
                      {req.reason || '—'}
                    </td>
                    <td>{req.yearSemester}</td>
                    <td>{req.dateRequested}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          (req.status || '').toLowerCase() === 'pending'
                            ? 'badge-pending'
                            : 'badge-pickup'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="action-buttons-cell">
                        <select
                          className="action-status-select"
                          value={req.status}
                          onChange={(e) => handleStatusChange(req, e.target.value)}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Ready for Pickup">Ready for Pickup</option>
                        </select>

                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => promptDelete(req)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>
                    No record requests matching the filter criteria found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteModalOpen && requestToDelete && (
        <div className="modal-overlay">
          <div className="modal-box delete-confirm-modal">
            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              Delete Request?
            </h3>
            <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
              Are you sure you want to delete the record request for{' '}
              <strong>{requestToDelete.documentType}</strong> submitted by{' '}
              <strong>{requestToDelete.studentName}</strong>?
            </p>

            <div className="modal-actions" style={{ marginTop: '12px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={confirmDelete}
              >
                Delete Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}