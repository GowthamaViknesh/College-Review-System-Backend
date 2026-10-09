import app from './app';
import { env } from './common/config/env';
import logger from './common/config/logger';
import { connectDatabase, disconnectDatabase } from './common/config/db';
import { flushActionLogs } from './services/action-log.service';
import { startKeepAlive } from './common/utils/keep-alive';

const PORT = env.port;

async function start() {
    await connectDatabase();

    // Express hands a failure to listen (most often: the port is already taken) to this callback instead
    // of throwing. Left unchecked, the process would stay alive saying it is running while every request
    // goes to whatever else holds the port, such as an older copy of this server that was never stopped.
    const server = app.listen(PORT, (err?: Error) => {
        if (err) {
            const inUse = (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
            logger.fatal({ err }, inUse ? `Port ${PORT} is already in use. Another copy of the server is probably still running; stop it first.` : 'Failed to start server');
            process.exit(1);
        }
        logger.info(`Server running on port ${PORT}`);
    });

    // Only on a host that gives the service a public address; off when running locally
    const stopKeepAlive = env.keepAlive ? startKeepAlive(env.keepAlive) : () => {};

    const shutdown = (signal: string) => {
        logger.info(`${signal} received, shutting down gracefully`);
        stopKeepAlive();
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
