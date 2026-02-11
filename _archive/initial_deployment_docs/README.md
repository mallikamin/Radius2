# Sitara CRM v3 - Clean Start

Minimal, tested, step-by-step CRM system.

## Quick Start

```bash
cd sitara-crm-v3
docker-compose up --build
```

## Access

- **Frontend**: http://localhost:5174
- **API Docs**: http://localhost:8002/docs
- **Database**: localhost:5434 (sitara/sitara123/sitara_crm)

## Database Access

Connect directly to PostgreSQL:
```bash
docker exec -it sitara_v3_db psql -U sitara -d sitara_crm
```

### Common SQL Commands

```sql
-- View all customers
SELECT * FROM customers;

-- Insert customer (customer_id auto-generated as CUST-0001, CUST-0002, etc.)
INSERT INTO customers (name, mobile, address) 
VALUES ('Test User', '0300-0000000', 'Test Address');

-- Add new column (flexible schema)
ALTER TABLE customers ADD COLUMN occupation VARCHAR(100);

-- View table structure
\d customers

-- Exit
\q
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/customers | List all customers |
| GET | /api/customers/{id} | Get customer by ID/mobile |
| POST | /api/customers | Create customer |
| PUT | /api/customers/{id} | Update customer |
| DELETE | /api/customers/{id} | Delete customer |
| GET | /api/customers/template/download | Download CSV template |
| POST | /api/customers/bulk-import | Bulk import from CSV |

## Project Structure

```
sitara-crm-v3/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── init.sql          # Database schema
│   └── app/
│       └── main.py       # All backend code (simple!)
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx       # All frontend code (simple!)
        └── index.css
```

## Next Steps

Once this works, we'll add:
1. Brokers table
2. Projects table
3. Inventory table
4. Transactions
5. ...etc

Each step tested before moving to next.
