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
            country: 'Unknown',
            region: 'Unknown',
            city: 'Unknown',
            lat: 0,
            lon: 0,
            timezone: 'Unknown',
            isp: 'Unknown'
        };
    }
};

const ipTracking = async (req, res) => {
    try {
        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";
        const url = req.headers.referer || "";

        // Check if IP already exists
        let existingEntry = await Traffic.findOne({ ip });
        
        if (existingEntry) {
            // IP exists, increment hit count and update
            existingEntry.hitCount += 1;
            existingEntry.lastHit = new Date();
            existingEntry.updatedAt = new Date();
            
            // Add new user agent if not already present
            if (userAgent && !existingEntry.userAgents.includes(userAgent)) {
                existingEntry.userAgents.push(userAgent);
            }
            
            // Add new URL if not already present
            if (url && !existingEntry.urls.includes(url)) {
                existingEntry.urls.push(url);
            }
            
            // Update location if it was previously unknown
            if (existingEntry.location.country === 'Unknown' || existingEntry.location.country === 'Error') {
                const newLocation = await getIpLocation(ip);
                existingEntry.location = newLocation;
            }
            
            await existingEntry.save();
            
            // Send live update via socket
            req.io.emit("new-visit", {
                ip,
                hitCount: existingEntry.hitCount,
                userAgent,
                url,
                location: existingEntry.location,
                time: existingEntry.lastHit,
                isNew: false
            });
            
        } else {
            // New IP, get location and create entry
            const location = await getIpLocation(ip);
            
            const newEntry = await Traffic.create({ 
                ip, 
                hitCount: 1,
                userAgents: userAgent ? [userAgent] : [],
                urls: url ? [url] : [],
                location,
                firstHit: new Date(),
                lastHit: new Date()
            });
            
            // Send live update via socket
            req.io.emit("new-visit", {
                ip,
                hitCount: 1,
                userAgent,
                url,
                location,
                time: newEntry.lastHit,
                isNew: true
            });
        }

        res.json({ status: "ok" });
    } catch (err) {
        console.error('IP tracking error:', err);
        res.status(500).json({ error: "logging failed" });
    }
}

const getReport = async (req, res) => {
    try {
        const suspicious = await Traffic.find({ hitCount: { $gt: 20 } })
            .sort({ hitCount: -1 })
            .select('ip hitCount lastHit location userAgents urls');
            
        res.json(suspicious);
    } catch (err) {
        res.status(500).json({ error: "report failed" });
    }
};

// New function to get IPs from last 24 hours
const getLast24Hours = async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const last24HoursData = await Traffic.find({ 
            lastHit: { $gte: twentyFourHoursAgo } 
        })
        .sort({ hitCount: -1 })
        .select('ip hitCount firstHit lastHit location userAgents urls');

        res.json({
            totalUniqueIPs: last24HoursData.length,
            totalHits: last24HoursData.reduce((sum, item) => sum + item.hitCount, 0),
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