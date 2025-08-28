const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MONGO_URI, PORT } = require("./config");

const trafficRoutes = require("./routes/trafficRoutes");

const app = express();

const allowedOrigins = [
    "*",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://track.algotwist.in",
    "https://track.algotwist.in",
];

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins } });

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Pass io to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use("/", trafficRoutes);

// MongoDB connect
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("Connected to MongoDB");
    })
    .catch((error) => {
        console.error("Failed to connect to MongoDB:", error);
    });

server.listen(PORT, () =>
    console.log(`Backend running at http://localhost:${PORT}`)
);
