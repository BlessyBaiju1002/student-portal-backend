const jwt      = require('jsonwebtoken');
const pool     = require('../config/db');
const logger   = require('../utils/logger');

async function writeAuditLog(userId, action, resource, ip, userAgent, status, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs
         (user_id, action, resource, ip_address, user_agent, status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, resource, ip, userAgent, status, JSON.stringify(details)]
    );
  } catch (err) {
    logger.error('[AuditLog] Failed to write audit entry', { error: err.message });
  }
}

const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const result = await pool.query(
      'SELECT id, uuid, full_name, email, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      await writeAuditLog(
        decoded.id, 'AUTH_REJECTED', req.path,
        req.ip, req.headers['user-agent'], 'failure',
        { reason: 'User not found or deactivated' }
      );
      return res.status(401).json({ error: 'Account not found or deactivated.' });
    }

    req.user = result.rows[0];
    next();

  } catch (err) {
    const reason = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    logger.warn('[Auth] JWT verification failed', { reason, ip: req.ip });
    await writeAuditLog(
      null, 'AUTH_REJECTED', req.path,
      req.ip, req.headers['user-agent'], 'failure',
      { reason }
    );
    return res.status(401).json({ error: reason });
  }
};

const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      await writeAuditLog(
        req.user.id, 'UNAUTHORIZED_ACCESS', req.path,
        req.ip, req.headers['user-agent'], 'failure',
        { userRole: req.user.role, requiredRoles: allowedRoles }
      );
      logger.warn('[Auth] Unauthorized access attempt', {
        userId: req.user.id,
        role:   req.user.role,
        path:   req.path,
      });
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize, writeAuditLog };