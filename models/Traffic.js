const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    hitCount: { type: Number, default: 1 },
    userAgents: [{ type: String }],
    urls: [{ type: String }],
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

module.exports = mongoose.model("Traffic", trafficSchema);
