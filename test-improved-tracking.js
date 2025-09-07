#!/usr/bin/env node

/**
 * Test script for improved IP tracking
 * This script tests the enhanced tracking features
 */

const axios = require('axios');
const IPTrackingService = require('./services/ipTrackingService');

const BASE_URL = 'http://localhost:3000';
const TRACKING_CODE = '64SZIV5QX7U53LBD';
const WEBSITE = 'spaadvisor.in';

async function testTracking() {
    console.log('🚀 Testing Improved IP Tracking System\n');
    
    try {
        // Test 1: Basic tracking
        console.log('📊 Test 1: Basic Tracking');
        const trackingData = {
            trackingCode: TRACKING_CODE,
            website: WEBSITE,
            domain: WEBSITE,
            page: '/test-page',
            referer: 'https://google.com',
            url: `https://${WEBSITE}/test-page`,
            title: 'Test Page - Improved Tracking',
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            browser: {
                name: 'Chrome',
                version: '120.0.0.0',
                engine: 'Blink',
                engineVersion: '120.0.0.0'
            },
            os: {
                name: 'Linux',
                version: 'Ubuntu',
                platform: 'Linux x86_64'
            },
            device: {
                type: 'desktop',
                model: 'unknown',
                vendor: 'unknown'
            },
            screenResolution: '1920x1080',
            colorDepth: 24,
            pixelRatio: 1,
            viewport: {
                width: 1920,
                height: 937
            },
            platform: 'Linux x86_64',
            language: 'en-US',
            languages: ['en-US', 'en'],
            timezone: 'America/New_York',
            hardwareConcurrency: 8,
            maxTouchPoints: 0,
            cookieEnabled: true,
            doNotTrack: '1',
            online: true,
            connectionType: 'ethernet',
            effectiveType: '4g',
            downlink: 10,
            rtt: 50,
            mouseMovements: 15,
            clicks: 3,
            scrollDepth: 75,
            timeOnPage: 30000,
            pageLoadTime: 1200,
            interactions: [
                { type: 'click', timestamp: Date.now() - 10000, target: 'BUTTON' },
                { type: 'scroll', timestamp: Date.now() - 5000, target: 'BODY' }
            ],
            utmSource: 'google',
            utmMedium: 'cpc',
            utmCampaign: 'test-campaign',
            utmTerm: 'ip tracking',
            utmContent: 'test-content',
            customParams: {
                test_param: 'test_value'
            },
            type: 'page_visit'
        };

        const response = await axios.post(`${BASE_URL}/api/tracking/track`, trackingData, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log('✅ Tracking successful!');
        console.log('📈 Response:', JSON.stringify(response.data, null, 2));
        console.log('');

        // Test 2: IP Information endpoint
        console.log('🌍 Test 2: IP Information');
        const ipResponse = await axios.get(`${BASE_URL}/api/tracking/ip/8.8.8.8`);
        console.log('✅ IP lookup successful!');
        console.log('📍 IP Data:', JSON.stringify(ipResponse.data, null, 2));
        console.log('');

        // Test 3: Health check
        console.log('🏥 Test 3: Health Check');
        const healthResponse = await axios.get(`${BASE_URL}/api/tracking/health`);
        console.log('✅ Health check successful!');
        console.log('💚 Status:', JSON.stringify(healthResponse.data, null, 2));
        console.log('');

        // Test 4: Test IP tracking service directly
        console.log('🔧 Test 4: IP Tracking Service');
        const ipService = new IPTrackingService();
        
        // Test IP detection
        const mockReq = {
            headers: {
                'x-forwarded-for': '8.8.8.8',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            connection: { remoteAddress: '127.0.0.1' }
        };
        
        const detectedIP = ipService.getRealIP(mockReq);
        console.log('🔍 Detected IP:', detectedIP);
        
        // Test user agent parsing
        const userAgentData = ipService.parseUserAgent(mockReq.headers['user-agent']);
        console.log('🖥️  User Agent Data:', JSON.stringify(userAgentData, null, 2));
        
        // Test device fingerprinting
        const deviceInfo = {
            screenResolution: '1920x1080',
            colorDepth: 24,
            platform: 'Linux x86_64',
            language: 'en-US',
            timezone: 'America/New_York',
            hardwareConcurrency: 8,
            maxTouchPoints: 0,
            cookieEnabled: true,
            doNotTrack: '1',
            online: true
        };
        
        const fingerprint = ipService.generateDeviceFingerprint(deviceInfo);
        console.log('🔐 Device Fingerprint:', fingerprint);
        
        // Test bot detection
        const botData = ipService.detectBot(mockReq.headers['user-agent'], {
            mouseMovements: 15,
            clicks: 3,
            pageLoadTime: 1200,
            timeOnPage: 30000
        });
        console.log('🤖 Bot Detection:', JSON.stringify(botData, null, 2));
        
        console.log('✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('📄 Response data:', error.response.data);
        }
        process.exit(1);
    }
}

// Run tests
if (require.main === module) {
    testTracking().catch(console.error);
}

module.exports = { testTracking };
