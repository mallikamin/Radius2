# Radius CRM v3 - Office Server Deployment Guide

This guide provides step-by-step instructions for deploying the Radius CRM application to your office server.

## Prerequisites

### Server Requirements
- **Operating System**: Linux (Ubuntu 20.04+ recommended) or Windows Server
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 1.29 or higher
- **Disk Space**: Minimum 10GB free space
- **RAM**: Minimum 4GB (8GB recommended)
- **Network**: Static IP address or domain name

### Software Installation

#### For Linux (Ubuntu/Debian):
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add current user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker-compose --version
```

#### For Windows Server:
1. Download Docker Desktop for Windows from https://www.docker.com/products/docker-desktop
2. Install and restart the server
3. Verify installation in PowerShell:
```powershell
docker --version
docker-compose --version
```

## Pre-Deployment Checklist

- [ ] Server has Docker and Docker Compose installed
- [ ] Server has sufficient disk space and RAM
- [ ] Firewall ports are configured (see Network Configuration section)
- [ ] Backup strategy is planned
- [ ] Domain name or static IP is configured (if applicable)

## Step 1: Prepare Deployment Directory

```bash
# Create deployment directory
sudo mkdir -p /opt/radius-crm
cd /opt/radius-crm

# Copy project files to server
# Option 1: Using Git (recommended)
git clone <your-repository-url> .

# Option 2: Using SCP/SFTP
# Upload the entire radius2 folder to /opt/radius-crm
```

## Step 2: Configure Environment Variables

### Backend Environment Variables

Edit `docker-compose.yml` or create a `.env` file:

```yaml
# For production, update these values:
services:
  db:
    environment:
      POSTGRES_USER: radius_admin          # Change from default
      POSTGRES_PASSWORD: <STRONG_PASSWORD> # Change from default
      POSTGRES_DB: radius_crm
  
  backend:
    environment:
      DATABASE_URL: postgresql://radius_admin:<STRONG_PASSWORD>@db:5432/radius_crm
      SECRET_KEY: <GENERATE_STRONG_SECRET_KEY>  # Change from default
```

**Important Security Notes:**
- Generate a strong password for PostgreSQL (minimum 16 characters, mix of letters, numbers, symbols)
- Generate a strong SECRET_KEY for the backend (use: `openssl rand -hex 32`)
- Never commit these values to version control

### Frontend Configuration

If you need to change the API endpoint, update `frontend/src/App.jsx`:
```javascript
const api = axios.create({ baseURL: '/api' }); // For same-domain deployment
// OR
const api = axios.create({ baseURL: 'http://your-server-ip:8002/api' }); // For different domain
```

## Step 3: Network Configuration

### Port Mapping

The default ports in `docker-compose.yml` are:
- **Frontend**: 5174 (external) → 5173 (container)
- **Backend API**: 8002 (external) → 8000 (container)
- **PostgreSQL**: 5434 (external) → 5432 (container)

**For production, consider:**
- Using a reverse proxy (Nginx/Apache) for frontend on port 80/443
- Restricting PostgreSQL port (5434) to localhost only
- Using environment-specific port mappings

### Firewall Configuration

#### Ubuntu/Debian (UFW):
```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow custom ports (if not using reverse proxy)
sudo ufw allow 5174/tcp
sudo ufw allow 8002/tcp

# Block PostgreSQL from external access (recommended)
sudo ufw deny 5434/tcp

# Enable firewall
sudo ufw enable
```

#### Windows Server:
1. Open Windows Defender Firewall
2. Add inbound rules for ports 80, 443, 5174, 8002
3. Block port 5434 from external access

### Reverse Proxy Setup (Recommended)

#### Nginx Configuration Example:

Create `/etc/nginx/sites-available/radius-crm`:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain

    # Frontend
    location / {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/radius-crm /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Step 4: Database Setup and Migration

### Initial Database Setup

The database will be automatically initialized when you first run `docker-compose up`. The `init.sql` file will:
- Create all necessary tables
- Set up indexes for optimization
- Create sequences and triggers

### If Migrating Existing Data

1. **Backup existing database** (if applicable):
```bash
# Export data
pg_dump -U sitara -d sitara_crm > backup_$(date +%Y%m%d).sql
```

2. **Restore to new database**:
```bash
# After containers are running
docker exec -i sitara_v3_db psql -U sitara -d sitara_crm < backup_YYYYMMDD.sql
```

3. **Apply indexes** (if not already applied):
```bash
docker exec -i sitara_v3_db psql -U sitara -d sitara_crm < /docker-entrypoint-initdb.d/init.sql
```

## Step 5: Build and Deploy

### Build and Start Services

```bash
cd /opt/radius-crm

# Build images (first time or after code changes)
docker-compose build

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# Check logs
docker-compose logs -f
```

### Verify Deployment

1. **Check container status**:
```bash
docker-compose ps
# All services should show "Up" status
```

2. **Check backend health**:
```bash
curl http://localhost:8002/api/health
# Should return JSON with table counts
```

3. **Check frontend**:
   - Open browser: `http://your-server-ip:5174` or `http://your-domain.com`
   - Should see the Radius CRM interface

4. **Check database**:
```bash
docker exec -it sitara_v3_db psql -U sitara -d sitara_crm
# Run: SELECT COUNT(*) FROM customers;
# Exit: \q
```

## Step 6: Post-Deployment Configuration

### Create Initial Admin User (if needed)

If your application requires an admin user, create it through the API or database:
```bash
# Example: Create via API
curl -X POST http://localhost:8002/api/customers \
  -H "Content-Type: application/json" \
  -d '{"name": "Admin User", "mobile": "0300-0000000", "email": "admin@example.com"}'
```

### Configure Automatic Startup

#### Linux (systemd):

Create `/etc/systemd/system/radius-crm.service`:
```ini
[Unit]
Description=Radius CRM Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/radius-crm
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable radius-crm
sudo systemctl start radius-crm
```

#### Windows Server:

1. Open Task Scheduler
2. Create a new task that runs on system startup
3. Action: Start a program
4. Program: `C:\Program Files\Docker\Docker\resources\bin\docker-compose.exe`
5. Arguments: `up -d`
6. Start in: `C:\path\to\radius-crm`

## Step 7: Monitoring and Maintenance

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db

# Last 100 lines
docker-compose logs --tail 100 backend
```

### Health Checks

```bash
# Backend health endpoint
curl http://localhost:8002/api/health

# Container health
docker-compose ps
```

### Database Backup

#### Automated Backup Script

Create `/opt/radius-crm/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/radius-crm/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

docker exec sitara_v3_db pg_dump -U sitara sitara_crm | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 30 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

Make executable and schedule:
```bash
chmod +x /opt/radius-crm/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /opt/radius-crm/backup.sh
```

#### Manual Backup

```bash
# Create backup
docker exec sitara_v3_db pg_dump -U sitara sitara_crm > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i sitara_v3_db psql -U sitara -d sitara_crm < backup_YYYYMMDD.sql
```

### Database Maintenance

```bash
# Connect to database
docker exec -it sitara_v3_db psql -U sitara -d sitara_crm

# Run maintenance commands
VACUUM ANALYZE;
REINDEX DATABASE sitara_crm;

# Exit
\q
```

## Step 8: Troubleshooting

### Common Issues

#### 1. Containers won't start
```bash
# Check logs
docker-compose logs

# Check if ports are already in use
sudo netstat -tulpn | grep -E '5174|8002|5434'

# Stop conflicting services or change ports in docker-compose.yml
```

#### 2. Database connection errors
```bash
# Verify database is healthy
docker-compose ps db

# Check database logs
docker-compose logs db

# Test connection
docker exec -it sitara_v3_db psql -U sitara -d sitara_crm
```

#### 3. Frontend can't connect to backend
- Check CORS settings in `backend/app/main.py`
- Verify backend URL in frontend code
- Check firewall rules
- Verify both containers are running

#### 4. 500 Internal Server Error
```bash
# Check backend logs
docker-compose logs backend

# Common causes:
# - Database connection issues
# - Missing environment variables
# - Type conversion errors (check recent fixes)
```

#### 5. Out of disk space
```bash
# Clean up Docker resources
docker system prune -a

# Remove old backups
find /opt/radius-crm/backups -name "*.sql.gz" -mtime +30 -delete
```

### Performance Optimization

1. **Database Indexes**: Already included in `init.sql`
2. **Connection Pooling**: Configured in `main.py` (pool_size=20)
3. **Query Optimization**: Review slow queries in logs
4. **Caching**: Consider adding Redis for session/data caching

### Updating the Application

```bash
cd /opt/radius-crm

# Pull latest code (if using Git)
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs -f
```

## Step 9: Security Hardening

### Production Security Checklist

- [ ] Changed default database passwords
- [ ] Changed default SECRET_KEY
- [ ] Restricted PostgreSQL port to localhost
- [ ] Set up SSL/TLS certificates (Let's Encrypt)
- [ ] Configured firewall rules
- [ ] Set up regular backups
- [ ] Limited container resource usage
- [ ] Enabled Docker security scanning
- [ ] Set up log rotation
- [ ] Configured fail2ban (Linux)

### SSL/TLS Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is set up automatically
```

## Step 10: Access Information

After successful deployment:

- **Frontend URL**: `http://your-server-ip:5174` or `http://your-domain.com`
- **API Documentation**: `http://your-server-ip:8002/docs`
- **Database**: `localhost:5434` (only accessible from server)
  - Username: `sitara` (or your configured user)
  - Password: `sitara123` (or your configured password)
  - Database: `sitara_crm`

## Support and Maintenance

### Regular Maintenance Tasks

1. **Weekly**: Check logs for errors
2. **Monthly**: Review and clean up old backups
3. **Quarterly**: Update Docker images and dependencies
4. **As needed**: Database VACUUM and REINDEX

### Getting Help

- Check application logs: `docker-compose logs`
- Check system resources: `docker stats`
- Review this deployment guide
- Contact your system administrator

## Appendix: Quick Reference Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f

# Rebuild after code changes
docker-compose build && docker-compose up -d

# Database backup
docker exec sitara_v3_db pg_dump -U sitara sitara_crm > backup.sql

# Database restore
docker exec -i sitara_v3_db psql -U sitara -d sitara_crm < backup.sql

# Access database shell
docker exec -it sitara_v3_db psql -U sitara -d sitara_crm

# Check container status
docker-compose ps

# View resource usage
docker stats
```

---

**Last Updated**: January 2026
**Version**: 3.0.0

