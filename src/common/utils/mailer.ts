import { readFileSync } from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

import { env } from '../config/env';
import logger from '../config/logger';

// The only file that knows emails are sent with Nodemailer over SMTP. Everything else calls a function
// named for the email it wants sent, so changing how mail is delivered means changing this file only.

// One connection setup for the life of the process; Nodemailer opens connections as they are needed
const transport = env.smtp
    ? nodemailer.createTransport({
          host: env.smtp.host,
          port: env.smtp.port,
          // Port 465 is encrypted from the first byte; the others start plain and upgrade (STARTTLS)
          secure: env.smtp.port === 465,
          auth: { user: env.smtp.user, pass: env.smtp.pass },
          // Without these a mail server that never answers would leave the send hanging for minutes
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
      })
    : null;

export function isMailConfigured() {
    return transport !== null;
}

// Read once at startup. The file sits beside the compiled code as well (the build copies it).
const template = (name: string) => readFileSync(path.join(__dirname, '../../templates', name), 'utf8');
const PASSWORD_RESET_HTML = template('password-reset.html');

// Anything a person typed (their username) is made harmless before it goes into HTML
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// Replaces each {{name}} in a template with its value
function fill(html: string, values: Record<string, string>) {
    return html.replace(/\{\{(\w+)\}\}/g, (placeholder, key: string) => (key in values ? escapeHtml(values[key]) : placeholder));
}

export interface PasswordResetEmail {
    to: string;
    name: string;
    code: string;
    minutes: number;
}

// Throws if the mail server refuses or cannot be reached; the caller decides what that means
export async function sendPasswordResetEmail({ to, name, code, minutes }: PasswordResetEmail): Promise<void> {
    if (!transport || !env.smtp) throw new Error('Email is not set up');

    await transport.sendMail({
        from: env.smtp.from,
        to,
        subject: `${code} is your College Reviews password reset code`,
        html: fill(PASSWORD_RESET_HTML, { name, code, minutes: String(minutes) }),
        // For mail programs that do not show HTML, and for spam filters, which distrust HTML-only mail
        text: [
            `Hi ${name},`,
            '',
            `Your College Reviews password reset code is: ${code}`,
            '',
            `It works for ${minutes} minutes and can be used once.`,
            "Didn't ask for this? Ignore this email and your password stays the same.",
        ].join('\n'),
    });
    logger.info('Password reset email sent');
}
