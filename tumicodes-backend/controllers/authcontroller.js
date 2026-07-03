// controllers/authController.js - Authentication controller
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { UserModel } = require('../models/models');
const { NotificationModel } = require('../models/models');
const { ActivityModel } = require('../models/models');

class AuthController {
    // Register new user
    static async register(req, res) {
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
            const existingUser = await UserModel.findByEmail(email);
            if (existingUser) {
                return res.status(400).json({
                    error: 'User already exists',
                    code: 'USER_EXISTS'
                });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);
            
            // Create user
            const userId = await UserModel.create({
                email,
                name,
                password: hashedPassword
            });
            
            // Create JWT token
            const token = jwt.sign(
                { userId },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Get user data
            const user = await UserModel.findById(userId);
            
            // Create welcome notification
            await NotificationModel.create({
                user_id: userId,
                type: 'success',
                title: 'Welcome to TumiCodes!',
                message: 'Your account has been created successfully. Start your coding journey now!',
                icon: 'rocket'
            });
            
            // Create first activity
            await ActivityModel.create({
                user_id: userId,
                type: 'profile_updated',
                title: 'Account created'
            });
            
            res.status(201).json({
                message: 'Registration successful',
                token,
                user
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                error: 'Registration failed',
                code: 'REGISTRATION_FAILED'
            });
        }
    }
    
    // Login user
    static async login(req, res) {
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
            const user = await UserModel.findByEmail(email);
            if (!user) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                });
            }
            
            // Check password
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({
                    error: 'Invalid credentials',
                    code: 'INVALID_CREDENTIALS'
                });
            }
            
            // Update last active
            await UserModel.updateLastActive(user.id);
            
            // Create JWT token
            const token = jwt.sign(
                { userId: user.id },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            // Remove password from response
            delete user.password;
            
            // Create login activity
            await ActivityModel.create({
                user_id: user.id,
                type: 'login',
                title: 'User logged in'
            });
            
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
    }
    
    // Verify token
    static async verifyToken(req, res) {
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
            const user = await UserModel.findById(decoded.userId);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            res.json({
                valid: true,
                user
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
    }
    
    // Forgot password
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            
            if (!email) {
                return res.status(400).json({
                    error: 'Email is required',
                    code: 'EMAIL_REQUIRED'
                });
            }
            
            // Check if user exists
            const user = await UserModel.findByEmail(email);
            if (!user) {
                // Return success even if user doesn't exist (security best practice)
                return res.json({
                    message: 'If an account exists with this email, you will receive a password reset link'
                });
            }
            
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
            await NotificationModel.create({
                user_id: user.id,
                type: 'warning',
                title: 'Password Reset Requested',
                message: 'A password reset has been requested for your account. If you did not request this, please ignore this message.',
                icon: 'key'
            });
            
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
    }
    
    // Reset password
    static async resetPassword(req, res) {
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
            await UserModel.update(decoded.userId, { password: hashedPassword });
            
            // Create notification
            await NotificationModel.create({
                user_id: decoded.userId,
                type: 'success',
                title: 'Password Updated',
                message: 'Your password has been successfully updated.',
                icon: 'check-circle'
            });
            
            // Create activity
            await ActivityModel.create({
                user_id: decoded.userId,
                type: 'profile_updated',
                title: 'Password reset'
            });
            
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
    }
    
    // Get current user profile
    static async getProfile(req, res) {
        try {
            const user = await UserModel.findById(req.user.id);
            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }
            
            res.json(user);
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                error: 'Failed to get profile',
                code: 'PROFILE_FETCH_FAILED'
            });
        }
    }
    
    // Update user profile
    static async updateProfile(req, res) {
        try {
            const { name, bio, avatar_url } = req.body;
            
            // Build updates object
            const updates = {};
            if (name !== undefined) updates.name = name;
            if (bio !== undefined) updates.bio = bio;
            if (avatar_url !== undefined) updates.avatar_url = avatar_url;
            
            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    error: 'No fields to update',
                    code: 'NO_UPDATES'
                });
            }
            
            // Update user
            const updatedUser = await UserModel.update(req.user.id, updates);
            
            // Create activity
            await ActivityModel.create({
                user_id: req.user.id,
                type: 'profile_updated',
                title: 'Profile updated'
            });
            
            // Send real-time update
            if (global.sendToUser) {
                global.sendToUser(req.user.id, 'profile_updated', updatedUser);
            }
            
            res.json({
                message: 'Profile updated successfully',
                user: updatedUser
            });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                error: 'Failed to update profile',
                code: 'PROFILE_UPDATE_FAILED'
            });
        }
    }
}

module.exports = AuthController;