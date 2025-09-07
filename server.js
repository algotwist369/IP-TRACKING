// update code for tracking visit

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
require('dotenv').config();
const app = express();
const server = http.createServer(app);


const corsOptions = {
    origin: function (origin, callback) {
        callback(null, origin || "*"); // Reflect origin
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Device-Fingerprint",
        "X-Screen-Resolution",
        "X-Color-Depth",
        "X-Platform",
        "X-Language",
        "X-Timezone",
        "X-Do-Not-Track",
        "X-Hardware-Concurrency",
        "X-Max-Touch-Points",
        "X-Cookie-Enabled",
        "X-Online",
        "X-Session-Id",
        "X-Referrer",
        "X-URL",
        "X-Title",
        "X-User-Agent"
    ],
};


const io = socketIo(server, {
            cors: corsOptions
});

// Middleware
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log incoming requests for debugging
app.use((req, res, next) => {
    if (req.path === '/api/track') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        console.log('Content-Type:', req.get('Content-Type'));
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
    }
};


connectDB();
 
// Visit Schema
const visitSchema = new mongoose.Schema({
    ip: {
        type: String,
        required: true
    },
    website: {
        type: String,
        required: true
    },
    userAgent: String,
    referer: String,
    country: String,
    region: String,
    city: String,
    district: String,
    zip: String,
    timezone: String,
    isp: String,
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
        default: false
    },
    isProxy: {
        type: Boolean,
        default: false
    },
    isTor: {
        type: Boolean,
        default: false
    },
    vpnProvider: String,
    proxyType: String,
    // Computer ID and Fingerprinting
    computerId: String,
    deviceFingerprint: String,
    screenResolution: String,
    colorDepth: Number,
    platform: String,
    language: String,
    timezone: String,
    hardwareConcurrency: Number,
    maxTouchPoints: Number,
    cookieEnabled: Boolean,
    doNotTrack: {
        type: Boolean,
        default: false
    },
    // Session tracking for preventing duplicates
    sessionId: String,
    visitType: {
        type: String,
        enum: ['external', 'direct', 'internal'],
        default: 'direct'
    },
    isFirstVisit: {
        type: Boolean,
        default: true
    },
    // Additional tracking data
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Session Schema for tracking active sessions
const sessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    ip: {
        type: String,
        required: true
    },
    website: {
        type: String,
        required: true
    },
    computerId: String,
    deviceFingerprint: String,
    firstVisit: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    visitCount: {
        type: Number,
        default: 1
    },
    referer: String,
    userAgent: String,
    // Session expires after 30 minutes of inactivity
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 60 * 1000),
        index: { expireAfterSeconds: 0 }
    }
});

const Visit = mongoose.model('Visit', visitSchema);
const Session = mongoose.model('Session', sessionSchema);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Get real IP address (handles proxies, load balancers)
function getRealIP(req) {
    return req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

// Generate unique session ID
function generateSessionId(ip, computerId, deviceFingerprint) {
    const crypto = require('crypto');
    const data = `${ip}-${computerId || 'unknown'}-${deviceFingerprint || 'unknown'}-${Date.now()}`;
    return crypto.createHash('md5').update(data).digest('hex');
}

// Determine visit type based on referer
function getVisitType(referer, website) {
    if (!referer) {
        return 'direct'; // No referer = direct visit
    }
    
    try {
        const refererUrl = new URL(referer);
        const websiteUrl = new URL(website.startsWith('http') ? website : `https://${website}`);
        
        // Same domain = internal navigation
        if (refererUrl.hostname === websiteUrl.hostname) {
            return 'internal';
        }
        
        // Different domain = external visit
        return 'external';
    } catch (error) {
        // Invalid URL, treat as direct
        return 'direct';
    }
}

// Check if referer is from a search engine or social media (external traffic)
function isExternalTraffic(referer) {
    if (!referer) return false;
    
    try {
        const refererUrl = new URL(referer);
        const hostname = refererUrl.hostname.toLowerCase();
        
        // Search engines
        const searchEngines = [
            'google.com', 'google.co.in', 'google.co.uk', 'google.ca', 'google.com.au',
            'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com',
            'ask.com', 'aol.com'
        ];
        
        // Social media platforms
        const socialMedia = [
            'facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com',
            'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
            'whatsapp.com', 'telegram.org', 'discord.com'
        ];
        
        // Check if referer is from search engine or social media
        return searchEngines.some(engine => hostname.includes(engine)) ||
               socialMedia.some(social => hostname.includes(social));
    } catch (error) {
        return false;
    }
}

// Session management functions
async function getOrCreateSession(ip, website, computerId, deviceFingerprint, referer, userAgent) {
    try {
        // Try to find existing active session
        let session = await Session.findOne({
            ip: ip,
            website: website,
            computerId: computerId,
            deviceFingerprint: deviceFingerprint,
            expiresAt: { $gt: new Date() }
        });
        
        if (session) {
            // Update existing session
            session.lastActivity = new Date();
            session.visitCount += 1;
            session.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // Extend session
            await session.save();
            return { session, isNewSession: false };
        } else {
            // Create new session
            const sessionId = generateSessionId(ip, computerId, deviceFingerprint);
            session = new Session({
                sessionId: sessionId,
                ip: ip,
                website: website,
                computerId: computerId,
                deviceFingerprint: deviceFingerprint,
                referer: referer,
                userAgent: userAgent,
                firstVisit: new Date(),
                lastActivity: new Date(),
                visitCount: 1,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            });
            await session.save();
            return { session, isNewSession: true };
        }
    } catch (error) {
        console.error('Error managing session:', error);
        // Fallback: create a basic session
        const sessionId = generateSessionId(ip, computerId, deviceFingerprint);
        return {
            session: {
                sessionId: sessionId,
                visitCount: 1,
                firstVisit: new Date()
            },
            isNewSession: true
        };
    }
}

// VPN and Proxy Detection
async function detectVpnProxy(ip) {
    try {
        // Use multiple services for VPN detection
        const vpnServices = [
            // IPHub VPN detection
            async () => {
                try {
                    const response = await axios.get(`https://v2.api.iphub.info/guest/ip/${ip}`, {
                        timeout: 5000,
                        headers: {
                            'User-Agent': 'IP-Tracker/1.0'
                        }
                    });
                    if (response.data && response.data.block !== undefined) {
                        return {
                            isVpn: response.data.block === 1,
                            isProxy: response.data.block === 1,
                            vpnProvider: response.data.block === 1 ? 'Detected by IPHub' : null
                        };
                    }
                } catch (error) {
                    console.log('IPHub VPN detection failed:', error.message);
                }
                return null;
            },
            
            // IPQualityScore VPN detection (free tier)
            async () => {
                try {
                    const response = await axios.get(`https://ipqualityscore.com/api/json/ip/YOUR_API_KEY/${ip}`, {
                        timeout: 5000
                    });
                    if (response.data && response.data.success) {
                        return {
                            isVpn: response.data.vpn || response.data.proxy,
                            isProxy: response.data.proxy,
                            isTor: response.data.tor,
                            vpnProvider: response.data.vpn ? 'Detected by IPQS' : null,
                            proxyType: response.data.proxy ? response.data.proxy_type : null
                        };
                    }
                } catch (error) {
                    console.log('IPQualityScore VPN detection failed:', error.message);
                }
                return null;
            },
            
            // Simple heuristic detection based on ISP
            async () => {
                try {
                    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=isp,org`, {
                        timeout: 5000
                    });
                    if (response.data && response.data.status === 'success') {
                        const isp = response.data.isp.toLowerCase();
                        const org = response.data.org.toLowerCase();
                        
                        // Common VPN/Proxy providers
                        const vpnKeywords = [
                            'vpn', 'proxy', 'tor', 'nord', 'express', 'surfshark', 
                            'cyberghost', 'private internet access', 'pia', 'mullvad',
                            'windscribe', 'proton', 'tunnelbear', 'hide.me', 'purevpn',
                            'ipvanish', 'hotspot shield', 'zenmate', 'hoxx', 'browsec'
                        ];
                        
                        const isVpn = vpnKeywords.some(keyword => 
                            isp.includes(keyword) || org.includes(keyword)
                        );
                        
                        return {
                            isVpn,
                            isProxy: isVpn,
                            vpnProvider: isVpn ? 'Detected by ISP analysis' : null
                        };
                    }
                } catch (error) {
                    console.log('ISP-based VPN detection failed:', error.message);
                }
                return null;
            }
        ];

        // Try each service until one works
        for (let i = 0; i < vpnServices.length; i++) {
            try {
                const result = await vpnServices[i]();
                if (result) {
                    console.log(`VPN detection result from service ${i + 1} for IP: ${ip}`, result);
                    return result;
                }
            } catch (error) {
                console.log(`VPN detection service ${i + 1} failed for IP ${ip}:`, error.message);
            }
        }

        // Default result if all services fail
        return {
            isVpn: false,
            isProxy: false,
            isTor: false,
            vpnProvider: null,
            proxyType: null
        };
    } catch (error) {
        console.error('Error in VPN detection:', error);
        return {
            isVpn: false,
            isProxy: false,
            isTor: false,
            vpnProvider: null,
            proxyType: null
        };
    }
}

// Get location data from IP
async function getLocationData(ip) {
    try {
        // Try multiple geolocation services for better accuracy
        const services = [
            // Primary service: ip-api.com (free, good accuracy)
            async () => {
                const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,timezone,isp,lat,lon,zip,district`, {
                    timeout: 5000
                });
                if (response.data.status === 'success') {
                    return {
                        country: response.data.country,
                        region: response.data.regionName,
                        city: response.data.city,
                        district: response.data.district,
                        zip: response.data.zip,
                        timezone: response.data.timezone,
                        isp: response.data.isp,
                        lat: response.data.lat,
                        lon: response.data.lon,
                        accuracy: 'high'
                    };
                }
                throw new Error('ip-api.com failed');
            },
            
            // Secondary service: ipapi.co (free tier, good accuracy)
            async () => {
                const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'IP-Tracker/1.0'
                    }
                });
                if (response.data && response.data.latitude && response.data.longitude) {
                    return {
                        country: response.data.country_name,
                        region: response.data.region,
                        city: response.data.city,
                        district: response.data.district,
                        zip: response.data.postal,
                        timezone: response.data.timezone,
                        isp: response.data.org,
                        lat: response.data.latitude,
                        lon: response.data.longitude,
                        accuracy: 'medium'
                    };
                }
                throw new Error('ipapi.co failed');
            },
            
            // Fallback service: ipinfo.io (free tier)
            async () => {
                const response = await axios.get(`https://ipinfo.io/${ip}/json`, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'IP-Tracker/1.0'
                    }
                });
                if (response.data && response.data.loc) {
                    const [lat, lon] = response.data.loc.split(',').map(Number);
                    return {
                        country: response.data.country,
                        region: response.data.region,
                        city: response.data.city,
                        district: response.data.district,
                        zip: response.data.postal,
                        timezone: response.data.timezone,
                        isp: response.data.org,
                        lat: lat,
                        lon: lon,
                        accuracy: 'medium'
                    };
                }
                throw new Error('ipinfo.io failed');
            }
        ];

        // Try each service in order until one works
        for (let i = 0; i < services.length; i++) {
            try {
                const result = await services[i]();
                console.log(`Location data obtained from service ${i + 1} for IP: ${ip}`);
                return result;
            } catch (error) {
                console.log(`Service ${i + 1} failed for IP ${ip}:`, error.message);
                if (i === services.length - 1) {
                    throw error; // All services failed
                }
            }
        }
    } catch (error) {
        console.error('Error fetching location data:', error);
    }

    // Return default data if all services fail
    return {
        country: 'Unknown',
        region: 'Unknown',
        city: 'Unknown',
        district: 'Unknown',
        zip: 'Unknown',
        timezone: 'Unknown',
        isp: 'Unknown',
        lat: 0,
        lon: 0,
        accuracy: 'none'
    };
}

// ============================================================================
// API ROUTES
// ============================================================================

// Track visitor endpoint
app.post('/api/track', async (req, res) => {
    try {
        // Validate request body
        if (!req.body || typeof req.body !== 'object') {
            console.error('Invalid request body:', req.body);
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid request body - JSON data required' 
            });
        }

        const ip = getRealIP(req);
        
        // Extract data with fallbacks
        const { 
            website, 
            userAgent, 
            referer,
            computerId,
            deviceFingerprint,
            screenResolution,
            colorDepth,
            platform,
            language,
            timezone,
            hardwareConcurrency,
            maxTouchPoints,
            cookieEnabled,
            doNotTrack
        } = req.body;

        // Validate required fields
        if (!website) {
            console.error('Missing website in request body:', req.body);
            return res.status(400).json({ 
                success: false, 
                message: 'Website is required' 
            });
        }

        // Determine visit type
        const visitType = getVisitType(referer, website);
        
        // Get or create session
        const { session, isNewSession } = await getOrCreateSession(
            ip, website, computerId, deviceFingerprint, referer, userAgent
        );

        // Only track visits that meet our criteria:
        // 1. New sessions (first visit)
        // 2. External visits (from search engines, social media, other websites)
        // 3. Direct visits (no referer)
        // Skip: Internal navigation and page refreshes within same session
        
        const shouldTrack = isNewSession || 
                           visitType === 'external' || 
                           visitType === 'direct' ||
                           isExternalTraffic(referer);

        if (!shouldTrack) {
            console.log(`Skipping internal navigation/refresh - IP: ${ip}, Website: ${website}, Session: ${session.sessionId}, Visit Type: ${visitType}`);
            return res.status(200).json({ 
                success: true, 
                message: 'Internal navigation - not tracked',
                sessionId: session.sessionId,
                visitType: visitType,
                tracked: false
            });
        }

        // Get location data and VPN detection
        const [locationData, vpnData] = await Promise.all([
            getLocationData(ip),
            detectVpnProxy(ip)
        ]);

        // Create new visit record
        const visit = new Visit({
            ip,
            website,
            userAgent,
            referer,
            computerId,
            deviceFingerprint,
            screenResolution,
            colorDepth,
            platform,
            language,
            timezone,
            hardwareConcurrency,
            maxTouchPoints,
            cookieEnabled,
            doNotTrack: doNotTrack === true || doNotTrack === '1' || doNotTrack === 'true',
            sessionId: session.sessionId,
            visitType: visitType,
            isFirstVisit: isNewSession,
            ...locationData,
            ...vpnData
        });

        await visit.save();

        // Emit real-time data to dashboard
        io.emit('newVisit', {
            ip,
            website,
            country: locationData.country,
            city: locationData.city,
            isp: locationData.isp,
            lat: locationData.lat,
            lon: locationData.lon,
            accuracy: locationData.accuracy,
            isVpn: vpnData.isVpn,
            isProxy: vpnData.isProxy,
            isTor: vpnData.isTor,
            vpnProvider: vpnData.vpnProvider,
            computerId,
            sessionId: session.sessionId,
            visitType: visitType,
            isFirstVisit: isNewSession,
            timestamp: new Date(),
            referer: referer
        });

        console.log(`New visit tracked - IP: ${ip}, Website: ${website}, Type: ${visitType}, Session: ${session.sessionId}, VPN: ${vpnData.isVpn}, Computer ID: ${computerId}`);
        res.status(200).json({ 
            success: true, 
            message: 'Visit tracked',
            sessionId: session.sessionId,
            visitType: visitType,
            isFirstVisit: isNewSession,
            tracked: true
        });
    } catch (error) {
        console.error('Error tracking visit:', error);
        
        // Log detailed error information
        if (error.name === 'ValidationError') {
            console.error('Validation errors:', error.errors);
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Error tracking visit',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get dashboard data
app.get('/api/dashboard', async (req, res) => {
    try {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Get visits from last 24 hours
        const recentVisits = await Visit.find({
            timestamp: { $gte: last24Hours }
        }).sort({ timestamp: -1 });

        // Aggregate data by website
        const websiteStats = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours } } },
            {
                $group: {
                    _id: '$website',
                    totalVisits: { $sum: 1 },
                    uniqueIPs: { $addToSet: '$ip' },
                    countries: { $addToSet: '$country' }
                }
            },
            {
                $project: {
                    website: '$_id',
                    totalVisits: 1,
                    uniqueVisitors: { $size: '$uniqueIPs' },
                    countries: { $size: '$countries' }
                }
            }
        ]);

        // Aggregate data by IP
        const ipStats = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours } } },
            {
                $group: {
                    _id: '$ip',
                    totalVisits: { $sum: 1 },
                    websites: { $addToSet: '$website' },
                    country: { $first: '$country' },
                    city: { $first: '$city' },
                    isp: { $first: '$isp' },
                    lat: { $first: '$lat' },
                    lon: { $first: '$lon' },
                    accuracy: { $first: '$accuracy' },
                    isVpn: { $first: '$isVpn' },
                    isProxy: { $first: '$isProxy' },
                    isTor: { $first: '$isTor' },
                    vpnProvider: { $first: '$vpnProvider' },
                    computerId: { $first: '$computerId' },
                    lastVisit: { $max: '$timestamp' }
                }
            },
            {
                $project: {
                    ip: '$_id',
                    totalVisits: 1,
                    websitesCount: { $size: '$websites' },
                    country: 1,
                    city: 1,
                    isp: 1,
                    lat: 1,
                    lon: 1,
                    accuracy: 1,
                    isVpn: 1,
                    isProxy: 1,
                    isTor: 1,
                    vpnProvider: 1,
                    computerId: 1,
                    lastVisit: 1
                }
            },
            { $sort: { totalVisits: -1 } }
        ]);

        res.json({
            recentVisits,
            websiteStats,
            ipStats,
            totalVisits24h: recentVisits.length
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Error fetching dashboard data' });
    }
});

// Get visits by website
app.get('/api/website/:domain', async (req, res) => {
    try {
        const { domain } = req.params;
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const visits = await Visit.find({
            website: domain,
            timestamp: { $gte: last24Hours }
        }).sort({ timestamp: -1 });

        res.json(visits);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching website data' });
    }
});

// Track IP location endpoint
app.get('/api/track-ip', async (req, res) => {
    try {
        const { ip } = req.query;
        
        if (!ip) {
            return res.status(400).json({ 
                success: false, 
                message: 'IP address is required' 
            });
        }

        // Validate IP format (basic validation)
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ip)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid IP address format' 
            });
        }

        // Get location data for the IP
        const locationData = await getLocationData(ip);

        // Check if we have valid coordinates
        if (locationData.lat === 0 && locationData.lon === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Could not locate this IP address' 
            });
        }

        // Return the location data
        res.json({
            success: true,
            ip: ip,
            country: locationData.country,
            region: locationData.region,
            city: locationData.city,
            district: locationData.district,
            zip: locationData.zip,
            timezone: locationData.timezone,
            isp: locationData.isp,
            lat: locationData.lat,
            lon: locationData.lon,
            accuracy: locationData.accuracy,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Error tracking IP:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error tracking IP location' 
        });
    }
});

// Get IP statistics with coordinates for map
app.get('/api/ip-stats-map', async (req, res) => {
    try {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Get IP stats with coordinates for map display
        const ipStatsWithCoords = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours } } },
            {
                $group: {
                    _id: '$ip',
                    totalVisits: { $sum: 1 },
                    websites: { $addToSet: '$website' },
                    country: { $first: '$country' },
                    city: { $first: '$city' },
                    isp: { $first: '$isp' },
                    lat: { $first: '$lat' },
                    lon: { $first: '$lon' },
                    lastVisit: { $max: '$timestamp' }
                }
            },
            {
                $project: {
                    ip: '$_id',
                    totalVisits: 1,
                    websitesCount: { $size: '$websites' },
                    country: 1,
                    city: 1,
                    isp: 1,
                    lat: 1,
                    lon: 1,
                    lastVisit: 1
                }
            },
            { $sort: { totalVisits: -1 } }
        ]);

        res.json({
            success: true,
            ipStats: ipStatsWithCoords
        });
    } catch (error) {
        console.error('Error fetching IP stats for map:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching IP statistics' 
        });
    }
});

// Get detailed IP analytics showing multiple visits per website
app.get('/api/ip-analytics', async (req, res) => {
    try {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Get detailed analytics showing IP visits per website
        const ipAnalytics = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours } } },
            {
                $group: {
                    _id: {
                        ip: '$ip',
                        website: '$website'
                    },
                    visitCount: { $sum: 1 },
                    firstVisit: { $min: '$timestamp' },
                    lastVisit: { $max: '$timestamp' },
                    country: { $first: '$country' },
                    city: { $first: '$city' },
                    isp: { $first: '$isp' },
                    lat: { $first: '$lat' },
                    lon: { $first: '$lon' },
                    isVpn: { $first: '$isVpn' },
                    isProxy: { $first: '$isProxy' },
                    isTor: { $first: '$isTor' },
                    vpnProvider: { $first: '$vpnProvider' },
                    computerId: { $first: '$computerId' }
                }
            },
            {
                $group: {
                    _id: '$_id.ip',
                    totalVisits: { $sum: '$visitCount' },
                    websites: {
                        $push: {
                            website: '$_id.website',
                            visits: '$visitCount',
                            firstVisit: '$firstVisit',
                            lastVisit: '$lastVisit'
                        }
                    },
                    country: { $first: '$country' },
                    city: { $first: '$city' },
                    isp: { $first: '$isp' },
                    lat: { $first: '$lat' },
                    lon: { $first: '$lon' },
                    isVpn: { $first: '$isVpn' },
                    isProxy: { $first: '$isProxy' },
                    isTor: { $first: '$isTor' },
                    vpnProvider: { $first: '$vpnProvider' },
                    computerId: { $first: '$computerId' }
                }
            },
            {
                $project: {
                    ip: '$_id',
                    totalVisits: 1,
                    websites: 1,
                    country: 1,
                    city: 1,
                    isp: 1,
                    lat: 1,
                    lon: 1,
                    isVpn: 1,
                    isProxy: 1,
                    isTor: 1,
                    vpnProvider: 1,
                    computerId: 1,
                    websiteCount: { $size: '$websites' }
                }
            },
            { $sort: { totalVisits: -1 } }
        ]);

        res.json({
            success: true,
            analytics: ipAnalytics
        });
    } catch (error) {
        console.error('Error fetching IP analytics:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching IP analytics' 
        });
    }
});

// Get session information
app.get('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = await Session.findOne({ sessionId: sessionId });
        
        if (!session) {
            return res.status(404).json({ 
                success: false, 
                message: 'Session not found' 
            });
        }
        
        res.json({
            success: true,
            session: {
                sessionId: session.sessionId,
                ip: session.ip,
                website: session.website,
                computerId: session.computerId,
                firstVisit: session.firstVisit,
                lastActivity: session.lastActivity,
                visitCount: session.visitCount,
                referer: session.referer,
                userAgent: session.userAgent,
                expiresAt: session.expiresAt
            }
        });
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching session data' 
        });
    }
});

// Get visit type statistics
app.get('/api/visit-stats', async (req, res) => {
    try {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const visitStats = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours } } },
            {
                $group: {
                    _id: null,
                    totalVisits: { $sum: 1 },
                    externalVisits: { $sum: { $cond: [{ $eq: ['$visitType', 'external'] }, 1, 0] } },
                    directVisits: { $sum: { $cond: [{ $eq: ['$visitType', 'direct'] }, 1, 0] } },
                    internalVisits: { $sum: { $cond: [{ $eq: ['$visitType', 'internal'] }, 1, 0] } },
                    firstVisits: { $sum: { $cond: ['$isFirstVisit', 1, 0] } },
                    uniqueSessions: { $addToSet: '$sessionId' },
                    uniqueIPs: { $addToSet: '$ip' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalVisits: 1,
                    externalVisits: 1,
                    directVisits: 1,
                    internalVisits: 1,
                    firstVisits: 1,
                    uniqueSessions: { $size: '$uniqueSessions' },
                    uniqueIPs: { $size: '$uniqueIPs' },
                    externalPercentage: { $multiply: [{ $divide: ['$externalVisits', '$totalVisits'] }, 100] },
                    directPercentage: { $multiply: [{ $divide: ['$directVisits', '$totalVisits'] }, 100] },
                    internalPercentage: { $multiply: [{ $divide: ['$internalVisits', '$totalVisits'] }, 100] }
                }
            }
        ]);

        // Get top referrers
        const topReferrers = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours }, referer: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: '$referer',
                    count: { $sum: 1 },
                    visitType: { $first: '$visitType' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            stats: visitStats[0] || {
                totalVisits: 0,
                externalVisits: 0,
                directVisits: 0,
                internalVisits: 0,
                firstVisits: 0,
                uniqueSessions: 0,
                uniqueIPs: 0,
                externalPercentage: 0,
                directPercentage: 0,
                internalPercentage: 0
            },
            topReferrers
        });
    } catch (error) {
        console.error('Error fetching visit stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching visit statistics' 
        });
    }
});

// Get VPN and proxy statistics
app.get('/api/vpn-stats', async (req, res) => {
    try {
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const vpnStats = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours } } },
            {
                $group: {
                    _id: null,
                    totalVisits: { $sum: 1 },
                    vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                    proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                    torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                    cleanVisits: { $sum: { $cond: [{ $and: [{ $eq: ['$isVpn', false] }, { $eq: ['$isProxy', false] }, { $eq: ['$isTor', false] }] }, 1, 0] } },
                    uniqueIPs: { $addToSet: '$ip' },
                    uniqueComputerIds: { $addToSet: '$computerId' }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalVisits: 1,
                    vpnVisits: 1,
                    proxyVisits: 1,
                    torVisits: 1,
                    cleanVisits: 1,
                    uniqueIPs: { $size: '$uniqueIPs' },
                    uniqueComputerIds: { $size: '$uniqueComputerIds' },
                    vpnPercentage: { $multiply: [{ $divide: ['$vpnVisits', '$totalVisits'] }, 100] },
                    proxyPercentage: { $multiply: [{ $divide: ['$proxyVisits', '$totalVisits'] }, 100] },
                    torPercentage: { $multiply: [{ $divide: ['$torVisits', '$totalVisits'] }, 100] }
                }
            }
        ]);

        // Get top VPN providers
        const topVpnProviders = await Visit.aggregate([
            { $match: { timestamp: { $gte: last24Hours }, isVpn: true } },
            {
                $group: {
                    _id: '$vpnProvider',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            stats: vpnStats[0] || {
                totalVisits: 0,
                vpnVisits: 0,
                proxyVisits: 0,
                torVisits: 0,
                cleanVisits: 0,
                uniqueIPs: 0,
                uniqueComputerIds: 0,
                vpnPercentage: 0,
                proxyPercentage: 0,
                torPercentage: 0
            },
            topVpnProviders
        });
    } catch (error) {
        console.error('Error fetching VPN stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching VPN statistics' 
        });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Dashboard connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Dashboard disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
