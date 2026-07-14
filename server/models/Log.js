import { supabase } from '../config/supabase.js';

class Log {
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
      const camelKey = Log._camelCase(key);
      normalized[camelKey] = value;
    });
    return new Log(normalized);
  }

  static async findOne(query = {}) {
    let q = supabase.from('activity_logs').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Log._snakeCase(key), value);
      }
    });
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return Log._normalizeRow(data);
  }

  static async find(query = {}) {
    let q = supabase.from('activity_logs').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Log._snakeCase(key), value);
      }
    });
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((row) => Log._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Log._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [Log._snakeCase(key), value])
    );
    const { data, error } = await supabase
      .from('activity_logs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Log._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('activity_logs')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Log._normalizeRow(data);
  }

  async save() {
    const data = Object.fromEntries(
      Object.entries(this).map(([key, value]) => [Log._snakeCase(key), value])
    );
    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('activity_logs')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      const row = Log._normalizeRow(inserted);
      Object.assign(this, row);
      return this;
    }
    const { data: updated, error } = await supabase
      .from('activity_logs')
      .update(data)
      .eq('id', this.id)
      .select()
      .single();
    if (error) throw error;
    const row = Log._normalizeRow(updated);
    Object.assign(this, row);
    return this;
  }
}

export default Log;
