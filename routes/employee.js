const express = require('express');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const { dynamicUpload } = require('../services/upload');
const {
  getActiveForms,
  getFormWithFields,
  getSubmissionsForUser,
  getSubmissionDisplay,
  getSummaryValue,
  validateSubmission,
  saveSubmissionValues,
  saveSubmissionPhotos,
  deleteSubmissionPhotos,
} = require('../services/forms');
const {
  isJsaForm,
  getJsaConfig,
  parseJsaBody,
  validateJsaData,
  saveJsaSubmission,
  loadJsaSubmissionData,
} = require('../services/jsa');
const {
  isDailyInspectionForm,
  getDiConfig,
  emptyDiData,
  parseDiBody,
  validateDiData,
  validateDiPhotos,
  saveDiSubmission,
  saveDiPhotos,
  deleteDiPhoto,
  loadDiSubmissionData,
  getDiPhotos,
  LIFT_INSPECTION_QUESTIONS,
  SHUTDOWN_CHECKLIST,
  ACKNOWLEDGEMENT_TEXT,
  FORM_NAME: DI_FORM_NAME,
} = require('../services/daily-inspection');
const { diUpload } = require('../services/di-upload');
const {
  isBladeInspectionForm,
  getBirConfig,
  emptyBirData,
  parseBirBody,
  validateBirData,
  saveBirSubmission,
  saveBirPhotos,
  updateBirPhotoDescriptions,
  processBirPhotoRemovals,
  loadBirSubmissionData,
  getBirPhotos,
  BLADE_TYPE_OPTIONS,
  BLADE_DESIGNATION_OPTIONS,
  FORM_NAME: BIR_FORM_NAME,
} = require('../services/blade-inspection');
const { birUpload } = require('../services/bir-upload');
const {
  isBladeRepairForm,
  getBrrConfig,
  emptyBrrData,
  emptyBrrPhotos,
  parseBrrBody,
  validateBrrData,
  saveBrrSubmission,
  saveBrrPhotos,
  updateBrrPhotoMeta,
  processBrrPhotoRemovals,
  loadBrrSubmissionData,
  getBrrPhotos,
  LAMINATION_STAGES,
  FORM_NAME: BRR_FORM_NAME,
} = require('../services/blade-repair');
const { brrUpload } = require('../services/brr-upload');

const router = express.Router();

function renderDiForm(res, opts) {
  const { form, mode, submission, data, error, customerEmail, photos } = opts;
  res.render('employee/daily-inspection-form', {
    title: mode === 'new' ? `New ${DI_FORM_NAME}` : `Edit ${DI_FORM_NAME}`,
    user: opts.user,
    form,
    submission: submission || null,
    data,
    config: getDiConfig(form.id),
    liftQuestions: LIFT_INSPECTION_QUESTIONS,
    shutdownItems: SHUTDOWN_CHECKLIST,
    acknowledgementText: ACKNOWLEDGEMENT_TEXT,
    photos: photos || { driver: null, passenger: null },
    mode,
    error: error || null,
    customerEmail,
  });
}

function renderBrrForm(res, opts) {
  const { form, mode, submission, data, error, customerEmail, photos } = opts;
  res.render('employee/blade-repair-form', {
    title: mode === 'new' ? `New ${BRR_FORM_NAME}` : `Edit ${BRR_FORM_NAME}`,
    user: opts.user,
    form,
    submission: submission || null,
    data,
    config: getBrrConfig(form.id),
    bladeDesignationOptions: BLADE_DESIGNATION_OPTIONS,
    laminationStages: LAMINATION_STAGES,
    photos: photos || emptyBrrPhotos(),
    mode,
    error: error || null,
    customerEmail,
  });
}

function renderBirForm(res, opts) {
  const { form, mode, submission, data, error, customerEmail, photos } = opts;
  res.render('employee/blade-inspection-form', {
    title: mode === 'new' ? `New ${BIR_FORM_NAME}` : `Edit ${BIR_FORM_NAME}`,
    user: opts.user,
    form,
    submission: submission || null,
    data,
    config: getBirConfig(form.id),
    bladeTypeOptions: BLADE_TYPE_OPTIONS,
    bladeDesignationOptions: BLADE_DESIGNATION_OPTIONS,
    photos: photos || [],
    mode,
    error: error || null,
    customerEmail,
  });
}

function renderJsaForm(res, opts) {
  const { form, mode, submission, data, error, customerEmail } = opts;
  res.render('employee/jsa-form', {
    title: mode === 'new' ? 'New JSA' : 'Edit JSA',
    user: opts.user,
    form,
    submission: submission || null,
    data,
    config: getJsaConfig(form.id),
    mode,
    error: error || null,
    customerEmail,
  });
}

router.get('/', requireRole('employee'), (req, res) => {
  const forms = getActiveForms().map((form) => {
    const count = db
      .prepare('SELECT COUNT(*) as count FROM submissions WHERE form_id = ? AND user_id = ?')
      .get(form.id, req.session.user.id).count;
    return { ...form, my_submission_count: count };
  });

  res.render('employee/forms-list', {
    title: 'Choose a Form',
    user: req.session.user,
    forms,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.get('/forms/:formId', requireRole('employee'), (req, res) => {
  const form = getFormWithFields(req.params.formId);
  if (!form || !form.is_active) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Form not found.',
      user: req.session.user,
    });
  }

  const submissions = getSubmissionsForUser(form.id, req.session.user.id).map((s) => ({
    ...s,
    summary: getSummaryValue(s.id),
  }));

  res.render('employee/form-submissions', {
    title: form.name,
    user: req.session.user,
    form,
    submissions,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.get('/forms/:formId/new', requireRole('employee'), (req, res) => {
  const form = getFormWithFields(req.params.formId);
  if (!form || !form.is_active) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Form not found.',
      user: req.session.user,
    });
  }

  if (isJsaForm(form)) {
    return renderJsaForm(res, {
      user: req.session.user,
      form,
      mode: 'new',
      data: {
        job_site: '',
        date_time: '',
        customer: '',
        tower_number: '',
        site_contact: '',
        site_contact_phone: '',
        wind_weather_forecast: '',
        work_scope: '',
        hazards: [{ potential_hazard: '', control_measure: '' }],
      },
      customerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || form.customer_email_default || '',
    });
  }

  if (isDailyInspectionForm(form)) {
    return renderDiForm(res, {
      user: req.session.user,
      form,
      mode: 'new',
      data: emptyDiData(),
      customerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || form.customer_email_default || '',
    });
  }

  if (isBladeInspectionForm(form)) {
    return renderBirForm(res, {
      user: req.session.user,
      form,
      mode: 'new',
      data: emptyBirData(),
      customerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || form.customer_email_default || '',
    });
  }

  if (isBladeRepairForm(form)) {
    return renderBrrForm(res, {
      user: req.session.user,
      form,
      mode: 'new',
      data: emptyBrrData(),
      customerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || form.customer_email_default || '',
    });
  }

  res.render('employee/fill-form', {
    title: `New ${form.name}`,
    user: req.session.user,
    form,
    submission: null,
    values: {},
    photos: [],
    mode: 'new',
    error: null,
    defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || form.customer_email_default || '',
  });
});

router.post('/forms/:formId/new', requireRole('employee'), (req, res, next) => {
  const form = getFormWithFields(req.params.formId);
  if (!form || !form.is_active) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Form not found.',
      user: req.session.user,
    });
  }

  if (isJsaForm(form)) {
    const customerEmail = req.body.customer_email || form.customer_email_default || process.env.DEFAULT_CUSTOMER_EMAIL;
    const data = parseJsaBody(req.body);
    const errors = validateJsaData(data);

    if (!customerEmail) {
      return renderJsaForm(res, {
        user: req.session.user,
        form,
        mode: 'new',
        data,
        error: 'Customer email is required.',
        customerEmail: '',
      });
    }

    if (errors.length > 0) {
      return renderJsaForm(res, {
        user: req.session.user,
        form,
        mode: 'new',
        data,
        error: errors.join(' '),
        customerEmail,
      });
    }

    const result = db.prepare(
      `INSERT INTO submissions (form_id, user_id, customer_email) VALUES (?, ?, ?)`
    ).run(form.id, req.session.user.id, customerEmail);

    saveJsaSubmission(result.lastInsertRowid, form.id, data);
    req.session.flash = { type: 'success', message: 'JSA submitted for manager review.' };
    return res.redirect(`/employee/forms/${form.id}`);
  }

  if (isBladeRepairForm(form)) {
    return brrUpload(req, res, (err) => {
      if (err) {
        return renderBrrForm(res, {
          user: req.session.user,
          form,
          mode: 'new',
          data: parseBrrBody(req.body),
          error: err.message || 'Photo upload failed.',
          customerEmail: req.body.customer_email || '',
        });
      }

      const customerEmail = req.body.customer_email || form.customer_email_default || process.env.DEFAULT_CUSTOMER_EMAIL;
      const brrData = parseBrrBody(req.body);
      const errors = validateBrrData(brrData, req.files, emptyBrrPhotos(), req.body);

      if (!customerEmail) errors.unshift('Customer email is required.');

      if (errors.length > 0) {
        return renderBrrForm(res, {
          user: req.session.user,
          form,
          mode: 'new',
          data: brrData,
          error: errors.join(' '),
          customerEmail: customerEmail || '',
        });
      }

      const result = db.prepare(
        `INSERT INTO submissions (form_id, user_id, customer_email) VALUES (?, ?, ?)`
      ).run(form.id, req.session.user.id, customerEmail);

      saveBrrSubmission(result.lastInsertRowid, form.id, brrData);
      saveBrrPhotos(result.lastInsertRowid, form.id, req.files, req.body);
      req.session.flash = { type: 'success', message: `${BRR_FORM_NAME} submitted for manager review.` };
      return res.redirect(`/employee/forms/${form.id}`);
    });
  }

  if (isBladeInspectionForm(form)) {
    return birUpload(req, res, (err) => {
      if (err) {
        return renderBirForm(res, {
          user: req.session.user,
          form,
          mode: 'new',
          data: parseBirBody(req.body),
          error: err.message || 'Photo upload failed.',
          customerEmail: req.body.customer_email || '',
        });
      }

      const customerEmail = req.body.customer_email || form.customer_email_default || process.env.DEFAULT_CUSTOMER_EMAIL;
      const birData = parseBirBody(req.body);
      const errors = validateBirData(birData);

      if (!customerEmail) errors.unshift('Customer email is required.');

      if (errors.length > 0) {
        return renderBirForm(res, {
          user: req.session.user,
          form,
          mode: 'new',
          data: birData,
          error: errors.join(' '),
          customerEmail: customerEmail || '',
        });
      }

      const result = db.prepare(
        `INSERT INTO submissions (form_id, user_id, customer_email) VALUES (?, ?, ?)`
      ).run(form.id, req.session.user.id, customerEmail);

      saveBirSubmission(result.lastInsertRowid, form.id, birData);
      saveBirPhotos(result.lastInsertRowid, form.id, req.files, req.body);
      req.session.flash = { type: 'success', message: `${BIR_FORM_NAME} submitted for manager review.` };
      return res.redirect(`/employee/forms/${form.id}`);
    });
  }

  if (isDailyInspectionForm(form)) {
    return diUpload(req, res, (err) => {
      if (err) {
        return renderDiForm(res, {
          user: req.session.user,
          form,
          mode: 'new',
          data: parseDiBody(req.body),
          error: err.message || 'Photo upload failed.',
          customerEmail: req.body.customer_email || '',
        });
      }

      const customerEmail = req.body.customer_email || form.customer_email_default || process.env.DEFAULT_CUSTOMER_EMAIL;
      const diData = parseDiBody(req.body);
      const errors = [
        ...validateDiData(diData),
        ...validateDiPhotos(req.files, { driver: null, passenger: null }, req.body),
      ];

      if (!customerEmail) errors.unshift('Customer email is required.');

      if (errors.length > 0) {
        return renderDiForm(res, {
          user: req.session.user,
          form,
          mode: 'new',
          data: diData,
          error: errors.join(' '),
          customerEmail: customerEmail || '',
        });
      }

      const result = db.prepare(
        `INSERT INTO submissions (form_id, user_id, customer_email) VALUES (?, ?, ?)`
      ).run(form.id, req.session.user.id, customerEmail);

      saveDiSubmission(result.lastInsertRowid, form.id, diData);
      saveDiPhotos(result.lastInsertRowid, form.id, req.files);
      req.session.flash = { type: 'success', message: `${DI_FORM_NAME} submitted for manager review.` };
      return res.redirect(`/employee/forms/${form.id}`);
    });
  }

  dynamicUpload(form.fields)(req, res, (err) => {
    if (err) {
      return res.render('employee/fill-form', {
        title: `New ${form.name}`,
        user: req.session.user,
        form,
        submission: null,
        values: req.body,
        photos: [],
        mode: 'new',
        error: err.message,
        defaultCustomerEmail: process.env.DEFAULT_CUSTOMER_EMAIL || form.customer_email_default || '',
      });
    }
    next();
  });
}, (req, res) => {
  const form = getFormWithFields(req.params.formId);
  const customerEmail = req.body.customer_email || form.customer_email_default || process.env.DEFAULT_CUSTOMER_EMAIL;

  if (!customerEmail) {
    return res.render('employee/fill-form', {
      title: `New ${form.name}`,
      user: req.session.user,
      form,
      submission: null,
      values: req.body,
      photos: [],
      mode: 'new',
      error: 'Customer email is required.',
      defaultCustomerEmail: '',
    });
  }

  const { errors, values } = validateSubmission(form, form.fields, req.body, req.files);

  if (errors.length > 0) {
    return res.render('employee/fill-form', {
      title: `New ${form.name}`,
      user: req.session.user,
      form,
      submission: null,
      values: req.body,
      photos: [],
      mode: 'new',
      error: errors.join(' '),
      defaultCustomerEmail: customerEmail,
    });
  }

  const result = db.prepare(
    `INSERT INTO submissions (form_id, user_id, customer_email) VALUES (?, ?, ?)`
  ).run(form.id, req.session.user.id, customerEmail);

  const submissionId = result.lastInsertRowid;
  saveSubmissionValues(submissionId, form.id, values, form.fields);
  saveSubmissionPhotos(submissionId, form.fields, req.files);

  req.session.flash = { type: 'success', message: 'Form submitted for manager review.' };
  res.redirect(`/employee/forms/${form.id}`);
});

router.get('/submissions/:id', requireRole('employee'), (req, res) => {
  const data = getSubmissionDisplay(req.params.id);
  if (!data || data.submission.user_id !== req.session.user.id) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Submission not found.',
      user: req.session.user,
    });
  }

  if (data.submission.form_template === 'jsa') {
    return res.render('employee/view-submission', {
      title: 'View JSA',
      user: req.session.user,
      ...data,
      isJsa: true,
      isDi: false,
      isBir: false,
      jsaData: loadJsaSubmissionData(req.params.id, data.submission.form_id),
      canEdit: ['pending', 'rejected'].includes(data.submission.status),
    });
  }

  if (data.submission.form_template === 'daily_inspection') {
    return res.render('employee/view-submission', {
      title: `View ${DI_FORM_NAME}`,
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
      canEdit: ['pending', 'rejected'].includes(data.submission.status),
    });
  }

  if (data.submission.form_template === 'blade_inspection') {
    return res.render('employee/view-submission', {
      title: `View ${BIR_FORM_NAME}`,
      user: req.session.user,
      ...data,
      isJsa: false,
      isDi: false,
      isBir: true,
      isBrr: false,
      birData: loadBirSubmissionData(req.params.id, data.submission.form_id),
      photos: getBirPhotos(req.params.id),
      canEdit: ['pending', 'rejected'].includes(data.submission.status),
    });
  }

  if (data.submission.form_template === 'blade_repair') {
    return res.render('employee/view-submission', {
      title: `View ${BRR_FORM_NAME}`,
      user: req.session.user,
      ...data,
      isJsa: false,
      isDi: false,
      isBir: false,
      isBrr: true,
      birData: loadBrrSubmissionData(req.params.id, data.submission.form_id),
      photos: getBrrPhotos(req.params.id),
      laminationStages: LAMINATION_STAGES,
      canEdit: ['pending', 'rejected'].includes(data.submission.status),
    });
  }

  res.render('employee/view-submission', {
    title: 'View Submission',
    user: req.session.user,
    ...data,
    isJsa: false,
    isDi: false,
    isBir: false,
    isBrr: false,
    canEdit: ['pending', 'rejected'].includes(data.submission.status),
  });
});

router.get('/submissions/:id/edit', requireRole('employee'), (req, res) => {
  const data = getSubmissionDisplay(req.params.id);
  if (!data || data.submission.user_id !== req.session.user.id) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Submission not found.',
      user: req.session.user,
    });
  }

  if (!['pending', 'rejected'].includes(data.submission.status)) {
    req.session.flash = { type: 'info', message: 'Approved submissions cannot be edited.' };
    return res.redirect(`/employee/submissions/${req.params.id}`);
  }

  if (data.submission.form_template === 'jsa') {
    return renderJsaForm(res, {
      user: req.session.user,
      form: { id: data.submission.form_id, name: 'JSA' },
      mode: 'edit',
      submission: data.submission,
      data: loadJsaSubmissionData(req.params.id, data.submission.form_id),
      customerEmail: data.submission.customer_email,
    });
  }

  if (data.submission.form_template === 'daily_inspection') {
    return renderDiForm(res, {
      user: req.session.user,
      form: { id: data.submission.form_id, name: DI_FORM_NAME },
      mode: 'edit',
      submission: data.submission,
      data: loadDiSubmissionData(req.params.id, data.submission.form_id),
      photos: getDiPhotos(req.params.id),
      customerEmail: data.submission.customer_email,
    });
  }

  if (data.submission.form_template === 'blade_inspection') {
    return renderBirForm(res, {
      user: req.session.user,
      form: { id: data.submission.form_id, name: BIR_FORM_NAME },
      mode: 'edit',
      submission: data.submission,
      data: loadBirSubmissionData(req.params.id, data.submission.form_id),
      photos: getBirPhotos(req.params.id),
      customerEmail: data.submission.customer_email,
    });
  }

  if (data.submission.form_template === 'blade_repair') {
    return renderBrrForm(res, {
      user: req.session.user,
      form: { id: data.submission.form_id, name: BRR_FORM_NAME },
      mode: 'edit',
      submission: data.submission,
      data: loadBrrSubmissionData(req.params.id, data.submission.form_id),
      photos: getBrrPhotos(req.params.id),
      customerEmail: data.submission.customer_email,
    });
  }

  const values = Object.fromEntries(data.values.map((v) => [v.field_key, v.value]));

  res.render('employee/fill-form', {
    title: `Edit ${data.submission.form_name}`,
    user: req.session.user,
    form: { ...data.submission, fields: data.fields, max_photos: data.submission.max_photos },
    submission: data.submission,
    values,
    photos: data.photos,
    mode: 'edit',
    error: null,
    defaultCustomerEmail: data.submission.customer_email,
  });
});

router.post('/submissions/:id/edit', requireRole('employee'), (req, res, next) => {
  const data = getSubmissionDisplay(req.params.id);
  if (!data || data.submission.user_id !== req.session.user.id) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Submission not found.',
      user: req.session.user,
    });
  }

  if (!['pending', 'rejected'].includes(data.submission.status)) {
    req.session.flash = { type: 'info', message: 'Approved submissions cannot be edited.' };
    return res.redirect(`/employee/submissions/${req.params.id}`);
  }

  if (data.submission.form_template === 'jsa') {
    const customerEmail = req.body.customer_email || data.submission.customer_email;
    const jsaData = parseJsaBody(req.body);
    const errors = validateJsaData(jsaData);

    if (errors.length > 0) {
      return renderJsaForm(res, {
        user: req.session.user,
        form: { id: data.submission.form_id, name: 'JSA' },
        mode: 'edit',
        submission: data.submission,
        data: jsaData,
        error: errors.join(' '),
        customerEmail,
      });
    }

    saveJsaSubmission(req.params.id, data.submission.form_id, jsaData);
    db.prepare(
      `UPDATE submissions SET customer_email = ?, status = 'pending', manager_notes = NULL,
       reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now') WHERE id = ?`
    ).run(customerEmail, req.params.id);

    req.session.flash = { type: 'success', message: 'JSA updated and resubmitted for review.' };
    return res.redirect(`/employee/forms/${data.submission.form_id}`);
  }

  if (data.submission.form_template === 'blade_repair') {
    return brrUpload(req, res, (err) => {
      if (err) {
        return renderBrrForm(res, {
          user: req.session.user,
          form: { id: data.submission.form_id, name: BRR_FORM_NAME },
          mode: 'edit',
          submission: data.submission,
          data: parseBrrBody(req.body),
          photos: getBrrPhotos(req.params.id),
          error: err.message || 'Photo upload failed.',
          customerEmail: req.body.customer_email || data.submission.customer_email,
        });
      }

      const customerEmail = req.body.customer_email || data.submission.customer_email;
      const brrData = parseBrrBody(req.body);
      const existingPhotos = getBrrPhotos(req.params.id);
      const errors = validateBrrData(brrData, req.files, existingPhotos, req.body);

      if (errors.length > 0) {
        return renderBrrForm(res, {
          user: req.session.user,
          form: { id: data.submission.form_id, name: BRR_FORM_NAME },
          mode: 'edit',
          submission: data.submission,
          data: brrData,
          photos: existingPhotos,
          error: errors.join(' '),
          customerEmail,
        });
      }

      processBrrPhotoRemovals(req.params.id, req.body);
      saveBrrSubmission(req.params.id, data.submission.form_id, brrData);
      updateBrrPhotoMeta(req.params.id, req.body);
      saveBrrPhotos(req.params.id, data.submission.form_id, req.files, req.body);
      db.prepare(
        `UPDATE submissions SET customer_email = ?, status = 'pending', manager_notes = NULL,
         reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(customerEmail, req.params.id);

      req.session.flash = { type: 'success', message: `${BRR_FORM_NAME} updated and resubmitted.` };
      return res.redirect(`/employee/forms/${data.submission.form_id}`);
    });
  }

  if (data.submission.form_template === 'blade_inspection') {
    return birUpload(req, res, (err) => {
      if (err) {
        return renderBirForm(res, {
          user: req.session.user,
          form: { id: data.submission.form_id, name: BIR_FORM_NAME },
          mode: 'edit',
          submission: data.submission,
          data: parseBirBody(req.body),
          photos: getBirPhotos(req.params.id),
          error: err.message || 'Photo upload failed.',
          customerEmail: req.body.customer_email || data.submission.customer_email,
        });
      }

      const customerEmail = req.body.customer_email || data.submission.customer_email;
      const birData = parseBirBody(req.body);
      const errors = validateBirData(birData);

      if (errors.length > 0) {
        return renderBirForm(res, {
          user: req.session.user,
          form: { id: data.submission.form_id, name: BIR_FORM_NAME },
          mode: 'edit',
          submission: data.submission,
          data: birData,
          photos: getBirPhotos(req.params.id),
          error: errors.join(' '),
          customerEmail,
        });
      }

      processBirPhotoRemovals(req.params.id, req.body);
      saveBirSubmission(req.params.id, data.submission.form_id, birData);
      updateBirPhotoDescriptions(req.params.id, req.body);
      saveBirPhotos(req.params.id, data.submission.form_id, req.files, req.body);
      db.prepare(
        `UPDATE submissions SET customer_email = ?, status = 'pending', manager_notes = NULL,
         reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(customerEmail, req.params.id);

      req.session.flash = { type: 'success', message: `${BIR_FORM_NAME} updated and resubmitted.` };
      return res.redirect(`/employee/forms/${data.submission.form_id}`);
    });
  }

  if (data.submission.form_template === 'daily_inspection') {
    return diUpload(req, res, (err) => {
      if (err) {
        return renderDiForm(res, {
          user: req.session.user,
          form: { id: data.submission.form_id, name: DI_FORM_NAME },
          mode: 'edit',
          submission: data.submission,
          data: parseDiBody(req.body),
          photos: getDiPhotos(req.params.id),
          error: err.message || 'Photo upload failed.',
          customerEmail: req.body.customer_email || data.submission.customer_email,
        });
      }

      const customerEmail = req.body.customer_email || data.submission.customer_email;
      const diData = parseDiBody(req.body);
      const existingPhotos = getDiPhotos(req.params.id);

      if (req.body.remove_driver_photo === '1' && existingPhotos.driver) {
        deleteDiPhoto(req.params.id, existingPhotos.driver.id);
        existingPhotos.driver = null;
      }
      if (req.body.remove_passenger_photo === '1' && existingPhotos.passenger) {
        deleteDiPhoto(req.params.id, existingPhotos.passenger.id);
        existingPhotos.passenger = null;
      }

      const errors = [
        ...validateDiData(diData),
        ...validateDiPhotos(req.files, existingPhotos, req.body),
      ];

      if (errors.length > 0) {
        return renderDiForm(res, {
          user: req.session.user,
          form: { id: data.submission.form_id, name: DI_FORM_NAME },
          mode: 'edit',
          submission: data.submission,
          data: diData,
          photos: existingPhotos,
          error: errors.join(' '),
          customerEmail,
        });
      }

      saveDiSubmission(req.params.id, data.submission.form_id, diData);
      saveDiPhotos(req.params.id, data.submission.form_id, req.files);
      db.prepare(
        `UPDATE submissions SET customer_email = ?, status = 'pending', manager_notes = NULL,
         reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now') WHERE id = ?`
      ).run(customerEmail, req.params.id);

      req.session.flash = { type: 'success', message: `${DI_FORM_NAME} updated and resubmitted.` };
      return res.redirect(`/employee/forms/${data.submission.form_id}`);
    });
  }

  dynamicUpload(data.fields)(req, res, (err) => {
    if (err) {
      return res.render('employee/fill-form', {
        title: `Edit ${data.submission.form_name}`,
        user: req.session.user,
        form: { ...data.submission, fields: data.fields },
        submission: data.submission,
        values: req.body,
        photos: data.photos,
        mode: 'edit',
        error: err.message,
        defaultCustomerEmail: data.submission.customer_email,
      });
    }
    next();
  });
}, (req, res) => {
  const data = getSubmissionDisplay(req.params.id);
  const form = { max_photos: data.submission.max_photos };
  const customerEmail = req.body.customer_email || data.submission.customer_email;

  const removePhotoIds = Array.isArray(req.body.remove_photos)
    ? req.body.remove_photos.map(Number)
    : req.body.remove_photos
      ? [Number(req.body.remove_photos)]
      : [];

  const remainingPhotos = data.photos.filter((p) => !removePhotoIds.includes(p.id));
  const { errors, values } = validateSubmission(
    form,
    data.fields,
    req.body,
    req.files,
    remainingPhotos.length
  );

  if (errors.length > 0) {
    return res.render('employee/fill-form', {
      title: `Edit ${data.submission.form_name}`,
      user: req.session.user,
      form: { ...data.submission, fields: data.fields },
      submission: data.submission,
      values: req.body,
      photos: data.photos,
      mode: 'edit',
      error: errors.join(' '),
      defaultCustomerEmail: customerEmail,
    });
  }

  deleteSubmissionPhotos(req.params.id, removePhotoIds);
  saveSubmissionValues(req.params.id, data.submission.form_id, values, data.fields);
  saveSubmissionPhotos(req.params.id, data.fields, req.files);

  db.prepare(
    `UPDATE submissions SET customer_email = ?, status = 'pending', manager_notes = NULL,
     reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(customerEmail, req.params.id);

  req.session.flash = { type: 'success', message: 'Submission updated and resubmitted for review.' };
  res.redirect(`/employee/forms/${data.submission.form_id}`);
});

module.exports = router;