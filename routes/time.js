const express = require('express');
const { requireRole } = require('../middleware/auth');
const {
  getSites,
  getHoursTypes,
  US_STATES,
  getFormReferencesForDay,
  parseEntryBody,
  validateEntry,
  getDraftEntries,
  getEntriesForUser,
  createDraftEntry,
  deleteDraftEntry,
  submitDraftEntries,
  getEmployeeWeekTotal,
  getWeekStart,
} = require('../services/time');

const router = express.Router();

const today = () => new Date().toISOString().split('T')[0];

router.get('/', requireRole('employee'), (req, res) => {
  const weekStart = req.query.week || getWeekStart();
  const weekTotal = getEmployeeWeekTotal(req.session.user.id, weekStart);
  const recent = getEntriesForUser(req.session.user.id, 'all').slice(0, 10);
  const drafts = getDraftEntries(req.session.user.id);

  res.render('time/dashboard', {
    title: 'Submit Time',
    user: req.session.user,
    weekTotal,
    recent,
    draftCount: drafts.length,
    flash: req.session.flash || null,
    activeTab: 'overview',
  });
  delete req.session.flash;
});

router.get('/submit', requireRole('employee'), (req, res) => {
  const entryDate = req.query.date || today();
  const drafts = getDraftEntries(req.session.user.id);
  const formRefs = getFormReferencesForDay(req.session.user.id, entryDate);

  res.render('time/submit', {
    title: 'Submit Time',
    user: req.session.user,
    sites: getSites(),
    states: US_STATES,
    hoursTypes: getHoursTypes(),
    drafts,
    formRefs,
    entryDate,
    today: today(),
    error: null,
    activeTab: 'submit',
  });
});

router.post('/entries', requireRole('employee'), (req, res) => {
  const data = parseEntryBody(req.body);
  const errors = validateEntry(data);

  if (errors.length > 0) {
    const entryDate = data.entry_date || today();
    return res.render('time/submit', {
      title: 'Submit Time',
      user: req.session.user,
      sites: getSites(),
      states: US_STATES,
      hoursTypes: getHoursTypes(),
      drafts: getDraftEntries(req.session.user.id),
      formRefs: getFormReferencesForDay(req.session.user.id, entryDate),
      entryDate,
      today: today(),
      error: errors.join(' '),
      form: req.body,
      activeTab: 'submit',
    });
  }

  if (data.submission_id) {
    const ref = getFormReferencesForDay(req.session.user.id, data.entry_date)
      .find((r) => r.id === data.submission_id);
    if (ref) data.job_reference = ref.label;
  }

  createDraftEntry(req.session.user.id, data);
  req.session.flash = { type: 'success', message: 'Time entry added. Submit when ready.' };
  res.redirect('/time/submit');
});

router.post('/entries/:id/delete', requireRole('employee'), (req, res) => {
  deleteDraftEntry(req.params.id, req.session.user.id);
  res.redirect('/time/submit');
});

router.post('/submit', requireRole('employee'), (req, res) => {
  const result = submitDraftEntries(req.session.user.id);
  if (result.count === 0) {
    req.session.flash = { type: 'warning', message: 'Add at least one time entry before submitting.' };
    return res.redirect('/time/submit');
  }
  req.session.flash = {
    type: 'success',
    message: `${result.count} time ${result.count === 1 ? 'entry' : 'entries'} submitted for manager approval.`,
  };
  res.redirect('/time');
});

router.get('/history', requireRole('employee'), (req, res) => {
  const filter = req.query.status || 'all';
  const weekStart = req.query.week || getWeekStart();
  const entries = getEntriesForUser(req.session.user.id, filter);
  const weekTotal = getEmployeeWeekTotal(req.session.user.id, weekStart);

  res.render('time/history', {
    title: 'My Time History',
    user: req.session.user,
    entries,
    filter,
    weekTotal,
    weekStart,
    activeTab: 'history',
  });
});

router.get('/api/form-refs', requireRole('employee'), (req, res) => {
  const date = req.query.date || today();
  res.json(getFormReferencesForDay(req.session.user.id, date));
});

module.exports = router;