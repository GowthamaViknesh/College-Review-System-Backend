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

// Where uploaded pictures are stored. Optional: without it the API runs normally and only the upload
// endpoints answer "not set up". The three values come as a set, so having some but not all is a mistake
// worth stopping for at startup rather than discovering on the first upload.
function cloudinary(): { cloudName: string; apiKey: string; apiSecret: string } | null {
    const names = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
    const [cloudName, apiKey, apiSecret] = names.map((name) => (process.env[name] || '').trim());
    const missing = names.filter((name) => !(process.env[name] || '').trim());

    if (missing.length === names.length) return null;
    if (missing.length) throw new Error(`Picture uploads need all of ${names.join(', ')}. Missing: ${missing.join(', ')}`);
    return { cloudName, apiKey, apiSecret };
}

// How long someone stays logged in without using the site. Each use of the refresh token starts the
// period again, so an active user is never logged out and an abandoned login stops working by itself.
function refreshTokenDays(): number {
    const raw = process.env.REFRESH_TOKEN_EXPIRES_DAYS;
    const days = raw === undefined || raw.trim() === '' ? 7 : Number(raw);
    if (!Number.isFinite(days) || days <= 0) throw new Error('REFRESH_TOKEN_EXPIRES_DAYS must be a number of days greater than 0');
    return days;
}

// The mail server that sends password reset codes. Optional: without it the rest of the API runs
// normally. The four values come as a set, so having some but not all stops the server at startup.
function smtp(): { host: string; port: number; user: string; pass: string; from: string } | null {
    const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
    const [host, rawPort, user, pass] = names.map((name) => (process.env[name] || '').trim());
    const missing = names.filter((name) => !(process.env[name] || '').trim());

    if (missing.length === names.length) return null;
    if (missing.length) throw new Error(`Sending email needs all of ${names.join(', ')}. Missing: ${missing.join(', ')}`);

    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('SMTP_PORT must be a port number, usually 465 or 587');

    // What recipients see as the sender. Most mail services only deliver mail sent as the account that logged in.
    const from = (process.env.MAIL_FROM || '').trim() || `College Reviews <${user}>`;
    return { host, port, user, pass, from };
}

export const env = {
    nodeEnv: process.env.NODE_ENV,
    port: port(),
    mongoUri: required('MONGODB_URI'),
    jwtSecret: jwtSecret(),
    // How long an access token lasts. Required rather than optional: without it every login would fail later, when the token is signed
    jwtExpiresIn: required('JWT_EXPIRES_IN'),
    refreshTokenDays: refreshTokenDays(),
    corsOrigin: corsOrigins(),
    trustProxy: trustProxy(),
    keepAlive: keepAlive(),
    cloudinary: cloudinary(),
    smtp: smtp(),
    actionLogRetentionDays: Number(process.env.ACTION_LOG_RETENTION_DAYS) || 90,
    isTest: process.env.NODE_ENV === 'test',
};
