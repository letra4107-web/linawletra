import { supabase } from '../config/supabase.js';

class Assessment {
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
      const camelKey = Assessment._camelCase(key);
      normalized[camelKey] = value;
    });
    return new Assessment(normalized);
  }

  static async findOne(query = {}) {
    let q = supabase.from('assessments').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Assessment._snakeCase(key), value);
      }
    });
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return Assessment._normalizeRow(data);
  }

  static async find(query = {}) {
    let q = supabase.from('assessments').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Assessment._snakeCase(key), value);
      }
    });
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((row) => Assessment._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Assessment._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [Assessment._snakeCase(key), value])
    );
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('assessments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Assessment._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('assessments')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Assessment._normalizeRow(data);
  }

  async save() {
    const data = Object.fromEntries(
      Object.entries(this).map(([key, value]) => [Assessment._snakeCase(key), value])
    );
    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('assessments')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      const row = Assessment._normalizeRow(inserted);
      Object.assign(this, row);
      return this;
    }
    data.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('assessments')
      .update(data)
      .eq('id', this.id)
      .select()
      .single();
    if (error) throw error;
    const row = Assessment._normalizeRow(updated);
    Object.assign(this, row);
    return this;
  }
}

export default Assessment;
