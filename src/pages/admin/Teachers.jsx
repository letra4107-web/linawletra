import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const gradeOptions = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

export default function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', gradeLevels: ['Grade 1'] });
  const [error, setError] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState(null);

  useEffect(() => {
    const loadTeachers = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getTeachers();
        const payload = response.data || response;
        if (Array.isArray(payload?.teachers)) {
          setTeachers(payload.teachers);
        } else if (Array.isArray(payload)) {
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
    const selectedGrades = form.gradeLevels;
    const newTeacher = {
      firstName: form.firstName,
      lastName: form.lastName,
      name: `${form.firstName} ${form.lastName}`.trim(),
      email: form.email,
      gradeLevel: selectedGrades[0],
      gradeLevels: selectedGrades,
    };

    try {
      setError('');
      setCreatedCredentials(null);
      if (!selectedGrades.length) {
        setError('Select at least one handled grade.');
        return;
      }
      const response = await adminService.createTeacher(newTeacher);
      const createdTeacher = response?.data?.teacher || {
        ...newTeacher,
        id: Date.now(),
        status: 'active',
      };
      setTeachers((prev) => [createdTeacher, ...prev]);
      setCreatedCredentials(response?.data?.credentials || null);
      setForm({ firstName: '', lastName: '', email: '', gradeLevels: ['Grade 1'] });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not create teacher. Please try again.');
    }
  };

  const toggleGrade = (grade) => {
    setForm((prev) => {
      const hasGrade = prev.gradeLevels.includes(grade);
      const gradeLevels = hasGrade
        ? prev.gradeLevels.filter((item) => item !== grade)
        : [...prev.gradeLevels, grade];
      return { ...prev, gradeLevels };
    });
  };

  const formatTeacherGrades = (teacher) => {
    const grades = teacher.gradeLevels || teacher.handledGradeLevels || teacher.metadata?.gradeLevels || teacher.metadata?.handledGradeLevels;
    if (Array.isArray(grades) && grades.length) return grades.join(', ');
    return teacher.gradeLevel || teacher.metadata?.gradeLevel || 'No grade assigned';
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
      {createdCredentials && (
        <div className="dashboard-banner">
          Teacher created. Login email: <strong>{createdCredentials.email}</strong> Temporary password:{' '}
          <strong>{createdCredentials.password}</strong>
        </div>
      )}

      <div className="panel-grid">
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Create teacher account</h3>
              <p>Generate a teacher profile and assign handled grade levels.</p>
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
            </div>
            <div className="field-grid">
              <label>
                Handled grades
                <div className="grade-checkbox-grid">
                  {gradeOptions.map((grade) => (
                    <label key={grade} className="grade-checkbox">
                      <input
                        type="checkbox"
                        checked={form.gradeLevels.includes(grade)}
                        onChange={() => toggleGrade(grade)}
                      />
                      <span>{grade}</span>
                    </label>
                  ))}
                </div>
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
              <span>Assigned students</span>
              <strong>{teachers.reduce((sum, teacher) => sum + Number(teacher.assignedStudentCount || 0), 0)}</strong>
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
                    <span>{formatTeacherGrades(teacher)}</span>
                    <small>{Number(teacher.assignedStudentCount || 0)} assigned students</small>
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
