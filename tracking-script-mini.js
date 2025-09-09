/**
 * Mini IP Tracking Script - Optimized Version
 * Captures all essential visitor data in minimal code
 */
(function() {
    'use strict';
    
    // Configuration
    const TRACKING_SERVER = 'https://track.d0s369.co.in';
    const SESSION_KEY = 'ip_track_session';
    const MIN_INTERVAL = 5 * 60 * 1000; // 5 minutes
    
    // Prevent self-tracking
    if (['track.d0s369.co.in', 'localhost:5000'].some(h => location.host.includes(h))) {
        return;
    }
    
    // Check if we should track (avoid duplicates)
    const lastTrack = localStorage.getItem('ip_track_last');
    if (lastTrack && Date.now() - parseInt(lastTrack) < MIN_INTERVAL) {
        return;
    }
    
    // Generate session ID
    const sessionId = btoa(Date.now() + Math.random().toString(36)).replace(/[^a-zA-Z0-9]/g, '');
    
    // Collect visitor data
    const visitorData = {
        sessionId: sessionId,
        timestamp: Date.now(),
        url: location.href,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: `${screen.width}x${screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        colorDepth: screen.colorDepth,
        pixelRatio: window.devicePixelRatio || 1,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        website: location.hostname
    };
    
    // Send tracking data
    fetch(`${TRACKING_SERVER}/api/track`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(visitorData)
    }).then(() => {
        localStorage.setItem('ip_track_last', Date.now().toString());
        localStorage.setItem(SESSION_KEY, sessionId);
    }).catch(() => {
        // Silent fail - don't break user experience
    });
    
})();
