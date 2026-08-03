import React, { useState, useEffect } from 'react';
import '../../stylesheets/Portal/broadcast.css';

const API_BASE_URL = 'http://localhost:8001/api/announcements';

export function Broadcast() {
  const [category, setCategory] = useState('iiti');
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewPost, setPreviewPost] = useState(null);
  const [editingPostId, setEditingPostId] = useState(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);

  // Fetch Announcements from MongoDB Backend
  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}?category=${category}`);
      if (response.ok) {
        const data = await response.json();
        // Reverse or sort so the newest added posts appear at the front
        setPosts([...data].reverse());
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [category]);

  // Open Modal for Create or Edit
  const handleOpenModal = (post = null, e = null) => {
    if (e) e.stopPropagation();
    if (post) {
      setEditingPostId(post.id);
      setTitle(post.title || '');
      setDescription(post.description || '');
      setImage(post.image || '');
      setScheduleDate(post.dateValue || '');
      setIsScheduled(Boolean(post.dateValue));
    } else {
      setEditingPostId(null);
      setTitle('');
      setDescription('');
      setImage('');
      setScheduleDate('');
      setIsScheduled(false);
    }
    setIsModalOpen(true);
  };

  const handleOpenPreview = (post) => {
    setPreviewPost(post);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const formatText = (command) => {
    const textarea = document.getElementById('broadcast-editor');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = description.substring(start, end);

    let formatted = selectedText;
    if (command === 'bold') formatted = `**${selectedText}**`;
    if (command === 'italic') formatted = `_${selectedText}_`;
    if (command === 'list') formatted = `\n• ${selectedText}`;

    const newText = description.substring(0, start) + formatted + description.substring(end);
    setDescription(newText);
  };

  // Save or Update Announcement in MongoDB
  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const now = new Date();
    const formattedDisplayDate = isScheduled && scheduleDate
      ? new Date(`${scheduleDate}T00:00:00`).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : now.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

    const payload = {
      category,
      title,
      description,
      image,
      date: formattedDisplayDate,
      dateValue: isScheduled ? scheduleDate : '',
      published: true,
    };

    try {
      if (editingPostId) {
        // PUT Request to Update
        await fetch(`${API_BASE_URL}/${editingPostId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // POST Request to Create
        await fetch(API_BASE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      loadPosts();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to save announcement:', error);
    }
  };

  // Delete Announcement from MongoDB
  const handleDelete = async (id, postTitle, e) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${postTitle}"?`)) {
      try {
        await fetch(`${API_BASE_URL}/${id}`, {
          method: 'DELETE',
        });
        loadPosts();
      } catch (error) {
        console.error('Failed to delete announcement:', error);
      }
    }
  };

  return (
    <div className="broadcast-container">
      {/* Category Tabs */}
      <div className="broadcast-tabs">
        <button
          className={`broadcast-tab-btn ${category === 'iiti' ? 'active' : ''}`}
          onClick={() => setCategory('iiti')}
        >
          Institute of Information Technology & Innovation
        </button>
        <button
          className={`broadcast-tab-btn ${category === 'btech' ? 'active' : ''}`}
          onClick={() => setCategory('btech')}
        >
          BTECH News & Announcements
        </button>
      </div>

      {/* Main Control Box */}
      <div className="broadcast-card">
        <div className="broadcast-header">
          <div>
            <h3 className="card-title">
              {category === 'iiti'
                ? 'IITI Announcements Manager'
                : 'BTECH News & Updates Manager'}
            </h3>
            <p className="card-description">
              Create and manage live posts broadcasted directly to MongoDB.
            </p>
          </div>
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            + Create Post
          </button>
        </div>

        {/* Posts Cards Grid */}
        <div className="posts-grid">
          {isLoading ? (
            <div className="posts-empty-state"><p>Loading announcements from database...</p></div>
          ) : posts.length > 0 ? (
            posts.map((post) => (
              <div
                className="admin-post-card clickable-card"
                key={post.id}
                onClick={() => handleOpenPreview(post)}
                title="Click to preview announcement"
              >
                <div
                  className="post-card-media"
                  style={
                    post.image
                      ? { backgroundImage: `url(${post.image})` }
                      : undefined
                  }
                >
                  {!post.image && (
                    <div className="post-media-placeholder">No Image Attached</div>
                  )}
                  <span className="status-badge-published">Published</span>
                </div>

                <div className="post-card-body">
                  <span className="post-card-date">Posted: {post.date}</span>
                  <h4 className="post-card-title">{post.title}</h4>
                  <p className="post-card-desc">{post.description}</p>

                  <div className="post-card-actions">
                    <button
                      className="btn-secondary"
                      onClick={(e) => handleOpenModal(post, e)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-danger"
                      onClick={(e) => handleDelete(post.id, post.title, e)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="posts-empty-state">
              <p>No announcements published in this category yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* READ-ONLY PREVIEW MODAL */}
      {previewPost && (
        <div className="modal-overlay" onClick={() => setPreviewPost(null)}>
          <div className="modal-box preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="post-card-date" style={{ marginBottom: '4px' }}>
                  Posted: {previewPost.date}
                </span>
                <h3 style={{ margin: 0 }}>{previewPost.title}</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setPreviewPost(null)}>✕</button>
            </div>

            {previewPost.image && (
              <div className="preview-image-box">
                <img src={previewPost.image} alt={previewPost.title} />
              </div>
            )}

            <div className="preview-body">
              <p className="preview-desc-text">{previewPost.description}</p>
            </div>

            <div className="modal-actions" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
              <button className="btn-secondary" onClick={() => setPreviewPost(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>{editingPostId ? 'Edit Announcement' : 'Create New Announcement'}</h3>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSave} className="modal-form">
              <div className="form-group">
                <label>Announcement Title</label>
                <input
                  type="text"
                  placeholder="Enter post title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Banner Image / Photo</label>
                {!image ? (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="file-input"
                  />
                ) : (
                  <div className="image-preview-wrapper">
                    <img src={image} alt="Banner Preview" className="image-preview" />
                    <button
                      type="button"
                      className="remove-img-btn"
                      onClick={() => setImage('')}
                    >
                      Remove Photo
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <div className="editor-label-row">
                  <label>Description & Body Text</label>
                  <div className="rich-toolbar">
                    <button type="button" onClick={() => formatText('bold')}><b>B</b></button>
                    <button type="button" onClick={() => formatText('italic')}><i>I</i></button>
                    <button type="button" onClick={() => formatText('list')}>• Bullet List</button>
                  </div>
                </div>
                <textarea
                  id="broadcast-editor"
                  rows="4"
                  placeholder="Write the detailed announcement description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="form-group schedule-box">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                  />
                  <span>Schedule Post Date</span>
                </label>

                {isScheduled && (
                  <input
                    type="date"
                    className="date-picker-input"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    required
                  />
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingPostId ? 'Save Changes' : 'Publish Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}