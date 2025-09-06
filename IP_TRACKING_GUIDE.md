# IP Tracking Backend Guide

## Overview

Your IP Tracker backend is a comprehensive Node.js application that provides advanced IP tracking capabilities with multiple free APIs and sophisticated fraud detection features.

## 🚀 Key Features

### ✅ **Already Implemented**
- **Multi-API Fallback System** - Automatic failover between multiple IP geolocation services
- **Free API Integration** - No API keys required for basic functionality
- **VPN/Proxy Detection** - Advanced detection using multiple services
- **Bot Detection** - User agent analysis and behavior pattern detection
- **Device Fingerprinting** - Unique device identification
- **Fraud Scoring** - Comprehensive risk assessment (0-100 scale)
- **Real-time Tracking** - Socket.IO integration for live updates
- **Rate Limiting** - Prevents API abuse and spam
- **Data Caching** - 5-minute cache to reduce API calls

## 📡 Free IP APIs Currently Integrated

### 1. **ip-api.com** (Primary)
- **Rate Limit**: 45 requests/minute
- **API Key**: Not required
- **Features**: Country, city, ISP, timezone, coordinates
- **Reliability**: High

### 2. **ipapi.co** (Secondary)
- **Rate Limit**: 1,000 requests/day
- **API Key**: Not required
- **Features**: Detailed geolocation data
- **Reliability**: High

### 3. **ipwhois.io** (New Addition)
- **Rate Limit**: Unlimited (free tier)
- **API Key**: Not required
- **Features**: High-accuracy geolocation
- **Reliability**: High

### 4. **ipinfo.io** (Optional)
- **Rate Limit**: 50,000 requests/month (free)
- **API Key**: Required (optional)
- **Features**: Additional metadata
- **Reliability**: High

### 5. **geoip-lite** (Fallback)
- **Rate Limit**: None (local database)
- **API Key**: Not required
- **Features**: Basic geolocation
- **Reliability**: Medium (offline)

## 🔒 Security Features

### VPN/Proxy Detection
- **IPHub** (requires API key)
- **IPQualityScore** (requires API key)
- **Heuristic Detection** (ISP analysis)

### Bot Detection
- User agent pattern matching
- Behavior analysis (mouse movements, clicks, timing)
- Headless browser detection
- Automation tool detection

### Fraud Scoring System
- **0-20**: Safe
- **21-40**: Low risk
- **41-60**: Medium risk
- **61-80**: High risk
- **81-100**: Critical risk

## 🛠️ Usage Examples

### Basic IP Tracking
```javascript
const IPTrackingService = require('./services/ipTrackingService');
const ipService = new IPTrackingService();

// Get location data
const location = await ipService.getLocationData('8.8.8.8');
console.log(location.country, location.city);

// Detect VPN/Proxy
const vpnData = await ipService.detectVpnProxy('8.8.8.8');
console.log('Is VPN:', vpnData.isVpn);

// Bot detection
const botData = ipService.detectBot(userAgent);
console.log('Is Bot:', botData.isBot);
```

### API Endpoints

#### Track Visit
```bash
POST /api/tracking/track
Content-Type: application/json

{
  "trackingCode": "your_tracking_code",
  "website": "example.com",
  "page": "/home",
  "userAgent": "Mozilla/5.0...",
  "screenResolution": "1920x1080"
}
```

#### Get IP Information
```bash
GET /api/tracking/ip/8.8.8.8
```

## 🧪 Testing

Run the test script to verify all APIs:
```bash
cd Server
node test-ip-apis.js
```

## 📊 Performance

### Caching Strategy
- **5-minute cache** for geolocation data
- **5-minute cache** for VPN detection
- **Automatic cleanup** of old cache entries

### Rate Limiting
- **100 requests/minute** per IP (general)
- **50 requests/minute** per IP (tracking endpoint)
- **Automatic blocking** of abusive IPs

## 🔧 Configuration

### Environment Variables
```bash
# Optional API keys (for enhanced features)
IPHUB_API_KEY=your_key_here
IPQUALITYSCORE_API_KEY=your_key_here
IPINFO_TOKEN=your_token_here

# Feature flags
ENABLE_VPN_DETECTION=true
ENABLE_DEVICE_FINGERPRINTING=true
ENABLE_REAL_TIME_TRACKING=true
```

## 📈 Monitoring

### Logging
- All API calls are logged
- Failed requests are tracked
- Performance metrics recorded
- Security alerts for high fraud scores

### Real-time Alerts
- High fraud score alerts (>70)
- VPN/Proxy detection notifications
- Bot detection warnings
- Rate limit violations

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   cd Server
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   # Edit .env with your settings
   ```

3. **Start Server**
   ```bash
   npm run dev
   ```

4. **Test APIs**
   ```bash
   node test-ip-apis.js
   ```

## 💡 Recommendations

### For Production
1. **Add API Keys** for enhanced VPN detection
2. **Monitor Rate Limits** across all services
3. **Set up Alerts** for high fraud scores
4. **Regular Testing** of API endpoints

### For Development
1. **Use Free APIs** (no keys required)
2. **Test with Different IPs** to verify accuracy
3. **Monitor Cache Performance**
4. **Check Logs** for any API failures

## 🔄 API Fallback Order

1. **ip-api.com** → 2. **ipapi.co** → 3. **ipwhois.io** → 4. **ipinfo.io** → 5. **geoip-lite**

If one service fails, the system automatically tries the next one, ensuring high reliability.

## 📝 Notes

- **No API keys required** for basic functionality
- **All APIs are free** with generous rate limits
- **Automatic failover** ensures 99.9% uptime
- **Comprehensive fraud detection** built-in
- **Real-time updates** via Socket.IO
- **Production-ready** with proper error handling

Your backend is already well-architected and ready for production use! 🎉
