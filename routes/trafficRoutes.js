const express = require("express");
const { ipTracking, getReport, getLast24Hours, getIpLocationData } = require("../controllers/ipTracking");
const router = express.Router();

router.get("/track", ipTracking);

router.get("/report", getReport);

// New route for last 24 hours data
router.get("/last24hours", getLast24Hours);

// New route for IP location data
router.get("/location/:ip", getIpLocationData);

module.exports = router;
