const db = require('../db/database');

const JSA_TEMPLATE = 'jsa';

const DEFAULT_CONFIG = {
  job_sites: ['Example Wind Farm A', 'Example Wind Farm B'],
  customers: ['Example Customer Corp'],
  potential_hazards: [
    'Working at height',
    'Electrical hazard',
    'Weather / wind',
    'Manual handling',
    'Vehicle movement',
  ],
  hazard_control_measures: [
    'Use fall protection equipment',
    'Lock-out / tag-out procedures',
    'Monitor weather conditions',
    'Team lift / mechanical aids',
    'Establish exclusion zone',
  ],
};

const JSA_FIELDS = [
  { field_key: 'job_site', label: 'Job Site / Wind Farm', field_type: 'dropdown', required: 1, section: 'general' },
  { field_key: 'date_time', label: 'Date and Time', field_type: 'datetime', required: 1, section: 'general' },
  { field_key: 'customer', label: 'Customer', field_type: 'dropdown', required: 1, section: 'general' },
  { field_key: 'tower_number', label: 'Tower Number', field_type: 'text', required: 0, section: 'general' },
  { field_key: 'site_contact', label: 'Site Contact', field_type: 'text', required: 0, section: 'general' },
  { field_key: 'site_contact_phone', label: 'Site Contact Phone Number', field_type: 'text', required: 0, section: 'general' },
  { field_key: 'wind_weather_forecast', label: 'Wind/Weather Forecast', field_type: 'text', required: 0, section: 'general' },
  { field_key: 'work_scope', label: 'Work Scope', field_type: 'textarea', required: 1, section: 'general' },
  { field_key: 'hazards', label: 'Hazards', field_type: 'hazards', required: 1, section: 'hazards' },
];

function parseConfig(raw) {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return {
      job_sites: parsed.job_sites || [],
      customers: parsed.customers || [],
      potential_hazards: parsed.potential_hazards || [],
      hazard_control_measures: parsed.hazard_control_measures || [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getJsaForm() {
  return db
    .prepare("SELECT * FROM forms WHERE form_template = ? ORDER BY id DESC LIMIT 1")
    .get(JSA_TEMPLATE);
}

function getJsaConfig(formId) {
  const form = db.prepare('SELECT template_config FROM forms WHERE id = ?').get(formId);
  return parseConfig(form?.template_config);
}

function saveJsaConfig(formId, config) {
  const cleaned = {
    job_sites: (config.job_sites || []).map((s) => s.trim()).filter(Boolean),
    customers: (config.customers || []).map((s) => s.trim()).filter(Boolean),
    potential_hazards: (config.potential_hazards || []).map((s) => s.trim()).filter(Boolean),
    hazard_control_measures: (config.hazard_control_measures || []).map((s) => s.trim()).filter(Boolean),
  };
  db.prepare(
    `UPDATE forms SET template_config = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(cleaned), formId);
  return cleaned;
}

function isJsaForm(form) {
  return form && form.form_template === JSA_TEMPLATE;
}

function seedJsaForm() {
  const existing = getJsaForm();
  if (existing) return existing;

  const manager = db.prepare("SELECT id FROM users WHERE role = 'manager' LIMIT 1").get();
  const managerId = manager ? manager.id : 1;

  const result = db.prepare(
    `INSERT INTO forms (name, description, customer_email_default, max_photos, created_by, form_template, template_config)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'JSA',
    'Job Safety Analysis form for wind farm and tower work.',
    null,
    0,
    managerId,
    JSA_TEMPLATE,
    JSON.stringify(DEFAULT_CONFIG)
  );

  const formId = result.lastInsertRowid;
  const insertField = db.prepare(
    `INSERT INTO form_fields (form_id, field_key, label, field_type, options_json, required, sort_order, placeholder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  JSA_FIELDS.forEach((f, i) => {
    const dbType =
      f.field_type === 'hazards' ? 'textarea'
      : f.field_type === 'datetime' ? 'text'
      : f.field_type;
    insertField.run(formId, f.field_key, f.label, dbType, null, f.required, i, null);
  });

  return db.prepare('SELECT * FROM forms WHERE id = ?').get(formId);
}

function parseHazards(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsaBody(body) {
  const hazards = [];
  const indices = new Set();
  Object.keys(body).forEach((key) => {
    const match = key.match(/^hazard_potential_(\d+)$/);
    if (match) indices.add(parseInt(match[1], 10));
  });

  [...indices].sort((a, b) => a - b).forEach((i) => {
    const potential = body[`hazard_potential_${i}`];
    const control = body[`hazard_control_${i}`];
    if (potential || control) {
      hazards.push({
        potential_hazard: potential || '',
        control_measure: control || '',
      });
    }
  });

  return {
    job_site: (body.job_site || '').trim(),
    date_time: (body.date_time || '').trim(),
    customer: (body.customer || '').trim(),
    tower_number: (body.tower_number || '').trim(),
    site_contact: (body.site_contact || '').trim(),
    site_contact_phone: (body.site_contact_phone || '').trim(),
    wind_weather_forecast: (body.wind_weather_forecast || '').trim(),
    work_scope: (body.work_scope || '').trim(),
    hazards,
  };
}

function validateJsaData(data) {
  const errors = [];
  if (!data.job_site) errors.push('Job Site / Wind Farm is required.');
  if (!data.date_time) errors.push('Date and Time is required.');
  if (!data.customer) errors.push('Customer is required.');
  if (!data.work_scope) errors.push('Work Scope is required.');
  if (data.hazards.length === 0) {
    errors.push('Add at least one hazard row.');
  } else {
    data.hazards.forEach((h, i) => {
      if (!h.potential_hazard) errors.push(`Hazard row ${i + 1}: Potential Hazard is required.`);
      if (!h.control_measure) errors.push(`Hazard row ${i + 1}: Hazard Control Measure is required.`);
    });
  }
  return errors;
}

function getJsaFieldMap(formId) {
  const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ?').all(formId);
  return Object.fromEntries(fields.map((f) => [f.field_key, f.id]));
}

function saveJsaSubmission(submissionId, formId, data) {
  const fieldMap = getJsaFieldMap(formId);
  const upsert = db.prepare(
    `INSERT INTO submission_values (submission_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(submission_id, field_id) DO UPDATE SET value = excluded.value`
  );

  const scalarFields = [
    'job_site', 'date_time', 'customer', 'tower_number',
    'site_contact', 'site_contact_phone', 'wind_weather_forecast', 'work_scope',
  ];

  scalarFields.forEach((key) => {
    if (fieldMap[key]) {
      upsert.run(submissionId, fieldMap[key], data[key] || '');
    }
  });

  if (fieldMap.hazards) {
    upsert.run(submissionId, fieldMap.hazards, JSON.stringify(data.hazards));
  }
}

function loadJsaSubmissionData(submissionId, formId) {
  const fieldMap = getJsaFieldMap(formId);
  const values = db
    .prepare(
      `SELECT ff.field_key, sv.value
       FROM submission_values sv
       JOIN form_fields ff ON sv.field_id = ff.id
       WHERE sv.submission_id = ?`
    )
    .all(submissionId);

  const data = {
    job_site: '',
    date_time: '',
    customer: '',
    tower_number: '',
    site_contact: '',
    site_contact_phone: '',
    wind_weather_forecast: '',
    work_scope: '',
    hazards: [{ potential_hazard: '', control_measure: '' }],
  };

  values.forEach((row) => {
    if (row.field_key === 'hazards') {
      const parsed = parseHazards(row.value);
      data.hazards = parsed.length > 0 ? parsed : data.hazards;
    } else if (row.field_key === 'date_time') {
      data.date_time = (row.value || '').replace(' ', 'T').slice(0, 16);
    } else if (Object.prototype.hasOwnProperty.call(data, row.field_key)) {
      data[row.field_key] = row.value || '';
    }
  });

  return data;
}

function getJsaSummary(submissionId) {
  const data = loadJsaSubmissionData(
    submissionId,
    db.prepare('SELECT form_id FROM submissions WHERE id = ?').get(submissionId).form_id
  );
  return {
    title: data.job_site || data.customer || 'JSA',
    subtitle: data.date_time || null,
  };
}

function configFromFormBody(body) {
  const listKeys = ['job_sites', 'customers', 'potential_hazards', 'hazard_control_measures'];
  const config = {};
  listKeys.forEach((key) => {
    const raw = body[key];
    if (Array.isArray(raw)) {
      config[key] = raw.map((s) => s.trim()).filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim()) {
      config[key] = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    } else {
      config[key] = [];
    }
  });
  return config;
}

module.exports = {
  JSA_TEMPLATE,
  JSA_FIELDS,
  DEFAULT_CONFIG,
  getJsaForm,
  getJsaConfig,
  saveJsaConfig,
  isJsaForm,
  seedJsaForm,
  parseHazards,
  parseJsaBody,
  validateJsaData,
  saveJsaSubmission,
  loadJsaSubmissionData,
  getJsaSummary,
  configFromFormBody,
};