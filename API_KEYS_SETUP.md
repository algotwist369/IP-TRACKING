# API Keys Setup Guide

This guide will help you set up API keys for enhanced IP tracking features. While the system works without API keys, adding them will significantly improve accuracy and provide more detailed information.

## Required Environment Variables

Create a `.env` file in the Server directory with the following variables:

```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/ip-tracker
DB_NAME=ip-tracker

# Server Configuration
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-here

# Geolocation API Keys (Optional - for better accuracy)
IPINFO_TOKEN=your-ipinfo-token-here
IPHUB_API_KEY=your-iphub-api-key-here
IPQUALITYSCORE_API_KEY=your-ipqualityscore-api-key-here

# Email Configuration (for notifications)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Payment Configuration (if using paid features)
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key

# Security Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://localhost:3000

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Tracking Configuration
TRACKING_ENDPOINT=https://track.d0s369.co.in/api/tracking/track
HEARTBEAT_INTERVAL=30000
SESSION_TIMEOUT=1800000
```

## Free API Keys Setup

### 1. IPInfo.io (Geolocation)
- **Website**: https://ipinfo.io/
- **Free Tier**: 50,000 requests/month
- **Setup**:
  1. Sign up at https://ipinfo.io/signup
  2. Get your token from the dashboard
  3. Add `IPINFO_TOKEN=your_token_here` to your `.env` file

### 2. IPHub (VPN/Proxy Detection)
- **Website**: https://iphub.info/
- **Free Tier**: 1,000 requests/day
- **Setup**:
  1. Sign up at https://iphub.info/
  2. Get your API key from the dashboard
  3. Add `IPHUB_API_KEY=your_api_key_here` to your `.env` file

### 3. IPQualityScore (Advanced Detection)
- **Website**: https://www.ipqualityscore.com/
- **Free Tier**: 5,000 requests/month
- **Setup**:
  1. Sign up at https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-detection-api
  2. Get your API key from the dashboard
  3. Add `IPQUALITYSCORE_API_KEY=your_api_key_here` to your `.env` file

## Features Enhanced by API Keys

### Without API Keys (Default)
- ✅ Basic IP geolocation (using free services)
- ✅ Heuristic VPN/Proxy detection
- ✅ Device fingerprinting
- ✅ Browser/OS detection
- ✅ Behavioral tracking
- ✅ Bot detection

### With API Keys (Enhanced)
- ✅ **High-accuracy geolocation** (IPInfo.io)
- ✅ **Advanced VPN/Proxy detection** (IPHub, IPQualityScore)
- ✅ **Real-time threat intelligence**
- ✅ **Detailed ISP information**
- ✅ **Fraud scoring**
- ✅ **Risk assessment**

## Testing Your Setup

1. **Start the server**:
   ```bash
   cd Server
   npm start
   ```

2. **Test tracking**:
   ```bash
   curl -X POST http://localhost:3000/api/tracking/track \
     -H "Content-Type: application/json" \
     -d '{
       "trackingCode": "64SZIV5QX7U53LBD",
       "website": "spaadvisor.in",
       "domain": "spaadvisor.in"
     }'
   ```

3. **Check logs** for API key status:
   ```bash
   tail -f logs/app.log
   ```

## Troubleshooting

### Common Issues

1. **"API key not configured" warnings**:
   - This is normal if you haven't set up API keys
   - The system will fall back to free services

2. **Rate limit exceeded**:
   - Free tiers have daily/monthly limits
   - Consider upgrading to paid plans for production use

3. **Geolocation returning "Unknown"**:
   - Check your internet connection
   - Verify API keys are correct
   - Check if you've exceeded rate limits

### Performance Tips

1. **Use caching**: The system caches results for 5 minutes
2. **Monitor usage**: Check API usage in your service dashboards
3. **Fallback services**: Multiple services ensure reliability
4. **Rate limiting**: Built-in rate limiting prevents abuse

## Production Recommendations

For production use, consider:

1. **Paid API plans** for higher limits and better accuracy
2. **Multiple API keys** for redundancy
3. **Monitoring** API usage and costs
4. **Caching** to reduce API calls
5. **Load balancing** across multiple services

## Support

If you need help setting up API keys or have questions about the tracking system, please check the logs or contact support.
