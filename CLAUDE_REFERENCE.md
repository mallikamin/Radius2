# Radius CRM v3 (ORBIT) - Quick Reference Guide

> Practical reference for development. Updated: 2026-01-30

---

## Quick Start

```powershell
# Start local dev (hot-reload)
.\START_LOCAL.ps1
# OR: docker compose up --build

# Start production
.\START_PROD.ps1

# Stop all
.\STOP.ps1
```

| Mode | DB Port | API Port | Frontend Port |
|------|---------|----------|---------------|
| Local Dev | 5440 | 8010 | 5180 |
| Production | 5435 | 8001 | 8081 |

**URLs (Local Dev)**:
- Frontend: http://localhost:5180
- API Docs: http://localhost:8010/docs
- DB: `postgresql://sitara:sitara123@localhost:5440/sitara_crm`

---

## Key Files Map

### Backend (FastAPI + SQLAlchemy)
```
backend/app/
├── main.py              # MAIN FILE (6600+ lines) - Models + All endpoints
├── reports.py           # Report calculations (642 lines)
└── report_generator.py  # PDF/Excel generation (703 lines)
```

### Frontend (React + Vite + Tailwind)
```
frontend/src/
├── App.jsx              # MAIN FILE (6000+ lines) - All views + logic
├── main.jsx             # React entry point
├── index.css            # Global styles
└── components/
    ├── InventoryMapViewer.jsx
    ├── OrphanTrackingPanel.jsx
    └── Vector/          # Vector mapping module (25 components)
        ├── VectorMap.jsx       # Main container (52KB)
        ├── MapCanvas.jsx       # Canvas rendering (36KB)
        ├── Toolbar.jsx         # Drawing tools (31KB)
        ├── Sidebar.jsx         # Navigation (19KB)
        └── [20+ more panels]
```

### Configuration
```
docker-compose.yml       # Local dev config
docker-compose.prod.yml  # Production overrides
nginx/default.conf       # Nginx proxy config
frontend/vite.config.js  # Vite + proxy setup
```

### Database Scripts
```
database/
├── create_all_tables.sql   # Full schema creation
├── setup_all_tables.sql    # Alternative full setup
├── apply_indexes.sql       # Performance indexes
└── phase[1-6]_*.sql        # Incremental migrations
```

---

## Database Models Quick Ref

### Core CRM Models (in `main.py`)

| Model | Table | ID Format | Key Fields |
|-------|-------|-----------|------------|
| `Customer` | customers | CUST-XXXX | name, mobile, email, address |
| `Broker` | brokers | BRK-XXXX | name, mobile, company, linked_customer_id |
| `Project` | projects | PRJ-XXXX | name, location, status, total_units |
| `CompanyRep` | company_reps | REP-XXXX | name, email, role, password_hash |
| `Inventory` | inventory | INV-XXXX | project_id, unit_number, status, price |
| `Transaction` | transactions | TXN-XXXX | customer_id, inventory_id, total_amount |
| `Installment` | installments | INST-XXXX | transaction_id, amount, due_date, status |

### Financial Models

| Model | Table | Purpose |
|-------|-------|---------|
| `Receipt` | receipts | Payments received from customers |
| `ReceiptAllocation` | receipt_allocations | Links receipts to installments |
| `Creditor` | creditors | Suppliers/creditors |
| `Payment` | payments | Outgoing payments (commissions) |
| `PaymentAllocation` | payment_allocations | Links payments to payees |

### Buyback Models

| Model | Table | ID Format | Purpose |
|-------|-------|-----------|---------|
| `Buyback` | buybacks | BBK-XXXX | Main buyback records |
| `BuybackLedger` | buyback_ledger | BBL-XXXXX | Payment tracking to customers |
| `PlotHistory` | plot_history | - | Ownership timeline tracking |

### Supporting Models

| Model | Table | Purpose |
|-------|-------|---------|
| `Interaction` | interactions | Customer communication log |
| `Campaign` | campaigns | Marketing campaigns |
| `Lead` | leads | Sales leads |
| `MediaFile` | media_files | File attachments |

### Vector Models (13 total)
`VectorProject`, `VectorAnnotation`, `VectorShape`, `VectorLabel`, `VectorLegend`, `VectorBranch`, `VectorCreatorNote`, `VectorChangeLog`, `VectorProjectBackup`, `VectorBackupSettings`, `VectorReconciliation`

---

## API Endpoints Quick Ref

### Authentication
```
POST /api/auth/login          # Login, returns JWT
GET  /api/auth/me             # Current user info
POST /api/auth/change-password
```

### CRUD Pattern (applies to most entities)
```
GET    /api/{entity}          # List (with pagination/filters)
GET    /api/{entity}/{id}     # Get one
POST   /api/{entity}          # Create
PUT    /api/{entity}/{id}     # Update
DELETE /api/{entity}/{id}     # Delete
POST   /api/{entity}/bulk-import  # CSV import
GET    /api/{entity}/template/download  # CSV template
```

### Entity-specific endpoints
```
# Dashboard
GET /api/dashboard/summary
GET /api/dashboard/customer-stats
GET /api/dashboard/project-stats
GET /api/dashboard/revenue-trends

# Inventory
GET /api/inventory/available
GET /api/inventory/summary

# Transactions
GET /api/transactions/summary

# Receipts
GET /api/receipts/customer/{cid}/transactions

# Payments
GET /api/payments/available-commissions
GET /api/payments/broker/{broker_id}

# Reports
GET /api/reports/customers/detailed/{id}
GET /api/reports/customers/pdf/{id}
GET /api/reports/projects/{id}
GET /api/reports/brokers/{id}

# Buybacks
GET    /api/buybacks                    # List with filters
GET    /api/buybacks/summary            # Statistics
GET    /api/buybacks/{id}               # Full details with ledger
POST   /api/buybacks                    # Initiate buyback
PUT    /api/buybacks/{id}               # Update rates/settlement
DELETE /api/buybacks/{id}               # Cancel (if pending)
POST   /api/buybacks/{id}/approve       # Approve buyback
POST   /api/buybacks/{id}/complete      # Complete & re-add to inventory
GET    /api/buybacks/{id}/ledger        # Get ledger entries
POST   /api/buybacks/{id}/ledger        # Record payment to customer
DELETE /api/buybacks/{id}/ledger/{lid}  # Reverse entry

# Plot History & Costing
GET /api/inventory/{id}/history         # Plot ownership timeline
GET /api/costing/project/{id}           # Project costing summary
GET /api/costing/plot/{id}              # Plot costing details
```

---

## Common Code Patterns

### Backend: Add New Endpoint (main.py)

```python
# Standard GET list with pagination
@app.get("/api/myentity")
async def list_myentity(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    items = db.query(MyEntity).offset(skip).limit(limit).all()
    return [item.to_dict() for item in items]

# Standard POST create
@app.post("/api/myentity")
async def create_myentity(
    data: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    item = MyEntity(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.to_dict()
```

### Backend: Add New Model (main.py)

```python
class MyEntity(Base):
    __tablename__ = "my_entities"

    id = Column(String(20), primary_key=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
```

### Frontend: API Call Pattern (App.jsx)

```javascript
// GET request
const fetchData = async () => {
    try {
        const response = await api.get('/api/myentity');
        setData(response.data);
    } catch (error) {
        console.error('Error:', error);
        setError(error.response?.data?.detail || 'Failed to load');
    }
};

// POST request
const createItem = async (data) => {
    try {
        const response = await api.post('/api/myentity', data);
        setData([...data, response.data]);
        setShowForm(false);
    } catch (error) {
        setError(error.response?.data?.detail || 'Failed to create');
    }
};
```

### Frontend: New Tab/View Pattern (App.jsx)

```javascript
// 1. Add to tabs array
const tabs = [...existing, { id: 'mytab', label: 'My Tab', icon: '📋' }];

// 2. Add state
const [myData, setMyData] = useState([]);

// 3. Add render case in main return
{activeTab === 'mytab' && (
    <div className="p-6">
        {/* Tab content */}
    </div>
)}
```

---

## User Roles & Permissions

| Role | Level | Access |
|------|-------|--------|
| `admin` | Full | Everything including settings |
| `manager` | High | Most features except settings |
| `user` | Standard | Basic CRUD, no payments/reports |
| `viewer` | Read-only | Dashboard, view-only access |

**Check role in backend**:
```python
if current_user.get("role") not in ["admin", "manager"]:
    raise HTTPException(status_code=403, detail="Access denied")
```

**Check role in frontend**:
```javascript
const userRole = localStorage.getItem('userRole');
{['admin', 'manager'].includes(userRole) && <SensitiveComponent />}
```

---

## Database Access

### Direct DB Connection
```bash
# Local dev
docker exec -it radius2-db-1 psql -U sitara -d sitara_crm

# Production
docker exec -it radius2-db-1 psql -U sitara_prod -d sitara_crm
```

### Common Queries
```sql
-- Check table structure
\d+ tablename

-- Count records
SELECT COUNT(*) FROM customers;

-- Recent transactions
SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10;

-- Inventory by project
SELECT project_id, status, COUNT(*)
FROM inventory
GROUP BY project_id, status;
```

---

## File Locations for Common Tasks

### To add a new database field:
1. `backend/app/main.py` - Add to model class
2. `database/` - Create migration SQL
3. `backend/app/main.py` - Update `to_dict()` method
4. `frontend/src/App.jsx` - Update form/display

### To add a new API endpoint:
1. `backend/app/main.py` - Add endpoint function

### To add a new frontend tab:
1. `frontend/src/App.jsx` - Add tab definition, state, and render logic

### To modify reports:
1. `backend/app/reports.py` - Report calculations
2. `backend/app/report_generator.py` - PDF/Excel formatting

### To modify vector mapping:
1. `frontend/src/components/Vector/` - React components
2. `backend/app/main.py` - Vector model endpoints (search "Vector")

---

## Environment Variables

### Backend (set in docker-compose.yml)
```
DATABASE_URL=postgresql://user:pass@host:port/dbname
SECRET_KEY=your-secret-key-here
```

### Frontend (set in vite.config.js)
```
VITE_API_URL=/api  # Proxied to backend
```

---

## Testing

### API Testing
```bash
# Run test script
cd backend
python test_endpoints.py http://localhost:8010

# Manual curl test
curl http://localhost:8010/api/health
curl -X POST http://localhost:8010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

### Frontend Testing
```bash
# Check build
cd frontend
npm run build
```

---

## Buyback Feature

### Status Flow
```
Inventory:  available → sold → buyback_pending → available (loop)
Transaction: active → bought_back
Buyback:    pending → approved → in_progress → completed/cancelled
Installments: pending/partial → cleared_buyback (on buyback completion)
```

### Costing Formula
```
Net Price per Marla = Selling Rate - Commission - Buyback Profit - Markup

Example (5 marla @ 500K/marla):
- Original Sale: 2,500,000
- Commission (2%): 50,000
- Buyback Profit (5%): 125,000
- Company Cost: 2,325,000
```

### Key Files
- Backend endpoints: `backend/app/main.py` (search "BUYBACK API")
- Frontend views: `frontend/src/App.jsx` (BuybacksView, CostingView)
- Migration: `database/phase7_buybacks.sql`

---

## Known Issues / WIP

1. **Vector view** - Needs more work (WIP in git log)
2. **VectorMerge** - Merged but needs refinement
3. **Large main.py** - Consider splitting into modules
4. **Large App.jsx** - Consider component extraction
5. **Buyback** - Run `phase7_buybacks.sql` migration before using

---

## Git Workflow

```bash
# Check status
git status

# Create feature branch
git checkout -b feature/my-feature

# Commit changes
git add .
git commit -m "feat: description"

# Common commit prefixes
# feat: new feature
# fix: bug fix
# refactor: code improvement
# docs: documentation
# chore: maintenance
```

---

## Troubleshooting

### Container won't start
```bash
docker compose logs backend
docker compose logs frontend
docker compose logs db
```

### Database connection failed
1. Check if db container is running: `docker ps`
2. Check db logs: `docker compose logs db`
3. Verify DATABASE_URL in docker-compose.yml

### Frontend not updating
1. Clear browser cache
2. Check vite logs: `docker compose logs frontend`
3. Restart: `docker compose restart frontend`

### API returning 500
1. Check backend logs: `docker compose logs backend`
2. Check database connectivity
3. Look for Python traceback in logs

---

## Quick Commands Reference

```powershell
# Rebuild specific service
docker compose build backend
docker compose build frontend

# View logs (follow)
docker compose logs -f backend

# Restart service
docker compose restart backend

# Shell into container
docker exec -it radius2-backend-1 /bin/bash
docker exec -it radius2-frontend-1 /bin/sh

# Database backup
docker exec radius2-db-1 pg_dump -U sitara sitara_crm > backup.sql

# Database restore
docker exec -i radius2-db-1 psql -U sitara sitara_crm < backup.sql
```

---

## File Upload Paths

Media files stored at: `backend/media/`
```
media/
├── interactions/   # Interaction attachments
├── payments/       # Payment documents
├── projects/       # Project files
├── receipts/       # Receipt scans
└── transactions/   # Transaction documents
```

Max upload size: 100MB (configured in nginx)

---

*This document serves as a quick reference. For detailed deployment instructions, see DEPLOYMENT.md*
