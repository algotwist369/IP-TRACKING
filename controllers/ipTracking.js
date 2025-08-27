const Traffic = require("../models/Traffic");
const axios = require("axios");

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
            country: 'Error',
            region: 'Error',
            city: 'Error',
            lat: 0,
            lon: 0,
            timezone: 'Error',
            isp: 'Error'
        };
    }
};

const ipTracking = async (req, res) => {
    try {
        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";
        const url = req.headers.referer || "";

        // Get location data for the IP
        const location = await getIpLocation(ip);

        const entry = await Traffic.create({ 
            ip, 
            userAgent, 
            url, 
            location 
        });

        // Send live update via socket
        req.io.emit("new-visit", {
            ip,
            userAgent,
            url,
            location,
            time: entry.createdAt,
        });

        res.json({ status: "ok" });
    } catch (err) {
        console.error('IP tracking error:', err);
        res.status(500).json({ error: "logging failed" });
    }
}

const getReport = async (req, res) => {
    try {
        const suspicious = await Traffic.aggregate([
            {
                $group: {
                    _id: "$ip",
                    hits: { $sum: 1 },
                    lastHit: { $max: "$createdAt" },
                    location: { $first: "$location" }
                },
            },
            { $match: { hits: { $gt: 20 } } },
            { $sort: { hits: -1 } },
        ]);
        res.json(suspicious);
    } catch (err) {
        res.status(500).json({ error: "report failed" });
    }
};

// New function to get IPs from last 24 hours
const getLast24Hours = async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const last24HoursData = await Traffic.aggregate([
            {
                $match: {
                    createdAt: { $gte: twentyFourHoursAgo }
                }
            },
            {
                $group: {
                    _id: "$ip",
                    hits: { $sum: 1 },
                    lastHit: { $max: "$createdAt" },
                    firstHit: { $min: "$createdAt" },
                    location: { $first: "$location" },
                    userAgents: { $addToSet: "$userAgent" },
                    urls: { $addToSet: "$url" }
                }
            },
            {
                $sort: { hits: -1 }
            }
        ]);

        res.json({
            totalUniqueIPs: last24HoursData.length,
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