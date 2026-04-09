require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const morgan     = require('morgan');
const path       = require('path');
const fs         = require('fs');

const logger       = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes    = require('./routes/auth');
const courseRoutes  = require('./routes/courses');
const gradesRoutes  = require('./routes/grades');
const uploadRoutes  = require('./routes/upload');
const adminRoutes   = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 5000;

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'"],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],
    },
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('[CORS] Blocked request from unauthorized origin', { origin });
      callback(new Error('CORS: Origin not allowed.'));
    }
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

const morganStream = { write: (message) => logger.info(message.trim()) };
app.use(morgan(':method :url :status :res[content-length] - :response-time ms :remote-addr', {
  stream: morganStream,
}));

app.use('/api/', apiLimiter);

app.use('/api/auth',    authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/grades',  gradesRoutes);
app.use('/api/upload',  uploadRoutes);
app.use('/api/admin',   adminRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`[Server] Student Portal running on port ${PORT}`);
  console.log(`\n✅ Server running → http://localhost:${PORT}`);
  console.log(`📋 Health check  → http://localhost:${PORT}/health\n`);
});

process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM received. Shutting down gracefully.');
  process.exit(0);
});

module.exports = app;