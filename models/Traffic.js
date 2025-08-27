const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema({
    ip: { type: String, required: true },
    userAgent: { type: String },
    url: { type: String },
    createdAt: { type: Date, default: Date.now },
});

// Automatically delete logs older than 24h
trafficSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("Traffic", trafficSchema);
