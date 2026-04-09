const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('[ErrorHandler] Unhandled error', {
    message:  err.message,
    stack:    err.stack,
    path:     req.path,
    method:   req.method,
    ip:       req.ip,
    userId:   req.user?.id || null,
  });

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 5}MB.`
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field in upload request.' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with this value already exists.' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource does not exist.' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }

  const isDev = process.env.NODE_ENV !== 'production';

  res.status(err.status || 500).json({
    error:   isDev ? err.message : 'Internal server error. Please try again later.',
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;