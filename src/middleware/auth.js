const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    next();
    return;
  }
  res.status(401).json({ message: 'Authentication required' });
};

const requireRole = (role) => (req, res, next) => {
  if (!req.session || !req.session.user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  if (req.session.user.role !== role) {
    res.status(403).json({ message: 'Insufficient permissions' });
    return;
  }

  next();
};

module.exports = { requireAuth, requireRole };
