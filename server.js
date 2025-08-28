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

app.use(express.json());

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
// ============================================================================
// DATABASE MODELS
// ============================================================================

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
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const Visit = mongoose.model('Visit', visitSchema);

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
        const ip = getRealIP(req);
        const { website, userAgent, referer } = req.body;

        // Get location data
        const locationData = await getLocationData(ip);

        // Create new visit record
        const visit = new Visit({
            ip,
            website,
            userAgent,
            referer,
            ...locationData
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
            timestamp: new Date()
        });

        res.status(200).json({ success: true, message: 'Visit tracked' });
    } catch (error) {
        console.error('Error tracking visit:', error);
        res.status(500).json({ success: false, message: 'Error tracking visit' });
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
