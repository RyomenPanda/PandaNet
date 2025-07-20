# PandaNet Deployment Guide

This guide covers deploying PandaNet on a Linux server with a remote PostgreSQL database.

## Prerequisites

### On Your Application Server:
- Ubuntu 20.04+ or CentOS 8+
- Node.js 18+ 
- Git
- Nginx (if using reverse proxy)
- sudo access

### On Your Database Server:
- PostgreSQL 13+
- Network access between servers

## Quick Deployment

### 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd PandaNet

# Create environment file
cp env.production.example .env
```

### 2. Configure Environment

Edit `.env` file:

```env
# Database Configuration (Remote PostgreSQL)
DATABASE_URL=postgresql://username:password@your-db-server-ip:5432/database_name

# Session Configuration
SESSION_SECRET=your-super-secure-session-secret-here-change-this

# Server Configuration
NODE_ENV=production
PORT=3000  # Change this to your preferred port

# Optional: Reverse Proxy Configuration
TRUST_PROXY=true
```

### 3. Deploy

```bash
# Deploy the application (runs as current user)
npm run deploy
```

**During deployment, you'll be prompted to choose the deployment directory:**
- **Option 1**: Home directory (`~/pandanet`) - Recommended for most users
- **Option 2**: Custom directory - Enter any path you prefer
- **Option 3**: Current directory - Deploy in the current folder

The deployment configuration will be saved to `.pandanet-config` for future updates.

## Manual Deployment Steps

If you prefer manual deployment:

### 1. Setup Application Directory

```bash
# Choose your deployment directory
mkdir -p /path/to/your/choice
cp -r . /path/to/your/choice/
```

### 2. Install Dependencies

```bash
cd /path/to/your/choice
npm ci --only=production
```

### 3. Setup Database

```bash
npm run db:push
```

### 4. Create Systemd Service

Create `/etc/systemd/system/pandanet.service`:

```ini
[Unit]
Description=PandaNet Chat Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/path/to/your/choice
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pandanet

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/path/to/your/choice/uploads

[Install]
WantedBy=multi-user.target
```

### 5. Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable pandanet
sudo systemctl start pandanet
```

## Port Configuration

### Choose Your Port

You can deploy to any port you want by:

1. **Setting PORT in .env**:
   ```env
   PORT=8080  # or any port you prefer
   ```

2. **Or setting environment variable**:
   ```bash
   export PORT=8080
   npm run deploy
   ```

3. **Or modifying the service file**:
   ```ini
   Environment=PORT=8080
   ```

### Common Port Options:
- `3000` - Default Node.js port
- `8080` - Alternative web port
- `5000` - Another common choice
- `8000` - Development-like port

## Nginx Configuration

### 1. Copy Configuration Template

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/pandanet
```

### 2. Edit Configuration

Replace placeholders in `/etc/nginx/sites-available/pandanet`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain
    
    location / {
        proxy_pass http://127.0.0.1:3000;  # Replace 3000 with your port
        # ... rest of config
    }
}
```

### 3. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/pandanet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Database Setup

### Remote PostgreSQL Configuration

1. **On Database Server**:
   ```bash
   # Install PostgreSQL
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   
   # Create database and user
   sudo -u postgres psql
   ```

2. **Create Database**:
   ```sql
   CREATE DATABASE pandanet;
   CREATE USER pandanet_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE pandanet TO pandanet_user;
   \q
   ```

3. **Configure PostgreSQL for Remote Access**:
   ```bash
   # Edit postgresql.conf
   sudo nano /etc/postgresql/*/main/postgresql.conf
   # Uncomment and set: listen_addresses = '*'
   
   # Edit pg_hba.conf
   sudo nano /etc/postgresql/*/main/pg_hba.conf
   # Add: host pandanet pandanet_user your-app-server-ip/32 md5
   
   # Restart PostgreSQL
   sudo systemctl restart postgresql
   ```

## Management Commands

### Service Management

```bash
# Check status
sudo systemctl status pandanet

# View logs
sudo journalctl -u pandanet -f

# Restart service
sudo systemctl restart pandanet

# Stop service
sudo systemctl stop pandanet

# Enable auto-start
sudo systemctl enable pandanet
```

### Application Updates

```bash
# Update application (automatically pulls from git)
npm run update

# Or manual update
git pull
sudo systemctl stop pandanet
cp -r . /path/to/your/deployment/directory/
cd /path/to/your/deployment/directory/
npm ci --only=production
npm run db:push
sudo systemctl start pandanet
```

**Note**: The `npm run update` command now automatically:
1. Pulls latest changes from the git repository
2. Creates a backup of the current version
3. Updates the application files
4. Installs dependencies
5. Runs database migrations
6. Restarts the service
7. Includes rollback functionality if the update fails

### Backup and Restore

```bash
# Backup database
pg_dump -h your-db-server -U pandanet_user -d pandanet > backup.sql

# Restore database
psql -h your-db-server -U pandanet_user -d pandanet < backup.sql

# Backup uploads
tar -czf uploads-backup.tar.gz /path/to/your/deployment/directory/uploads/
```

## Configuration File

After deployment, a `.pandanet-config` file is created containing:
- `APP_DIR`: Your chosen deployment directory
- `PORT`: The port your application runs on
- `SERVICE_NAME`: The systemd service name

This file is used by the update script to know where to deploy updates.

## Troubleshooting

### Common Issues

1. **Service won't start**:
   ```bash
   sudo journalctl -u pandanet -n 50
   ```

2. **Database connection failed**:
   - Check DATABASE_URL in .env
   - Verify network connectivity
   - Check PostgreSQL logs

3. **Permission denied**:
   ```bash
   # Check if you own the directory
   ls -la /path/to/your/deployment/directory/
   ```

4. **Port already in use**:
   ```bash
   sudo netstat -tlnp | grep :3000
   sudo lsof -i :3000
   ```

5. **Update fails**:
   ```bash
   # Check if .pandanet-config exists
   cat .pandanet-config
   
   # Check git status
   git status
   ```

### Log Locations

- **Application logs**: `sudo journalctl -u pandanet`
- **Nginx logs**: `/var/log/nginx/`
- **System logs**: `/var/log/syslog`

## Security Considerations

1. **Firewall**: Configure firewall to allow only necessary ports
2. **SSL**: Use Let's Encrypt for HTTPS
3. **Database**: Use strong passwords and limit network access
4. **Updates**: Keep system and application updated
5. **Backups**: Regular database and file backups

## Performance Tuning

1. **Node.js**: Increase memory limit if needed
2. **PostgreSQL**: Tune configuration for your workload
3. **Nginx**: Enable gzip and caching
4. **System**: Monitor resource usage

## Monitoring

```bash
# Check resource usage
htop
df -h
free -h

# Monitor application
sudo journalctl -u pandanet -f

# Check database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
``` 