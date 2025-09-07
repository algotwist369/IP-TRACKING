/**
 * IP Tracker - Advanced Visitor Tracking Script
 * Version: 2.0.0
 * 
 * This script provides comprehensive visitor tracking including:
 * - IP address and geolocation
 * - Device fingerprinting
 * - VPN/Proxy detection
 * - Bot detection
 * - Behavioral tracking
 * - Real-time analytics
 * 
 * Usage: Include this script in your HTML <head> section
 * <script src="https://track.d0s369.co.in/tracking-script.js"></script>
 * 
 * Configuration:
 * window.IPTrackerConfig = {
 *   trackingCode: 'your_tracking_code_here',
 *   website: 'yourdomain.com',
 *   enableRealTime: true,
 *   enableVPNDetection: true,
 *   enableDeviceFingerprinting: true,
 *   enableBehavioralTracking: true,
 *   privacyMode: 'standard' // 'standard', 'enhanced', 'minimal'
 * };
 */

(function() {
    'use strict';

    // ============================================================================
    // CONFIGURATION AND INITIALIZATION
    // ============================================================================
    
    const config = window.IPTrackerConfig || {};
    const defaultConfig = {
        trackingCode: '',
        website: window.location.hostname,
        enableRealTime: true,
        enableVPNDetection: true,
        enableDeviceFingerprinting: true,
        enableBehavioralTracking: true,
        privacyMode: 'standard',
        endpoint: 'https://track.d0s369.co.in/api/tracking/track',
        heartbeatInterval: 30000, // 30 seconds
        sessionTimeout: 1800000, // 30 minutes
        maxRetries: 3,
        retryDelay: 1000
    };

    const settings = { ...defaultConfig, ...config };
    
    if (!settings.trackingCode) {
        console.warn('IP Tracker: No tracking code provided. Tracking disabled.');
        return;
    }

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================
    
    const utils = {
        // Generate unique session ID
        generateSessionId: () => {
            return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        // Generate computer ID based on device characteristics
        generateComputerId: () => {
            const components = [
                navigator.userAgent,
                navigator.language,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                navigator.hardwareConcurrency || 'unknown',
                navigator.maxTouchPoints || 'unknown'
            ];
            
            let hash = 0;
            const str = components.join('|');
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        },

        // Hash string for fingerprinting
        hashString: (str) => {
            let hash = 0;
            if (str.length === 0) return hash.toString();
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        },

        // Get random number between min and max
        random: (min, max) => {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        // Debounce function
        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        // Throttle function
        throttle: (func, limit) => {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }
    };

    // ============================================================================
    // DEVICE FINGERPRINTING
    // ============================================================================
    
    const fingerprinting = {
        // Collect device information
        collectDeviceInfo: () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('IP Tracker Canvas Fingerprint', 2, 2);
                
                return {
                    // Screen information
                    screenResolution: screen.width + 'x' + screen.height,
                    colorDepth: screen.colorDepth,
                    pixelRatio: window.devicePixelRatio || 1,
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
                    
                    // Browser capabilities
                    canvas: canvas.toDataURL(),
                    webgl: this.getWebGLFingerprint(),
                    fonts: this.getFontList(),
                    
                    // System information
                    platform: navigator.platform,
                    language: navigator.language,
                    languages: navigator.languages || [navigator.language],
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
                    maxTouchPoints: navigator.maxTouchPoints || 'unknown',
                    
                    // Browser features
                    cookieEnabled: navigator.cookieEnabled,
                    doNotTrack: navigator.doNotTrack || 'unknown',
                    online: navigator.onLine,
                    
                    // Network information
                    connection: this.getConnectionInfo(),
                    
                    // Additional capabilities
                    localStorage: !!window.localStorage,
                    sessionStorage: !!window.sessionStorage,
                    indexedDB: !!window.indexedDB,
                    webWorkers: !!window.Worker,
                    serviceWorkers: !!navigator.serviceWorker,
                    
                    // Audio fingerprinting
                    audio: this.getAudioFingerprint(),
                    
                    // Device type detection
                    deviceType: this.getDeviceType(),
                    
                    // Memory information
                    memory: navigator.deviceMemory || 'unknown',
                    
                    // Battery information (if available)
                    battery: this.getBatteryInfo(),
                    
                    // Media devices
                    mediaDevices: this.getMediaDevicesInfo()
                };
            } catch (error) {
                console.warn('IP Tracker: Error collecting device info:', error);
                return {};
            }
        },

        // Get WebGL fingerprint
        getWebGLFingerprint: () => {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'not_supported';
                
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
                return 'unknown';
            } catch (error) {
                return 'error';
            }
        },

        // Get font list
        getFontList: () => {
            const baseFonts = ['monospace', 'sans-serif', 'serif'];
            const fontList = ['Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New'];
            const testString = 'mmmmmmmmmmlli';
            const testSize = '72px';
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            const baseFontsWidth = {};
            baseFonts.forEach(baseFont => {
                context.font = testSize + ' ' + baseFont;
                baseFontsWidth[baseFont] = context.measureText(testString).width;
            });
            
            const detectedFonts = [];
            fontList.forEach(font => {
                let detected = false;
                baseFonts.forEach(baseFont => {
                    context.font = testSize + ' ' + font + ', ' + baseFont;
                    const width = context.measureText(testString).width;
                    if (width !== baseFontsWidth[baseFont]) {
                        detected = true;
                    }
                });
                if (detected) detectedFonts.push(font);
            });
            
            return detectedFonts;
        },

        // Get connection information
        getConnectionInfo: () => {
            try {
                if ('connection' in navigator) {
                    const conn = navigator.connection;
                    return {
                        type: conn.effectiveType || conn.type || 'unknown',
                        downlink: conn.downlink || 'unknown',
                        rtt: conn.rtt || 'unknown'
                    };
                }
                return { type: 'unknown', downlink: 'unknown', rtt: 'unknown' };
            } catch (error) {
                return { type: 'unknown', downlink: 'unknown', rtt: 'unknown' };
            }
        },

        // Get audio fingerprint
        getAudioFingerprint: () => {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const analyser = audioContext.createAnalyser();
                const gainNode = audioContext.createGain();
                const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                
                gainNode.gain.value = 0;
                oscillator.type = 'triangle';
                oscillator.connect(analyser);
                analyser.connect(scriptProcessor);
                scriptProcessor.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.start(0);
                
                const audioData = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatFrequencyData(audioData);
                
                oscillator.stop();
                audioContext.close();
                
                return utils.hashString(audioData.join(','));
            } catch (error) {
                return 'not_supported';
            }
        },

        // Get battery information
        getBatteryInfo: () => {
            try {
                if ('getBattery' in navigator) {
                    return navigator.getBattery().then(battery => ({
                        charging: battery.charging,
                        chargingTime: battery.chargingTime,
                        dischargingTime: battery.dischargingTime,
                        level: battery.level
                    })).catch(() => 'not_supported');
                }
                return 'not_supported';
            } catch (error) {
                return 'not_supported';
            }
        },

        // Get media devices information
        getMediaDevicesInfo: () => {
            try {
                if ('mediaDevices' in navigator && 'enumerateDevices' in navigator.mediaDevices) {
                    return navigator.mediaDevices.enumerateDevices().then(devices => {
                        return devices.map(device => ({
                            kind: device.kind,
                            label: device.label || 'unknown',
                            deviceId: device.deviceId ? 'present' : 'absent'
                        }));
                    }).catch(() => 'not_supported');
                }
                return 'not_supported';
            } catch (error) {
                return 'not_supported';
            }
        }
    };

    // ============================================================================
    // BEHAVIORAL TRACKING
    // ============================================================================
    
    const behavioralTracking = {
        mouseMovements: 0,
        clicks: 0,
        scrollDepth: 0,
        timeOnPage: 0,
        pageLoadTime: 0,
        interactions: [],
        startTime: Date.now(),
        
        // Initialize behavioral tracking
        init: () => {
            if (!settings.enableBehavioralTracking) return;
            
            // Track mouse movements
            document.addEventListener('mousemove', utils.throttle(() => {
                behavioralTracking.mouseMovements++;
            }, 100));
            
            // Track clicks
            document.addEventListener('click', (e) => {
                behavioralTracking.clicks++;
                behavioralTracking.interactions.push({
                    type: 'click',
                    timestamp: Date.now(),
                    target: e.target.tagName,
                    x: e.clientX,
                    y: e.clientY
                });
            });
            
            // Track scrolling
            let maxScroll = 0;
            window.addEventListener('scroll', utils.throttle(() => {
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
                const scrollPercent = Math.round((scrollTop / scrollHeight) * 100);
                behavioralTracking.scrollDepth = Math.max(behavioralTracking.scrollDepth, scrollPercent);
            }, 100));
            
            // Track page load time
            if (document.readyState === 'complete') {
                behavioralTracking.pageLoadTime = Date.now() - behavioralTracking.startTime;
            } else {
                window.addEventListener('load', () => {
                    behavioralTracking.pageLoadTime = Date.now() - behavioralTracking.startTime;
                });
            }
            
            // Track time on page
            setInterval(() => {
                behavioralTracking.timeOnPage = Date.now() - behavioralTracking.startTime;
            }, 1000);
            
            // Track form interactions
            document.addEventListener('input', utils.debounce((e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    behavioralTracking.interactions.push({
                        type: 'input',
                        timestamp: Date.now(),
                        target: e.target.tagName,
                        fieldType: e.target.type || 'text'
                    });
                }
            }, 500));
            
            // Track focus events
            document.addEventListener('focusin', (e) => {
                behavioralTracking.interactions.push({
                    type: 'focus',
                    timestamp: Date.now(),
                    target: e.target.tagName
                });
            });
        },
        
        // Get behavioral data
        getData: () => {
            return {
                mouseMovements: behavioralTracking.mouseMovements,
                clicks: behavioralTracking.clicks,
                scrollDepth: behavioralTracking.scrollDepth,
                timeOnPage: behavioralTracking.timeOnPage,
                pageLoadTime: behavioralTracking.pageLoadTime,
                interactions: behavioralTracking.interactions.slice(-10) // Last 10 interactions
            };
        }
    };

    // ============================================================================
    // DATA COLLECTION
    // ============================================================================
    
    const dataCollector = {
        // Collect all tracking data
        collect: () => {
            try {
                const deviceInfo = fingerprinting.collectDeviceInfo();
                const behavioralData = behavioralTracking.getData();
                
                return {
                    // Basic tracking information
                    trackingCode: settings.trackingCode,
                    website: settings.website,
                    domain: window.location.hostname,
                    
                    // Page information
                    page: window.location.pathname,
                    referer: document.referrer || '',
                    refererDomain: document.referrer ? new URL(document.referrer).hostname : '',
                    url: window.location.href,
                    title: document.title,
                    
                    // Device fingerprinting
                    computerId: utils.generateComputerId(),
                    deviceFingerprint: utils.hashString(JSON.stringify(deviceInfo)),
                    sessionId: utils.generateSessionId(),
                    userAgent: navigator.userAgent,
                    userAgentHash: utils.hashString(navigator.userAgent),
                    
                    // Browser information
                    browser: dataCollector.getBrowserInfo(),
                    os: dataCollector.getOSInfo(),
                    device: {
                        type: dataCollector.getDeviceType(),
                        model: 'unknown',
                        vendor: 'unknown'
                    },
                    
                    // Screen and display
                    screenResolution: deviceInfo.screenResolution,
                    colorDepth: deviceInfo.colorDepth,
                    pixelRatio: deviceInfo.pixelRatio,
                    viewport: deviceInfo.viewport,
                    
                    // System information
                    platform: deviceInfo.platform,
                    language: deviceInfo.language,
                    languages: deviceInfo.languages,
                    timezone: deviceInfo.timezone,
                    hardwareConcurrency: deviceInfo.hardwareConcurrency,
                    maxTouchPoints: deviceInfo.maxTouchPoints,
                    cookieEnabled: deviceInfo.cookieEnabled,
                    doNotTrack: deviceInfo.doNotTrack,
                    online: deviceInfo.online,
                    
                    // Network information
                    connectionType: deviceInfo.connection.type,
                    effectiveType: deviceInfo.connection.type,
                    downlink: deviceInfo.connection.downlink,
                    rtt: deviceInfo.connection.rtt,
                    
                    // Behavioral data
                    mouseMovements: behavioralData.mouseMovements,
                    clicks: behavioralData.clicks,
                    scrollDepth: behavioralData.scrollDepth,
                    timeOnPage: behavioralData.timeOnPage,
                    pageLoadTime: behavioralData.pageLoadTime,
                    interactions: behavioralData.interactions,
                    
                    // UTM parameters
                    utmSource: this.getUTMParameter('utm_source'),
                    utmMedium: this.getUTMParameter('utm_medium'),
                    utmCampaign: this.getUTMParameter('utm_campaign'),
                    utmTerm: this.getUTMParameter('utm_term'),
                    utmContent: this.getUTMParameter('utm_content'),
                    
                    // Custom parameters
                    customParams: this.getCustomParameters(),
                    
                    // Timestamp
                    timestamp: new Date().toISOString()
                };
            } catch (error) {
                console.error('IP Tracker: Error collecting data:', error);
                return null;
            }
        },
        
        // Get browser information
        getBrowserInfo: () => {
            const userAgent = navigator.userAgent;
            let name = 'Unknown';
            let version = 'Unknown';
            let engine = 'Unknown';
            let engineVersion = 'Unknown';
            
            // Detect browser with more comprehensive patterns
            if (userAgent.includes('Edg/')) {
                name = 'Edge';
                version = userAgent.match(/Edg\/(\d+\.\d+)/)?.[1] || 'Unknown';
                engine = 'Blink';
            } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
                name = 'Chrome';
                version = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
                engine = 'Blink';
            } else if (userAgent.includes('Firefox/')) {
                name = 'Firefox';
                version = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
                engine = 'Gecko';
            } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
                name = 'Safari';
                version = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
                engine = 'WebKit';
            } else if (userAgent.includes('Opera/') || userAgent.includes('OPR/')) {
                name = 'Opera';
                version = userAgent.match(/(?:Opera|OPR)\/(\d+\.\d+)/)?.[1] || 'Unknown';
                engine = 'Blink';
            } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
                name = 'Internet Explorer';
                version = userAgent.match(/(?:MSIE |rv:)(\d+\.\d+)/)?.[1] || 'Unknown';
                engine = 'Trident';
            }
            
            // Detect engine version
            if (engine === 'Blink') {
                engineVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
            } else if (engine === 'Gecko') {
                engineVersion = userAgent.match(/rv:(\d+\.\d+)/)?.[1] || 'Unknown';
            } else if (engine === 'WebKit') {
                engineVersion = userAgent.match(/WebKit\/(\d+\.\d+)/)?.[1] || 'Unknown';
            } else if (engine === 'Trident') {
                engineVersion = userAgent.match(/Trident\/(\d+\.\d+)/)?.[1] || 'Unknown';
            }
            
            return { name, version, engine, engineVersion };
        },
        
        // Get OS information
        getOSInfo: () => {
            const userAgent = navigator.userAgent;
            let name = 'Unknown';
            let version = 'Unknown';
            
            // Windows detection
            if (userAgent.includes('Windows')) {
                name = 'Windows';
                if (userAgent.includes('Windows NT 10.0')) version = '10';
                else if (userAgent.includes('Windows NT 6.3')) version = '8.1';
                else if (userAgent.includes('Windows NT 6.2')) version = '8';
                else if (userAgent.includes('Windows NT 6.1')) version = '7';
                else if (userAgent.includes('Windows NT 6.0')) version = 'Vista';
                else if (userAgent.includes('Windows NT 5.1')) version = 'XP';
                else if (userAgent.includes('Windows NT 5.0')) version = '2000';
                else version = userAgent.match(/Windows NT (\d+\.\d+)/)?.[1] || 'Unknown';
            }
            // macOS detection
            else if (userAgent.includes('Mac OS X')) {
                name = 'macOS';
                const match = userAgent.match(/Mac OS X (\d+)[._](\d+)/);
                if (match) {
                    version = `${match[1]}.${match[2]}`;
                } else {
                    version = userAgent.match(/Mac OS X (\d+_\d+)/)?.[1]?.replace('_', '.') || 'Unknown';
                }
            }
            // Linux detection
            else if (userAgent.includes('Linux')) {
                name = 'Linux';
                if (userAgent.includes('Ubuntu')) version = 'Ubuntu';
                else if (userAgent.includes('Debian')) version = 'Debian';
                else if (userAgent.includes('CentOS')) version = 'CentOS';
                else if (userAgent.includes('Red Hat')) version = 'Red Hat';
                else if (userAgent.includes('Fedora')) version = 'Fedora';
                else if (userAgent.includes('SUSE')) version = 'SUSE';
                else if (userAgent.includes('Arch')) version = 'Arch';
                else version = 'Linux';
            }
            // Android detection
            else if (userAgent.includes('Android')) {
                name = 'Android';
                version = userAgent.match(/Android (\d+\.?\d*)/)?.[1] || 'Unknown';
            }
            // iOS detection
            else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
                name = 'iOS';
                const match = userAgent.match(/OS (\d+)[._](\d+)/);
                if (match) {
                    version = `${match[1]}.${match[2]}`;
                } else {
                    version = userAgent.match(/OS (\d+_\d+)/)?.[1]?.replace('_', '.') || 'Unknown';
                }
            }
            // Chrome OS detection
            else if (userAgent.includes('CrOS')) {
                name = 'Chrome OS';
                version = userAgent.match(/CrOS (\d+\.\d+)/)?.[1] || 'Unknown';
            }
            // FreeBSD detection
            else if (userAgent.includes('FreeBSD')) {
                name = 'FreeBSD';
                version = userAgent.match(/FreeBSD (\d+\.\d+)/)?.[1] || 'Unknown';
            }
            
            return { name, version };
        },
        
        // Get device type
        getDeviceType: () => {
            const userAgent = navigator.userAgent;
            const screenWidth = screen.width;
            const screenHeight = screen.height;
            
            // Mobile detection
            if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
                return 'mobile';
            }
            
            // Tablet detection
            if (userAgent.includes('Tablet') || userAgent.includes('iPad') || 
                (screenWidth >= 768 && screenWidth <= 1024 && screenHeight >= 768 && screenHeight <= 1024)) {
                return 'tablet';
            }
            
            // Desktop detection
            if (screenWidth > 1024) {
                return 'desktop';
            }
            
            // Fallback based on screen size
            if (screenWidth < 768) {
                return 'mobile';
            } else if (screenWidth <= 1024) {
                return 'tablet';
            } else {
                return 'desktop';
            }
        },
        
        // Get UTM parameters
        getUTMParameter: (param) => {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(param) || '';
        },
        
        // Get custom parameters
        getCustomParameters: () => {
            const urlParams = new URLSearchParams(window.location.search);
            const customParams = {};
            
            for (const [key, value] of urlParams.entries()) {
                if (key.startsWith('custom_')) {
                    customParams[key] = value;
                }
            }
            
            return customParams;
        }
    };

    // ============================================================================
    // API COMMUNICATION
    // ============================================================================
    
    const api = {
        retryCount: 0,
        
        // Send tracking data
        send: async (data) => {
            try {
                const response = await fetch(settings.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Tracking-Code': settings.trackingCode,
                        'X-Website-Domain': settings.website
                    },
                    body: JSON.stringify(data)
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                if (result.success) {
                    console.log('IP Tracker: Data sent successfully');
                    api.retryCount = 0;
                } else {
                    throw new Error(result.message || 'Unknown error');
                }
                
            } catch (error) {
                console.error('IP Tracker: Error sending data:', error);
                
                // Retry logic
                if (api.retryCount < settings.maxRetries) {
                    api.retryCount++;
                    setTimeout(() => {
                        api.send(data);
                    }, settings.retryDelay * api.retryCount);
                }
            }
        },
        
        // Send heartbeat data
        sendHeartbeat: () => {
            if (!settings.enableRealTime) return;
            
            const heartbeatData = {
                trackingCode: settings.trackingCode,
                website: settings.website,
                sessionId: behavioralTracking.sessionId || utils.generateSessionId(),
                timestamp: new Date().toISOString(),
                type: 'heartbeat',
                behavioralData: behavioralTracking.getData()
            };
            
            api.send(heartbeatData);
        }
    };

    // ============================================================================
    // SESSION MANAGEMENT
    // ============================================================================
    
    const sessionManager = {
        sessionId: null,
        lastActivity: Date.now(),
        
        // Initialize session
        init: () => {
            sessionManager.sessionId = utils.generateSessionId();
            sessionManager.updateActivity();
            
            // Update activity on user interaction
            ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
                document.addEventListener(event, utils.throttle(() => {
                    sessionManager.updateActivity();
                }, 1000));
            });
            
            // Check session timeout
            setInterval(() => {
                if (Date.now() - sessionManager.lastActivity > settings.sessionTimeout) {
                    sessionManager.endSession();
                }
            }, 60000); // Check every minute
        },
        
        // Update activity timestamp
        updateActivity: () => {
            sessionManager.lastActivity = Date.now();
        },
        
        // End session
        endSession: () => {
            const sessionData = {
                trackingCode: settings.trackingCode,
                website: settings.website,
                sessionId: sessionManager.sessionId,
                timestamp: new Date().toISOString(),
                type: 'session_end',
                duration: Date.now() - sessionManager.lastActivity
            };
            
            api.send(sessionData);
            sessionManager.sessionId = utils.generateSessionId();
        }
    };

    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    const init = () => {
        try {
            // Initialize behavioral tracking
            behavioralTracking.init();
            
            // Initialize session management
            sessionManager.init();
            
            // Collect and send initial data
            const initialData = dataCollector.collect();
            if (initialData) {
                api.send(initialData);
            }
            
            // Set up heartbeat if real-time tracking is enabled
            if (settings.enableRealTime) {
                setInterval(() => {
                    api.sendHeartbeat();
                }, settings.heartbeatInterval);
            }
            
            // Send data on page unload
            window.addEventListener('beforeunload', () => {
                const finalData = {
                    ...dataCollector.collect(),
                    type: 'page_unload',
                    timeOnPage: behavioralTracking.timeOnPage
                };
                
                // Use sendBeacon for reliable data sending on page unload
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(settings.endpoint, JSON.stringify(finalData));
                } else {
                    // Fallback to synchronous XMLHttpRequest
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', settings.endpoint, false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.setRequestHeader('X-Tracking-Code', settings.trackingCode);
                    xhr.setRequestHeader('X-Website-Domain', settings.website);
                    xhr.send(JSON.stringify(finalData));
                }
            });
            
            console.log('IP Tracker: Initialized successfully');
            
        } catch (error) {
            console.error('IP Tracker: Initialization error:', error);
        }
    };

    // ============================================================================
    // PUBLIC API
    // ============================================================================
    
    // Expose public methods
    window.IPTracker = {
        // Get current tracking data
        getData: () => dataCollector.collect(),
        
        // Manually send tracking data
        track: (customData = {}) => {
            const data = { ...dataCollector.collect(), ...customData };
            api.send(data);
        },
        
        // Track custom event
        trackEvent: (eventName, eventData = {}) => {
            const data = {
                ...dataCollector.collect(),
                type: 'custom_event',
                eventName,
                eventData,
                timestamp: new Date().toISOString()
            };
            api.send(data);
        },
        
        // Get session ID
        getSessionId: () => sessionManager.sessionId,
        
        // Get computer ID
        getComputerId: () => utils.generateComputerId(),
        
        // Update configuration
        updateConfig: (newConfig) => {
            Object.assign(settings, newConfig);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
