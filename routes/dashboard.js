const express = require('express');
const router = express.Router();
const Visit = require('../models/Visit');
const User = require('../models/User');
const { authenticateToken, requireActiveSubscription } = require('../middleware/auth');
const { validatePagination } = require('../middleware/validation');
const logger = require('../utils/logger');

// ============================================================================
// GET OVERALL STATISTICS
// ============================================================================

router.get('/overview', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { period = '24h' } = req.query;

        // Calculate time range
        const timeRange = getTimeRange(period);
        
        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);
        
        // Find the earliest scriptAddedAt timestamp among all websites
        const scriptAddedAtTimestamps = user.websites
            .filter(w => w.scriptAddedAt)
            .map(w => w.scriptAddedAt);
        const earliestScriptAddedAt = scriptAddedAtTimestamps.length > 0 
            ? new Date(Math.min(...scriptAddedAtTimestamps))
            : null;
        
        // Get overall statistics
        const overallStats = await getOverallStats(userId, userWebsites, timeRange, earliestScriptAddedAt);
        
        // Get website-specific statistics
        const websiteStats = await getWebsiteStats(userId, userWebsites, timeRange, earliestScriptAddedAt);
        
        // Get IP analytics
        const ipAnalytics = await getIPAnalytics(userId, userWebsites, timeRange, earliestScriptAddedAt);
        
        // Get recent activity
        const recentActivity = await getRecentActivity(userId, userWebsites, timeRange, 100, earliestScriptAddedAt);
        
        // Get VPN/security statistics
        const vpnStats = await getSecurityStats(userId, userWebsites, timeRange, earliestScriptAddedAt);

        res.json({
            success: true,
            data: {
                overallStats: {
                    totalVisits24h: overallStats.totalVisits || 0,
                    uniqueVisitors24h: overallStats.uniqueVisitors || 0,
                    totalWebsites: websiteStats.length,
                    totalUniqueIPs: ipAnalytics.length,
                    averageVisitsPerWebsite: websiteStats.length > 0 ? Math.round(overallStats.totalVisits / websiteStats.length) : 0
                },
                websiteStats: websiteStats.map(stat => ({
                    website: stat.website,
                    totalVisits24h: stat.totalVisits,
                    uniqueVisitors24h: stat.uniqueVisitors,
                    totalUniqueIPs: stat.uniqueVisitors,
                    averageVisitsPerIP: stat.totalVisits > 0 ? (stat.totalVisits / stat.uniqueVisitors).toFixed(1) : 0,
                    topPages: [], // This would need to be calculated separately
                    lastActivity: stat.lastVisit
                })),
                ipAnalytics: ipAnalytics.map(ip => ({
                    ip: ip.ip,
                    city: ip.city || 'Unknown',
                    country: ip.country || 'Unknown',
                    isp: ip.isp || 'Unknown',
                    accuracy: 'high', // Default accuracy
                    lat: ip.lat,
                    lon: ip.lon,
                    websiteVisits: (ip.websites || []).map(website => ({
                        website: website,
                        visits: Math.floor(ip.totalVisits / (ip.websitesCount || 1)), // Approximate
                        pages: ['/'] // Default page
                    })),
                    totalVisits: ip.totalVisits,
                    lastSeen: ip.lastVisit
                })),
                recentActivity: recentActivity.map(activity => ({
                    ip: activity.ip,
                    website: activity.website,
                    city: activity.city || 'Unknown',
                    country: activity.country || 'Unknown',
                    timestamp: activity.timestamp,
                    page: '/', // Default page
                    visitNumber: 1 // This would need to be calculated
                })),
                vpnStats: {
                    stats: {
                        vpnVisits: vpnStats.vpnVisits || 0,
                        proxyVisits: vpnStats.proxyVisits || 0,
                        torVisits: vpnStats.torVisits || 0,
                        totalSuspicious: (vpnStats.vpnVisits || 0) + (vpnStats.proxyVisits || 0) + (vpnStats.torVisits || 0)
                    }
                },
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Dashboard overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching dashboard data',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET WEBSITE SPECIFIC STATISTICS
// ============================================================================

router.get('/website/:domain', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;
        const { period = '24h' } = req.query;

        // Verify website ownership
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const website = user.websites.find(w => w.domain === domain);
        if (!website) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this website'
            });
        }

        const timeRange = getTimeRange(period);

        // Get website-specific data
        const websiteData = await getWebsiteSpecificData(domain, timeRange);

        res.json({
            success: true,
            data: {
                website: {
                    domain: website.domain,
                    name: website.name,
                    trackingCode: website.trackingCode,
                    settings: website.settings,
                    createdAt: website.createdAt
                },
                statistics: websiteData,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Website statistics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching website statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET IP ANALYTICS
// ============================================================================

router.get('/ip-analytics', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { period = '24h', page = 1, limit = 50, sortBy = 'totalVisits', sortOrder = 'desc' } = req.query;

        // Validate pagination
        const { error, value } = validatePagination({ page, limit });
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters',
                errors: error.details
            });
        }

        const { page: pageNum, limit: limitNum } = value;
        const timeRange = getTimeRange(period);

        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);

        // Find the earliest scriptAddedAt timestamp among all websites
        const scriptAddedAtTimestamps = user.websites
            .filter(w => w.scriptAddedAt)
            .map(w => w.scriptAddedAt);
        const earliestScriptAddedAt = scriptAddedAtTimestamps.length > 0 
            ? new Date(Math.min(...scriptAddedAtTimestamps))
            : null;

        // Get IP analytics with pagination
        const ipAnalytics = await getIPAnalyticsPaginated(
            userId, 
            userWebsites, 
            timeRange, 
            pageNum, 
            limitNum, 
            sortBy, 
            sortOrder,
            earliestScriptAddedAt
        );

        res.json({
            success: true,
            data: {
                ipAnalytics: ipAnalytics.data,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(ipAnalytics.total / limitNum),
                    totalItems: ipAnalytics.total,
                    itemsPerPage: limitNum,
                    hasNextPage: pageNum < Math.ceil(ipAnalytics.total / limitNum),
                    hasPrevPage: pageNum > 1
                },
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('IP analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching IP analytics',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET RECENT ACTIVITY
// ============================================================================

router.get('/recent-activity', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { period = '24h', limit = 100 } = req.query;

        const timeRange = getTimeRange(period);

        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);

        // Find the earliest scriptAddedAt timestamp among all websites
        const scriptAddedAtTimestamps = user.websites
            .filter(w => w.scriptAddedAt)
            .map(w => w.scriptAddedAt);
        const earliestScriptAddedAt = scriptAddedAtTimestamps.length > 0 
            ? new Date(Math.min(...scriptAddedAtTimestamps))
            : null;

        // Get recent activity
        const recentActivity = await getRecentActivity(userId, userWebsites, timeRange, parseInt(limit), earliestScriptAddedAt);

        res.json({
            success: true,
            data: {
                recentActivity,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Recent activity error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent activity',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET VISITOR MAP DATA
// ============================================================================

router.get('/visitor-map', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { period = '24h' } = req.query;

        const timeRange = getTimeRange(period);

        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);

        // Get visitor map data
        const visitorMapData = await getVisitorMapData(userId, userWebsites, timeRange);

        res.json({
            success: true,
            data: {
                visitorMapData,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Visitor map error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching visitor map data',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET VPN AND SECURITY STATISTICS
// ============================================================================

router.get('/security-stats', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { period = '24h' } = req.query;

        const timeRange = getTimeRange(period);

        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);

        // Find the earliest scriptAddedAt timestamp among all websites
        const scriptAddedAtTimestamps = user.websites
            .filter(w => w.scriptAddedAt)
            .map(w => w.scriptAddedAt);
        const earliestScriptAddedAt = scriptAddedAtTimestamps.length > 0 
            ? new Date(Math.min(...scriptAddedAtTimestamps))
            : null;

        // Get security statistics
        const securityStats = await getSecurityStats(userId, userWebsites, timeRange, earliestScriptAddedAt);

        res.json({
            success: true,
            data: {
                vpnStats: {
                    stats: {
                        vpnVisits: securityStats.vpnVisits || 0,
                        proxyVisits: securityStats.proxyVisits || 0,
                        torVisits: securityStats.torVisits || 0,
                        totalSuspicious: (securityStats.vpnVisits || 0) + (securityStats.proxyVisits || 0) + (securityStats.torVisits || 0)
                    }
                },
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Security stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching security statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET VISITOR DETAILS BY IP
// ============================================================================

router.get('/visitor/:ip', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;
        const { ip } = req.params;
        const { period = '24h' } = req.query;

        if (!ip) {
            return res.status(400).json({
                success: false,
                message: 'IP address is required'
            });
        }

        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);
        const timeRange = getTimeRange(period);

        // Find the earliest scriptAddedAt timestamp among all websites
        const scriptAddedAtTimestamps = user.websites
            .filter(w => w.scriptAddedAt)
            .map(w => w.scriptAddedAt);
        const earliestScriptAddedAt = scriptAddedAtTimestamps.length > 0 
            ? new Date(Math.min(...scriptAddedAtTimestamps))
            : null;

        // Get visitor details
        logger.info(`Fetching visitor details for IP: ${ip}, websites: ${userWebsites.join(', ')}, period: ${period}, scriptAddedAt: ${earliestScriptAddedAt}`);
        const visitorDetails = await getVisitorDetails(ip, userWebsites, timeRange, earliestScriptAddedAt);

        logger.info(`Visitor details result:`, visitorDetails ? 'Found' : 'Not found');

        if (!visitorDetails) {
            return res.status(404).json({
                success: false,
                message: 'Visitor not found'
            });
        }

        res.json({
            success: true,
            data: {
                visitor: visitorDetails,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Visitor details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching visitor details',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET REAL-TIME DASHBOARD DATA
// ============================================================================

router.get('/realtime', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;

        // Get user's websites
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userWebsites = user.websites.map(w => w.domain);

        // Get real-time data (last 5 minutes)
        const timeRange = {
            start: new Date(Date.now() - 5 * 60 * 1000),
            end: new Date()
        };

        const realtimeData = await getRealtimeData(userId, userWebsites, timeRange);

        res.json({
            success: true,
            data: {
                realtimeData,
                timestamp: new Date()
            }
        });

    } catch (error) {
        logger.error('Real-time dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching real-time data',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTimeRange(period) {
    const now = new Date();
    let start;

    switch (period) {
        case '1h':
            start = new Date(now.getTime() - 60 * 60 * 1000);
            break;
        case '6h':
            start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
            break;
        case '24h':
            start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case '90d':
            start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        default:
            start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
}

async function getOverallStats(userId, websites, timeRange, scriptAddedAt) {
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;
    
    const stats = await Visit.aggregate([
        {
            $match: {
                website: { $in: websites },
                timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
            }
        },
        {
            $group: {
                _id: null,
                totalVisits: { $sum: 1 },
                uniqueVisitors: { $addToSet: '$ip' },
                uniqueDevices: { $addToSet: '$computerId' },
                countries: { $addToSet: '$country' },
                vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                suspiciousVisits: { $sum: { $cond: [{ $gte: ['$fraudScore', 70] }, 1, 0] } }
            }
        },
        {
            $project: {
                _id: 0,
                totalVisits: 1,
                uniqueVisitors: { $size: '$uniqueVisitors' },
                uniqueDevices: { $size: '$uniqueDevices' },
                countries: { $size: '$countries' },
                vpnVisits: 1,
                proxyVisits: 1,
                torVisits: 1,
                suspiciousVisits: 1,
                vpnPercentage: { $multiply: [{ $divide: ['$vpnVisits', '$totalVisits'] }, 100] },
                proxyPercentage: { $multiply: [{ $divide: ['$proxyVisits', '$totalVisits'] }, 100] },
                torPercentage: { $multiply: [{ $divide: ['$torVisits', '$totalVisits'] }, 100] },
                suspiciousPercentage: { $multiply: [{ $divide: ['$suspiciousVisits', '$totalVisits'] }, 100] }
            }
        }
    ]);

    return stats[0] || {
        totalVisits: 0,
        uniqueVisitors: 0,
        uniqueDevices: 0,
        countries: 0,
        vpnVisits: 0,
        proxyVisits: 0,
        torVisits: 0,
        suspiciousVisits: 0,
        vpnPercentage: 0,
        proxyPercentage: 0,
        torPercentage: 0,
        suspiciousPercentage: 0
    };
}

async function getWebsiteStats(userId, websites, timeRange, scriptAddedAt) {
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;
    
    return await Visit.aggregate([
        {
            $match: {
                website: { $in: websites },
                timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
            }
        },
        {
            $group: {
                _id: '$website',
                totalVisits: { $sum: 1 },
                uniqueVisitors: { $addToSet: '$ip' },
                countries: { $addToSet: '$country' },
                vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                suspiciousVisits: { $sum: { $cond: [{ $gte: ['$fraudScore', 70] }, 1, 0] } },
                lastVisit: { $max: '$timestamp' }
            }
        },
        {
            $project: {
                website: '$_id',
                totalVisits: 1,
                uniqueVisitors: { $size: '$uniqueVisitors' },
                countries: { $size: '$countries' },
                vpnVisits: 1,
                proxyVisits: 1,
                torVisits: 1,
                suspiciousVisits: 1,
                lastVisit: 1
            }
        },
        { $sort: { totalVisits: -1 } }
    ]);
}

async function getIPAnalytics(userId, websites, timeRange, scriptAddedAt) {
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;
    
    return await Visit.aggregate([
        {
            $match: {
                website: { $in: websites },
                timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
            }
        },
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
                isVpn: { $first: '$isVpn' },
                isProxy: { $first: '$isProxy' },
                isTor: { $first: '$isTor' },
                vpnProvider: { $first: '$vpnProvider' },
                computerId: { $first: '$computerId' },
                fraudScore: { $avg: '$fraudScore' },
                lastVisit: { $max: '$timestamp' }
            }
        },
        {
            $project: {
                ip: '$_id',
                totalVisits: 1,
                websites: 1,
                websitesCount: { $size: '$websites' },
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
                fraudScore: { $round: ['$fraudScore', 2] },
                lastVisit: 1
            }
        },
        { $sort: { totalVisits: -1 } },
        { $limit: 100 }
    ]);
}

async function getIPAnalyticsPaginated(userId, websites, timeRange, page, limit, sortBy, sortOrder, scriptAddedAt) {
    const skip = (page - 1) * limit;
    const sortOrderNum = sortOrder === 'desc' ? -1 : 1;
    
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;

    const [data, total] = await Promise.all([
        Visit.aggregate([
            {
                $match: {
                    website: { $in: websites },
                    timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
                }
            },
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
                    isVpn: { $first: '$isVpn' },
                    isProxy: { $first: '$isProxy' },
                    isTor: { $first: '$isTor' },
                    vpnProvider: { $first: '$vpnProvider' },
                    computerId: { $first: '$computerId' },
                    fraudScore: { $avg: '$fraudScore' },
                    lastVisit: { $max: '$timestamp' }
                }
            },
            {
                $project: {
                    ip: '$_id',
                    totalVisits: 1,
                    websites: 1,
                    websitesCount: { $size: '$websites' },
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
                    fraudScore: { $round: ['$fraudScore', 2] },
                    lastVisit: 1
                }
            },
            { $sort: { [sortBy]: sortOrderNum } },
            { $skip: skip },
            { $limit: limit }
        ]),
        Visit.aggregate([
            {
                $match: {
                    website: { $in: websites },
                    timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: '$ip'
                }
            },
            {
                $count: 'total'
            }
        ])
    ]);

    return {
        data,
        total: total[0]?.total || 0
    };
}

async function getRecentActivity(userId, websites, timeRange, limit = 100, scriptAddedAt) {
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;
    
    return await Visit.find({
        website: { $in: websites },
        timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
    })
    .select('ip website country city isp isVpn isProxy isTor vpnProvider computerId fraudScore timestamp userAgent referer')
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
}

async function getWebsiteSpecificData(domain, timeRange) {
    const [visits, stats] = await Promise.all([
        Visit.find({
            website: domain,
            timestamp: { $gte: timeRange.start, $lte: timeRange.end }
        })
        .select('ip country city isp isVpn isProxy isTor vpnProvider computerId fraudScore timestamp userAgent referer')
        .sort({ timestamp: -1 })
        .limit(100)
        .lean(),
        Visit.aggregate([
            {
                $match: {
                    website: domain,
                    timestamp: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: null,
                    totalVisits: { $sum: 1 },
                    uniqueVisitors: { $addToSet: '$ip' },
                    countries: { $addToSet: '$country' },
                    vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                    proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                    torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                    suspiciousVisits: { $sum: { $cond: [{ $gte: ['$fraudScore', 70] }, 1, 0] } }
                }
            }
        ])
    ]);

    return {
        visits,
        stats: stats[0] || {
            totalVisits: 0,
            uniqueVisitors: 0,
            countries: 0,
            vpnVisits: 0,
            proxyVisits: 0,
            torVisits: 0,
            suspiciousVisits: 0
        }
    };
}

async function getVisitorMapData(userId, websites, timeRange) {
    return await Visit.aggregate([
        {
            $match: {
                website: { $in: websites },
                timestamp: { $gte: timeRange.start, $lte: timeRange.end },
                lat: { $ne: null },
                lon: { $ne: null }
            }
        },
        {
            $group: {
                _id: {
                    country: '$country',
                    city: '$city',
                    lat: '$lat',
                    lon: '$lon'
                },
                visits: { $sum: 1 },
                uniqueIPs: { $addToSet: '$ip' },
                isVpn: { $first: '$isVpn' },
                isProxy: { $first: '$isProxy' },
                isTor: { $first: '$isTor' }
            }
        },
        {
            $project: {
                country: '$_id.country',
                city: '$_id.city',
                lat: '$_id.lat',
                lon: '$_id.lon',
                visits: 1,
                uniqueVisitors: { $size: '$uniqueIPs' },
                isVpn: 1,
                isProxy: 1,
                isTor: 1
            }
        }
    ]);
}

async function getSecurityStats(userId, websites, timeRange, scriptAddedAt) {
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;
    
    const stats = await Visit.aggregate([
        {
            $match: {
                website: { $in: websites },
                timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
            }
        },
        {
            $group: {
                _id: null,
                totalVisits: { $sum: 1 },
                vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                torVisits: { $sum: { $cond: ['$isTor', 1, 0] } },
                suspiciousVisits: { $sum: { $cond: [{ $gte: ['$fraudScore', 70] }, 1, 0] } },
                highRiskVisits: { $sum: { $cond: [{ $gte: ['$fraudScore', 90] }, 1, 0] } },
                botVisits: { $sum: { $cond: ['$isBot', 1, 0] } }
            }
        }
    ]);

    const result = stats[0] || {
        totalVisits: 0,
        vpnVisits: 0,
        proxyVisits: 0,
        torVisits: 0,
        suspiciousVisits: 0,
        highRiskVisits: 0,
        botVisits: 0
    };

    // Calculate percentages
    result.vpnPercentage = result.totalVisits > 0 ? (result.vpnVisits / result.totalVisits) * 100 : 0;
    result.proxyPercentage = result.totalVisits > 0 ? (result.proxyVisits / result.totalVisits) * 100 : 0;
    result.torPercentage = result.totalVisits > 0 ? (result.torVisits / result.totalVisits) * 100 : 0;
    result.suspiciousPercentage = result.totalVisits > 0 ? (result.suspiciousVisits / result.totalVisits) * 100 : 0;
    result.highRiskPercentage = result.totalVisits > 0 ? (result.highRiskVisits / result.totalVisits) * 100 : 0;
    result.botPercentage = result.totalVisits > 0 ? (result.botVisits / result.totalVisits) * 100 : 0;

    return result;
}

async function getRealtimeData(userId, websites, timeRange) {
    const [currentVisitors, recentActivity] = await Promise.all([
        Visit.aggregate([
            {
                $match: {
                    website: { $in: websites },
                    timestamp: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: '$website',
                    currentVisitors: { $sum: 1 },
                    uniqueIPs: { $addToSet: '$ip' }
                }
            },
            {
                $project: {
                    website: '$_id',
                    currentVisitors: 1,
                    uniqueVisitors: { $size: '$uniqueIPs' }
                }
            }
        ]),
        Visit.find({
            website: { $in: websites },
            timestamp: { $gte: timeRange.start, $lte: timeRange.end }
        })
        .select('ip website country city isVpn isProxy isTor timestamp')
        .sort({ timestamp: -1 })
        .limit(20)
        .lean()
    ]);

    return {
        currentVisitors,
        recentActivity,
        totalCurrentVisitors: currentVisitors.reduce((sum, site) => sum + site.currentVisitors, 0)
    };
}

async function getVisitorDetails(ip, websites, timeRange, scriptAddedAt) {
    // Use scriptAddedAt as the minimum timestamp if it's more recent than timeRange.start
    const effectiveStartTime = scriptAddedAt && scriptAddedAt > timeRange.start ? scriptAddedAt : timeRange.start;
    
    logger.info(`getVisitorDetails - IP: ${ip}, effectiveStartTime: ${effectiveStartTime}, timeRange.end: ${timeRange.end}`);
    
    const [visitorStats, recentVisits] = await Promise.all([
        Visit.aggregate([
            {
                $match: {
                    ip: ip,
                    website: { $in: websites },
                    timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: '$ip',
                    totalVisits: { $sum: 1 },
                    websites: { $addToSet: '$website' },
                    country: { $first: '$country' },
                    city: { $first: '$city' },
                    region: { $first: '$region' },
                    zip: { $first: '$zip' },
                    timezone: { $first: '$timezone' },
                    isp: { $first: '$isp' },
                    org: { $first: '$org' },
                    lat: { $first: '$lat' },
                    lon: { $first: '$lon' },
                    accuracy: { $first: '$accuracy' },
                    isVpn: { $first: '$isVpn' },
                    isProxy: { $first: '$isProxy' },
                    isTor: { $first: '$isTor' },
                    vpnProvider: { $first: '$vpnProvider' },
                    proxyType: { $first: '$proxyType' },
                    isBot: { $first: '$isBot' },
                    botType: { $first: '$botType' },
                    fraudScore: { $avg: '$fraudScore' },
                    computerId: { $first: '$computerId' },
                    deviceFingerprint: { $first: '$deviceFingerprint' },
                    sessionId: { $first: '$sessionId' },
                    userAgent: { $first: '$userAgent' },
                    browser: { $first: '$browser' },
                    os: { $first: '$os' },
                    device: { $first: '$device' },
                    screenResolution: { $first: '$screenResolution' },
                    colorDepth: { $first: '$colorDepth' },
                    pixelRatio: { $first: '$pixelRatio' },
                    viewport: { $first: '$viewport' },
                    platform: { $first: '$platform' },
                    language: { $first: '$language' },
                    languages: { $first: '$languages' },
                    hardwareConcurrency: { $first: '$hardwareConcurrency' },
                    maxTouchPoints: { $first: '$maxTouchPoints' },
                    cookieEnabled: { $first: '$cookieEnabled' },
                    doNotTrack: { $first: '$doNotTrack' },
                    online: { $first: '$online' },
                    connectionType: { $first: '$connectionType' },
                    effectiveType: { $first: '$effectiveType' },
                    downlink: { $first: '$downlink' },
                    rtt: { $first: '$rtt' },
                    firstSeen: { $min: '$timestamp' },
                    lastSeen: { $max: '$timestamp' }
                }
            }
        ]),
        Visit.find({
            ip: ip,
            website: { $in: websites },
            timestamp: { $gte: effectiveStartTime, $lte: timeRange.end }
        })
        .select('website page referer url title timestamp type mouseMovements clicks scrollDepth timeOnPage pageLoadTime')
        .sort({ timestamp: -1 })
        .limit(50)
        .lean()
    ]);

    logger.info(`getVisitorDetails - visitorStats.length: ${visitorStats.length}, recentVisits.length: ${recentVisits.length}`);
    
    if (visitorStats.length === 0) {
        logger.info(`getVisitorDetails - No visitor stats found for IP: ${ip}`);
        return null;
    }

    const stats = visitorStats[0];
    logger.info(`getVisitorDetails - Found stats for IP: ${ip}, totalVisits: ${stats.totalVisits}`);
    
    return {
        ip: stats._id,
        totalVisits: stats.totalVisits,
        websites: stats.websites,
        location: {
            country: stats.country || 'Unknown',
            city: stats.city || 'Unknown',
            region: stats.region || 'Unknown',
            zip: stats.zip || 'Unknown',
            timezone: stats.timezone || 'Unknown',
            lat: stats.lat,
            lon: stats.lon,
            accuracy: stats.accuracy || 'unknown'
        },
        network: {
            isp: stats.isp || 'Unknown',
            org: stats.org || stats.isp || 'Unknown',
            isVpn: stats.isVpn || false,
            isProxy: stats.isProxy || false,
            isTor: stats.isTor || false,
            vpnProvider: stats.vpnProvider || null,
            proxyType: stats.proxyType || null
        },
        security: {
            isBot: stats.isBot || false,
            botType: stats.botType || null,
            fraudScore: Math.round(stats.fraudScore || 0),
            riskLevel: stats.fraudScore >= 80 ? 'critical' : 
                      stats.fraudScore >= 60 ? 'high' : 
                      stats.fraudScore >= 40 ? 'medium' : 
                      stats.fraudScore >= 20 ? 'low' : 'safe'
        },
        device: {
            computerId: stats.computerId,
            deviceFingerprint: stats.deviceFingerprint,
            sessionId: stats.sessionId,
            userAgent: stats.userAgent,
            browser: stats.browser && typeof stats.browser === 'object' ? stats.browser : 
                    stats.browser ? { name: stats.browser, version: '' } : 
                    { name: 'Unknown', version: '' },
            os: stats.os && typeof stats.os === 'object' ? stats.os : 
                stats.os ? { name: stats.os, version: '' } : 
                { name: 'Unknown', version: '' },
            device: stats.device && typeof stats.device === 'object' ? stats.device : 
                   stats.device ? { name: stats.device, version: '' } : 
                   { name: 'Unknown', version: '' },
            screenResolution: stats.screenResolution || 'Unknown',
            colorDepth: stats.colorDepth || 'Unknown',
            pixelRatio: stats.pixelRatio || 'Unknown',
            viewport: stats.viewport || {},
            platform: stats.platform || 'Unknown',
            language: stats.language || 'Unknown',
            languages: stats.languages || [],
            hardwareConcurrency: stats.hardwareConcurrency || 'Unknown',
            maxTouchPoints: stats.maxTouchPoints || 'Unknown',
            cookieEnabled: stats.cookieEnabled || false,
            doNotTrack: stats.doNotTrack || 'Unknown',
            online: stats.online || false,
            connectionType: stats.connectionType || 'Unknown',
            effectiveType: stats.effectiveType || 'Unknown',
            downlink: stats.downlink || 'Unknown',
            rtt: stats.rtt || 'Unknown'
        },
        activity: {
            firstSeen: stats.firstSeen,
            lastSeen: stats.lastSeen,
            recentVisits: recentVisits.map(visit => ({
                website: visit.website,
                page: visit.page || '/',
                referer: visit.referer || 'Direct',
                url: visit.url || '',
                title: visit.title || '',
                timestamp: visit.timestamp,
                type: visit.type || 'page_visit',
                mouseMovements: visit.mouseMovements || 0,
                clicks: visit.clicks || 0,
                scrollDepth: visit.scrollDepth || 0,
                timeOnPage: visit.timeOnPage || 0,
                pageLoadTime: visit.pageLoadTime || 0
            }))
        }
    };
}

module.exports = router;
