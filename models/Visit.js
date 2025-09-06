const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
    // Basic tracking information
    trackingCode: {
        type: String,
        required: true,
        index: true
    },
    website: {
        type: String,
        required: true,
        index: true
    },
    domain: {
        type: String,
        required: true,
        index: true
    },
    
    // IP and network information
    ip: {
        type: String,
        required: true,
        index: true
    },
    realIP: String, // Real IP behind proxy
    ipVersion: {
        type: String,
        enum: ['IPv4', 'IPv6'],
        default: 'IPv4'
    },
    
    // Geolocation data
    country: String,
    countryCode: String,
    region: String,
    regionCode: String,
    city: String,
    district: String,
    zip: String,
    timezone: String,
    isp: String,
    org: String,
    as: String,
    asn: String,
    lat: Number,
    lon: Number,
    accuracy: {
        type: String,
        enum: ['high', 'medium', 'low', 'none'],
        default: 'none'
    },
    
    // VPN and Proxy Detection
    isVpn: {
        type: Boolean,
        default: false,
        index: true
    },
    isProxy: {
        type: Boolean,
        default: false,
        index: true
    },
    isTor: {
        type: Boolean,
        default: false,
        index: true
    },
    isHosting: {
        type: Boolean,
        default: false
    },
    vpnProvider: String,
    proxyType: String,
    proxyLevel: {
        type: String,
        enum: ['transparent', 'anonymous', 'elite'],
        default: 'transparent'
    },
    
    // Device and browser fingerprinting
    computerId: String,
    deviceFingerprint: String,
    sessionId: String,
    userAgent: String,
    userAgentHash: String,
    
    // Browser capabilities
    browser: {
        name: String,
        version: String,
        engine: String,
        engineVersion: String
    },
    os: {
        name: String,
        version: String,
        platform: String
    },
    device: {
        type: String,
        model: String,
        vendor: String
    },
    
    // Screen and display
    screenResolution: String,
    colorDepth: Number,
    pixelRatio: Number,
    viewport: {
        width: Number,
        height: Number
    },
    
    // System information
    platform: String,
    language: String,
    languages: [String],
    timezone: String,
    hardwareConcurrency: Number,
    maxTouchPoints: Number,
    cookieEnabled: Boolean,
    doNotTrack: Boolean,
    online: Boolean,
    
    // Network and performance
    connectionType: String,
    effectiveType: String,
    downlink: Number,
    rtt: Number,
    
    // Page and session tracking
    page: String,
    referer: String,
    refererDomain: String,
    url: String,
    title: String,
    pageLoadTime: Number,
    sessionDuration: Number,
    type: {
        type: String,
        enum: ['page_visit', 'heartbeat', 'session_end', 'custom_event', 'page_unload'],
        default: 'page_visit'
    },
    
    // Behavioral tracking
    mouseMovements: Number,
    clicks: Number,
    scrollDepth: Number,
    timeOnPage: Number,
    interactions: [{
        type: String,
        timestamp: Date,
        data: mongoose.Schema.Types.Mixed
    }],
    
    // Security and fraud indicators
    fraudScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    riskFactors: [{
        factor: String,
        score: Number,
        description: String
    }],
    suspiciousActivity: [{
        type: String,
        description: String,
        timestamp: Date,
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'low'
        }
    }],
    
    // Bot detection
    isBot: {
        type: Boolean,
        default: false
    },
    botType: String,
    botConfidence: Number,
    
    // Additional metadata
    headers: mongoose.Schema.Types.Mixed,
    cookies: [String],
    localStorage: Boolean,
    sessionStorage: Boolean,
    
    // Timestamps
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    firstSeen: {
        type: Date,
        default: Date.now
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    
    // User identification (if available)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    
    // Campaign and source tracking
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    utmTerm: String,
    utmContent: String,
    
    // Custom tracking parameters
    customParams: mongoose.Schema.Types.Mixed,
    
    // Processing status
    isProcessed: {
        type: Boolean,
        default: false
    },
    processingErrors: [String],
    
    // Data retention
    retentionExpiry: Date,
    isArchived: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full location
visitSchema.virtual('fullLocation').get(function() {
    const parts = [];
    if (this.city) parts.push(this.city);
    if (this.region) parts.push(this.region);
    if (this.country) parts.push(this.country);
    return parts.join(', ') || 'Unknown';
});

// Virtual for risk level
visitSchema.virtual('riskLevel').get(function() {
    if (this.fraudScore >= 80) return 'critical';
    if (this.fraudScore >= 60) return 'high';
    if (this.fraudScore >= 40) return 'medium';
    if (this.fraudScore >= 20) return 'low';
    return 'safe';
});

// Virtual for is suspicious
visitSchema.virtual('isSuspicious').get(function() {
    return this.isVpn || this.isProxy || this.isTor || this.isBot || this.fraudScore > 50;
});

// Indexes for performance
visitSchema.index({ trackingCode: 1, timestamp: -1 });
visitSchema.index({ website: 1, timestamp: -1 });
visitSchema.index({ ip: 1, timestamp: -1 });
visitSchema.index({ timestamp: -1 });
visitSchema.index({ 'fraudScore': -1 });
visitSchema.index({ 'isVpn': 1, 'isProxy': 1, 'isTor': 1 });
visitSchema.index({ 'computerId': 1, 'timestamp': -1 });
visitSchema.index({ 'sessionId': 1, 'timestamp': -1 });
visitSchema.index({ 'type': 1, 'timestamp': -1 });
visitSchema.index({ 'ip': 1, 'trackingCode': 1, 'type': 1, 'timestamp': -1 });

// Pre-save middleware
visitSchema.pre('save', function(next) {
    // Update lastSeen timestamp
    this.lastSeen = new Date();
    
    // Set retention expiry (default 1 year)
    if (!this.retentionExpiry) {
        this.retentionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }
    
    // Generate session ID if not exists
    if (!this.sessionId) {
        this.sessionId = `sess_${this.computerId || this.ip}_${Date.now()}`;
    }
    
    next();
});

// Instance methods
visitSchema.methods.updateFraudScore = function() {
    let score = 0;
    
    // VPN/Proxy detection
    if (this.isVpn) score += 30;
    if (this.isProxy) score += 25;
    if (this.isTor) score += 40;
    if (this.isHosting) score += 15;
    
    // Bot detection
    if (this.isBot) score += 35;
    
    // Suspicious behavior
    if (this.suspiciousActivity && this.suspiciousActivity.length > 0) {
        score += this.suspiciousActivity.length * 10;
    }
    
    // Multiple visits from same IP in short time
    // This will be calculated in aggregation queries
    
    this.fraudScore = Math.min(100, score);
    return this.fraudScore;
};

visitSchema.methods.addSuspiciousActivity = function(type, description, severity = 'medium') {
    if (!this.suspiciousActivity) {
        this.suspiciousActivity = [];
    }
    
    this.suspiciousActivity.push({
        type,
        description,
        timestamp: new Date(),
        severity
    });
    
    // Update fraud score
    this.updateFraudScore();
};

visitSchema.methods.addInteraction = function(type, data) {
    if (!this.interactions) {
        this.interactions = [];
    }
    
    this.interactions.push({
        type,
        timestamp: new Date(),
        data
    });
};

// Static methods
visitSchema.statics.findRecentByIP = function(ip, minutes = 5) {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.find({
        ip,
        timestamp: { $gte: cutoff }
    }).sort({ timestamp: -1 });
};

visitSchema.statics.findByTrackingCode = function(trackingCode, limit = 100) {
    return this.find({ trackingCode })
        .sort({ timestamp: -1 })
        .limit(limit);
};

visitSchema.statics.getFraudStats = function(website = null, days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const match = { timestamp: { $gte: cutoff } };
    if (website) match.website = website;
    
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: null,
                totalVisits: { $sum: 1 },
                vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                botVisits: { $sum: { $cond: ['$isBot', 1, 0] } },
                suspiciousVisits: { $sum: { $cond: [{ $gt: ['$fraudScore', 50] }, 1, 0] } },
                avgFraudScore: { $avg: '$fraudScore' }
            }
        }
    ]);
};

// Cleanup old data (run periodically)
visitSchema.statics.cleanupOldData = async function() {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year
    
    try {
        const result = await this.deleteMany({
            timestamp: { $lt: cutoff },
            isArchived: true
        });
        
        console.log(`Cleaned up ${result.deletedCount} old visit records`);
        return result.deletedCount;
    } catch (error) {
        console.error('Error cleaning up old visit data:', error);
        throw error;
    }
};

module.exports = mongoose.model('Visit', visitSchema);
