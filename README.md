# 🚀 IP Tracker Server - Advanced Visitor Tracking & Fraud Detection

A comprehensive IP tracking and fraud detection system designed to protect your websites from fraudulent traffic and provide detailed visitor analytics.

## ✨ Features

### 🔍 **Advanced IP Tracking**
- Real-time IP address detection (handles proxies, load balancers, CDNs)
- Multi-service geolocation with fallback options
- IPv4 and IPv6 support
- Accurate city, region, country, and ISP detection

### 🛡️ **Fraud Detection & Security**
- VPN and proxy detection using multiple services
- TOR network detection
- Bot detection with behavioral analysis
- Device fingerprinting and anomaly detection
- Fraud scoring system (0-100 scale)
- Suspicious activity monitoring

### 📱 **Device & Browser Intelligence**
- Comprehensive device fingerprinting
- Browser and OS detection
- Screen resolution and hardware capabilities
- Network connection analysis
- Canvas and WebGL fingerprinting
- Font detection and audio fingerprinting

### 📊 **Behavioral Analytics**
- Mouse movement tracking
- Click and interaction monitoring
- Scroll depth analysis
- Time on page metrics
- Form interaction tracking
- Session duration monitoring

### 🌍 **Real-time Dashboard**
- Interactive world map with visitor locations
- Real-time visitor monitoring via Socket.IO
- VPN and proxy alerts
- Multi-website analytics
- Comprehensive reporting and statistics

### 🔐 **Authentication & Security**
- JWT-based authentication
- Role-based access control (User, Admin, Premium)
- Rate limiting and DDoS protection
- Helmet security headers
- CORS protection
- Input validation and sanitization

### 💳 **Payment Integration**
- Stripe payment processing
- Subscription management
- Usage-based billing
- Multiple plan tiers (Free, Basic, Premium, Enterprise)

## 🏗️ Architecture

```
Server/
├── config/          # Database and configuration
├── controllers/     # Business logic handlers
├── middleware/      # Authentication, validation, security
├── models/          # MongoDB schemas
├── routes/          # API endpoints
├── services/        # Core business services
├── utils/           # Utilities and helpers
├── public/          # Static files (tracking script)
└── logs/            # Application logs
```

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- npm or yarn

### 2. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd IP-Tracker/Server

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit environment variables
nano .env
```

### 3. Environment Configuration

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/ip-tracker

# JWT Secrets
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-refresh-secret-key-here

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key

# Email (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# API Keys (optional, for enhanced detection)
IPHUB_API_KEY=your_iphub_api_key
IPQUALITYSCORE_API_KEY=your_ipqualityscore_api_key
IPINFO_TOKEN=your_ipinfo_token
```

### 4. Database Setup

```bash
# Start MongoDB
mongod

# The application will automatically create collections and indexes
```

### 5. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 📱 Website Integration

### 1. Basic Implementation

Add this to your HTML `<head>` section:

```html
<!-- IP Tracker Configuration -->
<script>
    window.IPTrackerConfig = {
        trackingCode: 'ip_your_user_id_timestamp_random',
        website: 'yourdomain.com',
        enableRealTime: true,
        enableVPNDetection: true,
        enableDeviceFingerprinting: true,
        enableBehavioralTracking: true,
        privacyMode: 'standard'
    };
</script>

<!-- IP Tracker Script -->
<script src="https://yourdomain.com/tracking-script.js"></script>
```

### 2. Advanced Usage

```javascript
// Track custom events
IPTracker.trackEvent('button_click', { 
    buttonId: 'signup', 
    page: 'homepage' 
});

// Get current tracking data
const data = IPTracker.getData();

// Manual tracking
IPTracker.track({ customField: 'customValue' });
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - User logout

### Tracking
- `POST /api/tracking/track` - Track visitor data
- `GET /api/tracking/ip/:ip` - Get IP information

### Dashboard
- `GET /api/dashboard` - Get dashboard data
- `GET /api/dashboard/website/:domain` - Get website-specific data
- `GET /api/dashboard/ip-stats-map` - Get IP statistics for map
- `GET /api/dashboard/ip-analytics` - Get detailed IP analytics
- `GET /api/dashboard/vpn-stats` - Get VPN and proxy statistics

### Websites
- `GET /api/websites` - Get user's websites
- `POST /api/websites` - Add new website
- `PUT /api/websites/:id` - Update website
- `DELETE /api/websites/:id` - Delete website

### Payments
- `POST /api/payments/create-subscription` - Create subscription
- `POST /api/payments/cancel-subscription` - Cancel subscription
- `GET /api/payments/invoices` - Get invoices

## 🛡️ Security Features

### Rate Limiting
- General API: 100 requests per 15 minutes
- Tracking endpoint: 50 requests per minute
- Configurable limits per endpoint

### Input Validation
- Request body validation
- SQL injection prevention
- XSS protection
- CSRF protection

### Authentication
- JWT tokens with refresh mechanism
- Password hashing with bcrypt
- Session management
- Role-based access control

## 📊 Dashboard Features

### Real-time Monitoring
- Live visitor tracking
- Instant VPN/proxy alerts
- Real-time map updates
- Live session monitoring

### Analytics & Reports
- Visitor demographics
- Geographic distribution
- Device and browser statistics
- Traffic patterns and trends
- Fraud detection reports

### Multi-website Support
- Manage multiple domains
- Cross-website analytics
- Individual website insights
- Consolidated reporting

## 🔧 Configuration Options

### Privacy Modes
- **minimal**: Basic IP tracking only
- **standard**: Standard tracking with device fingerprinting
- **enhanced**: Full tracking with behavioral analysis

### Feature Flags
```bash
ENABLE_VPN_DETECTION=true
ENABLE_DEVICE_FINGERPRINTING=true
ENABLE_REAL_TIME_TRACKING=true
ENABLE_PAYMENT_INTEGRATION=true
```

### Rate Limiting
```bash
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📈 Performance Optimization

### Caching
- IP geolocation caching (5 minutes)
- VPN detection caching (5 minutes)
- Rate limiting cache
- MongoDB query optimization

### Database Indexes
- IP address indexing
- Timestamp indexing
- Tracking code indexing
- Website domain indexing

### Compression
- Gzip compression enabled
- JSON payload optimization
- Efficient data structures

## 🚨 Monitoring & Logging

### Log Levels
- **error**: Application errors and exceptions
- **warn**: Warning messages and security alerts
- **info**: General information and tracking events
- **debug**: Detailed debugging information

### Log Files
- `app.log` - General application logs
- `error.log` - Error and exception logs
- `ip-tracking.log` - IP tracking specific logs
- `exceptions.log` - Uncaught exceptions
- `rejections.log` - Unhandled promise rejections

### Health Checks
- `/health` endpoint for monitoring
- Database connection status
- Service availability checks
- Performance metrics

## 🔄 Deployment

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure production MongoDB
- [ ] Set strong JWT secrets
- [ ] Configure SSL/TLS
- [ ] Set up monitoring and logging
- [ ] Configure backup strategies
- [ ] Set up CI/CD pipeline

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

### Environment Variables
```bash
# Production settings
NODE_ENV=production
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/ip-tracker
JWT_SECRET=very-long-random-secret-key
CORS_ORIGIN=https://yourdomain.com
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "IP Tracking"
```

### Test Coverage
- Unit tests for services
- Integration tests for API endpoints
- Authentication tests
- Rate limiting tests
- Security tests

## 📚 API Documentation

### Request Headers
```http
Content-Type: application/json
Authorization: Bearer <jwt_token>
X-Tracking-Code: <tracking_code>
X-Website-Domain: <domain>
```

### Response Format
```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Handling
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Documentation
- [API Reference](./docs/api.md)
- [Configuration Guide](./docs/configuration.md)
- [Deployment Guide](./docs/deployment.md)
- [Troubleshooting](./docs/troubleshooting.md)

### Contact
- **Email**: support@yourdomain.com
- **Issues**: GitHub Issues
- **Discord**: [Join our community](https://discord.gg/iptracker)

### Common Issues
- **MongoDB connection failed**: Check connection string and network
- **JWT errors**: Verify JWT secrets and token expiration
- **Rate limiting**: Check rate limit configuration
- **CORS errors**: Verify CORS origin settings

---

**Built with ❤️ for protecting websites from fraud and providing valuable visitor insights.**
