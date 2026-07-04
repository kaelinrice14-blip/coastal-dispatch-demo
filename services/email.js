const nodemailer = require('nodemailer');
const path = require('path');
const { getSubmissionDisplay } = require('./forms');

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatJsaEmail(submissionId, employeeName) {
  const { loadJsaSubmissionData } = require('./jsa');
  const data = getSubmissionDisplay(submissionId);
  if (!data) throw new Error('Submission not found');

  const { submission } = data;
  const jsa = loadJsaSubmissionData(submissionId, submission.form_id);
  const subject = `JSA — ${jsa.job_site || jsa.customer || 'Submission'}`;

  const textLines = [
    'JSA',
    '===',
    '',
    `Employee: ${employeeName}`,
    `Submitted: ${submission.created_at}`,
    '',
    'General Information',
    `Job Site / Wind Farm: ${jsa.job_site}`,
    `Date and Time: ${jsa.date_time}`,
    `Customer: ${jsa.customer}`,
    `Tower Number: ${jsa.tower_number}`,
    `Site Contact: ${jsa.site_contact}`,
    `Site Contact Phone Number: ${jsa.site_contact_phone}`,
    `Wind/Weather Forecast: ${jsa.wind_weather_forecast}`,
    '',
    'Work Scope:',
    jsa.work_scope,
    '',
  ];

  jsa.hazards.forEach((h, i) => {
    textLines.push(`Hazard ${i + 1}:`);
    textLines.push(`  Potential Hazard: ${h.potential_hazard}`);
    textLines.push(`  Control Measure: ${h.control_measure}`);
    textLines.push('');
  });

  textLines.push('---', 'This report was approved by your service team.');

  const hazardRows = jsa.hazards
    .map(
      (h, i) =>
        `<tr><td style="padding:8px;border:1px solid #e5e7eb">${i + 1}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(h.potential_hazard)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(h.control_measure)}</td></tr>`
    )
    .join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#1a1a2e;">
      <h2 style="color:#4f46e5;border-bottom:2px solid #e5e7eb;padding-bottom:12px;">JSA</h2>
      <h3 style="color:#374151;margin-top:24px;">General Information</h3>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:8px 0;color:#6b7280;width:200px;">Employee</td><td><strong>${escapeHtml(employeeName)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Job Site / Wind Farm</td><td>${escapeHtml(jsa.job_site)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Date and Time</td><td>${escapeHtml(jsa.date_time)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Customer</td><td>${escapeHtml(jsa.customer)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Tower Number</td><td>${escapeHtml(jsa.tower_number)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Site Contact</td><td>${escapeHtml(jsa.site_contact)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Site Contact Phone</td><td>${escapeHtml(jsa.site_contact_phone)}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Wind/Weather Forecast</td><td>${escapeHtml(jsa.wind_weather_forecast)}</td></tr>
      </table>
      <h3 style="color:#374151;">Work Scope</h3>
      <p style="white-space:pre-wrap;background:#f9fafb;padding:16px;border-radius:8px;">${escapeHtml(jsa.work_scope)}</p>
      <h3 style="color:#374151;margin-top:24px;">Hazards</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f3f4f6;">
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">#</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Potential Hazards</th>
          <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Hazard Control Measures</th>
        </tr>
        ${hazardRows}
      </table>
      <p style="color:#9ca3af;font-size:13px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">This report was approved by your service team.</p>
    </div>
  `;

  return { subject, text: textLines.join('\n'), html, attachments: [] };
}

function formatDiEmail(submissionId, employeeName) {
  const {
    loadDiSubmissionData,
    getDiPhotos,
    LIFT_INSPECTION_QUESTIONS,
    SHUTDOWN_CHECKLIST,
  } = require('./daily-inspection');
  const data = getSubmissionDisplay(submissionId);
  if (!data) throw new Error('Submission not found');

  const { submission } = data;
  const di = loadDiSubmissionData(submissionId, submission.form_id);
  const photos = getDiPhotos(submissionId);
  const formName = submission.form_name || 'Daily Aerial Inspection';
  const subject = `${formName} — ${di.inspector_name || di.site || 'Submission'}`;

  const textLines = [
    formName,
    '='.repeat(formName.length),
    '',
    `Employee: ${employeeName}`,
    `Inspector: ${di.inspector_name}`,
    `Date/Time: ${di.inspection_datetime}`,
    `Site: ${di.site}`,
    `Tower Number: ${di.tower_number}`,
    `Type of Lift: ${di.lift_type}`,
    '',
    'Lift Inspection:',
  ];

  LIFT_INSPECTION_QUESTIONS.forEach((q) => {
    textLines.push(`  ${q.label}: ${di.lift_inspection[q.key] || '—'}`);
  });

  textLines.push('', 'Shutdown Checklist:');
  SHUTDOWN_CHECKLIST.forEach((item) => {
    textLines.push(`  ${di.shutdown_checklist[item.key] ? '✓' : '✗'} ${item.label}`);
  });

  textLines.push('', '---', 'This report was approved by your service team.');

  const liftRows = LIFT_INSPECTION_QUESTIONS.map(
    (q) =>
      `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(q.label)}</td>
       <td style="padding:6px 8px;border:1px solid #e5e7eb">${escapeHtml(di.lift_inspection[q.key])}</td></tr>`
  ).join('');

  const shutdownRows = SHUTDOWN_CHECKLIST.map(
    (item) =>
      `<li>${di.shutdown_checklist[item.key] ? '✓' : '✗'} ${escapeHtml(item.label)}</li>`
  ).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#4f46e5;">${escapeHtml(formName)}</h2>
      <h3>Section 1: Daily Inspection</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6b7280;width:180px">Employee</td><td><strong>${escapeHtml(employeeName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Inspector</td><td>${escapeHtml(di.inspector_name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date/Time</td><td>${escapeHtml(di.inspection_datetime)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Site</td><td>${escapeHtml(di.site)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Tower Number</td><td>${escapeHtml(di.tower_number)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Type of Lift</td><td>${escapeHtml(di.lift_type)}</td></tr>
      </table>
      <h3 style="margin-top:20px">Section 2: Lift Inspection</h3>
      <table style="width:100%;border-collapse:collapse;">${liftRows}</table>
      <h3 style="margin-top:20px">Section 5: Shutdown Checklist</h3>
      <ul>${shutdownRows}</ul>
      ${di.signature ? `<h3 style="margin-top:20px">Signature</h3><img src="${di.signature}" style="max-width:300px;border:1px solid #e5e7eb" />` : ''}
    </div>
  `;

  const attachments = [];
  if (photos.driver) {
    attachments.push({
      filename: photos.driver.original_name,
      path: path.join(__dirname, '..', 'uploads', photos.driver.filename),
    });
  }
  if (photos.passenger) {
    attachments.push({
      filename: photos.passenger.original_name,
      path: path.join(__dirname, '..', 'uploads', photos.passenger.filename),
    });
  }

  return { subject, text: textLines.join('\n'), html, attachments };
}

function formatBirEmail(submissionId, employeeName) {
  const { loadBirSubmissionData, getBirPhotos } = require('./blade-inspection');
  const data = getSubmissionDisplay(submissionId);
  if (!data) throw new Error('Submission not found');

  const { submission } = data;
  const bir = loadBirSubmissionData(submissionId, submission.form_id);
  const photos = getBirPhotos(submissionId);
  const formName = submission.form_name || 'Blade Inspection Report';
  const subject = `${formName} — ${bir.site || bir.damage_id || 'Submission'}`;

  const textLines = [
    formName,
    '='.repeat(formName.length),
    '',
    `Employee: ${employeeName}`,
    `Site: ${bir.site}`,
    `Customer: ${bir.customer}`,
    `WTG Platform: ${bir.wtg_platform}`,
    `WTG Local ID: ${bir.wtg_local_id}`,
    `Blade OEM: ${bir.blade_oem}`,
    `Blade Type: ${bir.blade_type}`,
    `Blade Length: ${bir.blade_length}`,
    `Blade Designation: ${bir.blade_designation}`,
    `Blade Serial Number: ${bir.blade_serial_number}`,
    `Damage ID: ${bir.damage_id}`,
    `Inspection Date: ${bir.inspection_date}`,
    `Report Date: ${bir.report_date}`,
    `Damage Location Radius: ${bir.damage_location_radius}`,
    `Damage Location: ${bir.damage_location}`,
    `Damage Description: ${bir.damage_description}`,
    '',
    'Technicians:',
    ...bir.technicians.map((t, i) => `  ${i + 1}. ${t}`),
    '',
    '---',
    'This report was approved by your service team.',
  ];

  const techList = bir.technicians
    .map((t, i) => `<li>${i + 1}. ${escapeHtml(t)}</li>`)
    .join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#4f46e5;">${escapeHtml(formName)}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6b7280;width:180px">Employee</td><td><strong>${escapeHtml(employeeName)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Site</td><td>${escapeHtml(bir.site)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Customer</td><td>${escapeHtml(bir.customer)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">WTG Platform</td><td>${escapeHtml(bir.wtg_platform)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Blade Type</td><td>${escapeHtml(bir.blade_type)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Damage Location</td><td>${escapeHtml(bir.damage_location)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Damage Description</td><td>${escapeHtml(bir.damage_description)}</td></tr>
      </table>
      <h3 style="margin-top:20px">Technicians</h3>
      <ul>${techList}</ul>
      ${photos.length > 0 ? `<p style="color:#6b7280;">${photos.length} damage photo(s) attached.</p>` : ''}
    </div>
  `;

  const attachments = photos.map((photo) => ({
    filename: photo.original_name,
    path: path.join(__dirname, '..', 'uploads', photo.filename),
  }));

  return { subject, text: textLines.join('\n'), html, attachments };
}

function formatSubmissionEmail(submissionId, employeeName) {
  const data = getSubmissionDisplay(submissionId);
  if (!data) throw new Error('Submission not found');

  if (data.submission.form_template === 'jsa') {
    return formatJsaEmail(submissionId, employeeName);
  }

  if (data.submission.form_template === 'daily_inspection') {
    return formatDiEmail(submissionId, employeeName);
  }

  if (data.submission.form_template === 'blade_inspection') {
    return formatBirEmail(submissionId, employeeName);
  }

  if (data.submission.form_template === 'blade_repair') {
    const { loadBrrSubmissionData, getBrrPhotos, FORM_NAME } = require('./blade-repair');
    const { submission } = data;
    const brr = loadBrrSubmissionData(submissionId, submission.form_id);
    const photos = getBrrPhotos(submissionId);
    const allPhotos = Object.values(photos).flat();
    const subject = `${FORM_NAME} — ${brr.site || brr.damage_id || 'Submission'}`;
    const text = [
      FORM_NAME,
      `Employee: ${employeeName}`,
      `Site: ${brr.site}`,
      `Customer: ${brr.customer}`,
      `Damage ID: ${brr.damage_id}`,
      `${allPhotos.length} photo(s) attached.`,
    ].join('\n');
    const html = `<h2>${FORM_NAME}</h2><p>Site: ${brr.site}</p><p>Customer: ${brr.customer}</p>`;
    const attachments = allPhotos.map((p) => ({
      filename: p.original_name,
      path: path.join(__dirname, '..', 'uploads', p.filename),
    }));
    return { subject, text, html, attachments };
  }

  const { submission, values, photos } = data;
  const customerName = values.find((v) => v.field_type === 'customer_name')?.value;
  const subject = `${submission.form_name}${customerName ? ` — ${customerName}` : ''}`;

  const textLines = [
    submission.form_name,
    '='.repeat(submission.form_name.length),
    '',
    `Employee: ${employeeName}`,
    `Submitted: ${submission.created_at}`,
    '',
  ];

  values.forEach((v) => {
    if (v.value) {
      textLines.push(`${v.label}:`, v.value, '');
    }
  });

  if (photos.length > 0) {
    textLines.push(`Photos attached: ${photos.length}`);
  }

  textLines.push('---', 'This report was approved by your service team.');

  const shortFields = values.filter(
    (v) => v.value && !['textarea', 'job_details', 'site_contacts'].includes(v.field_type)
  );
  const longFields = values.filter(
    (v) => v.value && ['textarea', 'job_details', 'site_contacts'].includes(v.field_type)
  );

  const shortRows = shortFields
    .map(
      (v) =>
        `<tr><td style="padding:8px 0;color:#6b7280;width:160px;">${escapeHtml(v.label)}</td>
        <td style="padding:8px 0;">${escapeHtml(v.value)}</td></tr>`
    )
    .join('');

  const longSections = longFields
    .map(
      (v) =>
        `<h3 style="color:#374151;margin-top:20px;">${escapeHtml(v.label)}</h3>
        <p style="white-space:pre-wrap;line-height:1.6;background:#f9fafb;padding:16px;border-radius:8px;">${escapeHtml(v.value)}</p>`
    )
    .join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e;">
      <h2 style="color:#4f46e5;border-bottom:2px solid #e5e7eb;padding-bottom:12px;">${escapeHtml(submission.form_name)}</h2>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr><td style="padding:8px 0;color:#6b7280;width:160px;">Employee</td><td style="padding:8px 0;"><strong>${escapeHtml(employeeName)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;">Submitted</td><td style="padding:8px 0;">${escapeHtml(submission.created_at)}</td></tr>
        ${shortRows}
      </table>
      ${longSections}
      ${photos.length > 0 ? `<p style="color:#6b7280;">${photos.length} photo(s) attached to this email.</p>` : ''}
      <p style="color:#9ca3af;font-size:13px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">This report was approved by your service team.</p>
    </div>
  `;

  const attachments = photos.map((p) => ({
    filename: p.original_name,
    path: path.join(__dirname, '..', 'uploads', p.filename),
  }));

  return { subject, text: textLines.join('\n'), html, attachments };
}

async function sendApprovedSubmissionEmail(submissionId, employeeName) {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('[email] SMTP not configured — skipping email send');
    return { sent: false, reason: 'SMTP not configured' };
  }

  const submission = require('../db/database')
    .prepare('SELECT customer_email FROM submissions WHERE id = ?')
    .get(submissionId);

  const { subject, text, html, attachments } = formatSubmissionEmail(submissionId, employeeName);
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: submission.customer_email,
    subject,
    text,
    html,
    attachments,
  });

  return { sent: true };
}

module.exports = { sendApprovedSubmissionEmail, formatSubmissionEmail };