const db = require('../db/database');

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long Description' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'photo', label: 'Photo Upload' },
  { value: 'job_details', label: 'Job Details' },
  { value: 'site_contacts', label: 'Site Contacts' },
  { value: 'customer_name', label: 'Customer Name' },
];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'field';
}

function getActiveForms() {
  return db
    .prepare(
      `SELECT f.*, u.name as created_by_name,
              (SELECT COUNT(*) FROM form_fields WHERE form_id = f.id) as field_count
       FROM forms f
       JOIN users u ON f.created_by = u.id
       WHERE f.is_active = 1
       ORDER BY f.name`
    )
    .all();
}

function getAllForms() {
  return db
    .prepare(
      `SELECT f.*, u.name as created_by_name,
              (SELECT COUNT(*) FROM form_fields WHERE form_id = f.id) as field_count,
              (SELECT COUNT(*) FROM submissions WHERE form_id = f.id) as submission_count
       FROM forms f
       JOIN users u ON f.created_by = u.id
       ORDER BY f.updated_at DESC`
    )
    .all();
}

function getFormById(id) {
  return db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
}

function getFormFields(formId) {
  return db
    .prepare('SELECT * FROM form_fields WHERE form_id = ? ORDER BY sort_order, id')
    .all(formId);
}

function getFormWithFields(formId) {
  const form = getFormById(formId);
  if (!form) return null;
  return { ...form, fields: getFormFields(formId) };
}

function parseFieldOptions(field) {
  if (!field.options_json) return [];
  try {
    const parsed = JSON.parse(field.options_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return field.options_json.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function getSubmissionsForUser(formId, userId) {
  return db
    .prepare(
      `SELECT s.*, u.name as reviewer_name
       FROM submissions s
       LEFT JOIN users u ON s.reviewed_by = u.id
       WHERE s.form_id = ? AND s.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(formId, userId);
}

function getSubmissionById(id) {
  return db
    .prepare(
      `SELECT s.*, f.name as form_name, f.form_template, f.max_photos, u.name as employee_name, u.email as employee_email,
              rev.name as reviewer_name
       FROM submissions s
       JOIN forms f ON s.form_id = f.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN users rev ON s.reviewed_by = rev.id
       WHERE s.id = ?`
    )
    .get(id);
}

function getSubmissionValues(submissionId) {
  const rows = db
    .prepare(
      `SELECT sv.*, ff.field_key, ff.label, ff.field_type, ff.options_json
       FROM submission_values sv
       JOIN form_fields ff ON sv.field_id = ff.id
       WHERE sv.submission_id = ?
       ORDER BY ff.sort_order, ff.id`
    )
    .all(submissionId);

  return rows.map((row) => ({
    ...row,
    options: parseFieldOptions(row),
  }));
}

function getSubmissionPhotos(submissionId) {
  return db
    .prepare(
      `SELECT sp.*, ff.label, ff.field_key
       FROM submission_photos sp
       JOIN form_fields ff ON sp.field_id = ff.id
       WHERE sp.submission_id = ?
       ORDER BY sp.created_at`
    )
    .all(submissionId);
}

function getSubmissionDisplay(submissionId) {
  const submission = getSubmissionById(submissionId);
  if (!submission) return null;
  return {
    submission,
    values: getSubmissionValues(submissionId),
    photos: getSubmissionPhotos(submissionId),
    fields: getFormFields(submission.form_id),
  };
}

function getSummaryValue(submissionId) {
  const submission = getSubmissionById(submissionId);
  if (submission?.form_template === 'jsa') {
    const { getJsaSummary } = require('./jsa');
    return getJsaSummary(submissionId);
  }
  if (submission?.form_template === 'daily_inspection') {
    const { getDiSummary } = require('./daily-inspection');
    return getDiSummary(submissionId);
  }
  if (submission?.form_template === 'blade_inspection') {
    const { getBirSummary } = require('./blade-inspection');
    return getBirSummary(submissionId);
  }
  if (submission?.form_template === 'blade_repair') {
    const { getBrrSummary } = require('./blade-repair');
    return getBrrSummary(submissionId);
  }
  const values = getSubmissionValues(submissionId);
  const customer = values.find((v) => v.field_type === 'customer_name');
  const project = values.find((v) => v.field_key === 'project_name');
  const date = values.find((v) => v.field_key === 'report_date');
  return {
    title: customer?.value || project?.value || 'Submission',
    subtitle: date?.value || null,
  };
}

function saveFormFields(formId, fieldsInput) {
  db.prepare('DELETE FROM form_fields WHERE form_id = ?').run(formId);

  const insert = db.prepare(
    `INSERT INTO form_fields (form_id, field_key, label, field_type, options_json, required, sort_order, placeholder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const usedKeys = new Set();
  fieldsInput.forEach((field, index) => {
    let key = field.field_key || slugify(field.label);
    while (usedKeys.has(key)) {
      key = `${key}_${index}`;
    }
    usedKeys.add(key);

    const options = field.field_type === 'dropdown' && field.options
      ? JSON.stringify(
          field.options.split(',').map((s) => s.trim()).filter(Boolean)
        )
      : null;

    insert.run(
      formId,
      key,
      field.label,
      field.field_type,
      options,
      field.required ? 1 : 0,
      index,
      field.placeholder || null
    );
  });
}

function validateSubmission(form, fields, body, files, existingPhotoCount = 0) {
  const errors = [];
  const values = {};
  let newPhotoCount = 0;

  fields.forEach((field) => {
    if (field.field_type === 'photo') {
      const uploaded = (files && files[field.field_key]) || [];
      newPhotoCount += uploaded.length;
      return;
    }

    const val = body[field.field_key];
    if (field.required && (!val || String(val).trim() === '')) {
      errors.push(`${field.label} is required.`);
    } else if (val != null && val !== '') {
      values[field.field_key] = String(val).trim();
    }
  });

  const totalPhotos = existingPhotoCount + newPhotoCount;
  if (totalPhotos > form.max_photos) {
    errors.push(`This form allows a maximum of ${form.max_photos} photo(s). You have ${totalPhotos}.`);
  }

  return { errors, values, newPhotoCount };
}

function saveSubmissionValues(submissionId, formId, values, fields) {
  const fieldMap = Object.fromEntries(fields.map((f) => [f.field_key, f.id]));
  const upsert = db.prepare(
    `INSERT INTO submission_values (submission_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(submission_id, field_id) DO UPDATE SET value = excluded.value`
  );

  Object.entries(values).forEach(([key, val]) => {
    const fieldId = fieldMap[key];
    if (fieldId) upsert.run(submissionId, fieldId, val);
  });
}

function saveSubmissionPhotos(submissionId, fields, files) {
  const insert = db.prepare(
    'INSERT INTO submission_photos (submission_id, field_id, filename, original_name) VALUES (?, ?, ?, ?)'
  );

  fields
    .filter((f) => f.field_type === 'photo')
    .forEach((field) => {
      const uploaded = (files && files[field.field_key]) || [];
      uploaded.forEach((file) => {
        insert.run(submissionId, field.id, file.filename, file.originalname);
      });
    });
}

function deleteSubmissionPhotos(submissionId, photoIds) {
  if (!photoIds || photoIds.length === 0) return;
  const placeholders = photoIds.map(() => '?').join(',');
  db.prepare(
    `DELETE FROM submission_photos WHERE submission_id = ? AND id IN (${placeholders})`
  ).run(submissionId, ...photoIds);
}

function getAllSubmissions(filter = 'pending') {
  let query = `
    SELECT s.*, f.name as form_name, u.name as employee_name, rev.name as reviewer_name
    FROM submissions s
    JOIN forms f ON s.form_id = f.id
    JOIN users u ON s.user_id = u.id
    LEFT JOIN users rev ON s.reviewed_by = rev.id
  `;
  if (filter !== 'all') {
    query += ' WHERE s.status = ?';
  }
  query += ' ORDER BY s.created_at DESC';
  return filter !== 'all'
    ? db.prepare(query).all(filter)
    : db.prepare(query).all();
}

function getSubmissionCounts() {
  return db
    .prepare('SELECT status, COUNT(*) as count FROM submissions GROUP BY status')
    .all()
    .reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});
}

module.exports = {
  FIELD_TYPES,
  slugify,
  getActiveForms,
  getAllForms,
  getFormById,
  getFormFields,
  getFormWithFields,
  parseFieldOptions,
  getSubmissionsForUser,
  getSubmissionById,
  getSubmissionValues,
  getSubmissionPhotos,
  getSubmissionDisplay,
  getSummaryValue,
  saveFormFields,
  validateSubmission,
  saveSubmissionValues,
  saveSubmissionPhotos,
  deleteSubmissionPhotos,
  getAllSubmissions,
  getSubmissionCounts,
};