const Traffic = require("../models/Traffic");
const axios = require("axios");
const crypto = require("crypto");

// Function to generate device fingerprint
const generateDeviceFingerprint = (userAgent, headers) => {
    const fingerprintData = {
        userAgent: userAgent || '',
        acceptLanguage: headers['accept-language'] || '',
        acceptEncoding: headers['accept-encoding'] || '',
        accept: headers['accept'] || '',
        connection: headers['connection'] || '',
        upgradeInsecureRequests: headers['upgrade-insecure-requests'] || '',
        secFetchDest: headers['sec-fetch-dest'] || '',
        secFetchMode: headers['sec-fetch-mode'] || '',
        secFetchSite: headers['sec-fetch-site'] || '',
        secFetchUser: headers['sec-fetch-user'] || '',
        cacheControl: headers['cache-control'] || '',
        pragma: headers['pragma'] || '',
        // Enhanced fingerprinting data
        screenResolution: headers['x-screen-resolution'] || '',
        colorDepth: headers['x-color-depth'] || '',
        platform: headers['x-platform'] || '',
        language: headers['x-language'] || '',
        timezone: headers['x-timezone'] || '',
        doNotTrack: headers['x-do-not-track'] || '',
        hardwareConcurrency: headers['x-hardware-concurrency'] || '',
        maxTouchPoints: headers['x-max-touch-points'] || '',
        cookieEnabled: headers['x-cookie-enabled'] || '',
        online: headers['x-online'] || '',
        deviceFingerprint: headers['x-device-fingerprint'] || ''
    };
    
    const fingerprintString = JSON.stringify(fingerprintData);
    return crypto.createHash('sha256').update(fingerprintString).digest('hex');
};

// Function to generate session ID
const generateSessionId = () => {
    return crypto.randomBytes(16).toString('hex');
};

// Function to find existing user by multiple criteria
const findExistingUser = async (ip, deviceFingerprint, sessionId, userAgent) => {
    let existingEntry = null;
    
    // First, try to find by session ID (most reliable)
    if (sessionId) {
        existingEntry = await Traffic.findOne({ sessionId });
        if (existingEntry) return existingEntry;
    }
    
    // Then try by device fingerprint
    if (deviceFingerprint) {
        existingEntry = await Traffic.findOne({ deviceFingerprint });
        if (existingEntry) return existingEntry;
    }
    
    // Then try by IP
    existingEntry = await Traffic.findOne({ ip });
    if (existingEntry) return existingEntry;
    
    // Finally, try to find by similar device fingerprint in recent time (within 1 hour)
    if (deviceFingerprint) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        existingEntry = await Traffic.findOne({
            deviceFingerprint,
            lastHit: { $gte: oneHourAgo }
        });
        if (existingEntry) return existingEntry;
    }
    
    return null;
};

// Function to get IP location data
const getIpLocation = async (ip) => {
    try {
        // Skip localhost and private IPs
        if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
            return {
                country: 'Local',
                region: 'Local',
                city: 'Local',
                lat: 0,
                lon: 0,
                timezone: 'Local',
                isp: 'Local'
            };
        }

        const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,lat,lon,timezone,isp`);
        
        if (response.data.status === 'success') {
            return {
                country: response.data.country || 'Unknown',
                region: response.data.regionName || 'Unknown',
                city: response.data.city || 'Unknown',
                lat: response.data.lat || 0,
                lon: response.data.lon || 0,
                timezone: response.data.timezone || 'Unknown',
                isp: response.data.isp || 'Unknown'
            };
        }
        
        return {
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown',
            lat: 0,
            lon: 0,
            timezone: 'Unknown',
            isp: 'Unknown'
        };
    } catch (error) {
        console.error('Error fetching IP location:', error.message);
        return {
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown',
            lat: 0,
            lon: 0,
            timezone: 'Unknown',
            isp: 'Unknown'
        };
    }
};

const ipTracking = async (req, res) => {
    try {
        console.log('IP tracking request received:', {
            method: req.method,
            headers: req.headers,
            body: req.body
        });
        
        const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";
        const url = req.headers.referer || "";
        
        // Generate device fingerprint and session ID
        const deviceFingerprint = generateDeviceFingerprint(userAgent, req.headers);
        const sessionId = req.cookies?.sessionId || generateSessionId();
        
        // Set session cookie if not present
        if (!req.cookies?.sessionId) {
            res.cookie('sessionId', sessionId, { 
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
        }

        // Find existing user by multiple criteria
        let existingEntry = await findExistingUser(ip, deviceFingerprint, sessionId, userAgent);
        
        if (existingEntry) {
            // User exists, update their record
            existingEntry.hitCount += 1;
            existingEntry.lastHit = new Date();
            existingEntry.updatedAt = new Date();
            
            // Update session ID if it changed
            if (sessionId && existingEntry.sessionId !== sessionId) {
                existingEntry.sessionId = sessionId;
            }
            
            // Update device fingerprint if it changed
            if (deviceFingerprint && existingEntry.deviceFingerprint !== deviceFingerprint) {
                existingEntry.deviceFingerprint = deviceFingerprint;
            }
            
            // Add new IP to history if it's different
            if (ip !== existingEntry.ip) {
                existingEntry.ipHistory.push({
                    ip: existingEntry.ip,
                    timestamp: existingEntry.lastHit,
                    userAgent: existingEntry.userAgents[existingEntry.userAgents.length - 1] || userAgent
                });
                existingEntry.ip = ip;
            }
            
            // Add new user agent if not already present
            if (userAgent && !existingEntry.userAgents.includes(userAgent)) {
                existingEntry.userAgents.push(userAgent);
            }
            
            // Add new URL if not already present
            if (url && !existingEntry.urls.includes(url)) {
                existingEntry.urls.push(url);
            }
            
            // Update location if it was previously unknown
            if (existingEntry.location.country === 'Unknown' || existingEntry.location.country === 'Error') {
                const newLocation = await getIpLocation(ip);
                existingEntry.location = newLocation;
            }
            
            await existingEntry.save();
            
            // Send live update via socket with optimized data
            const visitData = {
                ip,
                hitCount: existingEntry.hitCount,
                userAgent: userAgent ? userAgent.substring(0, 100) : '', // Truncate for performance
                url: url ? url.substring(0, 200) : '', // Truncate for performance
                location: existingEntry.location,
                time: existingEntry.lastHit,
                isNew: false,
                isReturningUser: true,
                previousIPs: existingEntry.ipHistory.length,
                sessionId: existingEntry.sessionId,
                deviceFingerprint: existingEntry.deviceFingerprint ? existingEntry.deviceFingerprint.substring(0, 50) : ''
            };
            
            // Use room-based emission for better performance
            req.io.to('admin-dashboard').emit("new-visit", visitData);
            
        } else {
            // New user, create entry
            const location = await getIpLocation(ip);
            
            const newEntry = await Traffic.create({ 
                ip, 
                hitCount: 1,
                deviceFingerprint,
                sessionId,
                userAgents: userAgent ? [userAgent] : [],
                urls: url ? [url] : [],
                location,
                firstHit: new Date(),
                lastHit: new Date()
            });
            
            // Send live update via socket with optimized data
            const visitData = {
                ip,
                hitCount: 1,
                userAgent: userAgent ? userAgent.substring(0, 100) : '', // Truncate for performance
                url: url ? url.substring(0, 200) : '', // Truncate for performance
                location,
                time: newEntry.lastHit,
                isNew: true,
                isReturningUser: false,
                sessionId: newEntry.sessionId,
                deviceFingerprint: newEntry.deviceFingerprint ? newEntry.deviceFingerprint.substring(0, 50) : ''
            };
            
            // Use room-based emission for better performance
            req.io.to('admin-dashboard').emit("new-visit", visitData);
        }

        console.log('IP tracking successful for IP:', ip);
        res.json({ status: "ok", ip: ip });
    } catch (err) {
        console.error('IP tracking error:', err);
        res.status(500).json({ error: "logging failed", details: err.message });
    }
}

const getReport = async (req, res) => {
    try {
        const suspicious = await Traffic.find({ hitCount: { $gt: 20 } })
            .sort({ hitCount: -1 })
            .select('ip hitCount lastHit location userAgents urls');
            
        res.json(suspicious);
    } catch (err) {
        res.status(500).json({ error: "report failed" });
    }
};

// New function to get IPs from last 24 hours
const getLast24Hours = async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const last24HoursData = await Traffic.find({ 
            lastHit: { $gte: twentyFourHoursAgo } 
        })
        .sort({ hitCount: -1 })
        .select('ip hitCount firstHit lastHit location userAgents urls');

        res.json({
            totalUniqueIPs: last24HoursData.length,
            totalHits: last24HoursData.reduce((sum, item) => sum + item.hitCount, 0),
            data: last24HoursData
        });
    } catch (err) {
        console.error('Error getting last 24 hours data:', err);
        res.status(500).json({ error: "Failed to get last 24 hours data" });
    }
};

// Function to get location data for a specific IP
const getIpLocationData = async (req, res) => {
    try {
        const { ip } = req.params;
        
        if (!ip) {
            return res.status(400).json({ error: "IP address is required" });
        }

        const location = await getIpLocation(ip);
        res.json({ ip, location });
    } catch (err) {
        console.error('Error getting IP location:', err);
        res.status(500).json({ error: "Failed to get IP location" });
    }
};

module.exports = { 
    ipTracking, 
    getReport, 
    getLast24Hours, 
    getIpLocationData 
};