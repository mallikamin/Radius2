# Sitara CRM - Complete Deployment Guide

## System Overview

Sitara CRM is a real estate CRM with:
- **Frontend**: React (pre-built, served by nginx)
- **Backend**: Python FastAPI
- **Database**: PostgreSQL 15

All services run in Docker containers.

---

## Port Configuration

### Office Server Ports (Default)
| Service    | Port | Access URL                  |
|------------|------|------------------------------|
| Frontend   | 8081 | http://localhost:8081        |
| API        | 8001 | http://localhost:8001/api    |
| PostgreSQL | 5435 | localhost:5435               |

### Running with Vector System
| System     | Frontend | API  | Database |
|------------|----------|------|----------|
| Vector     | 8080     | 3001 | 5433     |
| Sitara CRM | 8081     | 8001 | 5435     |

**Both systems can run simultaneously!**

---

## Fresh Installation

### Step 1: Extract Files
```
Extract radius2.zip to: C:\Docker\SitaraCRM
```

### Step 2: Verify Structure
```
C:\Docker\SitaraCRM\
├── backend\
│   ├── app\
│   │   ├── main.py
│   │   ├── reports.py
│   │   └── report_generator.py
│   ├── migrations\
│   ├── Dockerfile
│   └── requirements.txt
├── database\
│   ├── init.sql (main schema)
│   └── *.sql (migration scripts)
├── frontend\
│   └── dist\ (pre-built React app)
├── media\ (file uploads folder)
├── nginx\
│   └── default.conf
├── docker-compose.yml
├── SETUP.ps1
├── STOP.ps1
├── switch-to-local-ports.ps1
└── revert-to-office-ports.ps1
```

### Step 3: Run Setup Verification
```powershell
cd C:\Docker\SitaraCRM
.\SETUP.ps1
```

### Step 4: Deploy
```powershell
docker compose up -d --build
```

### Step 5: Wait & Verify
```powershell
# Wait 30-60 seconds for database initialization
docker compose ps
```

All services should show "running" or "healthy".

### Step 6: Test
Open browser: **http://localhost:8081**

---

## Upgrading Existing Installation

### Option A: Keep Database (Recommended)
```powershell
cd C:\Docker\SitaraCRM

# Stop services (keeps data)
docker compose down

# Replace files with new version
# (extract new radius2.zip, overwrite files)

# Rebuild and start
docker compose up -d --build
```

### Option B: Full Reset (Deletes All Data!)
```powershell
# WARNING: This deletes all database data!
docker compose down -v
docker compose up -d --build
```

---

## Database Migration (Existing Data)

If you have existing Sitara data in another database:

### Export from Old Database
```powershell
pg_dump -h old_host -p old_port -U sitara -d sitara_crm > backup.sql
```

### Import to New Database
```powershell
# Start containers first
docker compose up -d

# Wait for postgres to be ready
docker compose ps

# Import data
docker exec -i sitara_crm_db psql -U sitara -d sitara_crm < backup.sql
```

### Run Migrations (if needed)
```powershell
# Vector fields migration
docker exec -i sitara_crm_db psql -U sitara -d sitara_crm < database/add_vector_fields.sql
```

---

## Port Switching

### For Local Testing
```powershell
.\switch-to-local-ports.ps1
docker compose up -d --build
# Access at: http://localhost:8082
```

### Revert to Office
```powershell
.\revert-to-office-ports.ps1
docker compose up -d --build
# Access at: http://localhost:8081
```

---

## Common Commands

```powershell
# Start all services
docker compose up -d

# Stop all services
docker compose down

# Restart specific service
docker compose restart api
docker compose restart web

# View logs
docker compose logs              # All services
docker compose logs api          # API only
docker compose logs -f api       # Follow logs

# Check status
docker compose ps

# Shell into container
docker exec -it sitara_crm_api /bin/sh
docker exec -it sitara_crm_db psql -U sitara -d sitara_crm

# Resource usage
docker stats
```

---

## Troubleshooting

### Services Not Starting
```powershell
# Check what's wrong
docker compose logs

# Check if ports in use
netstat -an | findstr "8081 8001 5435"
```

### Database Connection Error
```powershell
# Check postgres health
docker compose ps
docker compose logs postgres

# Restart postgres
docker compose restart postgres
```

### API 500 Error
```powershell
# Check API logs
docker compose logs api --tail 100
```

### Frontend Not Loading
```powershell
# Check nginx
docker compose logs web

# Verify dist exists
dir frontend\dist
```

### Port Conflict
Either stop the conflicting service, or use local ports:
```powershell
.\switch-to-local-ports.ps1
```

---

## Windows Firewall (Remote Access)

To access from other computers:

1. Windows Defender Firewall > Advanced Settings
2. Inbound Rules > New Rule
3. Port > TCP > 8081
4. Allow the connection
5. Name: "Sitara CRM Frontend"

---

## Database Credentials

```
Host: localhost
Port: 5435
Database: sitara_crm
Username: sitara
Password: sitara_secure_2024
```

---

## Support

If issues persist:
1. `docker compose logs > logs.txt`
2. Note what step failed
3. Share logs.txt with development team
