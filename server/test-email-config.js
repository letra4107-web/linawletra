#!/usr/bin/env node
/**
 * Email Configuration Verification Script
 * 
 * Usage:
 *   cd server
 *   node test-email-config.js
 * 
 * This script verifies that:
 * 1. Environment variables are set correctly
 * 2. Gmail SMTP is accessible
 * 3. Nodemailer can authenticate
 * 4. Email can be sent successfully
 */

require('dotenv').config();
import nodemailer from 'nodemailer';

console.log('\n🔍 === Email Configuration Verification ===\n');

// Step 1: Check environment variables
console.log('📋 Checking environment variables...');

const requiredEnv = {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
};

let configValid = true;

for (const [key, value] of Object.entries(requiredEnv)) {
  if (value) {
    if (key === 'EMAIL_PASS') {
      const len = String(value).length;
      const isMasked = len < 16 || /placeholder|replace|xxx|pass/.test(value.toLowerCase());
      console.log(`  ✓ ${key}: ${value.substring(0, 4)}...${value.substring(value.length - 4)} (${len} chars)`);
      if (isMasked) {
        console.log(`    ⚠ WARNING: Looks like a placeholder. Must be 16+ chars from Gmail App Password`);
        configValid = false;
      }
    } else {
      console.log(`  ✓ ${key}: ${value}`);
    }
  } else {
    console.log(`  ✗ ${key}: NOT SET`);
    configValid = false;
  }
}

if (!configValid) {
  console.log('\n❌ Configuration incomplete. Set all EMAIL_* variables in server/.env');
  process.exit(1);
}

// Step 2: Create transporter
console.log('\n🔧 Creating Nodemailer transporter...');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS.trim(),
  },
});

// Step 3: Verify SMTP connection
console.log('🔗 Verifying SMTP connection...\n');

transporter.verify((err, success) => {
  if (err) {
    console.log('❌ SMTP verification failed:\n');
    console.log(`   Error: ${err.message}`);
    console.log(`   Code: ${err.code || 'N/A'}`);
    console.log(`   Response: ${err.response || 'N/A'}\n`);

    if (err.code === 'EAUTH' || (err.response && err.response.includes('535'))) {
      console.log('💡 EAUTH Error (535) = Gmail rejected credentials\n');
      console.log('   Fix:');
      console.log('   1. Go to: https://myaccount.google.com/security');
      console.log('   2. Enable 2-Step Verification (if not already enabled)');
      console.log('   3. Go to: https://myaccount.google.com/apppasswords');
      console.log('   4. Select: Mail → Other (Linux)');
      console.log('   5. Copy the 16-character password');
      console.log('   6. Update EMAIL_PASS in server/.env (exact string, no spaces)');
      console.log('   7. Restart this script\n');
    } else if (err.code === 'ECONNREFUSED') {
      console.log('💡 ECONNREFUSED = Cannot connect to SMTP server\n');
      console.log('   Fix:');
      console.log('   1. Check internet connection');
      console.log('   2. Verify port 587 is not blocked by firewall');
      console.log('   3. Try port 465 (SMTPS): EMAIL_PORT=465, EMAIL_SECURE=true\n');
    } else if (err.code === 'ETIMEDOUT') {
      console.log('💡 ETIMEDOUT = Connection took too long\n');
      console.log('   Fix:');
      console.log('   1. Check firewall rules (port 587 must be open)');
      console.log('   2. Try switching to port 465 for SMTPS\n');
    }

    process.exit(1);
  }

  if (success) {
    console.log('✅ SMTP connection verified successfully!\n');
    console.log(`📧 Email ready to send from: ${process.env.EMAIL_USER}`);
    console.log(`   Host: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`);
    console.log(`   Using: TLS (port 587)\n`);

    // Step 4: Send test email (optional)
    if (process.argv.includes('--send-test')) {
      console.log('📤 Sending test email...\n');
      const testEmail = process.argv[process.argv.indexOf('--send-test') + 1] || process.env.EMAIL_USER;

      const mailOptions = {
        from: `LinawLetra <${process.env.EMAIL_USER}>`,
        to: testEmail,
        subject: 'LinawLetra: SMTP Configuration Test',
        html: `
          <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2d9c78;">LinawLetra SMTP Test</h2>
            <p>This is a test email to verify Gmail SMTP is working correctly.</p>
            <p>If you received this, the email system is configured properly!</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">
              Sent at: ${new Date().toISOString()}<br />
              From: ${process.env.EMAIL_USER}
            </p>
          </div>
        `,
        text: 'LinawLetra SMTP test email - if you received this, email is working!',
      };

      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          console.log('❌ Test email send failed:');
          console.log(`   Error: ${err.message}\n`);
          process.exit(1);
        }

        console.log('✅ Test email sent successfully!');
        console.log(`   To: ${testEmail}`);
        console.log(`   Message ID: ${info.messageId}\n`);
        console.log('💡 Check your inbox (and spam folder) to confirm delivery.\n');
        process.exit(0);
      });
    } else {
      console.log('✅ All checks passed! Backend email service is ready.\n');
      console.log('To send a test email:');
      console.log('  node test-email-config.js --send-test your-email@gmail.com\n');
      process.exit(0);
    }
  }
});

// Timeout if verification takes too long
setTimeout(() => {
  console.log('⏱  Verification timeout - SMTP server not responding\n');
  process.exit(1);
}, 10000);
