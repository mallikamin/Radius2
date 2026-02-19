# Radius CRM v3 (ORBIT) — Analytics Branch

> Full-featured Real Estate CRM with inventory, transactions, buybacks, and vector mapping.

## Agent Onboarding (READ FIRST)

Before making any changes, read these files:
- **`ERROR_LOG.md`** — Known errors and fixes. Avoid repeating past mistakes.
- **`HANDOFF_NOTES.md`** — Cross-agent handoff context from last session.
- **`PAUSE_CHECKPOINT_*.md`** — Latest session state (if exists).

When you fix a new error, **append it to `ERROR_LOG.md`** with: date, error, context, root cause, fix, rule.

**Worktree note**: This is the `prod/18thFeb` branch. Main worktree at `C:\Users\Malik\Desktop\radius2`. Cross-cutting fixes should be synced to both ERROR_LOG.md files.

---

## !!! CRITICAL: Docker Volume Safety — READ BEFORE ANY docker-compose CHANGES !!!

**This has broken data TWICE.** Docker volume names are IMMUTABLE. Changing them silently orphans all data.

**Local Dev `docker-compose.yml` MUST always have:**
```yaml
volumes:
  orbit_dev_postgres:
    external: true
    name: radius2_sitara_v3_postgres
```

**Production `docker-compose.prod.yml` MUST always have:**
```yaml
volumes:
  sitara_postgres_data:
    external: true
    name: sitara_postgres_data
```

**Rules:**
- NEVER remove `external: true` or change `name:` — this causes silent total data loss
- BEFORE any `docker compose up`: verify volume config is correct
- If creating a new compose file or branch: COPY the volume section exactly as above

## MCP Integration

This project is connected via MCP. Use these tools:

```python
# Set context first
set_project(project_name="orbit")

# CRM Operations
crm_ops(operation="query_customers", name="Khan", limit=10)
crm_ops(operation="query_inventory", project_id="PRJ-001", status="available")
crm_ops(operation="generate_report", report_type="customer_detailed", entity_id="CUST-001")

# Direct DB queries
database_ops(operation="query", database="orbit_db", sql="SELECT * FROM customers WHERE status = 'active'")
```

---

## Quick Start

```powershell
.\START_LOCAL.ps1    # Start local dev
.\START_PROD.ps1     # Start production
.\STOP.ps1           # Stop all
```

| Mode | DB Port | API Port | Frontend Port |
|------|---------|----------|---------------|
| Local Dev | 5440 | 8010 | 5180 |
| Production | 5435 | 8001 | 8081 |

**URLs (Local Dev):**
- Frontend: http://localhost:5180
- API Docs: http://localhost:8010/docs
- DB: `postgresql://sitara:sitara123@localhost:5440/sitara_crm`

---

## Office Server (Production)

**Path:** `C:\Docker\SitaraCRM`
**Git Branch:** `Prod30012026`
**Single compose file:** `docker-compose.yml` (no prod override)

| Container | Name | Port |
|-----------|------|------|
| Database (Postgres) | `sitara_crm_db` | 5435 |
| Backend API (FastAPI) | `sitara_crm_api` | 8001 |
| Frontend (Nginx) | `sitara_crm_web` | 8081 |

**DB Connection:** `postgresql://sitara:sitara_secure_2024@localhost:5435/sitara_crm`

**Start/Stop:**
```powershell
cd C:\Docker\SitaraCRM
docker compose up -d        # Start
docker compose down          # Stop
docker compose logs -f       # Logs
```

**DB Shell:**
```powershell
docker exec -it sitara_crm_db psql -U sitara -d sitara_crm
```

**Login User:** REP-0002 (Admin, admin role)
- Reset password: `UPDATE company_reps SET password_hash = NULL WHERE rep_id = 'REP-0002';`

---

## DigitalOcean Co-Hosting Guardrail (Orbit + POS)

- Read and follow: `DIGITALOCEAN_DEPLOY_PLAYBOOK.md`
- After any Orbit container rebuild, always verify `orbit_web` and `orbit_api` are reachable from `pos-system-nginx-1`.
- If missing from POS network, reconnect immediately:
```bash
docker network connect pos-system_default orbit_web
docker network connect pos-system_default orbit_api
docker exec pos-system-nginx-1 nginx -t && docker exec pos-system-nginx-1 nginx -s reload
```
- Do not restart or modify POS services during Orbit deploy unless explicitly requested.

---

## Architecture

```
radius2/
├── backend/app/
│   ├── main.py              # MAIN FILE (6600+ lines) - Models + All endpoints
│   ├── reports.py           # Report calculations
│   └── report_generator.py  # PDF/Excel generation
├── frontend/src/
│   ├── App.jsx              # MAIN FILE (6000+ lines) - All views + logic
│   └── components/
│       └── Vector/          # Vector mapping module (25 components)
│           ├── VectorMap.jsx       # Main container
│           ├── MapCanvas.jsx       # Canvas rendering
│           └── Toolbar.jsx         # Drawing tools
├── database/
│   ├── create_all_tables.sql   # Full schema
│   └── phase[1-7]_*.sql        # Migrations
└── docker-compose.yml
```

---

## Key Files to Modify

| Task | File |
|------|------|
| Add new API endpoint | `backend/app/main.py` |
| Modify reports | `backend/app/reports.py`, `report_generator.py` |
| Add new frontend tab | `frontend/src/App.jsx` |
| Vector mapping | `frontend/src/components/Vector/*.jsx` |
| Database migrations | `database/*.sql` |

---

## Database Models

### Core CRM
| Model | Table | ID Format |
|-------|-------|-----------|
| `Customer` | customers | CUST-XXXX |
| `Broker` | brokers | BRK-XXXX |
| `Project` | projects | PRJ-XXXX |
| `Inventory` | inventory | INV-XXXX |
| `Transaction` | transactions | TXN-XXXX |
| `Installment` | installments | INST-XXXX |

### Financial
- `Receipt`, `ReceiptAllocation` - Payments received
- `Creditor`, `Payment`, `PaymentAllocation` - Outgoing payments

### Buyback
- `Buyback` (BBK-XXXX) - Buyback records
- `BuybackLedger` (BBL-XXXXX) - Payment tracking
- `PlotHistory` - Ownership timeline

### Vector (13 models)
- `VectorProject`, `VectorAnnotation`, `VectorShape`, `VectorLabel`, etc.

---

## API Patterns

### CRUD (all entities)
```
GET    /api/{entity}          # List
GET    /api/{entity}/{id}     # Get one
POST   /api/{entity}          # Create
PUT    /api/{entity}/{id}     # Update
DELETE /api/{entity}/{id}     # Delete
POST   /api/{entity}/bulk-import
```

### Key Endpoints
```
# Dashboard
GET /api/dashboard/summary
GET /api/dashboard/revenue-trends

# Buybacks
POST /api/buybacks                    # Initiate
POST /api/buybacks/{id}/approve       # Approve
POST /api/buybacks/{id}/complete      # Complete
POST /api/buybacks/{id}/ledger        # Record payment

# Plot History
GET /api/inventory/{id}/history
GET /api/costing/project/{id}
GET /api/costing/plot/{id}
```

---

## User Roles

| Role | Access |
|------|--------|
| `admin` | Full - everything including settings |
| `manager` | High - most features except settings |
| `user` | Standard - basic CRUD |
| `viewer` | Read-only - dashboard only |

---

## Buyback Flow

```
Inventory:  available → sold → buyback_pending → available
Transaction: active → bought_back
Buyback:    pending → approved → in_progress → completed
Installments: pending → cleared_buyback
```

**Costing Formula:**
```
Net Price = Selling Rate - Commission - Buyback Profit - Markup
```

---

## Common DB Queries

```sql
-- Connect
docker exec -it radius2-db-1 psql -U sitara -d sitara_crm

-- Inventory by project
SELECT project_id, status, COUNT(*) FROM inventory GROUP BY project_id, status;

-- Recent transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;

-- Customer receivables
SELECT c.name, SUM(i.amount) as pending
FROM customers c
JOIN transactions t ON t.customer_id = c.id
JOIN installments i ON i.transaction_id = t.id
WHERE i.status = 'pending'
GROUP BY c.id;
```

---

## Backend Patterns

```python
# Standard GET list
@app.get("/api/myentity")
async def list_myentity(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    items = db.query(MyEntity).offset(skip).limit(limit).all()
    return [item.to_dict() for item in items]

# Check role
if current_user.get("role") not in ["admin", "manager"]:
    raise HTTPException(status_code=403, detail="Access denied")
```

---

## Frontend Patterns

```javascript
// API call
const fetchData = async () => {
    const response = await api.get('/api/myentity');
    setData(response.data);
};

// New tab
const tabs = [...existing, { id: 'mytab', label: 'My Tab', icon: '📋' }];
{activeTab === 'mytab' && <div>Content</div>}
```

---

## Related Docs
- `CLAUDE_REFERENCE.md` - Full technical reference
- `DEPLOYMENT.md` - Deployment instructions
- `AUTH_SETUP.md` - Authentication setup
- `DIGITALOCEAN_DEPLOY_PLAYBOOK.md` - Orbit deploy + network safety checklist
