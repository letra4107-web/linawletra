const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase.js');

class UserQuery {
  constructor(query = {}) {
    this.query = query;
    this.selectedFields = null;
    this.leanMode = false;
  }

  select(fields) {
    if (!fields) return this;
    if (typeof fields === 'string') {
      this.selectedFields = fields.split(/\s+/).filter(Boolean);
    } else if (Array.isArray(fields)) {
      this.selectedFields = fields;
    }
    return this;
  }

  lean() {
    this.leanMode = true;
    return this;
  }

  async exec() {
    const user = await User._fetchOne(this.query, this.selectedFields);
    if (!user) return null;
    if (this.leanMode) {
      return user.toObject();
    }
    return user;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  finally(callback) {
    return this.exec().finally(callback);
  }
}

class User {
  constructor(data = {}) {
    Object.assign(this, data);
    if (this.uid && !this.id) this.id = this.uid;
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
      const camelKey = User._camelCase(key);
      normalized[camelKey] = value;
    });
    if (normalized.uid && !normalized.id) {
      normalized.id = normalized.uid;
    }
    if (normalized.id && !normalized._id) {
      normalized._id = normalized.id;
    }
    return new User(normalized);
  }

  static _normalizeFields(data = {}) {
    const normalized = {};
    Object.entries(data).forEach(([key, value]) => {
      const snakeKey = User._snakeCase(key);
      normalized[snakeKey] = value;
    });
    return normalized;
  }

  static _buildQuery(query = {}, selectedFields = null) {
    const fields = selectedFields && selectedFields.length > 0
      ? selectedFields.map((field) => {
          const clean = field.replace(/^\+/, '');
          return clean === '_id' ? 'id' : User._snakeCase(clean);
        }).join(',')
      : '*';

    let queryRef = supabase.from('users').select(fields);

    if (query.uid || query.id) {
      queryRef = queryRef.eq('id', query.uid || query.id);
    }
    if (query.email) {
      queryRef = queryRef.eq('email', String(query.email).toLowerCase());
    }
    if (query.role) {
      queryRef = queryRef.eq('role', query.role);
    }
    return queryRef;
  }

  static async _fetchOne(query = {}, selectedFields = null) {
    const queryRef = User._buildQuery(query, selectedFields).maybeSingle();
    const { data, error } = await queryRef;
    if (error) {
      return null;
    }
    return User._normalizeRow(data);
  }

  static findOne(query = {}) {
    return new UserQuery(query);
  }

  static async findOneAndUpdate(query = {}, updates = {}) {
    const existing = await User.findOne(query).exec();
    if (!existing) return null;

    const updateData = User._normalizeFields(updates);
    const allowedColumns = new Set(['email', 'name', 'role', 'parent_id', 'email_verified', 'metadata']);
    Object.keys(updateData).forEach((key) => {
      if (!allowedColumns.has(key)) delete updateData[key];
    });
    if (updateData.email) {
      updateData.email = String(updateData.email).toLowerCase();
    }
    if (updateData.password) {
      updateData.password_hash = await bcrypt.hash(String(updateData.password), 10);
      delete updateData.password;
    }
    if (!Object.keys(updateData).length) return existing;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw error;
    }
    return User._normalizeRow(data);
  }

  static async findByIdAndUpdate(id, updates = {}) {
    return User.findOneAndUpdate({ id }, updates);
  }

  static async findById(id) {
    return User.findOne({ id }).exec();
  }

  static async findByIdAndDelete(id) {
    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return null;
    }
    return User._normalizeRow(data);
  }

  toObject() {
    const obj = { ...this };
    delete obj.id;
    delete obj._id;
    return obj;
  }

  async save() {
    const data = User._normalizeFields(this.toObject());
    const allowedColumns = new Set(['id', 'email', 'name', 'role', 'parent_id', 'email_verified', 'metadata']);
    Object.keys(data).forEach((key) => {
      if (!allowedColumns.has(key)) delete data[key];
    });
    if (data.email) {
      data.email = String(data.email).toLowerCase();
    }
    if (data.password) {
      data.password_hash = await bcrypt.hash(String(data.password), 10);
      delete data.password;
    }
    if (!this.uid && !this.id) {
      const { data: inserted, error } = await supabase
        .from('users')
        .insert(data)
        .select()
        .single();
      if (error) {
        throw error;
      }
      const user = User._normalizeRow(inserted);
      Object.assign(this, user);
      return this;
    }

    const uid = this.uid || this.id;
    const { data: upserted, error } = await supabase
      .from('users')
      .upsert({ ...data, id: uid }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      throw error;
    }
    const user = User._normalizeRow(upserted);
    Object.assign(this, user);
    return this;
  }

  async comparePassword(enteredPassword) {
    if (!this.passwordHash) return false;
    return bcrypt.compare(String(enteredPassword || ''), String(this.passwordHash || ''));
  }
}

module.exports = User;
