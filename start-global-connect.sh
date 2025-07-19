#!/bin/bash

# Global Connect Startup Script
# Powered by Willie McClain

echo "🌐 Starting Global Connect Video Communication Platform..."
echo "📅 $(date)"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Using default configuration."
fi

echo "🚀 Launching Global Connect server..."
echo "🌐 Access the application at: http://localhost:3000"
echo "📊 Health check endpoint: http://localhost:3000/health"
echo "💬 Chat and translation features ready!"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start the server
npm start