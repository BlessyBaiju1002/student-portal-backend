const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const pool    = require('../config/db');
const { authenticate, authorize, writeAuditLog } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, [
  query('search').optional().trim().isLength({ max: 100 }).escape(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let queryText, queryParams;

    if (search) {
      queryText = `
        SELECT c.id, c.course_code, c.title, c.description,
               u.full_name AS instructor_name, c.max_capacity, c.is_active
        FROM   courses c
        LEFT   JOIN users u ON u.id = c.instructor_id
        WHERE  c.is_active = TRUE
          AND  (c.title ILIKE $1 OR c.course_code ILIKE $1)
        ORDER  BY c.title
        LIMIT  $2 OFFSET $3`;
      queryParams = [`%${search}%`, limit, offset];
    } else {
      queryText = `
        SELECT c.id, c.course_code, c.title, c.description,
               u.full_name AS instructor_name, c.max_capacity, c.is_active
        FROM   courses c
        LEFT   JOIN users u ON u.id = c.instructor_id
        WHERE  c.is_active = TRUE
        ORDER  BY c.title
        LIMIT  $1 OFFSET $2`;
      queryParams = [limit, offset];
    }

    const result = await pool.query(queryText, queryParams);
    res.json({ courses: result.rows, page, limit });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, [
  param('id').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const result = await pool.query(
      `SELECT c.id, c.course_code, c.title, c.description,
              u.full_name AS instructor_name, c.max_capacity, c.is_active
       FROM   courses c
       LEFT   JOIN users u ON u.id = c.instructor_id
       WHERE  c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });
    res.json({ course: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, authorize('admin', 'instructor'), [
  body('course_code').trim().notEmpty().isLength({ max: 20 }).escape(),
  body('title').trim().notEmpty().isLength({ max: 200 }).escape(),
  body('description').optional().trim().isLength({ max: 2000 }).escape(),
  body('max_capacity').optional().isInt({ min: 1, max: 500 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { course_code, title, description, max_capacity = 30 } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO courses (course_code, title, description, instructor_id, max_capacity)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, course_code, title, description, max_capacity, created_at`,
      [course_code, title, description, req.user.id, max_capacity]
    );
    await writeAuditLog(req.user.id, 'COURSE_CREATED', '/courses', req.ip, req.headers['user-agent'], 'success', { course_code });
    res.status(201).json({ message: 'Course created.', course: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('admin'), [
  param('id').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const result = await pool.query(
      'UPDATE courses SET is_active = FALSE WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });
    await writeAuditLog(req.user.id, 'COURSE_DELETED', `/courses/${req.params.id}`, req.ip, req.headers['user-agent'], 'success', {});
    res.json({ message: 'Course deactivated.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;