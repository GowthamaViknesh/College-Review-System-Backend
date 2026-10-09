// The real mail code, with the connection to a mail server replaced so nothing is actually sent
const sendMail = jest.fn(async (_message: Record<string, string>) => ({ messageId: 'test' }));
const createTransport = jest.fn((_options: Record<string, unknown>) => ({ sendMail }));

type Mailer = typeof import('../src/common/utils/mailer');

describe('sending the password reset email', () => {
    const original = { ...process.env };

    function loadMailer(settings: Record<string, string>): Mailer {
        Object.assign(process.env, settings);
        let mailer: Mailer | undefined;
        jest.isolateModules(() => {
            jest.doMock('dotenv', () => ({ config: () => ({}) }));
            jest.doMock('nodemailer', () => ({ __esModule: true, default: { createTransport } }));
            mailer = require('../src/common/utils/mailer');
        });
        return mailer!;
    }

    const GMAIL = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'app-password' };

    afterEach(() => {
        process.env = { ...original };
        jest.clearAllMocks();
    });

    it('is off when no mail server is set', () => {
        const mailer = loadMailer({});
        expect(mailer.isMailConfigured()).toBe(false);
        expect(createTransport).not.toHaveBeenCalled();
    });

    it('refuses to start with only some of the mail settings', () => {
        expect(() => loadMailer({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'sender@gmail.com' })).toThrow('Missing: SMTP_PORT, SMTP_PASS');
        expect(() => loadMailer({ ...GMAIL, SMTP_PORT: 'mail' })).toThrow('SMTP_PORT must be a port number');
    });

    it('connects with the given settings, encrypted from the start on port 465 and upgraded on others', () => {
        expect(loadMailer(GMAIL).isMailConfigured()).toBe(true);
        expect(createTransport.mock.calls[0][0]).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'sender@gmail.com', pass: 'app-password' } });

        loadMailer({ ...GMAIL, SMTP_PORT: '587' });
        expect(createTransport.mock.calls[1][0]).toMatchObject({ port: 587, secure: false });
    });

    it('fills the template with the name, the code and how long it lasts', async () => {
        const mailer = loadMailer(GMAIL);
        await mailer.sendPasswordResetEmail({ to: 'arun@example.com', name: 'arun', code: '482913', minutes: 10 });

        const message = sendMail.mock.calls[0][0];
        expect(message).toMatchObject({ to: 'arun@example.com', from: 'College Reviews <sender@gmail.com>', subject: '482913 is your College Reviews password reset code' });
        expect(message.html).toContain('Hi arun,');
        expect(message.html).toContain('>482913</span>');
        expect(message.html).toContain('10 minutes');
        // Every placeholder was filled in
        expect(message.html).not.toMatch(/\{\{|\}\}/);
        expect(message.text).toContain('482913');
        expect(message.text).toContain('10 minutes');
    });

    it('makes a username harmless before putting it in the email', async () => {
        const mailer = loadMailer(GMAIL);
        await mailer.sendPasswordResetEmail({ to: 'eve@example.com', name: '<img src=x onerror=alert(1)>', code: '000042', minutes: 10 });

        const { html } = sendMail.mock.calls[0][0];
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('uses MAIL_FROM as the sender when it is set', async () => {
        const mailer = loadMailer({ ...GMAIL, MAIL_FROM: 'Support <help@college.example>' });
        await mailer.sendPasswordResetEmail({ to: 'arun@example.com', name: 'arun', code: '482913', minutes: 10 });
        expect(sendMail.mock.calls[0][0].from).toBe('Support <help@college.example>');
    });

    it('passes a mail server failure on to the caller', async () => {
        const mailer = loadMailer(GMAIL);
        sendMail.mockRejectedValueOnce(new Error('Connection timeout'));
        await expect(mailer.sendPasswordResetEmail({ to: 'arun@example.com', name: 'arun', code: '482913', minutes: 10 })).rejects.toThrow('Connection timeout');
    });
});
