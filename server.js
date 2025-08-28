
const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MONGO_URI, PORT = 5000 } = require("./config");

const trafficRoutes = require("./routes/trafficRoutes");

const app = express();
const server = http.createServer(app);

// CORS config to allow all origins + credentials
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

// Apply CORS and middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Socket.IO with optimized CORS config and performance settings
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            callback(null, origin || "*");
        },
        credentials: true,
        methods: ["GET", "POST"],
    },
    // Performance optimizations
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    // Memory optimizations
    maxHttpBufferSize: 1e6, // 1MB
    // Connection optimizations
    connectTimeout: 45000,
    // Enable compression
    perMessageDeflate: {
        threshold: 32768,
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        zlibDeflateOptions: {
            level: 6
        }
    }
});

// Make io available in routes via middleware
app.use((req, res, next) => {
    req.io = io;
    next();
});

// API routes
app.use("/", trafficRoutes);

// MongoDB connection
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((error) => {
        console.error("Failed to connect to MongoDB:", error);
    });

// Socket.IO event handling with performance optimizations
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    
    // Join admin room for real-time updates
    socket.join('admin-dashboard');

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });

    // Handle admin dashboard requests
    socket.on("request-live-data", async () => {
        try {
            // Send current visitor count
            const visitorCount = io.engine.clientsCount;
            socket.emit("live-stats", { 
                visitorCount,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error("Error sending live stats:", error);
        }
    });

    // Handle ping/pong for connection health
    socket.on("ping", () => {
        socket.emit("pong", { timestamp: Date.now() });
    });

    // Example event
    socket.on("exampleEvent", (data) => {
        console.log("Received exampleEvent:", data);
        // Example: broadcast it
        io.emit("exampleEventResponse", { message: "Received your event!" });
    });
});

// Broadcast system stats every 30 seconds
setInterval(() => {
    const stats = {
        visitorCount: io.engine.clientsCount,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    };
    io.to('admin-dashboard').emit("system-stats", stats);
}, 30000);

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.stack || err.message);
    res.status(500).json({ error: "Something went wrong!" });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
