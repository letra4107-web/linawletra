import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import ParentSidebar from '../components/ParentSidebar';
import StudentSelector from '../components/StudentSelector';
import StudentOverviewPanel from '../components/StudentOverviewPanel';
import { parentDashboardApi } from '../services/parentDashboardApi';
import { studentService } from '../services/api';
import { ACHIEVEMENTS } from '../services/achievementService';
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

const LEVELS = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
];

const statusLabel = (value = '') => String(value || 'available').replace(/_/g, ' ');

const ModuleStatusChip = ({ status }) => {
  const normalized = String(status || 'available').toLowerCase();
  const variant = normalized === 'completed'
    ? 'completed'
    : normalized === 'locked'
      ? 'alert'
      : 'progress';
  return <StatusChip variant={variant}>{statusLabel(normalized)}</StatusChip>;
};

const getBadgeId = (badge) => (typeof badge === 'string' ? badge : badge?.id);

const metricValue = (value, fallback = 'No records available.') => {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value) && value.length === 0) return fallback;
  return value;
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
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [modulesByLevel, setModulesByLevel] = useState({});
  const [modulesLoading, setModulesLoading] = useState(false);
  const [modulesError, setModulesError] = useState('');
  const [settingsForm, setSettingsForm] = useState({
    name: user?.displayName || user?.name || '',
    school: '',
    grade: '',
    avatarInitials: '',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

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
      setReport(null);
      setReportError('');
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

  useEffect(() => {
    let cancelled = false;
    const childId = selectedChild?.id ?? selectedChild?.studentId;
    if (!['reports', 'downloads'].includes(currentSection) || !childId) return undefined;

    const loadReport = async () => {
      setReportLoading(true);
      setReportError('');
      try {
        const nextReport = await parentDashboardApi.getReportByChildId(childId);
        if (!cancelled) setReport(nextReport);
      } catch (err) {
        if (!cancelled) setReportError(err?.response?.data?.message || err?.message || 'Unable to load your child report. Please try again.');
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    };

    loadReport();
    return () => {
      cancelled = true;
    };
  }, [currentSection, selectedChild]);

  useEffect(() => {
    let cancelled = false;
    const childId = selectedChild?.id ?? selectedChild?.studentId;
    if (currentSection !== 'modules' || !childId) return undefined;

    const loadModules = async () => {
      setModulesLoading(true);
      setModulesError('');
      try {
        const entries = await Promise.all(
          LEVELS.map(async (level) => [
            level.key,
            await parentDashboardApi.getModulesByChildId(childId, level.key),
          ])
        );
        if (!cancelled) setModulesByLevel(Object.fromEntries(entries));
      } catch (err) {
        if (!cancelled) setModulesError(err?.response?.data?.message || err?.message || 'Unable to load module progress.');
      } finally {
        if (!cancelled) setModulesLoading(false);
      }
    };

    loadModules();
    return () => {
      cancelled = true;
    };
  }, [currentSection, selectedChild]);

  useEffect(() => {
    let cancelled = false;
    if (!['settings', 'profile'].includes(currentSection)) return undefined;

    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsMessage('');
      try {
        const profile = await parentDashboardApi.getSettings();
        const metadata = profile?.metadata || {};
        if (!cancelled) {
          setSettingsForm({
            name: profile?.name || user?.displayName || user?.name || '',
            school: metadata.school || '',
            grade: metadata.grade || metadata.gradeLevel || '',
            avatarInitials: metadata.avatarInitials || '',
          });
        }
      } catch (err) {
        if (!cancelled) setSettingsMessage(err?.response?.data?.message || err?.message || 'Unable to load settings.');
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [currentSection, user?.displayName, user?.name]);

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
        note: `${summary.lessonsCompleted} lessons completed`,
      },
      {
        label: 'All-Time Accuracy',
        value: `${summary.allTimeAccuracy}%`,
        note: `${summary.totalAttempts} practice sessions`,
      },
      {
        label: 'Today\'s Reading Goal',
        value: `${summary.dailyGoalDone}/${summary.dailyGoalTarget}`,
        note: `${summary.weeklyPracticeDays} practice days this week`,
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

  const reportData = report?.report || report || null;
  const earnedBadgeIds = useMemo(() => {
    const ids = [
      ...(progress?.unlockedAchievementIds || []),
      ...(progress?.unlocked_achievement_ids || []),
      ...(progress?.badges || []).map(getBadgeId),
      ...(reportData?.badges || []).map(getBadgeId),
    ].filter(Boolean);
    return new Set(ids);
  }, [progress, reportData]);

  const badgeCatalog = useMemo(
    () => ACHIEVEMENTS.map((badge) => ({
      ...badge,
      earned: earnedBadgeIds.has(badge.id),
    })),
    [earnedBadgeIds]
  );

  const moduleRecords = reportData?.modules?.records || progress?.modules?.records || [];
  const progressPoints = progress?.readingProgressOverTime ?? progress?.reading_progress_over_time ?? [];
  const lessonPerformance = progress?.lessonPerformance ?? progress?.lesson_performance ?? [];
  const recentItems = progress?.recentActivities ?? activities?.recentActivities ?? activities?.items ?? activities ?? [];

  const handleDownloadReport = async () => {
    const childId = selectedChild?.id ?? selectedChild?.studentId;
    if (!childId) return;
    try {
      setReportError('');
      const response = await parentDashboardApi.downloadReportPdf(childId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `parent-report-${childId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err?.response?.data?.message || err?.message || 'Unable to download the PDF report.');
    }
  };

  const handleSettingsSubmit = async (event) => {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      await parentDashboardApi.updateSettings(settingsForm);
      setSettingsMessage('Settings saved.');
    } catch (err) {
      setSettingsMessage(err?.response?.data?.message || err?.message || 'Unable to save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

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
  const showLearning = currentSection === 'learning';
  const showAnalytics = showProgress;
  const showRecent = showSummary;
  const showChildren = currentSection === 'children';
  const showModules = currentSection === 'modules';
  const showBadges = currentSection === 'badges';
  const showSettings = currentSection === 'settings' || currentSection === 'profile';
  const showReports = currentSection === 'reports';
  const showDownloads = currentSection === 'downloads';

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

        {Array.isArray(children) && children.length === 0 && !showChildren && (
          <EmptyState title="No children enrolled yet." subtitle="Enroll a child or contact the classroom administrator to link an existing child profile." />
        )}

        {showSummary && selectedChild && (
          <StudentOverviewPanel
            student={selectedStudentForDisplay}
            wordMastery={wordMastery}
            confusionPatterns={confusionPatterns}
            recommendedWords={recommendedWords}
            recentActivity={progress?.recentActivities ?? activities?.recentActivities ?? activities?.items ?? activities ?? []}
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
              {progressPoints.length > 0 ? (
                <LineChartPlaceholder points={progressPoints} />
              ) : (
                <EmptyState title="No progress history yet." subtitle="Progress data will appear as your child completes learning activities." />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, color: 'rgba(31,41,55,0.75)' }}>{selectedChild?.name || 'Child'}</span>
                <span style={{ fontWeight: 800, color: 'rgba(31,41,55,0.60)' }}>Data-driven analytics</span>
              </div>
            </div>

            <div className="parent-chart">
              <div className="parent-chart__title">Lesson Performance</div>
              {lessonPerformance.length > 0 ? (
                <BarChartPlaceholder values={lessonPerformance} />
              ) : (
                <EmptyState title="No lesson performance yet." subtitle="Charts will appear once scored practice or lesson records exist." />
              )}
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
            <RecentActivityList items={progress?.recentActivities ?? activities?.recentActivities ?? activities?.items ?? activities ?? []} />
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
                      <div className="parent-child-detail__metric">
                        <span>All-Time Accuracy</span>
                        <strong>{selectedStudentSummary.allTimeAccuracy}%</strong>
                      </div>
                      <div className="parent-child-detail__metric">
                        <span>Practice Sessions</span>
                        <strong>{selectedStudentSummary.totalAttempts}</strong>
                      </div>
                      <div className="parent-child-detail__metric">
                        <span>Lessons Completed</span>
                        <strong>{selectedStudentSummary.lessonsCompleted}</strong>
                      </div>
                      <div className="parent-child-detail__metric">
                        <span>Today's Goal</span>
                        <strong>{selectedStudentSummary.dailyGoalDone}/{selectedStudentSummary.dailyGoalTarget}</strong>
                      </div>
                    </div>
                    <div className="parent-child-detail__activity">
                      <div className="parent-section__sub">Recent activity</div>
                      <RecentActivityList items={progress?.recentActivities ?? activities?.recentActivities ?? activities?.items ?? activities ?? []} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="No children enrolled yet." subtitle="Contact the classroom/admin to enroll your child." />
            )}
          </section>
        )}

        {showLearning && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Learning Progress</div>
                <div className="parent-section__sub">A read-only view of real progress for {selectedChild?.name || 'your selected child'}.</div>
              </div>
            </div>
            {!selectedChild ? (
              <EmptyState title="No children enrolled yet." subtitle="Learning progress appears after a child is linked to your account." />
            ) : (
              <div className="parent-learning-layout">
                <div className="parent-report-grid">
                  <div className="parent-child-detail__metric">
                    <span>Reading Level</span>
                    <strong>{metricValue(selectedStudentSummary.readingLevel)}</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>Overall Progress</span>
                    <strong>{selectedStudentSummary.progressToNextLevelPercent}%</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>Active Days</span>
                    <strong>{metricValue(progress?.activeDays ?? progress?.active_days, 0)}</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>XP</span>
                    <strong>{selectedStudentSummary.xp}</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>Practice Attempts</span>
                    <strong>{selectedStudentSummary.totalAttempts}</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>Accuracy</span>
                    <strong>{selectedStudentSummary.totalAttempts > 0 ? `${selectedStudentSummary.allTimeAccuracy}%` : 'No records available.'}</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>Current Module</span>
                    <strong>{metricValue(progress?.currentModule ?? progress?.current_module)}</strong>
                  </div>
                  <div className="parent-child-detail__metric">
                    <span>Learning Time</span>
                    <strong>{progress?.learningTimeAvailable ? `${progress.trackedPracticeMinutes} minutes` : 'Learning time tracking is not available yet.'}</strong>
                  </div>
                </div>

                <div className="parent-report-block">
                  <div className="parent-section__title">Areas of Difficulty</div>
                  {(wordMastery?.difficult || wordMastery?.detail?.difficult || progress?.wordMasteryDetail?.difficult || []).length ? (
                    <div className="parent-confusion-list">
                      {(wordMastery?.difficult || wordMastery?.detail?.difficult || progress?.wordMasteryDetail?.difficult || []).slice(0, 8).map((item, index) => (
                        <span key={item.word || index} className="parent-chip parent-chip--warn">{item.word || item}</span>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No difficulty areas recorded yet." subtitle="This section will update after more word mastery data is available." />
                  )}
                </div>

                <div className="parent-report-block">
                  <div className="parent-section__title">Recent Learning Activity</div>
                  <RecentActivityList items={recentItems} />
                </div>
              </div>
            )}
          </section>
        )}

        {showModules && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Modules</div>
                <div className="parent-section__sub">Read-only curriculum status from the server module system.</div>
              </div>
            </div>
            {!selectedChild ? (
              <EmptyState title="No children enrolled yet." subtitle="Module progress appears after a child is linked to your account." />
            ) : modulesLoading ? (
              <div className="parent-list-row">Loading modules...</div>
            ) : modulesError ? (
              <div className="parent-error">{modulesError}</div>
            ) : (
              <div className="parent-module-levels">
                {LEVELS.map((level) => {
                  const modules = modulesByLevel[level.key] || [];
                  return (
                    <div key={level.key} className="parent-module-level">
                      <div className="parent-module-level__head">
                        <div>
                          <div className="parent-section__title">{level.label}</div>
                          <div className="parent-section__sub">{modules.length} module{modules.length === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                      {modules.length ? (
                        <div className="parent-module-list">
                          {modules.map((module) => (
                            <article key={module.id} className="parent-module-card">
                              <div>
                                <div className="parent-list-row__title">{module.title || `Module ${module.moduleNumber || module.module_number || ''}`}</div>
                                <div className="parent-list-row__meta">
                                  {module.helper || 'Status from curriculum progress'} - Assessment: {module.assessmentPassed ? 'Passed' : module.assessmentScore != null ? `${module.assessmentScore}%` : 'No records available.'}
                                </div>
                              </div>
                              <div className="parent-module-card__side">
                                <ModuleStatusChip status={module.status} />
                                <span>{Number(module.progress || 0)}%</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState title="No modules available." subtitle={`${level.label} modules will appear when the curriculum module table has active records.`} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {showBadges && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Badges & Achievements</div>
                <div className="parent-section__sub">Existing LinawLetra badge system, shown as read-only for parents.</div>
              </div>
              <StatusChip variant="progress">{earnedBadgeIds.size} earned</StatusChip>
            </div>
            {!selectedChild ? (
              <EmptyState title="No children enrolled yet." subtitle="Badges appear after a child is linked to your account." />
            ) : (
              <>
                {earnedBadgeIds.size === 0 && (
                  <EmptyState title="No badges earned yet." subtitle="Badges will unlock as your child completes learning activities." />
                )}
                <div className="parent-badge-grid">
                  {badgeCatalog.map((badge) => (
                    <article key={badge.id} className={`parent-badge-card ${badge.earned ? 'is-earned' : 'is-locked'}`}>
                      <img src={badge.image} alt="" className="parent-badge-card__image" aria-hidden="true" />
                      <div>
                        <div className="parent-list-row__title">{badge.name}</div>
                        <div className="parent-list-row__meta">{badge.description}</div>
                        <StatusChip variant={badge.earned ? 'completed' : 'progress'}>{badge.earned ? 'Earned' : 'Locked'}</StatusChip>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {showDownloads && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Download Reports</div>
                <div className="parent-section__sub">Generate the existing PDF report for the selected child.</div>
              </div>
            </div>
            {!selectedChild ? (
              <EmptyState title="No children enrolled yet." subtitle="PDF reports appear after a child is linked to your account." />
            ) : reportLoading ? (
              <div className="parent-list-row">Preparing report...</div>
            ) : reportError ? (
              <div className="parent-error">{reportError}</div>
            ) : (
              <div className="parent-download-panel">
                <div>
                  <div className="parent-section__title">{selectedChild?.name || 'Selected child'}</div>
                  <div className="parent-section__sub">The PDF uses the same real report data shown in Child Reports.</div>
                </div>
                <button type="button" className="parent-btn parent-btn--primary" onClick={handleDownloadReport}>
                  Download PDF Report
                </button>
              </div>
            )}
          </section>
        )}

        {showReports && (
          <section className="parent-section">
            <div className="parent-section__head">
              <div>
                <div className="parent-section__title">Parent Report</div>
                <div className="parent-section__sub">Real learning history for {selectedChild?.name || 'your selected child'}.</div>
              </div>
              {selectedChild && (
                <button type="button" className="parent-btn parent-btn--primary" onClick={handleDownloadReport}>
                  Download PDF
                </button>
              )}
            </div>

            {!selectedChild ? (
              <EmptyState title="No children enrolled yet." subtitle="Reports appear after a child is linked to your account." />
            ) : reportLoading ? (
              <div className="parent-list-row">Loading report...</div>
            ) : reportError ? (
              <div className="parent-error">{reportError}</div>
            ) : reportData ? (
              <div className="parent-report-grid">
                <div className="parent-child-detail__metric">
                  <span>Reading Level</span>
                  <strong>{reportData.child?.readingLevel || 'No records available.'}</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>Current Module</span>
                  <strong>{reportData.child?.currentModule || 'No records available.'}</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>Accuracy</span>
                  <strong>{reportData.summary?.accuracy ?? 0}%</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>Practice Attempts</span>
                  <strong>{reportData.summary?.practiceAttempts ?? 0}</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>Words Mastered</span>
                  <strong>{reportData.summary?.wordsMastered ?? 0}</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>Modules Completed</span>
                  <strong>{reportData.summary?.modulesCompleted ?? 0}</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>XP</span>
                  <strong>{reportData.summary?.xp ?? 0}</strong>
                </div>
                <div className="parent-child-detail__metric">
                  <span>Learning Time</span>
                  <strong>{reportData.summary?.learningTime || 'Learning time tracking is not available yet.'}</strong>
                </div>
                <div className="parent-report-block">
                  <div className="parent-section__title">Recent Learning Activity</div>
                  <RecentActivityList items={reportData.recentActivity || []} />
                </div>
                <div className="parent-report-block">
                  <div className="parent-section__title">Insights</div>
                  <div className="parent-list">
                    {(reportData.insights || ['More learning activity is needed to generate insights.']).map((item, index) => (
                      <div key={index} className="parent-list-row">
                        <div className="parent-list-row__title">{item}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No records available." subtitle="Report data will appear after learning activity is recorded." />
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
            {settingsLoading ? (
              <div className="parent-list-row">Loading settings...</div>
            ) : (
              <form className="parent-form parent-section--form" onSubmit={handleSettingsSubmit}>
                <div className="parent-list-row" style={{ borderStyle: 'dashed' }}>
                  <div>
                    <div className="parent-list-row__title">Profile</div>
                    <div className="parent-list-row__meta">Email: {user?.email || 'No email available'}</div>
                  </div>
                  <StatusChip variant="progress">Info</StatusChip>
                </div>
                <div className="parent-form-group">
                  <label className="parent-label" htmlFor="parent-name">Name</label>
                  <input
                    id="parent-name"
                    className="parent-input"
                    value={settingsForm.name}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="parent-form-grid">
                  <div className="parent-form-group">
                    <label className="parent-label" htmlFor="parent-school">School</label>
                    <input
                      id="parent-school"
                      className="parent-input"
                      value={settingsForm.school}
                      onChange={(event) => setSettingsForm((prev) => ({ ...prev, school: event.target.value }))}
                    />
                  </div>
                  <div className="parent-form-group">
                    <label className="parent-label" htmlFor="parent-grade">Preferred Grade View</label>
                    <input
                      id="parent-grade"
                      className="parent-input"
                      value={settingsForm.grade}
                      onChange={(event) => setSettingsForm((prev) => ({ ...prev, grade: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="parent-form-group">
                  <label className="parent-label" htmlFor="parent-avatar">Avatar Initials</label>
                  <input
                    id="parent-avatar"
                    className="parent-input"
                    maxLength="4"
                    value={settingsForm.avatarInitials}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, avatarInitials: event.target.value }))}
                  />
                </div>
                {settingsMessage && <div className="parent-notice">{settingsMessage}</div>}
                <div className="parent-form-footer">
                  <button type="submit" className="parent-btn parent-btn--primary" disabled={settingsSaving}>
                    {settingsSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            )}
            <div style={{ display: 'none' }}>
              <div className="parent-list-row" style={{ borderStyle: 'dashed' }}>
                <div>
                  <div className="parent-list-row__title">Profile</div>
                  <div className="parent-list-row__meta">Name: {user?.displayName || '—'} • Email: {user?.email || '—'}</div>
                </div>
                <StatusChip variant="progress">Info</StatusChip>
              </div>
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
