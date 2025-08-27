const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    hitCount: { type: Number, default: 1 },
    userAgents: [{ type: String }],
    urls: [{ type: String }],
    // New fields for better user tracking
    deviceFingerprint: { type: String, index: true },
    sessionId: { type: String, index: true },
    ipHistory: [{ 
        ip: String, 
        timestamp: { type: Date, default: Date.now },
        userAgent: String 
    }],
    location: {
        country: { type: String },
        region: { type: String },
        city: { type: String },
        lat: { type: Number },
        lon: { type: Number },
        timezone: { type: String },
        isp: { type: String }
    },
    firstHit: { type: Date, default: Date.now },
    lastHit: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Automatically delete logs older than 24h
trafficSchema.index({ lastHit: 1 }, { expireAfterSeconds: 86400 });

// Index for device fingerprint and session tracking
trafficSchema.index({ deviceFingerprint: 1, lastHit: -1 });
trafficSchema.index({ sessionId: 1, lastHit: -1 });

module.exports = mongoose.model("Traffic", trafficSchema);
