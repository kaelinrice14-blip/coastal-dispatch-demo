const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const BRR_TEMPLATE = 'blade_repair';
const FORM_NAME = 'Blade Repair Report';
const uploadDir = path.join(__dirname, '..', 'uploads');

const BLADE_DESIGNATION_OPTIONS = ['A', 'B', 'C', '1', '2', '3'];
const LAMINATION_STAGES = [
  'Stage 1: Lamination Prepped for Layup',
  'Stage 2: Lamination Under Vacuum',
  'Stage 3: Lamination with Heat Blanket Applied',
  'Stage 4: Lamination Cured',
];

const SECTION_KEYS = [
  'turbine_information',
  'chemicals_used',
  'initial_inspection',
  'topcoat_removed',
  'damage_exposed',
  'bonding_application',
  'lamination',
  'shore_d_test',
  'filler_application',
  'paint',
];

const PHOTO_BUCKETS = [
  'blade_id_tag_photo',
  'initial_damage_photos',
  'topcoat_removed_photo',
  'damage_exposed_photo',
  'bonding_application_photo',
  'lamination_mapping_photos',
  'filler_photos',
  'paint_photos',
];

const DEFAULT_CONFIG = {
  customers: ['Example Customer Corp'],
  sites: ['Example Wind Farm A', 'Example Wind Farm B'],
  wtg_platforms: ['V90', 'V100', 'GE 1.5'],
  blade_oems: ['LM Wind Power', 'Vestas', 'Siemens Gamesa'],
  blade_types: ['SST Structural', 'PPT Carbon Spar'],
  blade_lengths: ['40m', '45m', '50m', '55m'],
  technicians: ['Technician A', 'Technician B', 'Technician C'],
  materials_used: ['Epoxy Resin A', 'Hardener B', 'Fiberglass Cloth', 'Filler Compound'],
};

function parseConfig(raw) {
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    return {
      customers: parsed.customers || [],
      sites: parsed.sites || [],
      wtg_platforms: parsed.wtg_platforms || [],
      blade_oems: parsed.blade_oems || [],
      blade_types: parsed.blade_types || [],
      blade_lengths: parsed.blade_lengths || [],
      technicians: parsed.technicians || [],
      materials_used: parsed.materials_used || [],
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function emptySectionNa() {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, false]));
}

function emptyChemical() {
  return { material_used: '', batch_number: '', expiration_date: '' };
}

function emptyLamination() {
  return {
    ambient_temp: '',
    relative_humidity: '',
    surface_temp: '',
    vacuum_pressure: '',
    heating_blanket_cure_time: '',
    heating_blanket_temp: '',
    lamination_size: '',
    materials_replaced: '',
    mapping_comments: ['', '', '', ''],
  };
}

function emptyBrrData() {
  return {
    customer: '',
    site: '',
    wtg_platform: '',
    wtg_local_id: '',
    blade_oem: '',
    blade_type: '',
    blade_length: '',
    blade_designation: '',
    blade_serial_number: '',
    damage_id: '',
    technicians: ['', ''],
    section_na: emptySectionNa(),
    chemicals: [emptyChemical()],
    blade_id_tag_comment: '',
    topcoat_removed_comment: '',
    damage_exposed_comment: '',
    bonding_application: {
      ambient_temp: '',
      relative_humidity: '',
      surface_temp: '',
      heating_blanket_cure_time: '',
      heating_blanket_temp: '',
      comment: '',
    },
    laminations: [emptyLamination()],
    shore_d_test: {
      top_left: '',
      top_right: '',
      bottom_left: '',
      bottom_right: '',
      center: '',
    },
    filler_application: {
      ambient_temp: '',
      relative_humidity: '',
      surface_temp: '',
    },
    paint: {
      ambient_temp: '',
      relative_humidity: '',
      surface_temp: '',
    },
  };
}

function getBladeRepairForm() {
  return db
    .prepare('SELECT * FROM forms WHERE form_template = ? ORDER BY id DESC LIMIT 1')
    .get(BRR_TEMPLATE);
}

function isBladeRepairForm(form) {
  return form && form.form_template === BRR_TEMPLATE;
}

function getBrrConfig(formId) {
  const form = db.prepare('SELECT template_config FROM forms WHERE id = ?').get(formId);
  return parseConfig(form?.template_config);
}

function saveBrrConfig(formId, config) {
  const cleaned = {
    customers: (config.customers || []).map((s) => s.trim()).filter(Boolean),
    sites: (config.sites || []).map((s) => s.trim()).filter(Boolean),
    wtg_platforms: (config.wtg_platforms || []).map((s) => s.trim()).filter(Boolean),
    blade_oems: (config.blade_oems || []).map((s) => s.trim()).filter(Boolean),
    blade_types: (config.blade_types || []).map((s) => s.trim()).filter(Boolean),
    blade_lengths: (config.blade_lengths || []).map((s) => s.trim()).filter(Boolean),
    technicians: (config.technicians || []).map((s) => s.trim()).filter(Boolean),
    materials_used: (config.materials_used || []).map((s) => s.trim()).filter(Boolean),
  };
  db.prepare(
    `UPDATE forms SET template_config = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(cleaned), formId);
  return cleaned;
}

function seedBladeRepairForm() {
  const existing = getBladeRepairForm();
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
    'Blade repair process report with lamination, bonding, and coating documentation.',
    null,
    100,
    managerId,
    BRR_TEMPLATE,
    JSON.stringify(DEFAULT_CONFIG)
  );

  const formId = result.lastInsertRowid;
  const insertField = db.prepare(
    `INSERT INTO form_fields (form_id, field_key, label, field_type, required, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const valueFields = [
    ['customer', 'Customer', 'dropdown', 1, 0],
    ['site', 'Site', 'dropdown', 1, 1],
    ['wtg_platform', 'WTG Platform', 'dropdown', 1, 2],
    ['wtg_local_id', 'WTG Local ID', 'text', 0, 3],
    ['blade_oem', 'Blade OEM', 'dropdown', 1, 4],
    ['blade_type', 'Blade Type', 'dropdown', 1, 5],
    ['blade_length', 'Blade Length', 'dropdown', 1, 6],
    ['blade_designation', 'Blade Designation', 'dropdown', 1, 7],
    ['blade_serial_number', 'Blade Serial Number', 'text', 0, 8],
    ['damage_id', 'Damage ID', 'text', 0, 9],
    ['technicians', 'Technicians', 'textarea', 1, 10],
    ['section_na', 'Section N/A Flags', 'textarea', 0, 11],
    ['chemicals', 'Chemicals Used', 'textarea', 0, 12],
    ['blade_id_tag_comment', 'Blade ID Tag Comment', 'text', 0, 13],
    ['topcoat_removed_comment', 'Topcoat Removed Comment', 'text', 0, 14],
    ['damage_exposed_comment', 'Damage Exposed Comment', 'text', 0, 15],
    ['bonding_application', 'Bonding Application', 'textarea', 0, 16],
    ['laminations', 'Laminations', 'textarea', 0, 17],
    ['shore_d_test', 'Shore D Test Results', 'textarea', 0, 18],
    ['filler_application', 'Filler Application', 'textarea', 0, 19],
    ['paint', 'Paint', 'textarea', 0, 20],
  ];

  valueFields.forEach(([key, label, type, required, order]) => {
    insertField.run(formId, key, label, type, required, order);
  });

  PHOTO_BUCKETS.forEach((key, i) => {
    insertField.run(formId, key, key.replace(/_/g, ' '), 'photo', 0, 21 + i);
  });

  return db.prepare('SELECT * FROM forms WHERE id = ?').get(formId);
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

function parseChemicals(body) {
  const chemicals = [];
  const indices = new Set();
  Object.keys(body).forEach((key) => {
    const match = key.match(/^chemical_material_(\d+)$/);
    if (match) indices.add(parseInt(match[1], 10));
  });
  [...indices].sort((a, b) => a - b).forEach((i) => {
    chemicals.push({
      material_used: (body[`chemical_material_${i}`] || '').trim(),
      batch_number: (body[`chemical_batch_${i}`] || '').trim(),
      expiration_date: (body[`chemical_expiration_${i}`] || '').trim(),
    });
  });
  return chemicals.length > 0 ? chemicals : [emptyChemical()];
}

function parseLaminations(body) {
  const laminations = [];
  const indices = new Set();
  Object.keys(body).forEach((key) => {
    const match = key.match(/^lamination_ambient_(\d+)$/);
    if (match) indices.add(parseInt(match[1], 10));
  });
  [...indices].sort((a, b) => a - b).forEach((i) => {
    laminations.push({
      ambient_temp: (body[`lamination_ambient_${i}`] || '').trim(),
      relative_humidity: (body[`lamination_humidity_${i}`] || '').trim(),
      surface_temp: (body[`lamination_surface_${i}`] || '').trim(),
      vacuum_pressure: (body[`lamination_vacuum_${i}`] || '').trim(),
      heating_blanket_cure_time: (body[`lamination_cure_time_${i}`] || '').trim(),
      heating_blanket_temp: (body[`lamination_blanket_temp_${i}`] || '').trim(),
      lamination_size: (body[`lamination_size_${i}`] || '').trim(),
      materials_replaced: (body[`lamination_materials_${i}`] || '').trim(),
      mapping_comments: [0, 1, 2, 3].map(
        (s) => (body[`lamination_${i}_mapping_comment_${s}`] || '').trim()
      ),
    });
  });
  return laminations.length > 0 ? laminations : [emptyLamination()];
}

function parseSectionNa(body) {
  const na = emptySectionNa();
  SECTION_KEYS.forEach((key) => {
    na[key] = body[`section_na_${key}`] === '1' || body[`section_na_${key}`] === 'on';
  });
  return na;
}

function parseBrrBody(body) {
  return {
    customer: (body.customer || '').trim(),
    site: (body.site || '').trim(),
    wtg_platform: (body.wtg_platform || '').trim(),
    wtg_local_id: (body.wtg_local_id || '').trim(),
    blade_oem: (body.blade_oem || '').trim(),
    blade_type: (body.blade_type || '').trim(),
    blade_length: (body.blade_length || '').trim(),
    blade_designation: (body.blade_designation || '').trim(),
    blade_serial_number: (body.blade_serial_number || '').trim(),
    damage_id: (body.damage_id || '').trim(),
    technicians: parseTechnicians(body),
    section_na: parseSectionNa(body),
    chemicals: parseChemicals(body),
    blade_id_tag_comment: (body.blade_id_tag_comment || '').trim(),
    topcoat_removed_comment: (body.topcoat_removed_comment || '').trim(),
    damage_exposed_comment: (body.damage_exposed_comment || '').trim(),
    bonding_application: {
      ambient_temp: (body.bonding_ambient_temp || '').trim(),
      relative_humidity: (body.bonding_relative_humidity || '').trim(),
      surface_temp: (body.bonding_surface_temp || '').trim(),
      heating_blanket_cure_time: (body.bonding_cure_time || '').trim(),
      heating_blanket_temp: (body.bonding_blanket_temp || '').trim(),
      comment: (body.bonding_comment || '').trim(),
    },
    laminations: parseLaminations(body),
    shore_d_test: {
      top_left: (body.shore_top_left || '').trim(),
      top_right: (body.shore_top_right || '').trim(),
      bottom_left: (body.shore_bottom_left || '').trim(),
      bottom_right: (body.shore_bottom_right || '').trim(),
      center: (body.shore_center || '').trim(),
    },
    filler_application: {
      ambient_temp: (body.filler_ambient_temp || '').trim(),
      relative_humidity: (body.filler_relative_humidity || '').trim(),
      surface_temp: (body.filler_surface_temp || '').trim(),
    },
    paint: {
      ambient_temp: (body.paint_ambient_temp || '').trim(),
      relative_humidity: (body.paint_relative_humidity || '').trim(),
      surface_temp: (body.paint_surface_temp || '').trim(),
    },
  };
}

function isNaSection(data, key) {
  return !!(data.section_na && data.section_na[key]);
}

function hasPhoto(files, fieldname) {
  return files && files.some((f) => f.fieldname === fieldname);
}

function countPhotos(files, prefix) {
  if (!files) return 0;
  return files.filter((f) => f.fieldname.startsWith(prefix)).length;
}

function getExistingPhotosByBucket(submissionId) {
  const rows = db
    .prepare(
      `SELECT sp.*, ff.field_key
       FROM submission_photos sp
       JOIN form_fields ff ON sp.field_id = ff.id
       WHERE sp.submission_id = ?`
    )
    .all(submissionId);

  const grouped = Object.fromEntries(PHOTO_BUCKETS.map((b) => [b, []]));
  rows.forEach((row) => {
    if (grouped[row.field_key]) grouped[row.field_key].push(row);
  });
  return grouped;
}

function keptPhotoCount(photos, body) {
  if (!photos) return 0;
  return photos.filter((p) => body[`remove_photo_${p.id}`] !== '1').length;
}

function validateBrrData(data, files, existingPhotos, body = {}) {
  const errors = [];
  const photos = existingPhotos || Object.fromEntries(PHOTO_BUCKETS.map((b) => [b, []]));

  if (!isNaSection(data, 'turbine_information')) {
    if (!data.customer) errors.push('Customer is required.');
    if (!data.site) errors.push('Site is required.');
    if (!data.wtg_platform) errors.push('WTG Platform is required.');
    if (!data.blade_oem) errors.push('Blade OEM is required.');
    if (!data.blade_type) errors.push('Blade Type is required.');
    if (!data.blade_length) errors.push('Blade Length is required.');
    if (!data.blade_designation) errors.push('Blade Designation is required.');
    if (!BLADE_DESIGNATION_OPTIONS.includes(data.blade_designation)) {
      errors.push('Invalid Blade Designation selected.');
    }
    if (data.technicians.length === 0) {
      errors.push('At least one Coastal Composite Technician is required.');
    }
  }

  if (!isNaSection(data, 'chemicals_used')) {
    const validChems = data.chemicals.filter(
      (c) => c.material_used && c.batch_number && c.expiration_date
    );
    if (validChems.length === 0) {
      errors.push('Add at least one complete chemical entry (Material, Batch Number, Expiration Date).');
    } else {
      data.chemicals.forEach((c, i) => {
        if (!c.material_used) errors.push(`Chemical ${i + 1}: Material Used is required.`);
        if (!c.batch_number) errors.push(`Chemical ${i + 1}: Batch Number is required.`);
        if (!c.expiration_date) errors.push(`Chemical ${i + 1}: Expiration Date is required.`);
      });
    }
  }

  if (!isNaSection(data, 'initial_inspection')) {
    const hasBladeTag =
      keptPhotoCount(photos.blade_id_tag_photo, body) > 0 || hasPhoto(files, 'blade_id_tag');
    if (!hasBladeTag) errors.push('Blade ID Tag photo is required.');
    if (!data.blade_id_tag_comment) errors.push('Blade ID Tag comment is required.');
    const newDamage = countPhotos(files, 'initial_damage_');
    const keptDamage = keptPhotoCount(photos.initial_damage_photos, body);
    if (newDamage + keptDamage === 0) {
      errors.push('Add at least one Initial Damage photo.');
    }
  }

  if (!isNaSection(data, 'topcoat_removed')) {
    if (keptPhotoCount(photos.topcoat_removed_photo, body) === 0 && !hasPhoto(files, 'topcoat_removed')) {
      errors.push('Topcoat Removed photo is required.');
    }
    if (!data.topcoat_removed_comment) errors.push('Topcoat Removed comment is required.');
  }

  if (!isNaSection(data, 'damage_exposed')) {
    if (keptPhotoCount(photos.damage_exposed_photo, body) === 0 && !hasPhoto(files, 'damage_exposed')) {
      errors.push('Damage Exposed photo is required.');
    }
    if (!data.damage_exposed_comment) errors.push('Damage Exposed comment is required.');
  }

  if (!isNaSection(data, 'bonding_application')) {
    const b = data.bonding_application;
    if (!b.ambient_temp) errors.push('Bonding Application: Ambient Temperature is required.');
    if (!b.relative_humidity) errors.push('Bonding Application: Relative Humidity is required.');
    if (!b.surface_temp) errors.push('Bonding Application: Surface Temperature is required.');
    if (!b.heating_blanket_cure_time) errors.push('Bonding Application: Heating Blanket Cure Time is required.');
    if (!b.heating_blanket_temp) errors.push('Bonding Application: Heating Blanket Temperature is required.');
    if (!b.comment) errors.push('Bonding Application picture comment is required.');
    if (keptPhotoCount(photos.bonding_application_photo, body) === 0 && !hasPhoto(files, 'bonding_application')) {
      errors.push('Bonding Application picture is required.');
    }
  }

  if (!isNaSection(data, 'lamination')) {
    data.laminations.forEach((lam, i) => {
      const n = i + 1;
      if (!lam.ambient_temp) errors.push(`Lamination ${n}: Ambient Temperature is required.`);
      if (!lam.relative_humidity) errors.push(`Lamination ${n}: Relative Humidity is required.`);
      if (!lam.surface_temp) errors.push(`Lamination ${n}: Surface Temperature is required.`);
      if (!lam.vacuum_pressure) errors.push(`Lamination ${n}: Vacuum Pressure is required.`);
      if (!lam.heating_blanket_cure_time) errors.push(`Lamination ${n}: Heating Blanket Cure Time is required.`);
      if (!lam.heating_blanket_temp) errors.push(`Lamination ${n}: Heating Blanket Temperature is required.`);
      if (!lam.lamination_size) errors.push(`Lamination ${n}: Lamination Size is required.`);
      if (!lam.materials_replaced) errors.push(`Lamination ${n}: Materials Replaced is required.`);
      [0, 1, 2, 3].forEach((stage) => {
        const field = `lamination_${i}_mapping_${stage}`;
        const hasExisting = photos.lamination_mapping_photos.some(
          (p) =>
            body[`remove_photo_${p.id}`] !== '1' &&
            p.description &&
            p.description.startsWith(`lam:${i}|stage:${stage}`)
        );
        if (!hasExisting && !hasPhoto(files, field)) {
          errors.push(`Lamination ${n}: ${LAMINATION_STAGES[stage]} mapping picture is required.`);
        }
        if (!lam.mapping_comments[stage]) {
          errors.push(`Lamination ${n}: ${LAMINATION_STAGES[stage]} comment is required.`);
        }
      });
    });
  }

  if (!isNaSection(data, 'shore_d_test')) {
    const s = data.shore_d_test;
    if (!s.top_left) errors.push('Shore D Test: Top Left is required.');
    if (!s.top_right) errors.push('Shore D Test: Top Right is required.');
    if (!s.bottom_left) errors.push('Shore D Test: Bottom Left is required.');
    if (!s.bottom_right) errors.push('Shore D Test: Bottom Right is required.');
    if (!s.center) errors.push('Shore D Test: Center is required.');
  }

  if (!isNaSection(data, 'filler_application')) {
    const f = data.filler_application;
    if (!f.ambient_temp) errors.push('Filler Application: Ambient Temperature is required.');
    if (!f.relative_humidity) errors.push('Filler Application: Relative Humidity is required.');
    if (!f.surface_temp) errors.push('Filler Application: Surface Temperature is required.');
    if (keptPhotoCount(photos.filler_photos, body) + countPhotos(files, 'filler_photo_') === 0) {
      errors.push('Add at least one Filler Application photo.');
    }
  }

  if (!isNaSection(data, 'paint')) {
    const p = data.paint;
    if (!p.ambient_temp) errors.push('Paint: Ambient Temperature is required.');
    if (!p.relative_humidity) errors.push('Paint: Relative Humidity is required.');
    if (!p.surface_temp) errors.push('Paint: Surface Temperature is required.');
    if (keptPhotoCount(photos.paint_photos, body) + countPhotos(files, 'paint_photo_') === 0) {
      errors.push('Add at least one Paint photo.');
    }
  }

  return errors;
}

function getBrrFieldMap(formId) {
  const fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ?').all(formId);
  return Object.fromEntries(fields.map((f) => [f.field_key, f]));
}

function saveBrrSubmission(submissionId, formId, data) {
  const fieldMap = getBrrFieldMap(formId);
  const upsert = db.prepare(
    `INSERT INTO submission_values (submission_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(submission_id, field_id) DO UPDATE SET value = excluded.value`
  );

  const payload = {
    customer: data.customer,
    site: data.site,
    wtg_platform: data.wtg_platform,
    wtg_local_id: data.wtg_local_id,
    blade_oem: data.blade_oem,
    blade_type: data.blade_type,
    blade_length: data.blade_length,
    blade_designation: data.blade_designation,
    blade_serial_number: data.blade_serial_number,
    damage_id: data.damage_id,
    technicians: JSON.stringify(data.technicians),
    section_na: JSON.stringify(data.section_na),
    chemicals: JSON.stringify(data.chemicals),
    blade_id_tag_comment: data.blade_id_tag_comment,
    topcoat_removed_comment: data.topcoat_removed_comment,
    damage_exposed_comment: data.damage_exposed_comment,
    bonding_application: JSON.stringify(data.bonding_application),
    laminations: JSON.stringify(data.laminations),
    shore_d_test: JSON.stringify(data.shore_d_test),
    filler_application: JSON.stringify(data.filler_application),
    paint: JSON.stringify(data.paint),
  };

  Object.entries(payload).forEach(([key, val]) => {
    if (fieldMap[key]) upsert.run(submissionId, fieldMap[key].id, val);
  });
}

function resolvePhotoBucket(fieldname) {
  if (fieldname === 'blade_id_tag') return 'blade_id_tag_photo';
  if (fieldname.startsWith('initial_damage_')) return 'initial_damage_photos';
  if (fieldname === 'topcoat_removed') return 'topcoat_removed_photo';
  if (fieldname === 'damage_exposed') return 'damage_exposed_photo';
  if (fieldname === 'bonding_application') return 'bonding_application_photo';
  if (fieldname.match(/^lamination_\d+_mapping_\d+$/)) return 'lamination_mapping_photos';
  if (fieldname.startsWith('filler_photo_')) return 'filler_photos';
  if (fieldname.startsWith('paint_photo_')) return 'paint_photos';
  return null;
}

function photoDescription(fieldname, body) {
  const lamMatch = fieldname.match(/^lamination_(\d+)_mapping_(\d+)$/);
  if (lamMatch) {
    const lam = lamMatch[1];
    const stage = lamMatch[2];
    const comment = (body[`lamination_${lam}_mapping_comment_${stage}`] || '').trim();
    return `lam:${lam}|stage:${stage}|${comment}`;
  }
  if (fieldname.startsWith('initial_damage_')) {
    const idx = fieldname.replace('initial_damage_', '');
    return (body[`initial_damage_desc_${idx}`] || '').trim() || null;
  }
  return null;
}

function saveBrrPhotos(submissionId, formId, files, body) {
  if (!files || !files.length) return;
  const fieldMap = getBrrFieldMap(formId);
  const insert = db.prepare(
    'INSERT INTO submission_photos (submission_id, field_id, filename, original_name, description) VALUES (?, ?, ?, ?, ?)'
  );

  files.forEach((file) => {
    const bucket = resolvePhotoBucket(file.fieldname);
    if (!bucket || !fieldMap[bucket]) return;
    insert.run(
      submissionId,
      fieldMap[bucket].id,
      file.filename,
      file.originalname,
      photoDescription(file.fieldname, body)
    );
  });
}

function updateBrrPhotoMeta(submissionId, body) {
  const update = db.prepare(
    'UPDATE submission_photos SET description = ? WHERE id = ? AND submission_id = ?'
  );
  Object.keys(body).forEach((key) => {
    const existing = key.match(/^photo_desc_existing_(\d+)$/);
    if (existing) {
      const photoId = parseInt(existing[1], 10);
      const photo = db
        .prepare('SELECT description FROM submission_photos WHERE id = ? AND submission_id = ?')
        .get(photoId, submissionId);
      if (!photo) return;
      const desc = (body[key] || '').trim();
      if (photo.description && photo.description.startsWith('lam:')) {
        const parts = photo.description.split('|');
        const prefix = parts.slice(0, 2).join('|');
        update.run(`${prefix}|${desc}`, photoId, submissionId);
      } else {
        update.run(desc || null, photoId, submissionId);
      }
    }
  });
}

function processBrrPhotoRemovals(submissionId, body) {
  Object.keys(body).forEach((key) => {
    const match = key.match(/^remove_photo_(\d+)$/);
    if (match && body[key] === '1') {
      deleteBrrPhoto(submissionId, parseInt(match[1], 10));
    }
  });
}

function deleteBrrPhoto(submissionId, photoId) {
  const photo = db
    .prepare('SELECT * FROM submission_photos WHERE id = ? AND submission_id = ?')
    .get(photoId, submissionId);
  if (photo) {
    const filePath = path.join(uploadDir, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM submission_photos WHERE id = ?').run(photoId);
  }
}

function loadBrrSubmissionData(submissionId, formId) {
  const data = emptyBrrData();
  const rows = db
    .prepare(
      `SELECT ff.field_key, sv.value
       FROM submission_values sv
       JOIN form_fields ff ON sv.field_id = ff.id
       WHERE sv.submission_id = ?`
    )
    .all(submissionId);

  const jsonFields = [
    'technicians', 'section_na', 'chemicals', 'bonding_application',
    'laminations', 'shore_d_test', 'filler_application', 'paint',
  ];

  rows.forEach((row) => {
    if (jsonFields.includes(row.field_key)) {
      try {
        const parsed = JSON.parse(row.value);
        if (row.field_key === 'technicians') {
          data.technicians = Array.isArray(parsed) && parsed.length ? parsed : ['', ''];
        } else if (row.field_key === 'section_na') {
          data.section_na = { ...emptySectionNa(), ...parsed };
        } else if (row.field_key === 'chemicals') {
          data.chemicals = Array.isArray(parsed) && parsed.length ? parsed : [emptyChemical()];
        } else if (row.field_key === 'laminations') {
          data.laminations = Array.isArray(parsed) && parsed.length ? parsed : [emptyLamination()];
        } else {
          data[row.field_key] = parsed;
        }
      } catch (_e) { /* keep default */ }
    } else if (Object.prototype.hasOwnProperty.call(data, row.field_key)) {
      data[row.field_key] = row.value || '';
    }
  });

  while (data.technicians.length < 2) data.technicians.push('');
  return data;
}

function emptyBrrPhotos() {
  return Object.fromEntries(PHOTO_BUCKETS.map((b) => [b, []]));
}

function getBrrPhotos(submissionId) {
  return getExistingPhotosByBucket(submissionId);
}

function getBrrSummary(submissionId) {
  const submission = db.prepare('SELECT form_id FROM submissions WHERE id = ?').get(submissionId);
  const data = loadBrrSubmissionData(submissionId, submission.form_id);
  return {
    title: data.site || data.customer || FORM_NAME,
    subtitle: data.damage_id || data.blade_serial_number || null,
  };
}

function configFromFormBody(body) {
  const parseList = (key) => {
    const raw = body[key];
    if (typeof raw === 'string') return raw.split('\n').map((s) => s.trim()).filter(Boolean);
    return [];
  };
  return {
    customers: parseList('customers'),
    sites: parseList('sites'),
    wtg_platforms: parseList('wtg_platforms'),
    blade_oems: parseList('blade_oems'),
    blade_types: parseList('blade_types'),
    blade_lengths: parseList('blade_lengths'),
    technicians: parseList('technicians'),
    materials_used: parseList('materials_used'),
  };
}

function parseLamPhotoMeta(description) {
  if (!description || !description.startsWith('lam:')) return { lam: null, stage: null, comment: description || '' };
  const parts = description.split('|');
  const lam = parseInt(parts[0].replace('lam:', ''), 10);
  const stage = parseInt(parts[1].replace('stage:', ''), 10);
  const comment = parts.slice(2).join('|');
  return { lam, stage, comment };
}

module.exports = {
  FORM_NAME,
  BRR_TEMPLATE,
  BLADE_DESIGNATION_OPTIONS,
  LAMINATION_STAGES,
  SECTION_KEYS,
  DEFAULT_CONFIG,
  getBladeRepairForm,
  isBladeRepairForm,
  getBrrConfig,
  saveBrrConfig,
  seedBladeRepairForm,
  emptyBrrData,
  parseBrrBody,
  validateBrrData,
  saveBrrSubmission,
  saveBrrPhotos,
  updateBrrPhotoMeta,
  processBrrPhotoRemovals,
  deleteBrrPhoto,
  loadBrrSubmissionData,
  emptyBrrPhotos,
  getBrrPhotos,
  getBrrSummary,
  configFromFormBody,
  parseLamPhotoMeta,
  isNaSection,
};