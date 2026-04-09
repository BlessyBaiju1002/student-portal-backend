const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    error: 'Too many requests from this IP. Please try again later.'
  },
  handler: (req, res, next, options) => {
    logger.warn('[RateLimit] API rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many login attempts. Please wait 15 minutes before trying again.'
  },
  handler: (req, res, next, options) => {
    logger.warn('[RateLimit] Login rate limit exceeded', {
      ip:    req.ip,
      email: req.body?.email ? req.body.email.substring(0, 5) + '***' : 'unknown',
    });
    res.status(429).json(options.message);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message: {
    error: 'Too many file uploads. Please wait before uploading again.'
  },
});

module.exports = { apiLimiter, loginLimiter, uploadLimiter };