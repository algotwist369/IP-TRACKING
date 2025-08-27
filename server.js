const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { MONGO_URI, PORT } = require("./config");

const trafficRoutes = require("./routes/trafficRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());

// Pass io to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

app.use("/", trafficRoutes);

// MongoDB connect
if (mongoose.connect(MONGO_URI)) {
    console.log("Connected to MongoDB");
} else {
    console.log("Failed to connect to MongoDB");
}

server.listen(PORT, () =>
    console.log(`Backend running at http://localhost:${PORT}`)
);
