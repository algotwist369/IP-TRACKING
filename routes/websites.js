const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Visit = require('../models/Visit');
const { authenticateToken, requireActiveSubscription, verifyWebsiteOwnership } = require('../middleware/auth');
const { validateWebsite } = require('../middleware/validation');
const logger = require('../utils/logger');

// Helper function to calculate time ranges
function getTimeRange(period) {
    const now = new Date();
    let start;

    switch (period) {
        case '1h':
            start = new Date(now.getTime() - 60 * 60 * 1000);
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
        default:
            start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
}

// ============================================================================
// GET USER'S WEBSITES
// ============================================================================

router.get('/', authenticateToken, requireActiveSubscription, async (req, res) => {
    try {
        const userId = req.userId;

        // Get user with websites
        const user = await User.findById(userId).select('websites subscription limits');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check subscription limits
        const maxWebsites = user.limits?.maxWebsites || 1;
        const currentWebsiteCount = user.websites.length;

        // Get analytics for each website
        const websitesWithAnalytics = await Promise.all(
            user.websites.map(async (website) => {
                try {
                    // Get website analytics for the last 24 hours
                    const timeRange = getTimeRange('24h');
                    const effectiveStartTime = website.scriptAddedAt && website.scriptAddedAt > timeRange.start 
                        ? website.scriptAddedAt 
                        : timeRange.start;

                    const analytics = await Visit.aggregate([
                        {
                            $match: {
                                website: website.domain,
                                timestamp: {
                                    $gte: effectiveStartTime,
                                    $lte: timeRange.end
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalVisits: { $sum: 1 },
                                uniqueVisitors: { $addToSet: '$ip' },
                                totalPageViews: { $sum: { $cond: [{ $eq: ['$type', 'page_visit'] }, 1, 0] } },
                                avgTimeOnPage: { $avg: '$timeOnPage' },
                                lastVisit: { $max: '$timestamp' }
                            }
                        }
                    ]);

                    const stats = analytics[0] || {
                        totalVisits: 0,
                        uniqueVisitors: [],
                        totalPageViews: 0,
                        avgTimeOnPage: 0,
                        lastVisit: null
                    };

                    return {
                        ...website.toObject(),
                        analytics: {
                            totalVisits: stats.totalVisits,
                            uniqueVisitors: stats.uniqueVisitors.length,
                            totalPageViews: stats.totalPageViews,
                            avgTimeOnPage: Math.round(stats.avgTimeOnPage || 0),
                            lastVisit: stats.lastVisit
                        }
                    };
                } catch (error) {
                    logger.error(`Error getting analytics for website ${website.domain}:`, error);
                    return {
                        ...website.toObject(),
                        analytics: {
                            totalVisits: 0,
                            uniqueVisitors: 0,
                            totalPageViews: 0,
                            avgTimeOnPage: 0,
                            lastVisit: null
                        }
                    };
                }
            })
        );

        res.json({
            success: true,
            data: {
                websites: websitesWithAnalytics,
                limits: {
                    maxWebsites,
                    currentWebsiteCount,
                    remainingWebsites: Math.max(0, maxWebsites - currentWebsiteCount)
                },
                subscription: user.subscription
            }
        });

    } catch (error) {
        logger.error('Get websites error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching websites',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// ADD NEW WEBSITE
// ============================================================================

router.post('/', authenticateToken, requireActiveSubscription, validateWebsite, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain, name, description, settings } = req.body;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if domain already exists for this user
        const existingWebsite = user.websites.find(w => w.domain === domain);
        if (existingWebsite) {
            return res.status(400).json({
                success: false,
                message: 'Website with this domain already exists'
            });
        }

        // Check subscription limits
        const maxWebsites = user.limits?.maxWebsites || 1;
        if (user.websites.length >= maxWebsites) {
            return res.status(403).json({
                success: false,
                message: `You have reached the maximum number of websites (${maxWebsites}) for your current plan. Please upgrade to add more websites.`
            });
        }

        // Generate unique tracking code
        const trackingCode = generateTrackingCode();

        // Create new website
        const newWebsite = {
            domain,
            name: name || domain,
            description: description || '',
            trackingCode,
            settings: {
                enableTracking: true,
                enableVPNDetection: true,
                enableBotDetection: true,
                enableFraudDetection: true,
                enableRealTimeTracking: true,
                enableBehavioralTracking: true,
                enableGeolocation: true,
                enableDeviceFingerprinting: true,
                privacyMode: 'standard', // standard, enhanced, minimal
                cookieConsent: true,
                gdprCompliant: true,
                ...settings
            },
            createdAt: new Date(),
            status: 'active'
        };

        // Add website to user
        user.websites.push(newWebsite);
        await user.save();

        logger.info(`New website added: ${domain} for user: ${user.email} (${userId})`);

        res.status(201).json({
            success: true,
            message: 'Website added successfully',
            data: {
                website: newWebsite
            }
        });

    } catch (error) {
        logger.error('Add website error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding website',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// UPDATE WEBSITE
// ============================================================================

router.put('/:domain', authenticateToken, requireActiveSubscription, verifyWebsiteOwnership, validateWebsite, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;
        const { name, description, settings, status } = req.body;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find website
        const website = user.websites.find(w => w.domain === domain);
        if (!website) {
            return res.status(404).json({
                success: false,
                message: 'Website not found'
            });
        }

        // Update website fields
        if (name !== undefined) website.name = name;
        if (description !== undefined) website.description = description;
        if (status !== undefined) website.status = status;
        if (settings) {
            website.settings = { ...website.settings, ...settings };
        }

        website.updatedAt = new Date();
        await user.save();

        logger.info(`Website updated: ${domain} for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: 'Website updated successfully',
            data: {
                website
            }
        });

    } catch (error) {
        logger.error('Update website error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating website',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// DELETE WEBSITE
// ============================================================================

router.delete('/:domain', authenticateToken, requireActiveSubscription, verifyWebsiteOwnership, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find website
        const websiteIndex = user.websites.findIndex(w => w.domain === domain);
        if (websiteIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Website not found'
            });
        }

        // Remove website from user
        const deletedWebsite = user.websites.splice(websiteIndex, 1)[0];
        await user.save();

        // Delete all visits for this website (optional - you might want to keep them for analytics)
        // await Visit.deleteMany({ website: domain });

        logger.info(`Website deleted: ${domain} for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: 'Website deleted successfully',
            data: {
                deletedWebsite
            }
        });

    } catch (error) {
        logger.error('Delete website error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting website',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET WEBSITE DETAILS
// ============================================================================

router.get('/:domain', authenticateToken, requireActiveSubscription, verifyWebsiteOwnership, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find website
        const website = user.websites.find(w => w.domain === domain);
        if (!website) {
            return res.status(404).json({
                success: false,
                message: 'Website not found'
            });
        }

        // Get website statistics
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const stats = await Visit.aggregate([
            {
                $match: {
                    website: domain,
                    timestamp: { $gte: last24Hours }
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
        ]);

        const websiteStats = stats[0] || {
            totalVisits: 0,
            uniqueVisitors: 0,
            countries: 0,
            vpnVisits: 0,
            proxyVisits: 0,
            torVisits: 0,
            suspiciousVisits: 0
        };

        // Calculate percentages
        websiteStats.uniqueVisitors = websiteStats.uniqueVisitors.length;
        websiteStats.countries = websiteStats.countries.length;
        websiteStats.vpnPercentage = websiteStats.totalVisits > 0 ? (websiteStats.vpnVisits / websiteStats.totalVisits) * 100 : 0;
        websiteStats.proxyPercentage = websiteStats.totalVisits > 0 ? (websiteStats.proxyVisits / websiteStats.totalVisits) * 100 : 0;
        websiteStats.torPercentage = websiteStats.totalVisits > 0 ? (websiteStats.torVisits / websiteStats.totalVisits) * 100 : 0;
        websiteStats.suspiciousPercentage = websiteStats.totalVisits > 0 ? (websiteStats.suspiciousVisits / websiteStats.totalVisits) * 100 : 0;

        res.json({
            success: true,
            data: {
                website,
                statistics: websiteStats,
                trackingCode: website.trackingCode,
                integrationGuide: {
                    html: `<script>
window.IPTrackerConfig = {
    trackingCode: '${website.trackingCode}',
    website: '${domain}'
};
</script>
<script src="${process.env.SERVER_URL || 'http://localhost:5000'}/tracking-script.js"></script>`,
                    react: `// Add to your React component
useEffect(() => {
    const script = document.createElement('script');
    script.innerHTML = \`
        window.IPTrackerConfig = {
            trackingCode: '${website.trackingCode}',
            website: '${domain}'
        };
    \`;
    document.head.appendChild(script);
    
    const trackingScript = document.createElement('script');
    trackingScript.src = '${process.env.SERVER_URL || 'http://localhost:5000'}/tracking-script.js';
    document.head.appendChild(trackingScript);
}, []);`,
                    vue: `// Add to your Vue component
mounted() {
    const script = document.createElement('script');
    script.innerHTML = \`
        window.IPTrackerConfig = {
            trackingCode: '${website.trackingCode}',
            website: '${domain}'
        };
    \`;
    document.head.appendChild(script);
    
    const trackingScript = document.createElement('script');
    trackingScript.src = '${process.env.SERVER_URL || 'http://localhost:5000'}/tracking-script.js';
    document.head.appendChild(trackingScript);
}`
                }
            }
        });

    } catch (error) {
        logger.error('Get website details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching website details',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// REGENERATE TRACKING CODE
// ============================================================================

router.post('/:domain/regenerate-tracking-code', authenticateToken, requireActiveSubscription, verifyWebsiteOwnership, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find website
        const website = user.websites.find(w => w.domain === domain);
        if (!website) {
            return res.status(404).json({
                success: false,
                message: 'Website not found'
            });
        }

        // Generate new tracking code
        const newTrackingCode = generateTrackingCode();
        website.trackingCode = newTrackingCode;
        website.updatedAt = new Date();

        await user.save();

        logger.info(`Tracking code regenerated for website: ${domain} for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: 'Tracking code regenerated successfully',
            data: {
                newTrackingCode,
                website
            }
        });

    } catch (error) {
        logger.error('Regenerate tracking code error:', error);
        res.status(500).json({
            success: false,
            message: 'Error regenerating tracking code',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// TOGGLE WEBSITE STATUS
// ============================================================================

router.put('/:domain/toggle-status', authenticateToken, requireActiveSubscription, verifyWebsiteOwnership, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find website
        const website = user.websites.find(w => w.domain === domain);
        if (!website) {
            return res.status(404).json({
                success: false,
                message: 'Website not found'
            });
        }

        // Toggle status
        website.status = website.status === 'active' ? 'inactive' : 'active';
        website.updatedAt = new Date();

        await user.save();

        logger.info(`Website status toggled: ${domain} to ${website.status} for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: `Website ${website.status === 'active' ? 'activated' : 'deactivated'} successfully`,
            data: {
                website
            }
        });

    } catch (error) {
        logger.error('Toggle website status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error toggling website status',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET WEBSITE ANALYTICS
// ============================================================================

router.get('/:domain/analytics', authenticateToken, requireActiveSubscription, verifyWebsiteOwnership, async (req, res) => {
    try {
        const userId = req.userId;
        const { domain } = req.params;
        const { period = '24h', page = 1, limit = 50 } = req.query;

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find website
        const website = user.websites.find(w => w.domain === domain);
        if (!website) {
            return res.status(404).json({
                success: false,
                message: 'Website not found'
            });
        }

        // Calculate time range
        const timeRange = getTimeRange(period);

        // Get analytics data
        const analytics = await getWebsiteAnalytics(domain, timeRange, parseInt(page), parseInt(limit));

        res.json({
            success: true,
            data: {
                website: {
                    domain: website.domain,
                    name: website.name,
                    status: website.status
                },
                analytics,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Get website analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching website analytics',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateTrackingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

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

async function getWebsiteAnalytics(domain, timeRange, page, limit) {
    const skip = (page - 1) * limit;

    const [visits, total, stats] = await Promise.all([
        Visit.find({
            website: domain,
            timestamp: { $gte: timeRange.start, $lte: timeRange.end }
        })
        .select('ip country city isp isVpn isProxy isTor vpnProvider computerId fraudScore timestamp userAgent referer')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
        Visit.countDocuments({
            website: domain,
            timestamp: { $gte: timeRange.start, $lte: timeRange.end }
        }),
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
                    suspiciousVisits: { $sum: { $cond: [{ $gte: ['$fraudScore', 70] }, 1, 0] } },
                    avgFraudScore: { $avg: '$fraudScore' }
                }
            }
        ])
    ]);

    const websiteStats = stats[0] || {
        totalVisits: 0,
        uniqueVisitors: 0,
        countries: 0,
        vpnVisits: 0,
        proxyVisits: 0,
        torVisits: 0,
        suspiciousVisits: 0,
        avgFraudScore: 0
    };

    // Calculate additional metrics
    websiteStats.uniqueVisitors = websiteStats.uniqueVisitors.length;
    websiteStats.countries = websiteStats.countries.length;
    websiteStats.vpnPercentage = websiteStats.totalVisits > 0 ? (websiteStats.vpnVisits / websiteStats.totalVisits) * 100 : 0;
    websiteStats.proxyPercentage = websiteStats.totalVisits > 0 ? (websiteStats.proxyVisits / websiteStats.totalVisits) * 100 : 0;
    websiteStats.torPercentage = websiteStats.totalVisits > 0 ? (websiteStats.torVisits / websiteStats.totalVisits) * 100 : 0;
    websiteStats.suspiciousPercentage = websiteStats.totalVisits > 0 ? (websiteStats.suspiciousVisits / websiteStats.totalVisits) * 100 : 0;

    return {
        visits,
        stats: websiteStats,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
        }
    };
}

module.exports = router;
