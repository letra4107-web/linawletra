import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const gradeOptions = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', gradeLevel: 'Grade 1' });
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTeachers = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getTeachers();
        const payload = response.data || response;
        if (Array.isArray(payload)) {
          setTeachers(payload);
        }
      } catch (err) {
        setError('Unable to load teachers at this time.');
      } finally {
        setLoading(false);
      }
    };

    loadTeachers();
  }, []);

  const handleCreateTeacher = async (event) => {
    event.preventDefault();
    const newTeacher = {
      id: Date.now(),
      name: `${form.firstName} ${form.lastName}`,
      email: form.email,
      gradeLevel: form.gradeLevel,
      status: 'active',
    };

    try {
      await adminService.createTeacher(newTeacher);
      setTeachers((prev) => [newTeacher, ...prev]);
      setForm({ firstName: '', lastName: '', email: '', gradeLevel: 'Grade 1' });
    } catch (err) {
      setError('Could not create teacher. Please try again.');
    }
  };

  const assignStudents = (teacherId) => {
    setTeachers((prev) => prev.map((teacher) => (teacher.id === teacherId ? { ...teacher, assigned: (teacher.assigned || 0) + 1 } : teacher)));
  };

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Teachers</h2>
          <p>Manage teachers, assign students, and review performance snapshots.</p>
        </div>
        <span className="pill">Teacher Management</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="panel-grid">
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Create teacher account</h3>
              <p>Generate a teacher profile and assign a primary grade level.</p>
            </div>
          </div>
          <form className="teacher-form" onSubmit={handleCreateTeacher}>
            <div className="field-grid">
              <label>
                First name
                <input value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
              </label>
              <label>
                Last name
                <input value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
              </label>
            </div>
            <div className="field-grid">
              <label>
                Email address
                <input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </label>
              <label>
                Grade level
                <select value={form.gradeLevel} onChange={(e) => setForm((prev) => ({ ...prev, gradeLevel: e.target.value }))}>
                  {gradeOptions.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="btn-primary">Create Teacher</button>
          </form>
        </div>

        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Teacher roster</h3>
              <p>Current teacher accounts and activity signals.</p>
            </div>
          </div>
          <div className="status-grid dashboard-status-grid">
            <div>
              <span>Total teachers</span>
              <strong>{teachers.length}</strong>
            </div>
            <div>
              <span>Auto assign</span>
              <strong>{teachers.filter((teacher) => teacher.assigned > 0).length}</strong>
            </div>
            <div>
              <span>Active accounts</span>
              <strong>{teachers.filter((teacher) => teacher.status === 'active').length}</strong>
            </div>
          </div>
          {loading ? (
            <div className="list-skeleton">Loading teachers…</div>
          ) : (
            <ul className="alert-list">
              {teachers.slice(0, 6).map((teacher) => (
                <li key={teacher.id}>
                  <div>
                    <strong>{teacher.name}</strong>
                    <small>{teacher.email}</small>
                  </div>
                  <div>
                    <span>{teacher.gradeLevel}</span>
                    <button type="button" className="btn-secondary" onClick={() => assignStudents(teacher.id)}>
                      Assign student
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
