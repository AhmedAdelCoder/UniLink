import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// env.ts validates core application settings when the mailer module loads.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.OTP_SECRET ??= 'test-otp-secret';

let createEmailService: typeof import('../src/utils/Mailer.js').createEmailService;

before(async () => {
  ({ createEmailService } = await import('../src/utils/Mailer.js'));
});

describe('email service', () => {
  it('sends the verification email through the configured transport', async () => {
    let sentMessage: { from: string; to: string; subject: string; text: string; html: string } | undefined;
    const service = createEmailService(
      { host: 'smtp.example.test', port: 587, secure: false, user: 'mailer', pass: 'secret', from: 'UniLink <noreply@example.test>' },
      { sendMail: async (message) => { sentMessage = message; return {} as never; } },
    );

    await service.sendVerificationEmail('student@example.test', '123456');

    assert.ok(sentMessage);
    assert.equal(sentMessage.to, 'student@example.test');
    assert.equal(sentMessage.from, 'UniLink <noreply@example.test>');
    assert.match(sentMessage.subject, /verify/i);
    assert.match(sentMessage.text, /123456/);
    assert.match(sentMessage.html, /UniLink/);
    assert.match(sentMessage.html, /10 minutes/);
  });

  it('propagates SMTP errors and does not report delivery success', async () => {
    const smtpError = new Error('SMTP connection refused');
    const service = createEmailService(
      { host: 'smtp.example.test', port: 465, secure: true, user: 'mailer', pass: 'secret', from: 'noreply@example.test' },
      { sendMail: async () => { throw smtpError; } },
    );

    await assert.rejects(service.sendVerificationEmail('student@example.test', '654321'), smtpError);
  });

  it('rejects sending when SMTP configuration is missing', async () => {
    const service = createEmailService({ port: 587, secure: false });
    await assert.rejects(service.sendVerificationEmail('student@example.test', '123456'), /not configured/);
  });
});
