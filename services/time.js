const db = require('../db/database');

const DEFAULT_SITES = ['Example Wind Farm A', 'Example Wind Farm B'];
const DEFAULT_HOURS_TYPES = [
  'Regular',
  'Overtime',
  'Double Time',
  'Travel',
  'Training',
  'On-Call',
  'Holiday',
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

function seedTimeSettings() {
  const row = db.prepare('SELECT id FROM time_settings WHERE id = 1').get();
  if (!row) {
    db.prepare(
      'INSERT INTO time_settings (id, sites_json, hours_types_json) VALUES (1, ?, ?)'
    ).run(JSON.stringify(DEFAULT_SITES), JSON.stringify(DEFAULT_HOURS_TYPES));
  } else {
    const settings = db.prepare('SELECT hours_types_json FROM time_settings WHERE id = 1').get();
    if (!settings.hours_types_json || settings.hours_types_json === '[]') {
      db.prepare('UPDATE time_settings SET hours_types_json = ? WHERE id = 1').run(
        JSON.stringify(DEFAULT_HOURS_TYPES)
      );
    }
  }
}

function getSites() {
  seedTimeSettings();
  const row = db.prepare('SELECT sites_json FROM time_settings WHERE id = 1').get();
  try {
    const sites = JSON.parse(row.sites_json);
    return Array.isArray(sites) ? sites : DEFAULT_SITES;
  } catch {
    return DEFAULT_SITES;
  }
}

function saveSites(sites) {
  seedTimeSettings();
  const cleaned = sites.map((s) => s.trim()).filter(Boolean);
  db.prepare(
    `UPDATE time_settings SET sites_json = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(JSON.stringify(cleaned));
  return cleaned;
}

function getHoursTypes() {
  seedTimeSettings();
  const row = db.prepare('SELECT hours_types_json FROM time_settings WHERE id = 1').get();
  try {
    const types = JSON.parse(row.hours_types_json);
    return Array.isArray(types) && types.length > 0 ? types : DEFAULT_HOURS_TYPES;
  } catch {
    return DEFAULT_HOURS_TYPES;
  }
}

function saveHoursTypes(types) {
  seedTimeSettings();
  const cleaned = types.map((s) => s.trim()).filter(Boolean);
  db.prepare(
    `UPDATE time_settings SET hours_types_json = ?, updated_at = datetime('now') WHERE id = 1`
  ).run(JSON.stringify(cleaned));
  return cleaned;
}

function saveTimeSettings(sites, hoursTypes) {
  saveSites(sites);
  saveHoursTypes(hoursTypes);
  return { sites: getSites(), hoursTypes: getHoursTypes() };
}

function calculateHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60;
  return Math.round(((endMins - startMins) / 60) * 100) / 100;
}

function getFormReferencesForDay(userId, date) {
  return db
    .prepare(
      `SELECT s.id, s.created_at, f.name as form_name
       FROM submissions s
       JOIN forms f ON s.form_id = f.id
       WHERE s.user_id = ?
         AND date(s.created_at) = date(?)
       ORDER BY s.created_at DESC`
    )
    .all(userId, date)
    .map((row) => ({
      id: row.id,
      label: `${row.form_name} — ${row.created_at.split(' ')[0] || date}`,
      form_name: row.form_name,
    }));
}

function parseEntryBody(body) {
  const startTime = (body.start_time || '').trim();
  const endTime = (body.end_time || '').trim();
  const totalHours = body.total_hours
    ? parseFloat(body.total_hours)
    : calculateHours(startTime, endTime);

  return {
    entry_date: (body.entry_date || '').trim(),
    start_time: startTime,
    end_time: endTime,
    total_hours: totalHours,
    site: (body.site || '').trim(),
    state: (body.state || '').trim(),
    hours_type: (body.hours_type || '').trim(),
    submission_id: body.submission_id ? parseInt(body.submission_id, 10) : null,
    job_reference: (body.job_reference || '').trim(),
    notes: (body.notes || '').trim(),
  };
}

function validateEntry(data) {
  const errors = [];
  if (!data.entry_date) errors.push('Date is required.');
  if (!data.start_time) errors.push('Start Time is required.');
  if (!data.end_time) errors.push('End Time is required.');
  if (!data.site) errors.push('Site / Wind Farm is required.');
  if (!data.state) errors.push('State is required.');
  if (!data.hours_type) errors.push('Type of Hours is required.');
  if (!data.total_hours || data.total_hours <= 0) errors.push('Total Hours must be greater than 0.');
  if (data.state && !US_STATES.includes(data.state)) errors.push('Invalid state selected.');
  const validTypes = getHoursTypes();
  if (data.hours_type && !validTypes.includes(data.hours_type)) {
    errors.push('Invalid hours type selected.');
  }
  return errors;
}

function getDraftEntries(userId) {
  return db
    .prepare(
      `SELECT te.*, u.name as employee_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.user_id = ? AND te.status = 'draft'
       ORDER BY te.entry_date DESC, te.start_time`
    )
    .all(userId);
}

function getEntriesForUser(userId, status = 'all') {
  let query = `
    SELECT te.*, rev.name as reviewer_name
    FROM time_entries te
    LEFT JOIN users rev ON te.reviewed_by = rev.id
    WHERE te.user_id = ? AND te.status != 'draft'
  `;
  if (status !== 'all') query += ' AND te.status = ?';
  query += ' ORDER BY te.entry_date DESC, te.submitted_at DESC';
  return status !== 'all'
    ? db.prepare(query).all(userId, status)
    : db.prepare(query).all(userId);
}

function getEntryById(id) {
  return db
    .prepare(
      `SELECT te.*, u.name as employee_name, rev.name as reviewer_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN users rev ON te.reviewed_by = rev.id
       WHERE te.id = ?`
    )
    .get(id);
}

function createDraftEntry(userId, data) {
  const result = db.prepare(
    `INSERT INTO time_entries (user_id, entry_date, start_time, end_time, total_hours, site,
     state, hours_type, submission_id, job_reference, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
  ).run(
    userId,
    data.entry_date,
    data.start_time,
    data.end_time,
    data.total_hours,
    data.site,
    data.state,
    data.hours_type,
    data.submission_id || null,
    data.job_reference || null,
    data.notes || null
  );
  return getEntryById(result.lastInsertRowid);
}

function deleteDraftEntry(id, userId) {
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').get(id, userId);
  if (!entry || entry.status !== 'draft') return false;
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  return true;
}

function submitDraftEntries(userId) {
  const drafts = getDraftEntries(userId);
  if (drafts.length === 0) return { count: 0 };

  const update = db.prepare(
    `UPDATE time_entries SET status = 'pending', submitted_at = datetime('now'),
     updated_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'draft'`
  );
  drafts.forEach((d) => update.run(d.id, userId));
  return { count: drafts.length };
}

function getManagerEntries(filter = 'pending') {
  let query = `
    SELECT te.*, u.name as employee_name, rev.name as reviewer_name
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN users rev ON te.reviewed_by = rev.id
    WHERE te.status != 'draft'
  `;
  if (filter !== 'all') query += ' AND te.status = ?';
  query += ' ORDER BY te.entry_date DESC, te.submitted_at DESC';
  return filter !== 'all'
    ? db.prepare(query).all(filter)
    : db.prepare(query).all();
}

function getTimeCounts() {
  return db
    .prepare(
      `SELECT status, COUNT(*) as count FROM time_entries
       WHERE status != 'draft' GROUP BY status`
    )
    .all()
    .reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});
}

function reviewEntry(id, managerId, action, managerNotes) {
  const entry = getEntryById(id);
  if (!entry || entry.status !== 'pending') return { ok: false, error: 'Entry not found or already reviewed.' };

  if (action === 'approve') {
    db.prepare(
      `UPDATE time_entries SET status = 'approved', manager_notes = ?, reviewed_by = ?,
       reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(managerNotes || null, managerId, id);
  } else if (action === 'reject') {
    db.prepare(
      `UPDATE time_entries SET status = 'rejected', manager_notes = ?, reviewed_by = ?,
       reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(managerNotes || null, managerId, id);
  } else {
    return { ok: false, error: 'Invalid action.' };
  }

  return { ok: true, entry: getEntryById(id) };
}

function getWeekStart(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function groupEntriesBySite(entries) {
  const groups = new Map();

  entries.forEach((entry) => {
    const site = (entry.site || '').trim() || 'Unassigned';
    if (!groups.has(site)) {
      groups.set(site, {
        site,
        entries: [],
        total_hours: 0,
        entry_count: 0,
        employee_names: new Set(),
      });
    }
    const group = groups.get(site);
    group.entries.push(entry);
    group.total_hours = Math.round((group.total_hours + entry.total_hours) * 100) / 100;
    group.entry_count += 1;
    group.employee_names.add(entry.employee_name);
  });

  return Array.from(groups.values())
    .map((group) => ({
      site: group.site,
      entries: group.entries,
      total_hours: group.total_hours,
      entry_count: group.entry_count,
      employee_count: group.employee_names.size,
    }))
    .sort((a, b) => b.total_hours - a.total_hours || a.site.localeCompare(b.site));
}

function getWeeklyTotalsBySite(weekStart, status = 'approved') {
  const start = weekStart || getWeekStart();
  const endDate = new Date(start + 'T12:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const end = endDate.toISOString().split('T')[0];

  return db
    .prepare(
      `SELECT te.site,
              COUNT(te.id) as entry_count,
              ROUND(SUM(te.total_hours), 2) as total_hours,
              COUNT(DISTINCT te.user_id) as employee_count
       FROM time_entries te
       WHERE te.status = ?
         AND te.entry_date >= ?
         AND te.entry_date <= ?
       GROUP BY te.site
       ORDER BY total_hours DESC, te.site ASC`
    )
    .all(status, start, end);
}

function getWeeklyTotals(weekStart) {
  const start = weekStart || getWeekStart();
  const endDate = new Date(start + 'T12:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const end = endDate.toISOString().split('T')[0];

  return db
    .prepare(
      `SELECT u.id as user_id, u.name as employee_name,
              COUNT(te.id) as entry_count,
              ROUND(SUM(te.total_hours), 2) as total_hours
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.status = 'approved'
         AND te.entry_date >= ?
         AND te.entry_date <= ?
       GROUP BY u.id
       ORDER BY total_hours DESC`
    )
    .all(start, end)
    .map((row) => ({ ...row, week_start: start, week_end: end }));
}

function getEmployeeWeekTotal(userId, weekStart) {
  const start = weekStart || getWeekStart();
  const endDate = new Date(start + 'T12:00:00');
  endDate.setDate(endDate.getDate() + 6);
  const end = endDate.toISOString().split('T')[0];

  const row = db
    .prepare(
      `SELECT ROUND(COALESCE(SUM(total_hours), 0), 2) as total_hours,
              COUNT(*) as entry_count
       FROM time_entries
       WHERE user_id = ? AND status = 'approved'
         AND entry_date >= ? AND entry_date <= ?`
    )
    .get(userId, start, end);
  return { ...row, week_start: start, week_end: end };
}

module.exports = {
  US_STATES,
  DEFAULT_HOURS_TYPES,
  seedTimeSettings,
  getSites,
  saveSites,
  getHoursTypes,
  saveHoursTypes,
  saveTimeSettings,
  calculateHours,
  getFormReferencesForDay,
  parseEntryBody,
  validateEntry,
  getDraftEntries,
  getEntriesForUser,
  getEntryById,
  createDraftEntry,
  deleteDraftEntry,
  submitDraftEntries,
  getManagerEntries,
  getTimeCounts,
  reviewEntry,
  getWeekStart,
  groupEntriesBySite,
  getWeeklyTotalsBySite,
  getWeeklyTotals,
  getEmployeeWeekTotal,
};