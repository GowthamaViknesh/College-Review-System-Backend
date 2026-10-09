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

// There is no fallback port: the server listens exactly where it is told to, or does not start
function port(): number {
    const value = Number(required('PORT'));
    if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error('PORT must be a whole number between 0 and 65535');
    return value;
}

// CORS_ORIGIN may list several addresses separated by commas, e.g. the deployed frontend and localhost.
// Left unset, any site may call the API from a browser, which is only acceptable on your own machine.
function corsOrigins(): string | string[] {
    const origins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);
    return origins.length ? origins : '*';
}

// How many proxies sit in front of the server (a hosting platform's load balancer counts as one).
// Express needs to know so it reads the visitor's real address from the X-Forwarded-For header
// instead of the proxy's. Wrong in either direction is bad: too low and everyone shares one address
// (one person's failed logins lock everyone out); too high and a visitor can fake their address.
// Unset means "not behind a proxy", which is right when running the server directly.
function trustProxy(): number | boolean | string {
    const value = (process.env.TRUST_PROXY || '').trim();
    if (!value || value === 'false') return false;
    if (value === 'true') return true;
    return /^\d+$/.test(value) ? Number(value) : value;
}

// Whether, and how often, the server should request its own public /health page to stay awake on a
// hosting plan that sleeps idle services. It needs a public address: KEEP_ALIVE_URL if set, otherwise
// the one Render provides to every web service. With neither (as on a laptop) it stays off.
function keepAlive(): { url: string; intervalSeconds: number } | null {
    const url = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').trim();
    const raw = process.env.KEEP_ALIVE_INTERVAL_SECONDS;
    // Render sleeps a free service after 15 minutes without requests, so every 10 minutes is enough
    const intervalSeconds = raw === undefined || raw.trim() === '' ? 600 : Number(raw);

    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) throw new Error('KEEP_ALIVE_INTERVAL_SECONDS must be a number of seconds, or 0 to turn keep-alive off');
    if (!url || intervalSeconds === 0) return null;
    if (!/^https?:\/\//.test(url)) throw new Error('KEEP_ALIVE_URL must start with http:// or https://');
    return { url, intervalSeconds };
}

export const env = {
    nodeEnv: process.env.NODE_ENV,
    port: port(),
    mongoUri: required('MONGODB_URI'),
    jwtSecret: jwtSecret(),
    // Required rather than optional: without it every login would fail later, when the token is signed
    jwtExpiresIn: required('JWT_EXPIRES_IN'),
    corsOrigin: corsOrigins(),
    trustProxy: trustProxy(),
    keepAlive: keepAlive(),
    actionLogRetentionDays: Number(process.env.ACTION_LOG_RETENTION_DAYS) || 90,
    isTest: process.env.NODE_ENV === 'test',
};
