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

  const mailOptions = {
    from: config.email.from,
    to: teacherEmail,
    subject,
    html,
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
  });
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isTransientSmtpError = (code) => {
  return ['ECONNRESET', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code);
};

const sendBrevoMail = async (mailOptions, { type, email } = {}) => {
  const sender = parseEmailAddress(mailOptions.from || config.email.from);
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

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': config.email.brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

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
  console.log(`📧 Sending ${type} verification to: ${email} using ${config.email.user}`);

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

  const mailOptions = {
    from: config.email.from,
    to: parentEmail,
    subject,
    html,
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
  const mailOptions = {
    from: config.email.from,
    to: email,
    subject: 'LinawLetra: Password Reset Request',
    html: `
      <div style="font-family: 'Josefin Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; letter-spacing: 0.06em;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: #1e5a96; margin-top: 0; font-size: 28px; letter-spacing: 0.08em;">Password Reset Request</h1>

          <p style="color: #4b5563; font-size: 16px; line-height: 1.8;">
            We received a request to reset your LinawLetra password. Use the code below to proceed:
          </p>

          <div style="background-color: #f0f4f8; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <p style="color: #666; font-size: 14px; margin: 0 0 10px 0;">Your reset code is:</p>
            <p style="color: #1e5a96; font-size: 32px; font-weight: bold; letter-spacing: 0.1em; margin: 0;">
              ${resetCode}
            </p>
            <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">
              This code expires in ${config.passwordReset.expiresIn}
            </p>
          </div>

          <p style="color: #4b5563; font-size: 16px; line-height: 1.8;">
            If you didn't request this, you can safely ignore this email.
          </p>

          <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            For security reasons, never share your reset code with anyone.
          </p>
        </div>
      </div>
    `,
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
