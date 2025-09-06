const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const logger = require('../utils/logger');

// ============================================================================
// USER REGISTRATION
// ============================================================================

router.post('/register', validateRegistration, async (req, res) => {
    try {
        const { email, password, firstName, lastName, company, phone } = req.body;

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Create new user
        const user = new User({
            email,
            password,
            firstName,
            lastName,
            company,
            phone
        });

        // Generate email verification token
        const verificationToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        user.emailVerificationToken = verificationToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await user.save();

        // Generate auth tokens
        const accessToken = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();

        // Log successful registration
        logger.info(`New user registered: ${email} (${user._id})`);

        res.status(201).json({
            success: true,
            message: 'User registered successfully. Please check your email for verification.',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    isEmailVerified: user.isEmailVerified
                },
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering user',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// USER LOGIN
// ============================================================================

router.post('/login', validateLogin, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findByEmail(email).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user is locked
        if (user.lockUntil && user.lockUntil > Date.now()) {
            const lockTime = Math.ceil((user.lockUntil - Date.now()) / 1000);
            return res.status(423).json({
                success: false,
                message: `Account is locked. Please try again in ${lockTime} seconds.`
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            // Increment login attempts
            user.loginAttempts += 1;
            
            // Lock account after 5 failed attempts
            if (user.loginAttempts >= 5) {
                user.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
                await user.save();
                
                return res.status(423).json({
                    success: false,
                    message: 'Too many failed login attempts. Account locked for 15 minutes.'
                });
            }
            
            await user.save();
            
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: 'Email not verified. Please verify your email first.'
            });
        }

        // Reset login attempts on successful login
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        user.lastLogin = new Date();
        user.totalLogins += 1;
        user.lastActivity = new Date();
        await user.save();

        // Generate auth tokens
        const accessToken = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();

        // Log successful login
        logger.info(`User logged in: ${email} (${user._id})`);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    isEmailVerified: user.isEmailVerified,
                    subscription: user.subscription,
                    limits: user.limits
                },
                accessToken,
                refreshToken
            }
        });

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during login',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// REFRESH TOKEN
// ============================================================================

router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new tokens
        const newAccessToken = user.generateAuthToken();
        const newRefreshToken = user.generateRefreshToken();

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Refresh token expired'
            });
        }

        logger.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Error refreshing token'
        });
    }
});

// ============================================================================
// EMAIL VERIFICATION
// ============================================================================

router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification token'
            });
        }

        // Check if token is expired
        if (user.emailVerificationExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Verification token has expired'
            });
        }

        // Check if already verified
        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // Verify email
        user.isEmailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();

        logger.info(`Email verified for user: ${user.email} (${user._id})`);

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                success: false,
                message: 'Verification token has expired'
            });
        }

        logger.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email'
        });
    }
});

// ============================================================================
// RESEND VERIFICATION EMAIL
// ============================================================================

router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find user
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already verified
        if (user.isEmailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // Generate new verification token
        const verificationToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        user.emailVerificationToken = verificationToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        // TODO: Send verification email
        logger.info(`Verification email resent for user: ${email} (${user._id})`);

        res.json({
            success: true,
            message: 'Verification email sent successfully',
            data: {
                verificationToken: verificationToken // For development - remove in production
            }
        });

    } catch (error) {
        logger.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending verification email'
        });
    }
});

// ============================================================================
// FORGOT PASSWORD
// ============================================================================

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find user
        const user = await User.findByEmail(email);
        if (!user) {
            // Don't reveal if user exists or not
            return res.json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate password reset token
        const resetToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        user.passwordResetToken = resetToken;
        user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();

        // TODO: Send password reset email
        logger.info(`Password reset email sent for user: ${email} (${user._id})`);

        res.json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });

    } catch (error) {
        logger.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing password reset request'
        });
    }
});

// ============================================================================
// RESET PASSWORD
// ============================================================================

router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token and new password are required'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset token'
            });
        }

        // Check if token is expired
        if (user.passwordResetExpires < Date.now()) {
            return res.status(400).json({
                success: false,
                message: 'Reset token has expired'
            });
        }

        // Update password
        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        logger.info(`Password reset for user: ${user.email} (${user._id})`);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                success: false,
                message: 'Reset token has expired'
            });
        }

        logger.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting password'
        });
    }
});

// ============================================================================
// LOGOUT
// ============================================================================

router.post('/logout', async (req, res) => {
    try {
        // In a stateless JWT system, logout is handled client-side
        // by removing the token. However, you can implement token blacklisting
        // if needed for additional security.

        logger.info('User logged out');

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during logout'
        });
    }
});

// ============================================================================
// GET CURRENT USER
// ============================================================================

router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    company: user.company,
                    phone: user.phone,
                    role: user.role,
                    isEmailVerified: user.isEmailVerified,
                    subscription: user.subscription,
                    limits: user.limits,
                    preferences: user.preferences,
                    websites: user.websites,
                    createdAt: user.createdAt,
                    lastLogin: user.lastLogin
                }
            }
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        logger.error('Get current user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting user information'
        });
    }
});

// ============================================================================
// UPDATE USER PROFILE
// ============================================================================

router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const { firstName, lastName, company, phone, preferences } = req.body;

        // Update allowed fields
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (company !== undefined) user.company = company;
        if (phone !== undefined) user.phone = phone;
        if (preferences) {
            user.preferences = { ...user.preferences, ...preferences };
        }

        await user.save();

        logger.info(`Profile updated for user: ${user.email} (${user._id})`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    company: user.company,
                    phone: user.phone,
                    preferences: user.preferences
                }
            }
        });

    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
});

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

router.put('/change-password', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        logger.info(`Password changed for user: ${user.email} (${user._id})`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error changing password'
        });
    }
});

// ============================================================================
// NOTIFICATION PREFERENCES
// ============================================================================

router.put('/notifications', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const { emailNotifications, pushNotifications, smsNotifications, marketingEmails } = req.body;

        // Update notification preferences
        if (!user.preferences) {
            user.preferences = {};
        }

        user.preferences.notifications = {
            email: emailNotifications !== undefined ? emailNotifications : true,
            push: pushNotifications !== undefined ? pushNotifications : true,
            sms: smsNotifications !== undefined ? smsNotifications : false,
            marketing: marketingEmails !== undefined ? marketingEmails : false
        };

        await user.save();

        logger.info(`Notification preferences updated for user: ${user.email} (${user._id})`);

        res.json({
            success: true,
            message: 'Notification preferences updated successfully',
            data: {
                notifications: user.preferences.notifications
            }
        });

    } catch (error) {
        logger.error('Update notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating notification preferences'
        });
    }
});

// ============================================================================
// DELETE ACCOUNT
// ============================================================================

router.delete('/account', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required to delete account'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Password is incorrect'
            });
        }

        // Delete user
        await User.findByIdAndDelete(decoded.id);

        logger.info(`Account deleted for user: ${user.email} (${user._id})`);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        logger.error('Delete account error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting account'
        });
    }
});

module.exports = router;
