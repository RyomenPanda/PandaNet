#!/bin/bash

# PandaNet Update Script
# Simple update without additional users

set -e

echo "🔄 Starting PandaNet update..."

# Configuration
APP_NAME="pandanet"
SERVICE_NAME="$APP_NAME"
CURRENT_USER=$(whoami)

# Load deployment directory from config file
CONFIG_FILE=".pandanet-config"
if [ -f "$CONFIG_FILE" ]; then
    APP_DIR=$(cat "$CONFIG_FILE" | grep "^APP_DIR=" | cut -d'=' -f2)
    if [ -z "$APP_DIR" ]; then
        print_error "Invalid APP_DIR in config file"
        exit 1
    fi
else
    print_error "Config file not found. Please run deploy.sh first to set up the deployment."
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Pull latest changes from git
print_status "Pulling latest changes from git..."
if ! git pull origin main; then
    print_error "Failed to pull from git repository!"
    exit 1
fi

# Stop the service
print_status "Stopping service..."
sudo systemctl stop "$SERVICE_NAME"

# Backup current version
print_status "Creating backup..."
BACKUP_DIR="$APP_DIR/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$APP_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true

# Copy new application files
print_status "Copying new application files..."
cp -r . "$APP_DIR/"

# Preserve uploads directory
print_status "Preserving uploads directory..."
mkdir -p "$APP_DIR/uploads"
chmod 755 "$APP_DIR/uploads"

# Install dependencies
print_status "Installing dependencies..."
cd "$APP_DIR"
npm ci

# Run database migration
print_status "Running database migration..."
npm run db:push

# Start the service
print_status "Starting service..."
sudo systemctl start "$SERVICE_NAME"

# Check service status
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    print_status "Update completed successfully!"
    print_status "Service is running: $(sudo systemctl is-active $SERVICE_NAME)"
    
    # Clean up old backups (keep last 3)
    print_status "Cleaning up old backups..."
    find "$APP_DIR" -name "backup-*" -type d | sort | head -n -3 | xargs rm -rf 2>/dev/null || true
else
    print_error "Service failed to start after update!"
    print_warning "Rolling back to previous version..."
    sudo systemctl stop "$SERVICE_NAME"
    rm -rf "$APP_DIR"/*
    cp -r "$BACKUP_DIR"/* "$APP_DIR/"
    sudo systemctl start "$SERVICE_NAME"
    print_error "Rollback completed. Please check the logs and try again."
    sudo systemctl status "$SERVICE_NAME"
    exit 1
fi

echo ""
print_status "Update completed successfully!"
echo "Check logs: sudo journalctl -u $SERVICE_NAME -f" 