const express = require('express');
const { authenticateUser } = require('../services/users');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { title: 'Sign In', error: null });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = authenticateUser(email, password);

  if (!user) {
    return res.render('login', { title: 'Sign In', error: 'Invalid email or password.' });
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  if (user.role === 'manager') {
    return res.redirect('/manager');
  }
  res.redirect('/employee');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;