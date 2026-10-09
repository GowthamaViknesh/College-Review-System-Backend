import dns from 'node:dns';
import mongoose from 'mongoose';

import { env } from './env';
import logger from './logger';
import { syncRoles } from '../../services/role.service';

export async function connectDatabase() {
    // Some local resolvers (VPN / DNS proxies) refuse SRV lookups needed by mongodb+srv:// URIs
    if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));

    logger.info('Connecting to the database');
    await mongoose.connect(env.mongoUri);
    logger.info('MongoDB connected');

    // Keep roles consistent with the permissions defined in code, and make sure the admin role exists
    await syncRoles();
    logger.info('Roles synced');
}

export function disconnectDatabase() {
    return mongoose.connection.close();
}
