import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { assessmentService } from '../services/api';
import { onAuthStateChanged } from '../services/supabaseAuth';
import FileUploadSection from '../components/ui/FileUploadSection';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

const STATUS_OPTIONS = ['all', 'Pending', 'Completed', 'In Progress', 'Reviewed'];

const formatDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedAssessment, setExpandedAssessment] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(null, (user) => {
      if (!user) navigate('/login');
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await assessmentService.getAssessments(filter);
        const data = response?.data || [];
        setAssessments(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setAssessments([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filter]);

  const filteredAssessments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return assessments;

    return assessments.filter((item) => {
      const studentName = (item.studentName || item.student?.name || '').toLowerCase();
      const tier = (item.tier || '').toLowerCase();
      const status = (item.status || '').toLowerCase();
      return studentName.includes(query) || tier.includes(query) || status.includes(query);
    });
  }, [assessments, searchTerm]);

  return (
    <PageLayout
      title="Assessments"
      subtitle="Review all student assessment results"
      showSearch
      searchValue={searchTerm}
      onSearch={setSearchTerm}
      searchPlaceholder="Search assessments"
    >
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>Assessments</h1>
            <p>Review all student assessment results</p>
          </div>
          <div className="filter-tabs">
            {STATUS_OPTIONS.map((state) => (
              <button
                key={state}
                type="button"
                className={`filter-pill${filter === state ? ' active' : ''}`}
                onClick={() => setFilter(state)}
              >
                {state === 'all' ? 'All' : state}
              </button>
            ))}
          </div>
        </section>

        <section className="list-panel">
          {loading ? (
            <div className="student-cards">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton-card" />
              ))}
            </div>
          ) : error ? (
            <div className="empty-state">
              <div className="empty-title">Unable to load assessments</div>
              <p className="empty-copy">Please refresh the page or try again later.</p>
            </div>
          ) : filteredAssessments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No assessments found</div>
              <p className="empty-copy">There are no assessments matching your filters.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Date</th>
                  <th>Score</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.map((assessment) => {
                  const studentName = assessment.studentName || assessment.student?.name || 'Unknown student';
                  const assessmentId = assessment.id || assessment._id || studentName;
                  return (
                    <React.Fragment key={assessmentId}>
                    
                      <tr>
                        <td>
                          <div className="student-card-left">
                            <div className="student-avatar">{studentName.charAt(0)}</div>
                            <div>
                              <div className="student-name">{studentName}</div>
                              <div className="student-meta">{assessment.tier || 'Tier 1'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{formatDate(assessment.date)}</td>
                        <td className="student-score">{assessment.score != null ? `${assessment.score}%` : '—'}</td>
                        <td><span className="tier-pill">{assessment.tier || 'Tier 1'}</span></td>
                        <td><span className="status-pill">{assessment.status || 'Pending'}</span></td>
                        <td>
                          <button
                            type="button"
                            className="filter-pill"
                            onClick={() => setExpandedAssessment((prev) => (prev === assessmentId ? null : assessmentId))}
                          >
                            {expandedAssessment === assessmentId ? '▲ Hide Files' : '📎 Assessment Files'}
                          </button>
                        </td>
                      </tr>
                      {expandedAssessment === assessmentId && (
                        <tr>
                          <td colSpan="6">
                            <FileUploadSection
                              pageSource="assessments"
                              linkedId={assessmentId}
                              category="assessment"
                              title="Assessment Files"
                              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                              emptyText="Upload answer sheets, rubrics, or assessment documents here."
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PageLayout>
  );
}
