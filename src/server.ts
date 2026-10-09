import './config/env';
import dns from 'node:dns';
import mongoose from 'mongoose';
import app from './app';
import logger from './config/logger';

// Some local resolvers (VPN / DNS proxies) refuse SRV lookups needed by mongodb+srv:// URIs
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));

const PORT = Number(process.env.PORT);
const MONGO_URI = process.env.MONGODB_URI;

async function start() {
  logger.info('Connecting to the database');
  await mongoose.connect(MONGO_URI ?? '');
  logger.info('MongoDB connected');

  const server = app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      mongoose.connection.close().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
