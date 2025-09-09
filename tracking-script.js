// ========================== new code ==========================
/**
 * Enhanced IP Tracking Script with Improved Session Management
 * Prevents duplicate tracking from page refreshes and internal navigation
 */

(function () {
    'use strict';

    // Configuration
    const TRACKING_SERVER = 'https://track.d0s369.co.in';
    const SESSION_STORAGE_KEY = 'ip_tracking_session';
    const LAST_TRACK_KEY = 'ip_tracking_last_track';
    const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
    const MIN_TRACK_INTERVAL = 5 * 60 * 1000; // Minimum 5 minutes between tracks from same session

    // Prevent self-tracking on tracker domains
    const TRACKER_HOSTS = ['track.d0s369.co.in', 'localhost:5000', '127.0.0.1:5000'];
    const currentHost = (location.host || '').toLowerCase();
    if (TRACKER_HOSTS.some(h => currentHost.includes(h))) {
        console.info('[IP-Tracker] Self-tracking prevented on tracker domain:', currentHost);
        return;
    }

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
                    localStorage.removeItem(LAST_TRACK_KEY);
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
                hasTrackedThisSession: false,
                lastTrackTime: 0,
                currentDomain: window.location.hostname
            };

            try {
                localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
                localStorage.removeItem(LAST_TRACK_KEY); // Clear old tracking data
            } catch (error) {
                console.warn('Error saving session to localStorage:', error);
            }
        }

        return session;
    }

    // Update session after successful tracking
    function markSessionAsTracked() {
        const session = getSession();
        session.hasTrackedThisSession = true;
        session.lastTrackTime = Date.now();

        try {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
            localStorage.setItem(LAST_TRACK_KEY, Date.now().toString());
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

    // Check if referrer is external (from search engines, social media, etc.)
    function isExternalReferrer(referer) {
        if (!referer) return false;

        try {
            const refererUrl = new URL(referer);
            const refererHost = refererUrl.hostname.toLowerCase();
            const currentHost = window.location.hostname.toLowerCase();

            // Same domain = internal
            if (refererHost === currentHost) {
                return false;
            }

            // Check for known external sources
            const externalSources = [
                // Search engines
                'google.com', 'google.co.in', 'google.co.uk', 'google.ca', 'google.com.au',
                'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com',
                'ask.com', 'aol.com', 'search.yahoo.com',

                // Social media
                'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'instagram.com',
                'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
                'whatsapp.com', 'telegram.org', 'discord.com', 't.co',

                // Other common referrers
                'wikipedia.org', 'github.com', 'stackoverflow.com'
            ];

            // Check if referrer matches any external source
            const isKnownExternal = externalSources.some(source =>
                refererHost.includes(source) || refererHost.endsWith(source)
            );

            return isKnownExternal || refererHost !== currentHost;
        } catch (error) {
            // If we can't parse the referrer URL, treat as external to be safe
            return true;
        }
    }

    // Determine visit type
    function getVisitType(referer) {
        if (!referer) {
            return 'direct'; // No referer = direct visit (typed URL, bookmark)
        }

        try {
            const refererUrl = new URL(referer);
            const currentHost = window.location.hostname.toLowerCase();
            const refererHost = refererUrl.hostname.toLowerCase();

            if (refererHost === currentHost) {
                return 'internal'; // Same domain
            } else {
                return 'external'; // Different domain
            }
        } catch (error) {
            return 'direct'; // Invalid URL, treat as direct
        }
    }

    // Check if we should track this visit
    function shouldTrack() {
        const session = getSession();
        const referer = getReferrer();
        const visitType = getVisitType(referer);
        const now = Date.now();

        // Debug logging removed

        // RULE 1: Always track direct visits (no referrer) - even if session exists
        // This includes: typed URLs, bookmarks, direct links, browser reopened
        if (visitType === 'direct') {
            // Allow direct visits if enough time has passed (5 minutes)
            const timeSinceLastTrack = session.lastTrackTime ? now - session.lastTrackTime : Infinity;
            if (!session.hasTrackedThisSession || timeSinceLastTrack >= MIN_TRACK_INTERVAL) {
                return true;
            } else {
                return false;
            }
        }

        // RULE 2: Always track external visits from search engines, social media, etc.
        if (visitType === 'external' && isExternalReferrer(referer)) {
            // Allow external visits if enough time has passed (5 minutes)
            const timeSinceLastTrack = session.lastTrackTime ? now - session.lastTrackTime : Infinity;
            if (!session.hasTrackedThisSession || timeSinceLastTrack >= MIN_TRACK_INTERVAL) {
                return true;
            } else {
                return false;
            }
        }

        // RULE 3: Never track internal navigation (same domain referrer)
        if (visitType === 'internal') {
            return false;
        }

        // RULE 4: For other external visits (unknown domains), check time interval
        if (visitType === 'external') {
            const timeSinceLastTrack = session.lastTrackTime ? now - session.lastTrackTime : Infinity;
            if (!session.hasTrackedThisSession || timeSinceLastTrack >= MIN_TRACK_INTERVAL) {
                return true;
            } else {
                return false;
            }
        }

        // RULE 5: If no session has been tracked yet, track it
        if (!session.hasTrackedThisSession) {
            return true;
        }

        // Default: don't track
        return false;
    }

    // Collect all tracking data
    function collectTrackingData() {
        const session = getSession();
        const referer = getReferrer();

        return {
            website: window.location.hostname,
            url: getCurrentUrl(),
            title: getPageTitle(),
            userAgent: navigator.userAgent,
            referer: referer,
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
            visitType: getVisitType(referer),
            isFirstVisitInSession: !session.hasTrackedThisSession,
            timestamp: new Date().toISOString()
        };
    }

    // Send tracking data to server
    function trackVisit() {
        const trackingData = collectTrackingData();

        // Sending tracking data

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
                    // Mark this session as tracked (prevents future tracking in same session)
                    markSessionAsTracked();
                }
            })
            .catch(error => {
                console.error('Error tracking visit:', error);
            });
    }

    // Initialize tracking
    function initTracking() {
        // Wait a bit for the page to settle
        setTimeout(() => {
            if (shouldTrack()) {
                trackVisit();
            }
        }, 1000); // 1 second delay to ensure page is fully loaded
    }

    // Clear tracking data (for testing purposes)
    function clearTrackingData() {
        try {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(LAST_TRACK_KEY);
            localStorage.removeItem('ip_tracking_computer_id');
        } catch (error) {
            console.warn('Error clearing tracking data:', error);
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTracking);
    } else {
        initTracking();
    }

    // Expose functions for debugging (remove in production)
    window.IPTracker = {
        track: trackVisit,
        getSession: getSession,
        shouldTrack: shouldTrack,
        collectData: collectTrackingData,
        clearData: clearTrackingData,
        getVisitType: getVisitType,
        isExternal: isExternalReferrer
    };

})();



// ========================== old code ==========================

// /**
//  * Enhanced IP Tracking Script with Improved Session Management
//  * Prevents duplicate tracking from page refreshes and internal navigation
//  */

// (function () {
//     'use strict';

//     // Configuration
//     const TRACKING_SERVER = 'https://track.d0s369.co.in';
//     const SESSION_STORAGE_KEY = 'ip_tracking_session';
//     const LAST_TRACK_KEY = 'ip_tracking_last_track';
//     const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
//     const MIN_TRACK_INTERVAL = 5 * 60 * 1000; // Minimum 5 minutes between tracks from same session

//     // Generate unique session ID
//     function generateSessionId() {
//         const timestamp = Date.now();
//         const random = Math.random().toString(36).substring(2);
//         const userAgent = navigator.userAgent.substring(0, 50);
//         return btoa(`${timestamp}-${random}-${userAgent}`).replace(/[^a-zA-Z0-9]/g, '');
//     }

//     // Get or create session
//     function getSession() {
//         let session = null;

//         try {
//             const stored = localStorage.getItem(SESSION_STORAGE_KEY);
//             if (stored) {
//                 session = JSON.parse(stored);

//                 // Check if session is still valid (not expired)
//                 if (Date.now() - session.createdAt > SESSION_DURATION) {
//                     session = null; // Session expired
//                     localStorage.removeItem(SESSION_STORAGE_KEY);
//                     localStorage.removeItem(LAST_TRACK_KEY);
//                 }
//             }
//         } catch (error) {
//             console.warn('Error reading session from localStorage:', error);
//         }

//         // Create new session if none exists or expired
//         if (!session) {
//             session = {
//                 sessionId: generateSessionId(),
//                 createdAt: Date.now(),
//                 hasTrackedThisSession: false,
//                 lastTrackTime: 0,
//                 currentDomain: window.location.hostname
//             };

//             try {
//                 localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
//                 localStorage.removeItem(LAST_TRACK_KEY); // Clear old tracking data
//             } catch (error) {
//                 console.warn('Error saving session to localStorage:', error);
//             }
//         }

//         return session;
//     }

//     // Update session after successful tracking
//     function markSessionAsTracked() {
//         const session = getSession();
//         session.hasTrackedThisSession = true;
//         session.lastTrackTime = Date.now();

//         try {
//             localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
//             localStorage.setItem(LAST_TRACK_KEY, Date.now().toString());
//         } catch (error) {
//             console.warn('Error updating session:', error);
//         }

//         return session;
//     }

//     // Generate device fingerprint
//     function generateDeviceFingerprint() {
//         const canvas = document.createElement('canvas');
//         const ctx = canvas.getContext('2d');
//         ctx.textBaseline = 'top';
//         ctx.font = '14px Arial';
//         ctx.fillText('Device fingerprint', 2, 2);

//         const fingerprint = [
//             navigator.userAgent,
//             navigator.language,
//             screen.width + 'x' + screen.height,
//             new Date().getTimezoneOffset(),
//             navigator.platform,
//             navigator.cookieEnabled,
//             navigator.doNotTrack || 'unspecified',
//             canvas.toDataURL()
//         ].join('|');

//         // Simple hash function
//         let hash = 0;
//         for (let i = 0; i < fingerprint.length; i++) {
//             const char = fingerprint.charCodeAt(i);
//             hash = ((hash << 5) - hash) + char;
//             hash = hash & hash; // Convert to 32-bit integer
//         }

//         return Math.abs(hash).toString(36);
//     }

//     // Get computer ID (more persistent than session)
//     function getComputerId() {
//         let computerId = null;

//         try {
//             computerId = localStorage.getItem('ip_tracking_computer_id');
//             if (!computerId) {
//                 computerId = generateDeviceFingerprint() + '_' + Date.now();
//                 localStorage.setItem('ip_tracking_computer_id', computerId);
//             }
//         } catch (error) {
//             console.warn('Error managing computer ID:', error);
//             computerId = 'unknown_' + Date.now();
//         }

//         return computerId;
//     }

//     // Get current page referrer
//     function getReferrer() {
//         return document.referrer || null;
//     }

//     // Get current page URL
//     function getCurrentUrl() {
//         return window.location.href;
//     }

//     // Get current page title
//     function getPageTitle() {
//         return document.title || 'Untitled';
//     }

//     // Check if referrer is external (from search engines, social media, etc.)
//     function isExternalReferrer(referer) {
//         if (!referer) return false;

//         try {
//             const refererUrl = new URL(referer);
//             const refererHost = refererUrl.hostname.toLowerCase();
//             const currentHost = window.location.hostname.toLowerCase();

//             // Same domain = internal
//             if (refererHost === currentHost) {
//                 return false;
//             }

//             // Check for known external sources
//             const externalSources = [
//                 // Search engines
//                 'google.com', 'google.co.in', 'google.co.uk', 'google.ca', 'google.com.au',
//                 'bing.com', 'yahoo.com', 'duckduckgo.com', 'baidu.com', 'yandex.com',
//                 'ask.com', 'aol.com', 'search.yahoo.com',

//                 // Social media
//                 'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'instagram.com',
//                 'youtube.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
//                 'whatsapp.com', 'telegram.org', 'discord.com', 't.co',

//                 // Other common referrers
//                 'wikipedia.org', 'github.com', 'stackoverflow.com'
//             ];

//             // Check if referrer matches any external source
//             const isKnownExternal = externalSources.some(source =>
//                 refererHost.includes(source) || refererHost.endsWith(source)
//             );

//             return isKnownExternal || refererHost !== currentHost;
//         } catch (error) {
//             // If we can't parse the referrer URL, treat as external to be safe
//             return true;
//         }
//     }

//     // Determine visit type
//     function getVisitType(referer) {
//         if (!referer) {
//             return 'direct'; // No referer = direct visit (typed URL, bookmark)
//         }

//         try {
//             const refererUrl = new URL(referer);
//             const currentHost = window.location.hostname.toLowerCase();
//             const refererHost = refererUrl.hostname.toLowerCase();

//             if (refererHost === currentHost) {
//                 return 'internal'; // Same domain
//             } else {
//                 return 'external'; // Different domain
//             }
//         } catch (error) {
//             return 'direct'; // Invalid URL, treat as direct
//         }
//     }

//     // Check if we should track this visit
//     function shouldTrack() {
//         const session = getSession();
//         const referer = getReferrer();
//         const visitType = getVisitType(referer);
//         const now = Date.now();

//         // Debug logging
//         console.log('🔍 Tracking Decision Debug:', {
//             sessionId: session.sessionId,
//             hasTrackedThisSession: session.hasTrackedThisSession,
//             visitType: visitType,
//             referer: referer,
//             timeSinceLastTrack: session.lastTrackTime ? now - session.lastTrackTime : 'never',
//             isExternalReferrer: isExternalReferrer(referer)
//         });

//         // RULE 1: Never track if we already tracked in this session
//         // (prevents page refresh and internal navigation tracking)
//         if (session.hasTrackedThisSession) {
//             console.log('❌ Already tracked in this session');
//             return false;
//         }

//         // RULE 2: Always track direct visits (no referrer)
//         // This includes: typed URLs, bookmarks, direct links
//         if (visitType === 'direct') {
//             console.log('✅ Direct visit - tracking');
//             return true;
//         }

//         // RULE 3: Always track external visits from search engines, social media, etc.
//         if (visitType === 'external' && isExternalReferrer(referer)) {
//             console.log('✅ External referrer - tracking');
//             return true;
//         }

//         // RULE 4: Never track internal navigation
//         if (visitType === 'internal') {
//             console.log('❌ Internal navigation - not tracking');
//             return false;
//         }

//         // RULE 5: For other external visits, check time interval
//         if (visitType === 'external') {
//             const timeSinceLastTrack = session.lastTrackTime ? now - session.lastTrackTime : Infinity;
//             if (timeSinceLastTrack >= MIN_TRACK_INTERVAL) {
//                 console.log('✅ External visit after time interval - tracking');
//                 return true;
//             } else {
//                 console.log('❌ External visit too soon - not tracking');
//                 return false;
//             }
//         }

//         // Default: don't track
//         console.log('❌ Default - not tracking');
//         return false;
//     }

//     // Collect all tracking data
//     function collectTrackingData() {
//         const session = getSession();
//         const referer = getReferrer();

//         return {
//             website: window.location.hostname,
//             url: getCurrentUrl(),
//             title: getPageTitle(),
//             userAgent: navigator.userAgent,
//             referer: referer,
//             computerId: getComputerId(),
//             deviceFingerprint: generateDeviceFingerprint(),
//             screenResolution: screen.width + 'x' + screen.height,
//             colorDepth: screen.colorDepth,
//             platform: navigator.platform,
//             language: navigator.language,
//             timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
//             hardwareConcurrency: navigator.hardwareConcurrency || 0,
//             maxTouchPoints: navigator.maxTouchPoints || 0,
//             cookieEnabled: navigator.cookieEnabled,
//             doNotTrack: navigator.doNotTrack === '1',
//             sessionId: session.sessionId,
//             visitType: getVisitType(referer),
//             isFirstVisitInSession: !session.hasTrackedThisSession,
//             timestamp: new Date().toISOString()
//         };
//     }

//     // Send tracking data to server
//     function trackVisit() {
//         const trackingData = collectTrackingData();

//         console.log('📡 Sending tracking data:', {
//             website: trackingData.website,
//             referer: trackingData.referer,
//             sessionId: trackingData.sessionId,
//             visitType: trackingData.visitType,
//             isFirstVisitInSession: trackingData.isFirstVisitInSession
//         });

//         // Send to server
//         fetch(`${TRACKING_SERVER}/api/track2`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//             },
//             body: JSON.stringify(trackingData)
//         })
//             .then(response => response.json())
//             .then(data => {
//                 if (data.success) {
//                     // Mark this session as tracked (prevents future tracking in same session)
//                     markSessionAsTracked();

//                     console.log('✅ Visit tracked successfully:', data.message);
//                     console.log('📊 Server response:', {
//                         sessionId: data.sessionId,
//                         visitType: data.visitType,
//                         tracked: data.tracked,
//                         isFirstVisit: data.isFirstVisit
//                     });
//                 } else {
//                     console.log('⚠️ Server declined to track:', data.message);
//                 }
//             })
//             .catch(error => {
//                 console.error('❌ Error tracking visit:', error);
//             });
//     }

//     // Initialize tracking
//     function initTracking() {
//         // Wait a bit for the page to settle
//         setTimeout(() => {
//             if (shouldTrack()) {
//                 console.log('✅ Tracking this visit');
//                 trackVisit();
//             } else {
//                 console.log('⏭️ Skipping this visit - conditions not met');
//             }
//         }, 1000); // 1 second delay to ensure page is fully loaded
//     }

//     // Clear tracking data (for testing purposes)
//     function clearTrackingData() {
//         try {
//             localStorage.removeItem(SESSION_STORAGE_KEY);
//             localStorage.removeItem(LAST_TRACK_KEY);
//             localStorage.removeItem('ip_tracking_computer_id');
//             console.log('🧹 Tracking data cleared');
//         } catch (error) {
//             console.warn('Error clearing tracking data:', error);
//         }
//     }

//     // Wait for DOM to be ready
//     if (document.readyState === 'loading') {
//         document.addEventListener('DOMContentLoaded', initTracking);
//     } else {
//         initTracking();
//     }

//     // Expose functions for debugging (remove in production)
//     window.IPTracker = {
//         track: trackVisit,
//         getSession: getSession,
//         shouldTrack: shouldTrack,
//         collectData: collectTrackingData,
//         clearData: clearTrackingData,
//         getVisitType: getVisitType,
//         isExternal: isExternalReferrer
//     };

// })();