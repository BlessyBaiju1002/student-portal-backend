const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json } = format;

const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`;
});

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: combine(timestamp(), json()),
  transports: [
    new transports.File({
      filename: 'logs/combined.log',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
  }));
}

module.exports = logger;