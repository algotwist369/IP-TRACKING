#!/bin/bash

# IP Tracker Server Installation Script
# This script will help you set up the IP Tracker server

echo "🚀 IP Tracker Server Installation"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Check if MongoDB is running
if ! command -v mongod &> /dev/null; then
    echo "⚠️  MongoDB is not installed or not in PATH."
    echo "   Please install MongoDB 4.4+ and start the service."
    echo "   Visit: https://docs.mongodb.com/manual/installation/"
else
    # Try to connect to MongoDB
    if mongosh --eval "db.runCommand('ping')" --quiet &> /dev/null; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  MongoDB is installed but not running."
        echo "   Please start MongoDB service: sudo systemctl start mongod"
    fi
fi

echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Copy environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "✅ .env file created. Please edit it with your configuration."
else
    echo "✅ .env file already exists"
fi

# Create public directory for tracking script
echo "📁 Creating public directory..."
mkdir -p public

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Start MongoDB service"
echo "3. Run 'npm run dev' to start the server"
echo ""
echo "🔧 Configuration required in .env:"
echo "   - MONGO_URI: MongoDB connection string"
echo "   - JWT_SECRET: Secret key for JWT tokens"
echo "   - STRIPE_SECRET_KEY: Stripe payment key (optional)"
echo "   - EMAIL_*: Email configuration (optional)"
echo ""
echo "📱 To use the tracking script on your websites:"
echo "   - Copy public/tracking-script.js to your web server"
echo "   - Include it in your HTML with proper configuration"
echo "   - See public/example.html for implementation details"
echo ""
echo "📚 For more information, see README.md"
echo ""
echo "🚀 Happy tracking!"
