import app from './app';
import { env } from './common/config/env';
import logger from './common/config/logger';
import { connectDatabase, disconnectDatabase } from './common/config/db';
import { flushActionLogs } from './services/action-log.service';

const PORT = env.port;

async function start() {
    await connectDatabase();

    const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

    const shutdown = (signal: string) => {
        logger.info(`${signal} received, shutting down gracefully`);
        server.close(() => {
            // Let action log entries that are still being written finish before the connection closes
            flushActionLogs()
                .then(disconnectDatabase)
                .then(() => process.exit(0));
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
});
