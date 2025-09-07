const express = require('express');
const router = express.Router();
const IPTrackingService = require('../services/ipTrackingService');
const Visit = require('../models/Visit');
const User = require('../models/User');
const logger = require('../utils/logger');
const { validateTrackingData } = require('../middleware/validation');

const ipTrackingService = new IPTrackingService();

// ============================================================================
// MAIN TRACKING ENDPOINT
// ============================================================================

router.post('/track', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Get real IP address
        const ip = ipTrackingService.getRealIP(req);
        
        // Parse user agent for browser/OS information
        const userAgentData = ipTrackingService.parseUserAgent(req.get('User-Agent') || '');
        
        // Extract tracking data
        const { 
            trackingCode, 
            website, 
            domain,
            page,
            referer,
            url,
            title,
            computerId,
            deviceFingerprint,
            sessionId,
            userAgent,
            userAgentHash,
            browser: clientBrowser,
            os: clientOS,
            // deviceInfo: clientDevice,
            screenResolution,
            colorDepth,
            pixelRatio,
            viewport,
            platform,
            language,
            languages,
            timezone,
            hardwareConcurrency,
            maxTouchPoints,
            cookieEnabled,
            doNotTrack,
            online,
            connectionType,
            effectiveType,
            downlink,
            rtt,
            mouseMovements,
            clicks,
            scrollDepth,
            timeOnPage,
            pageLoadTime,
            interactions,
            utmSource,
            utmMedium,
            utmCampaign,
            utmTerm,
            utmContent,
            customParams,
            type = 'page_visit'
        } = req.body;

        // Validate required fields
        if (!trackingCode || !website) {
            return res.status(400).json({
                success: false,
                message: 'Tracking code and website are required'
            });
        }

        // Check if tracking code is valid and get user
        const user = await User.findOne({ 'websites.trackingCode': trackingCode });
        if (!user) {
            logger.warn(`Invalid tracking code: ${trackingCode} from IP: ${ip}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking code'
            });
        }

        // Find the specific website
        const websiteData = user.websites.find(w => w.trackingCode === trackingCode);
        if (!websiteData || !websiteData.isActive) {
            logger.warn(`Inactive or invalid website for tracking code: ${trackingCode}`);
            return res.status(400).json({
                success: false,
                message: 'Website is not active'
            });
        }

        // Set scriptAddedAt timestamp if this is the first visit for this website
        if (!websiteData.scriptAddedAt) {
            websiteData.scriptAddedAt = new Date();
            await user.save();
            logger.info(`Script added timestamp set for website: ${website} at ${websiteData.scriptAddedAt}`);
        }

        // Check for recent visits from same IP to prevent duplicate tracking
        // More aggressive duplicate prevention for better accuracy
        let duplicateTimeout = 2 * 60 * 1000; // 2 minutes for page visits (reduced from 5 minutes)
        if (type === 'heartbeat') duplicateTimeout = 15 * 1000; // 15 seconds for heartbeats (reduced from 30 seconds)
        if (type === 'session_end') duplicateTimeout = 0; // No timeout for session end
        
        if (duplicateTimeout > 0) {
            // For page visits, check for ANY recent visit from same IP to prevent rapid page refreshes
            const recentVisit = await Visit.findOne({
                ip: ip,
                trackingCode: trackingCode,
                timestamp: { $gte: new Date(Date.now() - duplicateTimeout) }
            });

            if (recentVisit) {
                logger.info(`Skipping duplicate visit from IP: ${ip} for website: ${website} within ${duplicateTimeout/1000} seconds. Last visit: ${recentVisit.timestamp}`);
                return res.status(200).json({ 
                    success: true, 
                    message: `Visit already tracked recently`,
                    duplicate: true,
                    lastVisit: recentVisit.timestamp
                });
            }
        }

        // Check rate limiting
        if (ipTrackingService.isRateLimited(ip, 'tracking')) {
            logger.warn(`Rate limit exceeded for IP: ${ip}`);
            return res.status(429).json({
                success: false,
                message: 'Too many tracking requests from this IP'
            });
        }

        // Get location data and VPN detection
        const [locationData, vpnData] = await Promise.all([
            ipTrackingService.getLocationData(ip),
            ipTrackingService.detectVpnProxy(ip)
        ]);

        // Bot detection
        const botData = ipTrackingService.detectBot(userAgent, {
            mouseMovements,
            clicks,
            pageLoadTime,
            timeOnPage
        });

        // Generate device fingerprint if not provided
        const finalDeviceFingerprint = deviceFingerprint || 
            ipTrackingService.generateDeviceFingerprint({
                screenResolution,
                colorDepth,
                platform,
                language,
                timezone,
                hardwareConcurrency,
                maxTouchPoints,
                cookieEnabled,
                doNotTrack,
                online
            });

        // Create visit record
        const visitData = {
            trackingCode,
            website,
            domain: domain || website,
            ip,
            realIP: ip,
            ipVersion: ip.includes(':') ? 'IPv6' : 'IPv4',
            type: type,
            
            // Geolocation data
            ...locationData,
            
            // VPN and proxy detection
            ...vpnData,
            
            // Device and browser fingerprinting
            computerId: computerId || ipTrackingService.generateComputerId(),
            deviceFingerprint: finalDeviceFingerprint,
            sessionId: sessionId || `sess_${computerId || ip}_${Date.now()}`,
            userAgent,
            userAgentHash: userAgentHash || ipTrackingService.hashString(userAgent),
            
            // Browser capabilities (use parsed data if client data is not available)
            browser: clientBrowser || userAgentData.browser,
            os: clientOS || userAgentData.os,
            // deviceInfo: clientDevice || userAgentData.device,
            
            // Screen and display
            screenResolution,
            colorDepth,
            pixelRatio,
            viewport,
            
            // System information
            platform,
            language,
            languages,
            timezone,
            hardwareConcurrency,
            maxTouchPoints,
            cookieEnabled,
            doNotTrack,
            online,
            
            // Network and performance
            connectionType,
            effectiveType,
            downlink,
            rtt,
            
            // Page and session tracking
            page,
            referer,
            refererDomain: referer ? new URL(referer).hostname : '',
            url,
            title,
            pageLoadTime,
            
            // Behavioral tracking
            mouseMovements,
            clicks,
            scrollDepth,
            timeOnPage,
            interactions,
            
            // Bot detection
            ...botData,
            
            // Campaign and source tracking
            utmSource,
            utmMedium,
            utmCampaign,
            utmTerm,
            utmContent,
            
            // Custom tracking parameters
            customParams,
            
            // User identification
            userId: user._id,
            
            // Timestamps
            timestamp: new Date(),
            firstSeen: new Date(),
            lastSeen: new Date()
        };

        // Calculate fraud score
        const fraudData = ipTrackingService.calculateFraudScore(visitData);
        visitData.fraudScore = fraudData.fraudScore;
        visitData.riskFactors = fraudData.riskFactors;

        // Add suspicious activity if fraud score is high
        if (visitData.fraudScore > 50) {
            visitData.addSuspiciousActivity('high_fraud_score', 
                `Fraud score: ${visitData.fraudScore}`, 'high');
        }

        // Create and save visit
        const visit = new Visit(visitData);
        await visit.save();

        // Emit real-time visitor event
        const socketIO = req.app.get('io');
        if (socketIO) {
            const visitorData = {
                ip: visit.ip,
                website: visit.website,
                domain: visit.domain,
                page: visit.page,
                country: visit.country,
                city: visit.city,
                region: visit.region,
                isp: visit.isp,
                browser: visit.browser,
                os: visit.os,
                // deviceInfo: visit.deviceInfo,
                screenResolution: visit.screenResolution,
                userAgent: visit.userAgent,
                referer: visit.referer,
                timestamp: visit.timestamp,
                type: visit.type,
                fraudScore: visit.fraudScore,
                isVpn: visit.isVpn,
                isProxy: visit.isProxy,
                isTor: visit.isTor
            };

            // Emit to user's room for dashboard updates
            socketIO.to(`user_${user._id}`).emit('newVisitor', visitorData);
            
            // Emit to website-specific room
            socketIO.to(`website_${trackingCode}`).emit('websiteVisitor', visitorData);
            
            logger.info(`Real-time visitor event emitted for IP: ${visit.ip}, Website: ${visit.website}`);
        }

        // Update website statistics
        user.updateWebsiteActivity(website, 1);
        await user.save();

        // Emit real-time data to dashboard
        const io = req.app.get('io');
        if (socketIO) {
            const realTimeData = {
                trackingCode,
                website,
                ip,
                country: locationData.country,
                city: locationData.city,
                isp: locationData.isp,
                lat: locationData.lat,
                lon: locationData.lon,
                accuracy: locationData.accuracy,
                isVpn: vpnData.isVpn,
                isProxy: vpnData.isProxy,
                isTor: vpnData.isTor,
                isBot: botData.isBot,
                fraudScore: visitData.fraudScore,
                computerId: visitData.computerId,
                timestamp: new Date(),
                referer: referer,
                page: page,
                type: type
            };

            // Emit to user's room
            io.to(`user_${user._id}`).emit('newVisit', realTimeData);
            
            // Emit to website-specific room
            io.to(`website_${trackingCode}`).emit('websiteVisit', realTimeData);
            
            // Emit to admin room if suspicious
            if (visitData.fraudScore > 70) {
                io.to('admin').emit('securityAlert', {
                    ...realTimeData,
                    severity: 'high',
                    alertType: 'high_fraud_score'
                });
            }
        }

        // Log successful tracking
        const processingTime = Date.now() - startTime;
        logger.logIPTracking({
            ip,
            website,
            trackingCode,
            fraudScore: visitData.fraudScore,
            isVpn: vpnData.isVpn,
            isBot: botData.isBot,
            processingTime,
            type
        });

        // Send response
        res.status(200).json({
            success: true,
            message: 'Visit tracked successfully',
            data: {
                visitId: visit._id,
                fraudScore: visitData.fraudScore,
                isSuspicious: visitData.fraudScore > 50,
                processingTime
            }
        });

    } catch (error) {
        logger.error('Error tracking visit:', {
            error: error.message,
            stack: error.stack,
            ip: req.ip,
            body: req.body
        });

        res.status(500).json({
            success: false,
            message: 'Error tracking visit',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// IP INFORMATION ENDPOINT
// ============================================================================

router.get('/ip/:ip', async (req, res) => {
    try {
        const { ip } = req.params;
        
        if (!ip) {
            return res.status(400).json({
                success: false,
                message: 'IP address is required'
            });
        }

        // Validate IP format
        if (!ipTrackingService.isValidIP(ip)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid IP address format'
            });
        }

        // Get location data for the IP
        const locationData = await ipTrackingService.getLocationData(ip);
        const vpnData = await ipTrackingService.detectVpnProxy(ip);

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
            ...locationData,
            ...vpnData,
            timestamp: new Date()
        });

    } catch (error) {
        logger.error('Error tracking IP:', error);
        res.status(500).json({
            success: false,
            message: 'Error tracking IP location'
        });
    }
});

// ============================================================================
// BULK TRACKING ENDPOINT (for multiple events)
// ============================================================================

router.post('/bulk', async (req, res) => {
    try {
        const { events, trackingCode, website } = req.body;

        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Events array is required and must not be empty'
            });
        }

        if (!trackingCode || !website) {
            return res.status(400).json({
                success: false,
                message: 'Tracking code and website are required'
            });
        }

        // Validate user and website
        const user = await User.findOne({ 'websites.trackingCode': trackingCode });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking code'
            });
        }

        const websiteData = user.websites.find(w => w.trackingCode === trackingCode);
        if (!websiteData || !websiteData.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Website is not active'
            });
        }

        // Process each event
        const results = [];
        for (const event of events) {
            try {
                // Add common data to each event
                const eventData = {
                    ...event,
                    trackingCode,
                    website,
                    timestamp: new Date()
                };

                // Create visit record for each event
                const visit = new Visit(eventData);
                await visit.save();
                
                results.push({
                    eventId: event.id || 'unknown',
                    success: true,
                    visitId: visit._id
                });

            } catch (eventError) {
                results.push({
                    eventId: event.id || 'unknown',
                    success: false,
                    error: eventError.message
                });
            }
        }

        res.json({
            success: true,
            message: 'Bulk tracking completed',
            results,
            totalEvents: events.length,
            successfulEvents: results.filter(r => r.success).length
        });

    } catch (error) {
        logger.error('Error in bulk tracking:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing bulk tracking',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================

router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Tracking service is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

module.exports = router;
