// src/pages/Portal/StudentsRequest.jsx
import React, { useState, useEffect } from 'react';
import '../../stylesheets/Portal/studentsRequest.css';

const API_BASE_URL = "http://127.0.0.1:8000/api/student/records";
const FIXED_DOCUMENTS = [
  "Certificate of Registration (COR)",
  "Certificate of Grades (COG)",
  "Transcript of Records (TOR)",
];

export function StudentsRequest() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState(null);

  // Archive Delete Confirm Modal State
  const [deleteArchiveModalOpen, setDeleteArchiveModalOpen] = useState(false);
  const [archiveToDelete, setArchiveToDelete] = useState(null);

  // Reason View Modal State
  const [viewReasonModalOpen, setViewReasonModalOpen] = useState(false);
  const [requestToView, setRequestToView] = useState(null);

  // Archive Modal & State
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archivedRequests, setArchivedRequests] = useState([]);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);

  // Management Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [activeManageTab, setActiveManageTab] = useState('documents');
  
  const [documents, setDocuments] = useState(FIXED_DOCUMENTS);
  const [reasons, setReasons] = useState([]);

  const [newDocInput, setNewDocInput] = useState('');
  const [newReasonInput, setNewReasonInput] = useState('');

  const [editingDocIdx, setEditingDocIdx] = useState(null);
  const [editingDocText, setEditingDocText] = useState('');

  const [editingReasonIdx, setEditingReasonIdx] = useState(null);
  const [editingReasonText, setEditingReasonText] = useState('');

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

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/config`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || FIXED_DOCUMENTS);
        setReasons(data.reasons || []);
      }
    } catch (e) {
      console.error("Failed to fetch records config from server:", e);
    }
  };

  const fetchArchivedRequests = async () => {
    setIsArchiveLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/archived`);
      if (response.ok) {
        const data = await response.json();
        setArchivedRequests(data.archived || []);
      }
    } catch (e) {
      console.error("Failed to fetch archived requests:", e);
    } finally {
      setIsArchiveLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchConfig();
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

  // --- ARCHIVE DELETION HANDLERS ---
  const promptDeleteArchive = (arch) => {
    setArchiveToDelete(arch);
    setDeleteArchiveModalOpen(true);
  };

  const confirmDeleteArchive = async () => {
    if (archiveToDelete) {
      try {
        const targetId = archiveToDelete._id || archiveToDelete.id;
        const response = await fetch(`${API_BASE_URL}/archived/delete/${targetId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          fetchArchivedRequests();
        } else {
          alert("Failed to delete archived item.");
        }
      } catch (e) {
        console.error("Error deleting archived record:", e);
      }
    }
    setDeleteArchiveModalOpen(false);
    setArchiveToDelete(null);
  };

  const openReasonViewer = (req) => {
    setRequestToView(req);
    setViewReasonModalOpen(true);
  };

  const handleOpenArchiveModal = () => {
    fetchArchivedRequests();
    setIsArchiveModalOpen(true);
  };

  // --- SAVE CONFIG TO BACKEND ---
  const saveConfigToBackend = async (newDocs, newReasons) => {
    try {
      const response = await fetch(`${API_BASE_URL}/config/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documents: newDocs,
          reasons: newReasons,
        }),
      });
      if (response.ok) {
        fetchConfig();
      } else {
        alert("Failed to save changes to server.");
      }
    } catch (e) {
      console.error("Error updating config:", e);
      alert("Network error updating request configurations.");
    }
  };

  // --- DOCUMENT HANDLERS ---
  const handleAddDocument = () => {
    if (!newDocInput.trim()) return;
    const updated = [...documents, newDocInput.trim()];
    saveConfigToBackend(updated, reasons);
    setNewDocInput('');
  };

  const handleDeleteDocument = (docName) => {
    if (FIXED_DOCUMENTS.includes(docName)) return;
    const updated = documents.filter((d) => d !== docName);
    saveConfigToBackend(updated, reasons);
  };

  const handleSaveEditDocument = (idx) => {
    if (!editingDocText.trim()) return;
    const updated = [...documents];
    updated[idx] = editingDocText.trim();
    saveConfigToBackend(updated, reasons);
    setEditingDocIdx(null);
    setEditingDocText('');
  };

  // --- REASON HANDLERS ---
  const handleAddReason = () => {
    if (!newReasonInput.trim()) return;
    const updated = [...reasons, newReasonInput.trim()];
    saveConfigToBackend(documents, updated);
    setNewReasonInput('');
  };

  const handleDeleteReason = (index) => {
    const updated = reasons.filter((_, i) => i !== index);
    saveConfigToBackend(documents, updated);
  };

  const handleSaveEditReason = (index) => {
    if (!editingReasonText.trim()) return;
    const updated = [...reasons];
    updated[index] = editingReasonText.trim();
    saveConfigToBackend(documents, updated);
    setEditingReasonIdx(null);
    setEditingReasonText('');
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
            {/* ARCHIVED REQUESTS BUTTON */}
            <button
              type="button"
              className="btn-secondary"
              onClick={handleOpenArchiveModal}
              style={{
                marginRight: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 20 20">
                <path d="M0 0h20v20H0z" fill="none" />
                <path fill="#475569" d="M19 4v2H1V4zM2 7h16v10H2zm11 3V9H7v1z" />
              </svg>
              Archived
            </button>

            {/* MATCHING MANAGE BUTTON */}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsManageModalOpen(true)}
              style={{
                marginRight: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="1.1em" height="1.1em" viewBox="0 0 512 512">
                <path d="M0 0h512v512H0z" fill="none" />
                <path fill="#475569" d="M256 176a80 80 0 1 0 80 80a80.24 80.24 0 0 0-80-80m172.72 80a165.5 165.5 0 0 1-1.64 22.34l48.69 38.12a11.59 11.59 0 0 1 2.63 14.78l-46.06 79.52a11.64 11.64 0 0 1-14.14 4.93l-57.25-23a176.6 176.6 0 0 1-38.82 22.67l-8.56 60.78a11.93 11.93 0 0 1-11.51 9.86h-92.12a12 12 0 0 1-11.51-9.53l-8.56-60.78A169.3 169.3 0 0 1 151.05 393L93.8 416a11.64 11.64 0 0 1-14.14-4.92L33.6 331.57a11.59 11.59 0 0 1 2.63-14.78l48.69-38.12A175 175 0 0 1 83.28 256a165.5 165.5 0 0 1 1.64-22.34l-48.69-38.12a11.59 11.59 0 0 1-2.63-14.78l46.06-79.52a11.64 11.64 0 0 1 14.14-4.93l57.25 23a176.6 176.6 0 0 1 38.82-22.67l8.56-60.78A11.93 11.93 0 0 1 209.94 26h92.12a12 12 0 0 1 11.51 9.53l8.56 60.78A169.3 169.3 0 0 1 361 119l57.2-23a11.64 11.64 0 0 1 14.14 4.92l46.06 79.52a11.59 11.59 0 0 1-2.63 14.78l-48.69 38.12a175 175 0 0 1 1.64 22.66" />
              </svg>
              Manage
            </button>

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
                    
                    <td 
                      onClick={() => openReasonViewer(req)}
                      style={{ 
                        maxWidth: '180px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        fontSize: '13px', 
                        color: '#2563eb',
                        cursor: 'pointer',
                        textDecoration: 'underline dotted'
                      }}
                      title="Click to view full reason"
                    >
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

      {/* WIDE ARCHIVED REQUESTS MODAL */}
      {isArchiveModalOpen && (
        <div className="modal-overlay" onClick={() => setIsArchiveModalOpen(false)}>
          <div className="modal-box" style={{ maxWidth: '1000px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="1.3em" height="1.3em" viewBox="0 0 20 20">
                  <path d="M0 0h20v20H0z" fill="none" />
                  <path fill="#2e522a" d="M19 4v2H1V4zM2 7h16v10H2zm11 3V9H7v1z" />
                </svg>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Archived Requests</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setIsArchiveModalOpen(false)}>✕</button>
            </div>

            <div style={{ margin: '16px 0', maxHeight: '420px', overflowY: 'auto' }}>
              {isArchiveLoading ? (
                <p style={{ textAlign: 'center', color: '#64748b' }}>Loading archives...</p>
              ) : archivedRequests.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Document</th>
                      <th>Reason</th>
                      <th>Date Requested</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedRequests.map((arch) => (
                      <tr key={arch._id || arch.id}>
                        <td>
                          <strong>{arch.studentName}</strong>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{arch.studentNumber}</div>
                        </td>
                        <td>{arch.documentType}</td>
                        <td 
                          onClick={() => openReasonViewer(arch)}
                          style={{ 
                            maxWidth: '220px', 
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '13px', 
                            color: '#2563eb',
                            cursor: 'pointer',
                            textDecoration: 'underline dotted'
                          }}
                          title="Click to view full reason"
                        >
                          {arch.reason || '—'}
                        </td>
                        <td>{arch.dateRequested}</td>
                        <td>
                          <span className="status-badge badge-pickup">
                            {arch.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => promptDeleteArchive(arch)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: '#dc2626',
                              fontWeight: '600',
                              fontSize: '13px',
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: '4px'
                            }}
                            onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                            onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ textAlign: 'center', color: '#64748b' }}>No archived requests found.</p>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsArchiveModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM ARCHIVE DELETION MODAL */}
      {deleteArchiveModalOpen && archiveToDelete && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-box delete-confirm-modal">
            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              Delete Archived Request?
            </h3>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete the archived request for{' '}
              <strong>{archiveToDelete.documentType}</strong> submitted by{' '}
              <strong>{archiveToDelete.studentName}</strong>?
            </p>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteArchiveModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-confirm"
                onClick={confirmDeleteArchive}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REASON VIEW MODAL */}
      {viewReasonModalOpen && requestToView && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setViewReasonModalOpen(false)}>
          <div className="modal-box" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Request Reason Details</h3>
              <button className="modal-close-btn" onClick={() => setViewReasonModalOpen(false)}>✕</button>
            </div>
            
            <div style={{ margin: '16px 0', fontSize: '14px', lineHeight: '1.6' }}>
              <p style={{ margin: '0 0 6px 0', color: '#64748b' }}>
                <strong>Student:</strong> {requestToView.studentName} ({requestToView.studentNumber})
              </p>
              <p style={{ margin: '0 0 12px 0', color: '#64748b' }}>
                <strong>Document:</strong> {requestToView.documentType}
              </p>
              
              <div style={{
                padding: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                color: '#1e293b',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {requestToView.reason || 'No reason specified.'}
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setViewReasonModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ACTIVE REQUEST CONFIRMATION MODAL */}
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

      {/* UNIFIED MANAGE CONFIGURATION MODAL */}
      {isManageModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '560px' }}>
            <div className="modal-header" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Manage Request Options</h3>
              <button
                className="modal-close-btn"
                onClick={() => {
                  setIsManageModalOpen(false);
                  setEditingDocIdx(null);
                  setEditingReasonIdx(null);
                }}
              >
                ✕
              </button>
            </div>

            {/* TAB SELECTOR */}
            <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setActiveManageTab('documents')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: 'none',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                  borderBottom: activeManageTab === 'documents' ? '2px solid #2e522a' : 'none',
                  color: activeManageTab === 'documents' ? '#2e522a' : '#64748b',
                  marginBottom: '-2px',
                }}
              >
                Document Types
              </button>
              <button
                type="button"
                onClick={() => setActiveManageTab('reasons')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: 'none',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                  borderBottom: activeManageTab === 'reasons' ? '2px solid #2e522a' : 'none',
                  color: activeManageTab === 'reasons' ? '#2e522a' : '#64748b',
                  marginBottom: '-2px',
                }}
              >
                Request Reasons
              </button>
            </div>

            {/* TAB 1: DOCUMENT TYPES */}
            {activeManageTab === 'documents' && (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Type new document choice name..."
                    value={newDocInput}
                    onChange={(e) => setNewDocInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddDocument}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + Add Document
                  </button>
                </div>

                <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  {documents.map((doc, idx) => {
                    const isFixed = FIXED_DOCUMENTS.includes(doc);
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: isFixed ? '#f8fafc' : '#ffffff',
                        }}
                      >
                        {editingDocIdx === idx && !isFixed ? (
                          <input
                            type="text"
                            className="search-input"
                            value={editingDocText}
                            onChange={(e) => setEditingDocText(e.target.value)}
                            style={{ flex: 1, marginRight: '8px' }}
                            autoFocus
                          />
                        ) : (
                          <span style={{ fontSize: '14px', color: isFixed ? '#64748b' : '#334155', fontWeight: '500' }}>
                            {doc} {isFixed && <span style={{ fontSize: '12px', fontStyle: 'italic', marginLeft: '4px' }}></span>}
                          </span>
                        )}

                        {!isFixed ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {editingDocIdx === idx ? (
                              <>
                                <button type="button" className="btn-secondary" onClick={() => handleSaveEditDocument(idx)}>Save</button>
                                <button type="button" className="btn-secondary" onClick={() => setEditingDocIdx(null)}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="btn-secondary" onClick={() => { setEditingDocIdx(idx); setEditingDocText(doc); }}>Edit</button>
                                <button type="button" className="btn-danger" onClick={() => handleDeleteDocument(doc)}>Remove</button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}></span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: REQUEST REASONS */}
            {activeManageTab === 'reasons' && (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Type new request reason choice..."
                    value={newReasonInput}
                    onChange={(e) => setNewReasonInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddReason}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + Add Reason
                  </button>
                </div>

                <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  {reasons.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      {editingReasonIdx === idx ? (
                        <input
                          type="text"
                          className="search-input"
                          value={editingReasonText}
                          onChange={(e) => setEditingReasonText(e.target.value)}
                          style={{ flex: 1, marginRight: '8px' }}
                          autoFocus
                        />
                      ) : (
                        <span style={{ fontSize: '14px', color: '#334155', fontWeight: '500' }}>
                          {item}
                        </span>
                      )}

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {editingReasonIdx === idx ? (
                          <>
                            <button type="button" className="btn-secondary" onClick={() => handleSaveEditReason(idx)}>Save</button>
                            <button type="button" className="btn-secondary" onClick={() => setEditingReasonIdx(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn-secondary" onClick={() => { setEditingReasonIdx(idx); setEditingReasonText(item); }}>Edit</button>
                            <button type="button" className="btn-danger" onClick={() => handleDeleteReason(idx)}>Remove</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#f8fafc',
                      color: '#64748b',
                      fontSize: '13px',
                      fontStyle: 'italic',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setIsManageModalOpen(false);
                  setEditingDocIdx(null);
                  setEditingReasonIdx(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}