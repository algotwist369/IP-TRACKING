const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const User = require('../models/User');
const { authenticateToken, requireActiveSubscription } = require('../middleware/auth');
const { validatePayment, validateSimpleSubscription } = require('../middleware/validation');
const logger = require('../utils/logger');

// Extend Express Request type to include userId
const getUserId = (req) => req.userId || req.user?.id;

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============================================================================
// SUBSCRIPTION PLANS
// ============================================================================

const SUBSCRIPTION_PLANS = {
    free: {
        name: 'Free Plan',
        price: 0, // Free
        currency: 'INR',
        interval: 'month',
        features: {
            maxWebsites: 5,
            maxVisitsPerMonth: 1000,
            maxDataRetentionDays: 30,
            maxAPIRequestsPerDay: 1000
        }
    },
    basic: {
        name: 'Basic Plan',
        price: 999, // ₹999/month
        currency: 'INR',
        interval: 'month',
        features: {
            maxWebsites: 50,
            maxVisitsPerMonth: 10000,
            maxDataRetentionDays: 60,
            maxAPIRequestsPerDay: 5000
        }
    },
    pro: {
        name: 'Pro Plan',
        price: 1999, // ₹1999/month
        currency: 'INR',
        interval: 'month',
        features: {
            maxWebsites: 100,
            maxVisitsPerMonth: 50000,
            maxDataRetentionDays: 90,
            maxAPIRequestsPerDay: 15000
        }
    },
    premium: {
        name: 'Premium Plan',
        price: 2999, // ₹2999/month
        currency: 'INR',
        interval: 'month',
        features: {
            maxWebsites: 250,
            maxVisitsPerMonth: 100000,
            maxDataRetentionDays: 180,
            maxAPIRequestsPerDay: 25000
        }
    },
    enterprise: {
        name: 'Enterprise Plan',
        price: 4999, // ₹4999/month
        currency: 'INR',
        interval: 'month',
        features: {
            maxWebsites: 5000,
            maxVisitsPerMonth: 200000,
            maxDataRetentionDays: 365,
            maxAPIRequestsPerDay: 50000
        }
    }
};

// ============================================================================
// CREATE SUBSCRIPTION
// ============================================================================

// Alias for frontend compatibility
router.post('/subscribe', authenticateToken, validateSimpleSubscription, async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = getUserId(req);

        // Get user from database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user already has an active subscription
        if (user.subscription && user.subscription.status === 'active') {
            return res.status(400).json({
                success: false,
                message: 'User already has an active subscription'
            });
        }

        // Handle free plan
        if (plan === 'free') {
            // For free plan, just update user subscription without payment
            user.subscription = {
                plan: plan,
                status: 'active',
                amount: 0,
                currency: 'INR',
                createdAt: new Date(),
                activatedAt: new Date(),
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year for free plan
            };
            user.limits = SUBSCRIPTION_PLANS[plan].features;
            await user.save();

            logger.info(`Free subscription activated for user: ${user.email} (${userId})`);

            return res.json({
                success: true,
                message: 'Free subscription activated successfully',
                data: {
                    subscription: user.subscription,
                    limits: user.limits
                }
            });
        }

        // Create Razorpay order for paid plans
        const orderOptions = {
            amount: SUBSCRIPTION_PLANS[plan].price * 100, // Convert to paise
            currency: 'INR',
            receipt: `sub_${userId.toString().slice(-6)}_${Date.now().toString().slice(-6)}`, // Keep under 40 chars
            notes: {
                userId: userId.toString(),
                plan: plan,
                type: 'subscription'
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        // Store order details in user document
        user.subscription = {
            plan: plan,
            status: 'pending',
            orderId: order.id,
            amount: orderOptions.amount,
            currency: orderOptions.currency,
            createdAt: new Date()
        };

        await user.save();

        logger.info(`Subscription order created for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: 'Subscription order created successfully',
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                key: process.env.RAZORPAY_KEY_ID
            }
        });

    } catch (error) {
        logger.error('Create subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating subscription order'
        });
    }
});

router.post('/create-subscription', authenticateToken, validatePayment, async (req, res) => {
    try {
        const { plan, paymentMethodId, billingDetails } = req.body;
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if plan exists
        if (!SUBSCRIPTION_PLANS[plan]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription plan'
            });
        }

        const planDetails = SUBSCRIPTION_PLANS[plan];

        // Create Razorpay order
        const orderOptions = {
            amount: planDetails.price * 100, // Convert to paise
            currency: planDetails.currency,
            receipt: `sub_${userId.toString().slice(-6)}_${Date.now().toString().slice(-6)}`, // Keep under 40 chars
            notes: {
                userId: userId,
                plan: plan,
                email: user.email
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        // Create subscription record
        const subscription = {
            plan: plan,
            razorpayOrderId: order.id,
            amount: planDetails.price,
            currency: planDetails.currency,
            status: 'pending',
            billingDetails: billingDetails,
            createdAt: new Date()
        };

        // Update user subscription
        user.subscription = subscription;
        user.limits = planDetails.features;
        await user.save();

        logger.info(`Subscription created for user: ${user.email} (${userId}) - Plan: ${plan}`);

        res.json({
            success: true,
            message: 'Subscription created successfully',
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                subscription: subscription
            }
        });

    } catch (error) {
        logger.error('Create subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating subscription',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// VERIFY PAYMENT
// ============================================================================

router.post('/verify-payment', authenticateToken, async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
        const userId = getUserId(req);

        // Verify payment signature
        const text = `${razorpayOrderId}|${razorpayPaymentId}`;
        const signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(text)
            .digest('hex');

        if (signature !== razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature'
            });
        }

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify order matches user's subscription (check both regular and upgrade orders)
        const isRegularOrder = user.subscription.razorpayOrderId === razorpayOrderId;
        const isUpgradeOrder = user.subscription.upgradeOrderId === razorpayOrderId;
        
        logger.info(`Payment verification for user ${user.email}:`, {
            razorpayOrderId,
            userRazorpayOrderId: user.subscription.razorpayOrderId,
            userUpgradeOrderId: user.subscription.upgradeOrderId,
            isRegularOrder,
            isUpgradeOrder
        });
        
        if (!isRegularOrder && !isUpgradeOrder) {
            logger.warn(`Order ID mismatch for user ${user.email}:`, {
                received: razorpayOrderId,
                expectedRegular: user.subscription.razorpayOrderId,
                expectedUpgrade: user.subscription.upgradeOrderId
            });
            return res.status(400).json({
                success: false,
                message: 'Order ID mismatch'
            });
        }

        // Update subscription status
        user.subscription.status = 'active';
        user.subscription.razorpayPaymentId = razorpayPaymentId;
        user.subscription.razorpaySignature = razorpaySignature;
        user.subscription.activatedAt = new Date();
        user.subscription.currentPeriodStart = new Date();
        user.subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        
        // If this is an upgrade order, update the plan
        if (isUpgradeOrder && user.subscription.upgradeToPlan) {
            user.subscription.plan = user.subscription.upgradeToPlan;
            user.subscription.upgradeToPlan = undefined; // Clear upgrade flag
            user.subscription.upgradeOrderId = undefined; // Clear upgrade order ID
            
            // Update user limits based on new plan
            const newPlan = SUBSCRIPTION_PLANS[user.subscription.plan];
            if (newPlan) {
                user.limits = {
                    maxWebsites: newPlan.features.maxWebsites,
                    maxVisitsPerMonth: newPlan.features.maxVisitsPerMonth,
                    maxDataRetentionDays: newPlan.features.maxDataRetentionDays,
                    maxAPIRequestsPerDay: newPlan.features.maxAPIRequestsPerDay
                };
            }
        }

        await user.save();

        logger.info(`Payment verified for user: ${user.email} (${userId}) - Payment ID: ${razorpayPaymentId}`);

        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                subscription: user.subscription,
                limits: user.limits
            }
        });

    } catch (error) {
        logger.error('Verify payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// CREATE RECURRING PAYMENT
// ============================================================================

router.post('/create-recurring-payment', authenticateToken, async (req, res) => {
    try {
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has active subscription
        if (!user.subscription || user.subscription.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'No active subscription found'
            });
        }

        const plan = user.subscription.plan;
        const planDetails = SUBSCRIPTION_PLANS[plan];

        // Create Razorpay order for recurring payment
        const orderOptions = {
            amount: planDetails.price * 100,
            currency: planDetails.currency,
            receipt: `recur_${userId}_${Date.now()}`,
            notes: {
                userId: userId,
                plan: plan,
                type: 'recurring',
                email: user.email
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        logger.info(`Recurring payment order created for user: ${user.email} (${userId}) - Plan: ${plan}`);

        res.json({
            success: true,
            message: 'Recurring payment order created',
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency
            }
        });

    } catch (error) {
        logger.error('Create recurring payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating recurring payment',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// CANCEL SUBSCRIPTION
// ============================================================================

router.post('/cancel-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has active subscription
        if (!user.subscription || user.subscription.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'No active subscription found'
            });
        }

        // Update subscription status
        user.subscription.status = 'canceled';
        user.subscription.canceledAt = new Date();
        user.subscription.cancelAtPeriodEnd = true;

        await user.save();

        logger.info(`Subscription canceled for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: 'Subscription canceled successfully. You will continue to have access until the end of your current billing period.',
            data: {
                subscription: user.subscription
            }
        });

    } catch (error) {
        logger.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error canceling subscription',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// UPGRADE SUBSCRIPTION
// ============================================================================

router.post('/upgrade-subscription', authenticateToken, async (req, res) => {
    try {
        const { newPlan } = req.body;
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user has active subscription
        if (!user.subscription || user.subscription.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'No active subscription found'
            });
        }

        // Check if new plan exists
        if (!SUBSCRIPTION_PLANS[newPlan]) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription plan'
            });
        }

        const currentPlan = user.subscription.plan;
        const newPlanDetails = SUBSCRIPTION_PLANS[newPlan];

        // Check if it's actually an upgrade
        const planHierarchy = ['free', 'basic', 'pro', 'premium', 'enterprise'];
        const currentPlanIndex = planHierarchy.indexOf(currentPlan);
        const newPlanIndex = planHierarchy.indexOf(newPlan);

        if (newPlanIndex <= currentPlanIndex) {
            return res.status(400).json({
                success: false,
                message: 'This is not an upgrade. Please select a higher tier plan.'
            });
        }

        // Handle free plan upgrade (no payment needed)
        if (newPlan === 'free') {
            user.subscription.plan = newPlan;
            user.subscription.amount = 0;
            user.limits = newPlanDetails.features;
            await user.save();

            logger.info(`Subscription upgraded to free plan for user: ${user.email} (${userId})`);

            return res.json({
                success: true,
                message: 'Subscription upgraded successfully',
                data: {
                    subscription: user.subscription,
                    limits: user.limits
                }
            });
        }

        // Create Razorpay order for paid plan upgrade
        const orderOptions = {
            amount: newPlanDetails.price * 100, // Convert to paise
            currency: newPlanDetails.currency,
            receipt: `upgrade_${userId.toString().slice(-6)}_${Date.now().toString().slice(-6)}`,
            notes: {
                userId: userId,
                plan: newPlan,
                type: 'upgrade',
                currentPlan: currentPlan,
                email: user.email
            }
        };

        const order = await razorpay.orders.create(orderOptions);

        // Store upgrade order details
        user.subscription.upgradeOrderId = order.id;
        user.subscription.upgradeToPlan = newPlan;
        await user.save();

        logger.info(`Upgrade order created for user: ${user.email} (${userId}) - From: ${currentPlan} To: ${newPlan}`);

        res.json({
            success: true,
            message: 'Upgrade order created successfully',
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                currentPlan: currentPlan,
                newPlan: newPlan
            }
        });

    } catch (error) {
        logger.error('Upgrade subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating upgrade order',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// REACTIVATE SUBSCRIPTION
// ============================================================================

router.post('/reactivate-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if subscription can be reactivated
        if (!user.subscription || user.subscription.status !== 'canceled') {
            return res.status(400).json({
                success: false,
                message: 'No canceled subscription found'
            });
        }

        // Reactivate subscription
        user.subscription.status = 'active';
        user.subscription.canceledAt = undefined;
        user.subscription.cancelAtPeriodEnd = false;

        await user.save();

        logger.info(`Subscription reactivated for user: ${user.email} (${userId})`);

        res.json({
            success: true,
            message: 'Subscription reactivated successfully',
            data: {
                subscription: user.subscription
            }
        });

    } catch (error) {
        logger.error('Reactivate subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error reactivating subscription',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET SUBSCRIPTION DETAILS
// ============================================================================

router.get('/subscription', authenticateToken, async (req, res) => {
    try {
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                subscription: user.subscription,
                limits: user.limits,
                planDetails: user.subscription ? SUBSCRIPTION_PLANS[user.subscription.plan] : null
            }
        });

    } catch (error) {
        logger.error('Get subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting subscription details',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET AVAILABLE PLANS
// ============================================================================

router.get('/plans', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                plans: SUBSCRIPTION_PLANS
            }
        });

    } catch (error) {
        logger.error('Get plans error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting available plans',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// GET PAYMENT HISTORY
// ============================================================================

router.get('/payment-history', authenticateToken, async (req, res) => {
    try {
        const userId = getUserId(req);

        // Get user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // TODO: Implement payment history from Razorpay API
        // For now, return basic subscription info
        const paymentHistory = [];

        if (user.subscription && user.subscription.razorpayPaymentId) {
            paymentHistory.push({
                id: user.subscription.razorpayPaymentId,
                amount: user.subscription.amount,
                currency: user.subscription.currency,
                status: user.subscription.status,
                date: user.subscription.activatedAt,
                type: 'subscription'
            });
        }

        res.json({
            success: true,
            data: {
                paymentHistory: paymentHistory
            }
        });

    } catch (error) {
        logger.error('Get payment history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting payment history',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

        // Verify webhook signature
        const text = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(text)
            .digest('hex');

        if (signature !== expectedSignature) {
            logger.warn('Invalid webhook signature received');
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }

        const event = req.body;

        // Handle different webhook events
        switch (event.event) {
            case 'payment.captured':
                await handlePaymentCaptured(event.payload);
                break;
            case 'subscription.activated':
                await handleSubscriptionActivated(event.payload);
                break;
            case 'subscription.cancelled':
                await handleSubscriptionCancelled(event.payload);
                break;
            case 'subscription.charged':
                await handleSubscriptionCharged(event.payload);
                break;
            default:
                logger.info(`Unhandled webhook event: ${event.event}`);
        }

        res.json({ success: true, message: 'Webhook processed' });

    } catch (error) {
        logger.error('Webhook processing error:', error);
        res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
});

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

async function handlePaymentCaptured(payload) {
    try {
        const payment = payload.payment.entity;
        const order = payload.order.entity;

        logger.info(`Payment captured: ${payment.id} for order: ${order.id}`);

        // Find user by order ID
        const user = await User.findOne({ 'subscription.razorpayOrderId': order.id });
        if (user) {
            // Update subscription status
            user.subscription.status = 'active';
            user.subscription.razorpayPaymentId = payment.id;
            user.subscription.activatedAt = new Date();
            await user.save();

            logger.info(`Subscription activated for user: ${user.email} (${user._id})`);
        }

    } catch (error) {
        logger.error('Error handling payment captured webhook:', error);
    }
}

async function handleSubscriptionActivated(payload) {
    try {
        const subscription = payload.subscription.entity;
        logger.info(`Subscription activated: ${subscription.id}`);

        // Handle subscription activation logic
        // This would typically involve updating user limits and features

    } catch (error) {
        logger.error('Error handling subscription activated webhook:', error);
    }
}

async function handleSubscriptionCancelled(payload) {
    try {
        const subscription = payload.subscription.entity;
        logger.info(`Subscription cancelled: ${subscription.id}`);

        // Handle subscription cancellation logic
        // This would typically involve updating user access and limits

    } catch (error) {
        logger.error('Error handling subscription cancelled webhook:', error);
    }
}

async function handleSubscriptionCharged(payload) {
    try {
        const subscription = payload.subscription.entity;
        const payment = payload.payment.entity;

        logger.info(`Subscription charged: ${subscription.id} - Payment: ${payment.id}`);

        // Handle recurring payment logic
        // This would typically involve extending user access period

    } catch (error) {
        logger.error('Error handling subscription charged webhook:', error);
    }
}

module.exports = router;
