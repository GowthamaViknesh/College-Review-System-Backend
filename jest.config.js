/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    setupFiles: ['<rootDir>/tests/helpers/env.ts'],
    collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
    coverageReporters: ['text', 'text-summary', 'lcov'],
    testTimeout: 30000,
};
