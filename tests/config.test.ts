import request from 'supertest';
import type { Express } from 'express';
import { User } from '../src/models/user.model';
import { createUser } from './helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';

describe('startup configuration', () => {
    const original = { ...process.env };
    // Each case loads the config module fresh, with its own environment. The .env file is not read,
    // so the result does not depend on what happens to be on the machine running the tests.
    const loadEnv = () =>
        jest.isolateModules(() => {
            jest.doMock('dotenv', () => ({ config: () => ({}) }));
            require('../src/common/config/env');
        });

    afterEach(() => {
        process.env = { ...original };
    });

    it('refuses to start without a database address or a signing secret', () => {
        delete process.env.MONGODB_URI;
        expect(loadEnv).toThrow('Missing required environment variable: MONGODB_URI');

        process.env.MONGODB_URI = 'mongodb://localhost/test';
        delete process.env.JWT_SECRET;
        expect(loadEnv).toThrow('Missing required environment variable: JWT_SECRET');
    });

    it.each(['short-secret', 'change_me_to_a_long_random_string_of_at_least_32_chars'])('refuses a weak signing secret in production: %s', (secret) => {
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = secret;
        expect(loadEnv).toThrow(/JWT_SECRET must be a random value of at least 32 characters in production/);
    });

    it('accepts a long random secret in production, and any secret outside production', () => {
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = '3f9c1a7e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d';
        expect(loadEnv).not.toThrow();

        process.env.NODE_ENV = 'development';
        process.env.JWT_SECRET = 'short-secret';
        expect(loadEnv).not.toThrow();
    });
});

describe('deployment settings', () => {
    const original = { ...process.env };
    afterEach(() => {
        process.env = { ...original };
    });

    // Builds the Express app fresh, as it would start with the environment set just before
    function loadApp(): Express {
        let app!: Express;
        jest.isolateModules(() => {
            jest.doMock('dotenv', () => ({ config: () => ({}) }));
            app = require('../src/app').default;
        });
        return app;
    }

    it('does not trust forwarded addresses unless told it is behind a proxy', () => {
        delete process.env.TRUST_PROXY;
        expect(loadApp().get('trust proxy')).toBe(false);

        process.env.TRUST_PROXY = 'false';
        expect(loadApp().get('trust proxy')).toBe(false);
    });

    it.each([
        ['1', 1],
        ['2', 2],
        ['true', true],
        ['loopback', 'loopback'],
    ])('reads TRUST_PROXY=%s as %p', (value, expected) => {
        process.env.TRUST_PROXY = value;
        expect(loadApp().get('trust proxy')).toBe(expected);
    });

    it('allows only the listed frontend addresses to call the API from a browser', async () => {
        process.env.CORS_ORIGIN = 'https://college-reviews.onrender.com/, http://localhost:5173';
        const app = loadApp();
        const allowed = (origin: string) =>
            request(app)
                .get('/health')
                .set('Origin', origin)
                .then((res) => res.headers['access-control-allow-origin']);

        expect(await allowed('https://college-reviews.onrender.com')).toBe('https://college-reviews.onrender.com');
        expect(await allowed('http://localhost:5173')).toBe('http://localhost:5173');
        expect(await allowed('https://evil.example.com')).toBeUndefined();
    });

    it('allows any site when no address is configured, for local use', async () => {
        delete process.env.CORS_ORIGIN;
        const res = await request(loadApp()).get('/health').set('Origin', 'https://anything.example.com');
        expect(res.headers['access-control-allow-origin']).toBe('*');
    });
});

describe('password storage', () => {
    beforeAll(connectTestDb);
    afterEach(clearTestDb);
    afterAll(closeTestDb);

    it('leaves the password hash out of queries unless it is asked for', async () => {
        const { user } = await createUser('student');

        const plain = await User.findById(user.id);
        expect(plain!.password).toBeUndefined();

        const listed = await User.find({});
        expect(listed.every((found) => found.password === undefined)).toBe(true);

        const withPassword = await User.findById(user.id).select('+password');
        expect(withPassword!.password).toEqual(expect.any(String));
        expect(withPassword!.password).not.toBe('password123');
    });
});
