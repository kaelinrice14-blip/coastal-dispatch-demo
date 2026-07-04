function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (req.session.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You do not have permission to view this page.',
        user: req.session.user,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };