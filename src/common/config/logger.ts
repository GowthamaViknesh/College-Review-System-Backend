import pino from 'pino';

// Loads .env first, so NODE_ENV and LOG_LEVEL are set whichever file happens to import the logger first
import './env';

const isDev = process.env.NODE_ENV === 'development';

const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    // Pretty, colored output locally; plain JSON in production for log aggregators
    ...(isDev && {
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,ms' } },
    }),
});

export default logger;
