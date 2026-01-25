"""
Sitara CRM v3 - Clean Start
Single file for simplicity. Can be split later.
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional, List
import os
import uuid

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
# MODEL
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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

# ============================================
# SCHEMAS (Request/Response models)
# ============================================
class CustomerCreate(BaseModel):
    name: str
    mobile: str
    address: Optional[str] = None
    cnic: Optional[str] = None
    email: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    cnic: Optional[str] = None
    email: Optional[str] = None

class CustomerResponse(BaseModel):
    id: str
    customer_id: str
    name: str
    mobile: str
    address: Optional[str]
    cnic: Optional[str]
    email: Optional[str]
    created_at: str
    
    class Config:
        from_attributes = True

# ============================================
# FASTAPI APP
# ============================================
app = FastAPI(
    title="Sitara CRM",
    description="Real Estate CRM - Clean Start",
    version="3.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# HEALTH CHECK
# ============================================
@app.get("/")
def root():
    return {"status": "running", "app": "Sitara CRM v3"}

@app.get("/health")
def health():
    return {"status": "healthy"}

# ============================================
# CUSTOMERS API
# ============================================
@app.get("/api/customers", response_model=List[CustomerResponse])
def list_customers(db: Session = Depends(get_db)):
    """Get all customers"""
    customers = db.query(Customer).order_by(Customer.created_at.desc()).all()
    return [
        CustomerResponse(
            id=str(c.id),
            customer_id=c.customer_id,
            name=c.name,
            mobile=c.mobile,
            address=c.address,
            cnic=c.cnic,
            email=c.email,
            created_at=str(c.created_at)
        )
        for c in customers
    ]

@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str, db: Session = Depends(get_db)):
    """Get customer by ID (UUID or customer_id like CUST-0001)"""
    # Try UUID first
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
    except:
        customer = None
    
    # Try customer_id
    if not customer:
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
    
    # Try mobile
    if not customer:
        customer = db.query(Customer).filter(Customer.mobile == customer_id).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {
        "id": str(customer.id),
        "customer_id": customer.customer_id,
        "name": customer.name,
        "mobile": customer.mobile,
        "address": customer.address,
        "cnic": customer.cnic,
        "email": customer.email,
        "created_at": str(customer.created_at)
    }

@app.post("/api/customers")
def create_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    """Create new customer"""
    # Check duplicate mobile
    existing = db.query(Customer).filter(Customer.mobile == data.mobile).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Customer with mobile {data.mobile} already exists")
    
    # Create customer (customer_id auto-generated by DB trigger)
    customer = Customer(
        name=data.name,
        mobile=data.mobile,
        address=data.address,
        cnic=data.cnic,
        email=data.email
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
    # Find customer
    try:
        customer = db.query(Customer).filter(Customer.id == customer_id).first()
    except:
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check duplicate mobile if changing
    if data.mobile and data.mobile != customer.mobile:
        existing = db.query(Customer).filter(Customer.mobile == data.mobile).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Mobile {data.mobile} already in use")
    
    # Update fields
    if data.name is not None:
        customer.name = data.name
    if data.mobile is not None:
        customer.mobile = data.mobile
    if data.address is not None:
        customer.address = data.address
    if data.cnic is not None:
        customer.cnic = data.cnic
    if data.email is not None:
        customer.email = data.email
    
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
# BULK IMPORT (CSV)
# ============================================
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
import csv
import io

@app.get("/api/customers/template/download")
def download_customer_template():
    """Download CSV template for bulk import"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow(['name*', 'mobile*', 'address', 'cnic', 'email'])
    
    # Example rows
    writer.writerow(['Ahmed Khan', '0300-1234567', 'DHA Phase 5, Lahore', '35201-1234567-1', 'ahmed@email.com'])
    writer.writerow(['Sara Ali', '0321-9876543', 'Gulberg III', '', 'sara@email.com'])
    
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
    decoded = content.decode('utf-8-sig')  # Handle BOM
    reader = csv.DictReader(io.StringIO(decoded))
    
    results = {"success": 0, "errors": [], "created": []}
    
    for i, row in enumerate(reader, start=2):
        try:
            name = row.get('name*', '').strip()
            mobile = row.get('mobile*', '').strip()
            
            if not name or not mobile:
                results["errors"].append(f"Row {i}: Name and mobile are required")
                continue
            
            # Check duplicate
            existing = db.query(Customer).filter(Customer.mobile == mobile).first()
            if existing:
                results["errors"].append(f"Row {i}: Mobile {mobile} already exists")
                continue
            
            customer = Customer(
                name=name,
                mobile=mobile,
                address=row.get('address', '').strip() or None,
                cnic=row.get('cnic', '').strip() or None,
                email=row.get('email', '').strip() or None
            )
            db.add(customer)
            db.flush()
            
            results["success"] += 1
            results["created"].append({"customer_id": customer.customer_id, "name": name})
            
        except Exception as e:
            results["errors"].append(f"Row {i}: {str(e)}")
    
    db.commit()
    return results
