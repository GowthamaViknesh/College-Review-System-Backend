import request from 'supertest';
import app from '../src/app';
import logger from '../src/common/config/logger';
import { startKeepAlive } from '../src/common/utils/keep-alive';

describe('keep-alive timer', () => {
    let fetchMock: jest.SpyInstance;
    let stop: () => void = () => {};

    beforeEach(() => {
        jest.useFakeTimers();
        fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    });

    afterEach(() => {
        stop();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('requests the public /health page once per interval, and not before', async () => {
        stop = startKeepAlive({ url: 'https://api.example.com', intervalSeconds: 40 });

        expect(fetchMock).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(39_000);
        expect(fetchMock).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/health');

        await jest.advanceTimersByTimeAsync(80_000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('copes with a trailing slash on the address', async () => {
        stop = startKeepAlive({ url: 'https://api.example.com/', intervalSeconds: 10 });
        await jest.advanceTimersByTimeAsync(10_000);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/health');
    });

    it('carries on after a failed request instead of crashing the server', async () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        fetchMock.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(new Response('', { status: 503 }));
        stop = startKeepAlive({ url: 'https://api.example.com', intervalSeconds: 10 });

        await jest.advanceTimersByTimeAsync(10_000); // rejected
        await jest.advanceTimersByTimeAsync(10_000); // 503
        await jest.advanceTimersByTimeAsync(10_000); // back to normal

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0][0]).toContain('network down');
        expect(warn.mock.calls[1][0]).toContain('returned 503');
    });

    it('stops when asked to, as it is on shutdown', async () => {
        stop = startKeepAlive({ url: 'https://api.example.com', intervalSeconds: 10 });
        await jest.advanceTimersByTimeAsync(10_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        stop();
        await jest.advanceTimersByTimeAsync(60_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('keep-alive settings', () => {
    const original = { ...process.env };
    afterEach(() => {
        process.env = { ...original };
    });

    const loadKeepAlive = () => {
        let value: unknown;
        jest.isolateModules(() => {
            jest.doMock('dotenv', () => ({ config: () => ({}) }));
            value = require('../src/common/config/env').env.keepAlive;
        });
        return value;
    };

    it('is off when the server has no public address, as on a laptop', () => {
        delete process.env.KEEP_ALIVE_URL;
        delete process.env.RENDER_EXTERNAL_URL;
        expect(loadKeepAlive()).toBeNull();
    });

    it('turns on by itself on Render, every 10 minutes', () => {
        delete process.env.KEEP_ALIVE_URL;
        delete process.env.KEEP_ALIVE_INTERVAL_SECONDS;
        process.env.RENDER_EXTERNAL_URL = 'https://college-review-api.onrender.com';
        expect(loadKeepAlive()).toEqual({ url: 'https://college-review-api.onrender.com', intervalSeconds: 600 });
    });

    it('uses a chosen address and interval when they are set', () => {
        process.env.RENDER_EXTERNAL_URL = 'https://from-render.onrender.com';
        process.env.KEEP_ALIVE_URL = 'https://my-own-domain.example.com';
        process.env.KEEP_ALIVE_INTERVAL_SECONDS = '40';
        expect(loadKeepAlive()).toEqual({ url: 'https://my-own-domain.example.com', intervalSeconds: 40 });
    });

    it('can be turned off with an interval of 0', () => {
        process.env.RENDER_EXTERNAL_URL = 'https://college-review-api.onrender.com';
        process.env.KEEP_ALIVE_INTERVAL_SECONDS = '0';
        expect(loadKeepAlive()).toBeNull();
    });

    it('refuses to start with an interval or address that makes no sense', () => {
        process.env.KEEP_ALIVE_URL = 'https://api.example.com';
        process.env.KEEP_ALIVE_INTERVAL_SECONDS = 'often';
        expect(loadKeepAlive).toThrow('KEEP_ALIVE_INTERVAL_SECONDS must be a number of seconds');

        process.env.KEEP_ALIVE_INTERVAL_SECONDS = '60';
        process.env.KEEP_ALIVE_URL = 'api.example.com';
        expect(loadKeepAlive).toThrow('KEEP_ALIVE_URL must start with http:// or https://');
    });
});

describe('GET /health', () => {
    it('answers without a token or a database lookup, so a keep-alive request is cheap', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });
});
