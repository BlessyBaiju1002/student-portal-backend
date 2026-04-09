const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const pool    = require('../config/db');
const logger  = require('../utils/logger');
const { authenticate, authorize, writeAuditLog } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/stats', async (req, res, next) => {
  try {
    const [users, courses, enrollments, recentLogs] = await Promise.all([
      pool.query('SELECT role, COUNT(*) FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*) FROM courses WHERE is_active = TRUE'),
      pool.query('SELECT status, COUNT(*) FROM enrollments GROUP BY status'),
      pool.query(`SELECT action, status, COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY action, status`),
    ]);
    res.json({
      usersByRole:     users.rows,
      activeCourses:   parseInt(courses.rows[0].count),
      enrollments:     enrollments.rows,
      last24hActivity: recentLogs.rows,
    });
  } catch (err) { next(err); }
});

router.get('/users', [
  query('role').optional().isIn(['student', 'instructor', 'admin']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { role, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    let queryText, queryParams;
    if (role) {
      queryText  = `SELECT id, uuid, full_name, email, role, is_active, created_at FROM users WHERE role = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      queryParams = [role, limit, offset];
    } else {
      queryText  = `SELECT id, uuid, full_name, email, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
      queryParams = [limit, offset];
    }
    const result      = await pool.query(queryText, queryParams);
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ users: result.rows, total: parseInt(countResult.rows[0].count), page, limit });
  } catch (err) { next(err); }
});

router.get('/users/:id', [
  param('id').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const result = await pool.query(
      'SELECT id, uuid, full_name, email, role, is_active, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
});

router.put('/users/:id/role', [
  param('id').isInt({ min: 1 }),
  body('role').isIn(['student', 'instructor', 'admin']),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Admins cannot change their own role.' });
  }
  try {
    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, role',
      [req.body.role, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    await writeAuditLog(req.user.id, 'ROLE_CHANGED', `/admin/users/${req.params.id}/role`, req.ip, req.headers['user-agent'], 'success', { newRole: req.body.role });
    res.json({ message: 'Role updated.', user: result.rows[0] });
  } catch (err) { next(err); }
});

router.put('/users/:id/toggle', [
  param('id').isInt({ min: 1 }),
], async (req, res, next) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Admins cannot deactivate their own account.' });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, full_name, email, is_active`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    const action = result.rows[0].is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
    await writeAuditLog(req.user.id, action, `/admin/users/${req.params.id}/toggle`, req.ip, req.headers['user-agent'], 'success', {});
    res.json({ message: `User ${result.rows[0].is_active ? 'activated' : 'deactivated'}.`, user: result.rows[0] });
  } catch (err) { next(err); }
});

router.get('/logs', [
  query('action').optional().trim().isLength({ max: 50 }),
  query('status').optional().isIn(['success', 'failure', 'warning']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { action, status, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const conditions  = [];
    const queryParams = [];
    let   paramIndex  = 1;
    if (action) { conditions.push(`al.action ILIKE $${paramIndex++}`); queryParams.push(`%${action}%`); }
    if (status) { conditions.push(`al.status = $${paramIndex++}`);     queryParams.push(status); }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    queryParams.push(limit, offset);
    const result = await pool.query(
      `SELECT al.id, al.action, al.resource, al.ip_address, al.status, al.details, al.created_at,
              u.email AS user_email, u.role AS user_role
       FROM   audit_logs al
       LEFT   JOIN users u ON u.id = al.user_id
       ${whereClause}
       ORDER  BY al.created_at DESC
       LIMIT  $${paramIndex} OFFSET $${paramIndex + 1}`,
      queryParams
    );
    res.json({ logs: result.rows, page, limit });
  } catch (err) { next(err); }
});

module.exports = router;