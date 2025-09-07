const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// ============================================================================
// JWT TOKEN AUTHENTICATION
// ============================================================================

const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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

        // Check if user is active
        if (!user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: 'Email not verified. Please verify your email first.'
            });
        }

        // Add user to request object
        req.user = user;
        req.userId = user._id;
        
        // Log successful authentication
        logger.info(`User authenticated: ${user.email} (${user._id})`);
        
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            logger.warn('Invalid JWT token provided');
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            logger.warn('Expired JWT token provided');
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        logger.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// ============================================================================
// ROLE-BASED ACCESS CONTROL
// ============================================================================

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        if (!roles.includes(req.user.role)) {
            logger.warn(`Access denied for user ${req.user.email} (${req.user.role}) to ${req.originalUrl}`);
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        next();
    };
};

const requireAdmin = requireRole(['admin']);
const requirePremium = requireRole(['admin', 'premium']);

// ============================================================================
// SUBSCRIPTION CHECK
// ============================================================================

const requireActiveSubscription = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Admin users bypass subscription checks
        if (req.user.role === 'admin') {
            return next();
        }

        // Check if user has active subscription
        if (!req.user.isSubscriptionActive) {
            return res.status(403).json({
                success: false,
                message: 'Active subscription required',
                subscriptionStatus: req.user.subscription.status
            });
        }

        // Check subscription plan limits
        const { plan } = req.user.subscription;
        const limits = req.user.limits;

        // Check website limits
        if (req.user.websites.length >= limits.maxWebsites) {
            return res.status(403).json({
                success: false,
                message: 'Website limit reached for your plan',
                current: req.user.websites.length,
                limit: limits.maxWebsites,
                plan: plan
            });
        }

        next();
    } catch (error) {
        logger.error('Subscription check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking subscription'
        });
    }
};

// ============================================================================
// RATE LIMITING PER USER
// ============================================================================

const userRateLimit = (maxRequests, windowMs) => {
    const userRequests = new Map();
    
    return (req, res, next) => {
        if (!req.user) {
            return next();
        }

        const userId = req.user._id.toString();
        const now = Date.now();
        
        if (!userRequests.has(userId)) {
            userRequests.set(userId, {
                count: 1,
                firstRequest: now,
                lastRequest: now
            });
        } else {
            const userData = userRequests.get(userId);
            
            // Reset counter if window has passed
            if (now - userData.firstRequest > windowMs) {
                userData.count = 1;
                userData.firstRequest = now;
            } else {
                userData.count++;
            }
            
            userData.lastRequest = now;
            
            // Check if limit exceeded
            if (userData.count > maxRequests) {
                logger.warn(`User rate limit exceeded: ${req.user.email} (${userId})`);
                return res.status(429).json({
                    success: false,
                    message: 'Too many requests. Please try again later.',
                    retryAfter: Math.ceil((windowMs - (now - userData.firstRequest)) / 1000)
                });
            }
        }
        
        next();
    };
};

// ============================================================================
// WEBSITE OWNERSHIP VERIFICATION
// ============================================================================

const verifyWebsiteOwnership = async (req, res, next) => {
    try {
        const { websiteId } = req.params;
        
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Admin users can access any website
        if (req.user.role === 'admin') {
            return next();
        }

        // Check if user owns the website
        const website = req.user.websites.find(w => w._id.toString() === websiteId);
        if (!website) {
            logger.warn(`Website access denied for user ${req.user.email} to website ${websiteId}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied to this website'
            });
        }

        // Add website to request object
        req.website = website;
        next();
    } catch (error) {
        logger.error('Website ownership verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error verifying website ownership'
        });
    }
};

// ============================================================================
// REFRESH TOKEN AUTHENTICATION
// ============================================================================

const authenticateRefreshToken = async (req, res, next) => {
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

        // Add user to request object
        req.user = user;
        req.userId = user._id;
        
        next();
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

        logger.error('Refresh token authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// ============================================================================
// OPTIONAL AUTHENTICATION (for endpoints that work with or without auth)
// ============================================================================

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id).select('-password');
                if (user && user.isEmailVerified) {
                    req.user = user;
                    req.userId = user._id;
                }
            } catch (error) {
                // Token is invalid, but we continue without authentication
                logger.debug('Optional auth failed, continuing without user');
            }
        }

        next();
    } catch (error) {
        // Continue without authentication on error
        next();
    }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    authenticateToken,
    authenticateRefreshToken,
    requireRole,
    requireAdmin,
    requirePremium,
    requireActiveSubscription,
    verifyWebsiteOwnership,
    userRateLimit,
    optionalAuth
};
