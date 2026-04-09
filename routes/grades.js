const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool    = require('../config/db');
const { authenticate, authorize, writeAuditLog } = require('../middleware/auth');

const router = express.Router();

router.get('/my', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.id, c.course_code, c.title, e.grade, e.status, e.enrolled_at
       FROM   enrollments e
       JOIN   courses c ON c.id = e.course_id
       WHERE  e.student_id = $1
       ORDER  BY e.enrolled_at DESC`,
      [req.user.id]
    );
    res.json({ enrollments: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/student/:id', authenticate, authorize('admin', 'instructor'), [
  param('id').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const userCheck = await pool.query(
      'SELECT id, full_name FROM users WHERE id = $1 AND role = $2',
      [req.params.id, 'student']
    );
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
    const result = await pool.query(
      `SELECT e.id, c.course_code, c.title, e.grade, e.status, e.enrolled_at
       FROM   enrollments e
       JOIN   courses c ON c.id = e.course_id
       WHERE  e.student_id = $1
       ORDER  BY e.enrolled_at DESC`,
      [req.params.id]
    );
    res.json({ student: userCheck.rows[0], enrollments: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/enroll', authenticate, authorize('student'), [
  body('course_id').isInt({ min: 1 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { course_id } = req.body;
  try {
    const courseCheck = await pool.query(
      'SELECT id, title, max_capacity FROM courses WHERE id = $1 AND is_active = TRUE',
      [course_id]
    );
    if (courseCheck.rows.length === 0) return res.status(404).json({ error: 'Course not found.' });
    const enrolled = await pool.query(
      'SELECT COUNT(*) FROM enrollments WHERE course_id = $1 AND status = $2',
      [course_id, 'enrolled']
    );
    if (parseInt(enrolled.rows[0].count) >= courseCheck.rows[0].max_capacity) {
      return res.status(409).json({ error: 'Course is full.' });
    }
    const result = await pool.query(
      `INSERT INTO enrollments (student_id, course_id, status)
       VALUES ($1, $2, 'enrolled')
       RETURNING id, status, enrolled_at`,
      [req.user.id, course_id]
    );
    await writeAuditLog(req.user.id, 'COURSE_ENROLLED', '/grades/enroll', req.ip, req.headers['user-agent'], 'success', { course_id });
    res.status(201).json({ message: 'Enrolled successfully.', enrollment: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Already enrolled in this course.' });
    next(err);
  }
});

router.put('/:enrollmentId', authenticate, authorize('admin', 'instructor'), [
  param('enrollmentId').isInt({ min: 1 }),
  body('grade').isFloat({ min: 0, max: 100 }),
  body('status').optional().isIn(['enrolled', 'completed', 'dropped']),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { grade, status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE enrollments
       SET grade = $1, status = COALESCE($2, status)
       WHERE id = $3
       RETURNING id, student_id, course_id, grade, status`,
      [grade, status, req.params.enrollmentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Enrollment not found.' });
    await writeAuditLog(req.user.id, 'GRADE_UPDATED', `/grades/${req.params.enrollmentId}`, req.ip, req.headers['user-agent'], 'success', { grade });
    res.json({ message: 'Grade updated.', enrollment: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;