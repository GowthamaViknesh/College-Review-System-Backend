import dns from 'node:dns';
import mongoose from 'mongoose';

import { env } from './env';
import logger from './logger';
import { backfillPublicIds } from '../../services/public-id.service';
import { syncRoles } from '../../services/role.service';
import { fillMissingCountry } from '../../repositories/college.repository';

export async function connectDatabase() {
    // Some local resolvers (VPN / DNS proxies) refuse SRV lookups needed by mongodb+srv:// URIs
    if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(','));

    logger.info('Connecting to the database');
    await mongoose.connect(env.mongoUri);
    logger.info('MongoDB connected');

    // Before anything is served: records made before public ids existed get one, so every lookup by public id finds them
    await backfillPublicIds();

    // Colleges recorded before they had a country were all Indian ones
    const withCountry = await fillMissingCountry('India');
    if (withCountry) logger.info(`Set the country of ${withCountry} existing colleges to India`);

    // Keep roles consistent with the permissions defined in code, and make sure the admin role exists
    await syncRoles();
    logger.info('Roles synced');
}

export function disconnectDatabase() {
    return mongoose.connection.close();
}
