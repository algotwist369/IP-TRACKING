const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// ============================================================================
// VALIDATION RESULT HANDLER
// ============================================================================

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.warn('Validation errors:', {
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            errors: errors.array()
        });

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(error => ({
                field: error.param,
                message: error.msg,
                value: error.value
            }))
        });
    }
    next();
};

// ============================================================================
// TRACKING DATA VALIDATION
// ============================================================================

const validateTrackingData = [
    // Basic required fields
    body('trackingCode')
        .trim()
        .isLength({ min: 10, max: 100 })
        .withMessage('Tracking code must be between 10 and 100 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Tracking code can only contain letters, numbers, and underscores'),
    
    body('website')
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Website is required and must be less than 255 characters')
        .isURL({ require_protocol: false, require_valid_protocol: false })
        .withMessage('Website must be a valid URL'),
    
    // Optional fields with validation
    body('domain')
        .optional()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Domain must be less than 255 characters'),
    
    body('page')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Page URL must be less than 500 characters'),
    
    body('referer')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Referer URL must be less than 1000 characters'),
    
    body('url')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('URL must be less than 1000 characters'),
    
    body('title')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Page title must be less than 500 characters'),
    
    // Device fingerprinting fields
    body('computerId')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Computer ID must be less than 100 characters'),
    
    body('deviceFingerprint')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Device fingerprint must be less than 200 characters'),
    
    body('sessionId')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Session ID must be less than 100 characters'),
    
    body('userAgent')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('User agent must be less than 1000 characters'),
    
    // Browser and OS information
    body('browser.name')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Browser name must be less than 50 characters'),
    
    body('browser.version')
        .optional()
        .trim()
        .isLength({ max: 20 })
        .withMessage('Browser version must be less than 20 characters'),
    
    body('os.name')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('OS name must be less than 50 characters'),
    
    body('os.version')
        .optional()
        .trim()
        .isLength({ max: 20 })
        .withMessage('OS version must be less than 20 characters'),
    
    // Screen and display
    body('screenResolution')
        .optional()
        .trim()
        .matches(/^\d+x\d+$/)
        .withMessage('Screen resolution must be in format WIDTHxHEIGHT'),
    
    body('colorDepth')
        .optional()
        .isInt({ min: 1, max: 48 })
        .withMessage('Color depth must be between 1 and 48'),
    
    body('pixelRatio')
        .optional()
        .isFloat({ min: 0.1, max: 10 })
        .withMessage('Pixel ratio must be between 0.1 and 10'),
    
    body('viewport.width')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('Viewport width must be between 1 and 10000'),
    
    body('viewport.height')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('Viewport height must be between 1 and 10000'),
    
    // System information
    body('platform')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Platform must be less than 100 characters'),
    
    body('language')
        .optional()
        .trim()
        .isLength({ max: 10 })
        .withMessage('Language must be less than 10 characters'),
    
    body('languages')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Languages must be an array with maximum 10 items'),
    
    body('languages.*')
        .optional()
        .trim()
        .isLength({ max: 10 })
        .withMessage('Each language must be less than 10 characters'),
    
    body('timezone')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Timezone must be less than 50 characters'),
    
    body('hardwareConcurrency')
        .optional()
        .isInt({ min: 1, max: 128 })
        .withMessage('Hardware concurrency must be between 1 and 128'),
    
    body('maxTouchPoints')
        .optional()
        .isInt({ min: 0, max: 20 })
        .withMessage('Max touch points must be between 0 and 20'),
    
    // Boolean fields
    body('cookieEnabled')
        .optional()
        .isBoolean()
        .withMessage('Cookie enabled must be a boolean'),
    
    body('doNotTrack')
        .optional()
        .isBoolean()
        .withMessage('Do not track must be a boolean'),
    
    body('online')
        .optional()
        .isBoolean()
        .withMessage('Online status must be a boolean'),
    
    // Network information
    body('connectionType')
        .optional()
        .trim()
        .isIn(['bluetooth', 'cellular', 'ethernet', 'none', 'wifi', 'wimax', 'other'])
        .withMessage('Connection type must be a valid network type'),
    
    body('effectiveType')
        .optional()
        .trim()
        .isIn(['slow-2g', '2g', '3g', '4g'])
        .withMessage('Effective type must be a valid connection speed'),
    
    body('downlink')
        .optional()
        .isFloat({ min: 0, max: 1000 })
        .withMessage('Downlink must be between 0 and 1000 Mbps'),
    
    body('rtt')
        .optional()
        .isFloat({ min: 0, max: 10000 })
        .withMessage('RTT must be between 0 and 10000 ms'),
    
    // Behavioral tracking
    body('mouseMovements')
        .optional()
        .isInt({ min: 0, max: 100000 })
        .withMessage('Mouse movements must be between 0 and 100000'),
    
    body('clicks')
        .optional()
        .isInt({ min: 0, max: 10000 })
        .withMessage('Clicks must be between 0 and 10000'),
    
    body('scrollDepth')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Scroll depth must be between 0 and 100'),
    
    body('timeOnPage')
        .optional()
        .isInt({ min: 0, max: 86400000 })
        .withMessage('Time on page must be between 0 and 24 hours (in milliseconds)'),
    
    body('pageLoadTime')
        .optional()
        .isInt({ min: 0, max: 60000 })
        .withMessage('Page load time must be between 0 and 60 seconds (in milliseconds)'),
    
    // Interactions array
    body('interactions')
        .optional()
        .isArray({ max: 100 })
        .withMessage('Interactions must be an array with maximum 100 items'),
    
    body('interactions.*.type')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Interaction type must be less than 50 characters'),
    
    body('interactions.*.timestamp')
        .optional()
        .isISO8601()
        .withMessage('Interaction timestamp must be a valid ISO 8601 date'),
    
    body('interactions.*.data')
        .optional()
        .isObject()
        .withMessage('Interaction data must be an object'),
    
    // UTM parameters
    body('utmSource')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('UTM source must be less than 100 characters'),
    
    body('utmMedium')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('UTM medium must be less than 100 characters'),
    
    body('utmCampaign')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('UTM campaign must be less than 100 characters'),
    
    body('utmTerm')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('UTM term must be less than 100 characters'),
    
    body('utmContent')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('UTM content must be less than 100 characters'),
    
    // Custom parameters
    body('customParams')
        .optional()
        .isObject()
        .withMessage('Custom parameters must be an object'),
    
    // Type field
    body('type')
        .optional()
        .trim()
        .isIn(['page_visit', 'heartbeat', 'custom_event', 'session_end', 'page_unload'])
        .withMessage('Type must be a valid tracking event type'),
    
    handleValidationErrors
];

// ============================================================================
// AUTHENTICATION VALIDATION
// ============================================================================

const validateRegistration = [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address')
        .isLength({ max: 100 })
        .withMessage('Email must be less than 100 characters'),
    
    body('password')
        .isLength({ min: 8, max: 128 })
        .withMessage('Password must be between 8 and 128 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    
    body('firstName')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('First name is required and must be less than 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('lastName')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Last name is required and must be less than 50 characters')
        .matches(/^[a-zA-Z\s'-]+$/)
        .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    
    body('company')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('Company name must be less than 100 characters'),
    
    body('phone')
        .optional()
        .trim()
        .matches(/^[\+]?[1-9][\d]{0,15}$/)
        .withMessage('Please provide a valid phone number'),
    
    handleValidationErrors
];

const validateLogin = [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    
    handleValidationErrors
];

// ============================================================================
// WEBSITE VALIDATION
// ============================================================================

const validateWebsite = [
    body('domain')
        .trim()
        .isLength({ min: 1, max: 255 })
        .withMessage('Domain is required and must be less than 255 characters')
        .matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/)
        .withMessage('Please provide a valid domain name'),
    
    body('name')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Website name is required and must be less than 100 characters'),
    
    body('settings.enableRealTimeTracking')
        .optional()
        .isBoolean()
        .withMessage('Real-time tracking setting must be a boolean'),
    
    body('settings.enableVPNDetection')
        .optional()
        .isBoolean()
        .withMessage('VPN detection setting must be a boolean'),
    
    body('settings.enableDeviceFingerprinting')
        .optional()
        .isBoolean()
        .withMessage('Device fingerprinting setting must be a boolean'),
    
    body('settings.enableGeolocation')
        .optional()
        .isBoolean()
        .withMessage('Geolocation setting must be a boolean'),
    
    body('settings.enableReferrerTracking')
        .optional()
        .isBoolean()
        .withMessage('Referrer tracking setting must be a boolean'),
    
    body('settings.enablePageTracking')
        .optional()
        .isBoolean()
        .withMessage('Page tracking setting must be a boolean'),
    
    body('settings.enableSessionTracking')
        .optional()
        .isBoolean()
        .withMessage('Session tracking setting must be a boolean'),
    
    body('settings.privacyMode')
        .optional()
        .isIn(['standard', 'enhanced', 'minimal'])
        .withMessage('Privacy mode must be standard, enhanced, or minimal'),
    
    handleValidationErrors
];

// ============================================================================
// PAYMENT VALIDATION
// ============================================================================

// Simple subscription validation (for Razorpay)
const validateSimpleSubscription = [
    body('plan')
        .trim()
        .isIn(['basic', 'pro', 'premium', 'enterprise'])
        .withMessage('Plan must be basic, pro, premium, or enterprise'),
    
    handleValidationErrors
];

// Full payment validation (for Stripe with billing details)
const validatePayment = [
    body('plan')
        .trim()
        .isIn(['basic', 'premium', 'enterprise'])
        .withMessage('Plan must be basic, premium, or enterprise'),
    
    body('paymentMethodId')
        .trim()
        .notEmpty()
        .withMessage('Payment method ID is required'),
    
    body('billingDetails.firstName')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Billing first name is required and must be less than 50 characters'),
    
    body('billingDetails.lastName')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Billing last name is required and must be less than 50 characters'),
    
    body('billingDetails.email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Billing email must be a valid email address'),
    
    body('billingDetails.address.line1')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Billing address line 1 is required and must be less than 100 characters'),
    
    body('billingDetails.address.city')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Billing city is required and must be less than 50 characters'),
    
    body('billingDetails.address.state')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Billing state is required and must be less than 50 characters'),
    
    body('billingDetails.address.postal_code')
        .trim()
        .isLength({ min: 1, max: 20 })
        .withMessage('Billing postal code is required and must be less than 20 characters'),
    
    body('billingDetails.address.country')
        .trim()
        .isLength({ min: 2, max: 2 })
        .withMessage('Billing country must be a 2-letter country code'),
    
    handleValidationErrors
];

// ============================================================================
// ADMIN VALIDATION
// ============================================================================

const validateAdminAction = [
    body('action')
        .trim()
        .isIn(['suspend_user', 'activate_user', 'delete_user', 'change_role', 'reset_password'])
        .withMessage('Action must be a valid admin action'),
    
    body('userId')
        .isMongoId()
        .withMessage('User ID must be a valid MongoDB ObjectId'),
    
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason must be less than 500 characters'),
    
    body('role')
        .optional()
        .trim()
        .isIn(['user', 'admin', 'premium'])
        .withMessage('Role must be user, admin, or premium'),
    
    handleValidationErrors
];

// ============================================================================
// UTILITY VALIDATION FUNCTIONS
// ============================================================================

const validateObjectId = (paramName) => {
    return (req, res, next) => {
        const { ObjectId } = require('mongoose').Types;
        const id = req.params[paramName];
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: `Invalid ${paramName} format`
            });
        }
        
        next();
    };
};

const validatePagination = [
    body('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    body('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    
    body('sortBy')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Sort by field must be less than 50 characters'),
    
    body('sortOrder')
        .optional()
        .trim()
        .isIn(['asc', 'desc'])
        .withMessage('Sort order must be asc or desc'),
    
    handleValidationErrors
];

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    handleValidationErrors,
    validateTrackingData,
    validateRegistration,
    validateLogin,
    validateWebsite,
    validateSimpleSubscription,
    validatePayment,
    validateAdminAction,
    validateObjectId,
    validatePagination
};
