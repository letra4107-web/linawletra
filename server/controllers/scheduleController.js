import Schedule from '../models/Schedule.js';
import Student from '../models/Student.js';
import { authorizeStudent, canAccessStudentResolved, getVisibleStudentIds, resolveStudent } from '../utils/studentAccess.js';
import { supabase } from '../config/supabase.js';

const MISSING_TABLE_CODES = new Set(['PGRST205', 'PGRST204', '42P01', '42703']);

const sortByScheduledDate = (items = []) =>
  [...items].sort((a, b) => new Date(a.scheduledDate || a.date || 0) - new Date(b.scheduledDate || b.date || 0));

const toTime = (value) => {
  if (!value) return null;
  const text = String(value);
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toTimeString().slice(0, 5);
};

const resolveChildIdForStudent = async (student = {}) => {
  const direct = student.childId || student.child_id;
  if (direct) return direct;
  const { data } = await supabase
    .from('students_children_map')
    .select('child_id')
    .eq('student_id', student.id)
    .maybeSingle();
  return data?.child_id || null;
};

const resolveStudentForSchedule = async (schedule = {}) => {
  const direct = await resolveStudent(schedule.studentId || schedule.student_id || schedule.childId || schedule.child_id);
  if (direct) return direct;

  const childId = schedule.childId || schedule.child_id;
  if (!childId) return null;

  const { data: mapRow } = await supabase
    .from('students_children_map')
    .select('student_id')
    .eq('child_id', childId)
    .maybeSingle();

  return mapRow?.student_id ? Student.findById(mapRow.student_id) : null;
};

const normalizeSchedulePayload = (body = {}) => {
  const scheduledDate = body.scheduledDate || body.scheduled_date || body.date || null;
  return {
    studentId: body.studentId || body.student_id || body.childId || body.child_id,
    lessonId: body.lessonId || body.lesson_id || null,
    title: body.title || 'Lesson session',
    description: body.description || body.notes || '',
    sessionType: body.sessionType || body.session_type || body.activityType || 'reading',
    scheduledDate,
    scheduledTime: body.scheduledTime || body.scheduled_time || body.time || toTime(scheduledDate),
    duration: Number(body.duration || 60),
    status: body.status || 'upcoming',
    notes: body.notes || '',
  };
};

const loadVisibleStudents = async (req) => {
  const visibleStudentIds = await getVisibleStudentIds(req);
  return (await Promise.all(visibleStudentIds.map((id) => Student.findById(id)))).filter(Boolean);
};

const attachScheduleNames = async (schedules = []) => {
  const students = await Student.find().exec();
  const mapRows = await supabase.from('students_children_map').select('student_id,child_id');
  const childByStudentId = new Map((mapRows.data || []).map((row) => [row.student_id, row.child_id]));
  const studentsByChildId = new Map((students || []).map((student) => [student.childId || student.child_id || childByStudentId.get(student.id) || student.id, student]));
  const userIds = [...new Set((students || []).map((student) => student.userId || student.user_id).filter(Boolean))];
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id,name,email,metadata').in('id', userIds)
    : { data: [] };
  const usersById = new Map((users || []).map((user) => [user.id, user]));

  return schedules.map((schedule) => {
    const childId = schedule.childId || schedule.studentId;
    const student = studentsByChildId.get(childId) || students.find((item) => item.id === childId);
    const user = student ? usersById.get(student.userId || student.user_id) : null;
    const metadata = user?.metadata || {};
    const studentName = user?.name ||
      metadata.displayName ||
      [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      'Student';
    return {
      ...schedule,
      childId,
      studentId: student?.id || schedule.studentId,
      studentRecordId: student?.id || null,
      studentName,
    };
  });
};

const loadSchedulesForStudents = async (students = []) => {
  const childIds = (await Promise.all(students.map(resolveChildIdForStudent))).filter(Boolean);
  return (await Promise.all(childIds.map((childId) => Schedule.find({ childId })))).flat();
};

const dateOnly = (value) => {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const clampDateRange = (query = {}) => {
  const now = new Date();
  const start = dateOnly(query.start) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = dateOnly(query.end) || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return start <= end ? { start, end } : { start: end, end: start };
};

const inRange = (value, start, end) => {
  const day = dateOnly(value);
  return Boolean(day && day >= start && day <= end);
};

const safeSelect = async (table, buildQuery) => {
  const result = await buildQuery(supabase.from(table));
  if (result.error) {
    if (MISSING_TABLE_CODES.has(result.error.code)) return [];
    throw result.error;
  }
  return result.data || [];
};

const existingUserId = async (id) => {
  if (!id) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
};

const getStudentDisplayName = (student = {}) => {
  const user = student.user || student.users || {};
  const metadata = user.metadata || {};
  return user.name ||
    metadata.displayName ||
    [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
    student.name ||
    user.email ||
    'Student';
};

const buildStudentCalendarRefs = async (students = []) => {
  const mapRows = await safeSelect('students_children_map', (query) =>
    query.select('student_id,child_id')
  );
  const childByStudentId = new Map(mapRows.map((row) => [row.student_id, row.child_id]));

  return students.map((student) => {
    const childId = student.childId || student.child_id || childByStudentId.get(student.id) || null;
    const refs = [...new Set([student.id, student.userId || student.user_id, student.childId || student.child_id, childId].filter(Boolean))];
    return {
      id: student.id,
      studentId: student.id,
      userId: student.userId || student.user_id || null,
      childId,
      name: getStudentDisplayName(student),
      refs,
    };
  });
};

const addDayMetric = (dayMap, date, updates = {}) => {
  const key = dateOnly(date);
  if (!key) return null;
  if (!dayMap.has(key)) {
    dayMap.set(key, {
      date: key,
      scheduledCount: 0,
      reminderCount: 0,
      learningActivityCount: 0,
      completedLessons: 0,
      completedPractice: 0,
      trackedPracticeSeconds: 0,
      hasActivity: false,
    });
  }
  const day = dayMap.get(key);
  Object.entries(updates).forEach(([field, value]) => {
    if (typeof value === 'number') {
      day[field] = Number(day[field] || 0) + value;
    } else {
      day[field] = value;
    }
  });
  day.hasActivity = Boolean(day.scheduledCount || day.reminderCount || day.learningActivityCount || day.completedLessons || day.completedPractice);
  return day;
};

const normalizeCalendarSchedule = (schedule = {}, studentRefsByChildId = new Map()) => {
  const date = schedule.scheduledDateOnly || dateOnly(schedule.scheduledDate || schedule.date);
  const student = studentRefsByChildId.get(schedule.childId);
  return {
    id: schedule.id || schedule._id,
    source: 'scheduled_activities',
    kind: 'scheduled',
    activityType: schedule.activityType || schedule.sessionType || 'reading_lesson',
    title: schedule.title || 'Scheduled activity',
    description: schedule.description || schedule.notes || '',
    date,
    time: schedule.scheduledTime || schedule.time || null,
    status: schedule.status || 'scheduled',
    childId: schedule.childId || student?.childId || null,
    studentId: schedule.studentId || student?.studentId || null,
    studentName: schedule.studentName || student?.name || 'Student',
    createdBy: schedule.createdBy || null,
  };
};

const createLearningEvent = ({ id, table, kind, studentRef, title, date, score = null, durationSeconds = 0, status = null }) => ({
  id: `${table}-${id}`,
  source: table,
  kind,
  activityType: kind,
  title,
  date: dateOnly(date),
  time: date ? new Date(date).toTimeString().slice(0, 5) : null,
  status,
  score,
  durationSeconds: Number(durationSeconds || 0),
  trackedMinutes: Math.round(Number(durationSeconds || 0) / 60),
  studentId: studentRef?.studentId || null,
  childId: studentRef?.childId || null,
  studentName: studentRef?.name || 'Student',
});

const fetchLearningEvents = async (studentRefs = [], start, end) => {
  const refs = [...new Set(studentRefs.flatMap((student) => student.refs))];
  if (!refs.length) return [];

  const refOwner = new Map();
  studentRefs.forEach((student) => {
    student.refs.forEach((ref) => refOwner.set(ref, student));
  });

  const [
    readingAttempts,
    pronunciationSessions,
    contentAttempts,
    contentCompletions,
    curriculumProgress,
    moduleProgress,
    lessonProgress,
  ] = await Promise.all([
    safeSelect('reading_attempts', (query) =>
      query.select('id,student_id,word_target,expected_text,sentence,accuracy_score,completed_at,created_at').in('student_id', refs)
    ),
    safeSelect('pronunciation_practice_sessions', (query) =>
      query.select('id,student_id,word,accuracy_percentage,created_at,duration_seconds,is_correct,practice_source').in('student_id', refs)
    ),
    safeSelect('student_content_attempts', (query) =>
      query.select('id,student_id,content_id,accuracy,duration_seconds,created_at').in('student_id', refs)
    ),
    safeSelect('student_content_completions', (query) =>
      query.select('id,student_id,content_id,completed_at').in('student_id', refs)
    ),
    safeSelect('curriculum_progress', (query) =>
      query.select('id,student_id,status,best_accuracy,attempts_count,passed_at,mastered_at,last_attempt_at,updated_at,curriculum_item_id').in('student_id', refs)
    ),
    safeSelect('student_module_progress', (query) =>
      query.select('id,student_id,module_id,status,progress,assessment_score,assessment_passed,completed_at,last_activity_at,updated_at').in('student_id', refs)
    ),
    safeSelect('lesson_progress', (query) =>
      query.select('id,student_id,lesson_id,status,opened_at,completed_at').in('student_id', refs)
    ),
  ]);

  const events = [
    ...readingAttempts.map((row) => createLearningEvent({
      id: row.id,
      table: 'reading_attempts',
      kind: 'practice',
      studentRef: refOwner.get(row.student_id),
      title: row.word_target || row.expected_text || row.sentence || 'Reading practice',
      date: row.completed_at || row.created_at,
      score: row.accuracy_score,
    })),
    ...pronunciationSessions.map((row) => createLearningEvent({
      id: row.id,
      table: 'pronunciation_practice_sessions',
      kind: 'practice',
      studentRef: refOwner.get(row.student_id),
      title: row.word ? `Pronunciation: ${row.word}` : 'Pronunciation practice',
      date: row.created_at,
      score: row.accuracy_percentage,
      durationSeconds: row.duration_seconds,
      status: row.is_correct ? 'completed' : 'practice',
    })),
    ...contentAttempts.map((row) => createLearningEvent({
      id: row.id,
      table: 'student_content_attempts',
      kind: 'practice',
      studentRef: refOwner.get(row.student_id),
      title: 'Content practice',
      date: row.created_at,
      score: row.accuracy,
      durationSeconds: row.duration_seconds,
    })),
    ...contentCompletions.map((row) => createLearningEvent({
      id: row.id,
      table: 'student_content_completions',
      kind: 'completed_lesson',
      studentRef: refOwner.get(row.student_id),
      title: 'Content completed',
      date: row.completed_at,
      status: 'completed',
    })),
    ...curriculumProgress
      .filter((row) => ['completed', 'passed', 'mastered', 'mastered_100'].includes(String(row.status || '').toLowerCase()) || row.completed_at || row.passed_at || row.mastered_at)
      .map((row) => createLearningEvent({
        id: row.id,
        table: 'curriculum_progress',
        kind: 'completed_lesson',
        studentRef: refOwner.get(row.student_id),
        title: 'Curriculum item completed',
        date: row.completed_at || row.mastered_at || row.passed_at || row.last_attempt_at || row.updated_at,
        score: row.best_accuracy,
        status: row.status || 'completed',
      })),
    ...moduleProgress
      .filter((row) => String(row.status || '').toLowerCase() === 'completed' || row.completed_at)
      .map((row) => createLearningEvent({
        id: row.id,
        table: 'student_module_progress',
        kind: 'completed_lesson',
        studentRef: refOwner.get(row.student_id),
        title: 'Module completed',
        date: row.completed_at || row.last_activity_at || row.updated_at,
        score: row.assessment_score,
        status: row.status || 'completed',
      })),
    ...lessonProgress
      .filter((row) => String(row.status || '').toLowerCase() === 'completed' || row.completed_at)
      .map((row) => createLearningEvent({
        id: row.id,
        table: 'lesson_progress',
        kind: 'completed_lesson',
        studentRef: refOwner.get(row.student_id),
        title: 'Lesson completed',
        date: row.completed_at,
        status: row.status || 'completed',
      })),
  ];

  return events.filter((event) => event.date && inRange(event.date, start, end));
};

export const createSchedule = async (req, res) => {
  try {
    const payload = normalizeSchedulePayload(req.body);
    const { studentId } = payload;

    if (!studentId) {
      return res.status(400).json({ message: 'Student is required' });
    }

    const student = await Student.findById(studentId) || await resolveStudent(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!(await canAccessStudentResolved(req, student, { allowAdmin: false }))) {
      return res.status(403).json({ message: 'You can only create schedules for students assigned to you.' });
    }

    if (!['teacher', 'parent'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only teachers and parents can create schedules' });
    }

    const childId = await resolveChildIdForStudent(student);
    if (!childId) {
      return res.status(409).json({
        message: 'This student is not linked to a child record required by scheduled_activities.child_id.',
      });
    }

    const createdByUserId = await existingUserId(req.user.id);
    const teacherId = await existingUserId(
      req.user.role === 'teacher' ? req.user.id : (student.teacherId || student.teacher_id || null)
    );
    const parentId = await existingUserId(
      student.parentId || student.parent_id || (req.user.role === 'parent' ? req.user.id : null)
    );

    const schedule = new Schedule({
      childId,
      studentRecordId: student.id,
      studentId: student.id,
      createdBy: req.user.role,
      createdByUserId,
      teacherId,
      parentId,
      lessonId: payload.lessonId,
      title: payload.title,
      description: payload.description,
      sessionType: payload.sessionType,
      scheduledDate: payload.scheduledDate,
      scheduledTime: payload.scheduledTime,
      duration: payload.duration,
      status: payload.status,
      notes: payload.notes,
    });

    await schedule.save();
    const [enrichedSchedule] = await attachScheduleNames([schedule]);
    return res.status(201).json({ message: 'Schedule created', schedule: enrichedSchedule || schedule });
  } catch (error) {
    console.error('[Schedules] Create error:', error);
    return res.status(500).json({ message: error.message });
  }
};

export const getSchedulesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { student, allowed } = await authorizeStudent(req, studentId);

    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to access this student schedule' });
    }

    const childId = await resolveChildIdForStudent(student);
    const schedules = childId ? sortByScheduledDate(await Schedule.find({ childId })) : [];
    return res.json(await attachScheduleNames(schedules));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getSchedulesByParent = async (req, res) => {
  try {
    const students = await loadVisibleStudents(req);
    const schedules = sortByScheduledDate(await loadSchedulesForStudents(students));
    return res.json(await attachScheduleNames(schedules));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const getParentCalendar = async (req, res) => {
  try {
    const { start, end } = clampDateRange(req.query);
    const students = await loadVisibleStudents(req);
    const studentRefs = await buildStudentCalendarRefs(students);
    const studentRefsByChildId = new Map(studentRefs.filter((student) => student.childId).map((student) => [student.childId, student]));

    const schedules = (await attachScheduleNames(await loadSchedulesForStudents(students)))
      .map((schedule) => normalizeCalendarSchedule(schedule, studentRefsByChildId))
      .filter((schedule) => schedule.date && inRange(schedule.date, start, end));

    const learningEvents = await fetchLearningEvents(studentRefs, start, end);
    const dayMap = new Map();

    schedules.forEach((schedule) => {
      addDayMetric(dayMap, schedule.date, {
        scheduledCount: schedule.activityType === 'reminder' ? 0 : 1,
        reminderCount: schedule.activityType === 'reminder' ? 1 : 0,
      });
    });

    learningEvents.forEach((event) => {
      addDayMetric(dayMap, event.date, {
        learningActivityCount: 1,
        completedLessons: event.kind === 'completed_lesson' ? 1 : 0,
        completedPractice: event.kind === 'practice' ? 1 : 0,
        trackedPracticeSeconds: Number(event.durationSeconds || 0),
      });
    });

    const trackedPracticeSeconds = learningEvents.reduce((sum, event) => sum + Number(event.durationSeconds || 0), 0);
    const learningTimeAvailable = trackedPracticeSeconds > 0;
    const completedLessons = learningEvents.filter((event) => event.kind === 'completed_lesson').length;
    const completedPractice = learningEvents.filter((event) => event.kind === 'practice').length;
    const activeDays = [...new Set(learningEvents.map((event) => event.date).filter(Boolean))].length;
    const upcomingReminders = schedules
      .filter((schedule) => schedule.activityType === 'reminder' && schedule.status !== 'completed' && schedule.status !== 'missed')
      .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`))
      .slice(0, 8);

    return res.json({
      success: true,
      range: { start, end },
      students: studentRefs.map(({ refs, ...student }) => student),
      scheduledActivities: schedules,
      learningEvents,
      dayMetrics: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      upcomingReminders,
      summary: {
        scheduledActivities: schedules.length,
        reminders: schedules.filter((schedule) => schedule.activityType === 'reminder').length,
        upcomingReminders: upcomingReminders.length,
        activeDays,
        completedLessons,
        completedPractice,
        trackedPracticeSeconds,
        trackedPracticeMinutes: learningTimeAvailable ? Math.round(trackedPracticeSeconds / 60) : null,
        learningTimeAvailable,
        learningTimeMessage: learningTimeAvailable ? null : 'Learning time tracking is not available yet.',
        minutesLabel: learningTimeAvailable ? 'Tracked Practice Minutes' : 'Learning Time',
      },
      dataQuality: {
        scheduledActivitiesSource: 'scheduled_activities',
        learningActivitySources: [
          'reading_attempts',
          'pronunciation_practice_sessions',
          'student_content_attempts',
          'student_content_completions',
          'curriculum_progress',
          'student_module_progress',
          'lesson_progress',
        ],
        unlinkedStudents: studentRefs.filter((student) => !student.childId).map((student) => ({
          studentId: student.studentId,
          name: student.name,
        })),
        minutesArePartial: learningTimeAvailable,
        minutesNote: learningTimeAvailable
          ? 'Minutes include only activity rows with duration_seconds.'
          : 'Learning time tracking is not available yet.',
      },
    });
  } catch (error) {
    console.error('[Schedules] Parent calendar error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getSchedulesByTeacher = async (req, res) => {
  try {
    const students = await loadVisibleStudents(req);
    const schedules = sortByScheduledDate(await loadSchedulesForStudents(students));
    return res.json(await attachScheduleNames(schedules));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    const student = await resolveStudentForSchedule(schedule);
    if (!student || !(await canAccessStudentResolved(req, student, { allowAdmin: false }))) {
      return res.status(403).json({ message: 'You do not have permission to update this schedule' });
    }

    const payload = normalizeSchedulePayload(req.body);
    const updatedSchedule = await Schedule.findByIdAndUpdate(req.params.id, {
      scheduledDate: payload.scheduledDate,
      scheduledTime: payload.scheduledTime,
      status: payload.status,
      notes: payload.notes,
      title: payload.title,
      description: payload.description,
      sessionType: payload.sessionType,
    });

    const [enrichedSchedule] = await attachScheduleNames([updatedSchedule]);
    return res.json({ message: 'Schedule updated', schedule: enrichedSchedule || updatedSchedule });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    const student = await resolveStudentForSchedule(schedule);
    if (!student || !(await canAccessStudentResolved(req, student, { allowAdmin: false }))) {
      return res.status(403).json({ message: 'You do not have permission to delete this schedule' });
    }

    await Schedule.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Schedule deleted' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
