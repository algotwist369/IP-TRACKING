const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters long'],
        select: false
    },
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    company: {
        type: String,
        trim: true,
        maxlength: [100, 'Company name cannot exceed 100 characters']
    },
    phone: {
        type: String,
        trim: true,
        match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'premium'],
        default: 'user'
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    
    // Subscription and billing
    subscription: {
        plan: {
            type: String,
            enum: ['free', 'basic', 'pro', 'premium', 'enterprise'],
            default: 'free'
        },
        status: {
            type: String,
            enum: ['active', 'pending', 'canceled', 'past_due', 'unpaid', 'trialing'],
            default: 'active'
        },
        amount: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            default: 'INR'
        },
        razorpayOrderId: String,
        razorpayPaymentId: String,
        razorpaySignature: String,
        createdAt: Date,
        activatedAt: Date,
        currentPeriodStart: Date,
        currentPeriodEnd: Date,
        canceledAt: Date,
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false
        },
        billingDetails: {
            email: String,
            name: String
        },
        upgradeOrderId: String,
        upgradeToPlan: String
    },
    
    // Website management
    websites: [{
        domain: {
            type: String,
            required: true,
            trim: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        trackingCode: {
            type: String,
            required: false,
            default: null
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        scriptAddedAt: {
            type: Date,
            default: null
        },
        lastActivity: Date,
        totalVisits: {
            type: Number,
            default: 0
        },
        uniqueVisitors: {
            type: Number,
            default: 0
        },
        settings: {
            enableRealTimeTracking: {
                type: Boolean,
                default: true
            },
            enableVPNDetection: {
                type: Boolean,
                default: true
            },
            enableDeviceFingerprinting: {
                type: Boolean,
                default: true
            },
            enableGeolocation: {
                type: Boolean,
                default: true
            },
            enableReferrerTracking: {
                type: Boolean,
                default: true
            },
            enablePageTracking: {
                type: Boolean,
                default: true
            },
            enableSessionTracking: {
                type: Boolean,
                default: true
            },
            privacyMode: {
                type: String,
                enum: ['standard', 'enhanced', 'minimal'],
                default: 'standard'
            }
        }
    }],
    
    // Usage limits
    limits: {
        maxWebsites: {
            type: Number,
            default: 1
        },
        maxVisitsPerMonth: {
            type: Number,
            default: 1000
        },
        maxDataRetentionDays: {
            type: Number,
            default: 30
        },
        maxAPIRequestsPerDay: {
            type: Number,
            default: 1000
        }
    },
    
    // API keys for external integrations
    apiKeys: [{
        name: String,
        key: String,
        isActive: Boolean,
        createdAt: Date,
        lastUsed: Date
    }],
    
    // Preferences
    preferences: {
        emailNotifications: {
            securityAlerts: {
                type: Boolean,
                default: true
            },
            weeklyReports: {
                type: Boolean,
                default: true
            },
            monthlyBilling: {
                type: Boolean,
                default: true
            }
        },
        dashboardTheme: {
            type: String,
            enum: ['light', 'dark', 'auto'],
            default: 'light'
        },
        timezone: {
            type: String,
            default: 'UTC'
        },
        language: {
            type: String,
            default: 'en'
        }
    },
    
    // Security
    lastLogin: Date,
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: Date,
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    twoFactorSecret: String,
    twoFactorBackupCodes: [String],
    
    // Activity tracking
    lastActivity: Date,
    totalLogins: {
        type: Number,
        default: 0
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Virtual for subscription status
userSchema.virtual('isSubscriptionActive').get(function() {
    return this.subscription.status === 'active' || this.subscription.status === 'trialing';
});

// Virtual for website count
userSchema.virtual('activeWebsiteCount').get(function() {
    return this.websites.filter(website => website.isActive).length;
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ 'websites.domain': 1 });
// userSchema.index({ 'websites.trackingCode': 1 }, { sparse: true }); // Commented out to avoid index issues
userSchema.index({ 'subscription.stripeCustomerId': 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware
userSchema.pre('save', async function(next) {
    // Only hash password if it's modified
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Pre-save middleware for updating timestamp
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function() {
    return jwt.sign(
        { id: this._id, email: this.email, role: this.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

userSchema.methods.generateRefreshToken = function() {
    return jwt.sign(
        { id: this._id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
    );
};

userSchema.methods.generateTrackingCode = function() {
    return `ip_${this._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

userSchema.methods.addWebsite = function(domain, name) {
    if (this.websites.length >= this.limits.maxWebsites) {
        throw new Error('Website limit reached for your plan');
    }
    
    const website = {
        domain,
        name,
        trackingCode: this.generateTrackingCode(),
        createdAt: new Date()
    };
    
    this.websites.push(website);
    return website;
};

userSchema.methods.removeWebsite = function(domain) {
    const websiteIndex = this.websites.findIndex(w => w.domain === domain);
    if (websiteIndex === -1) {
        throw new Error('Website not found');
    }
    
    this.websites.splice(websiteIndex, 1);
};

userSchema.methods.updateWebsiteActivity = function(domain, visitCount = 1) {
    const website = this.websites.find(w => w.domain === domain);
    if (website) {
        website.lastActivity = new Date();
        website.totalVisits += visitCount;
    }
};

// Static methods
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByTrackingCode = function(trackingCode) {
    return this.findOne({ 'websites.trackingCode': trackingCode });
};

module.exports = mongoose.model('User', userSchema);
