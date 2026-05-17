const { supabase } = require('../config/supabase');

class Lesson {
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
      const camelKey = Lesson._camelCase(key);
      normalized[camelKey] = value;
    });
    return new Lesson(normalized);
  }

  static async findOne(query = {}) {
    let q = supabase.from('lessons').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Lesson._snakeCase(key), value);
      }
    });
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return Lesson._normalizeRow(data);
  }

  static async find(query = {}) {
    let q = supabase.from('lessons').select('*');
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        q = q.eq(Lesson._snakeCase(key), value);
      }
    });
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map((row) => Lesson._normalizeRow(row));
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return Lesson._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const updateData = Object.fromEntries(
      Object.entries(updates).map(([key, value]) => [Lesson._snakeCase(key), value])
    );
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('lessons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return Lesson._normalizeRow(data);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return Lesson._normalizeRow(data);
  }

  async save() {
    const data = Object.fromEntries(
      Object.entries(this).map(([key, value]) => [Lesson._snakeCase(key), value])
    );
    if (!this.id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('lessons')
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      const row = Lesson._normalizeRow(inserted);
      Object.assign(this, row);
      return this;
    }
    data.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('lessons')
      .update(data)
      .eq('id', this.id)
      .select()
      .single();
    if (error) throw error;
    const row = Lesson._normalizeRow(updated);
    Object.assign(this, row);
    return this;
  }
}

module.exports = Lesson;
