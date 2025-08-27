const express = require("express");
const Traffic = require("../models/Traffic");
const router = express.Router();

router.get("/track", async (req, res) => {
    try {
        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
        const userAgent = req.headers["user-agent"] || "";
        const url = req.headers.referer || "";

        const entry = await Traffic.create({ ip, userAgent, url });

        // Send live update via socket
        req.io.emit("new-visit", {
            ip,
            userAgent,
            url,
            time: entry.createdAt,
        });

        res.json({ status: "ok" });
    } catch (err) {
        res.status(500).json({ error: "logging failed" });
    }
});

router.get("/report", async (req, res) => {
    try {
        const suspicious = await Traffic.aggregate([
            {
                $group: {
                    _id: "$ip",
                    hits: { $sum: 1 },
                    lastHit: { $max: "$createdAt" },
                },
            },
            { $match: { hits: { $gt: 20 } } },
            { $sort: { hits: -1 } },
        ]);
        res.json(suspicious);
    } catch (err) {
        res.status(500).json({ error: "report failed" });
    }
});

module.exports = router;
