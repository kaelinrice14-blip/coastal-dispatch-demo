const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const BIR_TEMPLATE = 'blade_inspection';
const FORM_NAME = 'Blade Inspection Report';
const uploadDir = path.join(__dirname, '..', 'uploads');

const BLADE_TYPE_OPTIONS = ['SST Structural', 'PPT Carbon Spar'];
const BLADE_DESIGNATION_OPTIONS = ['A', 'B', 'C', '1', '2', '3'];

const DEFAULT_CONFIG = {
  sites: ['Example Wind Farm A', 'Example Wind Farm B'],
  customers: ['Example Customer Corp'],
  wtg_platforms: ['V90', 'V100', 'GE 1.5'],
  blade_oems: ['LM Wind Power', 'Vestas', 'Siemens Gamesa'],
  blade_lengths: ['40m', '45m', '50m', '55m'],
  technicians: ['Technician A', 'Technician B', 'Technician C'],
  damage_locations: ['Leading Edge', 'Trailing Edge', 'Root', 'Tip', 'Mid-span'],
  damage_descriptions: ['Crack', 'Delamination', 'Lightning Strike', 'Erosion', 'Hole'],
};

function parseConfig(raw) {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return {
      sites: parsed.sites || [],
      customers: parsed.customers || [],
      wtg_platforms: parsed.wtg_platforms || [],
      blade_oems: parsed.blade_oems || [],
      blade_lengths: parsed.blade_lengths || [],
      technicians: parsed.technicians || [],
      damage_locations: parsed.damage_locations || [],
      damage_descriptions: parsed.damage_descriptions || [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getBladeInspectionForm() {
  return db
    .prepare('SELECT * FROM forms WHERE form_template = ? ORDER BY id DESC LIMIT 1')
    .get(BIR_TEMPLATE);
}

function isBladeInspectionForm(form) {
  return form && form.form_template === BIR_TEMPLATE;
}

function getBirConfig(formId) {
  const form = db.prepare('SELECT template_config FROM forms WHERE id = ?').get(formId);
  return parseConfig(form?.template_config);
}

function saveBirConfig(formId, config) {
  const cleaned = {
    sites: (config.sites || []).map((s) => s.trim()).filter(Boolean),
    customers: (config.customers || []).map((s) => s.trim()).filter(Boolean),
    wtg_platforms: (config.wtg_platforms || []).map((s) => s.trim()).filter(Boolean),
    blade_oems: (config.blade_oems || []).map((s) => s.trim()).filter(Boolean),
    blade_lengths: (config.blade_lengths || []).map((s) => s.trim()).filter(Boolean),
    technicians: (config.technicians || []).map((s) => s.trim()).filter(Boolean),
    damage_locations: (config.damage_locations || []).map((s) => s.trim()).filter(Boolean),
    damage_descriptions: (config.damage_descriptions || []).map((s) => s.trim()).filter(Boolean),
  };
  db.prepare(
    `UPDATE forms SET template_config = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(cleaned), formId);
  return cleaned;
}

function seedBladeInspectionForm() {
  const existing = getBladeInspectionForm();
  if (existing) {
    if (existing.name !== FORM_NAME) {
      db.prepare(`UPDATE forms SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(
        FORM_NAME,
        existing.id
      );
    }
    return { ...existing, name: FORM_NAME };
  }

  const manager = db.prepare("SELECT id FROM users WHERE role = 'manager' LIMIT 1").get();
  const managerId = manager ? manager.id : 1;

  const result = db.prepare(
    `INSERT INTO forms (name, description, customer_email_default, max_photos, created_by, form_template, template_config)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    FORM_NAME,
    'Blade inspection damage report for wind turbine blades.',
    null,
    50,
    managerId,
    BIR_TEMPLATE,
    JSON.stringify(DEFAULT_CONFIG)
  );

  const formId = result.lastInsertRowid;
  const insertField = db.prepare(
    `INSERT INTO form_fields (form_id, field_key, label, field_type, required, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const fields = [
    ['site', 'Site', 'dropdown', 1, 0],
    ['customer', 'Customer', 'dropdown', 1, 1],
    ['wtg_platform', 'WTG Platform', 'dropdown', 1, 2],
    ['wtg_local_id', 'WTG Local ID', 'text', 0, 3],
    ['blade_oem', 'Blade OEM', 'dropdown', 1, 4],
    ['blade_type', 'Blade Type', 'dropdown', 1, 5],
    ['blade_length', 'Blade Length', 'dropdown', 1, 6],
    ['blade_designation', 'Blade Designation', 'dropdown', 1, 7],
    ['blade_serial_number', 'Blade Serial Number', 'text', 0, 8],
    ['damage_id', 'Damage ID', 'text', 0, 9],
    ['technicians', 'Coastal Composite Technicians', 'textarea', 1, 10],
    ['inspection_date', 'Inspection Date', 'text', 1, 11],
    ['report_date', 'Report Date', 'text', 1, 12],
    ['damage_location_radius', 'Damage Location Radius', 'text', 0, 13],
    ['damage_location', 'Damage Location', 'dropdown', 1, 14],
    ['damage_description', 'Damage Description', 'dropdown', 1, 15],
    ['damage_pictures', 'Damage Pictures', 'photo', 0, 16],
  ];

  fields.forEach(([key, label, type, required, order]) => {
    insertField.run(formId, key, label, type, required, order);
  });

  return db.prepare('SELECT * FROM forms WHERE id = ?').get(formId);
}

function emptyBirData() {
  return {
    site: '',
    customer: '',
    wtg_platform: '',
    wtg_local_id: '',
    blade_oem: '',
    blade_type: '',
    blade_length: '',
    blade_designation: '',
    blade_serial_number: '',
    damage_id: '',
    technicians: ['', ''],
    inspection_date: '',
    report_date: '',
    damage_location_radius: '',
    damage_location: '',
    damage_description: '',
  };
}

function parseTechnicians(body) {
  const technicians = [];
  const indices = new Set();
  Object.keys(body).forEach((key) => {
    const match = key.match(/^technician_(\d+)$/);
    if (match) indices.add(parseInt(match[1], 10));
  });
  [...indices].sort((a, b) => a - b).forEach((i) => {
    const val = (body[`technician_${i}`] || '').trim();
    if (val) technicians.push(val);
  });
  return technicians;
}

function parseBirBody(body) {
  return {
    site: (body.site || '').trim(),
    customer: (body.customer || '').trim(),
    wtg_platform: (body.wtg_platform || '').trim(),
    wtg_local_id: (body.wtg_local_id || '').trim(),
    blade_oem: (body.blade_oem || '').trim(),
    blade_type: (body.blade_type || '').trim(),
    blade_length: (body.blade_length || '').trim(),
    blade_designation: (body.blade_designation || '').trim(),
    blade_serial_number: (body.blade_serial_number || '').trim(),
    damage_id: (body.damage_id || '').trim(),
    technicians: parseTechnicians(body),
    inspection_date: (body.inspection_date || '').trim(),
    report_date: (body.report_date || '').trim(),
    damage_location_radius: (body.damage_location_radius || '').trim(),
    damage_location: (body.damage_location || '').trim(),
    damage_description: (body.damage_description || '').trim(),
  };
}

function validateBirData(data) {
  const errors = [];
  if (!data.site) errors.push('Site is required.');
  if (!data.customer) errors.push('Customer is required.');
  if (!data.wtg_platform) errors.push('WTG Platform is required.');
  if (!data.blade_oem) errors.push('Blade OEM is required.');
  if (!data.blade_type) errors.push('Blade Type is required.');
  if (!BLADE_TYPE_OPTIONS.includes(data.blade_type)) errors.push('Invalid Blade Type selected.');
  if (!data.blade_length) errors.push('Blade Length is required.');
  if (!data.blade_designation) errors.push('Blade Designation is required.');
  if (!BLADE_DESIGNATION_OPTIONS.includes(data.blade_designation)) {
    errors.push('Invalid Blade Designation selected.');
  }
  if (data.technicians.length === 0) {
    errors.push('At least one Coastal Composite Technician is required.');
  }
  if (!data.inspection_date) errors.push('Inspection Date is required.');
  if (!data.report_date) errors.push('Report Date is required.');
  if (!data.damage_location) errors.push('Damage Location is required.');
  if (!data.damage_description) errors.push('Damage Description is required.');
  return errors;
}

function getBirFieldMap(formId) {
  const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ?').all(formId);
  return Object.fromEntries(fields.map((f) => [f.field_key, f]));
}

function saveBirSubmission(submissionId, formId, data) {
  const fieldMap = getBirFieldMap(formId);
  const upsert = db.prepare(
    `INSERT INTO submission_values (submission_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(submission_id, field_id) DO UPDATE SET value = excluded.value`
  );

  const scalars = {
    site: data.site,
    customer: data.customer,
    wtg_platform: data.wtg_platform,
    wtg_local_id: data.wtg_local_id,
    blade_oem: data.blade_oem,
    blade_type: data.blade_type,
    blade_length: data.blade_length,
    blade_designation: data.blade_designation,
    blade_serial_number: data.blade_serial_number,
    damage_id: data.damage_id,
    technicians: JSON.stringify(data.technicians),
    inspection_date: data.inspection_date,
    report_date: data.report_date,
    damage_location_radius: data.damage_location_radius,
    damage_location: data.damage_location,
    damage_description: data.damage_description,
  };

  Object.entries(scalars).forEach(([key, val]) => {
    if (fieldMap[key]) upsert.run(submissionId, fieldMap[key].id, val);
  });
}

function parsePhotoIndex(fieldname) {
  const match = fieldname.match(/^damage_photo_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function saveBirPhotos(submissionId, formId, files, body) {
  const fieldMap = getBirFieldMap(formId);
  if (!fieldMap.damage_pictures || !files || !files.length) return;

  const insert = db.prepare(
    'INSERT INTO submission_photos (submission_id, field_id, filename, original_name, description) VALUES (?, ?, ?, ?, ?)'
  );

  files
    .filter((f) => parsePhotoIndex(f.fieldname) !== null)
    .sort((a, b) => parsePhotoIndex(a.fieldname) - parsePhotoIndex(b.fieldname))
    .forEach((file) => {
      const idx = parsePhotoIndex(file.fieldname);
      const desc = (body[`damage_photo_desc_${idx}`] || '').trim();
      insert.run(
        submissionId,
        fieldMap.damage_pictures.id,
        file.filename,
        file.originalname,
        desc || null
      );
    });
}

function updateBirPhotoDescriptions(submissionId, body) {
  const update = db.prepare(
    'UPDATE submission_photos SET description = ? WHERE id = ? AND submission_id = ?'
  );
  Object.keys(body).forEach((key) => {
    const match = key.match(/^damage_photo_desc_existing_(\d+)$/);
    if (match) {
      const photoId = parseInt(match[1], 10);
      update.run((body[key] || '').trim() || null, photoId, submissionId);
    }
  });
}

function processBirPhotoRemovals(submissionId, body) {
  Object.keys(body).forEach((key) => {
    const match = key.match(/^remove_damage_photo_(\d+)$/);
    if (match && body[key] === '1') {
      deleteBirPhoto(submissionId, parseInt(match[1], 10));
    }
  });
}

function deleteBirPhoto(submissionId, photoId) {
  const photo = db
    .prepare('SELECT * FROM submission_photos WHERE id = ? AND submission_id = ?')
    .get(photoId, submissionId);
  if (photo) {
    const filePath = path.join(uploadDir, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM submission_photos WHERE id = ?').run(photoId);
  }
}

function loadBirSubmissionData(submissionId, formId) {
  const data = emptyBirData();
  const rows = db
    .prepare(
      `SELECT ff.field_key, sv.value
       FROM submission_values sv
       JOIN form_fields ff ON sv.field_id = ff.id
       WHERE sv.submission_id = ?`
    )
    .all(submissionId);

  rows.forEach((row) => {
    if (row.field_key === 'technicians') {
      try {
        const parsed = JSON.parse(row.value);
        data.technicians = Array.isArray(parsed) && parsed.length > 0 ? parsed : ['', ''];
      } catch (_e) {
        data.technicians = ['', ''];
      }
    } else if (Object.prototype.hasOwnProperty.call(data, row.field_key)) {
      data[row.field_key] = row.value || '';
    }
  });

  if (data.technicians.length < 2) {
    while (data.technicians.length < 2) data.technicians.push('');
  }

  return data;
}

function getBirPhotos(submissionId) {
  return db
    .prepare(
      `SELECT sp.*
       FROM submission_photos sp
       JOIN form_fields ff ON sp.field_id = ff.id
       WHERE sp.submission_id = ? AND ff.field_key = 'damage_pictures'
       ORDER BY sp.id`
    )
    .all(submissionId);
}

function getBirSummary(submissionId) {
  const submission = db.prepare('SELECT form_id FROM submissions WHERE id = ?').get(submissionId);
  const data = loadBirSubmissionData(submissionId, submission.form_id);
  return {
    title: data.site || data.customer || FORM_NAME,
    subtitle: data.inspection_date || data.damage_id || null,
  };
}

function configFromFormBody(body) {
  const parseList = (key) => {
    const raw = body[key];
    if (typeof raw === 'string') return raw.split('\n').map((s) => s.trim()).filter(Boolean);
    return [];
  };
  return {
    sites: parseList('sites'),
    customers: parseList('customers'),
    wtg_platforms: parseList('wtg_platforms'),
    blade_oems: parseList('blade_oems'),
    blade_lengths: parseList('blade_lengths'),
    technicians: parseList('technicians'),
    damage_locations: parseList('damage_locations'),
    damage_descriptions: parseList('damage_descriptions'),
  };
}

module.exports = {
  FORM_NAME,
  BIR_TEMPLATE,
  BLADE_TYPE_OPTIONS,
  BLADE_DESIGNATION_OPTIONS,
  DEFAULT_CONFIG,
  getBladeInspectionForm,
  isBladeInspectionForm,
  getBirConfig,
  saveBirConfig,
  seedBladeInspectionForm,
  emptyBirData,
  parseBirBody,
  validateBirData,
  saveBirSubmission,
  saveBirPhotos,
  updateBirPhotoDescriptions,
  processBirPhotoRemovals,
  deleteBirPhoto,
  loadBirSubmissionData,
  getBirPhotos,
  getBirSummary,
  configFromFormBody,
};