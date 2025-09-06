const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Test authentication routes for development
router.post('/test-login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Simple test credentials
        if (email === 'test@example.com' && password === 'Password123!') {
            const token = jwt.sign(
                { 
                    id: 'test-user-id',
                    email: 'test@example.com',
                    role: 'user'
                },
                process.env.JWT_SECRET || 'test-secret',
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: {
                        id: 'test-user-id',
                        email: 'test@example.com',
                        firstName: 'Test',
                        lastName: 'User',
                        role: 'user',
                        isEmailVerified: true
                    },
                    accessToken: token,
                    refreshToken: token
                }
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error during login'
        });
    }
});

router.post('/test-register', (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        
        // Simple validation
        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters'
            });
        }

        const token = jwt.sign(
            { 
                id: 'test-user-id',
                email: email,
                role: 'user'
            },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: 'test-user-id',
                    email: email,
                    firstName: firstName,
                    lastName: lastName,
                    role: 'user',
                    isEmailVerified: true
                },
                accessToken: token,
                refreshToken: token
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error during registration'
        });
    }
});

module.exports = router;
