import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Fail fast at startup with a clear message instead of a confusing error later
function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

// Anyone who knows the signing secret can forge a login token for any user, admin included.
// A short or copy-pasted example value is fine on a laptop but must never reach production.
function jwtSecret(): string {
    const secret = required('JWT_SECRET');
    const weak = secret.length < 32 || secret.startsWith('change_me');
    if (process.env.NODE_ENV === 'production' && weak) {
        throw new Error('JWT_SECRET must be a random value of at least 32 characters in production (generate one with: openssl rand -hex 32)');
    }
    return secret;
}

export const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 5000,
    mongoUri: required('MONGODB_URI'),
    jwtSecret: jwtSecret(),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    // How long action log entries are kept before MongoDB removes them
    actionLogRetentionDays: Number(process.env.ACTION_LOG_RETENTION_DAYS) || 90,
    isTest: process.env.NODE_ENV === 'test',
};
