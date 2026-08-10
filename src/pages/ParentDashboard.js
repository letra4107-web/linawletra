import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ParentSidebar from '../components/ParentSidebar';
import ChildOverviewCard from '../components/ChildOverviewCard';
import StudentSelector from '../components/StudentSelector';
import StudentOverviewPanel from '../components/StudentOverviewPanel';
import { parentDashboardApi } from '../services/parentDashboardApi';
import { studentService } from '../services/api';
import { normalizeStudentSummary } from '../utils/normalizeStudentSummary';
import './ParentDashboard.css';

const Skeleton = ({ h = 14, w = '100%', style = {} }) => (
  <div
    className="parent-skeleton"
    style={{ height: h, width: w, ...style }}
    aria-hidden="true"
  />
);

const StatusChip = ({ variant = 'progress', children }) => {
  const cls =
    variant === 'completed'
      ? 'parent-status parent-status--completed'
      : variant === 'alert'
        ? 'parent-status parent-status--alert'
        : 'parent-status parent-status--progress';
  return <span className={cls}>{children}</span>;
};

const EmptyState = ({ title, subtitle }) => (
  <div className="parent-error" style={{ background: 'rgba(79,70,229,0.06)', color: 'rgba(31,41,55,0.85)', borderColor: 'rgba(79,70,229,0.18)' }}>
    <div style={{ fontWeight: 900, marginBottom: 6 }}>{title}</div>
    <div style={{ fontWeight: 600, opacity: 0.8, fontSize: 14 }}>{subtitle}</div>
  </div>
);

const LineChartPlaceholder = ({ points = [] }) => {
  const max = Math.max(1, ...points.map((p) => Number(p?.value ?? 0)));
  return (
    <div className="chart-line" aria-label="Reading progress over time">
      {(points.length ? points : [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }]).map((p, idx) => {
        const v = Number(p?.value ?? 0);
        const heightPct = Math.round((v / max) * 100);
        return (
          <div
            key={idx}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 8,
                height: `${Math.max(6, heightPct)}%`,
                background: 'rgba(79,70,229,0.55)',
                borderRadius: 999,
                border: '1px solid rgba(79,70,229,0.35)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

const BarChartPlaceholder = ({ values = [] }) => {
  const max = Math.max(1, ...values.map((v) => Number(v ?? 0)));
  return (
    <div className="chart-bar" aria-label="Lesson performance">
      {(values.length ? values : [0, 0, 0, 0, 0, 0]).map((v, idx) => {
        const n = Number(v ?? 0);
        const heightPct = Math.round((n / max) * 100);
        return (
          <div key={idx} className="chart-col" style={{ height: `${Math.max(18, heightPct)}%` }} />
        );
      })}
    </div>
  );
};

const RecentActivityList = ({ items = [] }) => {
  const safe = Array.isArray(items) ? items : [];
  if (!safe.length) return <EmptyState title="No recent activity" subtitle="Activities will appear here after your child completes lessons." />;

  return (
    <div className="parent-list" aria-label="Recent activity">
      {safe.slice(0, 8).map((it, idx) => {
        const status = String(it?.status ?? '').toLowerCase();
        const chipVariant = status.includes('complete') ? 'completed' : status.includes('progress') || status.includes('in') ? 'progress' : 'alert';
        return (
          <div key={idx} className="parent-list-row">
            <div>
              <div className="parent-list-row__title">{it?.lessonTitle || it?.lesson_name || 'Lesson'}</div>
              <div className="parent-list-row__meta">
                {it?.completedAt || it?.timestamp || it?.time || '—'} • {it?.timeSpent || it?.duration || '—'}
              </div>
            </div>
            <StatusChip variant={chipVariant}>{it?.status || 'Completed'}</StatusChip>
          </div>
        );
      })}
    </div>
  );
};

const AIInsightsPanel = ({ insights }) => {
  if (!insights) return null;

  const weakAreas = Array.isArray(insights?.weakReadingAreas) ? insights.weakReadingAreas : (insights?.weak_areas ?? []);
  const recs = Array.isArray(insights?.recommendations) ? insights.recommendations : (insights?.recommendations ?? []);
  const nextLessons = Array.isArray(insights?.nextLessons) ? insights.nextLessons : (insights?.next_lessons ?? []);

  return (
    <div className="parent-charts" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="parent-section">
        <div className="parent-section__head">
          <div>
            <div className="parent-section__title">AI Insights</div>
            <div className="parent-section__sub">Weak reading areas & next steps</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Weak Areas</div>
            {weakAreas?.length ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {weakAreas.slice(0, 5).map((w, i) => (
                  <span key={i} className="parent-chip parent-chip--warn">{typeof w === 'string' ? w : (w?.label || 'Area')}</span>
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(31,41,55,0.66)', fontWeight: 600 }}>No weak areas detected yet.</div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Personalized Recommendations</div>
            {recs?.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {recs.slice(0, 3).map((r, i) => (
                  <div key={i} className="parent-list-row" style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 800 }}>{typeof r === 'string' ? r : (r?.text || 'Recommendation')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'rgba(31,41,55,0.66)', fontWeight: 600 }}>Recommendations will appear after enough activity data.</div>
            )}
          </div>
        </div>
      </div>

      <div className="parent-section">
        <div className="parent-section__head">
          <div>
            <div className="parent-section__title">Suggested Next Lessons</div>
            <div className="parent-section__sub">Based on progress & weak areas</div>
          </div>
        </div>

        {nextLessons?.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {nextLessons.slice(0, 5).map((l, i) => (
              <div key={i} className="parent-list-row" style={{ padding: '10px 12px' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{l?.title || l?.lessonTitle || 'Lesson'}</div>
                  <div className="parent-list-row__meta">{l?.level || l?.tag || 'Recommended'}</div>
                </div>
                <StatusChip variant="progress">Next</StatusChip>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No suggestions yet" subtitle="Once progress data is available, the AI panel will recommend lessons." />
        )}
      </div>
    </div>
  );
};

export default function ParentDashboard() {
  const { user } = useContext(AuthContext);
  const { section } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);

  const [dashboard, setDashboard] = useState(null);
  const [progress, setProgress] = useState(null);
  const [activities, setActivities] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [wordMastery, setWordMastery] = useState(null);
  const [confusionPatterns, setConfusionPatterns] = useState([]);
  const [recommendedWords, setRecommendedWords] = useState([]);
  const [aiInsights, setAiInsights] = useState(null);

  const currentSection = (section || 'summary').toLowerCase();

  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollForm, setEnrollForm] = useState({
    name: '',
    gradeLevel: '',
    readingLevel: '',
  });
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollSuccess, setEnrollSuccess] = useState('');
  const [enrollError, setEnrollError] = useState('');

  const selectedChild = useMemo(() => {
    const safeChildren = Array.isArray(children) ? children : [];
    const id = selectedChildId ?? safeChildren?.[0]?.id ?? safeChildren?.[0]?.studentId;
    return safeChildren.find((c) => String(c?.id ?? c?.studentId) === String(id)) || safeChildren?.[0] || null;
  }, [children, selectedChildId]);

  const refreshDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashData, childData, notifData] = await Promise.all([
        parentDashboardApi.getDashboard(),
        parentDashboardApi.getChildren(),
        parentDashboardApi.getNotifications(),
      ]);

      setDashboard(dashData || {});
      const safeChildren = Array.isArray(childData) ? childData : [];
      setChildren(safeChildren);

      const firstId = safeChildren?.[0]?.id ?? safeChildren?.[0]?.studentId ?? null;
      setSelectedChildId((prev) => prev ?? firstId);

      setNotifications(notifData ?? []);
      setAiInsights(dashData?.aiInsights ?? dashData?.ai_insights ?? null);
    } catch (e) {
      console.error(e);
      setError(e?.message ? `Failed to load dashboard: ${e.message}` : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  const closeEnrollModal = () => {
    setShowEnrollModal(false);
    setEnrollError('');
    setEnrollForm({ name: '', gradeLevel: '', readingLevel: '' });
  };

  const validateEnrollForm = () => {
    const validGrades = ['1', '2', '3', '4', '5', '6'];
    const validReadingLevels = ['beginner', 'intermediate', 'advanced'];

    if (!enrollForm.name.trim()) {
      setEnrollError('Please enter the child name.');
      return false;
    }

    if (!validGrades.includes(enrollForm.gradeLevel)) {
      setEnrollError('Please choose a valid grade between 1 and 6.');
      return false;
    }

    if (!validReadingLevels.includes(enrollForm.readingLevel)) {
      setEnrollError('Please choose a valid reading level.');
      return false;
    }

    setEnrollError('');
    return true;
  };

  const handleEnrollSubmit = async (event) => {
    event.preventDefault();

    if (!validateEnrollForm()) {
      return;
    }

    setEnrollLoading(true);
    setEnrollSuccess('');
    setEnrollError('');

    try {
      const payload = {
        name: enrollForm.name.trim(),
        gradeLevel: enrollForm.gradeLevel,
        readingLevel: enrollForm.readingLevel,
      };

      await studentService.createStudent(payload);
      setEnrollSuccess('Child enrolled successfully. Credentials have been sent to your email.');
      setEnrollError('');
      closeEnrollModal();
      await refreshDashboard();
    } catch (error) {
      console.error('Enroll child error:', error);
      setEnrollError(
        error?.response?.data?.message || error?.message || 'Unable to enroll child. Please try again.'
      );
    } finally {
      setEnrollLoading(false);
    }
  };

  useEffect(() => {
    if (!enrollSuccess) return undefined;
    const timer = setTimeout(() => setEnrollSuccess(''), 5000);
    return () => clearTimeout(timer);
  }, [enrollSuccess]);

  useEffect(() => {
    let cancelled = false;
    const loadChildData = async () => {
      const childId = selectedChild?.id ?? selectedChild?.studentId;
      if (!childId) return;

      setProgress(null);
      setActivities(null);
      setWordMastery(null);
      setConfusionPatterns([]);
      setRecommendedWords([]);
      try {
        const [p, a, m, c, r] = await Promise.all([
          parentDashboardApi.getProgressByChildId(childId),
          parentDashboardApi.getActivitiesByChildId(childId),
          parentDashboardApi.getWordMastery(childId),
          parentDashboardApi.getConfusionPatterns(childId),
          parentDashboardApi.getPracticeRecommendations(childId),
        ]);
        if (cancelled) return;
        setProgress(p);
        setActivities(a);
        setWordMastery(m);
        setConfusionPatterns(c);
        setRecommendedWords(r);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
      }
    };

    loadChildData();

    return () => {
      cancelled = true;
    };
  }, [selectedChild]);

  const summaryCards = useMemo(() => {
    const selectedProgress = progress?.student || selectedChild || {};
    const summary = normalizeStudentSummary(selectedProgress);
    const status = summary.readingLevel || dashboard?.childReadingLevelStatus || dashboard?.childReadingLevel || null;
    const weeklyProgress = summary.progressToNextLevelPercent;
    const wordsFinished = summary.wordsCompleted;
    const hasAlerts = Boolean(dashboard?.alertsIndicator ?? dashboard?.hasAlerts ?? dashboard?.has_alerts ?? (notifications?.length > 0));

    return [
      {
        label: 'Child Reading Level',
        value: status?.label || status?.level || status || '—',
        note: status?.note || 'AI-assisted tracking',
      },
      {
        label: 'Progress to Next Level',
        value: typeof weeklyProgress === 'number' || typeof weeklyProgress === 'string' ? `${weeklyProgress}%` : '—',
        note: 'Shared progress calculation',
      },
      {
        label: 'Words Finished',
        value: typeof wordsFinished === 'number' || typeof wordsFinished === 'string' ? `${wordsFinished}` : '—',
        note: 'Completed pronunciation words',
      },
      {
        label: 'Alerts / Issues',
        value: hasAlerts ? 'Needs attention' : 'All good',
        note: hasAlerts ? 'Review insights & notifications' : 'No issues reported',
      },
    ];
  }, [dashboard, notifications, progress, selectedChild]);

  const selectedStudentForDisplay = useMemo(
    () => progress?.student || selectedChild || null,
    [progress, selectedChild]
  );

  const selectedStudentSummary = useMemo(
    () => normalizeStudentSummary(selectedStudentForDisplay || {}),
    [selectedStudentForDisplay]
  );

  if (loading) {
    return (
      <div className="parent-dashboard-page">
        <ParentSidebar />
        <main className="parent-main" id="main-content">
          <div className="parent-topbar">
            <div className="parent-topbar__title">
              <Skeleton h={12} w={180} />
              <Skeleton h={22} w={260} />
              <Skeleton h={12} w={360} />
            </div>
            <div className="parent-topbar__actions">
              <Skeleton h={42} w={140} />
              <Skeleton h={42} w={180} style={{ borderRadius: 18 }} />
            </div>
          </div>

          <section className="parent-grid parent-grid--cards">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="parent-card">
                <Skeleton h={12} w={180} />
                <Skeleton h={34} w={120} style={{ marginTop: 12 }} />
                <Skeleton h={12} w={220} style={{ marginTop: 10 }} />
              </div>
            ))}
          </section>

          <section className="parent-charts">
            <div className="parent-chart">
              <div className="parent-chart__title">Analytics</div>
              <Skeleton h={160} w={'100%'} />
              <div style={{ height: 10 }} />
              <Skeleton h={140} w={'100%'} />
            </div>
            <div className="parent-chart">
              <div className="parent-chart__title">AI Insights</div>
              <Skeleton h={120} w={'100%'} />
              <div style={{ height: 10 }} />
              <Skeleton h={120} w={'100%'} />
            </div>
          </section>

          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Recent Activity</div>
                <div className="parent-section__sub">Loading…</div>
              </div>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="parent-list-row">
                <div style={{ flex: 1 }}>
                  <Skeleton h={12} w={180} />
                  <div style={{ height: 8 }} />
                  <Skeleton h={12} w={260} />
                </div>
                <Skeleton h={28} w={120} style={{ borderRadius: 999 }} />
              </div>
            ))}
          </section>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="parent-dashboard-page">
        <ParentSidebar />
        <main className="parent-main" id="main-content">
          <div className="parent-error">{error}</div>
        </main>
      </div>
    );
  }

  const showSummary = currentSection === 'summary';
  const showProgress = currentSection === 'progress';
  const showAnalytics = showProgress;
  const showRecent = showSummary;
  const showChildren = currentSection === 'children';
  const showSettings = currentSection === 'settings';

  return (
    <div className="parent-dashboard-page">
      <ParentSidebar />
      <main className="parent-main" id="main-content">
        <header className="parent-topbar">
          <div className="parent-topbar__title">
            <div className="parent-topbar__eyebrow">LinawLetra • Parent</div>
            <h1 className="parent-topbar__h1">Welcome back, {user?.displayName || user?.email || 'Parent'}</h1>
            <p className="parent-topbar__p">Monitor reading progress, lessons, and AI insights for each child.</p>
          </div>

          <div className="parent-topbar__actions">
            <button type="button" className="parent-btn parent-btn--primary" onClick={() => setShowEnrollModal(true)}>
              Enroll Child
            </button>
          </div>
        </header>

        {Array.isArray(children) && children.length > 0 && (
          <StudentSelector
            students={children}
            selectedId={selectedChild?.id ?? selectedChild?.studentId}
            onSelect={setSelectedChildId}
          />
        )}

        {showSummary && selectedChild && (
          <StudentOverviewPanel
            student={selectedStudentForDisplay}
            wordMastery={wordMastery}
            confusionPatterns={confusionPatterns}
            recommendedWords={recommendedWords}
            recentActivity={activities?.recentActivities ?? activities?.items ?? activities ?? []}
          />
        )}

        {showChildren && (
          <section className="parent-hero-grid">
            <div className="parent-banner">
              <div>
                <div className="parent-banner__eyebrow">New Enrollment</div>
                <h2 className="parent-banner__title">Invite your child into their personalized learning space.</h2>
                <p className="parent-banner__copy">Create a student account instantly with generated login credentials and send them securely to your email.</p>
              </div>
              <button type="button" className="parent-btn parent-btn--primary parent-btn--large" onClick={() => setShowEnrollModal(true)}>
                Enroll Child Now
              </button>
            </div>

            <div className="parent-banner parent-banner--stats">
              <div className="parent-banner__title">Family Overview</div>
              <div className="parent-banner__stat-row">
                <div>
                  <div className="parent-banner__stat-value">{children?.length ?? 0}</div>
                  <div className="parent-banner__stat-label">Children Enrolled</div>
                </div>
                <div>
                  <div className="parent-banner__stat-value">{selectedChild ? 'Ready' : 'No child'}</div>
                  <div className="parent-banner__stat-label">Active Profile</div>
                </div>
              </div>
              <div className="parent-banner__meta">Manage account creation, progress monitoring, and notifications from one place.</div>
            </div>
          </section>
        )}

        {showChildren && (
          <section className="parent-grid parent-grid--cards">
            {summaryCards.map((c, idx) => (
              <div key={idx} className="parent-card">
                <div className="parent-card__top">
                  <div>
                    <div className="parent-card__label">{c.label}</div>
                    <div className="parent-card__value">{c.value}</div>
                    <div className="parent-card__note">{c.note}</div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {showAnalytics && (
          <section className="parent-charts">
            <div className="parent-chart">
              <div className="parent-chart__title">Reading Progress Over Time</div>
              <LineChartPlaceholder points={progress?.readingProgressOverTime ?? progress?.reading_progress_over_time ?? []} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, color: 'rgba(31,41,55,0.75)' }}>{selectedChild?.name || 'Child'}</span>
                <span style={{ fontWeight: 800, color: 'rgba(31,41,55,0.60)' }}>Data-driven analytics</span>
              </div>
            </div>

            <div className="parent-chart">
              <div className="parent-chart__title">Lesson Performance</div>
              <BarChartPlaceholder values={progress?.lessonPerformance ?? progress?.lesson_performance ?? []} />
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusChip variant="progress">Weekly trend</StatusChip>
                  <span style={{ fontWeight: 700, color: 'rgba(31,41,55,0.65)' }}>Based on completions</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {showAnalytics && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Word Mastery</div>
                <div className="parent-section__sub">How many words {selectedChild?.name || 'your child'} has truly mastered vs. still needs practice</div>
              </div>
            </div>
            <div className="parent-grid parent-grid--cards">
              <div className="parent-card">
                <div className="parent-card__label">Mastered</div>
                <div className="parent-card__value">{wordMastery?.counts?.mastered ?? 0}</div>
              </div>
              <div className="parent-card">
                <div className="parent-card__label">Needs Practice</div>
                <div className="parent-card__value">{wordMastery?.counts?.needsPractice ?? 0}</div>
              </div>
              <div className="parent-card">
                <div className="parent-card__label">Difficult</div>
                <div className="parent-card__value">{wordMastery?.counts?.difficult ?? 0}</div>
              </div>
            </div>
            {confusionPatterns.length > 0 && (
              <div className="parent-confusion-block">
                <div className="parent-section__sub" style={{ marginBottom: 8 }}>
                  Sound mix-ups that come up most often when reading aloud
                </div>
                <div className="parent-confusion-list">
                  {confusionPatterns.slice(0, 5).map((pattern) => (
                    <span key={pattern.pattern_type} className="parent-chip parent-chip--warn">
                      {String(pattern.pattern_type || '').replace(/_/g, ' ')} · {pattern.occurrence_count}x
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {showRecent && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Recent Activity</div>
                <div className="parent-section__sub">Latest lessons & time spent</div>
              </div>
            </div>
            <RecentActivityList items={activities?.recentActivities ?? activities?.items ?? activities ?? []} />
          </section>
        )}

        {showChildren && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">My Children</div>
                <div className="parent-section__sub">Select a child to load progress</div>
              </div>
            </div>
            {Array.isArray(children) && children.length ? (
              <div className="parent-children-frame">
                {children.map((c) => {
                  const id = c?.id ?? c?.studentId ?? c?.userId ?? c?.email;
                  const isActive = String(id) === String(selectedChild?.id ?? selectedChild?.studentId);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedChildId(id)}
                      className="parent-list-row parent-child-select-row"
                      style={{ cursor: 'pointer', textAlign: 'left', background: isActive ? 'rgba(79,70,229,0.06)' : undefined, borderColor: isActive ? 'rgba(79,70,229,0.22)' : undefined }}
                    >
                      <div className="parent-child-select-row__profile">
                        <div className="parent-child-select-row__avatar">{String(c?.name || c?.full_name || 'C').charAt(0).toUpperCase()}</div>
                        <div>
                        <div className="parent-list-row__title">{c?.name || c?.full_name || 'Child'}</div>
                        <div className="parent-list-row__meta">Grade: {c?.gradeLevel || c?.grade || c?.class || '—'} • Progress: {c?.progressPercentage ?? c?.progress ?? '—'}%</div>
                        </div>
                      </div>
                      <StatusChip variant={isActive ? 'completed' : 'progress'}>{isActive ? 'Selected' : 'View'}</StatusChip>
                    </button>
                  );
                })}
                {selectedChild && (
                  <div className="parent-child-detail">
                    <div className="parent-child-detail__head">
                      <div>
                        <div className="parent-section__title">{selectedStudentSummary.name}'s Progress</div>
                        <div className="parent-section__sub">Reading status, completed work, and recent activity.</div>
                      </div>
                      <StatusChip variant="progress">{selectedStudentSummary.readingLevel || 'Reading level pending'}</StatusChip>
                    </div>
                    <div className="parent-child-detail__grid">
                      <div className="parent-child-detail__metric">
                        <span>Grade</span>
                        <strong>{selectedChild.gradeLevel || selectedChild.grade || '—'}</strong>
                      </div>
                      <div className="parent-child-detail__metric">
                        <span>Progress</span>
                        <strong>{selectedStudentSummary.progressToNextLevelPercent}%</strong>
                      </div>
                      <div className="parent-child-detail__metric">
                        <span>Words Finished</span>
                        <strong>{selectedStudentSummary.wordsCompleted}</strong>
                      </div>
                      <div className="parent-child-detail__metric">
                        <span>Total XP</span>
                        <strong>{selectedStudentSummary.xp}</strong>
                      </div>
                    </div>
                    <div className="parent-child-detail__activity">
                      <div className="parent-section__sub">Recent activity</div>
                      <RecentActivityList items={activities?.recentActivities ?? activities?.items ?? activities ?? []} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="No children enrolled" subtitle="Contact the classroom/admin to enroll your child." />
            )}
          </section>
        )}

        {showSettings && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Settings</div>
                <div className="parent-section__sub">Account preferences</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="parent-list-row" style={{ borderStyle: 'dashed' }}>
                <div>
                  <div className="parent-list-row__title">Profile</div>
                  <div className="parent-list-row__meta">Name: {user?.displayName || '—'} • Email: {user?.email || '—'}</div>
                </div>
                <StatusChip variant="progress">Info</StatusChip>
              </div>
              <EmptyState title="Settings UI placeholder" subtitle="Connect this panel to /api/users/profile or /api/parent/settings when available." />
            </div>
          </section>
        )}

        {showEnrollModal && (
          <div className="parent-modal__backdrop" onClick={closeEnrollModal} />
        )}
        {showEnrollModal && (
          <div className="parent-modal" role="dialog" aria-modal="true" aria-labelledby="enroll-modal-title">
            <div className="parent-modal__content">
              <div className="parent-modal__header">
                <div>
                  <div className="parent-modal__eyebrow">Enroll Child</div>
                  <h2 id="enroll-modal-title" className="parent-modal__title">Create a student account for your child</h2>
                  <p className="parent-modal__copy">Add a child in just a few clicks. Username and password will be generated and emailed to you automatically.</p>
                </div>
                <button type="button" className="parent-modal__close" onClick={closeEnrollModal}>&times;</button>
              </div>

              <form className="parent-form" onSubmit={handleEnrollSubmit}>
                <div className="parent-form-group">
                  <label className="parent-label" htmlFor="child-name">Child Name</label>
                  <input
                    id="child-name"
                    className="parent-input"
                    placeholder="e.g. Mateo Santos"
                    value={enrollForm.name}
                    onChange={(event) => setEnrollForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="parent-form-grid">
                  <div className="parent-form-group">
                    <label className="parent-label" htmlFor="grade-level">Grade</label>
                    <select
                      id="grade-level"
                      className="parent-select"
                      value={enrollForm.gradeLevel}
                      onChange={(event) => setEnrollForm((prev) => ({ ...prev, gradeLevel: event.target.value }))}
                    >
                      <option value="">Select grade</option>
                      {['1', '2', '3', '4', '5', '6'].map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>

                  <div className="parent-form-group">
                    <label className="parent-label" htmlFor="reading-level">Reading Level</label>
                    <select
                      id="reading-level"
                      className="parent-select"
                      value={enrollForm.readingLevel}
                      onChange={(event) => setEnrollForm((prev) => ({ ...prev, readingLevel: event.target.value }))}
                    >
                      <option value="">Select reading level</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                {enrollError && <div className="parent-notice parent-notice--error">{enrollError}</div>}
                <div className="parent-modal__footer">
                  <button type="button" className="parent-btn parent-btn--secondary" onClick={closeEnrollModal}>Cancel</button>
                  <button type="submit" className="parent-btn parent-btn--primary" disabled={enrollLoading}>
                    {enrollLoading ? 'Enrolling...' : 'Enroll Child'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* AI Insights panel (always visible on summary) */}
        {currentSection === 'summary' && <AIInsightsPanel insights={aiInsights} />}
      </main>
    </div>
  );
}
