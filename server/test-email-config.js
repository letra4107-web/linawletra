#!/usr/bin/env node
/**
 * Email Configuration Verification Script
 *
 * Usage:
 *   cd server
 *   node test-email-config.js
 *   node test-email-config.js --send-test your-email@gmail.com
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env'), override: false });
dotenv.config({ path: path.resolve(__dirname, '.env.local'), override: false });

const emailUser = String(process.env.EMAIL_USER || '').trim();
const emailPass = String(process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/[\s-]+/g, '');
const emailHost = String(process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
const emailPort = parseInt(process.env.EMAIL_PORT, 10) || 465;
const emailSecure = process.env.EMAIL_SECURE === 'true' || emailPort === 465;
const emailFrom = process.env.EMAIL_FROM || `LinawLetra <${emailUser}>`;

console.log('\n=== Email Configuration Verification ===\n');

const checks = [
  ['EMAIL_USER', Boolean(emailUser), emailUser || 'missing'],
  ['EMAIL_PASS', emailPass.length >= 16, emailPass ? `${emailPass.length} chars loaded` : 'missing'],
  ['EMAIL_HOST', Boolean(emailHost), emailHost || 'missing'],
  ['EMAIL_PORT', Boolean(emailPort), String(emailPort)],
];

let configValid = true;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) configValid = false;
}

if (!configValid) {
  console.error('\nEmail configuration is incomplete. Set EMAIL_PASS in server/.env and restart the backend.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  host: emailHost,
  port: emailPort,
  secure: emailSecure,
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  pool: false,
});

try {
  console.log('\nVerifying SMTP connection...');
  await transporter.verify();
  console.log('OK SMTP connection verified.');

  const sendTestIndex = process.argv.indexOf('--send-test');
  if (sendTestIndex !== -1) {
    const testEmail = process.argv[sendTestIndex + 1] || emailUser;
    console.log(`Sending test email to ${testEmail}...`);
    const info = await transporter.sendMail({
      from: emailFrom,
      replyTo: emailUser,
      to: testEmail,
      subject: 'LinawLetra: SMTP Configuration Test',
      text: 'LinawLetra SMTP test email. If you received this, email is working.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4F46E5;">LinawLetra SMTP Test</h2>
          <p>If you received this, the email system is configured properly.</p>
          <p style="font-size: 12px; color: #666;">Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    console.log(`OK Test email sent. Message ID: ${info.messageId}`);
  }

  console.log('\nEmail service is ready.\n');
  process.exit(0);
} catch (err) {
  console.error('\nSMTP verification failed.');
  console.error(`Error: ${err.message}`);
  console.error(`Code: ${err.code || 'N/A'}`);
  console.error(`Response: ${err.response || 'N/A'}`);

  if (err.code === 'EAUTH' || (err.response && String(err.response).includes('535'))) {
    console.error('\nGmail rejected the credentials. Use a Gmail App Password, not the normal Gmail password.');
  }

  process.exit(1);
}
