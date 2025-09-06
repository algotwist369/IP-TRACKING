const axios = require('axios');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const logger = require('../utils/logger');

class IPTrackingService {
    constructor() {
        this.geolocationServices = [
            this.ipApiCom,
            this.ipapiCo,
            this.ipwhoisIo,
            this.ipinfoIo,
            this.fallbackGeoip
        ];
        
        this.vpnDetectionServices = [
            this.iphubDetection,
            this.ipQualityScoreDetection,
            this.heuristicDetection
        ];
        
        this.rateLimitCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    // ============================================================================
    // DEVICE IDENTIFICATION
    // ============================================================================
    
    generateComputerId() {
        // Generate a simple computer ID based on timestamp and random number
        return 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    generateDeviceFingerprint(deviceInfo) {
        const fingerprintData = {
            screenResolution: deviceInfo.screenResolution || 'unknown',
            colorDepth: deviceInfo.colorDepth || 'unknown',
            platform: deviceInfo.platform || 'unknown',
            language: deviceInfo.language || 'unknown',
            timezone: deviceInfo.timezone || 'unknown',
            hardwareConcurrency: deviceInfo.hardwareConcurrency || 'unknown',
            maxTouchPoints: deviceInfo.maxTouchPoints || 'unknown',
            cookieEnabled: deviceInfo.cookieEnabled || false,
            doNotTrack: deviceInfo.doNotTrack || 'unknown',
            online: deviceInfo.online || false
        };
        
        return this.hashString(JSON.stringify(fingerprintData));
    }

    // ============================================================================
    // USER AGENT PARSING
    // ============================================================================
    
    parseUserAgent(userAgent) {
        try {
            const parser = new UAParser(userAgent);
            const result = parser.getResult();
            
            const returnData = {
                browser: {
                    name: result.browser.name || 'Unknown',
                    version: result.browser.version || 'Unknown',
                    major: result.browser.major || 'Unknown'
                },
                os: {
                    name: result.os.name || 'Unknown',
                    version: result.os.version || 'Unknown'
                },
                deviceInfo: {
                    model: result.device.model || 'Unknown',
                    deviceType: result.device.type || 'Unknown',
                    vendor: result.device.vendor || 'Unknown'
                },
                engine: {
                    name: result.engine.name || 'Unknown',
                    version: result.engine.version || 'Unknown'
                },
                cpu: {
                    architecture: result.cpu.architecture || 'Unknown'
                }
            };
            return returnData;
        } catch (error) {
            logger.error('Error parsing user agent:', error);
            return {
                browser: { name: 'Unknown', version: 'Unknown', major: 'Unknown' },
                os: { name: 'Unknown', version: 'Unknown' },
                // device: { model: 'Unknown', type: 'Unknown', vendor: 'Unknown' },
                engine: { name: 'Unknown', version: 'Unknown' },
                cpu: { architecture: 'Unknown' }
            };
        }
    }

    // ============================================================================
    // IP ADDRESS EXTRACTION
    // ============================================================================
    
    getRealIP(req) {
        const headers = [
            'cf-connecting-ip',        // Cloudflare
            'x-forwarded-for',         // Standard proxy header
            'x-real-ip',               // Nginx
            'x-client-ip',             // Apache
            'x-forwarded',             // General proxy
            'forwarded-for',           // RFC 7239
            'forwarded'                // RFC 7239
        ];

        for (const header of headers) {
            const value = req.headers[header];
            if (value) {
                // Handle comma-separated IPs (take first one)
                const ip = value.split(',')[0].trim();
                if (this.isValidIP(ip)) {
                    return ip;
                }
            }
        }

        // Fallback to connection info
        return req.connection?.remoteAddress || 
               req.socket?.remoteAddress || 
               req.connection?.socket?.remoteAddress || 
               '127.0.0.1';
    }

    isValidIP(ip) {
        if (!ip) return false;
        
        // IPv4 validation
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (ipv4Regex.test(ip)) return true;
        
        // IPv6 validation (basic)
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        if (ipv6Regex.test(ip)) return true;
        
        return false;
    }

    // ============================================================================
    // GEOLOCATION SERVICES
    // ============================================================================
    
    async getLocationData(ip) {
        // Check cache first
        const cacheKey = `geo_${ip}`;
        const cached = this.rateLimitCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        // Try each service until one works
        for (let i = 0; i < this.geolocationServices.length; i++) {
            try {
                const result = await this.geolocationServices[i](ip);
                if (result && result.lat && result.lon) {
                    // Cache the result
                    this.rateLimitCache.set(cacheKey, {
                        data: result,
                        timestamp: Date.now()
                    });
                    
                    logger.info(`Location data obtained from service ${i + 1} for IP: ${ip}`);
                    return result;
                }
            } catch (error) {
                logger.warn(`Geolocation service ${i + 1} failed for IP ${ip}:`, error.message);
                if (i === this.geolocationServices.length - 1) {
                    logger.error('All geolocation services failed for IP:', ip);
                }
            }
        }

        // Return default data if all services fail
        return {
            country: 'Unknown',
            countryCode: 'XX',
            region: 'Unknown',
            regionCode: 'XX',
            city: 'Unknown',
            district: 'Unknown',
            zip: 'Unknown',
            timezone: 'UTC',
            isp: 'Unknown',
            org: 'Unknown',
            as: 'Unknown',
            asn: 'Unknown',
            lat: 0,
            lon: 0,
            accuracy: 'none'
        };
    }

    async ipApiCom(ip) {
        try {
            const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,timezone,isp,org,as,asn,lat,lon,zip,district`, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'IP-Tracker/2.0'
                }
            });

            if (response.data.status === 'success') {
                return {
                    country: response.data.country,
                    countryCode: response.data.countryCode,
                    region: response.data.regionName,
                    regionCode: response.data.region,
                    city: response.data.city,
                    district: response.data.district,
                    zip: response.data.zip,
                    timezone: response.data.timezone,
                    isp: response.data.isp,
                    org: response.data.org,
                    as: response.data.as,
                    asn: response.data.asn,
                    lat: response.data.lat,
                    lon: response.data.lon,
                    accuracy: 'high'
                };
            }
            throw new Error('ip-api.com failed');
        } catch (error) {
            throw new Error(`ip-api.com error: ${error.message}`);
        }
    }

    async ipapiCo(ip) {
        try {
            const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'IP-Tracker/2.0'
                }
            });

            if (response.data && response.data.latitude && response.data.longitude) {
                return {
                    country: response.data.country_name,
                    countryCode: response.data.country_code,
                    region: response.data.region,
                    regionCode: response.data.region_code,
                    city: response.data.city,
                    district: response.data.district,
                    zip: response.data.postal,
                    timezone: response.data.timezone,
                    isp: response.data.org,
                    org: response.data.org,
                    as: response.data.asn,
                    asn: response.data.asn,
                    lat: response.data.latitude,
                    lon: response.data.longitude,
                    accuracy: 'medium'
                };
            }
            throw new Error('ipapi.co failed');
        } catch (error) {
            throw new Error(`ipapi.co error: ${error.message}`);
        }
    }

    async ipwhoisIo(ip) {
        try {
            const response = await axios.get(`https://ipwhois.app/json/${ip}`, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'IP-Tracker/2.0'
                }
            });

            if (response.data && response.data.latitude && response.data.longitude) {
                return {
                    country: response.data.country,
                    countryCode: response.data.country_code,
                    region: response.data.region,
                    regionCode: response.data.region_code,
                    city: response.data.city,
                    district: response.data.district || 'Unknown',
                    zip: response.data.postal || 'Unknown',
                    timezone: response.data.timezone,
                    isp: response.data.isp,
                    org: response.data.org,
                    as: response.data.as,
                    asn: response.data.asn,
                    lat: response.data.latitude,
                    lon: response.data.longitude,
                    accuracy: 'high'
                };
            }
            throw new Error('ipwhois.io failed');
        } catch (error) {
            throw new Error(`ipwhois.io error: ${error.message}`);
        }
    }

    async ipinfoIo(ip) {
        try {
            const token = process.env.IPINFO_TOKEN;
            const url = token ? `https://ipinfo.io/${ip}/json?token=${token}` : `https://ipinfo.io/${ip}/json`;
            
            const response = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'IP-Tracker/2.0'
                }
            });

            if (response.data && response.data.loc) {
                const [lat, lon] = response.data.loc.split(',').map(Number);
                return {
                    country: response.data.country,
                    countryCode: response.data.country,
                    region: response.data.region,
                    regionCode: response.data.region,
                    city: response.data.city,
                    district: response.data.district,
                    zip: response.data.postal,
                    timezone: response.data.timezone,
                    isp: response.data.org,
                    org: response.data.org,
                    as: response.data.asn,
                    asn: response.data.asn,
                    lat: lat,
                    lon: lon,
                    accuracy: 'medium'
                };
            }
            throw new Error('ipinfo.io failed');
        } catch (error) {
            throw new Error(`ipinfo.io error: ${error.message}`);
        }
    }

    async fallbackGeoip(ip) {
        try {
            const geo = geoip.lookup(ip);
            if (geo) {
                return {
                    country: geo.country,
                    countryCode: geo.country,
                    region: geo.region,
                    regionCode: geo.region,
                    city: geo.city,
                    district: 'Unknown',
                    zip: 'Unknown',
                    timezone: 'UTC',
                    isp: 'Unknown',
                    org: 'Unknown',
                    as: 'Unknown',
                    asn: 'Unknown',
                    lat: geo.ll[0],
                    lon: geo.ll[1],
                    accuracy: 'low'
                };
            }
            throw new Error('geoip-lite failed');
        } catch (error) {
            throw new Error(`geoip-lite error: ${error.message}`);
        }
    }

    // ============================================================================
    // VPN AND PROXY DETECTION
    // ============================================================================
    
    async detectVpnProxy(ip) {
        // Check cache first
        const cacheKey = `vpn_${ip}`;
        const cached = this.rateLimitCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        // Try each service until one works
        for (let i = 0; i < this.vpnDetectionServices.length; i++) {
            try {
                const result = await this.vpnDetectionServices[i](ip);
                if (result) {
                    // Cache the result
                    this.rateLimitCache.set(cacheKey, {
                        data: result,
                        timestamp: Date.now()
                    });
                    
                    logger.logVPNDetection(ip, result);
                    return result;
                }
            } catch (error) {
                logger.warn(`VPN detection service ${i + 1} failed for IP ${ip}:`, error.message);
                if (i === this.vpnDetectionServices.length - 1) {
                    logger.error('All VPN detection services failed for IP:', ip);
                }
            }
        }

        // Return default result if all services fail
        const defaultResult = {
            isVpn: false,
            isProxy: false,
            isTor: false,
            isHosting: false,
            vpnProvider: null,
            proxyType: null,
            proxyLevel: 'transparent'
        };

        // Cache the default result
        this.rateLimitCache.set(cacheKey, {
            data: defaultResult,
            timestamp: Date.now()
        });

        return defaultResult;
    }

    async iphubDetection(ip) {
        try {
            const apiKey = process.env.IPHUB_API_KEY;
            if (!apiKey) {
                throw new Error('IPHub API key not configured');
            }

            const response = await axios.get(`https://v2.api.iphub.info/guest/ip/${ip}`, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'IP-Tracker/2.0',
                    'X-Key': apiKey
                }
            });

            if (response.data && response.data.block !== undefined) {
                const isBlocked = response.data.block === 1;
                return {
                    isVpn: isBlocked,
                    isProxy: isBlocked,
                    isTor: response.data.type === 'tor',
                    isHosting: response.data.type === 'hosting',
                    vpnProvider: isBlocked ? 'Detected by IPHub' : null,
                    proxyType: isBlocked ? 'detected' : null,
                    proxyLevel: isBlocked ? 'anonymous' : 'transparent'
                };
            }
            return null;
        } catch (error) {
            throw new Error(`IPHub detection error: ${error.message}`);
        }
    }

    async ipQualityScoreDetection(ip) {
        try {
            const apiKey = process.env.IPQUALITYSCORE_API_KEY;
            if (!apiKey) {
                throw new Error('IPQualityScore API key not configured');
            }

            const response = await axios.get(`https://ipqualityscore.com/api/json/ip/${apiKey}/${ip}`, {
                timeout: 5000
            });

            if (response.data && response.data.success) {
                return {
                    isVpn: response.data.vpn || response.data.proxy,
                    isProxy: response.data.proxy,
                    isTor: response.data.tor,
                    isHosting: response.data.hosting,
                    vpnProvider: response.data.vpn ? 'Detected by IPQS' : null,
                    proxyType: response.data.proxy ? response.data.proxy_type : null,
                    proxyLevel: response.data.proxy ? 
                        (response.data.proxy_type === 'elite' ? 'elite' : 
                         response.data.proxy_type === 'anonymous' ? 'anonymous' : 'transparent') : 'transparent'
                };
            }
            return null;
        } catch (error) {
            throw new Error(`IPQualityScore detection error: ${error.message}`);
        }
    }

    async heuristicDetection(ip) {
        try {
            // Get ISP info for heuristic analysis
            const locationData = await this.getLocationData(ip);
            const isp = locationData.isp?.toLowerCase() || '';
            const org = locationData.org?.toLowerCase() || '';
            
            // Common VPN/Proxy providers and hosting companies
            const vpnKeywords = [
                'vpn', 'proxy', 'tor', 'nord', 'express', 'surfshark', 
                'cyberghost', 'private internet access', 'pia', 'mullvad',
                'windscribe', 'proton', 'tunnelbear', 'hide.me', 'purevpn',
                'ipvanish', 'hotspot shield', 'zenmate', 'hoxx', 'browsec',
                'torguard', 'airvpn', 'vpn.ac', 'vpnsecure', 'vpnunlimited'
            ];
            
            const hostingKeywords = [
                'amazon', 'aws', 'google', 'cloud', 'digitalocean', 'linode',
                'vultr', 'ovh', 'hetzner', 'contabo', 'hostinger', 'godaddy',
                'bluehost', 'hostgator', 'dreamhost', 'a2 hosting', 'inmotion',
                'liquid web', 'siteground', 'wp engine', 'kinsta', 'flywheel'
            ];

            const isVpn = vpnKeywords.some(keyword => 
                isp.includes(keyword) || org.includes(keyword)
            );
            
            const isHosting = hostingKeywords.some(keyword => 
                isp.includes(keyword) || org.includes(keyword)
            );

            return {
                isVpn,
                isProxy: isVpn,
                isTor: false, // Can't detect TOR from ISP alone
                isHosting,
                vpnProvider: isVpn ? 'Detected by ISP analysis' : null,
                proxyType: isVpn ? 'detected' : null,
                proxyLevel: isVpn ? 'anonymous' : 'transparent'
            };
        } catch (error) {
            throw new Error(`Heuristic detection error: ${error.message}`);
        }
    }

    // ============================================================================
    // DEVICE FINGERPRINTING
    // ============================================================================
    
    generateDeviceFingerprint(data) {
        try {
            const fingerprint = {
                screen: `${data.screenResolution || 'unknown'}_${data.colorDepth || 'unknown'}`,
                platform: data.platform || 'unknown',
                language: data.language || 'unknown',
                timezone: data.timezone || 'unknown',
                hardware: `${data.hardwareConcurrency || 'unknown'}_${data.maxTouchPoints || 'unknown'}`,
                cookies: data.cookieEnabled ? 'enabled' : 'disabled',
                doNotTrack: data.doNotTrack ? 'enabled' : 'disabled',
                online: data.online ? 'online' : 'offline'
            };

            // Create a hash-like string from the fingerprint
            const fingerprintString = Object.values(fingerprint).join('|');
            return this.hashString(fingerprintString);
        } catch (error) {
            logger.error('Error generating device fingerprint:', error);
            return 'unknown';
        }
    }

    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash.toString();
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash).toString(36);
    }

    // ============================================================================
    // BOT DETECTION
    // ============================================================================
    
    detectBot(userAgent, behavior = {}) {
        try {
            const ua = new UAParser(userAgent);
            const result = ua.getResult();
            
            let botScore = 0;
            let botType = null;
            let botConfidence = 0;

            // Check for known bot patterns in User-Agent
            const botPatterns = [
                /bot/i, /crawler/i, /spider/i, /scraper/i, /crawling/i,
                /headless/i, /phantom/i, /selenium/i, /webdriver/i,
                /chrome-lighthouse/i, /gtmetrix/i, /pagespeed/i,
                /pingdom/i, /uptimerobot/i, /monitor/i, /checker/i
            ];

            const isKnownBot = botPatterns.some(pattern => pattern.test(userAgent));
            if (isKnownBot) {
                botScore += 80;
                botType = 'known_bot';
            }

            // Check for headless browser indicators
            if (userAgent.includes('Headless') || userAgent.includes('headless')) {
                botScore += 60;
                botType = 'headless_browser';
            }

            // Check for automation tools
            if (userAgent.includes('Selenium') || userAgent.includes('WebDriver')) {
                botScore += 70;
                botType = 'automation_tool';
            }

            // Check for suspicious behavior patterns
            if (behavior.mouseMovements === 0 && behavior.clicks === 0) {
                botScore += 30;
            }

            if (behavior.pageLoadTime < 100) { // Suspiciously fast
                botScore += 20;
            }

            if (behavior.timeOnPage < 2) { // Very short time on page
                botScore += 25;
            }

            // Calculate confidence
            botConfidence = Math.min(100, botScore);

            return {
                isBot: botConfidence > 50,
                botType: botType || 'unknown',
                botConfidence
            };
        } catch (error) {
            logger.error('Error in bot detection:', error);
            return {
                isBot: false,
                botType: 'unknown',
                botConfidence: 0
            };
        }
    }

    // ============================================================================
    // FRAUD SCORING
    // ============================================================================
    
    calculateFraudScore(visitData) {
        let score = 0;
        const riskFactors = [];

        // VPN/Proxy detection
        if (visitData.isVpn) {
            score += 30;
            riskFactors.push({
                factor: 'VPN Detection',
                score: 30,
                description: 'IP address detected as VPN'
            });
        }

        if (visitData.isProxy) {
            score += 25;
            riskFactors.push({
                factor: 'Proxy Detection',
                score: 25,
                description: 'IP address detected as proxy'
            });
        }

        if (visitData.isTor) {
            score += 40;
            riskFactors.push({
                factor: 'TOR Network',
                score: 40,
                description: 'IP address detected as TOR exit node'
            });
        }

        if (visitData.isHosting) {
            score += 15;
            riskFactors.push({
                factor: 'Hosting Provider',
                score: 15,
                description: 'IP address from hosting/datacenter'
            });
        }

        // Bot detection
        if (visitData.isBot) {
            score += 35;
            riskFactors.push({
                factor: 'Bot Detection',
                score: 35,
                description: `Bot detected with ${visitData.botConfidence}% confidence`
            });
        }

        // Suspicious behavior
        if (visitData.suspiciousActivity && visitData.suspiciousActivity.length > 0) {
            const activityScore = visitData.suspiciousActivity.length * 10;
            score += activityScore;
            riskFactors.push({
                factor: 'Suspicious Activity',
                score: activityScore,
                description: `${visitData.suspiciousActivity.length} suspicious activities detected`
            });
        }

        // Multiple visits from same IP in short time
        if (visitData.visitFrequency && visitData.visitFrequency > 10) {
            const frequencyScore = Math.min(20, visitData.visitFrequency * 2);
            score += frequencyScore;
            riskFactors.push({
                factor: 'High Visit Frequency',
                score: frequencyScore,
                description: `${visitData.visitFrequency} visits in short time period`
            });
        }

        // Geographic anomalies
        if (visitData.geographicAnomaly) {
            score += 20;
            riskFactors.push({
                factor: 'Geographic Anomaly',
                score: 20,
                description: 'Unusual geographic location pattern'
            });
        }

        // Device fingerprint anomalies
        if (visitData.deviceFingerprintAnomaly) {
            score += 15;
            riskFactors.push({
                factor: 'Device Fingerprint Anomaly',
                score: 15,
                description: 'Unusual device fingerprint pattern'
            });
        }

        return {
            fraudScore: Math.min(100, score),
            riskFactors
        };
    }

    // ============================================================================
    // RATE LIMITING AND CACHING
    // ============================================================================
    
    isRateLimited(ip, endpoint) {
        const key = `${endpoint}_${ip}`;
        const now = Date.now();
        
        if (!this.rateLimitCache.has(key)) {
            this.rateLimitCache.set(key, {
                count: 1,
                firstRequest: now,
                lastRequest: now
            });
            return false;
        }

        const record = this.rateLimitCache.get(key);
        const timeWindow = 60 * 1000; // 1 minute
        
        if (now - record.firstRequest > timeWindow) {
            // Reset counter for new time window
            this.rateLimitCache.set(key, {
                count: 1,
                firstRequest: now,
                lastRequest: now
            });
            return false;
        }

        // Check rate limit (100 requests per minute)
        if (record.count >= 100) {
            return true;
        }

        // Update counter
        record.count++;
        record.lastRequest = now;
        return false;
    }

    // Clean up old cache entries
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.rateLimitCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.rateLimitCache.delete(key);
            }
        }
    }
}

// Clean up cache every 10 minutes
setInterval(() => {
    const service = new IPTrackingService();
    service.cleanupCache();
}, 10 * 60 * 1000);

module.exports = IPTrackingService;
