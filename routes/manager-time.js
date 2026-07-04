const express = require('express');
const { requireRole } = require('../middleware/auth');
const {
  getSites,
  getHoursTypes,
  saveTimeSettings,
  getManagerEntries,
  getTimeCounts,
  reviewEntry,
  getWeeklyTotals,
  getWeeklyTotalsBySite,
  groupEntriesBySite,
  getWeekStart,
  getEntryById,
} = require('../services/time');

const router = express.Router();

router.get('/', requireRole('manager'), (req, res) => {
  const filter = req.query.status || 'pending';
  const siteFilter = (req.query.site || '').trim();
  const weekStart = req.query.week || getWeekStart();
  const allEntries = getManagerEntries(filter);
  const entries = siteFilter
    ? allEntries.filter((e) => e.site === siteFilter)
    : allEntries;
  const counts = getTimeCounts();
  const weeklyTotals = getWeeklyTotals(weekStart);
  const weeklySiteTotals = getWeeklyTotalsBySite(weekStart, 'approved');
  const siteGroups = groupEntriesBySite(entries);
  const siteSummaries = groupEntriesBySite(allEntries);

  res.render('manager/time/dashboard', {
    title: 'Time Approval',
    user: req.session.user,
    entries,
    siteGroups,
    siteSummaries,
    siteFilter,
    filter,
    counts,
    weeklyTotals,
    weeklySiteTotals,
    weekStart,
    flash: req.session.flash || null,
    activeTab: 'pending',
  });
  delete req.session.flash;
});

router.get('/history', requireRole('manager'), (req, res) => {
  const siteFilter = (req.query.site || '').trim();
  const weekStart = req.query.week || getWeekStart();
  const allEntries = getManagerEntries('approved');
  const entries = siteFilter
    ? allEntries.filter((e) => e.site === siteFilter)
    : allEntries;
  const weeklyTotals = getWeeklyTotals(weekStart);
  const weeklySiteTotals = getWeeklyTotalsBySite(weekStart, 'approved');
  const siteGroups = groupEntriesBySite(entries);
  const siteSummaries = groupEntriesBySite(allEntries);

  res.render('manager/time/history', {
    title: 'Approved Time History',
    user: req.session.user,
    entries,
    siteGroups,
    siteSummaries,
    siteFilter,
    weeklyTotals,
    weeklySiteTotals,
    weekStart,
    activeTab: 'history',
  });
});

router.get('/settings', requireRole('manager'), (req, res) => {
  res.render('manager/time/settings', {
    title: 'Time Settings',
    user: req.session.user,
    sites: getSites(),
    hoursTypes: getHoursTypes(),
    error: null,
    flash: req.session.flash || null,
    activeTab: 'settings',
  });
  delete req.session.flash;
});

router.post('/settings', requireRole('manager'), (req, res) => {
  const sites = (req.body.sites || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const hoursTypes = (req.body.hours_types || '').split('\n').map((s) => s.trim()).filter(Boolean);

  if (sites.length === 0) {
    return res.render('manager/time/settings', {
      title: 'Time Settings',
      user: req.session.user,
      sites: [],
      hoursTypes,
      error: 'Add at least one site.',
      activeTab: 'settings',
    });
  }

  if (hoursTypes.length === 0) {
    return res.render('manager/time/settings', {
      title: 'Time Settings',
      user: req.session.user,
      sites,
      hoursTypes: [],
      error: 'Add at least one hours type.',
      activeTab: 'settings',
    });
  }

  saveTimeSettings(sites, hoursTypes);
  req.session.flash = { type: 'success', message: 'Time settings updated.' };
  res.redirect('/manager/time/settings');
});

router.get('/entries/:id', requireRole('manager'), (req, res) => {
  const entry = getEntryById(req.params.id);
  if (!entry) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'Time entry not found.',
      user: req.session.user,
    });
  }

  res.render('manager/time/review', {
    title: 'Review Time Entry',
    user: req.session.user,
    entry,
    error: null,
  });
});

router.post('/entries/:id/review', requireRole('manager'), (req, res) => {
  const { action, manager_notes } = req.body;
  const result = reviewEntry(req.params.id, req.session.user.id, action, manager_notes);

  if (!result.ok) {
    const entry = getEntryById(req.params.id);
    return res.render('manager/time/review', {
      title: 'Review Time Entry',
      user: req.session.user,
      entry,
      error: result.error,
    });
  }

  req.session.flash = {
    type: action === 'approve' ? 'success' : 'info',
    message: action === 'approve'
      ? `Approved ${result.entry.total_hours}h for ${result.entry.employee_name}.`
      : `Rejected time entry for ${result.entry.employee_name}.`,
  };
  res.redirect('/manager/time');
});

module.exports = router;