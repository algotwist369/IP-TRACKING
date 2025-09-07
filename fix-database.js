const mongoose = require('mongoose');
require('dotenv').config();

async function fixDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ip-tracker');
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        
        // Drop the problematic index
        try {
            await db.collection('users').dropIndex('websites.trackingCode_1');
            console.log('Dropped problematic index');
        } catch (error) {
            console.log('Index might not exist or already dropped:', error.message);
        }

        // Create a proper sparse index
        await db.collection('users').createIndex(
            { 'websites.trackingCode': 1 }, 
            { sparse: true, unique: true }
        );
        console.log('Created proper sparse index');

        // Clear any existing users to start fresh
        await db.collection('users').deleteMany({});
        console.log('Cleared existing users');

        console.log('Database fixed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing database:', error);
        process.exit(1);
    }
}

fixDatabase();
