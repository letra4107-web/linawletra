import { supabase } from '../config/supabase.js';

class Setting {
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
      const camelKey = Setting._camelCase(key);
      normalized[camelKey] = value;
    });
    return new Setting(normalized);
  }

  static async findOne(query = {}) {
    let q = supabase.from('settings').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Setting._snakeCase(key), value);
      }
    });
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return Setting._normalizeRow(data);
  }

  static async find(query = {}) {
    let q = supabase.from('settings').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Setting._snakeCase(key), value);
      }
    });
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((row) => Setting._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Setting._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [Setting._snakeCase(key), value])
    );
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('settings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Setting._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('settings')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Setting._normalizeRow(data);
  }

  async save() {
    const data = Object.fromEntries(
      Object.entries(this).map(([key, value]) => [Setting._snakeCase(key), value])
    );
    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('settings')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      const row = Setting._normalizeRow(inserted);
      Object.assign(this, row);
      return this;
    }
    data.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('settings')
      .update(data)
      .eq('id', this.id)
      .select()
      .single();
    if (error) throw error;
    const row = Setting._normalizeRow(updated);
    Object.assign(this, row);
    return this;
  }
}

export default Setting;
