import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Activities to be fetched via API
import FileUploadSection from '../components/ui/FileUploadSection';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';
import { BookOpen, ClipboardCheck, Sparkles, UserCheck } from 'lucide-react';

const TYPE_MAP = {
  assessment: { label: 'Assessment', icon: ClipboardCheck, color: '#2A9D8F' },
  lesson: { label: 'Lesson', icon: BookOpen, color: '#2563EB' },
  path: { label: 'Learning Path', icon: Sparkles, color: '#F59E0B' },
  note: { label: 'Note', icon: UserCheck, color: '#8B5CF6' },
};

const parseFirestoreDate = (value) => {
  if (!value) return new Date(0);
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const formatDistance = (timestamp) => {
  if (!timestamp) return 'Unknown time';
  const date = parseFirestoreDate(timestamp);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hrs ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function TeacherActivitiesPage() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [currentUid, setCurrentUid] = useState('general');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate('/login');
        return;
      }
      setCurrentUid(user.uid || 'general');
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const loadActivities = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await getActivities();
        setActivities(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Activities error:', err.code, err.message);
        setActivities([]);
        setError(false);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, []);

  const activityItems = useMemo(() => {
    return activities
      .slice()
      .sort((a, b) => parseFirestoreDate(b.timestamp).getTime() - parseFirestoreDate(a.timestamp).getTime());
  }, [activities]);

  const currentItems = activityItems.slice(0, page * 20);
  const hasMore = activityItems.length > currentItems.length;

  return (
    <PageLayout title="Activities" subtitle="Recent classroom actions and updates" showSearch={false}>
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>Activities</h1>
            <p>Recent classroom actions and updates</p>
          </div>
        </section>

        <FileUploadSection
          pageSource="activities"
          linkedId={currentUid || 'general'}
          category="activity"
          title="Activity Sheets & Worksheets"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          emptyText="Upload activity sheets, worksheets, or classroom materials here."
        />

        {loading ? (
          <section className="student-cards">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-card" />)}
          </section>
        ) : currentItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No recent activities</div>
            <p className="empty-copy">Activities will appear as students complete tasks.</p>
          </div>
        ) : (
          <div className="sessions-section">
            {currentItems.map((activity) => {
              const type = TYPE_MAP[activity.type] || { label: 'Update', icon: Sparkles, color: '#6B7280' };
              const Icon = type.icon;
              return (
                <div key={activity.id || activity._id} className="session-row" onClick={() => navigate(`/activities/${activity.id || activity._id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="student-avatar" style={{ background: type.color }}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <div className="detail-name">{activity.description || type.label}</div>
                      <div className="detail-meta-row">{activity.studentName || 'Student'} · {type.label}</div>
                    </div>
                  </div>
                  <div className="detail-badges">
                    <span className="active-pill">{formatDistance(activity.timestamp)}</span>
                  </div>
                </div>
              );
            })}
            {hasMore && (
              <button type="button" className="detail-action" onClick={() => setPage((current) => current + 1)}>
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
