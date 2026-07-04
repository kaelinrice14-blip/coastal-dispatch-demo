const express = require('express');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const { sendApprovedSubmissionEmail } = require('../services/email');
const {
  FIELD_TYPES,
  getAllForms,
  getFormWithFields,
  getSubmissionDisplay,
  getSummaryValue,
  saveFormFields,
  getAllSubmissions,
  getSubmissionCounts,
} = require('../services/forms');
const {
  isJsaForm,
  getJsaConfig,
  saveJsaConfig,
  configFromFormBody,
  loadJsaSubmissionData,
} = require('../services/jsa');
const {
  isDailyInspectionForm,
  getDiConfig,
  saveDiConfig,
  configFromFormBody: diConfigFromFormBody,
  loadDiSubmissionData,
  getDiPhotos,
  LIFT_INSPECTION_QUESTIONS,
  SHUTDOWN_CHECKLIST,
  ACKNOWLEDGEMENT_TEXT,
  FORM_NAME: DI_FORM_NAME,
} = require('../services/daily-inspection');
const {
  isBladeInspectionForm,
  getBirConfig,
  saveBirConfig,
  configFromFormBody: birConfigFromFormBody,
  loadBirSubmissionData,
  getBirPhotos,
  FORM_NAME: BIR_FORM_NAME,
} = require('../services/blade-inspection');
const {
  isBladeRepairForm,
  getBrrConfig,
  saveBrrConfig,
  configFromFormBody: brrConfigFromFormBody,
  loadBrrSubmissionData,
  getBrrPhotos,
  FORM_NAME: BRR_FORM_NAME,
  LAMINATION_STAGES,
} = require('../services/blade-repair');

const router = express.Router();

// --- Review queue ---

router.get('/', requireRole('manager'), (req, res) => {
  const filter = req.query.status || 'pending';
  const submissions = getAllSubmissions(filter).map((s) => ({
    ...s,
    summary: getSummaryValue(s.id),
  }));
  const counts = getSubmissionCounts();

  res.render('manager/dashboard', {
    title: 'Review Submissions',
    user: req.session.user,
    submissions,
    filter,
    counts,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.get('/submissions/:id', requireRole('manager'), (req, res) => {
  const data = getSubmissionDisplay(req.params.id);
  if (!data) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Submission not found.',
      user: req.session.user,
    });
  }

  if (data.submission.form_template === 'jsa') {
    return res.render('manager/review', {
      title: 'Review JSA',
      user: req.session.user,
      ...data,
      isJsa: true,
      isDi: false,
      isBir: false,
      jsaData: loadJsaSubmissionData(req.params.id, data.submission.form_id),
      error: null,
    });
  }

  if (data.submission.form_template === 'daily_inspection') {
    return res.render('manager/review', {
      title: `Review ${DI_FORM_NAME}`,
      user: req.session.user,
      ...data,
      isJsa: false,
      isDi: true,
      isBir: false,
      diData: loadDiSubmissionData(req.params.id, data.submission.form_id),
      photos: getDiPhotos(req.params.id),
      liftQuestions: LIFT_INSPECTION_QUESTIONS,
      shutdownItems: SHUTDOWN_CHECKLIST,
      acknowledgementText: ACKNOWLEDGEMENT_TEXT,
      error: null,
    });
  }

  if (data.submission.form_template === 'blade_inspection') {
    return res.render('manager/review', {
      title: `Review ${BIR_FORM_NAME}`,
      user: req.session.user,
      ...data,
      isJsa: false,
      isDi: false,
      isBir: true,
      isBrr: false,
      birData: loadBirSubmissionData(req.params.id, data.submission.form_id),
      photos: getBirPhotos(req.params.id),
      error: null,
    });
  }

  if (data.submission.form_template === 'blade_repair') {
    return res.render('manager/review', {
      title: `Review ${BRR_FORM_NAME}`,
      user: req.session.user,
      ...data,
      isJsa: false,
      isDi: false,
      isBir: false,
      isBrr: true,
      birData: loadBrrSubmissionData(req.params.id, data.submission.form_id),
      photos: getBrrPhotos(req.params.id),
      laminationStages: LAMINATION_STAGES,
      error: null,
    });
  }

  res.render('manager/review', {
    title: 'Review Submission',
    user: req.session.user,
    ...data,
    isJsa: false,
    isDi: false,
    isBir: false,
    isBrr: false,
    error: null,
  });
});

router.post('/submissions/:id/review', requireRole('manager'), async (req, res) => {
  const { action, manager_notes } = req.body;
  const data = getSubmissionDisplay(req.params.id);

  if (!data) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Submission not found.',
      user: req.session.user,
    });
  }

  const { submission } = data;

  if (submission.status !== 'pending') {
    return res.render('manager/review', {
      title: 'Review Submission',
      user: req.session.user,
      ...data,
      error: 'This submission has already been reviewed.',
    });
  }

  if (action === 'reject') {
    db.prepare(
      `UPDATE submissions SET status = 'rejected', manager_notes = ?, reviewed_by = ?,
       reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(manager_notes || null, req.session.user.id, req.params.id);

    req.session.flash = { type: 'info', message: 'Submission rejected.' };
    return res.redirect('/manager');
  }

  if (action === 'approve') {
    db.prepare(
      `UPDATE submissions SET status = 'approved', manager_notes = ?, reviewed_by = ?,
       reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(manager_notes || null, req.session.user.id, req.params.id);

    let emailResult = { sent: false, reason: 'Unknown' };
    try {
      emailResult = await sendApprovedSubmissionEmail(req.params.id, submission.employee_name);
      if (emailResult.sent) {
        db.prepare('UPDATE submissions SET email_sent = 1 WHERE id = ?').run(req.params.id);
      }
    } catch (err) {
      console.error('[email] Failed to send:', err.message);
      emailResult = { sent: false, reason: err.message };
    }

    req.session.flash = {
      type: emailResult.sent ? 'success' : 'warning',
      message: emailResult.sent
        ? `Approved and emailed to ${submission.customer_email}.`
        : `Approved, but email was not sent: ${emailResult.reason}`,
    };
    return res.redirect('/manager');
  }

  res.render('manager/review', {
    title: 'Review Submission',
    user: req.session.user,
    ...data,
    error: 'Invalid action.',
  });
});

// --- Form management ---

router.get('/forms', requireRole('manager'), (req, res) => {
  res.render('manager/forms-list', {
    title: 'Manage Forms',
    user: req.session.user,
    forms: getAllForms(),
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.get('/forms/new', requireRole('manager'), (req, res) => {
  res.render('manager/form-editor', {
    title: 'Create Form',
    user: req.session.user,
    form: null,
    fields: [],
    fieldTypes: FIELD_TYPES,
    error: null,
    defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
  });
});

router.post('/forms', requireRole('manager'), (req, res) => {
  const { name, description, customer_email_default, max_photos, fields_json } = req.body;

  if (!name || !name.trim()) {
    return res.render('manager/form-editor', {
      title: 'Create Form',
      user: req.session.user,
      form: req.body,
      fields: [],
      fieldTypes: FIELD_TYPES,
      error: 'Form name is required.',
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  let fields = [];
  try {
    fields = JSON.parse(fields_json || '[]');
  } catch {
    return res.render('manager/form-editor', {
      title: 'Create Form',
      user: req.session.user,
      form: req.body,
      fields: [],
      fieldTypes: FIELD_TYPES,
      error: 'Invalid field configuration.',
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  if (fields.length === 0) {
    return res.render('manager/form-editor', {
      title: 'Create Form',
      user: req.session.user,
      form: req.body,
      fields: [],
      fieldTypes: FIELD_TYPES,
      error: 'Add at least one field to the form.',
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  const result = db.prepare(
    `INSERT INTO forms (name, description, customer_email_default, max_photos, created_by)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    name.trim(),
    description || null,
    customer_email_default || null,
    parseInt(max_photos, 10) || 0,
    req.session.user.id
  );

  saveFormFields(result.lastInsertRowid, fields);
  req.session.flash = { type: 'success', message: `Form "${name}" created.` };
  res.redirect('/manager/forms');
});

router.get('/forms/:id/edit', requireRole('manager'), (req, res) => {
  const form = getFormWithFields(req.params.id);
  if (!form) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Form not found.',
      user: req.session.user,
    });
  }

  if (isJsaForm(form)) {
    return res.render('manager/jsa-editor', {
      title: 'Edit JSA Form',
      user: req.session.user,
      form,
      config: getJsaConfig(form.id),
      error: null,
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  if (isDailyInspectionForm(form)) {
    return res.render('manager/daily-inspection-editor', {
      title: `Edit ${form.name} Form`,
      user: req.session.user,
      form,
      config: getDiConfig(form.id),
      error: null,
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  if (isBladeInspectionForm(form)) {
    return res.render('manager/blade-inspection-editor', {
      title: `Edit ${form.name} Form`,
      user: req.session.user,
      form,
      config: getBirConfig(form.id),
      error: null,
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  if (isBladeRepairForm(form)) {
    return res.render('manager/blade-repair-editor', {
      title: `Edit ${form.name} Form`,
      user: req.session.user,
      form,
      config: getBrrConfig(form.id),
      error: null,
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  res.render('manager/form-editor', {
    title: `Edit ${form.name}`,
    user: req.session.user,
    form,
    fields: form.fields,
    fieldTypes: FIELD_TYPES,
    error: null,
    defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
  });
});

router.post('/forms/:id', requireRole('manager'), (req, res) => {
  const form = getFormWithFields(req.params.id);
  if (!form) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Form not found.',
      user: req.session.user,
    });
  }

  if (isJsaForm(form) || req.body.jsa_save === '1') {
    const { customer_email_default, is_active } = req.body;
    const config = configFromFormBody(req.body);

    if (config.job_sites.length === 0) {
      return res.render('manager/jsa-editor', {
        title: 'Edit JSA Form',
        user: req.session.user,
        form,
        config,
        error: 'Add at least one Job Site / Wind Farm option.',
        defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
      });
    }

    saveJsaConfig(form.id, config);
    db.prepare(
      `UPDATE forms SET customer_email_default = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      customer_email_default || null,
      is_active === '1' ? 1 : 0,
      req.params.id
    );

    req.session.flash = { type: 'success', message: 'JSA form options updated.' };
    return res.redirect('/manager/forms');
  }

  if (isBladeRepairForm(form) || req.body.brr_save === '1') {
    const { customer_email_default, is_active } = req.body;
    const config = brrConfigFromFormBody(req.body);

    if (config.sites.length === 0) {
      return res.render('manager/blade-repair-editor', {
        title: `Edit ${form.name} Form`,
        user: req.session.user,
        form,
        config,
        error: 'Add at least one Site option.',
        defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
      });
    }

    saveBrrConfig(form.id, config);
    db.prepare(
      `UPDATE forms SET customer_email_default = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      customer_email_default || null,
      is_active === '1' ? 1 : 0,
      req.params.id
    );

    req.session.flash = { type: 'success', message: `${form.name} form options updated.` };
    return res.redirect('/manager/forms');
  }

  if (isBladeInspectionForm(form) || req.body.bir_save === '1') {
    const { customer_email_default, is_active } = req.body;
    const config = birConfigFromFormBody(req.body);

    if (config.sites.length === 0) {
      return res.render('manager/blade-inspection-editor', {
        title: `Edit ${form.name} Form`,
        user: req.session.user,
        form,
        config,
        error: 'Add at least one Site option.',
        defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
      });
    }

    saveBirConfig(form.id, config);
    db.prepare(
      `UPDATE forms SET customer_email_default = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      customer_email_default || null,
      is_active === '1' ? 1 : 0,
      req.params.id
    );

    req.session.flash = { type: 'success', message: `${form.name} form options updated.` };
    return res.redirect('/manager/forms');
  }

  if (isDailyInspectionForm(form) || req.body.di_save === '1') {
    const { customer_email_default, is_active } = req.body;
    const config = diConfigFromFormBody(req.body);

    if (config.sites.length === 0) {
      return res.render('manager/daily-inspection-editor', {
        title: `Edit ${form.name} Form`,
        user: req.session.user,
        form,
        config,
        error: 'Add at least one Site option.',
        defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
      });
    }

    saveDiConfig(form.id, config);
    db.prepare(
      `UPDATE forms SET customer_email_default = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      customer_email_default || null,
      is_active === '1' ? 1 : 0,
      req.params.id
    );

    req.session.flash = { type: 'success', message: `${form.name} form options updated.` };
    return res.redirect('/manager/forms');
  }

  const { name, description, customer_email_default, max_photos, fields_json, is_active } = req.body;

  if (!name || !name.trim()) {
    return res.render('manager/form-editor', {
      title: `Edit ${form.name}`,
      user: req.session.user,
      form: { ...form, ...req.body },
      fields: form.fields,
      fieldTypes: FIELD_TYPES,
      error: 'Form name is required.',
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  let fields = [];
  try {
    fields = JSON.parse(fields_json || '[]');
  } catch {
    return res.render('manager/form-editor', {
      title: `Edit ${form.name}`,
      user: req.session.user,
      form: { ...form, ...req.body },
      fields: form.fields,
      fieldTypes: FIELD_TYPES,
      error: 'Invalid field configuration.',
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  if (fields.length === 0) {
    return res.render('manager/form-editor', {
      title: `Edit ${form.name}`,
      user: req.session.user,
      form: { ...form, ...req.body },
      fields: form.fields,
      fieldTypes: FIELD_TYPES,
      error: 'Add at least one field to the form.',
      defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || '',
    });
  }

  db.prepare(
    `UPDATE forms SET name = ?, description = ?, customer_email_default = ?, max_photos = ?,
     is_active = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    name.trim(),
    description || null,
    customer_email_default || null,
    parseInt(max_photos, 10) || 0,
    is_active === '1' ? 1 : 0,
    req.params.id
  );

  saveFormFields(req.params.id, fields);
  req.session.flash = { type: 'success', message: `Form "${name}" updated.` };
  res.redirect('/manager/forms');
});

module.exports = router;