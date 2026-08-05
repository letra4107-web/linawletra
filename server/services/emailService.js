// Send teacher account credentials to new teacher
const sendTeacherAccountEmail = async (teacherEmail, teacherName, tempPassword, loginUrl = null) => {
  loginUrl = loginUrl || (config.frontendUrl ? `${config.frontendUrl}/login` : 'http://localhost:3000/login');
  const subject = 'Welcome to LinawLetra';
  const html = `
    <div style="font-family: 'Josefin Sans', sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background-color: #f9fafb; letter-spacing: 0.03em;">
      <div style="background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #4F46E5; margin: 0 0 10px 0; font-size: 28px; letter-spacing: 0.05em;">Welcome to LinawLetra!</h1>
        <p style="color: #1e5a96; font-size: 16px; margin: 0 0 20px 0; font-weight: 500;">Your Teacher Account Has Been Created</p>

        <p style="color: #4b5563; font-size: 15px; line-height: 1.8;">
          Hello ${teacherName ? teacherName : 'Teacher'},
        </p>

        <p style="color: #4b5563; font-size: 15px; line-height: 1.8;">
          Your LinawLetra teacher account has been created. You can now log in and start using the platform.
        </p>

        <div style="background-color: #eef2ff; border-left: 4px solid #4F46E5; padding: 20px; border-radius: 4px; margin: 25px 0;">
          <h3 style="color: #1e5a96; margin-top: 0; font-size: 16px;">Teacher Login Credentials</h3>
          <table style="width: 100%; color: #4b5563; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; width: 150px;"><strong>Email:</strong></td>
              <td style="padding: 8px 0; font-family: 'Courier New', monospace; color: #1e5a96; font-weight: 600;">${teacherEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Temporary Password:</strong></td>
              <td style="padding: 8px 0; font-family: 'Courier New', monospace; color: #1e5a96; font-weight: 600; word-break: break-all;">${tempPassword}</td>
            </tr>
          </table>
          <p style="color: #666; font-size: 12px; margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #d0e8e2;">
            ⚠️ <strong>Important:</strong> Please change your password after logging in for the first time.
          </p>
        </div>

        <h3 style="color: #1e5a96; font-size: 16px; margin: 25px 0 15px 0;">How to Get Started:</h3>
        <ol style="color: #4b5563; font-size: 15px; line-height: 1.8; padding-left: 20px;">
          <li><strong>Visit the login page:</strong> <a href="${loginUrl}" style="color: #4F46E5; text-decoration: none;">${loginUrl}</a></li>
          <li><strong>Enter your credentials:</strong> Use the email and temporary password above</li>
          <li><strong>Set a new password:</strong> You will be prompted to change your password after logging in</li>
          <li><strong>Access your dashboard:</strong> Start managing your classes and students</li>
        </ol>

        <p style="color: #4b5563; font-size: 15px; line-height: 1.8; margin-top: 25px;">
          If you have any questions or need assistance, please contact our support team.
        </p>

        <p style="color: #4b5563; font-size: 15px; margin: 15px 0 5px 0;">
          Best regards,<br/>
          <strong>The LinawLetra Team</strong>
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          If you did not expect this email, please contact support immediately. Never share these credentials with anyone else.
        </p>
      </div>
    </div>
  `;

  const redesignedHtml = renderEmailLayout({
    title: 'Welcome to LinawLetra!',
    eyebrow: 'Teacher Account',
    intro: `
      Hello ${escapeHtml(teacherName || 'Teacher')},<br />
      Your LinawLetra teacher account has been created. You can now log in and start managing classes, students, and reading progress.
    `,
    content: `
      ${renderCard('Teacher Login Credentials', `
        ${renderCodeBox('Email', teacherEmail)}
        ${renderCodeBox('Temporary Password', tempPassword)}
      `)}
      ${renderNotice('Important', 'Please change your temporary password after logging in for the first time. If you did not expect this account, contact your administrator immediately.')}
      ${renderCard('How to Get Started', `
        <ol style="font-family: Arial, Helvetica, sans-serif; color: ${BRAND.muted}; font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li>Open the LinawLetra login page.</li>
          <li>Enter the email and temporary password above.</li>
          <li>Access your dashboard to manage students and lessons.</li>
        </ol>
      `)}
    `,
    ctaLabel: 'Open LinawLetra',
    ctaUrl: loginUrl,
  });

  const mailOptions = {
    from: config.email.from,
    to: teacherEmail,
    subject,
    html: redesignedHtml,
  };

  try {
    await sendMailWithRetry(mailOptions, { type: 'teacher', email: teacherEmail, retries: 2 });
    console.log(`✓ Teacher account email sent to ${teacherEmail}`);
    return true;
  } catch (error) {
    console.error('✗ Error sending teacher account email:', error.message);
    return false;
  }
};
/**
 * Email Verification Service
 * Handles email verification codes, tokens, and sending
 * Uses secure configuration from config.js
 */

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import configModule from '../config.js';
const config = configModule.default || configModule;

const BRAND = {
  primary: '#4F46E5',
  primaryDark: '#3730A3',
  soft: '#EEF2FF',
  softAlt: '#F8FAFC',
  border: '#E0E7FF',
  text: '#111827',
  muted: '#4B5563',
  white: '#FFFFFF',
};

const getClientUrl = () => String(config.frontendUrl || config.urls?.client || 'https://linawletra.com').replace(/\/+$/, '');
const getSupportEmail = () => parseEmailAddress(config.email.from || config.email.user || 'support@linawletra.com').email;

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderButton = (label, href) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0 8px 0;">
    <tr>
      <td bgcolor="${BRAND.primary}" style="border-radius: 12px;">
        <a href="${escapeHtml(href)}" style="display: inline-block; padding: 14px 24px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>
`;

const renderInfoRow = (label, value) => `
  <tr>
    <td style="padding: 10px 0; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.5; color: ${BRAND.muted}; width: 42%;">
      ${escapeHtml(label)}
    </td>
    <td style="padding: 10px 0; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: ${BRAND.text}; font-weight: 700;">
      ${escapeHtml(value || '-')}
    </td>
  </tr>
`;

const renderCodeBox = (label, value) => `
  <div style="margin: 14px 0;">
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; color: ${BRAND.muted}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 7px;">
      ${escapeHtml(label)}
    </div>
    <div style="font-family: 'Courier New', Courier, monospace; font-size: 16px; line-height: 1.5; color: ${BRAND.primaryDark}; font-weight: 700; background: ${BRAND.softAlt}; border: 1px solid ${BRAND.border}; border-radius: 10px; padding: 12px 14px; word-break: break-word;">
      ${escapeHtml(value || '-')}
    </div>
  </div>
`;

const renderCard = (title, content) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
    <tr>
      <td style="background: #ffffff; border: 1px solid ${BRAND.border}; border-radius: 16px; padding: 22px;">
        <h2 style="font-family: Arial, Helvetica, sans-serif; font-size: 18px; line-height: 1.3; color: ${BRAND.text}; margin: 0 0 12px 0;">
          ${escapeHtml(title)}
        </h2>
        ${content}
      </td>
    </tr>
  </table>
`;

const renderNotice = (title, body) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
    <tr>
      <td style="background: ${BRAND.soft}; border: 1px solid ${BRAND.border}; border-radius: 14px; padding: 18px 20px;">
        <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: ${BRAND.primaryDark};">
          <strong>${escapeHtml(title)}</strong><br />
          ${body}
        </div>
      </td>
    </tr>
  </table>
`;

const renderEmailLayout = ({ title, eyebrow = 'LinawLetra', intro, content, ctaLabel, ctaUrl }) => {
  const clientUrl = getClientUrl();
  const supportEmail = getSupportEmail();
  const logoUrl = `${clientUrl}/logo.png`;

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #F3F4F6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background: #F3F4F6; margin: 0; padding: 0;">
      <tr>
        <td align="center" style="padding: 28px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 640px; background: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #E5E7EB;">
            <tr>
              <td style="background: ${BRAND.primary}; padding: 26px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="vertical-align: middle;">
                      <img src="${escapeHtml(logoUrl)}" width="44" height="44" alt="LinawLetra logo" style="display: inline-block; vertical-align: middle; border: 0; border-radius: 10px; background: #ffffff;" />
                      <span style="font-family: Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 800; color: #ffffff; margin-left: 12px; vertical-align: middle;">LinawLetra</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top: 8px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #E0E7FF; line-height: 1.5;">
                      Helping Filipino Children Read with Confidence
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 34px 30px 28px 30px;">
                <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 800; color: ${BRAND.primary}; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">
                  ${escapeHtml(eyebrow)}
                </div>
                <h1 style="font-family: Arial, Helvetica, sans-serif; font-size: 28px; line-height: 1.25; color: ${BRAND.text}; margin: 0 0 14px 0;">
                  ${escapeHtml(title)}
                </h1>
                <div style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; color: ${BRAND.muted}; margin: 0 0 8px 0;">
                  ${intro}
                </div>
                ${content}
                ${ctaLabel && ctaUrl ? renderButton(ctaLabel, ctaUrl) : ''}
              </td>
            </tr>
            <tr>
              <td style="background: ${BRAND.softAlt}; border-top: 1px solid #E5E7EB; padding: 24px 30px;">
                <p style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.7; color: ${BRAND.muted}; margin: 0;">
                  <strong style="color: ${BRAND.text};">LinawLetra</strong><br />
                  Helping Filipino Children Read with Confidence<br />
                  Support: <a href="mailto:${escapeHtml(supportEmail)}" style="color: ${BRAND.primary}; text-decoration: none;">${escapeHtml(supportEmail)}</a><br />
                  Website: <a href="${escapeHtml(clientUrl)}" style="color: ${BRAND.primary}; text-decoration: none;">${escapeHtml(clientUrl)}</a>
                </p>
                <p style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.6; color: #6B7280; margin: 16px 0 0 0;">
                  &copy; ${new Date().getFullYear()} LinawLetra. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};


// Transporter creation (safer defaults for Gmail + fewer socket issues)
// NOTE: We intentionally do NOT use SMTP pooling here; pooled/stale sockets are a common
// cause of ECONNRESET/ESOCKET under Gmail throttling.
let transporter = null;

const parseEmailAddress = (value = '') => {
  const input = String(value || '').trim();
  const match = input.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { email: input, name: undefined };
  const name = match[1].trim().replace(/^['"]|['"]$/g, '');
  return { email: match[2].trim(), name: name || undefined };
};

const createTransporter = () => {
  const port = config.email.port;
  const secure = Boolean(config.email.secure) || port === 465;
  const timeout = config.email.sendTimeoutMs || 7000;

  // In development allow bypassing TLS verification when necessary
  const tlsReject = config.isDevelopment ? false : (config.email.rejectUnauthorized !== false);
  if (config.isDevelopment && !tlsReject) {
    console.warn('⚠ Development mode: TLS certificate validation is relaxed for SMTP (EMAIL_TLS_REJECT_UNAUTHORIZED=false)');
  }

  return nodemailer.createTransport({
    service: config.email.service,
    host: config.email.host,
    port,
    secure,
    tls: {
      // In development this may be false to allow self-signed certs
      rejectUnauthorized: tlsReject,
    },
    // For STARTTLS (587), requireTLS=true is fine. For SMTPS (465), secure=true is enough.
    requireTLS: !secure,
    auth: {
      user: config.email.user,
      pass: config.email.password,
    },
    // Avoid aggressive concurrency; keep the transport simple/reliable.
    pool: false,
    maxConnections: 1,
    maxMessages: 1,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
  });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isTransientSmtpError = (code) => {
  return ['ECONNRESET', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code);
};

const sendBrevoMail = async (mailOptions, { type, email } = {}) => {
  const sender = parseEmailAddress(mailOptions.from || config.email.from);
  const timeout = config.email.sendTimeoutMs || 7000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const payload = {
    sender,
    to: [{ email: mailOptions.to }],
    subject: mailOptions.subject,
    htmlContent: mailOptions.html,
    textContent: mailOptions.text,
  };

  if (mailOptions.replyTo) {
    payload.replyTo = parseEmailAddress(mailOptions.replyTo);
  }

  let response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': config.email.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Brevo email send timed out after ${timeout}ms`);
      timeoutError.code = 'EMAIL_SEND_TIMEOUT';
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();
  let responseBody = null;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    const message = typeof responseBody === 'object'
      ? responseBody?.message || responseBody?.code || response.statusText
      : responseBody || response.statusText;
    const error = new Error(`Brevo email send failed: ${message}`);
    error.status = response.status;
    error.response = responseBody;
    throw error;
  }

  console.log(`✓ ${type || 'email'} email sent to ${email || mailOptions.to} via Brevo`);
  console.log(`   Message ID: ${responseBody?.messageId || 'N/A'}`);
  return responseBody;
};

const sendMailWithRetry = async (mailOptions, { type, email, retries = 2 } = {}) => {
  if (config.email.provider === 'brevo') {
    return sendBrevoMail(mailOptions, { type, email });
  }

  let attempt = 0;

  while (true) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✓ ${type || 'email'} verification email sent to ${email}`);
      console.log(`   Message ID: ${info && info.messageId ? info.messageId : 'N/A'}`);
      return info;
    } catch (err) {
      attempt += 1;

      const code = err && err.code;
      const response = err && err.response;

      console.error(`✗ Error sending ${type || 'email'} email (attempt ${attempt}/${retries + 1}):`, err.message);
      console.error('   Code:', code || 'N/A');
      console.error('   Response:', response || 'N/A');

      // Rebuild transporter on socket-level crashes
      if (isTransientSmtpError(code) && attempt <= retries) {
        transporter = createTransporter();
        await transporter.verify().catch(() => {});
        await sleep(500 * attempt);
        continue;
      }

      // No retry for auth errors / permanent failures
      if (code === 'EAUTH' || (response && String(response).includes('535'))) {
        console.error('   Gmail rejected SMTP auth. Verify EMAIL_PASS is a Gmail App Password (2FA enabled).');
      }

      throw err;
    }
  }
};

// Improved logging for transporter config
const logEmailConfig = () => {
  console.log('--- Email Transporter Configuration ---');
  console.log('Provider:', config.email.provider);
  console.log('Service:', config.email.service);
  console.log('Host:', config.email.host);
  console.log('Port:', config.email.port);
  console.log('User:', config.email.user);
  console.log('From:', config.email.from);
  console.log('Enabled:', config.email.enabled);
  console.log('---------------------------------------');
};

if (config.email.provider !== 'brevo') {
  transporter = createTransporter();
}
logEmailConfig();
if (config.email.enabled && config.email.provider === 'brevo') {
  console.log('✓ Brevo transactional email is configured - OTP emails will use Brevo');
} else if (config.email.enabled) {
  transporter.verify((error, success) => {
    if (error) {
      console.error('✗ Email transporter verification failed:', error.message);
      if (error.response) console.error('SMTP Response:', error.response);
      console.error('\n📧 GMAIL SMTP AUTHENTICATION TROUBLESHOOTING:');
      console.error('   1. Go to: https://myaccount.google.com/security');
      console.error('   2. Enable 2-Step Verification');
      console.error('   3. Go to: https://myaccount.google.com/apppasswords');
      console.error('   4. Select: Mail app, Other (Linux) device');
      console.error('   5. Copy the 16-character App Password');
      console.error('   6. Paste into server/.env as EMAIL_PASS (no spaces needed)');
      console.error('   7. Restart the server\n');
    } else {
      console.log(`✓ Email transporter ready using ${config.email.user}`);
      console.log('✓ SMTP connection verified - OTP emails will work');
    }
  });
} else {
  console.warn('✗ Email sending is DISABLED. Set EMAIL_USER and EMAIL_PASS to enable.');
}

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate password reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash verification code for database storage
const hashCode = (code) => {
  return crypto.createHash('sha256').update(code).digest('hex');
};

// Send verification email (can be for signup or login OTP)
const sendVerificationEmail = async (email, verificationCode, verificationLink = null, type = 'signup') => {
  console.log(`Sending ${type} verification to: ${email} via ${config.email.provider} from ${config.email.from}`);

  let subject = 'LinawLetra: Email Verification';
  let title = 'Welcome to LinawLetra';
  let message = 'Thank you for signing up to LinawLetra. Please verify your email to complete your registration.';
  let titleColor = '#4F46E5';
  let instruction = 'Click the button below to verify your email address.';

  if (type === 'login') {
    subject = 'LinawLetra: Login Verification';
    title = 'Login to LinawLetra';
    message = 'You are attempting to log into your LinawLetra account. Please verify your email.';
    titleColor = '#1e5a96';
    instruction = 'Click the button below to verify your identity.';
  }

  if (!config.email.enabled) {
    const disabledMsg = 'Email transport is disabled. Set BREVO_API_KEY or EMAIL_USER and EMAIL_PASS, then restart the backend.';
    console.error('Email send blocked:', disabledMsg);
    throw new Error(disabledMsg);
  }

  let textContent, htmlContent;

  if (verificationLink) {
    // Send link-based verification
    textContent = `Please verify your email by clicking this link: ${verificationLink}. This link expires in ${config.emailVerification.expiresInMinutes} minutes.`;
    htmlContent = `
      <div style="font-family: 'Josefin Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; letter-spacing: 0.06em;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: ${titleColor}; margin-top: 0; font-size: 28px; letter-spacing: 0.08em;">${title}</h1>

          <p style="color: #4b5563; font-size: 16px; line-height: 1.8;">
            ${message}
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" style="background-color: ${titleColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Verify Email Address
            </a>
          </div>

          <p style="color: #4b5563; font-size: 16px; line-height: 1.8;">
            ${instruction}
          </p>

          <p style="color: #666; font-size: 14px; margin: 20px 0 0 0;">
            This link expires in ${config.emailVerification.expiresInMinutes} minutes.
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            If you didn't initiate this action, please ignore this email.
          </p>
        </div>
      </div>
    `;
  } else {
    // Send code-based verification (legacy)
    textContent = `Your LinawLetra verification code is: ${verificationCode}. Enter this code to verify your account. This code expires in ${config.emailVerification.expiresInMinutes} minutes.`;
    htmlContent = `
      <div style="font-family: 'Josefin Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; letter-spacing: 0.06em;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: ${titleColor}; margin-top: 0; font-size: 28px; letter-spacing: 0.08em;">${title}</h1>

          <p style="color: #4b5563; font-size: 16px; line-height: 1.8;">
            ${message}
          </p>

          <div style="background-color: #f0f4f8; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">Your verification code is:</p>
            <p style="color: ${titleColor}; font-size: 32px; font-weight: bold; letter-spacing: 0.1em; margin: 0;">
              ${verificationCode}
            </p>
            <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">
              This code expires in ${config.emailVerification.expiresInMinutes} minutes
            </p>
          </div>

          <p style="color: #4b5563; font-size: 16px; line-height: 1.8;">
            Enter this code on the verification page to complete your registration.
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            If you didn't initiate this action, please ignore this email.
          </p>
        </div>
      </div>
    `;
  }

  htmlContent = renderEmailLayout({
    title,
    eyebrow: type === 'login' ? 'Login OTP' : 'Email Verification',
    intro: `
      Hello,<br />
      ${escapeHtml(message)}
    `,
    content: verificationLink
      ? `
        ${renderNotice('Verification Link', `${escapeHtml(instruction)} This link expires in ${config.emailVerification.expiresInMinutes} minutes.`)}
      `
      : `
        ${renderCard('Your Verification Code', `
          <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; line-height: 1.2; color: ${BRAND.primary}; font-weight: 800; letter-spacing: 0.16em; text-align: center; background: ${BRAND.softAlt}; border: 1px solid ${BRAND.border}; border-radius: 14px; padding: 20px 14px;">
            ${escapeHtml(verificationCode)}
          </div>
          <p style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.6; color: ${BRAND.muted}; margin: 12px 0 0 0; text-align: center;">
            This code expires in ${config.emailVerification.expiresInMinutes} minutes.
          </p>
        `)}
        ${renderNotice('Important', 'Enter this code on LinawLetra to continue. If you did not request this code, you can safely ignore this email.')}
      `,
    ctaLabel: verificationLink ? 'Verify Email' : 'Open LinawLetra',
    ctaUrl: verificationLink || getClientUrl(),
  });

  const mailOptions = {
    from: config.email.from,
    replyTo: config.email.user,
    to: email,
    subject,
    text: textContent,
    html: htmlContent,
  };

  try {
    await sendMailWithRetry(mailOptions, { type, email, retries: 2 });
    console.log(`✓ ${type.charAt(0).toUpperCase() + type.slice(1)} verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`✗ Error sending ${type} verification email:`, error.message);
    console.error('   Code:', error.code || 'N/A');
    console.error('   Response:', error.response || 'N/A');

    if (error.code === 'EAUTH' || (error.response && String(error.response).includes('535'))) {
      console.error('   Gmail rejected the login. Ensure 2-Step Verification is enabled and EMAIL_PASS is a valid Gmail App Password.');
    }

    throw error;
  }
};

// Send new student account details to parent with complete instructions
const sendStudentEnrollmentEmail = async (
  parentEmail,
  childName,
  childUsername,
  childPassword,
  gradeLevelandReadingLevel = ''
) => {
  const loginUrl = config.frontendUrl || 'http://localhost:3000';
  const gradeInfo = gradeLevelandReadingLevel
    ? `<li><strong>Grade Level:</strong> ${gradeLevelandReadingLevel}</li>`
    : '';

  const subject = 'LinawLetra: Child Account Successfully Enrolled';
  const html = `
    <div style="font-family: 'Josefin Sans', sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; background-color: #f9fafb; letter-spacing: 0.03em;">
      <div style="background-color: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h1 style="color: #4F46E5; margin: 0 0 10px 0; font-size: 28px; letter-spacing: 0.05em;">Welcome to LinawLetra!</h1>
        <p style="color: #1e5a96; font-size: 16px; margin: 0 0 20px 0; font-weight: 500;">Child Account Successfully Created</p>

        <p style="color: #4b5563; font-size: 15px; line-height: 1.8;">
          Hello,
        </p>

        <p style="color: #4b5563; font-size: 15px; line-height: 1.8;">
          Great news! The account for <strong>${childName}</strong> has been successfully created in LinawLetra. Your child can now begin their reading journey!
        </p>

        <div style="background-color: #eef2ff; border-left: 4px solid #4F46E5; padding: 20px; border-radius: 4px; margin: 25px 0;">
          <h3 style="color: #1e5a96; margin-top: 0; font-size: 16px;">Student Login Credentials</h3>
          <table style="width: 100%; color: #4b5563; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; width: 150px;"><strong>Username/Email:</strong></td>
              <td style="padding: 8px 0; font-family: 'Courier New', monospace; color: #1e5a96; font-weight: 600;">${childUsername}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Password:</strong></td>
              <td style="padding: 8px 0; font-family: 'Courier New', monospace; color: #1e5a96; font-weight: 600; word-break: break-all;">${childPassword}</td>
            </tr>
            ${gradeInfo}
          </table>
          <p style="color: #666; font-size: 12px; margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #d0e8e2;">
            ⚠️ <strong>Important:</strong> Please save these credentials securely. Your child will need them to log in to the Student Dashboard.
          </p>
        </div>

        <h3 style="color: #1e5a96; font-size: 16px; margin: 25px 0 15px 0;">How Your Child Can Get Started:</h3>
        <ol style="color: #4b5563; font-size: 15px; line-height: 1.8; padding-left: 20px;">
          <li><strong>Visit the login page:</strong> Go to <a href="${loginUrl}/login" style="color: #4F46E5; text-decoration: none;">${loginUrl}/login</a></li>
          <li><strong>Enter credentials:</strong> Use the username and password provided above</li>
          <li><strong>Complete profile:</strong> After login, your child may be prompted to complete their profile (optional)</li>
          <li><strong>Start learning:</strong> Access lessons, take assessments, and track progress from the Student Dashboard</li>
        </ol>

        <div style="background-color: #fff9e6; border-left: 4px solid #f39c12; padding: 15px; border-radius: 4px; margin: 25px 0;">
          <h4 style="color: #d68910; margin: 0 0 8px 0;">Tips for Parents:</h4>
          <ul style="color: #5d4e37; font-size: 14px; line-height: 1.7; margin: 0; padding-left: 20px;">
            <li>Encourage your child to change their password after the first login (if password change is available)</li>
            <li>Monitor your child's progress through the Parent Dashboard</li>
            <li>Save this email for easy reference of login credentials</li>
          </ul>
        </div>

        <p style="color: #4b5563; font-size: 15px; line-height: 1.8; margin-top: 25px;">
          If you have any questions or need assistance, please don't hesitate to contact our support team.
        </p>

        <p style="color: #4b5563; font-size: 15px; margin: 15px 0 5px 0;">
          Best regards,<br/>
          <strong>The LinawLetra Team</strong>
        </p>

        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          If you did not create this account or did not expect this email, please contact support immediately. Never share these credentials with anyone else.
        </p>
      </div>
    </div>
  `;

  const redesignedStudentHtml = renderEmailLayout({
    title: 'Child Account Successfully Created',
    eyebrow: 'Student Account',
    intro: `
      Hello Parent,<br />
      Great news! The account for <strong style="color: ${BRAND.text};">${escapeHtml(childName)}</strong> has been successfully created and is ready to begin the LinawLetra reading journey.
    `,
    content: `
      ${renderCard('Student Information', `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          ${renderInfoRow('Student Name', childName)}
          ${gradeLevelandReadingLevel ? renderInfoRow('Grade / Reading Level', gradeLevelandReadingLevel) : ''}
        </table>
      `)}
      ${renderCard('Student Login Credentials', `
        ${renderCodeBox('Username', childUsername)}
        ${renderCodeBox('Temporary Password', childPassword)}
      `)}
      ${renderNotice('Important', 'Please save these login credentials securely. Your child will need them to access LinawLetra. If you did not request this account, contact your teacher or administrator immediately.')}
      ${renderCard('How Your Child Can Get Started', `
        <ol style="font-family: Arial, Helvetica, sans-serif; color: ${BRAND.muted}; font-size: 15px; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li>Open the LinawLetra login page.</li>
          <li>Enter the username and temporary password above.</li>
          <li>Start learning through lessons, assessments, and reading practice.</li>
        </ol>
      `)}
    `,
    ctaLabel: 'Start Reading',
    ctaUrl: `${loginUrl}/login`,
  });

  const mailOptions = {
    from: config.email.from,
    to: parentEmail,
    subject,
    html: redesignedStudentHtml,
  };

  try {
    await sendMailWithRetry(mailOptions, { type: 'student', email: parentEmail, retries: 2 });
    console.log(`✓ Student enrollment email sent to ${parentEmail}`);
    return true;
  } catch (error) {
    console.error('✗ Error sending student enrollment email:', error.message);
    return false;
  }
};

// Legacy function name for backward compatibility
const sendNewStudentAccountEmail = async (parentEmail, childName, childEmail, childPassword) => {
  return sendStudentEnrollmentEmail(parentEmail, childName, childEmail, childPassword);
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetCode) => {
  const html = renderEmailLayout({
    title: 'Password Reset Request',
    eyebrow: 'Account Security',
    intro: `
      Hello,<br />
      We received a request to reset your LinawLetra password. Use the secure code below to continue.
    `,
    content: `
      ${renderCard('Your Reset Code', `
        <div style="font-family: 'Courier New', Courier, monospace; font-size: 34px; line-height: 1.2; color: ${BRAND.primary}; font-weight: 800; letter-spacing: 0.16em; text-align: center; background: ${BRAND.softAlt}; border: 1px solid ${BRAND.border}; border-radius: 14px; padding: 20px 14px;">
          ${escapeHtml(resetCode)}
        </div>
        <p style="font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.6; color: ${BRAND.muted}; margin: 12px 0 0 0; text-align: center;">
          This code expires in ${escapeHtml(config.passwordReset.expiresIn)}.
        </p>
      `)}
      ${renderNotice('Important', 'For security reasons, never share this code with anyone. If you did not request a password reset, you can safely ignore this email.')}
    `,
    ctaLabel: 'Reset Password',
    ctaUrl: `${getClientUrl()}/reset-password`,
  });

  const mailOptions = {
    from: config.email.from,
    to: email,
    subject: 'LinawLetra: Password Reset Request',
    html,
  };

  try {
    await sendMailWithRetry(mailOptions, { type: 'password-reset', email, retries: 2 });
    console.log(`✓ Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('✗ Error sending password reset email:', error.message);
    return false;
  }
};

// Verify code validity and expiration
const verifyCodeExpiration = (expiresAt) => {
  const now = new Date();
  return expiresAt > now;
};

export {
  generateVerificationCode,
  generateResetToken,
  hashCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStudentEnrollmentEmail,
  sendTeacherAccountEmail,
  sendNewStudentAccountEmail,
  verifyCodeExpiration,
  transporter,
};
