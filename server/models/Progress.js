const { supabase } = require('../config/supabase');

class Progress {
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
      const camelKey = Progress._camelCase(key);
      normalized[camelKey] = value;
    });
    return new Progress(normalized);
  }

  static async findOne(query = {}) {
    let q = supabase.from('student_progress').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Progress._snakeCase(key), value);
      }
    });
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return Progress._normalizeRow(data);
  }

  static async find(query = {}) {
    let q = supabase.from('student_progress').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Progress._snakeCase(key), value);
      }
    });
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((row) => Progress._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('student_progress')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Progress._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [Progress._snakeCase(key), value])
    );
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('student_progress')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Progress._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('student_progress')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Progress._normalizeRow(data);
  }

  async save() {
    const data = Object.fromEntries(
      Object.entries(this).map(([key, value]) => [Progress._snakeCase(key), value])
    );
    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('student_progress')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      const row = Progress._normalizeRow(inserted);
      Object.assign(this, row);
      return this;
    }
    data.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('student_progress')
      .update(data)
      .eq('id', this.id)
      .select()
      .single();
    if (error) throw error;
    const row = Progress._normalizeRow(updated);
    Object.assign(this, row);
    return this;
  }
}

module.exports = Progress;
