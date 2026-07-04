const db = require('../db/database');

const ALLOWED_TEMPLATES = ['jsa', 'daily_inspection', 'blade_inspection', 'blade_repair'];

function deleteForm(id) {
  const subs = db.prepare('SELECT id FROM submissions WHERE form_id = ?').all(id);
  subs.forEach((s) => {
    db.prepare('DELETE FROM submission_values WHERE submission_id = ?').run(s.id);
    db.prepare('DELETE FROM submission_photos WHERE submission_id = ?').run(s.id);
  });
  db.prepare('DELETE FROM submissions WHERE form_id = ?').run(id);
  db.prepare('DELETE FROM form_fields WHERE form_id = ?').run(id);
  db.prepare('DELETE FROM forms WHERE id = ?').run(id);
}

function cleanupOrphanForms() {
  const keepIds = new Set();

  ALLOWED_TEMPLATES.forEach((template) => {
    const form = db
      .prepare('SELECT id FROM forms WHERE form_template = ? ORDER BY id DESC LIMIT 1')
      .get(template);
    if (form) keepIds.add(form.id);
  });

  const allForms = db.prepare('SELECT id, form_template FROM forms').all();
  allForms.forEach((f) => {
    if (!keepIds.has(f.id) || !ALLOWED_TEMPLATES.includes(f.form_template)) {
      deleteForm(f.id);
    }
  });
}

module.exports = { cleanupOrphanForms, ALLOWED_TEMPLATES };