"""
Radius CRM v3 - Clean Start
Customers & Brokers Module
"""
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine, Column, String, Text, DateTime, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional, List
import os
import uuid
import csv
import io

# ============================================
# DATABASE SETUP
# ============================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://sitara:sitara123@localhost:5432/sitara_crm")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================
# MODELS
# ============================================
class Customer(Base):
    __tablename__ = "customers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    mobile = Column(String(20), unique=True, nullable=False)
    address = Column(Text)
    cnic = Column(String(20))
    email = Column(String(255))
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Broker(Base):
    __tablename__ = "brokers"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    broker_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    mobile = Column(String(20), unique=True, nullable=False)
    cnic = Column(String(20))
    email = Column(String(255))
    company = Column(String(255))
    address = Column(Text)
    commission_rate = Column(Numeric(5, 2), default=2.00)
    bank_name = Column(String(100))
    bank_account = Column(String(50))
    bank_iban = Column(String(50))
    notes = Column(Text)
    status = Column(String(20), default="active")
    linked_customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# ============================================
# SCHEMAS
# ============================================
class CustomerCreate(BaseModel):
    name: str
    mobile: str
    address: Optional[str] = None
    cnic: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    cnic: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

class BrokerCreate(BaseModel):
    name: str
    mobile: str
    cnic: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    commission_rate: Optional[float] = 2.0
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_iban: Optional[str] = None
    notes: Optional[str] = None

class BrokerUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    cnic: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    address: Optional[str] = None
    commission_rate: Optional[float] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_iban: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ============================================
# FASTAPI APP
# ============================================
app = FastAPI(
    title="Radius CRM",
    description="Real Estate CRM - Clean & Professional",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# HEALTH CHECK
# ============================================
@app.get("/")
def root():
    return {"status": "running", "app": "Radius CRM v3"}

@app.get("/health")
def health():
    return {"status": "healthy"}


# ============================================
# DUPLICATE CHECK UTILITY
# ============================================
@app.get("/api/check-mobile/{mobile}")
def check_mobile_exists(mobile: str, db: Session = Depends(get_db)):
    """Check if mobile exists in customers or brokers"""
    customer = db.query(Customer).filter(Customer.mobile == mobile).first()
    broker = db.query(Broker).filter(Broker.mobile == mobile).first()
    
    return {
        "mobile": mobile,
        "exists_in_customers": customer is not None,
        "exists_in_brokers": broker is not None,
        "customer_name": customer.name if customer else None,
        "broker_name": broker.name if broker else None
    }


# ============================================
# CUSTOMERS API
# ============================================
@app.get("/api/customers")
def list_customers(db: Session = Depends(get_db)):
    """Get all customers"""
    customers = db.query(Customer).order_by(Customer.created_at.desc()).all()
    return [
        {
            "id": str(c.id),
            "customer_id": c.customer_id,
            "name": c.name,
            "mobile": c.mobile,
            "address": c.address,
            "cnic": c.cnic,
            "email": c.email,
            "notes": c.notes,
            "created_at": str(c.created_at)
        }
        for c in customers
    ]

@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str, db: Session = Depends(get_db)):
    """Get customer by ID"""
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
    except:
        customer = None
    
    if not customer:
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
    if not customer:
        customer = db.query(Customer).filter(Customer.mobile == customer_id).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    broker = db.query(Broker).filter(Broker.mobile == customer.mobile).first()
    
    return {
        "id": str(customer.id),
        "customer_id": customer.customer_id,
        "name": customer.name,
        "mobile": customer.mobile,
        "address": customer.address,
        "cnic": customer.cnic,
        "email": customer.email,
        "notes": customer.notes,
        "created_at": str(customer.created_at),
        "is_also_broker": broker is not None,
        "broker_id": broker.broker_id if broker else None
    }

@app.post("/api/customers")
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    """Create new customer"""
    existing = db.query(Customer).filter(Customer.mobile == data.mobile).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Customer with mobile {data.mobile} already exists")
    
    customer = Customer(
        name=data.name,
        mobile=data.mobile,
        address=data.address,
        cnic=data.cnic,
        email=data.email,
        notes=data.notes
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    
    return {
        "message": "Customer created successfully",
        "id": str(customer.id),
        "customer_id": customer.customer_id
    }

@app.put("/api/customers/{customer_id}")
def update_customer(customer_id: str, data: CustomerUpdate, db: Session = Depends(get_db)):
    """Update customer"""
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
    except:
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    if data.mobile and data.mobile != customer.mobile:
        existing = db.query(Customer).filter(Customer.mobile == data.mobile).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Mobile {data.mobile} already in use")
    
    for field in ["name", "mobile", "address", "cnic", "email", "notes"]:
        value = getattr(data, field, None)
        if value is not None:
            setattr(customer, field, value)
    
    db.commit()
    return {"message": "Customer updated successfully"}

@app.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: str, db: Session = Depends(get_db)):
    """Delete customer"""
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
    except:
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    db.delete(customer)
    db.commit()
    return {"message": "Customer deleted successfully"}


# ============================================
# BROKERS API
# ============================================
@app.get("/api/brokers")
def list_brokers(db: Session = Depends(get_db)):
    """Get all brokers with stats"""
    brokers = db.query(Broker).order_by(Broker.created_at.desc()).all()
    
    result = []
    for b in brokers:
        customer = db.query(Customer).filter(Customer.mobile == b.mobile).first()
        
        result.append({
            "id": str(b.id),
            "broker_id": b.broker_id,
            "name": b.name,
            "mobile": b.mobile,
            "cnic": b.cnic,
            "email": b.email,
            "company": b.company,
            "address": b.address,
            "commission_rate": float(b.commission_rate or 2.0),
            "bank_name": b.bank_name,
            "bank_account": b.bank_account,
            "bank_iban": b.bank_iban,
            "notes": b.notes,
            "status": b.status,
            "created_at": str(b.created_at),
            "is_also_customer": customer is not None,
            "customer_id": customer.customer_id if customer else None,
            "stats": {
                "total_deals": 0,
                "total_sales_value": 0,
                "commission_earned": 0,
                "commission_paid": 0,
                "commission_pending": 0
            }
        })
    
    return result

@app.get("/api/brokers/summary")
def get_brokers_summary(db: Session = Depends(get_db)):
    """Get brokers dashboard summary"""
    total_brokers = db.query(Broker).count()
    active_brokers = db.query(Broker).filter(Broker.status == "active").count()
    
    return {
        "total_brokers": total_brokers,
        "active_brokers": active_brokers,
        "total_deals": 0,
        "total_commission_owed": 0,
        "total_commission_paid": 0
    }

@app.get("/api/brokers/{broker_id}")
def get_broker(broker_id: str, db: Session = Depends(get_db)):
    """Get broker by ID with full details"""
    try:
        broker = db.query(Broker).filter(Broker.id == broker_id).first()
    except:
        broker = None
    
    if not broker:
        broker = db.query(Broker).filter(Broker.broker_id == broker_id).first()
    if not broker:
        broker = db.query(Broker).filter(Broker.mobile == broker_id).first()
    
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    
    customer = db.query(Customer).filter(Customer.mobile == broker.mobile).first()
    
    return {
        "id": str(broker.id),
        "broker_id": broker.broker_id,
        "name": broker.name,
        "mobile": broker.mobile,
        "cnic": broker.cnic,
        "email": broker.email,
        "company": broker.company,
        "address": broker.address,
        "commission_rate": float(broker.commission_rate or 2.0),
        "bank_name": broker.bank_name,
        "bank_account": broker.bank_account,
        "bank_iban": broker.bank_iban,
        "notes": broker.notes,
        "status": broker.status,
        "created_at": str(broker.created_at),
        "is_also_customer": customer is not None,
        "customer_id": customer.customer_id if customer else None,
        "transactions": [],
        "financials": {
            "total_sales": 0,
            "total_received": 0,
            "due_now": 0,
            "future_receivable": 0,
            "commission_earned": 0,
            "commission_paid": 0,
            "commission_pending": 0
        }
    }

@app.post("/api/brokers")
def create_broker(data: BrokerCreate, db: Session = Depends(get_db)):
    """Create new broker"""
    existing_broker = db.query(Broker).filter(Broker.mobile == data.mobile).first()
    if existing_broker:
        raise HTTPException(status_code=400, detail=f"Broker with mobile {data.mobile} already exists")
    
    existing_customer = db.query(Customer).filter(Customer.mobile == data.mobile).first()
    
    broker = Broker(
        name=data.name,
        mobile=data.mobile,
        cnic=data.cnic,
        email=data.email,
        company=data.company,
        address=data.address,
        commission_rate=data.commission_rate or 2.0,
        bank_name=data.bank_name,
        bank_account=data.bank_account,
        bank_iban=data.bank_iban,
        notes=data.notes,
        linked_customer_id=existing_customer.id if existing_customer else None
    )
    db.add(broker)
    db.commit()
    db.refresh(broker)
    
    return {
        "message": "Broker created successfully",
        "id": str(broker.id),
        "broker_id": broker.broker_id,
        "linked_to_customer": existing_customer is not None,
        "customer_id": existing_customer.customer_id if existing_customer else None
    }

@app.put("/api/brokers/{broker_id}")
def update_broker(broker_id: str, data: BrokerUpdate, db: Session = Depends(get_db)):
    """Update broker"""
    try:
        broker = db.query(Broker).filter(Broker.id == broker_id).first()
    except:
        broker = db.query(Broker).filter(Broker.broker_id == broker_id).first()
    
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    
    if data.mobile and data.mobile != broker.mobile:
        existing = db.query(Broker).filter(Broker.mobile == data.mobile).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Mobile {data.mobile} already in use by another broker")
    
    for field in ["name", "mobile", "cnic", "email", "company", "address", 
                  "commission_rate", "bank_name", "bank_account", "bank_iban", "notes", "status"]:
        value = getattr(data, field, None)
        if value is not None:
            setattr(broker, field, value)
    
    db.commit()
    return {"message": "Broker updated successfully"}

@app.delete("/api/brokers/{broker_id}")
def delete_broker(broker_id: str, db: Session = Depends(get_db)):
    """Delete broker"""
    try:
        broker = db.query(Broker).filter(Broker.id == broker_id).first()
    except:
        broker = db.query(Broker).filter(Broker.broker_id == broker_id).first()
    
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    
    db.delete(broker)
    db.commit()
    return {"message": "Broker deleted successfully"}


# ============================================
# BULK IMPORT - CUSTOMERS
# ============================================
@app.get("/api/customers/template/download")
def download_customer_template():
    """Download CSV template for customer bulk import"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name*', 'mobile*', 'address', 'cnic', 'email', 'notes'])
    writer.writerow(['Ahmed Khan', '0300-1234567', 'DHA Phase 5, Lahore', '35201-1234567-1', 'ahmed@email.com', 'VIP customer'])
    writer.writerow(['Sara Ali', '0321-9876543', 'Gulberg III', '', 'sara@email.com', ''])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=customers_template.csv"}
    )

@app.post("/api/customers/bulk-import")
async def bulk_import_customers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bulk import customers from CSV"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files allowed")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(decoded))
    
    results = {"success": 0, "errors": [], "created": []}
    
    for i, row in enumerate(reader, start=2):
        try:
            name = row.get('name*', '').strip()
            mobile = row.get('mobile*', '').strip()
            
            if not name or not mobile:
                results["errors"].append(f"Row {i}: Name and mobile are required")
                continue
            
            existing = db.query(Customer).filter(Customer.mobile == mobile).first()
            if existing:
                results["errors"].append(f"Row {i}: Mobile {mobile} already exists")
                continue
            
            customer = Customer(
                name=name,
                mobile=mobile,
                address=row.get('address', '').strip() or None,
                cnic=row.get('cnic', '').strip() or None,
                email=row.get('email', '').strip() or None,
                notes=row.get('notes', '').strip() or None
            )
            db.add(customer)
            db.flush()
            
            results["success"] += 1
            results["created"].append({"customer_id": customer.customer_id, "name": name})
            
        except Exception as e:
            results["errors"].append(f"Row {i}: {str(e)}")
    
    db.commit()
    return results


# ============================================
# BULK IMPORT - BROKERS
# ============================================
@app.get("/api/brokers/template/download")
def download_broker_template():
    """Download CSV template for broker bulk import"""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name*', 'mobile*', 'company', 'commission_rate', 'cnic', 'email', 'bank_name', 'bank_account', 'notes'])
    writer.writerow(['Rizwan Properties', '0300-1111111', 'Rizwan Real Estate', '2.5', '', 'rizwan@email.com', 'HBL', '1234567890', 'Top performer'])
    writer.writerow(['Ali Realtors', '0321-2222222', 'Ali & Sons', '2.0', '', '', '', '', ''])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=brokers_template.csv"}
    )

@app.post("/api/brokers/bulk-import")
async def bulk_import_brokers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bulk import brokers from CSV"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files allowed")
    
    content = await file.read()
    decoded = content.decode('utf-8-sig')
    reader = csv.DictReader(io.StringIO(decoded))
    
    results = {"success": 0, "errors": [], "created": []}
    
    for i, row in enumerate(reader, start=2):
        try:
            name = row.get('name*', '').strip()
            mobile = row.get('mobile*', '').strip()
            
            if not name or not mobile:
                results["errors"].append(f"Row {i}: Name and mobile are required")
                continue
            
            existing = db.query(Broker).filter(Broker.mobile == mobile).first()
            if existing:
                results["errors"].append(f"Row {i}: Broker with mobile {mobile} already exists")
                continue
            
            customer = db.query(Customer).filter(Customer.mobile == mobile).first()
            
            commission_rate = row.get('commission_rate', '').strip()
            broker = Broker(
                name=name,
                mobile=mobile,
                company=row.get('company', '').strip() or None,
                commission_rate=float(commission_rate) if commission_rate else 2.0,
                cnic=row.get('cnic', '').strip() or None,
                email=row.get('email', '').strip() or None,
                bank_name=row.get('bank_name', '').strip() or None,
                bank_account=row.get('bank_account', '').strip() or None,
                notes=row.get('notes', '').strip() or None,
                linked_customer_id=customer.id if customer else None
            )
            db.add(broker)
            db.flush()
            
            results["success"] += 1
            results["created"].append({
                "broker_id": broker.broker_id, 
                "name": name,
                "linked_to_customer": customer is not None
            })
            
        except Exception as e:
            results["errors"].append(f"Row {i}: {str(e)}")
    
    db.commit()
    return results
