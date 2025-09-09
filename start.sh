#!/bin/bash

# IP Tracker Server Startup Script
# This script provides different startup options for the IP Tracker server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  IP Tracker Server Startup${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Check if Node.js is installed
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    print_status "Node.js version: $NODE_VERSION"
}

# Check if npm is installed
check_npm() {
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_status "npm version: $NPM_VERSION"
}

# Install dependencies
install_deps() {
    print_status "Installing dependencies..."
    npm install
    print_status "Dependencies installed successfully"
}

# Check if Redis is running
check_redis() {
    if command -v redis-cli &> /dev/null; then
        if redis-cli ping &> /dev/null; then
            print_status "Redis is running"
        else
            print_warning "Redis is not running. Some features may not work optimally."
            print_warning "To install Redis: sudo apt-get install redis-server"
        fi
    else
        print_warning "Redis CLI not found. Redis may not be installed."
        print_warning "To install Redis: sudo apt-get install redis-server"
    fi
}

# Check if MongoDB is running
check_mongodb() {
    if command -v mongosh &> /dev/null; then
        if mongosh --eval "db.runCommand('ping')" &> /dev/null; then
            print_status "MongoDB is running"
        else
            print_warning "MongoDB is not running. Please start MongoDB first."
            print_warning "To start MongoDB: sudo systemctl start mongod"
        fi
    else
        print_warning "MongoDB shell not found. MongoDB may not be installed."
        print_warning "To install MongoDB: https://docs.mongodb.com/manual/installation/"
    fi
}

# Create logs directory
create_logs_dir() {
    if [ ! -d "logs" ]; then
        mkdir -p logs
        print_status "Created logs directory"
    fi
}

# Start server in development mode
start_dev() {
    print_status "Starting server in development mode..."
    npm run dev
}

# Start enhanced server in development mode
start_dev_enhanced() {
    print_status "Starting enhanced server in development mode..."
    npm run dev:enhanced
}

# Start server with PM2
start_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Installing PM2..."
        npm install -g pm2
    fi
    
    print_status "Starting server with PM2..."
    npm run start:pm2
    print_status "Server started with PM2. Use 'npm run monitor:pm2' to monitor."
}

# Start server with PM2 in production mode
start_pm2_prod() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Installing PM2..."
        npm install -g pm2
    fi
    
    print_status "Starting server with PM2 in production mode..."
    npm run start:pm2:prod
    print_status "Server started with PM2 in production mode. Use 'npm run monitor:pm2' to monitor."
}

# Show help
show_help() {
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  dev          Start in development mode (original server)"
    echo "  dev-enhanced Start in development mode (enhanced server)"
    echo "  pm2          Start with PM2 (development)"
    echo "  pm2-prod     Start with PM2 (production)"
    echo "  install      Install dependencies only"
    echo "  check        Check system requirements"
    echo "  help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 dev          # Start development server"
    echo "  $0 pm2          # Start with PM2"
    echo "  $0 pm2-prod     # Start production with PM2"
}

# Main script logic
main() {
    print_header
    
    case "${1:-help}" in
        "dev")
            check_node
            check_npm
            check_redis
            check_mongodb
            create_logs_dir
            install_deps
            start_dev
            ;;
        "dev-enhanced")
            check_node
            check_npm
            check_redis
            check_mongodb
            create_logs_dir
            install_deps
            start_dev_enhanced
            ;;
        "pm2")
            check_node
            check_npm
            check_redis
            check_mongodb
            create_logs_dir
            install_deps
            start_pm2
            ;;
        "pm2-prod")
            check_node
            check_npm
            check_redis
            check_mongodb
            create_logs_dir
            install_deps
            start_pm2_prod
            ;;
        "install")
            check_node
            check_npm
            install_deps
            ;;
        "check")
            check_node
            check_npm
            check_redis
            check_mongodb
            print_status "System check completed"
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Run main function with all arguments
main "$@"
