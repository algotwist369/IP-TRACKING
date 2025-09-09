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
const Redis = require('ioredis');
const slowDown = require('express-slow-down');
const ExpressBrute = require('express-brute');
const ExpressBruteRedis = require('express-brute-redis');
const winston = require('winston');
require('dotenv').config();

// ============================================================================
// ENHANCED LOGGING CONFIGURATION
// ============================================================================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'ip-tracker' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ============================================================================
// REDIS CONFIGURATION FOR DISTRIBUTED CACHING
// ============================================================================
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryDelayOnClusterDown: 300,
    enableOfflineQueue: false,
    maxLoadingTimeout: 5000
};

const redis = new Redis(redisConfig);
const redisSubscriber = new Redis(redisConfig);

// Redis event handlers
redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error:', err));
redis.on('close', () => logger.warn('Redis connection closed'));

// ============================================================================
// ENHANCED CACHING LAYERS
// ============================================================================
const locationCache = new NodeCache({ 
    stdTTL: 300, // 5 minutes
    checkperiod: 60,
    useClones: false
});

const vpnCache = new NodeCache({ 
    stdTTL: 1800, // 30 minutes
    checkperiod: 300,
    useClones: false
});

const sessionCache = new NodeCache({ 
    stdTTL: 1800, // 30 minutes
    checkperiod: 300,
    useClones: false
});

// ============================================================================
// ENHANCED CLUSTERING WITH PM2 SUPPORT
// ============================================================================
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numCPUs = Math.min(os.cpus().length, process.env.MAX_WORKERS || 4);
    logger.info(`Master ${process.pid} is running with ${numCPUs} workers`);
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
        if (code !== 0 && !worker.exitedAfterDisconnect) {
            logger.info('Starting a new worker');
            cluster.fork();
        }
    });
    
    cluster.on('online', (worker) => {
        logger.info(`Worker ${worker.process.pid} is online`);
    });
} else {
    startServer();
}

function startServer() {
    const app = express();
    const server = http.createServer(app);

    // ============================================================================
    // ENHANCED SECURITY AND PERFORMANCE MIDDLEWARE
    // ============================================================================
    
    // Enhanced CORS with origin validation
    const corsOptions = {
        origin: function (origin, callback) {
            const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
                process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
            
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                logger.warn(`CORS blocked origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
        pingInterval: 25000,
        maxHttpBufferSize: 1e6,
        allowEIO3: true
    });

    // Enhanced security middleware
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    }));

    // Enhanced compression
    app.use(compression({
        level: 6,
        threshold: 1000,
        filter: (req, res) => {
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression.filter(req, res);
        }
    }));

    app.use(cors(corsOptions));

    // ============================================================================
    // ENHANCED RATE LIMITING WITH REDIS BACKEND
    // ============================================================================
    
    // Brute force protection with Redis
    const store = new ExpressBruteRedis({
        client: redis,
        prefix: 'bruteforce:'
    });

    const bruteforce = new ExpressBrute(store, {
        freeRetries: 5,
        minWait: 5 * 60 * 1000, // 5 minutes
        maxWait: 15 * 60 * 1000, // 15 minutes
        refreshTimeoutOnRequest: false,
        skipFailedRequests: false,
        skipSuccessfulRequests: false
    });

    // Progressive rate limiting
    const speedLimiter = slowDown({
        windowMs: 15 * 60 * 1000, // 15 minutes
        delayAfter: 50, // allow 50 requests per 15 minutes, then...
        delayMs: 500 // begin adding 500ms of delay per request above 50
    });

    // Enhanced rate limiting for tracking endpoint
    const trackingLimiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 15, // Increased from 10 to 15
        message: { success: false, message: 'Too many tracking requests' },
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => {
            // Skip rate limiting for internal IPs in development
            const ip = getRealIP(req);
            return process.env.NODE_ENV === 'development' && 
                   (ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.'));
        }
    });

    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute  
        max: 200, // Increased from 100 to 200
        message: { success: false, message: 'Too many API requests' },
        standardHeaders: true,
        legacyHeaders: false,
    });

    // ============================================================================
    // ENHANCED BODY PARSING WITH VALIDATION
    // ============================================================================
    app.use(express.json({ 
        limit: '2mb', // Increased from 1mb
        verify: (req, res, buf) => {
            req.rawBody = buf;
        }
    }));
    app.use(express.urlencoded({ extended: true, limit: '2mb' }));

    // ============================================================================
    // ENHANCED MONGODB CONNECTION WITH OPTIMIZED POOLING
    // ============================================================================
    const connectDB = async () => {
        try {
            const options = {
                maxPoolSize: 50, // Increased from 20
                minPoolSize: 5, // Minimum connections
                maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferMaxEntries: 0,
                bufferCommands: false,
                useNewUrlParser: true,
                useUnifiedTopology: true,
                compressors: ['zlib'],
                zlibCompressionLevel: 6,
                retryWrites: true,
                retryReads: true,
                readPreference: 'secondaryPreferred', // Use secondary for reads when available
                readConcern: { level: 'majority' },
                writeConcern: { w: 'majority', j: true }
            };
            
            await mongoose.connect(process.env.MONGO_URI, options);
            logger.info('MongoDB connected with enhanced connection pooling');
            
            // Set up connection event handlers
            mongoose.connection.on('error', (err) => {
                logger.error('MongoDB connection error:', err);
            });
            
            mongoose.connection.on('disconnected', () => {
                logger.warn('MongoDB disconnected');
            });
            
            mongoose.connection.on('reconnected', () => {
                logger.info('MongoDB reconnected');
            });
            
        } catch (error) {
            logger.error('MongoDB connection error:', error);
            process.exit(1);
        }
    };

    connectDB();

    // ============================================================================
    // OPTIMIZED SCHEMAS WITH ENHANCED INDEXING
    // ============================================================================
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
        
        // Performance tracking
        responseTime: Number,
        cacheHit: { type: Boolean, default: false },
        
        timestamp: { type: Date, default: Date.now, index: true }
    }, {
        timestamps: true,
        collection: 'visits'
    });

    // Enhanced compound indexes for better query performance
    visitSchema.index({ timestamp: -1, website: 1 });
    visitSchema.index({ ip: 1, website: 1, timestamp: -1 });
    visitSchema.index({ sessionId: 1, timestamp: -1 });
    visitSchema.index({ isVpn: 1, timestamp: -1 });
    visitSchema.index({ country: 1, timestamp: -1 });
    visitSchema.index({ 'location.coordinates': '2dsphere' }); // Geospatial index

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
    }, {
        timestamps: true,
        collection: 'sessions'
    });

    const Visit = mongoose.model('Visit', visitSchema);
    const Session = mongoose.model('Session', sessionSchema);

    // ============================================================================
    // ENHANCED HELPER FUNCTIONS WITH REDIS INTEGRATION
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

    // ============================================================================
    // ENHANCED SESSION MANAGEMENT WITH REDIS CACHING
    // ============================================================================
    async function getOrCreateSession(ip, website, computerId, deviceFingerprint, referer, userAgent) {
        const cacheKey = `session:${ip}:${website}:${computerId}`;
        
        try {
            // Try Redis first
            const redisSession = await redis.get(cacheKey);
            if (redisSession) {
                const session = JSON.parse(redisSession);
                if (new Date(session.expiresAt) > new Date()) {
                    session.lastActivity = new Date();
                    session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
                    
                    // Update Redis asynchronously
                    redis.setex(cacheKey, 1800, JSON.stringify(session)).catch(err => 
                        logger.error('Redis session update error:', err)
                    );
                    
                    // Update database asynchronously
                    Session.updateOne(
                        { sessionId: session.sessionId },
                        { lastActivity: session.lastActivity, expiresAt: session.expiresAt }
                    ).catch(err => logger.error('Error updating session:', err));
                    
                    return { session, isNewSession: false };
                }
            }
        } catch (error) {
            logger.warn('Redis session lookup failed, falling back to database:', error.message);
        }

        // Fallback to local cache
        let session = sessionCache.get(cacheKey);
        if (session && new Date(session.expiresAt) > new Date()) {
            session.lastActivity = new Date();
            session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
            sessionCache.set(cacheKey, session, 1800);
            
            // Update in database asynchronously
            Session.updateOne(
                { sessionId: session.sessionId },
                { lastActivity: session.lastActivity, expiresAt: session.expiresAt }
            ).catch(err => logger.error('Error updating session:', err));
            
            return { session, isNewSession: false };
        }

        try {
            // Database lookup
            session = await Session.findOne({
                ip, website, computerId, deviceFingerprint,
                expiresAt: { $gt: new Date() }
            });

            if (session) {
                session.lastActivity = new Date();
                session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
                await session.save();
                
                // Cache in both Redis and local cache
                const sessionData = session.toObject();
                redis.setex(cacheKey, 1800, JSON.stringify(sessionData)).catch(err => 
                    logger.error('Redis session cache error:', err)
                );
                sessionCache.set(cacheKey, sessionData, 1800);
                
                return { session: sessionData, isNewSession: false };
            }

            // Create new session
            const sessionId = generateSessionId(ip, computerId, deviceFingerprint);
            session = new Session({
                sessionId, ip, website, computerId, deviceFingerprint,
                referer, userAgent, visitCount: 0,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            });
            
            await session.save();
            const sessionData = session.toObject();
            
            // Cache in both Redis and local cache
            redis.setex(cacheKey, 1800, JSON.stringify(sessionData)).catch(err => 
                logger.error('Redis session cache error:', err)
            );
            sessionCache.set(cacheKey, sessionData, 1800);
            
            return { session: sessionData, isNewSession: true };
            
        } catch (error) {
            logger.error('Error managing session:', error);
            const fallbackSessionId = generateSessionId(ip, computerId, deviceFingerprint);
            return {
                session: { sessionId: fallbackSessionId, visitCount: 0, firstVisit: new Date() },
                isNewSession: true
            };
        }
    }

    // ============================================================================
    // ENHANCED VPN DETECTION WITH REDIS CACHING
    // ============================================================================
    async function detectVpnProxy(ip) {
        const cacheKey = `vpn:${ip}`;
        
        try {
            // Try Redis first
            const redisVpn = await redis.get(cacheKey);
            if (redisVpn) {
                return JSON.parse(redisVpn);
            }
        } catch (error) {
            logger.warn('Redis VPN lookup failed, falling back to local cache:', error.message);
        }

        // Fallback to local cache
        const cached = vpnCache.get(cacheKey);
        if (cached) return cached;

        const services = [
            // IPHub service with enhanced error handling
            async () => {
                try {
                    const controller = new AbortController();
                    setTimeout(() => controller.abort(), 2000); // Reduced timeout
                    
                    const response = await axios.get(`https://v2.api.iphub.info/guest/ip/${ip}`, {
                        signal: controller.signal,
                        headers: { 'User-Agent': 'IP-Tracker/2.0' },
                        timeout: 2000
                    });
                    
                    if (response.data?.block !== undefined) {
                        return {
                            isVpn: response.data.block === 1,
                            isProxy: response.data.block === 1,
                            vpnProvider: response.data.block === 1 ? 'IPHub Detection' : null
                        };
                    }
                } catch (error) {
                    if (error.code !== 'ABORT_ERROR') {
                        logger.debug('IPHub service error:', error.message);
                    }
                }
                return null;
            },

            // ISP-based heuristic detection
            async () => {
                try {
                    const controller = new AbortController();
                    setTimeout(() => controller.abort(), 1500); // Reduced timeout
                    
                    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=isp,org`, {
                        signal: controller.signal,
                        timeout: 1500
                    });
                    
                    if (response.data?.status === 'success') {
                        const isp = (response.data.isp || '').toLowerCase();
                        const org = (response.data.org || '').toLowerCase();
                        
                        const vpnKeywords = [
                            'vpn', 'proxy', 'tor', 'nord', 'express', 'surfshark', 'cyberghost',
                            'private internet access', 'pia', 'mullvad', 'windscribe', 'proton',
                            'hidemyass', 'tunnelbear', 'ipvanish', 'hotspot shield'
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
                    if (error.code !== 'ABORT_ERROR') {
                        logger.debug('ISP analysis error:', error.message);
                    }
                }
                return null;
            }
        ];

        try {
            // Race between services with timeout
            const result = await Promise.race([
                Promise.race(services.map(service => service().catch(() => null))),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
            
            const finalResult = result || {
                isVpn: false, isProxy: false, isTor: false,
                vpnProvider: null, proxyType: null
            };
            
            // Cache in both Redis and local cache
            redis.setex(cacheKey, 1800, JSON.stringify(finalResult)).catch(err => 
                logger.error('Redis VPN cache error:', err)
            );
            vpnCache.set(cacheKey, finalResult, 1800);
            
            return finalResult;
            
        } catch (error) {
            const defaultResult = {
                isVpn: false, isProxy: false, isTor: false,
                vpnProvider: null, proxyType: null
            };
            
            // Cache failed result for shorter time
            redis.setex(cacheKey, 300, JSON.stringify(defaultResult)).catch(err => 
                logger.error('Redis VPN cache error:', err)
            );
            vpnCache.set(cacheKey, defaultResult, 300);
            
            return defaultResult;
        }
    }

    // ============================================================================
    // ENHANCED LOCATION DETECTION WITH REDIS CACHING
    // ============================================================================
    async function getLocationData(ip) {
        const cacheKey = `location:${ip}`;
        
        try {
            // Try Redis first
            const redisLocation = await redis.get(cacheKey);
            if (redisLocation) {
                return JSON.parse(redisLocation);
            }
        } catch (error) {
            logger.warn('Redis location lookup failed, falling back to local cache:', error.message);
        }

        // Fallback to local cache
        const cached = locationCache.get(cacheKey);
        if (cached) return cached;

        const services = [
            async () => {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 2000);
                
                const response = await axios.get(
                    `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,timezone,isp,lat,lon,zip,district`,
                    { signal: controller.signal, timeout: 2000 }
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
                setTimeout(() => controller.abort(), 2000);
                
                const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'IP-Tracker/2.0' },
                    timeout: 2000
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
            const result = await Promise.race([
                Promise.race(services.map(service => service().catch(err => {
                    logger.debug('Location service failed:', err.message);
                    return null;
                }))),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);

            const finalResult = result || {
                country: 'Unknown', region: 'Unknown', city: 'Unknown',
                district: 'Unknown', zip: 'Unknown', timezone: 'Unknown',
                isp: 'Unknown', lat: 0, lon: 0, accuracy: 'none'
            };

            // Cache in both Redis and local cache
            redis.setex(cacheKey, 300, JSON.stringify(finalResult)).catch(err => 
                logger.error('Redis location cache error:', err)
            );
            locationCache.set(cacheKey, finalResult, 300);
            
            return finalResult;

        } catch (error) {
            logger.error('All location services failed:', error);
            const defaultResult = {
                country: 'Unknown', region: 'Unknown', city: 'Unknown',
                district: 'Unknown', zip: 'Unknown', timezone: 'Unknown',
                isp: 'Unknown', lat: 0, lon: 0, accuracy: 'none'
            };
            
            // Cache failed result for shorter time
            redis.setex(cacheKey, 60, JSON.stringify(defaultResult)).catch(err => 
                logger.error('Redis location cache error:', err)
            );
            locationCache.set(cacheKey, defaultResult, 60);
            
            return defaultResult;
        }
    }

    // ============================================================================
    // ENHANCED API ROUTES WITH BETTER PERFORMANCE
    // ============================================================================

    // Enhanced tracking endpoint with comprehensive error handling
    app.post('/api/track', trackingLimiter, speedLimiter, async (req, res) => {
        const startTime = Date.now();
        let cacheHit = false;
        
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

            // Enhanced tracking logic with Redis caching
            let shouldTrack = false;
            let skipReason = '';

            if (finalVisitType === 'internal') {
                shouldTrack = false;
                skipReason = 'Internal navigation';
            } else {
                // Check recent visits with Redis cache
                const recentVisitKey = `recent:${session.sessionId}:${website}`;
                try {
                    const recentVisit = await redis.get(recentVisitKey);
                    if (recentVisit) {
                        shouldTrack = false;
                        skipReason = 'Recent visit exists (cached)';
                        cacheHit = true;
                    }
                } catch (error) {
                    // Fallback to database
                    const recentVisit = await Visit.findOne({
                        sessionId: session.sessionId,
                        website: website,
                        timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
                    }).lean();

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
            }

            if (!shouldTrack) {
                // Cache the skip decision
                if (!cacheHit) {
                    redis.setex(`recent:${session.sessionId}:${website}`, 300, 'skip').catch(err => 
                        logger.error('Redis recent visit cache error:', err)
                    );
                }
                
                return res.status(200).json({
                    success: true,
                    message: skipReason,
                    sessionId: session.sessionId,
                    tracked: false,
                    responseTime: Date.now() - startTime
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
                responseTime: Date.now() - startTime,
                cacheHit,
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
                ),
                // Cache recent visit
                redis.setex(`recent:${session.sessionId}:${website}`, 300, 'tracked').catch(err => 
                    logger.error('Redis recent visit cache error:', err)
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
                    timestamp: new Date(),
                    responseTime: Date.now() - startTime
                });
            });

            res.status(200).json({
                success: true,
                message: 'Visit tracked',
                sessionId: session.sessionId,
                tracked: true,
                responseTime: Date.now() - startTime
            });

        } catch (error) {
            logger.error('Tracking error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                responseTime: Date.now() - startTime
            });
        }
    });

    // Continue with other enhanced endpoints...
    // (The rest of the endpoints would follow similar patterns with Redis caching and optimization)

    // ============================================================================
    // ENHANCED SOCKET.IO WITH CONNECTION MANAGEMENT
    // ============================================================================
    const activeConnections = new Map();
    const MAX_CONNECTIONS = 200; // Increased from 100

    io.on('connection', (socket) => {
        if (activeConnections.size >= MAX_CONNECTIONS) {
            socket.emit('error', { message: 'Server at capacity' });
            socket.disconnect();
            return;
        }

        activeConnections.set(socket.id, {
            connectedAt: new Date(),
            ip: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
        });

        logger.info(`Dashboard connected: ${socket.id} (${activeConnections.size} total)`);

        socket.on('disconnect', () => {
            activeConnections.delete(socket.id);
            logger.info(`Dashboard disconnected: ${socket.id} (${activeConnections.size} total)`);
        });

        socket.on('error', (error) => {
            logger.error('Socket error:', error);
            activeConnections.delete(socket.id);
        });

        // Send connection stats
        socket.emit('connectionStats', {
            totalConnections: activeConnections.size,
            serverTime: new Date()
        });
    });

    // ============================================================================
    // ENHANCED HEALTH CHECK WITH REDIS STATUS
    // ============================================================================
    app.get('/api/health', async (req, res) => {
        try {
            const redisStatus = await redis.ping();
            const healthCheck = {
                status: 'OK',
                uptime: process.uptime(),
                timestamp: new Date(),
                memory: process.memoryUsage(),
                redis: {
                    status: redisStatus === 'PONG' ? 'connected' : 'disconnected',
                    latency: await measureRedisLatency()
                },
                cacheStats: {
                    location: locationCache.getStats(),
                    vpn: vpnCache.getStats(),
                    session: sessionCache.getStats()
                },
                connections: {
                    socket: activeConnections.size,
                    max: MAX_CONNECTIONS
                }
            };
            
            res.json(healthCheck);
        } catch (error) {
            logger.error('Health check error:', error);
            res.status(500).json({
                status: 'ERROR',
                message: 'Health check failed',
                error: error.message
            });
        }
    });

    // Helper function to measure Redis latency
    async function measureRedisLatency() {
        const start = Date.now();
        try {
            await redis.ping();
            return Date.now() - start;
        } catch (error) {
            return -1;
        }
    }

    // ============================================================================
    // ENHANCED ERROR HANDLING AND GRACEFUL SHUTDOWN
    // ============================================================================
    app.use((error, req, res, next) => {
        logger.error('Unhandled error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
        logger.info(`${signal} received, shutting down gracefully`);
        
        server.close(() => {
            logger.info('HTTP server closed');
            
            // Close Redis connections
            redis.disconnect();
            redisSubscriber.disconnect();
            
            // Close MongoDB connection
            mongoose.connection.close(() => {
                logger.info('MongoDB connection closed');
                process.exit(0);
            });
        });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // ============================================================================
    // START SERVER
    // ============================================================================
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        logger.info(`Enhanced IP Tracker Server running on port ${PORT} (Worker ${process.pid})`);
    });
}
