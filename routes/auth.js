const express          = require('express');
const bcrypt           = require('bcryptjs');
const jwt              = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool             = require('../config/db');
const logger           = require('../utils/logger');
const { authenticate, writeAuditLog } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const registerValidation = [
  body('full_name').trim().notEmpty().isLength({ min: 2, max: 100 }).matches(/^[A-Za-z\s'-]+$/),
  body('email').trim().isEmail().normalizeEmail().isLength({ max: 150 }),
  body('password')
    .isLength({ min: 8 })
    .matches(/[A-Z]/)
    .matches(/[a-z]/)
    .matches(/[0-9]/)
    .matches(/[!@#$%^&*]/),
];

const loginValidation = [
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

router.post('/register', registerValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { full_name, email, password } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'student')
       RETURNING id, uuid, full_name, email, role, created_at`,
      [full_name, email, password_hash]
    );

    const user = result.rows[0];
    await writeAuditLog(user.id, 'USER_REGISTERED', '/auth/register', req.ip, req.headers['user-agent'], 'success', {});
    logger.info('[Auth] New user registered', { userId: user.id });

    res.status(201).json({
      message: 'Account created successfully.',
      user: { uuid: user.uuid, full_name: user.full_name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', loginLimiter, loginValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, uuid, full_name, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );

    const DUMMY_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewpVnJl5v7kDxLqS';
    const user        = result.rows[0];
    const hashToCheck = user ? user.password_hash : DUMMY_HASH;
    const passwordMatch = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatch) {
      await writeAuditLog(user?.id || null, 'LOGIN_FAILED', '/auth/login', req.ip, req.headers['user-agent'], 'failure', { email });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact support.' });
    }

    const token = jwt.sign(
      { id: user.id, uuid: user.uuid, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h', algorithm: 'HS256' }
    );

    await writeAuditLog(user.id, 'LOGIN_SUCCESS', '/auth/login', req.ip, req.headers['user-agent'], 'success', {});
    logger.info('[Auth] User logged in', { userId: user.id });

    res.json({
      message: 'Login successful.',
      token,
      user: { uuid: user.uuid, full_name: user.full_name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', authenticate, async (req, res) => {
  await writeAuditLog(req.user.id, 'LOGOUT', '/auth/logout', req.ip, req.headers['user-agent'], 'success', {});
  res.json({ message: 'Logged out successfully. Please delete your token client-side.' });
});

router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: { uuid: req.user.uuid, full_name: req.user.full_name, email: req.user.email, role: req.user.role }
  });
});

module.exports = router;