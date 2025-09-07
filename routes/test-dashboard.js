const express = require('express');
const router = express.Router();

// Test dashboard routes for development
router.get('/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            overallStats: {
                totalVisits24h: 1250,
                uniqueVisitors24h: 456,
                totalWebsites: 5,
                totalUniqueIPs: 89,
                averageVisitsPerWebsite: 250
            }
        }
    });
});

router.get('/websites', (req, res) => {
    res.json({
        success: true,
        data: {
            websites: [
                {
                    website: "example.com",
                    totalVisits24h: 320,
                    uniqueVisitors24h: 145,
                    totalUniqueIPs: 45,
                    averageVisitsPerIP: 7.1,
                    topPages: ["/home", "/about", "/contact"],
                    lastActivity: "2025-09-03T13:45:00Z"
                },
                {
                    website: "myapp.com",
                    totalVisits24h: 280,
                    uniqueVisitors24h: 98,
                    totalUniqueIPs: 32,
                    averageVisitsPerIP: 8.8,
                    topPages: ["/", "/dashboard", "/pricing"],
                    lastActivity: "2025-09-03T13:30:00Z"
                }
            ]
        }
    });
});

router.get('/recent-activity', (req, res) => {
    res.json({
        success: true,
        data: {
            activities: [
                {
                    ip: "192.168.1.10",
                    website: "example.com",
                    city: "Mumbai",
                    country: "India",
                    timestamp: "2025-09-03T13:45:00Z",
                    page: "/home",
                    visitNumber: 25
                },
                {
                    ip: "203.0.113.5",
                    website: "demo.com",
                    city: "New York",
                    country: "USA",
                    timestamp: "2025-09-03T13:30:00Z",
                    page: "/demo",
                    visitNumber: 22
                }
            ]
        }
    });
});

router.get('/ip-analytics', (req, res) => {
    res.json({
        success: true,
        data: {
            analytics: [
                {
                    ip: "192.168.1.10",
                    city: "Mumbai",
                    country: "India",
                    isp: "Jio",
                    accuracy: "high",
                    lat: 19.076,
                    lon: 72.8777,
                    websiteVisits: [
                        { website: "example.com", visits: 25, pages: ["/home", "/about", "/contact"] },
                        { website: "myapp.com", visits: 18, pages: ["/", "/dashboard"] }
                    ],
                    totalVisits: 55,
                    lastSeen: "2025-09-03T13:45:00Z"
                },
                {
                    ip: "203.0.113.5",
                    city: "New York",
                    country: "USA",
                    isp: "Verizon",
                    accuracy: "medium",
                    lat: 40.7128,
                    lon: -74.006,
                    websiteVisits: [
                        { website: "example.com", visits: 15, pages: ["/home", "/about"] },
                        { website: "demo.com", visits: 22, pages: ["/", "/demo", "/tutorial"] }
                    ],
                    totalVisits: 45,
                    lastSeen: "2025-09-03T13:30:00Z"
                }
            ]
        }
    });
});

module.exports = router;
