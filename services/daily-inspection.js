const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const DI_TEMPLATE = 'daily_inspection';
const uploadDir = path.join(__dirname, '..', 'uploads');

const DEFAULT_CONFIG = {
  sites: ['Example Wind Farm A', 'Example Wind Farm B'],
  lift_types: ['Crane', 'Aerial Lift', 'Hoist', 'Telehandler'],
};

const LIFT_INSPECTION_QUESTIONS = [
  { key: 'engine_bay_no_leaks', label: 'Engine bay has no leaks' },
  { key: 'coolant_level', label: 'Coolant level high enough' },
  { key: 'oil_level', label: 'Oil level high enough' },
  { key: 'fuel_level', label: 'Fuel level above 1/4' },
  { key: 'def_level', label: 'DEF level above 1/4' },
  { key: 'temp_pressure_gauges', label: 'Temp and pressure gauges okay' },
  { key: 'hydraulic_fluid_level', label: 'Check hydraulic fluid level (Aerial and outriggers must be stowed)' },
  { key: 'no_rodent_damage', label: 'Verified there is no new damage due to rodents or pests' },
  { key: 'engine_bay_wiring', label: 'Check engine bay wiring & hydraulics' },
  { key: 'no_warning_lights', label: 'No warning lights' },
  { key: 'no_chassis_leaks', label: 'No leaks under the chassis' },
  { key: 'walk_around_360', label: 'Completed 360 walk around' },
  { key: 'ground_conditions', label: 'Are the ground conditions good?' },
  { key: 'pre_flight', label: 'Pre-flight has been conducted?' },
  { key: 'emergency_stop_buttons', label: 'All emergency stop buttons in working condition?' },
  { key: 'emergency_battery_pump', label: 'Emergency battery pump still working?' },
];

const SHUTDOWN_CHECKLIST = [
  { key: 'anemometer_stowed', label: 'Anemometer stowed before cradling' },
  { key: 'cradle_unit', label: 'Cradle the unit' },
  { key: 'outriggers_stowed', label: 'Outriggers stowed' },
  { key: 'control_box_closed', label: 'Control box is closed and secured' },
  { key: 'parking_brake_applied', label: 'Parking brake applied' },
  { key: 'battery_disconnect_off', label: 'Battery disconnect position off' },
  { key: 'unit_locked', label: 'Unit locked' },
  { key: 'keys_put_away', label: 'Keys put away' },
];

const ACKNOWLEDGEMENT_TEXT =
  'I certify the inspection was performed to the best of my abilities. Any/all failed items have been documented with pictures and reported to the safety department before proceeding to the next task.';

function parseConfig(raw) {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return {
      sites: parsed.sites || [],
      lift_types: parsed.lift_types || [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function getDailyInspectionForm() {
  return db
    .prepare("SELECT * FROM forms WHERE form_template = ? ORDER BY id DESC LIMIT 1")
    .get(DI_TEMPLATE);
}

function isDailyInspectionForm(form) {
  return form && form.form_template === DI_TEMPLATE;
}

function getDiConfig(formId) {
  const form = db.prepare('SELECT template_config FROM forms WHERE id = ?').get(formId);
  return parseConfig(form?.template_config);
}

function saveDiConfig(formId, config) {
  const cleaned = {
    sites: (config.sites || []).map((s) => s.trim()).filter(Boolean),
    lift_types: (config.lift_types || []).map((s) => s.trim()).filter(Boolean),
  };
  db.prepare(
    `UPDATE forms SET template_config = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(cleaned), formId);
  return cleaned;
}

const FORM_NAME = 'Daily Aerial Inspection';

function seedDailyInspectionForm() {
  const existing = getDailyInspectionForm();
  if (existing) {
    if (existing.name !== FORM_NAME) {
      db.prepare(
        `UPDATE forms SET name = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(FORM_NAME, existing.id);
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
    'Daily aerial lift inspection checklist.',
    null,
    2,
    managerId,
    DI_TEMPLATE,
    JSON.stringify(DEFAULT_CONFIG)
  );

  const formId = result.lastInsertRowid;
  const insertField = db.prepare(
    `INSERT INTO form_fields (form_id, field_key, label, field_type, required, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const fields = [
    ['inspector_name', "Inspector's Name", 'text', 1, 0],
    ['inspection_datetime', 'Date/Time of Inspection', 'text', 1, 1],
    ['site', 'Site', 'dropdown', 1, 2],
    ['tower_number', 'Tower Number', 'text', 0, 3],
    ['lift_type', 'Type of Lift', 'dropdown', 1, 4],
    ['lift_inspection', 'Lift Inspection', 'textarea', 1, 5],
    ['driver_side_photo', 'Driver Side Setup', 'photo', 0, 6],
    ['passenger_side_photo', 'Passenger Side Setup', 'photo', 0, 7],
    ['shutdown_checklist', 'Shutdown Checklist', 'textarea', 1, 8],
    ['signature', 'Signature', 'textarea', 1, 9],
  ];

  fields.forEach(([key, label, type, required, order]) => {
    insertField.run(formId, key, label, type, required, order);
  });

  return db.prepare('SELECT * FROM forms WHERE id = ?').get(formId);
}

function emptyDiData() {
  const liftInspection = {};
  LIFT_INSPECTION_QUESTIONS.forEach((q) => { liftInspection[q.key] = ''; });

  const shutdownChecklist = {};
  SHUTDOWN_CHECKLIST.forEach((item) => { shutdownChecklist[item.key] = false; });

  return {
    inspector_name: '',
    inspection_datetime: '',
    site: '',
    tower_number: '',
    lift_type: '',
    lift_inspection: liftInspection,
    shutdown_checklist: shutdownChecklist,
    signature: '',
  };
}

function parseDiBody(body) {
  const liftInspection = {};
  LIFT_INSPECTION_QUESTIONS.forEach((q) => {
    liftInspection[q.key] = body[`lift_${q.key}`] || '';
  });

  const shutdownChecklist = {};
  SHUTDOWN_CHECKLIST.forEach((item) => {
    shutdownChecklist[item.key] = body[`shutdown_${item.key}`] === '1' || body[`shutdown_${item.key}`] === 'on';
  });

  return {
    inspector_name: (body.inspector_name || '').trim(),
    inspection_datetime: (body.inspection_datetime || '').trim(),
    site: (body.site || '').trim(),
    tower_number: (body.tower_number || '').trim(),
    lift_type: (body.lift_type || '').trim(),
    lift_inspection: liftInspection,
    shutdown_checklist: shutdownChecklist,
    signature: body.signature || '',
  };
}

function validateDiPhotos(files, existingPhotos, body) {
  const errors = [];
  const keepDriver = existingPhotos.driver && body.remove_driver_photo !== '1';
  const keepPassenger = existingPhotos.passenger && body.remove_passenger_photo !== '1';

  if (!keepDriver && !(files && files.driver_side_photo && files.driver_side_photo[0])) {
    errors.push('Driver Side Setup photo is required.');
  }
  if (!keepPassenger && !(files && files.passenger_side_photo && files.passenger_side_photo[0])) {
    errors.push('Passenger Side Setup photo is required.');
  }
  return errors;
}

function validateDiData(data) {
  const errors = [];
  if (!data.inspector_name) errors.push("Inspector's Name is required.");
  if (!data.inspection_datetime) errors.push('Date/Time of Inspection is required.');
  if (!data.site) errors.push('Site is required.');
  if (!data.lift_type) errors.push('Type of Lift is required.');

  LIFT_INSPECTION_QUESTIONS.forEach((q) => {
    const val = data.lift_inspection[q.key];
    if (!val || !['yes', 'no'].includes(val)) {
      errors.push(`"${q.label}" requires a Yes or No answer.`);
    }
  });

  SHUTDOWN_CHECKLIST.forEach((item) => {
    if (!data.shutdown_checklist[item.key]) {
      errors.push(`Shutdown item "${item.label}" must be checked.`);
    }
  });

  if (!data.signature || data.signature.length < 100) {
    errors.push('Signature is required. Please sign in the signature pad.');
  }

  return errors;
}

function getDiFieldMap(formId) {
  const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ?').all(formId);
  return Object.fromEntries(fields.map((f) => [f.field_key, f]));
}

function saveDiSubmission(submissionId, formId, data) {
  const fieldMap = getDiFieldMap(formId);
  const upsert = db.prepare(
    `INSERT INTO submission_values (submission_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(submission_id, field_id) DO UPDATE SET value = excluded.value`
  );

  const scalars = {
    inspector_name: data.inspector_name,
    inspection_datetime: data.inspection_datetime,
    site: data.site,
    tower_number: data.tower_number,
    lift_type: data.lift_type,
    lift_inspection: JSON.stringify(data.lift_inspection),
    shutdown_checklist: JSON.stringify(data.shutdown_checklist),
    signature: data.signature,
  };

  Object.entries(scalars).forEach(([key, val]) => {
    if (fieldMap[key]) upsert.run(submissionId, fieldMap[key].id, val);
  });
}

function saveDiPhotos(submissionId, formId, files) {
  const fieldMap = getDiFieldMap(formId);
  const insert = db.prepare(
    'INSERT INTO submission_photos (submission_id, field_id, filename, original_name) VALUES (?, ?, ?, ?)'
  );

  ['driver_side_photo', 'passenger_side_photo'].forEach((key) => {
    const file = files && files[key] && files[key][0];
    if (file && fieldMap[key]) {
      const existing = db
        .prepare('SELECT id FROM submission_photos WHERE submission_id = ? AND field_id = ?')
        .get(submissionId, fieldMap[key].id);
      if (existing) deleteDiPhoto(submissionId, existing.id);
      insert.run(submissionId, fieldMap[key].id, file.filename, file.originalname);
    }
  });
}

function deleteDiPhoto(submissionId, photoId) {
  const photo = db
    .prepare('SELECT * FROM submission_photos WHERE id = ? AND submission_id = ?')
    .get(photoId, submissionId);
  if (photo) {
    const filePath = path.join(uploadDir, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM submission_photos WHERE id = ?').run(photoId);
  }
}

function loadDiSubmissionData(submissionId, formId) {
  const data = emptyDiData();
  const rows = db
    .prepare(
      `SELECT ff.field_key, sv.value
       FROM submission_values sv
       JOIN form_fields ff ON sv.field_id = ff.id
       WHERE sv.submission_id = ?`
    )
    .all(submissionId);

  rows.forEach((row) => {
    if (row.field_key === 'lift_inspection') {
      try { data.lift_inspection = { ...data.lift_inspection, ...JSON.parse(row.value) }; } catch (_e) {}
    } else if (row.field_key === 'shutdown_checklist') {
      try { data.shutdown_checklist = { ...data.shutdown_checklist, ...JSON.parse(row.value) }; } catch (_e) {}
    } else if (row.field_key === 'inspection_datetime') {
      data.inspection_datetime = (row.value || '').replace(' ', 'T').slice(0, 16);
    } else if (Object.prototype.hasOwnProperty.call(data, row.field_key)) {
      data[row.field_key] = row.value || '';
    }
  });

  return data;
}

function getDiPhotos(submissionId) {
  const rows = db
    .prepare(
      `SELECT sp.*, ff.field_key, ff.label
       FROM submission_photos sp
       JOIN form_fields ff ON sp.field_id = ff.id
       WHERE sp.submission_id = ?
       ORDER BY ff.sort_order`
    )
    .all(submissionId);

  return {
    driver: rows.find((r) => r.field_key === 'driver_side_photo') || null,
    passenger: rows.find((r) => r.field_key === 'passenger_side_photo') || null,
  };
}

function getDiSummary(submissionId) {
  const submission = db.prepare('SELECT form_id FROM submissions WHERE id = ?').get(submissionId);
  const data = loadDiSubmissionData(submissionId, submission.form_id);
  return {
    title: data.inspector_name || FORM_NAME,
    subtitle: data.inspection_datetime || data.site || null,
  };
}

function configFromFormBody(body) {
  const parseList = (key) => {
    const raw = body[key];
    if (typeof raw === 'string') return raw.split('\n').map((s) => s.trim()).filter(Boolean);
    return [];
  };
  return { sites: parseList('sites'), lift_types: parseList('lift_types') };
}

module.exports = {
  FORM_NAME,
  DI_TEMPLATE,
  DEFAULT_CONFIG,
  LIFT_INSPECTION_QUESTIONS,
  SHUTDOWN_CHECKLIST,
  ACKNOWLEDGEMENT_TEXT,
  getDailyInspectionForm,
  isDailyInspectionForm,
  getDiConfig,
  saveDiConfig,
  seedDailyInspectionForm,
  emptyDiData,
  parseDiBody,
  validateDiData,
  validateDiPhotos,
  saveDiSubmission,
  saveDiPhotos,
  deleteDiPhoto,
  loadDiSubmissionData,
  getDiPhotos,
  getDiSummary,
  configFromFormBody,
};