const express = require('express');
const { requireRole } = require('../middleware/auth');
const {
  ROLES,
  getAllUsers,
  getUserById,
  validateUserData,
  createUser,
  updateUser,
} = require('../services/users');

const router = express.Router();

router.get('/', requireRole('manager'), (req, res) => {
  res.render('manager/users/list', {
    title: 'Manage Employees',
    user: req.session.user,
    users: getAllUsers(),
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.get('/new', requireRole('manager'), (req, res) => {
  res.render('manager/users/form', {
    title: 'Add Employee',
    user: req.session.user,
    editUser: null,
    roles: ROLES,
    error: null,
    form: { name: '', email: '', job_title: '', role: 'employee', password: '' },
  });
});

router.post('/', requireRole('manager'), (req, res) => {
  const { errors, data } = validateUserData(req.body, { isCreate: true });

  if (errors.length > 0) {
    return res.render('manager/users/form', {
      title: 'Add Employee',
      user: req.session.user,
      editUser: null,
      roles: ROLES,
      error: errors.join(' '),
      form: data,
    });
  }

  const created = createUser(data);
  req.session.flash = { type: 'success', message: `${created.name} has been added.` };
  res.redirect('/manager/users');
});

router.get('/:id/edit', requireRole('manager'), (req, res) => {
  const editUser = getUserById(req.params.id);
  if (!editUser) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'User not found.',
      user: req.session.user,
    });
  }

  res.render('manager/users/form', {
    title: 'Edit Employee',
    user: req.session.user,
    editUser,
    roles: ROLES,
    error: null,
    form: {
      name: editUser.name,
      email: editUser.email,
      job_title: editUser.job_title || '',
      role: editUser.role,
      password: editUser.manager_visible_password || '',
    },
  });
});

router.post('/:id', requireRole('manager'), (req, res) => {
  const editUser = getUserById(req.params.id);
  if (!editUser) {
    return res.status(404).render('error', {
      title: 'Not Found',
      message: 'User not found.',
      user: req.session.user,
    });
  }

  const editingSelf = editUser.id === req.session.user.id;
  const { errors, data } = validateUserData(req.body, {
    isCreate: false,
    userId: editUser.id,
    editingSelf,
  });

  if (errors.length > 0) {
    return res.render('manager/users/form', {
      title: 'Edit Employee',
      user: req.session.user,
      editUser,
      roles: ROLES,
      error: errors.join(' '),
      form: data,
    });
  }

  const updated = updateUser(editUser.id, data);

  if (editingSelf) {
    req.session.user = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    };
  }

  req.session.flash = { type: 'success', message: `${updated.name} has been updated.` };
  res.redirect('/manager/users');
});

module.exports = router;