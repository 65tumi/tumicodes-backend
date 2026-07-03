// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../models/db');
const { authRateLimiter } = require('../middleware/auth');

const { sendOTPEmail, sendWelcomeEmail } = require('../utils/mailer');

// Register new user
router.post('/register', authRateLimiter, async (req, res) => {
    try {
        const { email, name, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }
        
        // Check if user exists
        const [existingUsers] = await executeQuery(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({
                error: 'User already exists',
                code: 'USER_EXISTS'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user
        const [result] = await executeQuery(
            'INSERT INTO users (email, name, password) VALUES (?, ?, ?)',
            [email, name, hashedPassword]
        );
        
        // Create JWT token for session
        const token = jwt.sign(
            { userId: result.insertId },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Generate numeric OTP for email verification
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

        await executeQuery(
            'INSERT INTO email_otps (user_id, otp, expires_at, created_at) VALUES (?, ?, ?, NOW())',
            [result.insertId, otp, expiresAtStr]
        );
        
        // Get user data
        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak FROM users WHERE id = ?',
            [result.insertId]
        );
        
        // Create welcome notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [result.insertId, 'success', 'Welcome to TumiCodes!', 'Your account has been created successfully. Start your coding journey now!', 'rocket']
        );

        // Create verification notification with OTP
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [result.insertId, 'info', 'Verify your email', `Please verify your email using this code: ${otp}`, 'envelope']
        );

        // Send OTP email (if configured)
        try {
            await sendOTPEmail(email, otp, name || users[0].name || '');
        } catch (mailErr) {
            console.warn('Failed to send verification OTP email:', mailErr.message || mailErr);
        }

        // Send welcome email (uses Resend if configured)
        try {
            await sendWelcomeEmail(email, name || users[0].name || '');
        } catch (mailErr) {
            console.warn('Failed to send welcome email:', mailErr.message || mailErr);
        }
        
        // Create first activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [result.insertId, 'profile_updated', 'Account created']
        );
        
        const responsePayload = {
            message: 'Registration successful',
            token,
            user: users[0]
        };

        if (process.env.NODE_ENV === 'development') {
            responsePayload.verificationOtp = otp;
            responsePayload.otpExpiresAt = expiresAtStr;
        }

        res.status(201).json(responsePayload);
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            code: 'REGISTRATION_FAILED'
        });
    }
});

// Login user
router.post('/login', authRateLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        // Get user
        const [users] = await executeQuery(
            'SELECT id, email, name, password, role, avatar_url, xp, level, streak, email_verified FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        const user = users[0];

        // Check password first
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // If email not verified, send OTP and instruct frontend to verify
        if (!user.email_verified) {
            // Generate OTP
            const otp = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

            await executeQuery(
                'INSERT INTO email_otps (user_id, otp, expires_at, created_at) VALUES (?, ?, ?, NOW())',
                [user.id, otp, expiresAtStr]
            );

            await executeQuery(
                'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
                [user.id, 'info', 'Verify your email', `Please verify your email using this code: ${otp}`, 'envelope']
            );

            try {
                await sendOTPEmail(user.email, otp, user.name || '');
            } catch (mailErr) {
                console.warn('Failed to send verification OTP email on login:', mailErr.message || mailErr);
            }

            const resp = { message: 'Email not verified', code: 'EMAIL_NOT_VERIFIED_OTP_SENT' };
            if (process.env.NODE_ENV === 'development') {
                resp.verificationOtp = otp;
                resp.otpExpiresAt = expiresAtStr;
            }

            return res.status(403).json(resp);
        }
        
        // Update last active
        await executeQuery(
            'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        delete user.password;
        
        // Create login activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [user.id, 'login', 'User logged in']
        );
        
        res.json({
            message: 'Login successful',
            token,
            user
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            code: 'LOGIN_FAILED'
        });
    }
});

// Verify email token
router.post('/verify-email', authRateLimiter, async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) return res.status(400).json({ error: 'Token is required', code: 'TOKEN_REQUIRED' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'email_verification') {
            return res.status(400).json({ error: 'Invalid token type', code: 'INVALID_TOKEN_TYPE' });
        }

        // mark user as verified
        await executeQuery('UPDATE users SET email_verified = TRUE WHERE id = ?', [decoded.userId]);

        // create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [decoded.userId, 'success', 'Email Verified', 'Your email address has been verified.', 'check-circle']
        );

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(400).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
        }
        console.error('Verify email error:', error);
        res.status(500).json({ error: 'Email verification failed', code: 'VERIFICATION_FAILED' });
    }
});

// Resend verification link
router.post('/resend-verification', authRateLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required', code: 'EMAIL_REQUIRED' });

        const [users] = await executeQuery('SELECT id, email_verified FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        }

        const user = users[0];
        if (user.email_verified) {
            return res.json({ message: 'Email already verified' });
        }
        // Generate new OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

        await executeQuery(
            'INSERT INTO email_otps (user_id, otp, expires_at, created_at) VALUES (?, ?, ?, NOW())',
            [user.id, otp, expiresAtStr]
        );

        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'info', 'Verify your email', `Please verify your email using this code: ${otp}`, 'envelope']
        );

        try {
            await sendOTPEmail(email, otp);
        } catch (mailErr) {
            console.warn('Failed to send verification OTP email:', mailErr.message || mailErr);
        }

        if (process.env.NODE_ENV === 'development') {
            return res.json({ message: 'Verification OTP generated', verificationOtp: otp, otpExpiresAt: expiresAtStr });
        }

        res.json({ message: 'Verification OTP resent' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification', code: 'RESEND_FAILED' });
    }
});

// Verify token
router.post('/verify', async (req, res) => {
    try {
        const token = req.body.token;
        
        if (!token) {
            return res.status(400).json({
                error: 'Token is required',
                code: 'TOKEN_REQUIRED'
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user data
        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak FROM users WHERE id = ?',
            [decoded.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        res.json({
            valid: true,
            user: users[0]
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.json({
                valid: false,
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.json({
                valid: false,
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        console.error('Token verification error:', error);
        res.status(500).json({
            error: 'Token verification failed',
            code: 'VERIFICATION_FAILED'
        });
    }
});

// Verify token via Authorization header (GET) - returns user when valid
router.get('/verify', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ valid: false, error: 'No token provided', code: 'NO_TOKEN' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await executeQuery(
            'SELECT id, email, name, role, avatar_url, xp, level, streak FROM users WHERE id = ?',
            [decoded.userId]
        );

        if (users.length === 0) return res.status(404).json({ valid: false, error: 'User not found', code: 'USER_NOT_FOUND' });

        res.json({ valid: true, user: users[0] });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(200).json({ valid: false, error: 'Invalid token', code: 'INVALID_TOKEN' });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(200).json({ valid: false, error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }

        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Token verification failed', code: 'VERIFICATION_FAILED' });
    }
});

// Verify OTP
router.post('/verify-otp', authRateLimiter, async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required', code: 'VALIDATION_ERROR' });

        const [users] = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });

        const user = users[0];

        const [rows] = await executeQuery(
            'SELECT id, otp, expires_at, used FROM email_otps WHERE user_id = ? AND otp = ? AND used = FALSE ORDER BY created_at DESC LIMIT 1',
            [user.id, otp]
        );

        if (!rows || rows.length === 0) return res.status(400).json({ error: 'Invalid OTP', code: 'INVALID_OTP' });

        const record = rows[0];
        const now = new Date();
        const expires = new Date(record.expires_at);
        if (expires < now) return res.status(400).json({ error: 'OTP expired', code: 'OTP_EXPIRED' });

        // mark user verified and otp used
        await executeQuery('UPDATE users SET email_verified = TRUE WHERE id = ?', [user.id]);
        await executeQuery('UPDATE email_otps SET used = TRUE WHERE id = ?', [record.id]);

        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'success', 'Email Verified', 'Your email address has been verified.', 'check-circle']
        );

        // generate auth token for the user so frontend can auto-login
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // return token and success
        res.json({ message: 'Email verified successfully', token });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ error: 'OTP verification failed', code: 'OTP_VERIFY_FAILED' });
    }
});

// Forgot password
router.post('/forgot-password', authRateLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                error: 'Email is required',
                code: 'EMAIL_REQUIRED'
            });
        }
        
        // Check if user exists
        const [users] = await executeQuery(
            'SELECT id, email FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            // Return success even if user doesn't exist (security best practice)
            return res.json({
                message: 'If an account exists with this email, you will receive a password reset link'
            });
        }
        
        const user = users[0];
        
        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign(
            { userId: user.id, type: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        // In production, you would send an email here
        // For now, we'll just return the token (in production, don't do this!)
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        
        // Create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [user.id, 'warning', 'Password Reset Requested', 'A password reset has been requested for your account. If you did not request this, please ignore this message.', 'key']
        );
        
        // In development, return the reset link
        if (process.env.NODE_ENV === 'development') {
            res.json({
                message: 'Password reset link generated',
                resetLink: resetLink,
                note: 'In production, this would be sent via email'
            });
        } else {
            res.json({
                message: 'If an account exists with this email, you will receive a password reset link'
            });
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            error: 'Password reset request failed',
            code: 'RESET_FAILED'
        });
    }
});

// Reset password
router.post('/reset-password', authRateLimiter, async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({
                error: 'Token and new password are required',
                code: 'VALIDATION_ERROR'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters',
                code: 'PASSWORD_TOO_SHORT'
            });
        }
        
        // Verify reset token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.type !== 'password_reset') {
            return res.status(400).json({
                error: 'Invalid token type',
                code: 'INVALID_TOKEN_TYPE'
            });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update password
        await executeQuery(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, decoded.userId]
        );
        
        // Create notification
        await executeQuery(
            'INSERT INTO notifications (user_id, type, title, message, icon) VALUES (?, ?, ?, ?, ?)',
            [decoded.userId, 'success', 'Password Updated', 'Your password has been successfully updated.', 'check-circle']
        );
        
        // Create activity
        await executeQuery(
            'INSERT INTO activities (user_id, type, title) VALUES (?, ?, ?)',
            [decoded.userId, 'profile_updated', 'Password reset']
        );
        
        res.json({
            message: 'Password reset successful'
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                error: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
        }
        
        console.error('Reset password error:', error);
        res.status(500).json({
            error: 'Password reset failed',
            code: 'RESET_FAILED'
        });
    }
});

module.exports = router;