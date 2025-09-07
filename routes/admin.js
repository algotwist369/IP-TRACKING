const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Visit = require('../models/Visit');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateAdminAction } = require('../middleware/validation');
const logger = require('../utils/logger');

// ============================================================================
// ADMIN DASHBOARD OVERVIEW
// ============================================================================

router.get('/overview', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        // Get system-wide statistics
        const [userStats, visitStats, systemStats] = await Promise.all([
            getUserStats(),
            getVisitStats(),
            getSystemStats()
        ]);

        res.json({
            success: true,
            data: {
                userStats,
                visitStats,
                systemStats,
                timestamp: new Date()
            }
        });

    } catch (error) {
        logger.error('Admin overview error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching admin overview',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

// Get all users with pagination
router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50, search, role, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

        // Build query
        const query = {};
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } }
            ];
        }
        if (role) query.role = role;
        if (status) query.status = status;

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOrderNum = sortOrder === 'desc' ? -1 : 1;

        // Get users with pagination
        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .sort({ [sortBy]: sortOrderNum })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalItems: total,
                    itemsPerPage: parseInt(limit),
                    hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
                    hasPrevPage: parseInt(page) > 1
                }
            }
        });

    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get user details
router.get('/users/:userId', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user's website statistics
        const userWebsites = user.websites.map(w => w.domain);
        const websiteStats = await getWebsiteStatsForUser(userWebsites);

        res.json({
            success: true,
            data: {
                user,
                websiteStats
            }
        });

    } catch (error) {
        logger.error('Get user details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user details',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Update user role
router.patch('/users/:userId/role', authenticateToken, requireRole('admin'), validateAdminAction, async (req, res) => {
    try {
        const { userId } = req.params;
        const { role, reason } = req.body;

        if (!['user', 'admin', 'moderator'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be user, admin, or moderator'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admin from changing their own role
        if (userId === req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Cannot change your own role'
            });
        }

        const oldRole = user.role;
        user.role = role;
        user.updatedAt = new Date();

        await user.save();

        logger.info(`User role changed: ${user.email} (${userId}) from ${oldRole} to ${role} by admin ${req.userId}. Reason: ${reason || 'No reason provided'}`);

        res.json({
            success: true,
            message: 'User role updated successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                    updatedAt: user.updatedAt
                }
            }
        });

    } catch (error) {
        logger.error('Update user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user role',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Suspend/unsuspend user
router.patch('/users/:userId/status', authenticateToken, requireRole('admin'), validateAdminAction, async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, reason, duration } = req.body;

        if (!['active', 'suspended', 'banned'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be active, suspended, or banned'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admin from changing their own status
        if (userId === req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Cannot change your own status'
            });
        }

        const oldStatus = user.status;
        user.status = status;
        user.statusReason = reason;
        user.statusUpdatedAt = new Date();
        user.statusUpdatedBy = req.userId;

        if (status === 'suspended' && duration) {
            user.suspensionEndsAt = new Date(Date.now() + duration * 60 * 60 * 1000); // duration in hours
        } else {
            user.suspensionEndsAt = undefined;
        }

        await user.save();

        logger.info(`User status changed: ${user.email} (${userId}) from ${oldStatus} to ${status} by admin ${req.userId}. Reason: ${reason || 'No reason provided'}`);

        res.json({
            success: true,
            message: `User ${status === 'active' ? 'activated' : status} successfully`,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    status: user.status,
                    statusReason: user.statusReason,
                    statusUpdatedAt: user.statusUpdatedAt,
                    suspensionEndsAt: user.suspensionEndsAt
                }
            }
        });

    } catch (error) {
        logger.error('Update user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user status',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Delete user
router.delete('/users/:userId', authenticateToken, requireRole('admin'), validateAdminAction, async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admin from deleting themselves
        if (userId === req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        // Get user's websites for cleanup
        const userWebsites = user.websites.map(w => w.domain);

        // Delete user
        await User.findByIdAndDelete(userId);

        // Optionally delete user's visits (you might want to keep them for analytics)
        // await Visit.deleteMany({ website: { $in: userWebsites } });

        logger.info(`User deleted: ${user.email} (${userId}) by admin ${req.userId}. Reason: ${reason || 'No reason provided'}`);

        res.json({
            success: true,
            message: 'User deleted successfully',
            data: {
                deletedUser: {
                    id: userId,
                    email: user.email,
                    websites: userWebsites
                }
            }
        });

    } catch (error) {
        logger.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting user',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// SYSTEM STATISTICS
// ============================================================================

// Get system-wide visit statistics
router.get('/stats/visits', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { period = '7d' } = req.query;
        const timeRange = getTimeRange(period);

        const visitStats = await getDetailedVisitStats(timeRange);

        res.json({
            success: true,
            data: {
                visitStats,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Get visit stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching visit statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get system-wide user statistics
router.get('/stats/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        const timeRange = getTimeRange(period);

        const userStats = await getDetailedUserStats(timeRange);

        res.json({
            success: true,
            data: {
                userStats,
                timeRange: {
                    start: timeRange.start,
                    end: timeRange.end,
                    period: period
                }
            }
        });

    } catch (error) {
        logger.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Get system health
router.get('/health', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const health = await getSystemHealth();

        res.json({
            success: true,
            data: {
                health,
                timestamp: new Date()
            }
        });

    } catch (error) {
        logger.error('Get system health error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching system health',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// SYSTEM MAINTENANCE
// ============================================================================

// Clean up old data
router.post('/maintenance/cleanup', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { days = 90, dryRun = true } = req.body;

        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        if (dryRun) {
            // Count records that would be deleted
            const [oldVisits, oldUsers] = await Promise.all([
                Visit.countDocuments({ timestamp: { $lt: cutoffDate } }),
                User.countDocuments({ 
                    status: 'banned', 
                    updatedAt: { $lt: cutoffDate } 
                })
            ]);

            res.json({
                success: true,
                message: 'Dry run completed',
                data: {
                    wouldDelete: {
                        visits: oldVisits,
                        users: oldUsers
                    },
                    cutoffDate,
                    dryRun: true
                }
            });
        } else {
            // Actually delete old records
            const [deletedVisits, deletedUsers] = await Promise.all([
                Visit.deleteMany({ timestamp: { $lt: cutoffDate } }),
                User.deleteMany({ 
                    status: 'banned', 
                    updatedAt: { $lt: cutoffDate } 
                })
            ]);

            logger.info(`System cleanup completed by admin ${req.userId}. Deleted ${deletedVisits.deletedCount} visits and ${deletedUsers.deletedCount} users older than ${days} days`);

            res.json({
                success: true,
                message: 'Cleanup completed successfully',
                data: {
                    deleted: {
                        visits: deletedVisits.deletedCount,
                        users: deletedUsers.deletedCount
                    },
                    cutoffDate,
                    dryRun: false
                }
            });
        }

    } catch (error) {
        logger.error('System cleanup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during system cleanup',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Export system data
router.get('/export/data', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { type, format = 'json', startDate, endDate } = req.query;

        if (!['users', 'visits', 'all'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid export type. Must be users, visits, or all'
            });
        }

        // Build date filter
        const dateFilter = {};
        if (startDate && endDate) {
            dateFilter.timestamp = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        let exportData = {};

        if (type === 'users' || type === 'all') {
            const users = await User.find({}, '-password').lean();
            exportData.users = users;
        }

        if (type === 'visits' || type === 'all') {
            const visits = await Visit.find(dateFilter).lean();
            exportData.visits = visits;
        }

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="ip-tracker-export-${type}-${Date.now()}.json"`);
            res.json(exportData);
        } else {
            res.status(400).json({
                success: false,
                message: 'Only JSON format is currently supported'
            });
        }

    } catch (error) {
        logger.error('Export data error:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting data',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserStats() {
    const [totalUsers, activeUsers, suspendedUsers, bannedUsers, newUsers24h, newUsers7d] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: 'active' }),
        User.countDocuments({ status: 'suspended' }),
        User.countDocuments({ status: 'banned' }),
        User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
    ]);

    return {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        banned: bannedUsers,
        new24h: newUsers24h,
        new7d: newUsers7d
    };
}

async function getVisitStats() {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalVisits, visits24h, visits7d, uniqueVisitors24h, uniqueVisitors7d] = await Promise.all([
        Visit.countDocuments(),
        Visit.countDocuments({ timestamp: { $gte: last24h } }),
        Visit.countDocuments({ timestamp: { $gte: last7d } }),
        Visit.distinct('ip', { timestamp: { $gte: last24h } }),
        Visit.distinct('ip', { timestamp: { $gte: last7d } })
    ]);

    return {
        total: totalVisits,
        last24h: visits24h,
        last7d: visits7d,
        uniqueVisitors24h: uniqueVisitors24h.length,
        uniqueVisitors7d: uniqueVisitors7d.length
    };
}

async function getSystemStats() {
    const [totalWebsites, activeWebsites, vpnVisits, proxyVisits, torVisits] = await Promise.all([
        User.aggregate([
            { $unwind: '$websites' },
            { $count: 'total' }
        ]).then(result => result[0]?.total || 0),
        User.aggregate([
            { $unwind: '$websites' },
            { $match: { 'websites.status': 'active' } },
            { $count: 'total' }
        ]).then(result => result[0]?.total || 0),
        Visit.countDocuments({ isVpn: true }),
        Visit.countDocuments({ isProxy: true }),
        Visit.countDocuments({ isTor: true })
    ]);

    return {
        totalWebsites,
        activeWebsites,
        vpnVisits,
        proxyVisits,
        torVisits
    };
}

async function getWebsiteStatsForUser(websites) {
    if (!websites.length) return [];

    const stats = await Visit.aggregate([
        {
            $match: {
                website: { $in: websites }
            }
        },
        {
            $group: {
                _id: '$website',
                totalVisits: { $sum: 1 },
                uniqueVisitors: { $addToSet: '$ip' },
                lastVisit: { $max: '$timestamp' }
            }
        },
        {
            $project: {
                website: '$_id',
                totalVisits: 1,
                uniqueVisitors: { $size: '$uniqueVisitors' },
                lastVisit: 1
            }
        }
    ]);

    return stats;
}

async function getDetailedVisitStats(timeRange) {
    const stats = await Visit.aggregate([
        {
            $match: {
                timestamp: { $gte: timeRange.start, $lte: timeRange.end }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                    day: { $dayOfMonth: '$timestamp' }
                },
                visits: { $sum: 1 },
                uniqueVisitors: { $addToSet: '$ip' },
                vpnVisits: { $sum: { $cond: ['$isVpn', 1, 0] } },
                proxyVisits: { $sum: { $cond: ['$isProxy', 1, 0] } },
                torVisits: { $sum: { $cond: ['$isTor', 1, 0] } }
            }
        },
        {
            $project: {
                date: {
                    $dateFromParts: {
                        year: '$_id.year',
                        month: '$_id.month',
                        day: '$_id.day'
                    }
                },
                visits: 1,
                uniqueVisitors: { $size: '$uniqueVisitors' },
                vpnVisits: 1,
                proxyVisits: 1,
                torVisits: 1
            }
        },
        { $sort: { date: 1 } }
    ]);

    return stats;
}

async function getDetailedUserStats(timeRange) {
    const stats = await User.aggregate([
        {
            $match: {
                createdAt: { $gte: timeRange.start, $lte: timeRange.end }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                },
                newUsers: { $sum: 1 },
                verifiedUsers: { $sum: { $cond: ['$isEmailVerified', 1, 0] } },
                premiumUsers: { $sum: { $cond: [{ $ne: ['$subscription.status', 'inactive'] }, 1, 0] } }
            }
        },
        {
            $project: {
                date: {
                    $dateFromParts: {
                        year: '$_id.year',
                        month: '$_id.month',
                        day: '$_id.day'
                    }
                },
                newUsers: 1,
                verifiedUsers: 1,
                premiumUsers: 1
            }
        },
        { $sort: { date: 1 } }
    ]);

    return stats;
}

async function getSystemHealth() {
    try {
        // Check database connection
        const dbStatus = await User.db.db.admin().ping();
        
        // Check memory usage
        const memUsage = process.memoryUsage();
        
        // Check uptime
        const uptime = process.uptime();
        
        return {
            database: dbStatus.ok === 1 ? 'healthy' : 'unhealthy',
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024), // MB
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) // MB
            },
            uptime: Math.round(uptime), // seconds
            nodeVersion: process.version,
            platform: process.platform,
            timestamp: new Date()
        };
    } catch (error) {
        return {
            database: 'unhealthy',
            error: error.message,
            timestamp: new Date()
        };
    }
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
            start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
}

module.exports = router;
