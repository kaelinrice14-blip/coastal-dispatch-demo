const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { addUserToDefaultRoom } = require('./chat');

const ROLES = ['employee', 'manager'];

function authenticateUser(email, password) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;

  return user;
}

function getAllUsers() {
  return db
    .prepare(
      `SELECT id, name, email, job_title, role, manager_visible_password, created_at
       FROM users ORDER BY name`
    )
    .all();
}

function getUserById(id) {
  return db
    .prepare(
      'SELECT id, name, email, job_title, role, manager_visible_password, created_at FROM users WHERE id = ?'
    )
    .get(id);
}

function getUserByEmail(email, excludeId = null) {
  if (excludeId) {
    return db
      .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .get(email, excludeId);
  }
  return db.prepare('SELECT id FROM users WHERE email = ?').get(email);
}

function countManagers(excludeId = null) {
  if (excludeId) {
    return db
      .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'manager' AND id != ?")
      .get(excludeId).count;
  }
  return db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'manager'").get().count;
}

function validateUserData(data, { isCreate, userId, editingSelf }) {
  const errors = [];
  const name = (data.name || '').trim();
  const email = (data.email || '').trim().toLowerCase();
  const jobTitle = (data.job_title || '').trim();
  const role = (data.role || '').trim();
  const password = data.password || '';

  if (!name) errors.push('Full name is required.');
  if (!email) errors.push('Email is required.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Enter a valid email address.');
  }
  if (!jobTitle) errors.push('Job title is required.');
  if (!role || !ROLES.includes(role)) errors.push('Select a valid role.');

  if (isCreate && !password) {
    errors.push('Password is required.');
  } else if (password && password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  }

  if (email && getUserByEmail(email, userId || null)) {
    errors.push('That email is already in use.');
  }

  if (editingSelf && role !== 'manager') {
    errors.push('You cannot change your own role away from Manager.');
  }

  if (userId && role === 'employee') {
    const existing = getUserById(userId);
    if (existing?.role === 'manager' && countManagers(userId) === 0) {
      errors.push('At least one Manager must remain in the system.');
    }
  }

  return {
    errors,
    data: { name, email, job_title: jobTitle, role, password },
  };
}

function createUser(data) {
  const hash = bcrypt.hashSync(data.password, 10);
  const result = db.prepare(
    `INSERT INTO users (name, email, job_title, password_hash, manager_visible_password, role)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(data.name, data.email, data.job_title, hash, data.password, data.role);

  const user = getUserById(result.lastInsertRowid);
  addUserToDefaultRoom(user.id);
  return user;
}

function updateUser(id, data) {
  const existing = db
    .prepare('SELECT manager_visible_password FROM users WHERE id = ?')
    .get(id);
  const passwordChanged =
    !!data.password && data.password !== (existing?.manager_visible_password || '');

  if (passwordChanged) {
    const hash = bcrypt.hashSync(data.password, 10);
    db.prepare(
      `UPDATE users SET name = ?, email = ?, job_title = ?, role = ?,
       password_hash = ?, manager_visible_password = ? WHERE id = ?`
    ).run(data.name, data.email, data.job_title, data.role, hash, data.password, id);
  } else {
    db.prepare(
      `UPDATE users SET name = ?, email = ?, job_title = ?, role = ? WHERE id = ?`
    ).run(data.name, data.email, data.job_title, data.role, id);
  }
  return getUserById(id);
}

module.exports = {
  ROLES,
  authenticateUser,
  getAllUsers,
  getUserById,
  validateUserData,
  createUser,
  updateUser,
};