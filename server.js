require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import configurations and services
const connectDB = require('./config/database');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const testAuthRoutes = require('./routes/test-auth');
const testDashboardRoutes = require('./routes/test-dashboard');
const trackingRoutes = require('./routes/tracking');
const dashboardRoutes = require('./routes/dashboard');
const websiteRoutes = require('./routes/websites');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');

// Import middleware
const { authenticateToken } = require('./middleware/auth');
const { validateTrackingData } = require('./middleware/validation');

const app = express();
const server = http.createServer(app);

// ============================================================================
// SOCKET.IO CONFIGURATION
// ============================================================================

const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000", "http://localhost:5173"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    logger.info('Dashboard connected:', socket.id);

    // Join user to their specific room for real-time updates
    socket.on('joinUserRoom', (userId) => {
        socket.join(`user_${userId}`);
        logger.info(`User ${userId} joined their room`);
    });

    // Join website-specific room
    socket.on('joinWebsiteRoom', (trackingCode) => {
        socket.join(`website_${trackingCode}`);
        logger.info(`Socket joined website room: ${trackingCode}`);
    });

    socket.on('disconnect', () => {
        logger.info('Dashboard disconnected:', socket.id);
    });
});

// Make io available to routes
app.set('io', io);

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000"];
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow all origins for tracking scripts (public tracking)
        // This is necessary for the tracking script to work on any website
        callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
        "X-User-Agent",
        "X-Tracking-Code",
        "X-Website-Domain"
    ]
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.',
            retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
        });
    }
});

// Apply rate limiting to all routes
app.use(limiter);

// Stricter rate limiting for tracking endpoint
const trackingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 1 minute
    max: 500, // limit each IP to 50 tracking requests per minute
    message: {
        error: 'Too many tracking requests from this IP, please try again later.',
        retryAfter: 60 
    },
    handler: (req, res) => {
        logger.warn(`Tracking rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            message: 'Too many tracking requests from this IP, please try again later.',
            retryAfter: 60
        });
    }
});

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ 
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ 
                success: false, 
                message: 'Invalid JSON payload' 
            });
            throw new Error('Invalid JSON');
        }
    }
}));

app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb' 
}));

// Request logging middleware
app.use(logger.logRequest);

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// ROUTES
// ============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'IP Tracker Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Tracking script endpoint with custom CORS
app.get('/tracking-script.js', cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
}), (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    const fs = require('fs');
    const path = require('path');
    const scriptPath = path.join(__dirname, 'public', 'tracking-script.js');
    
    try {
        const script = fs.readFileSync(scriptPath, 'utf8');
        res.send(script);
    } catch (error) {
        logger.error('Error serving tracking script:', error);
        res.status(404).send('// Tracking script not found');
    }
});

// OPTIONS handler for tracking script (CORS preflight)
app.options('/tracking-script.js', cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false
}), (req, res) => {
    res.status(200).end();
});

// API routes
app.use('/api/test-auth', testAuthRoutes); // Test routes for development
app.use('/api/test-dashboard', testDashboardRoutes); // Test dashboard routes
app.use('/api/auth', authRoutes);
app.use('/api/tracking', trackingLimiter, trackingRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/websites', authenticateToken, websiteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// 404 handler
app.use('*', (req, res) => {
    logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Global error handler
app.use((error, req, res, next) => {
    logger.error('Global error handler:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(error.status || 500).json({
        success: false,
        message: isDevelopment ? error.message : 'Internal server error',
        ...(isDevelopment && { stack: error.stack })
    });
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    try {
        // Close HTTP server
        server.close(() => {
            logger.info('HTTP server closed');
        });

        // Close Socket.IO
        io.close(() => {
            logger.info('Socket.IO server closed');
        });

        // Close MongoDB connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();
        
        // Start server
        server.listen(PORT, () => {
            logger.info(`🚀 IP Tracker Server running on port ${PORT}`);
            logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`🔒 Security: Helmet, CORS, Rate Limiting enabled`);
            logger.info(`📡 Socket.IO: Real-time tracking enabled`);
            logger.info(`🗄️  Database: MongoDB connected`);
            
            // Log feature flags
            logger.info(`🎯 Features: VPN Detection: ${process.env.ENABLE_VPN_DETECTION === 'true' ? 'ON' : 'OFF'}`);
            logger.info(`🎯 Features: Device Fingerprinting: ${process.env.ENABLE_DEVICE_FINGERPRINTING === 'true' ? 'ON' : 'OFF'}`);
            logger.info(`🎯 Features: Real-time Tracking: ${process.env.ENABLE_REAL_TIME_TRACKING === 'true' ? 'ON' : 'OFF'}`);
            logger.info(`🎯 Features: Payment Integration: ${process.env.ENABLE_PAYMENT_INTEGRATION === 'true' ? 'ON' : 'OFF'}`);
        });
        
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer();

module.exports = { app, server, io };
