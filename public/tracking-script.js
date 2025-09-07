/**
 * Enhanced IP Tracking Script with Session Management
 * Prevents duplicate tracking from page refreshes and internal navigation
 */

(function() {
    'use strict';

    // Configuration
    const TRACKING_SERVER = 'https://track.d0s369.co.in';  
    const SESSION_STORAGE_KEY = 'ip_tracking_session';
    const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

    // Generate unique session ID
    function generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        const userAgent = navigator.userAgent.substring(0, 50);
        return btoa(`${timestamp}-${random}-${userAgent}`).replace(/[^a-zA-Z0-9]/g, '');
    }

    // Get or create session
    function getSession() {
        let session = null;
        
        try {
            const stored = localStorage.getItem(SESSION_STORAGE_KEY);
            if (stored) {
                session = JSON.parse(stored);
                
                // Check if session is still valid (not expired)
                if (Date.now() - session.createdAt > SESSION_DURATION) {
                    session = null; // Session expired
                    localStorage.removeItem(SESSION_STORAGE_KEY);
                }
            }
        } catch (error) {
            console.warn('Error reading session from localStorage:', error);
        }

        // Create new session if none exists or expired
        if (!session) {
            session = {
                sessionId: generateSessionId(),
                createdAt: Date.now(),
                visitCount: 0
            };
            
            try {
                localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
            } catch (error) {
                console.warn('Error saving session to localStorage:', error);
            }
        }

        return session;
    }

    // Update session visit count
    function updateSession() {
        const session = getSession();
        session.visitCount++;
        session.lastActivity = Date.now();
        
        try {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        } catch (error) {
            console.warn('Error updating session:', error);
        }
        
        return session;
    }

    // Generate device fingerprint
    function generateDeviceFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            navigator.platform,
            navigator.cookieEnabled,
            navigator.doNotTrack || 'unspecified',
            canvas.toDataURL()
        ].join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(36);
    }

    // Get computer ID (more persistent than session)
    function getComputerId() {
        let computerId = null;
        
        try {
            computerId = localStorage.getItem('ip_tracking_computer_id');
            if (!computerId) {
                computerId = generateDeviceFingerprint() + '_' + Date.now();
                localStorage.setItem('ip_tracking_computer_id', computerId);
            }
        } catch (error) {
            console.warn('Error managing computer ID:', error);
            computerId = 'unknown_' + Date.now();
        }
        
        return computerId;
    }

    // Determine if this is a new session (first visit)
    function isNewSession() {
        const session = getSession();
        return session.visitCount === 0;
    }

    // Get current page referrer
    function getReferrer() {
        return document.referrer || null;
    }

    // Get current page URL
    function getCurrentUrl() {
        return window.location.href;
    }

    // Get current page title
    function getPageTitle() {
        return document.title || 'Untitled';
    }

    // Collect all tracking data
    function collectTrackingData() {
        const session = updateSession();
        
        return {
            website: window.location.hostname,
            url: getCurrentUrl(),
            title: getPageTitle(),
            userAgent: navigator.userAgent,
            referer: getReferrer(),
            computerId: getComputerId(),
            deviceFingerprint: generateDeviceFingerprint(),
            screenResolution: screen.width + 'x' + screen.height,
            colorDepth: screen.colorDepth,
            platform: navigator.platform,
            language: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            maxTouchPoints: navigator.maxTouchPoints || 0,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack === '1',
            sessionId: session.sessionId,
            isNewSession: isNewSession(),
            timestamp: new Date().toISOString()
        };
    }

    // Send tracking data to server
    function trackVisit() {
        const trackingData = collectTrackingData();
        
        // Log tracking attempt (for debugging)
        console.log('Tracking visit:', {
            website: trackingData.website,
            referer: trackingData.referer,
            sessionId: trackingData.sessionId,
            isNewSession: trackingData.isNewSession,
            visitType: trackingData.referer ? 'external' : 'direct'
        });

        // Send to server
        fetch(`${TRACKING_SERVER}/api/track`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(trackingData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Visit tracked successfully:', data.message);
                if (data.sessionId) {
                    console.log('Session ID:', data.sessionId);
                }
                if (data.visitType) {
                    console.log('Visit type:', data.visitType);
                }
            } else {
                console.warn('Tracking failed:', data.message);
            }
        })
        .catch(error => {
            console.error('Error tracking visit:', error);
        });
    }

    // Check if we should track this visit
    function shouldTrack() {
        const session = getSession();
        const referer = getReferrer();
        const currentDomain = window.location.hostname;
        
        // Always track if it's a new session
        if (session.visitCount === 0) {
            return true;
        }
        
        // Track if referrer is from external domain
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                if (refererUrl.hostname !== currentDomain) {
                    return true; // External referrer
                }
            } catch (error) {
                // Invalid referrer URL, treat as external
                return true;
            }
        }
        
        // Track if no referrer (direct visit)
        if (!referer) {
            return true;
        }
        
        // Don't track internal navigation or page refreshes
        return false;
    }

    // Initialize tracking
    function initTracking() {
        // Only track if conditions are met
        if (shouldTrack()) {
            trackVisit();
        } else {
            console.log('Skipping tracking - internal navigation or page refresh');
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTracking);
    } else {
        initTracking();
    }

    // Expose functions for manual tracking (optional)
    window.IPTracker = {
        track: trackVisit,
        getSession: getSession,
        shouldTrack: shouldTrack,
        collectData: collectTrackingData
    };

})();
