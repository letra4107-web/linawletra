// Intentionally left blank.
// Progress UI is implemented inside ParentDashboard at /parent/:section.
export default function ProgressReports() {
  if (typeof window !== 'undefined') {
    window.location.replace('/parent/progress');
  }
  return null;
}

