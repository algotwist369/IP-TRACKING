# 🚀 IP Tracker Implementation Guide

This guide will help you implement the IP Tracker on your websites to protect against fraud and track visitors.

## 📋 Quick Start (5 minutes)

### 1. Get Your Tracking Code

1. Sign up at your IP Tracker dashboard
2. Add a new website
3. Copy the unique tracking code provided

### 2. Add to Your Website

Add this code to your HTML `<head>` section:

```html
<!-- IP Tracker Configuration -->
<script>
    window.IPTrackerConfig = {
        trackingCode: 'ip_your_user_id_timestamp_random', // Replace with your code
        website: 'yourdomain.com', // Replace with your domain
        enableRealTime: true,
        enableVPNDetection: true,
        enableDeviceFingerprinting: true,
        enableBehavioralTracking: true,
        privacyMode: 'standard'
    };
</script>

<!-- IP Tracker Script -->
<script src="https://yourdomain.com/tracking-script.js"></script>
```

### 3. Test It

1. Visit your website
2. Check browser console for "IP Tracker: Initialized successfully"
3. Check your dashboard for the visit

## 🔧 Advanced Configuration

### Privacy Modes

```javascript
// Minimal tracking (GDPR compliant)
window.IPTrackerConfig = {
    privacyMode: 'minimal',
    enableDeviceFingerprinting: false,
    enableBehavioralTracking: false
};

// Standard tracking (recommended)
window.IPTrackerConfig = {
    privacyMode: 'standard',
    enableDeviceFingerprinting: true,
    enableBehavioralTracking: false
};

// Enhanced tracking (maximum protection)
window.IPTrackerConfig = {
    privacyMode: 'enhanced',
    enableDeviceFingerprinting: true,
    enableBehavioralTracking: true
};
```

### Custom Events

Track specific user actions:

```javascript
// Track button clicks
document.getElementById('signup-button').addEventListener('click', () => {
    IPTracker.trackEvent('button_click', {
        buttonId: 'signup',
        page: 'homepage',
        timestamp: new Date().toISOString()
    });
});

// Track form submissions
document.getElementById('contact-form').addEventListener('submit', () => {
    IPTracker.trackEvent('form_submit', {
        formId: 'contact',
        page: 'contact'
    });
});

// Track page views
IPTracker.trackEvent('page_view', {
    page: window.location.pathname,
    title: document.title
});
```

## 📱 Framework Integration

### React

```jsx
import { useEffect } from 'react';

function App() {
    useEffect(() => {
        // Configure IP Tracker
        window.IPTrackerConfig = {
            trackingCode: 'your_tracking_code',
            website: 'yourdomain.com'
        };
        
        // Load tracking script
        const script = document.createElement('script');
        script.src = 'https://yourdomain.com/tracking-script.js';
        document.head.appendChild(script);
        
        return () => {
            // Cleanup if needed
        };
    }, []);

    return (
        <div>
            {/* Your app content */}
        </div>
    );
}
```

### Vue.js

```vue
<template>
    <div>
        <!-- Your template -->
    </div>
</template>

<script>
export default {
    mounted() {
        // Configure IP Tracker
        window.IPTrackerConfig = {
            trackingCode: 'your_tracking_code',
            website: 'yourdomain.com'
        };
        
        // Load tracking script
        const script = document.createElement('script');
        script.src = 'https://yourdomain.com/tracking-script.js';
        document.head.appendChild(script);
    }
}
</script>
```

### WordPress

Add to your theme's `functions.php`:

```php
function add_ip_tracker() {
    ?>
    <script>
        window.IPTrackerConfig = {
            trackingCode: '<?php echo get_option('ip_tracker_code'); ?>',
            website: '<?php echo get_site_url(); ?>',
            enableRealTime: true,
            enableVPNDetection: true
        };
    </script>
    <script src="https://yourdomain.com/tracking-script.js"></script>
    <?php
}
add_action('wp_head', 'add_ip_tracker');
```

## 🛡️ Fraud Protection Features

### VPN Detection

The script automatically detects:
- VPN connections
- Proxy servers
- TOR network usage
- Hosting providers

### Bot Detection

Identifies:
- Automated bots
- Headless browsers
- Selenium automation
- Suspicious behavior patterns

### Device Fingerprinting

Creates unique device profiles:
- Screen resolution
- Browser capabilities
- Hardware specifications
- Network characteristics

## 📊 What Gets Tracked

### Basic Information
- IP address and location
- Browser and OS details
- Device type and capabilities
- Page URLs and referrers

### Behavioral Data
- Mouse movements
- Click patterns
- Scroll depth
- Time on page
- Form interactions

### Security Indicators
- Fraud score (0-100)
- Risk factors
- Suspicious activities
- Geographic anomalies

## 🔒 Privacy & Compliance

### GDPR Compliance

```javascript
// Respect user consent
if (userConsent.given) {
    window.IPTrackerConfig = {
        enableDeviceFingerprinting: true,
        enableBehavioralTracking: true
    };
} else {
    window.IPTrackerConfig = {
        enableDeviceFingerprinting: false,
        enableBehavioralTracking: false
    };
}
```

### CCPA Compliance

```javascript
// California privacy compliance
window.IPTrackerConfig = {
    privacyMode: 'minimal',
    enableDeviceFingerprinting: false,
    enableBehavioralTracking: false
};
```

### Cookie Consent

```javascript
// Check cookie consent
if (getCookieConsent()) {
    // Enable full tracking
    window.IPTrackerConfig.enableDeviceFingerprinting = true;
} else {
    // Minimal tracking only
    window.IPTrackerConfig.enableDeviceFingerprinting = false;
}
```

## 🚀 Performance Optimization

### Lazy Loading

```javascript
// Load tracking script only when needed
function loadIPTracker() {
    if (window.IPTracker) return; // Already loaded
    
    const script = document.createElement('script');
    script.src = 'https://yourdomain.com/tracking-script.js';
    document.head.appendChild(script);
}

// Load on user interaction
document.addEventListener('click', loadIPTracker, { once: true });
```

### Conditional Loading

```javascript
// Only load on specific pages
if (window.location.pathname.includes('/checkout')) {
    window.IPTrackerConfig = {
        enableBehavioralTracking: true,
        enableVPNDetection: true
    };
    // Load tracking script
}
```

## 🧪 Testing & Debugging

### Console Commands

```javascript
// Check if tracker is loaded
console.log(window.IPTracker);

// Get current tracking data
const data = IPTracker.getData();
console.log('Tracking data:', data);

// Test custom event
IPTracker.trackEvent('test', { message: 'Hello World' });

// Get session info
console.log('Session ID:', IPTracker.getSessionId());
console.log('Computer ID:', IPTracker.getComputerId());
```

### Debug Mode

```javascript
window.IPTrackerConfig = {
    debug: true, // Enable debug logging
    trackingCode: 'your_code',
    website: 'yourdomain.com'
};
```

## 📈 Analytics & Reporting

### Real-time Dashboard

Monitor:
- Live visitor locations
- VPN and proxy alerts
- Fraud detection scores
- Geographic distribution

### Reports

Generate:
- Daily/weekly/monthly summaries
- Fraud detection reports
- Visitor demographics
- Traffic patterns

### Alerts

Set up notifications for:
- High fraud scores
- Multiple VPN connections
- Suspicious IP addresses
- Geographic anomalies

## 🔧 Troubleshooting

### Common Issues

1. **Script not loading**
   - Check if tracking code is correct
   - Verify script URL is accessible
   - Check browser console for errors

2. **No data in dashboard**
   - Verify tracking code matches dashboard
   - Check if website is active
   - Ensure MongoDB is running

3. **Performance issues**
   - Use privacy mode 'minimal' for high-traffic sites
   - Disable behavioral tracking if not needed
   - Implement lazy loading

### Support

- Check browser console for error messages
- Verify network connectivity to tracking server
- Review server logs for issues
- Contact support with error details

## 📚 Best Practices

### 1. Start Simple
Begin with basic tracking and gradually enable advanced features.

### 2. Respect Privacy
Always inform users about tracking and respect their preferences.

### 3. Monitor Performance
Track script impact on page load times and user experience.

### 4. Regular Updates
Keep the tracking script updated for latest security features.

### 5. Test Thoroughly
Test on different devices, browsers, and network conditions.

## 🎯 Use Cases

### E-commerce
- Detect fraudulent orders
- Monitor checkout behavior
- Identify bot traffic
- Geographic fraud patterns

### Lead Generation
- Filter fake leads
- Track form interactions
- Monitor conversion rates
- Identify suspicious submissions

### Content Sites
- Protect against content scraping
- Monitor user engagement
- Detect automated access
- Geographic content targeting

### SaaS Applications
- Prevent account abuse
- Monitor user behavior
- Detect suspicious logins
- Geographic access control

---

**Need help?** Check the documentation or contact support for assistance with implementation.
