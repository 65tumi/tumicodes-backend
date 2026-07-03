const express = require('express');
const router = express.Router();

const { sendEmail } = require('../utils/mailer');

// POST /api/test-email
router.post('/', async (req, res) => {
    try {
        const { to, subject, html, text } = req.body;
        if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

        await sendEmail({
            to,
            subject: subject || 'TumiCodes test email',
            html: html || `<p>${text || 'This is a test email from TumiCodes.'}</p>`
        });

        res.json({ ok: true, message: 'Email sent (or skipped in dev)' });
    } catch (err) {
        console.error('Test email send error:', err);
        res.status(500).json({ error: err.message || 'Failed to send email' });
    }
});

module.exports = router;
