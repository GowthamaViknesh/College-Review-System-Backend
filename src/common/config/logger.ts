import pino from 'pino';

// Loads .env first, so NODE_ENV and LOG_LEVEL are set whichever file happens to import the logger first
import './env';

// pino-pretty prints readable, coloured lines. It is a dev dependency, so it is absent from a production
// install. Checking for it means a development setting on a production image (an easy mistake when
// copying a .env file to a host) gives plain JSON logs instead of crashing the server at startup.
function prettyPrinterInstalled(): boolean {
    try {
        require.resolve('pino-pretty');
        return true;
    } catch {
        return false;
    }
}

const usePretty = process.env.NODE_ENV === 'development' && prettyPrinterInstalled();

const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    // Readable output while developing; one JSON object per line otherwise, which log services expect
    ...(usePretty && {
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,ms' } },
    }),
});

export default logger;
