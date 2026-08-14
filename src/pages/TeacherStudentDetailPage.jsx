import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, BookOpen, ChevronLeft, ClipboardList } from 'lucide-react';
import PageLayout from '../components/layout/PageLayout';
import StudentOverviewPanel from '../components/StudentOverviewPanel';
import { assessmentService, progressService, readingService, studentService } from '../services/api';
import '../styles/TeacherDashboard.css';

const normalizeStudent = (student = {}) => {
  const user = student.user || student.users || {};
  const metadata = user.metadata || student.metadata || {};
  return {
    ...student,
    id: student.id || student.student_id || student._id,
    name:
      student.name ||
      user.name ||
      metadata.displayName ||
      [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
      user.email ||
      'Student',
  };
};

export default function TeacherStudentDetailPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [overview, setOverview] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadStudent = async () => {
      setLoading(true);
      setError('');
      try {
        const [studentRes, dashboardRes, masteryRes, confusionRes, recRes, progressRes] = await Promise.all([
          studentService.getStudent(studentId),
          progressService.getCanonicalStats(studentId).catch(() => null),
          readingService.getWordMastery(studentId).catch(() => null),
          readingService.getConfusionPatterns(studentId).catch(() => null),
          readingService.getPracticeRecommendations(studentId).catch(() => null),
          progressService.getProgressByStudent(studentId).catch(() => null),
        ]);

        if (cancelled) return;
        const studentPayload = studentRes?.data?.student || studentRes?.data?.data?.student || studentRes?.data || {};
        const dashboardStudent = dashboardRes?.data?.data || dashboardRes?.data || null;
        setStudent(normalizeStudent({ ...studentPayload, ...(dashboardStudent || {}), stats: dashboardStudent }));
        setOverview({
          counts: masteryRes?.data?.counts || masteryRes?.counts || null,
          patterns: confusionRes?.data?.patterns || confusionRes?.patterns || [],
          words: recRes?.data?.words || recRes?.words || [],
        });
        const progressList = progressRes?.data?.progress || progressRes?.data?.reports || progressRes?.data || [];
        setReports(Array.isArray(progressList) ? progressList : []);
      } catch (err) {
        if (!cancelled) {
          console.error('Teacher student detail error:', err);
          setError(err?.response?.data?.message || err?.message || 'Unable to load this student.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStudent();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const handleStartAssessment = async () => {
    if (startingAssessment) return;
    setStartingAssessment(true);
    setAssessmentError('');
    try {
      const response = await assessmentService.createAssessment({ studentId });
      const assessment = response?.data?.assessment || response?.assessment;
      if (!assessment?.id) throw new Error('Assessment was not created.');
      navigate(`/assessment/${assessment.id}`);
    } catch (err) {
      console.error('Start assessment error:', err);
      setAssessmentError(err?.response?.data?.message || err?.message || 'Unable to start a new assessment for this student.');
    } finally {
      setStartingAssessment(false);
    }
  };

  const recentActivity = useMemo(
    () => reports.slice(0, 6).map((report) => ({
      lessonTitle: report.lessonTitle || report.lesson_name || report.word || 'Reading activity',
      completedAt: report.completedAt || report.completed_at || report.date || report.updated_at || 'Recent',
    })),
    [reports]
  );

  return (
    <PageLayout title="Student Progress" subtitle="Review individual learner progress" showSearch={false}>
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>{student?.name || 'Student Progress'}</h1>
            <p>Progress, word mastery, and recommended next practice.</p>
          </div>
          <div className="filter-tabs">
            <button type="button" className="filter-pill" onClick={() => navigate('/teacher/students')}>
              <ChevronLeft size={16} /> Back
            </button>
            <button type="button" className="detail-action" onClick={() => navigate('/teacher/progress')}>
              <BarChart3 size={16} /> Progress Reports
            </button>
            <button type="button" className="detail-action" onClick={() => navigate('/teacher/learning-paths')}>
              <BookOpen size={16} /> Learning Paths
            </button>
            <button type="button" className="detail-action" onClick={handleStartAssessment} disabled={startingAssessment}>
              <ClipboardList size={16} /> {startingAssessment ? 'Starting...' : 'New Assessment'}
            </button>
          </div>
        </section>

        {assessmentError && (
          <div className="empty-state">
            <p className="empty-copy">{assessmentError}</p>
          </div>
        )}

        {loading ? (
          <div className="skeleton-card" />
        ) : error ? (
          <div className="empty-state">
            <div className="empty-title">Unable to load student</div>
            <p className="empty-copy">{error}</p>
          </div>
        ) : (
          <StudentOverviewPanel
            student={student}
            wordMastery={overview ? { counts: overview.counts } : null}
            confusionPatterns={overview?.patterns || []}
            recommendedWords={overview?.words || []}
            recentActivity={recentActivity}
          />
        )}
      </div>
    </PageLayout>
  );
}
