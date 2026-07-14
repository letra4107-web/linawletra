import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';

class StudentQuery {
  constructor(query = {}, options = {}) {
    this.query = query || {};
    this.many = Boolean(options.many);
    this.selectedFields = null;
    this.includeHiddenFields = false;
    this.leanMode = false;
    this.sortFields = options.sort || null;
    this.limitValue = options.limit || null;
    this.offsetValue = options.offset || null;
  }

  select(fields) {
    if (!fields) return this;
    const parts = typeof fields === 'string' ? fields.split(/\s+/).filter(Boolean) : fields;
    this.selectedFields = [];
    parts.forEach((part) => {
      if (!part) return;
      if (part.startsWith('+')) {
        this.includeHiddenFields = true;
        const fieldName = part.slice(1);
        if (fieldName) this.selectedFields.push(fieldName);
      } else {
        this.selectedFields.push(part);
      }
    });
    return this;
  }

  populate() {
    return this;
  }

  sort(sortObject) {
    this.sortFields = sortObject;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  offset(value) {
    this.offsetValue = value;
    return this;
  }

  lean() {
    this.leanMode = true;
    return this;
  }

  async exec() {
    if (this.many) {
      return Student._fetchMany(this.query, this);
    }
    return Student._fetchOne(this.query, this);
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

class Student {
  constructor(data = {}) {
    Object.assign(this, data);
    if (this.id && !this._id) this._id = this.id;
    if (this._id && !this.id) this.id = this._id;
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
      const camelKey = Student._camelCase(key);
      normalized[camelKey] = value;
    });
    if (!normalized.id && normalized.uid) {
      normalized.id = normalized.uid;
    }
    if (normalized.id && !normalized._id) {
      normalized._id = normalized.id;
    }
    return new Student(normalized);
  }

  static _normalizeFields(data = {}) {
    const normalized = {};
    Object.entries(data).forEach(([key, value]) => {
      const snakeKey = Student._snakeCase(key);
      normalized[snakeKey] = value;
    });
    return normalized;
  }

  static _buildQuery(query = {}, selectedFields = null) {
    const fields = selectedFields && selectedFields.length > 0
      ? selectedFields.map((field) => {
          const clean = field.replace(/^\+/, '');
          return clean === 'id' || clean === '_id' ? 'id' : Student._snakeCase(clean);
        }).join(',')
      : '*';

    let queryRef = supabase.from('students').select(fields);

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (key === 'id' || key === '_id') {
        queryRef = queryRef.eq('id', value);
        return;
      }
      if (key === 'email' && typeof value === 'string') {
        queryRef = queryRef.eq('email', value.toLowerCase());
        return;
      }
      if (typeof value === 'object' && !Array.isArray(value) && value.$ne !== undefined) {
        queryRef = queryRef.neq(Student._snakeCase(key), value.$ne);
        return;
      }
      queryRef = queryRef.eq(Student._snakeCase(key), value);
    });

    return queryRef;
  }

  static async _fetchOne(query = {}, options = {}) {
    const selectedFields = options.selectedFields || null;
    const queryRef = Student._buildQuery(query, selectedFields).maybeSingle();
    const { data, error } = await queryRef;
    if (error) {
      return null;
    }
    return Student._normalizeRow(data);
  }

  static async _fetchMany(query = {}, queryOptions = {}) {
    let queryRef = Student._buildQuery(query, queryOptions.selectedFields);

    if (queryOptions.sortFields) {
      Object.entries(queryOptions.sortFields).forEach(([field, direction]) => {
        queryRef = queryRef.order(field, { ascending: direction !== -1 });
      });
    }

    if (queryOptions.limitValue != null || queryOptions.offsetValue != null) {
      const offset = Number(queryOptions.offsetValue || 0);
      const limit = Number(queryOptions.limitValue || 100);
      queryRef = queryRef.range(offset, offset + limit - 1);
    }

    const { data, error } = await queryRef;
    if (error) {
      return [];
    }
    return (data || []).map((row) => Student._normalizeRow(row));
  }

  static findOne(query = {}) {
    return new StudentQuery(query, { many: false });
  }

  static find(query = {}) {
    return new StudentQuery(query, { many: true });
  }

  static async findOneAndUpdate(query = {}, updates = {}) {
    const student = await Student.findOne(query).exec();
    if (!student) return null;

    const updateData = { ...student.toObject(), ...updates };
    if (updateData.email) {
      updateData.email = String(updateData.email).toLowerCase();
    }
    if (updateData.password) {
      updateData.password_hash = await bcrypt.hash(String(updateData.password), 10);
      delete updateData.password;
    }
    if (updateData.profilePin) {
      updateData.profile_pin_hash = await bcrypt.hash(String(updateData.profilePin), 10);
      delete updateData.profilePin;
    }
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('students')
      .update(Student._normalizeFields(updateData))
      .eq('id', student.id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return Student._normalizeRow(data);
  }

  static async findById(id) {
    return Student.findOne({ id }).exec();
  }

  static async findByIdAndUpdate(id, updates = {}) {
    return Student.findOneAndUpdate({ id }, updates);
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('students')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return null;
    }
    return Student._normalizeRow(data);
  }

  toObject() {
    const obj = { ...this };
    delete obj.id;
    delete obj._id;
    return obj;
  }

  async save() {
    const data = Student._normalizeFields(this.toObject());
    if (data.email) {
      data.email = String(data.email).toLowerCase();
    }
    if (data.password) {
      data.password_hash = await bcrypt.hash(String(data.password), 10);
      delete data.password;
    }
    if (data.profile_pin) {
      data.profile_pin_hash = await bcrypt.hash(String(data.profile_pin), 10);
      delete data.profile_pin;
    }
    data.updated_at = new Date().toISOString();

    if (!this.id && !this._id) {
      data.created_at = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('students')
        .insert(data)
        .select()
        .single();
      if (error) {
        throw error;
      }
      const student = Student._normalizeRow(inserted);
      Object.assign(this, student);
      return this;
    }

    const id = this.id || this._id;
    const { data: updated, error } = await supabase
      .from('students')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    const student = Student._normalizeRow(updated);
    Object.assign(this, student);
    return this;
  }

  async comparePassword(enteredPassword) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(String(enteredPassword || ''), String(this.passwordHash || ''));
  }

  async setPassword(plainPassword) {
    this.passwordHash = await bcrypt.hash(String(plainPassword), 10);
  }

  async setProfilePin(plainPin) {
    this.profilePinHash = await bcrypt.hash(String(plainPin), 10);
  }

  async verifyProfilePin(plainPin) {
    if (!this.profilePinHash) return false;
    return bcrypt.compare(String(plainPin || ''), String(this.profilePinHash || ''));
  }
}

export default Student;
