import { supabase } from '../config/supabase.js';

const SCHEDULE_TABLE = 'scheduled_activities';

const toTime = (value) => {
  if (!value) return null;
  const text = String(value);
  if (/^\d{2}:\d{2}/.test(text)) return text.slice(0, 5);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toTimeString().slice(0, 5);
};

const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const combineDateTime = (dateValue, timeValue) => {
  const date = toDateOnly(dateValue);
  if (!date) return null;
  const time = toTime(timeValue) || '00:00';
  return `${date}T${time}:00`;
};

const normalizeActivityType = (value) => {
  const type = String(value || '').toLowerCase();
  if (['practice', 'reminder', 'appointment'].includes(type)) return type;
  return 'reading_lesson';
};

const normalizeStatus = (value) => {
  const status = String(value || '').toLowerCase();
  if (status === 'upcoming') return 'scheduled';
  if (status === 'cancelled') return 'missed';
  if (['scheduled', 'in_progress', 'completed', 'missed'].includes(status)) return status;
  return 'scheduled';
};

class Schedule {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  static _normalizeRow(row) {
    if (!row) return null;
    const scheduledDate = row.scheduled_date || null;
    const startTime = row.start_time || null;
    const normalized = {
      id: row.id,
      _id: row.id,
      childId: row.child_id,
      studentId: row.student_id || row.studentId || row.child_id,
      createdBy: row.created_by,
      createdByUserId: row.created_by_user_id,
      teacherId: row.teacher_id || null,
      parentId: row.parent_id || null,
      activityType: row.activity_type,
      sessionType: row.activity_type,
      title: row.title,
      description: row.description || '',
      notes: row.description || '',
      scheduledDate: combineDateTime(scheduledDate, startTime) || scheduledDate,
      scheduledDateOnly: scheduledDate,
      scheduledTime: startTime,
      time: startTime,
      endTime: row.end_time,
      status: row.status || 'scheduled',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return new Schedule(normalized);
  }

  static _toRow(data = {}) {
    const scheduledDate = data.scheduledDate || data.scheduled_date || data.date;
    const startTime = data.scheduledTime || data.startTime || data.start_time || data.time || toTime(scheduledDate);
    const row = {
      child_id: data.childId || data.child_id || data.studentId || data.student_id,
      created_by: data.createdBy || data.created_by || 'teacher',
      created_by_user_id: data.createdByUserId || data.created_by_user_id || null,
      teacher_id: data.teacherId || data.teacher_id || null,
      parent_id: data.parentId || data.parent_id || null,
      student_id: data.studentRecordId || data.student_id || null,
      activity_type: normalizeActivityType(data.activityType || data.activity_type || data.sessionType || data.session_type),
      title: data.title || 'Lesson session',
      description: data.description ?? data.notes ?? '',
      scheduled_date: toDateOnly(scheduledDate),
      start_time: toTime(startTime),
      end_time: toTime(data.endTime || data.end_time),
      status: normalizeStatus(data.status),
    };

    Object.keys(row).forEach((key) => {
      if (row[key] === undefined || row[key] === null || row[key] === '') delete row[key];
    });
    return row;
  }

  static _applyQuery(queryRef, query = {}) {
    let q = queryRef;
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (key === 'studentId' || key === 'student_id' || key === 'childId' || key === 'child_id') {
        q = key === 'studentId' || key === 'student_id' ? q.eq('student_id', value) : q.eq('child_id', value);
      } else if (key === 'teacherId') {
        q = q.eq('teacher_id', value);
      } else if (key === 'parentId') {
        q = q.eq('parent_id', value);
      } else if (key === 'createdByUserId') {
        q = q.eq('created_by_user_id', value);
      } else if (key === 'createdBy') {
        q = q.eq('created_by', value);
      } else if (key === 'id' || key === '_id') {
        q = q.eq('id', value);
      } else {
        q = q.eq(key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`), value);
      }
    });
    return q;
  }

  static async findOne(query = {}) {
    const { data, error } = await Schedule._applyQuery(
      supabase.from(SCHEDULE_TABLE).select('*'),
      query
    ).maybeSingle();
    if (error) return null;
    return Schedule._normalizeRow(data);
  }

  static async find(query = {}) {
    const { data, error } = await Schedule._applyQuery(
      supabase.from(SCHEDULE_TABLE).select('*'),
      query
    );
    if (error) return [];
    return (data || []).map((row) => Schedule._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from(SCHEDULE_TABLE)
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Schedule._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Schedule._toRow(updates);
    updateData.updated_at = new Date().toISOString();
    delete updateData.child_id;
    delete updateData.created_by;
    delete updateData.created_by_user_id;
    delete updateData.teacher_id;
    delete updateData.parent_id;
    delete updateData.student_id;

    const { data, error } = await supabase
      .from(SCHEDULE_TABLE)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Schedule._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from(SCHEDULE_TABLE)
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Schedule._normalizeRow(data);
  }

  async save() {
    const data = Schedule._toRow(this);
    data.created_by = this.createdBy || this.created_by || 'teacher';

    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from(SCHEDULE_TABLE)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      const row = Schedule._normalizeRow(inserted);
      Object.assign(this, row);
      return this;
    }

    data.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from(SCHEDULE_TABLE)
      .update(data)
      .eq('id', this.id)
      .select()
      .single();
    if (error) throw error;
    const row = Schedule._normalizeRow(updated);
    Object.assign(this, row);
    return this;
  }
}

export default Schedule;
