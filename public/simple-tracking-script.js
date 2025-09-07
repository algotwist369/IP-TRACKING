/**
 * IP Tracker - Simple Tracking Script
 * Version: 2.0.0
 * 
 * This is a simplified version of the tracking script for easy integration.
 * Just copy and paste this script into your website's <head> section.
 * 
 * Usage:
 * 1. Replace 'YOUR_TRACKING_CODE' with your actual tracking code
 * 2. Replace 'YOUR_DOMAIN' with your website domain
 * 3. Paste the script in your website's <head> section
 */

(function() {
    'use strict';

    // Configuration - UPDATE THESE VALUES
    const TRACKING_CODE = 'YOUR_TRACKING_CODE'; // Replace with your tracking code
    const WEBSITE_DOMAIN = 'YOUR_DOMAIN'; // Replace with your domain
    const API_ENDPOINT = 'https://yourdomain.com/api/tracking/track'; // Replace with your API endpoint

    // Don't modify anything below this line
    if (!TRACKING_CODE || TRACKING_CODE === 'YOUR_TRACKING_CODE') {
        console.warn('IP Tracker: Please set your tracking code');
        return;
    }

    // Generate unique session ID
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // Collect basic visitor data
    const collectData = () => {
        return {
            trackingCode: TRACKING_CODE,
            website: WEBSITE_DOMAIN,
            domain: window.location.hostname,
            page: window.location.pathname,
            referer: document.referrer || '',
            url: window.location.href,
            title: document.title,
            sessionId: sessionId,
            userAgent: navigator.userAgent,
            screenResolution: screen.width + 'x' + screen.height,
            colorDepth: screen.colorDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            online: navigator.onLine,
            timestamp: new Date().toISOString()
        };
    };

    // Send data to server
    const sendData = async (data) => {
        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tracking-Code': TRACKING_CODE,
                    'X-Website-Domain': WEBSITE_DOMAIN
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                console.log('IP Tracker: Data sent successfully');
            } else {
                console.warn('IP Tracker: Failed to send data');
            }
        } catch (error) {
            console.warn('IP Tracker: Error sending data:', error);
        }
    };

    // Track page load
    const trackPageLoad = () => {
        const data = collectData();
        data.type = 'page_load';
        sendData(data);
    };

    // Track page unload
    const trackPageUnload = () => {
        const data = collectData();
        data.type = 'page_unload';
        
        // Use sendBeacon for reliable data sending on page unload
        if (navigator.sendBeacon) {
            navigator.sendBeacon(API_ENDPOINT, JSON.stringify(data));
        } else {
            sendData(data);
        }
    };

    // Initialize tracking
    const init = () => {
        // Track initial page load
        trackPageLoad();

        // Track page unload
        window.addEventListener('beforeunload', trackPageUnload);

        // Track page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                const data = collectData();
                data.type = 'page_visible';
                sendData(data);
            }
        });

        console.log('IP Tracker: Initialized successfully');
    };

    // Start tracking when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
