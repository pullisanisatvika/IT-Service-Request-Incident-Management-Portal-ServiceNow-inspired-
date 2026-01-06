const express = require('express');
const bcrypt = require('bcryptjs');

const { getQuery } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  try {
    const user = await getQuery('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    req.session.user = { id: user.id, email: user.email, role: user.role, name: user.name };
    res.json({ user: req.session.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

module.exports = router;
