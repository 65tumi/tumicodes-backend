require('dotenv').config();
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@tumicodes.com';

let resendClient = null;
if (RESEND_API_KEY) {
    resendClient = new Resend(RESEND_API_KEY);
}

async function sendEmail({ to, subject, html, text }) {
    if (!resendClient) {
        console.warn('Resend API key not configured — skipping email send');
        return { skipped: true };
    }

    try {
        await resendClient.emails.send({
            from: FROM_EMAIL,
            to,
            subject,
            html
        });
        return { ok: true };
    } catch (error) {
        console.error('Resend error:', error);
        throw error;
    }
}

async function sendVerificationEmail(to, link, name = '') {
    const subject = 'Verify your TumiCodes email address';
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">
            <h2>Welcome to TumiCodes${name ? `, ${name}` : ''}!</h2>
            <p>Thanks for creating an account. Please verify your email by clicking the button below:</p>
            <p><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#FF003C;color:#fff;text-decoration:none">Verify Email</a></p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p><a href="${link}">${link}</a></p>
            <p>— The TumiCodes Team</p>
        </div>
    `;

    return await sendEmail({ to, subject, html });
}

async function sendOTPEmail(to, otp, name = '', expiresMinutes = 15) {
    const subject = 'Your TumiCodes verification code';
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">
            <h2>Welcome to TumiCodes${name ? `, ${name}` : ''}!</h2>
            <p>Your verification code is:</p>
            <p style="font-size:20px;letter-spacing:4px;font-weight:bold">${otp}</p>
            <p>This code will expire in ${expiresMinutes} minutes.</p>
            <p>If you didn't request this, you can ignore this message.</p>
            <p>— The TumiCodes Team</p>
        </div>
    `;

    return await sendEmail({ to, subject, html });
}

 

async function sendWelcomeEmail(to, name = '') {
    const subject = 'Welcome to TumiCodes!';
    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.4;color:#111">
            <h2>Welcome to TumiCodes${name ? `, ${name}` : ''}!</h2>
            <p>We're excited to have you on board. Explore our courses, participate in events, and start building great things.</p>
            <p>If you'd like to receive our newsletter, be sure to enable the subscription in your account settings.</p>
            <p>— The TumiCodes Team</p>
        </div>
    `;

    return await sendEmail({ to, subject, html });
}

module.exports = { sendEmail, sendVerificationEmail, sendOTPEmail, sendWelcomeEmail };
