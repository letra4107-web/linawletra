const { supabase } = require('../config/supabase');

class Schedule {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  static _snakeCase(key) {
    return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  }

  static _camelCase(key) {
    return key.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  static _normalizeRow(row) {
    if (!row) return null;
    const normalized = {};
    Object.entries(row).forEach(([key, value]) => {
      const camelKey = Schedule._camelCase(key);
      normalized[camelKey] = value;
    });
    return new Schedule(normalized);
  }

  static async findOne(query = {}) {
    let q = supabase.from('schedules').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Schedule._snakeCase(key), value);
      }
    });
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return Schedule._normalizeRow(data);
  }

  static async find(query = {}) {
    let q = supabase.from('schedules').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Schedule._snakeCase(key), value);
      }
    });
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((row) => Schedule._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Schedule._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [Schedule._snakeCase(key), value])
    );
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Schedule._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Schedule._normalizeRow(data);
  }

  async save() {
    const data = Object.fromEntries(
      Object.entries(this).map(([key, value]) => [Schedule._snakeCase(key), value])
    );
    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('schedules')
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
      .from('schedules')
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

module.exports = Schedule;
