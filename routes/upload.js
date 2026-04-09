const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool     = require('../config/db');
const logger   = require('../utils/logger');
const { authenticate, writeAuditLog } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeName = `${uuidv4()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const ext      = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`INVALID_EXTENSION: File type '${ext}' is not permitted.`), false);
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return cb(new Error(`INVALID_MIME: MIME type '${mimeType}' is not permitted.`), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

router.post('/', authenticate, uploadLimiter, (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `File exceeds maximum size of ${process.env.MAX_FILE_SIZE_MB || 5}MB.` });
      }
      if (err.message.startsWith('INVALID_')) {
        logger.warn('[Upload] Rejected file', { reason: err.message, userId: req.user.id });
        await writeAuditLog(req.user.id, 'UPLOAD_REJECTED', '/upload', req.ip, req.headers['user-agent'], 'warning', { reason: err.message });
        return res.status(400).json({ error: 'File type not allowed. Accepted: JPEG, PNG, PDF.' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided.' });
    }

    const { originalname, filename, mimetype, size } = req.file;
    const purpose = req.body.purpose || 'document';
    const ALLOWED_PURPOSES = ['profile_image', 'document', 'assignment'];

    if (!ALLOWED_PURPOSES.includes(purpose)) {
      return res.status(400).json({ error: `Invalid purpose. Allowed: ${ALLOWED_PURPOSES.join(', ')}.` });
    }

    try {
      const result = await pool.query(
        `INSERT INTO file_uploads
           (user_id, original_name, stored_name, file_type, file_size_bytes, upload_purpose)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, original_name, file_type, file_size_bytes, upload_purpose, uploaded_at`,
        [req.user.id, originalname, filename, mimetype, size, purpose]
      );

      await writeAuditLog(req.user.id, 'FILE_UPLOADED', '/upload', req.ip, req.headers['user-agent'], 'success', { originalname, purpose });
      logger.info('[Upload] File uploaded', { userId: req.user.id, file: filename });

      res.status(201).json({ message: 'File uploaded successfully.', file: result.rows[0] });
    } catch (dbErr) {
      fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
      next(dbErr);
    }
  });
});

router.get('/my-files', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, original_name, file_type, file_size_bytes, upload_purpose, uploaded_at
       FROM   file_uploads
       WHERE  user_id = $1
       ORDER  BY uploaded_at DESC`,
      [req.user.id]
    );
    res.json({ files: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;