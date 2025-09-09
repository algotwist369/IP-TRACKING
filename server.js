const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cluster = require('cluster');
const os = require('os');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const NodeCache = require('node-cache');
require('dotenv').config();

// Initialize cache (TTL: 5 minutes for location data, 30 minutes for VPN data)
const locationCache = new NodeCache({ stdTTL: 300 });
const vpnCache = new NodeCache({ stdTTL: 1800 });
const sessionCache = new NodeCache({ stdTTL: 1800 });

// Clustering for better performance
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numCPUs = Math.min(os.cpus().length, 4); // Max 4 workers
    console.log(`Master ${process.pid} is running`);
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });
} else {
    startServer();
}

function startServer() {
    const app = express();
    const server = http.createServer(app);

    // Enhanced CORS with origin validation
    const corsOptions = {
        origin: function (origin, callback) {
            // Allow requests from your domains or localhost
            const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
                process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:5173', 'https://dostracker.ciphra.in'];

            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, origin); // Allow all for now, implement stricter validation as needed
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: [
            "Content-Type", "Authorization", "X-Device-Fingerprint", "X-Screen-Resolution",
            "X-Color-Depth", "X-Platform", "X-Language", "X-Timezone", "X-Do-Not-Track",
            "X-Hardware-Concurrency", "X-Max-Touch-Points", "X-Cookie-Enabled",
            "X-Online", "X-Session-Id", "X-Referrer", "X-URL", "X-Title", "X-User-Agent"
        ],
    };

    const io = socketIo(server, {
        cors: corsOptions,
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000
    });

    // Security and performance middleware
    app.use(helmet({
        contentSecurityPolicy: false // Disable CSP for API
    }));
    app.use(compression({
        level: 6,
        threshold: 1000
    }));
    app.use(cors(corsOptions));

    // Rate limiting - more aggressive for tracking endpoint
    const trackingLimiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 100, // Max 100 tracking requests per minute per IP
        message: { success: false, message: 'Too many tracking requests' },
        standardHeaders: true,
        legacyHeaders: false,
    });

    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute  
        max: 100, // Max 100 API requests per minute per IP
        message: { success: false, message: 'Too many API requests' },
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Body parsing with size limits
    app.use(express.json({ 
        limit: '1mb',
        verify: (req, res, buf) => {
            req.rawBody = buf;
        }
    }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Enhanced MongoDB connection with connection pooling
    const connectDB = async () => {
        try {
            await mongoose.connect(process.env.MONGO_URI);
            console.log('MongoDB connected');
        } catch (error) {
            console.error('MongoDB connection error:', error);
            process.exit(1);
        }
    };

    connectDB();

    // Optimized schemas with proper indexing
    const visitSchema = new mongoose.Schema({
        ip: { type: String, required: true, index: true },
        website: { type: String, required: true, index: true },
        userAgent: String,
        referer: String,
        country: { type: String, index: true },
        region: String,
        city: String,
        district: String,
        zip: String,
        timezone: String,
        isp: String,
        lat: Number,
        lon: Number,
        accuracy: { type: String, enum: ['high', 'medium', 'low', 'none'], default: 'none' },
        
        // VPN and Proxy Detection
        isVpn: { type: Boolean, default: false, index: true },
        isProxy: { type: Boolean, default: false },
        isTor: { type: Boolean, default: false },
        vpnProvider: String,
        proxyType: String,
        
        // Device fingerprinting
        computerId: { type: String, index: true },
        deviceFingerprint: String,
        screenResolution: String,
        colorDepth: Number,
        platform: String,
        language: String,
        hardwareConcurrency: Number,
        maxTouchPoints: Number,
        cookieEnabled: Boolean,
        doNotTrack: { type: Boolean, default: false },
        
        // Session tracking
        sessionId: { type: String, required: true, index: true },
        visitType: { type: String, enum: ['external', 'direct', 'internal'], default: 'direct' },
        isFirstVisit: { type: Boolean, default: true },
        
        timestamp: { type: Date, default: Date.now, index: true }
    });

    // Compound indexes for better query performance
    visitSchema.index({ timestamp: -1, website: 1 });
    visitSchema.index({ ip: 1, website: 1, timestamp: -1 });
    visitSchema.index({ sessionId: 1, timestamp: -1 });

    const sessionSchema = new mongoose.Schema({
        sessionId: { type: String, required: true, unique: true },
        ip: { type: String, required: true, index: true },
        website: { type: String, required: true },
        computerId: String,
        deviceFingerprint: String,
        firstVisit: { type: Date, default: Date.now },
        lastActivity: { type: Date, default: Date.now, index: true },
        visitCount: { type: Number, default: 1 },
        referer: String,
        userAgent: String,
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 30 * 60 * 1000),
            index: { expireAfterSeconds: 0 }
        }
    });

    const Visit = mongoose.model('Visit', visitSchema);
    const Session = mongoose.model('Session', sessionSchema);

    // ============================================================================
    // OPTIMIZED HELPER FUNCTIONS
    // ============================================================================

    function getRealIP(req) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
        return req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               '127.0.0.1';
    }

    function generateSessionId(ip, computerId, deviceFingerprint) {
        const crypto = require('crypto');
        const data = `${ip}-${computerId || 'unknown'}-${deviceFingerprint || 'unknown'}-${Date.now()}`;
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
    }

    function getVisitType(referer, website) {
        if (!referer) return 'direct';
        
        try {
            const refererUrl = new URL(referer);
            const websiteUrl = new URL(website.startsWith('http') ? website : `https://${website}`);
            
            return refererUrl.hostname === websiteUrl.hostname ? 'internal' : 'external';
        } catch (error) {
            return 'direct';
        }
    }

    function isExternalTraffic(referer) {
        if (!referer) return false;
        
        try {
            const hostname = new URL(referer).hostname.toLowerCase();
            const searchEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex'];
            const socialMedia = ['facebook', 'twitter', 'linkedin', 'instagram', 'youtube', 'tiktok', 'pinterest', 'reddit'];
            
            return [...searchEngines, ...socialMedia].some(site => hostname.includes(site));
        } catch (error) {
            return false;
        }
    }

    // Optimized session management with caching
    async function getOrCreateSession(ip, website, computerId, deviceFingerprint, referer, userAgent) {
        const cacheKey = `session_${ip}_${website}_${computerId}`;
        let session = sessionCache.get(cacheKey);
        
        if (session && new Date(session.expiresAt) > new Date()) {
            session.lastActivity = new Date();
            session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
            sessionCache.set(cacheKey, session, 1800);
            
            // Update in database asynchronously
            Session.updateOne(
                { sessionId: session.sessionId },
                { lastActivity: session.lastActivity, expiresAt: session.expiresAt }
            ).catch(err => console.error('Error updating session:', err));
            
            return { session, isNewSession: false };
        }

        try {
            session = await Session.findOne({
                ip, website, computerId, deviceFingerprint,
                expiresAt: { $gt: new Date() }
            });

            if (session) {
                session.lastActivity = new Date();
                session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
                await session.save();
                sessionCache.set(cacheKey, session, 1800);
                return { session, isNewSession: false };
            }

            const sessionId = generateSessionId(ip, computerId, deviceFingerprint);
            session = new Session({
                sessionId, ip, website, computerId, deviceFingerprint,
                referer, userAgent, visitCount: 0,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            });
            
            await session.save();
            sessionCache.set(cacheKey, session, 1800);
            return { session, isNewSession: true };
            
        } catch (error) {
            console.error('Error managing session:', error);
            const fallbackSessionId = generateSessionId(ip, computerId, deviceFingerprint);
            return {
                session: { sessionId: fallbackSessionId, visitCount: 0, firstVisit: new Date() },
                isNewSession: true
            };
        }
    }

    // Optimized VPN detection with caching and parallel requests
    async function detectVpnProxy(ip) {
        const cacheKey = `vpn_${ip}`;
        const cached = vpnCache.get(cacheKey);
        if (cached) return cached;

        const services = [
            // IPHub service
            async () => {
                try {
                    const controller = new AbortController();
                    setTimeout(() => controller.abort(), 3000);
                    
                    const response = await axios.get(`https://v2.api.iphub.info/guest/ip/${ip}`, {
                        signal: controller.signal,
                        headers: { 'User-Agent': 'IP-Tracker/2.0' }
                    });
                    
                    if (response.data?.block !== undefined) {
                        return {
                            isVpn: response.data.block === 1,
                            isProxy: response.data.block === 1,
                            vpnProvider: response.data.block === 1 ? 'IPHub Detection' : null
                        };
                    }
                } catch (error) {
                    // Timeout or other error
                }
                return null;
            },

            // ISP-based heuristic detection
            async () => {
                try {
                    const controller = new AbortController();
                    setTimeout(() => controller.abort(), 2000);
                    
                    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=isp,org`, {
                        signal: controller.signal
                    });
                    
                    if (response.data?.status === 'success') {
                        const isp = (response.data.isp || '').toLowerCase();
                        const org = (response.data.org || '').toLowerCase();
                        
                        const vpnKeywords = [
                            'vpn', 'proxy', 'tor', 'nord', 'express', 'surfshark', 'cyberghost',
                            'private internet access', 'pia', 'mullvad', 'windscribe', 'proton'
                        ];
                        
                        const isVpn = vpnKeywords.some(keyword => 
                            isp.includes(keyword) || org.includes(keyword)
                        );
                        
                        return {
                            isVpn,
                            isProxy: isVpn,
                            vpnProvider: isVpn ? 'ISP Analysis' : null
                        };
                    }
                } catch (error) {
                    // Timeout or other error
                }
                return null;
            }
        ];

        try {
            // Race between services, take first successful result
            const result = await Promise.race(
                services.map(service => service().catch(() => null))
            );
            
            const finalResult = result || {
                isVpn: false, isProxy: false, isTor: false,
                vpnProvider: null, proxyType: null
            };
            
            vpnCache.set(cacheKey, finalResult, 1800); // Cache for 30 minutes
            return finalResult;
            
        } catch (error) {
            const defaultResult = {
                isVpn: false, isProxy: false, isTor: false,
                vpnProvider: null, proxyType: null
            };
            vpnCache.set(cacheKey, defaultResult, 300); // Cache failed result for 5 minutes
            return defaultResult;
        }
    }

    // Optimized location detection with caching
    async function getLocationData(ip) {
        const cacheKey = `location_${ip}`;
        const cached = locationCache.get(cacheKey);
        if (cached) return cached;

        const services = [
            async () => {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 3000);
                
                const response = await axios.get(
                    `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,timezone,isp,lat,lon,zip,district`,
                    { signal: controller.signal }
                );
                
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
                throw new Error('IP-API failed');
            },

            async () => {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 3000);
                
                const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'IP-Tracker/2.0' }
                });
                
                if (response.data?.latitude && response.data?.longitude) {
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
                throw new Error('IPAPI.CO failed');
            }
        ];

        try {
            const result = await Promise.race(
                services.map(service => service().catch(err => {
                    console.log('Location service failed:', err.message);
                    return null;
                }))
            );

            const finalResult = result || {
                country: 'Unknown', region: 'Unknown', city: 'Unknown',
                district: 'Unknown', zip: 'Unknown', timezone: 'Unknown',
                isp: 'Unknown', lat: 0, lon: 0, accuracy: 'none'
            };

            locationCache.set(cacheKey, finalResult, 300); // Cache for 5 minutes
            return finalResult;

        } catch (error) {
            console.error('All location services failed:', error);
            const defaultResult = {
                country: 'Unknown', region: 'Unknown', city: 'Unknown',
                district: 'Unknown', zip: 'Unknown', timezone: 'Unknown',
                isp: 'Unknown', lat: 0, lon: 0, accuracy: 'none'
            };
            locationCache.set(cacheKey, defaultResult, 60); // Cache for 1 minute
            return defaultResult;
        }
    }

    // ============================================================================
    // OPTIMIZED API ROUTES
    // ============================================================================

    // Enhanced tracking endpoint with better error handling
    app.post('/api/track', trackingLimiter, async (req, res) => {
        try {
            if (!req.body?.website) {
                return res.status(400).json({
                    success: false,
                    message: 'Website parameter is required'
                });
            }

            const ip = getRealIP(req);
            const {
                website, userAgent, referer, computerId, deviceFingerprint,
                screenResolution, colorDepth, platform, language, timezone,
                hardwareConcurrency, maxTouchPoints, cookieEnabled, doNotTrack
            } = req.body;

            // Get session info
            const { session, isNewSession } = await getOrCreateSession(
                ip, website, computerId, deviceFingerprint, referer, userAgent
            );

            const finalVisitType = getVisitType(referer, website);

            // Enhanced tracking logic
            let shouldTrack = false;
            let skipReason = '';

            if (finalVisitType === 'internal') {
                shouldTrack = false;
                skipReason = 'Internal navigation';
            } else {
                const recentVisit = await Visit.findOne({
                    sessionId: session.sessionId,
                    website: website,
                    timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
                }).lean(); // Use lean() for better performance

                if (recentVisit) {
                    shouldTrack = false;
                    skipReason = 'Recent visit exists';
                } else if (isNewSession) {
                    shouldTrack = true;
                    skipReason = 'New session';
                } else if (finalVisitType === 'external' && isExternalTraffic(referer)) {
                    shouldTrack = true;
                    skipReason = 'External traffic source';
                } else {
                    const lastVisit = await Visit.findOne({
                        sessionId: session.sessionId,
                        website: website
                    }).sort({ timestamp: -1 }).lean();

                    const timeSinceLastVisit = lastVisit ? 
                        Date.now() - lastVisit.timestamp.getTime() : Infinity;

                    if (timeSinceLastVisit >= 5 * 60 * 1000) {
                        shouldTrack = true;
                        skipReason = 'Sufficient time passed';
                    } else {
                        shouldTrack = false;
                        skipReason = 'Too soon since last visit';
                    }
                }
            }

            if (!shouldTrack) {
                return res.status(200).json({
                    success: true,
                    message: skipReason,
                    sessionId: session.sessionId,
                    tracked: false
                });
            }

            // Parallel execution of location and VPN detection
            const [locationData, vpnData] = await Promise.all([
                getLocationData(ip),
                detectVpnProxy(ip)
            ]);

            // Create visit record
            const visitData = {
                ip, website, userAgent, referer, computerId, deviceFingerprint,
                screenResolution, colorDepth, platform, language, timezone,
                hardwareConcurrency, maxTouchPoints, cookieEnabled,
                doNotTrack: ['true', '1', true].includes(doNotTrack),
                sessionId: session.sessionId,
                visitType: finalVisitType,
                isFirstVisit: isNewSession,
                ...locationData,
                ...vpnData
            };

            // Save visit and update session in parallel
            const [visit] = await Promise.all([
                new Visit(visitData).save(),
                Session.updateOne(
                    { sessionId: session.sessionId },
                    { 
                        $inc: { visitCount: 1 },
                        $set: { lastActivity: new Date() }
                    }
                )
            ]);

            // Emit to dashboard (non-blocking)
            process.nextTick(() => {
                io.emit('newVisit', {
                    ip, website,
                    country: locationData.country,
                    city: locationData.city,
                    lat: locationData.lat,
                    lon: locationData.lon,
                    isVpn: vpnData.isVpn,
                    sessionId: session.sessionId,
                    visitType: finalVisitType,
                    timestamp: new Date()
                });
            });

            res.status(200).json({
                success: true,
                message: 'Visit tracked',
                sessionId: session.sessionId,
                tracked: true
            });

        } catch (error) {
            console.error('Tracking error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Chunked dashboard data endpoint
    app.get('/api/dashboard', apiLimiter, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per page
            const skip = (page - 1) * limit;
            const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // Parallel queries with pagination
            const [recentVisits, websiteStats, ipStats, totalCount] = await Promise.all([
                Visit.find({ timestamp: { $gte: last24Hours } })
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .skip(skip)
                    .lean(),
                
                Visit.aggregate([
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
                    },
                    { $limit: 20 } // Limit to top 20 websites
                ]),

                Visit.aggregate([
                    { $match: { timestamp: { $gte: last24Hours } } },
                    {
                        $group: {
                            _id: '$ip',
                            totalVisits: { $sum: 1 },
                            websites: { $addToSet: '$website' },
                            country: { $first: '$country' },
                            city: { $first: '$city' },
                            isVpn: { $first: '$isVpn' },
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
                            isVpn: 1,
                            lastVisit: 1
                        }
                    },
                    { $sort: { totalVisits: -1 } },
                    { $limit: 50 } // Limit to top 50 IPs
                ]),

                Visit.countDocuments({ timestamp: { $gte: last24Hours } })
            ]);

            res.json({
                success: true,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                },
                data: {
                    recentVisits,
                    websiteStats,
                    ipStats,
                    totalVisits24h: totalCount
                }
            });

        } catch (error) {
            console.error('Dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching dashboard data'
            });
        }
    });

    // Chunked comprehensive IP analytics
    app.get('/api/ip-comprehensive', apiLimiter, async (req, res) => {
        try {
            const timeframe = req.query.timeframe || '24h';
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 25, 50);
            const skip = (page - 1) * limit;

            let timeRange;
            switch (timeframe) {
                case '1h': timeRange = new Date(Date.now() - 60 * 60 * 1000); break;
                case '6h': timeRange = new Date(Date.now() - 6 * 60 * 60 * 1000); break;
                case '24h': timeRange = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
                case '7d': timeRange = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
                default: timeRange = new Date(Date.now() - 24 * 60 * 60 * 1000);
            }

            // Run summary and detailed queries in parallel
            const [ipAnalytics, summary] = await Promise.all([
                Visit.aggregate([
                    { $match: { timestamp: { $gte: timeRange } } },
                    {
                        $group: {
                            _id: '$ip',
                            totalVisits: { $sum: 1 },
                            uniqueWebsites: { $addToSet: '$website' },
                            country: { $first: '$country' },
                            city: { $first: '$city' },
                            isp: { $first: '$isp' },
                            lat: { $first: '$lat' },
                            lon: { $first: '$lon' },
                            isVpn: { $first: '$isVpn' },
                            isProxy: { $first: '$isProxy' },
                            isTor: { $first: '$isTor' },
                            firstVisit: { $min: '$timestamp' },
                            lastVisit: { $max: '$timestamp' }
                        }
                    },
                    {
                        $project: {
                            ip: '$_id',
                            totalVisits: 1,
                            websiteCount: { $size: '$uniqueWebsites' },
                            location: {
                                country: '$country',
                                city: '$city',
                                coordinates: { lat: '$lat', lon: '$lon' }
                            },
                            isp: 1,
                            security: {
                                isVpn: '$isVpn',
                                isProxy: '$isProxy',
                                isTor: '$isTor',
                                riskLevel: {
                                    $switch: {
                                        branches: [
                                            { case: '$isTor', then: 'HIGH' },
                                            { case: { $or: ['$isVpn', '$isProxy'] }, then: 'MEDIUM' }
                                        ],
                                        default: 'LOW'
                                    }
                                }
                            },
                            fraudScore: {
                                $add: [
                                    { $cond: ['$isTor', 50, 0] },
                                    { $cond: ['$isVpn', 25, 0] },
                                    { $cond: ['$isProxy', 20, 0] },
                                    { $cond: [{ $gt: ['$totalVisits', 10] }, 15, 0] },
                                    { $cond: [{ $gt: [{ $size: '$uniqueWebsites' }, 3] }, 10, 0] }
                                ]
                            }
                        }
                    },
                    { $sort: { fraudScore: -1, totalVisits: -1 } },
                    { $skip: skip },
                    { $limit: limit }
                ]),

                Visit.aggregate([
                    { $match: { timestamp: { $gte: timeRange } } },
                    {
                        $group: {
                            _id: null,
                            totalVisits: { $sum: 1 },
                            uniqueIPs: { $addToSet: '$ip' },
                            uniqueWebsites: { $addToSet: '$website' },
                            vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                            proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                            torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                            countries: { $addToSet: '$country' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            totalVisits: 1,
                            uniqueIPs: { $size: '$uniqueIPs' },
                            uniqueWebsites: { $size: '$uniqueWebsites' },
                            uniqueCountries: { $size: '$countries' },
                            vpnVisits: 1,
                            proxyVisits: 1,
                            torVisits: 1,
                            securityThreatPercentage: {
                                $multiply: [
                                    { $divide: [{ $add: ['$vpnVisits', '$proxyVisits', '$torVisits'] }, '$totalVisits'] },
                                    100
                                ]
                            }
                        }
                    }
                ])
            ]);

            const totalItems = await Visit.aggregate([
                { $match: { timestamp: { $gte: timeRange } } },
                { $group: { _id: '$ip' } },
                { $count: 'total' }
            ]);

            const totalCount = totalItems[0]?.total || 0;

            res.json({
                success: true,
                timeframe,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                },
                summary: summary[0] || {
                    totalVisits: 0, uniqueIPs: 0, uniqueWebsites: 0,
                    uniqueCountries: 0, vpnVisits: 0, proxyVisits: 0,
                    torVisits: 0, securityThreatPercentage: 0
                },
                ipAnalytics
            });

        } catch (error) {
            console.error('IP analytics error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching IP analytics'
            });
        }
    });

    // Chunked fraud alerts endpoint
    app.get('/api/fraud-alerts', apiLimiter, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 20, 50);
            const skip = (page - 1) * limit;
            const minFraudScore = parseInt(req.query.minScore) || 50;
            const timeRange = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const fraudAlerts = await Visit.aggregate([
                { $match: { timestamp: { $gte: timeRange } } },
                {
                    $group: {
                        _id: '$ip',
                        visits: { $sum: 1 },
                        websites: { $addToSet: '$website' },
                        isVpn: { $first: '$isVpn' },
                        isProxy: { $first: '$isProxy' },
                        isTor: { $first: '$isTor' },
                        country: { $first: '$country' },
                        city: { $first: '$city' },
                        isp: { $first: '$isp' },
                        userAgents: { $addToSet: '$userAgent' },
                        firstSeen: { $min: '$timestamp' },
                        lastSeen: { $max: '$timestamp' }
                    }
                },
                {
                    $project: {
                        ip: '$_id',
                        visits: 1,
                        websiteCount: { $size: '$websites' },
                        websites: 1,
                        location: { country: '$country', city: '$city' },
                        isp: 1,
                        security: {
                            isVpn: '$isVpn',
                            isProxy: '$isProxy',
                            isTor: '$isTor'
                        },
                        suspicious: {
                            multipleUserAgents: { $gt: [{ $size: '$userAgents' }, 2] }
                        },
                        fraudScore: {
                            $add: [
                                { $cond: ['$isTor', 50, 0] },
                                { $cond: ['$isVpn', 25, 0] },
                                { $cond: ['$isProxy', 20, 0] },
                                { $cond: [{ $gt: ['$visits', 20] }, 30, 0] },
                                { $cond: [{ $gt: [{ $size: '$websites' }, 5] }, 25, 0] },
                                { $cond: [{ $gt: [{ $size: '$userAgents' }, 2] }, 10, 0] }
                            ]
                        },
                        activityPattern: {
                            firstSeen: '$firstSeen',
                            lastSeen: '$lastSeen'
                        }
                    }
                },
                {
                    $match: {
                        $or: [
                            { fraudScore: { $gte: minFraudScore } },
                            { visits: { $gte: 15 } },
                            { websiteCount: { $gte: 4 } },
                            { 'security.isTor': true }
                        ]
                    }
                },
                { $sort: { fraudScore: -1, visits: -1 } },
                { $skip: skip },
                { $limit: limit }
            ]);

            res.json({
                success: true,
                pagination: {
                    currentPage: page,
                    itemsPerPage: limit
                },
                fraudAlerts,
                alertCount: fraudAlerts.length
            });

        } catch (error) {
            console.error('Fraud alerts error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching fraud alerts'
            });
        }
    });

    // Optimized website-specific endpoint
    app.get('/api/website/:domain', apiLimiter, async (req, res) => {
        try {
            const { domain } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const skip = (page - 1) * limit;
            const timeRange = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const [visits, totalCount, summary] = await Promise.all([
                Visit.find({ website: domain, timestamp: { $gte: timeRange } })
                    .sort({ timestamp: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                
                Visit.countDocuments({ website: domain, timestamp: { $gte: timeRange } }),
                
                Visit.aggregate([
                    { $match: { website: domain, timestamp: { $gte: timeRange } } },
                    {
                        $group: {
                            _id: null,
                            totalVisits: { $sum: 1 },
                            uniqueIPs: { $addToSet: '$ip' },
                            vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                            countries: { $addToSet: '$country' }
                        }
                    }
                ])
            ]);

            res.json({
                success: true,
                domain,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                },
                summary: summary[0] || { totalVisits: 0, uniqueIPs: 0, vpnVisits: 0, countries: 0 },
                visits
            });

        } catch (error) {
            console.error('Website data error:', error);
            res.status(500).json({
                success: false,
                message: 'Error fetching website data'
            });
        }
    });

    // Lightweight IP tracking endpoint
    app.get('/api/track-ip', apiLimiter, async (req, res) => {
        try {
            const { ip } = req.query;
            
            if (!ip || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid IP address required'
                });
            }

            const locationData = await getLocationData(ip);
            
            if (locationData.accuracy === 'none') {
                return res.status(404).json({
                    success: false,
                    message: 'Could not locate IP address'
                });
            }

            res.json({
                success: true,
                ip,
                ...locationData,
                timestamp: new Date()
            });

        } catch (error) {
            console.error('IP tracking error:', error);
            res.status(500).json({
                success: false,
                message: 'Error tracking IP'
            });
        }
    });

    // Batch export endpoint with streaming
    app.get('/api/export-blocklist', apiLimiter, async (req, res) => {
        try {
            const timeRange = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const minVisits = parseInt(req.query.minVisits) || 10;
            const minFraudScore = parseInt(req.query.minFraudScore) || 50;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=high-risk-ips.csv');
            res.write('IP,Visits,Websites,FraudScore,Country,ISP,VPN,Proxy,Tor,Reason\n');

            const cursor = Visit.aggregate([
                { $match: { timestamp: { $gte: timeRange } } },
                {
                    $group: {
                        _id: '$ip',
                        visits: { $sum: 1 },
                        websites: { $addToSet: '$website' },
                        isVpn: { $first: '$isVpn' },
                        isProxy: { $first: '$isProxy' },
                        isTor: { $first: '$isTor' },
                        country: { $first: '$country' },
                        isp: { $first: '$isp' }
                    }
                },
                {
                    $project: {
                        ip: '$_id',
                        visits: 1,
                        websiteCount: { $size: '$websites' },
                        fraudScore: {
                            $add: [
                                { $cond: ['$isTor', 50, 0] },
                                { $cond: ['$isVpn', 25, 0] },
                                { $cond: ['$isProxy', 20, 0] },
                                { $cond: [{ $gt: ['$visits', 20] }, 30, 0] },
                                { $cond: [{ $gt: [{ $size: '$websites' }, 5] }, 25, 0] }
                            ]
                        },
                        country: 1, isp: 1, isVpn: 1, isProxy: 1, isTor: 1
                    }
                },
                {
                    $match: {
                        $or: [
                            { visits: { $gte: minVisits } },
                            { fraudScore: { $gte: minFraudScore } },
                            { isTor: true }
                        ]
                    }
                }
            ]).cursor({ batchSize: 100 });

            for await (const ip of cursor) {
                const reasons = [];
                if (ip.isTor) reasons.push('Tor');
                if (ip.isVpn) reasons.push('VPN');
                if (ip.isProxy) reasons.push('Proxy');
                if (ip.visits >= 20) reasons.push('High Traffic');
                if (ip.websiteCount >= 5) reasons.push('Multiple Sites');

                const line = `${ip.ip},${ip.visits},${ip.websiteCount},${ip.fraudScore},${ip.country || ''},${ip.isp || ''},${ip.isVpn},${ip.isProxy},${ip.isTor},"${reasons.join(', ')}"\n`;
                res.write(line);
            }

            res.end();

        } catch (error) {
            console.error('Export error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Error generating export'
                });
            }
        }
    });

    // Health check endpoint
    app.get('/api/health', (req, res) => {
        const healthCheck = {
            uptime: process.uptime(),
            message: 'OK',
            timestamp: new Date(),
            memory: process.memoryUsage(),
            cacheStats: {
                location: locationCache.getStats(),
                vpn: vpnCache.getStats(),
                session: sessionCache.getStats()
            }
        };
        
        res.json(healthCheck);
    });

    // Error handling middleware
    app.use((error, req, res, next) => {
        console.error('Unhandled error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    });

    // Socket.IO with better error handling and connection limits
    const activeConnections = new Set();
    const MAX_CONNECTIONS = 100;

    io.on('connection', (socket) => {
        if (activeConnections.size >= MAX_CONNECTIONS) {
            socket.disconnect();
            return;
        }

        activeConnections.add(socket.id);
        console.log(`Dashboard connected: ${socket.id} (${activeConnections.size} total)`);

        socket.on('disconnect', () => {
            activeConnections.delete(socket.id);
            console.log(`Dashboard disconnected: ${socket.id} (${activeConnections.size} total)`);
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            activeConnections.delete(socket.id);
        });
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully');
        server.close(() => {
            mongoose.connection.close();
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('SIGINT received, shutting down gracefully');
        server.close(() => {
            mongoose.connection.close();
            process.exit(0);
        });
    });

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`Worker ${process.pid} running on port ${PORT}`);
    });
}
