import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Fail fast at startup with a clear message instead of a confusing error later
function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

export const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 5000,
    mongoUri: required('MONGODB_URI'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    isTest: process.env.NODE_ENV === 'test',
};
