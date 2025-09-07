/**
 * IP Tracking Test Script
 * Run this in browser console to test tracking logic
 */

function testTrackingLogic() {
    console.log('🧪 Starting IP Tracking Logic Tests...\n');
    
    // Test 1: Check if IPTracker is available
    if (!window.IPTracker) {
        console.error('❌ IPTracker not found! Make sure tracking script is loaded.');
        return;
    }
    
    console.log('✅ IPTracker found');
    
    // Test 2: Get current session
    const session = window.IPTracker.getSession();
    console.log('📋 Current Session:', {
        sessionId: session.sessionId,
        visitCount: session.visitCount,
        createdAt: new Date(session.createdAt).toLocaleString(),
        lastActivity: session.lastActivity ? new Date(session.lastActivity).toLocaleString() : 'Never'
    });
    
    // Test 3: Check shouldTrack logic
    const shouldTrack = window.IPTracker.shouldTrack();
    console.log('🎯 Should Track:', shouldTrack);
    
    // Test 4: Get tracking reason
    const reason = getTrackingReason();
    console.log('💭 Reason:', reason);
    
    // Test 5: Collect tracking data
    const data = window.IPTracker.collectData();
    console.log('📊 Tracking Data:', {
        website: data.website,
        referer: data.referer || 'None',
        sessionId: data.sessionId,
        isNewSession: data.isNewSession,
        computerId: data.computerId,
        deviceFingerprint: data.deviceFingerprint
    });
    
    // Test 6: Test different scenarios
    console.log('\n🔍 Testing Different Scenarios:');
    
    // Scenario 1: New session
    if (session.visitCount === 0) {
        console.log('✅ Scenario 1: New session - Should track');
    } else {
        console.log('ℹ️ Scenario 1: Existing session - Visit count:', session.visitCount);
    }
    
    // Scenario 2: External referrer
    if (data.referer) {
        try {
            const refererUrl = new URL(data.referer);
            const currentDomain = window.location.hostname;
            if (refererUrl.hostname !== currentDomain) {
                console.log('✅ Scenario 2: External referrer - Should track');
            } else {
                console.log('❌ Scenario 3: Internal referrer - Should NOT track');
            }
        } catch (error) {
            console.log('⚠️ Scenario 2: Invalid referrer URL - Should track');
        }
    } else {
        console.log('✅ Scenario 2: No referrer (direct visit) - Should track');
    }
    
    // Scenario 3: Session expiry
    const sessionAge = Date.now() - session.createdAt;
    const sessionAgeMinutes = Math.round(sessionAge / 1000 / 60);
    if (sessionAgeMinutes > 30) {
        console.log('✅ Scenario 3: Session expired - Should track');
    } else {
        console.log('ℹ️ Scenario 3: Session active - Age:', sessionAgeMinutes, 'minutes');
    }
    
    console.log('\n🎯 Final Decision:', shouldTrack ? 'TRACK ✅' : 'DON\'T TRACK ❌');
    console.log('📝 Reason:', reason);
    
    return {
        shouldTrack,
        reason,
        session,
        data
    };
}

function getTrackingReason() {
    if (!window.IPTracker) return 'Script not loaded';
    
    const session = window.IPTracker.getSession();
    const referer = document.referrer;
    const currentDomain = window.location.hostname;
    
    if (session.visitCount === 0) {
        return 'New session (first visit)';
    }
    
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            if (refererUrl.hostname !== currentDomain) {
                return 'External referrer';
            } else {
                return 'Internal navigation (same domain)';
            }
        } catch (error) {
            return 'Invalid referrer URL';
        }
    }
    
    if (!referer) {
        return 'Direct visit (no referrer)';
    }
    
    return 'Unknown reason';
}

function simulateExternalVisit() {
    console.log('🌐 Simulating external visit...');
    
    // Simulate coming from Google
    Object.defineProperty(document, 'referrer', {
        value: 'https://www.google.com/search?q=test',
        writable: false
    });
    
    const result = testTrackingLogic();
    console.log('🔄 Refresh page to test external visit tracking');
    
    return result;
}

function simulateDirectVisit() {
    console.log('🎯 Simulating direct visit...');
    
    // Simulate no referrer
    Object.defineProperty(document, 'referrer', {
        value: '',
        writable: false
    });
    
    const result = testTrackingLogic();
    console.log('🔄 Refresh page to test direct visit tracking');
    
    return result;
}

function simulateInternalVisit() {
    console.log('🔗 Simulating internal visit...');
    
    // Simulate coming from same domain
    Object.defineProperty(document, 'referrer', {
        value: window.location.origin + '/previous-page',
        writable: false
    });
    
    const result = testTrackingLogic();
    console.log('🔄 Refresh page to test internal visit tracking');
    
    return result;
}

function clearSession() {
    console.log('🗑️ Clearing session...');
    
    localStorage.removeItem('ip_tracking_session');
    localStorage.removeItem('ip_tracking_computer_id');
    
    console.log('✅ Session cleared! Next visit will be treated as new user.');
    
    // Test again
    setTimeout(() => {
        testTrackingLogic();
    }, 100);
}

function expireSession() {
    console.log('⏰ Expiring session...');
    
    const session = window.IPTracker.getSession();
    session.createdAt = Date.now() - (31 * 60 * 1000); // 31 minutes ago
    localStorage.setItem('ip_tracking_session', JSON.stringify(session));
    
    console.log('✅ Session expired! Next visit will create new session.');
    
    // Test again
    setTimeout(() => {
        testTrackingLogic();
    }, 100);
}

// Export functions to global scope
window.testTrackingLogic = testTrackingLogic;
window.simulateExternalVisit = simulateExternalVisit;
window.simulateDirectVisit = simulateDirectVisit;
window.simulateInternalVisit = simulateInternalVisit;
window.clearSession = clearSession;
window.expireSession = expireSession;

console.log('🧪 IP Tracking Test Script Loaded!');
console.log('Available functions:');
console.log('- testTrackingLogic() - Run comprehensive tests');
console.log('- simulateExternalVisit() - Simulate Google visit');
console.log('- simulateDirectVisit() - Simulate direct visit');
console.log('- simulateInternalVisit() - Simulate internal visit');
console.log('- clearSession() - Clear all session data');
console.log('- expireSession() - Expire current session');
console.log('\nRun testTrackingLogic() to start testing!');
