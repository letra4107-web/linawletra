import React, { useState } from 'react';

const initialContent = [
  { id: 1, title: 'Reading Comprehension: Stories', category: 'Reading', published: true },
  { id: 2, title: 'Grammar Builder: Sentences', category: 'Grammar', published: false },
  { id: 3, title: 'Vocabulary Drill: Filipino Words', category: 'Vocabulary', published: true },
];

export default function Content() {
  const [contentItems, setContentItems] = useState(initialContent);
  const [draft, setDraft] = useState({ title: '', category: 'Reading', published: false });

  const handleCreateItem = (event) => {
    event.preventDefault();
    setContentItems((prev) => [
      { ...draft, id: Date.now(), title: draft.title || 'Untitled content' },
      ...prev,
    ]);
    setDraft({ title: '', category: 'Reading', published: false });
  };

  const handleTogglePublished = (id) => {
    setContentItems((prev) => prev.map((item) => (item.id === id ? { ...item, published: !item.published } : item)));
  };

  const handleDelete = (id) => {
    setContentItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Content</h2>
          <p>Manage lessons, reading materials, categories, and published content.</p>
        </div>
        <span className="pill">Content Library</span>
      </div>

      <div className="dashboard-grid-two">
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Upload new lesson</h3>
              <p>Add reading materials or exercises and organize them by category.</p>
            </div>
          </div>
          <form className="teacher-form" onSubmit={handleCreateItem}>
            <div className="field-grid">
              <label>
                Content title
                <input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} required />
              </label>
              <label>
                Category
                <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}>
                  <option value="Reading">Reading</option>
                  <option value="Grammar">Grammar</option>
                  <option value="Vocabulary">Vocabulary</option>
                </select>
              </label>
            </div>
            <label>
              Publish now
              <input type="checkbox" checked={draft.published} onChange={(e) => setDraft((prev) => ({ ...prev, published: e.target.checked }))} />
            </label>
            <button type="submit" className="btn-primary">Add content</button>
          </form>
        </div>

        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Content categories</h3>
              <p>Track the material mix and update items across learning paths.</p>
            </div>
          </div>
          <div className="status-grid dashboard-status-grid">
            <div>
              <span>Reading</span>
              <strong>{contentItems.filter((item) => item.category === 'Reading').length}</strong>
            </div>
            <div>
              <span>Grammar</span>
              <strong>{contentItems.filter((item) => item.category === 'Grammar').length}</strong>
            </div>
            <div>
              <span>Vocabulary</span>
              <strong>{contentItems.filter((item) => item.category === 'Vocabulary').length}</strong>
            </div>
            <div>
              <span>Published</span>
              <strong>{contentItems.filter((item) => item.published).length}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Lesson content list</h3>
            <p>Edit or remove content from the active library.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contentItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.category}</td>
                  <td>{item.published ? 'Published' : 'Draft'}</td>
                  <td>
                    <button type="button" className="btn-secondary" onClick={() => handleTogglePublished(item.id)}>
                      {item.published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
