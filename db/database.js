const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'worklogs.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('employee', 'manager')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    customer_email_default TEXT,
    max_photos INTEGER NOT NULL DEFAULT 5,
    created_by INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS form_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK(field_type IN (
      'text', 'textarea', 'number', 'dropdown', 'photo',
      'job_details', 'site_contacts', 'customer_name'
    )),
    options_json TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    placeholder TEXT,
    FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
    UNIQUE(form_id, field_key)
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    customer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    manager_notes TEXT,
    reviewed_by INTEGER,
    reviewed_at TEXT,
    email_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (form_id) REFERENCES forms(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS submission_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    field_id INTEGER NOT NULL,
    value TEXT,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES form_fields(id),
    UNIQUE(submission_id, field_id)
  );

  CREATE TABLE IF NOT EXISTS submission_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    field_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES form_fields(id)
  );

  CREATE TABLE IF NOT EXISTS time_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    sites_json TEXT NOT NULL DEFAULT '[]',
    hours_types_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    total_hours REAL NOT NULL,
    site TEXT NOT NULL,
    state TEXT,
    hours_type TEXT,
    tower_number TEXT,
    submission_id INTEGER,
    job_reference TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending', 'approved', 'rejected')),
    manager_notes TEXT,
    reviewed_by INTEGER,
    reviewed_at TEXT,
    submitted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (submission_id) REFERENCES submissions(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  );

  -- Legacy table kept for reference; data migrated to submissions on first run
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    report_date TEXT NOT NULL,
    project_name TEXT NOT NULL,
    hours_worked REAL NOT NULL,
    tasks_completed TEXT NOT NULL,
    notes TEXT,
    customer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    manager_notes TEXT,
    reviewed_by INTEGER,
    reviewed_at TEXT,
    email_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

try {
  db.exec(`ALTER TABLE forms ADD COLUMN form_template TEXT NOT NULL DEFAULT 'generic'`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE forms ADD COLUMN template_config TEXT`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE time_settings ADD COLUMN hours_types_json TEXT NOT NULL DEFAULT '[]'`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE time_entries ADD COLUMN state TEXT`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE time_entries ADD COLUMN hours_type TEXT`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE submission_photos ADD COLUMN description TEXT`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN job_title TEXT`);
} catch (_e) { /* column exists */ }

try {
  db.exec(`ALTER TABLE users ADD COLUMN manager_visible_password TEXT`);
} catch (_e) { /* column exists */ }

db.prepare(
  `UPDATE users SET manager_visible_password = 'password123'
   WHERE email IN ('employee@company.com', 'manager@company.com')
     AND (manager_visible_password IS NULL OR manager_visible_password = '')`
).run();

const usersForPasswordRepair = db
  .prepare('SELECT id, password_hash, manager_visible_password FROM users')
  .all();
const clearMismatchedPassword = db.prepare(
  'UPDATE users SET manager_visible_password = NULL WHERE id = ?'
);
for (const user of usersForPasswordRepair) {
  if (
    user.manager_visible_password &&
    !bcrypt.compareSync(user.manager_visible_password, user.password_hash)
  ) {
    clearMismatchedPassword.run(user.id);
  }
}



db.exec(`
  CREATE TABLE IF NOT EXISTS chat_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_room_members (
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'image', 'link')),
    body TEXT,
    image_filename TEXT,
    image_original_name TEXT,
    link_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS chat_message_reads (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    read_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

if (userCount === 0) {
  const insert = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );
  insert.run('Jane Employee', 'employee@company.com', bcrypt.hashSync('password123', 10), 'employee');
  insert.run('Mike Manager', 'manager@company.com', bcrypt.hashSync('password123', 10), 'manager');
}

db.prepare(
  "UPDATE users SET job_title = 'Field Technician' WHERE email = 'employee@company.com' AND (job_title IS NULL OR job_title = '')"
).run();
db.prepare(
  "UPDATE users SET job_title = 'Operations Manager' WHERE email = 'manager@company.com' AND (job_title IS NULL OR job_title = '')"
).run();

module.exports = db;