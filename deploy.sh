#!/bin/bash

# PandaNet Deployment Script for Linux
# Simple deployment without creating additional users

set -e  # Exit on any error

echo "🚀 Starting PandaNet deployment..."

# Configuration
APP_NAME="pandanet"
SERVICE_NAME="$APP_NAME"
CURRENT_USER=$(whoami)
PORT=${PORT:-3000}  # Default port, can be overridden

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found! Please create it from env.production.example"
    exit 1
fi

# Get deployment directory from user
echo ""
print_status "Choose deployment directory:"
echo "1. Home directory (~/pandanet)"
echo "2. Custom directory"
echo "3. Current directory"
read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        APP_DIR="$HOME/$APP_NAME"
        ;;
    2)
        read -p "Enter custom deployment path: " custom_path
        if [ -z "$custom_path" ]; then
            print_error "Path cannot be empty"
            exit 1
        fi
        # Expand ~ to home directory if present
        APP_DIR=$(eval echo "$custom_path")
        ;;
    3)
        APP_DIR="$(pwd)"
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Validate and create directory
print_status "Setting up deployment directory: $APP_DIR"

if [ ! -d "$APP_DIR" ]; then
    print_status "Creating directory..."
    mkdir -p "$APP_DIR"
fi

# Check if directory is writable
if [ ! -w "$APP_DIR" ]; then
    print_error "Directory $APP_DIR is not writable!"
    exit 1
fi

# Save configuration to file
CONFIG_FILE=".pandanet-config"
echo "APP_DIR=$APP_DIR" > "$CONFIG_FILE"
echo "PORT=$PORT" >> "$CONFIG_FILE"
echo "SERVICE_NAME=$SERVICE_NAME" >> "$CONFIG_FILE"
print_status "Configuration saved to $CONFIG_FILE"

# Copy application files
print_status "Copying application files..."
cp -r . "$APP_DIR/"

# Create uploads directory
print_status "Creating uploads directory..."
mkdir -p "$APP_DIR/uploads"
chmod 755 "$APP_DIR/uploads"

# Install dependencies
print_status "Installing dependencies..."
cd "$APP_DIR"
npm ci

# Run database migration
print_status "Running database migration..."
npm run db:push

# Create systemd service file
print_status "Creating systemd service..."

# Find Node.js path dynamically
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    print_error "Node.js not found in PATH. Please install Node.js first."
    exit 1
fi
print_status "Found Node.js at: $NODE_PATH"

sudo tee "/etc/systemd/system/$SERVICE_NAME.service" > /dev/null <<EOF
[Unit]
Description=PandaNet Chat Application
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_PATH server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/uploads

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
print_status "Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl start "$SERVICE_NAME"

# Check service status
if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    print_status "Service started successfully!"
    print_status "Application is running on port $PORT"
    print_status "Service status: $(sudo systemctl is-active $SERVICE_NAME)"
else
    print_error "Service failed to start!"
    sudo systemctl status "$SERVICE_NAME"
    exit 1
fi

# Show useful commands
echo ""
print_status "Deployment completed successfully!"
echo ""
echo "Useful commands:"
echo "  Check status:   sudo systemctl status $SERVICE_NAME"
echo "  View logs:      sudo journalctl -u $SERVICE_NAME -f"
echo "  Restart:        sudo systemctl restart $SERVICE_NAME"
echo "  Stop:           sudo systemctl stop $SERVICE_NAME"
echo "  Update:         npm run update"
echo ""
echo "Application URL: http://your-server-ip:$PORT"
echo "Deployment directory: $APP_DIR"
echo "" 