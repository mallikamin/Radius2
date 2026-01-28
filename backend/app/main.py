"""
Radius CRM v3 - Complete Backend
Customers, Brokers, Projects, Inventory, Transactions
"""
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Query, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, String, Text, DateTime, Numeric, ForeignKey, Integer, Date, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, timedelta, datetime
from dateutil.relativedelta import relativedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import uuid
import csv
import io

# ============================================
# DATABASE SETUP
# ============================================
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://sitara:sitara123@localhost:5432/sitara_crm")
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600
)
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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

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
    updated_at = Column(DateTime, server_default=func.now())

class Project(Base):
    __tablename__ = "projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    location = Column(String(255))
    description = Column(Text)
    status = Column(String(20), default="active")
    # Vector-specific fields (optional - for linked projects)
    map_pdf_base64 = Column(Text, nullable=True)
    map_name = Column(String(255), nullable=True)
    map_size = Column(JSONB, nullable=True)
    vector_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class CompanyRep(Base):
    __tablename__ = "company_reps"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rep_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    mobile = Column(String(20))
    email = Column(String(255))
    password_hash = Column(String(255))  # Hashed password
    role = Column(String(50), default="user")  # admin, manager, user, viewer
    status = Column(String(20), default="active")
    created_at = Column(DateTime, server_default=func.now())

class Inventory(Base):
    __tablename__ = "inventory"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    inventory_id = Column(String(20), unique=True, nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    unit_number = Column(String(50), nullable=False)
    unit_type = Column(String(50), default="plot")
    block = Column(String(50))
    area_marla = Column(Numeric(10, 2), nullable=False)
    rate_per_marla = Column(Numeric(15, 2), nullable=False)
    status = Column(String(20), default="available")
    factor_details = Column(Text)
    notes = Column(Text)
    # Vector-specific fields (plot coordinates for map rendering)
    plot_coordinates = Column(JSONB, nullable=True)  # {x, y, width, height}
    plot_offset = Column(JSONB, nullable=True)  # {offset_x, offset_y, rotation}
    is_manual_plot = Column(String(10), default="false")  # "true" or "false" as string for compatibility
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(String(20), unique=True, nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    broker_id = Column(UUID(as_uuid=True), ForeignKey("brokers.id"))
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    inventory_id = Column(UUID(as_uuid=True), ForeignKey("inventory.id"), nullable=False)
    company_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    broker_commission_rate = Column(Numeric(5, 2), default=2.00)
    unit_number = Column(String(50), nullable=False)
    block = Column(String(50))
    area_marla = Column(Numeric(10, 2), nullable=False)
    rate_per_marla = Column(Numeric(15, 2), nullable=False)
    total_value = Column(Numeric(15, 2), nullable=False)
    installment_cycle = Column(String(20), default="bi-annual")
    num_installments = Column(Integer, default=4)
    first_due_date = Column(Date, nullable=False)
    status = Column(String(20), default="active")
    notes = Column(Text)
    booking_date = Column(Date, default=date.today)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class Installment(Base):
    __tablename__ = "installments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=False)
    installment_number = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    amount_paid = Column(Numeric(15, 2), default=0)
    status = Column(String(20), default="pending")
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class Interaction(Base):
    __tablename__ = "interactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interaction_id = Column(String(20), unique=True, nullable=False)
    company_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))
    broker_id = Column(UUID(as_uuid=True), ForeignKey("brokers.id"))
    interaction_type = Column(String(20), nullable=False)  # call, message, whatsapp
    status = Column(String(50))
    notes = Column(Text)
    next_follow_up = Column(Date)
    created_at = Column(DateTime, server_default=func.now())

class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    source = Column(String(50))  # facebook, google, instagram, etc
    start_date = Column(Date)
    end_date = Column(Date)
    budget = Column(Numeric(15, 2))
    status = Column(String(20), default="active")
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class Lead(Base):
    __tablename__ = "leads"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(String(20), unique=True, nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"))
    assigned_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    name = Column(String(255), nullable=False)
    mobile = Column(String(20))
    email = Column(String(255))
    source_details = Column(Text)
    status = Column(String(50), default="new")  # new, contacted, qualified, converted, lost
    lead_type = Column(String(20), default="prospect")  # prospect, customer, broker
    converted_customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))
    converted_broker_id = Column(UUID(as_uuid=True), ForeignKey("brokers.id"))
    notes = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class Receipt(Base):
    __tablename__ = "receipts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    receipt_id = Column(String(20), unique=True, nullable=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    amount = Column(Numeric(15, 2), nullable=False)
    payment_method = Column(String(50))  # cash, cheque, bank_transfer, online
    reference_number = Column(String(100))  # cheque number, transaction id etc
    payment_date = Column(Date, default=date.today)
    notes = Column(Text)
    created_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    created_at = Column(DateTime, server_default=func.now())

class ReceiptAllocation(Base):
    __tablename__ = "receipt_allocations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    receipt_id = Column(UUID(as_uuid=True), ForeignKey("receipts.id"), nullable=False)
    installment_id = Column(UUID(as_uuid=True), ForeignKey("installments.id"), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class Creditor(Base):
    __tablename__ = "creditors"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creditor_id = Column(String(20), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    mobile = Column(String(20))
    company = Column(String(255))
    bank_name = Column(String(100))
    bank_account = Column(String(50))
    bank_iban = Column(String(50))
    notes = Column(Text)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, server_default=func.now())

class Payment(Base):
    __tablename__ = "payments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id = Column(String(20), unique=True, nullable=False)
    payment_type = Column(String(50), nullable=False)  # broker_commission, rep_incentive, creditor, other
    payee_type = Column(String(50))  # broker, company_rep, creditor
    broker_id = Column(UUID(as_uuid=True), ForeignKey("brokers.id"))
    company_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    creditor_id = Column(UUID(as_uuid=True), ForeignKey("creditors.id"))
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    amount = Column(Numeric(15, 2), nullable=False)
    payment_method = Column(String(50))  # cash, cheque, bank_transfer
    reference_number = Column(String(100))
    payment_date = Column(Date, default=date.today)
    notes = Column(Text)
    approved_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    status = Column(String(20), default="completed")  # pending, completed, cancelled
    created_at = Column(DateTime, server_default=func.now())

class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id = Column(UUID(as_uuid=True), ForeignKey("payments.id"), nullable=False)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class MediaFile(Base):
    __tablename__ = "media_files"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_id = Column(String(20), unique=True, nullable=False)
    entity_type = Column(String(50), nullable=False)  # transaction, interaction, project, receipt, payment
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(50))  # pdf, excel, image, audio, video, other
    file_size = Column(Integer)
    uploaded_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    description = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

# ============================================
# VECTOR MODELS
# ============================================
class VectorProject(Base):
    __tablename__ = "vector_projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    map_name = Column(String(255), nullable=True)
    map_pdf_base64 = Column(Text, nullable=True)
    map_size = Column(JSONB, nullable=True)  # {width, height}
    linked_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)  # Optional link to Radius project
    vector_metadata = Column(JSONB, nullable=True)  # Vector-specific settings
    system_branches = Column(JSONB, nullable=True)  # System-generated branches (sales, inventory) as JSON
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class VectorAnnotation(Base):
    __tablename__ = "vector_annotations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    annotation_id = Column(String(100), nullable=False)  # Changed from INTEGER to VARCHAR to support timestamp-based IDs
    note = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    color = Column(String(50), nullable=True)
    font_size = Column(Integer, nullable=True)
    rotation = Column(Integer, default=0)
    plot_ids = Column(JSONB, nullable=True)  # Array of plot IDs
    plot_nums = Column(JSONB, nullable=True)  # Array of plot numbers
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class VectorShape(Base):
    __tablename__ = "vector_shapes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    shape_id = Column(String(100), nullable=False)
    type = Column(String(50), nullable=True)
    x = Column(Integer, nullable=True)
    y = Column(Integer, nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    color = Column(String(50), nullable=True)
    data = Column(JSONB, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class VectorLabel(Base):
    __tablename__ = "vector_labels"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    label_id = Column(String(100), nullable=False)
    text = Column(Text, nullable=True)
    x = Column(Integer, nullable=True)
    y = Column(Integer, nullable=True)
    size = Column(Integer, nullable=True)
    color = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class VectorLegend(Base):
    __tablename__ = "vector_legend"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False, unique=True)
    visible = Column(String(10), default="true")  # "true" or "false" as string
    minimized = Column(String(10), default="false")  # "true" or "false" as string
    position = Column(String(50), nullable=True)
    manual_entries = Column(JSONB, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class VectorBranch(Base):
    __tablename__ = "vector_branches"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    timestamp = Column(DateTime, nullable=True)
    anno_count = Column(Integer, nullable=True)
    data = Column(JSONB, nullable=True)  # {annos, labels, shapes, plotOffsets, plotRotations}
    created_at = Column(DateTime, server_default=func.now())

class VectorCreatorNote(Base):
    __tablename__ = "vector_creator_notes"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, server_default=func.now())
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class VectorChangeLog(Base):
    __tablename__ = "vector_change_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, server_default=func.now())
    action = Column(Text, nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

class VectorProjectBackup(Base):
    __tablename__ = "vector_project_backups"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    backup_data = Column(JSONB, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

class VectorBackupSettings(Base):
    __tablename__ = "vector_backup_settings"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    frequency = Column(String(100), default="0 2 * * *")  # Default: Daily at 2 AM (cron format)
    enabled = Column(String(10), default="true")  # "true" or "false" as string
    last_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class VectorReconciliation(Base):
    __tablename__ = "vector_reconciliation"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("vector_projects.id", ondelete="CASCADE"), nullable=False)
    linked_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    sync_status = Column(String(50), nullable=True)  # linked, synced, needs-reconciliation
    discrepancies = Column(JSONB, nullable=True)  # Store reconciliation discrepancies
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

# ============================================
# AUTHENTICATION SETUP
# ============================================
# SECRET_KEY for JWT tokens - MUST be set in production via environment variable
# Generate a secure key: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production-min-32-chars")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def verify_password(plain_password, hashed_password):
    try:
        # Ensure password is a string
        if not isinstance(plain_password, str):
            plain_password = str(plain_password)
        # Truncate password to 72 bytes if necessary (bcrypt limit)
        password_bytes = plain_password.encode('utf-8')
        if len(password_bytes) > 72:
            plain_password = password_bytes[:72].decode('utf-8', errors='ignore')
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        # Log the error for debugging but still return False for security
        import logging
        logging.error(f"Password verification error: {str(e)}")
        return False

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        token = credentials.credentials
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id: str = payload.get("sub")
            if user_id is None:
                raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        except JWTError as e:
            print(f"JWT Error in get_current_user: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        try:
            user = db.query(CompanyRep).filter((CompanyRep.id == user_id) | (CompanyRep.rep_id == user_id)).first()
            if user is None:
                print(f"User not found for ID: {user_id}")
                raise HTTPException(status_code=401, detail="User not found")
            if user.status != "active":
                print(f"User {user_id} is not active, status: {user.status}")
                raise HTTPException(status_code=401, detail="User not active")
            return user
        except Exception as e:
            print(f"Database error in get_current_user: {str(e)}")
            import traceback
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in get_current_user: {str(e)}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")

def require_role(allowed_roles: List[str]):
    def role_checker(current_user: CompanyRep = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# ============================================
# VECTOR UTILITY FUNCTIONS
# ============================================
def normalize_plot_number(plot_num: str) -> str:
    """Normalize plot/unit number for matching"""
    if not plot_num:
        return ""
    # Remove spaces, convert to uppercase
    normalized = plot_num.strip().upper()
    # Remove common separators and replace with standard format
    normalized = normalized.replace("-", "").replace("_", "").replace(".", "").replace(" ", "")
    return normalized

def extract_numeric_parts(text: str) -> List[int]:
    """Extract numeric parts from text"""
    import re
    return [int(x) for x in re.findall(r'\d+', text)]

def levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings"""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]

def calculate_similarity(str1: str, str2: str) -> float:
    """Calculate similarity score between two strings (0-1)"""
    if not str1 or not str2:
        return 0.0
    
    # Normalize both strings
    norm1 = normalize_plot_number(str1)
    norm2 = normalize_plot_number(str2)
    
    # Exact match after normalization
    if norm1 == norm2:
        return 1.0
    
    # Extract numeric parts
    nums1 = extract_numeric_parts(norm1)
    nums2 = extract_numeric_parts(norm2)
    
    # If numeric parts match, high similarity
    if nums1 and nums2 and nums1 == nums2:
        return 0.9
    
    # Calculate Levenshtein distance
    max_len = max(len(norm1), len(norm2))
    if max_len == 0:
        return 1.0
    
    distance = levenshtein_distance(norm1, norm2)
    similarity = 1.0 - (distance / max_len)
    
    # Boost similarity if numeric parts are similar
    if nums1 and nums2:
        num_similarity = len(set(nums1) & set(nums2)) / max(len(set(nums1)), len(set(nums2)), 1)
        similarity = max(similarity, num_similarity * 0.8)
    
    return max(0.0, min(1.0, similarity))

def smart_match_plot_numbers(vector_plots: List[str], radius_units: List[str], threshold: float = 0.5) -> List[dict]:
    """
    Smart match plot numbers from Vector to unit numbers from Radius Inventory.
    Returns list of matches with confidence scores.
    
    Args:
        vector_plots: List of plot numbers from Vector
        radius_units: List of unit numbers from Radius Inventory
        threshold: Minimum confidence score (0-1) for a match
    
    Returns:
        List of dicts with keys: vector_plot, radius_unit, confidence, auto_match
    """
    matches = []
    used_radius_units = set()
    
    for v_plot in vector_plots:
        best_match = None
        best_score = 0.0
        
        for r_unit in radius_units:
            if r_unit in used_radius_units:
                continue
            
            score = calculate_similarity(v_plot, r_unit)
            if score > best_score and score >= threshold:
                best_score = score
                best_match = r_unit
        
        if best_match:
            matches.append({
                "vector_plot": v_plot,
                "radius_unit": best_match,
                "confidence": round(best_score, 3),
                "auto_match": best_score >= 0.8  # High confidence = auto-match
            })
            used_radius_units.add(best_match)
        else:
            # No match found
            matches.append({
                "vector_plot": v_plot,
                "radius_unit": None,
                "confidence": 0.0,
                "auto_match": False
            })
    
    return matches

# ============================================
# FASTAPI APP
# ============================================
app = FastAPI(title="Radius CRM", version="3.0.0")
# CORS Configuration - Update with your office server domain
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5180,http://localhost:5174,http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "running", "app": "Radius CRM v3"}

@app.post("/api/auth/login")
def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """Login endpoint - returns JWT token"""
    try:
        # Find user by rep_id, email, or mobile
        user = db.query(CompanyRep).filter(
            (CompanyRep.rep_id == username) | 
            (CompanyRep.email == username) | 
            (CompanyRep.mobile == username)
        ).first()
        
        if not user:
            print(f"Login attempt: User not found for username: {username}")
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        if user.status != "active":
            print(f"Login attempt: User {username} is not active, status: {user.status}")
            raise HTTPException(status_code=401, detail="User account is not active")
        
        # Check if password is set, if not allow first-time login with any password
        if not user.password_hash:
            # Set password on first login
            user.password_hash = get_password_hash(password)
            db.commit()
        elif not verify_password(password, user.password_hash):
            print(f"Login attempt: Invalid password for user: {username}")
            raise HTTPException(status_code=401, detail="Invalid username or password")
        
        # Create access token
        try:
            access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
        except Exception as e:
            print(f"Error creating access token: {str(e)}")
            import traceback
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail="Error creating access token")
        
        try:
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "id": str(user.id),
                    "rep_id": user.rep_id,
                    "name": user.name,
                    "email": user.email if hasattr(user, 'email') else None,
                    "role": user.role if hasattr(user, 'role') else 'user'
                }
            }
        except Exception as e:
            print(f"Error building login response: {str(e)}")
            import traceback
            print(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error building response: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in login: {str(e)}")
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")

@app.get("/api/auth/me")
def get_current_user_info(current_user: CompanyRep = Depends(get_current_user)):
    """Get current logged-in user info"""
    try:
        return {
            "id": str(current_user.id),
            "rep_id": current_user.rep_id,
            "name": current_user.name,
            "email": current_user.email if hasattr(current_user, 'email') else None,
            "role": current_user.role if hasattr(current_user, 'role') else 'user',
            "mobile": current_user.mobile if hasattr(current_user, 'mobile') else None
        }
    except Exception as e:
        import traceback
        print(f"ERROR in /api/auth/me: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error getting user info: {str(e)}")

@app.post("/api/auth/change-password")
def change_password(
    old_password: str = Form(...),
    new_password: str = Form(...),
    current_user: CompanyRep = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    if not current_user.password_hash or not verify_password(old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Invalid old password")
    
    current_user.password_hash = get_password_hash(new_password)
    db.commit()
    return {"message": "Password changed successfully"}

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint that verifies database tables"""
    try:
        tables = {}
        tables["customers"] = db.execute(text("SELECT COUNT(*) FROM customers")).scalar()
        tables["brokers"] = db.execute(text("SELECT COUNT(*) FROM brokers")).scalar()
        tables["projects"] = db.execute(text("SELECT COUNT(*) FROM projects")).scalar()
        tables["inventory"] = db.execute(text("SELECT COUNT(*) FROM inventory")).scalar()
        tables["transactions"] = db.execute(text("SELECT COUNT(*) FROM transactions")).scalar()
        tables["installments"] = db.execute(text("SELECT COUNT(*) FROM installments")).scalar()
        tables["company_reps"] = db.execute(text("SELECT COUNT(*) FROM company_reps")).scalar()
        
        # Check new tables (might not exist)
        try:
            tables["interactions"] = db.execute(text("SELECT COUNT(*) FROM interactions")).scalar()
        except: tables["interactions"] = "table not found"
        try:
            tables["campaigns"] = db.execute(text("SELECT COUNT(*) FROM campaigns")).scalar()
        except: tables["campaigns"] = "table not found"
        try:
            tables["leads"] = db.execute(text("SELECT COUNT(*) FROM leads")).scalar()
        except: tables["leads"] = "table not found"
        try:
            tables["receipts"] = db.execute(text("SELECT COUNT(*) FROM receipts")).scalar()
        except: tables["receipts"] = "table not found"
        try:
            tables["payments"] = db.execute(text("SELECT COUNT(*) FROM payments")).scalar()
        except: tables["payments"] = "table not found"
        try:
            tables["creditors"] = db.execute(text("SELECT COUNT(*) FROM creditors")).scalar()
        except: tables["creditors"] = "table not found"
        try:
            tables["payments"] = db.execute(text("SELECT COUNT(*) FROM payments")).scalar()
        except: tables["payments"] = "table not found"
        try:
            tables["media_files"] = db.execute(text("SELECT COUNT(*) FROM media_files")).scalar()
        except: tables["media_files"] = "table not found"
        
        return {"status": "healthy", "tables": tables}
    except Exception as e:
        return {"status": "error", "error": str(e)}

# ============================================
# CUSTOMERS API
# ============================================
@app.get("/api/customers")
def list_customers(db: Session = Depends(get_db)):
    customers = db.query(Customer).order_by(Customer.created_at.desc()).all()
    return [{
        "id": str(c.id), "customer_id": c.customer_id, "name": c.name,
        "mobile": c.mobile, "address": c.address, "cnic": c.cnic,
        "email": c.email, "created_at": str(c.created_at)
    } for c in customers]

@app.get("/api/customers/{cid}")
def get_customer(cid: str, db: Session = Depends(get_db)):
    c = db.query(Customer).filter(
        (Customer.id == cid) | (Customer.customer_id == cid) | (Customer.mobile == cid)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    broker = db.query(Broker).filter(Broker.mobile == c.mobile).first()
    return {
        "id": str(c.id), "customer_id": c.customer_id, "name": c.name,
        "mobile": c.mobile, "address": c.address, "cnic": c.cnic,
        "email": c.email, "created_at": str(c.created_at),
        "is_also_broker": broker is not None,
        "broker_id": broker.broker_id if broker else None
    }

@app.post("/api/customers")
def create_customer(data: dict, db: Session = Depends(get_db)):
    if db.query(Customer).filter(Customer.mobile == data["mobile"]).first():
        raise HTTPException(400, f"Customer with mobile {data['mobile']} already exists")
    c = Customer(name=data["name"], mobile=data["mobile"], address=data.get("address"),
                 cnic=data.get("cnic"), email=data.get("email"))
    db.add(c); db.commit(); db.refresh(c)
    return {"message": "Customer created", "id": str(c.id), "customer_id": c.customer_id}

@app.put("/api/customers/{cid}")
def update_customer(cid: str, data: dict, db: Session = Depends(get_db)):
    c = db.query(Customer).filter((Customer.id == cid) | (Customer.customer_id == cid)).first()
    if not c: raise HTTPException(404, "Customer not found")
    for k in ["name", "mobile", "address", "cnic", "email"]:
        if k in data and data[k] is not None: setattr(c, k, data[k])
    db.commit()
    return {"message": "Customer updated"}

@app.delete("/api/customers/{cid}")
def delete_customer(cid: str, db: Session = Depends(get_db)):
    c = db.query(Customer).filter((Customer.id == cid) | (Customer.customer_id == cid)).first()
    if not c: raise HTTPException(404, "Customer not found")
    db.delete(c); db.commit()
    return {"message": "Customer deleted"}

@app.get("/api/customers/template/download")
def download_customer_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name*', 'mobile*', 'address', 'cnic', 'email'])
    writer.writerow(['Ahmed Khan', '0300-1234567', 'DHA Phase 5', '35201-1234567-1', 'ahmed@email.com'])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=customers_template.csv"})

@app.post("/api/customers/bulk-import")
async def bulk_import_customers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": [], "created": []}
    for i, row in enumerate(reader, 2):
        try:
            name, mobile = row.get('name*', '').strip(), row.get('mobile*', '').strip()
            if not name or not mobile: results["errors"].append(f"Row {i}: Name and mobile required"); continue
            if db.query(Customer).filter(Customer.mobile == mobile).first():
                results["errors"].append(f"Row {i}: Mobile exists"); continue
            c = Customer(name=name, mobile=mobile, address=row.get('address'), cnic=row.get('cnic'), email=row.get('email'))
            db.add(c); db.flush()
            results["success"] += 1
            results["created"].append({"customer_id": c.customer_id, "name": name})
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    return results

# ============================================
# BROKERS API
# ============================================
@app.get("/api/brokers")
def list_brokers(db: Session = Depends(get_db)):
    brokers = db.query(Broker).order_by(Broker.created_at.desc()).all()
    result = []
    for b in brokers:
        customer = db.query(Customer).filter(Customer.mobile == b.mobile).first()
        # Get broker stats from transactions
        deals = db.query(Transaction).filter(Transaction.broker_id == b.id).all()
        total_sales = sum(float(t.total_value or 0) for t in deals)
        commission_earned = sum(float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100 for t in deals)
        result.append({
            "id": str(b.id), "broker_id": b.broker_id, "name": b.name, "mobile": b.mobile,
            "cnic": b.cnic, "email": b.email, "company": b.company, "address": b.address,
            "commission_rate": float(b.commission_rate or 2.0), "bank_name": b.bank_name,
            "bank_account": b.bank_account, "bank_iban": b.bank_iban, "notes": b.notes,
            "status": b.status, "created_at": str(b.created_at),
            "is_also_customer": customer is not None,
            "customer_id": customer.customer_id if customer else None,
            "stats": {
                "total_deals": len(deals), "total_sales_value": total_sales,
                "commission_earned": commission_earned, "commission_paid": 0, "commission_pending": commission_earned
            }
        })
    return result

@app.get("/api/brokers/summary")
def get_brokers_summary(db: Session = Depends(get_db)):
    total = db.query(Broker).count()
    active = db.query(Broker).filter(Broker.status == "active").count()
    deals = db.query(Transaction).filter(Transaction.broker_id.isnot(None)).all()
    total_commission = sum(float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100 for t in deals)
    total_deals_value = sum(float(t.total_value or 0) for t in deals)
    
    # Deals this month
    from datetime import datetime
    current_month_start = date.today().replace(day=1)
    deals_this_month = [d for d in deals if d.booking_date and d.booking_date >= current_month_start]
    deals_this_month_value = sum(float(t.total_value or 0) for t in deals_this_month)
    
    # Top performers (by deal value)
    broker_stats = {}
    for t in deals:
        if t.broker_id:
            bid = str(t.broker_id)
            if bid not in broker_stats:
                broker_stats[bid] = {"total_value": 0, "deal_count": 0}
            broker_stats[bid]["total_value"] += float(t.total_value or 0)
            broker_stats[bid]["deal_count"] += 1
    
    top_performers = []
    for bid, stats in sorted(broker_stats.items(), key=lambda x: x[1]["total_value"], reverse=True)[:5]:
        broker = db.query(Broker).filter(Broker.id == bid).first()
        if broker:
            top_performers.append({
                "broker_id": broker.broker_id, "name": broker.name,
                "total_value": stats["total_value"], "deal_count": stats["deal_count"]
            })
    
    return {
        "total_brokers": total, "active_brokers": active, "total_deals": len(deals),
        "total_deals_value": total_deals_value,
        "total_commission_owed": total_commission, "total_commission_paid": 0,
        "deals_this_month": len(deals_this_month), "deals_this_month_value": deals_this_month_value,
        "top_performers": top_performers
    }

@app.get("/api/brokers/{bid}")
def get_broker(bid: str, db: Session = Depends(get_db)):
    b = db.query(Broker).filter((Broker.id == bid) | (Broker.broker_id == bid) | (Broker.mobile == bid)).first()
    if not b: raise HTTPException(404, "Broker not found")
    customer = db.query(Customer).filter(Customer.mobile == b.mobile).first()
    deals = db.query(Transaction).filter(Transaction.broker_id == b.id).all()
    return {
        "id": str(b.id), "broker_id": b.broker_id, "name": b.name, "mobile": b.mobile,
        "cnic": b.cnic, "email": b.email, "company": b.company, "address": b.address,
        "commission_rate": float(b.commission_rate or 2.0), "bank_name": b.bank_name,
        "bank_account": b.bank_account, "bank_iban": b.bank_iban, "notes": b.notes,
        "status": b.status, "is_also_customer": customer is not None,
        "transactions": [{"transaction_id": t.transaction_id, "total_value": float(t.total_value)} for t in deals]
    }

@app.post("/api/brokers")
def create_broker(data: dict, db: Session = Depends(get_db)):
    if db.query(Broker).filter(Broker.mobile == data["mobile"]).first():
        raise HTTPException(400, f"Broker with mobile {data['mobile']} already exists")
    customer = db.query(Customer).filter(Customer.mobile == data["mobile"]).first()
    b = Broker(name=data["name"], mobile=data["mobile"], cnic=data.get("cnic"), email=data.get("email"),
               company=data.get("company"), address=data.get("address"),
               commission_rate=data.get("commission_rate", 2.0), bank_name=data.get("bank_name"),
               bank_account=data.get("bank_account"), bank_iban=data.get("bank_iban"), notes=data.get("notes"),
               linked_customer_id=customer.id if customer else None)
    db.add(b); db.commit(); db.refresh(b)
    return {"message": "Broker created", "id": str(b.id), "broker_id": b.broker_id,
            "linked_to_customer": customer is not None}

@app.put("/api/brokers/{bid}")
def update_broker(bid: str, data: dict, db: Session = Depends(get_db)):
    b = db.query(Broker).filter((Broker.id == bid) | (Broker.broker_id == bid)).first()
    if not b: raise HTTPException(404, "Broker not found")
    for k in ["name", "mobile", "cnic", "email", "company", "address", "commission_rate",
              "bank_name", "bank_account", "bank_iban", "notes", "status"]:
        if k in data and data[k] is not None: setattr(b, k, data[k])
    db.commit()
    return {"message": "Broker updated"}

@app.delete("/api/brokers/{bid}")
def delete_broker(bid: str, db: Session = Depends(get_db)):
    b = db.query(Broker).filter((Broker.id == bid) | (Broker.broker_id == bid)).first()
    if not b: raise HTTPException(404, "Broker not found")
    db.delete(b); db.commit()
    return {"message": "Broker deleted"}

@app.get("/api/brokers/template/download")
def download_broker_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name*', 'mobile*', 'company', 'commission_rate', 'cnic', 'email', 'bank_name', 'bank_account', 'notes'])
    writer.writerow(['Rizwan Properties', '0300-1111111', 'Rizwan Real Estate', '2.5', '', 'rizwan@email.com', 'HBL', '1234567890', ''])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=brokers_template.csv"})

@app.post("/api/brokers/bulk-import")
async def bulk_import_brokers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": [], "created": []}
    for i, row in enumerate(reader, 2):
        try:
            name, mobile = row.get('name*', '').strip(), row.get('mobile*', '').strip()
            if not name or not mobile: results["errors"].append(f"Row {i}: Name and mobile required"); continue
            if db.query(Broker).filter(Broker.mobile == mobile).first():
                results["errors"].append(f"Row {i}: Broker exists"); continue
            customer = db.query(Customer).filter(Customer.mobile == mobile).first()
            rate = row.get('commission_rate', '').strip()
            b = Broker(name=name, mobile=mobile, company=row.get('company'),
                       commission_rate=float(rate) if rate else 2.0, cnic=row.get('cnic'),
                       email=row.get('email'), bank_name=row.get('bank_name'),
                       bank_account=row.get('bank_account'), notes=row.get('notes'),
                       linked_customer_id=customer.id if customer else None)
            db.add(b); db.flush()
            results["success"] += 1
            results["created"].append({"broker_id": b.broker_id, "name": name})
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    return results

# ============================================
# PROJECTS API
# ============================================
@app.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    try:
        projects = db.query(Project).order_by(Project.created_at.desc()).all()
        result = []
        for p in projects:
            inventory = db.query(Inventory).filter(Inventory.project_id == p.id).all()
            available = [i for i in inventory if i.status == "available"]
            sold = [i for i in inventory if i.status == "sold"]
            total_area = sum(float(i.area_marla) for i in inventory)
            avg_rate = sum(float(i.rate_per_marla) for i in inventory) / len(inventory) if inventory else 0
            result.append({
                "id": str(p.id), "project_id": p.project_id, "name": p.name,
                "location": p.location, "description": p.description, "status": p.status,
                "stats": {
                    "total_units": len(inventory), "available": len(available), "sold": len(sold),
                    "total_area": total_area, "avg_rate": round(avg_rate, 0),
                    "total_value": sum(float(i.area_marla) * float(i.rate_per_marla) for i in inventory),
                    "sold_value": sum(float(i.area_marla) * float(i.rate_per_marla) for i in sold)
                }
            })
        return result
    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg.lower() or "column" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail=f"Database schema error: Missing columns. Please run the migration script: python migrate_vector_schema.py. Error: {error_msg[:200]}"
            )
        raise HTTPException(status_code=500, detail=f"Error loading projects: {error_msg[:200]}")

@app.get("/api/projects/{pid}")
def get_project(pid: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.id == pid) | (Project.project_id == pid)).first()
    if not p: raise HTTPException(404, "Project not found")
    inventory = db.query(Inventory).filter(Inventory.project_id == p.id).all()
    return {
        "id": str(p.id), "project_id": p.project_id, "name": p.name,
        "location": p.location, "description": p.description, "status": p.status,
        "inventory": [{
            "id": str(i.id), "inventory_id": i.inventory_id, "unit_number": i.unit_number,
            "unit_type": i.unit_type, "block": i.block, "area_marla": float(i.area_marla),
            "rate_per_marla": float(i.rate_per_marla), "total_value": float(i.area_marla) * float(i.rate_per_marla),
            "status": i.status
        } for i in inventory]
    }

@app.post("/api/projects")
def create_project(data: dict, db: Session = Depends(get_db)):
    p = Project(name=data["name"], location=data.get("location"), description=data.get("description"))
    db.add(p); db.commit(); db.refresh(p)
    return {"message": "Project created", "id": str(p.id), "project_id": p.project_id}

@app.put("/api/projects/{pid}")
def update_project(pid: str, data: dict, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.id == pid) | (Project.project_id == pid)).first()
    if not p: raise HTTPException(404, "Project not found")
    for k in ["name", "location", "description", "status"]:
        if k in data and data[k] is not None: setattr(p, k, data[k])
    db.commit()
    return {"message": "Project updated"}

@app.delete("/api/projects/{pid}")
def delete_project(pid: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.id == pid) | (Project.project_id == pid)).first()
    if not p: raise HTTPException(404, "Project not found")
    db.delete(p); db.commit()
    return {"message": "Project deleted"}

# ============================================
# COMPANY REPS API
# ============================================
@app.get("/api/company-reps")
def list_reps(db: Session = Depends(get_db)):
    reps = db.query(CompanyRep).order_by(CompanyRep.created_at.desc()).all()
    return [{"id": str(r.id), "rep_id": r.rep_id, "name": r.name, "mobile": r.mobile,
             "email": r.email, "status": r.status} for r in reps]

@app.post("/api/company-reps")
def create_rep(data: dict, db: Session = Depends(get_db), current_user: CompanyRep = Depends(require_role(["admin"]))):
    password = data.get("password")
    password_hash = get_password_hash(password) if password else None
    role = data.get("role", "user")  # Default to "user" role
    
    r = CompanyRep(
        name=data["name"], 
        mobile=data.get("mobile"), 
        email=data.get("email"),
        password_hash=password_hash,
        role=role
    )
    db.add(r); db.commit(); db.refresh(r)
    return {"message": "Rep created", "id": str(r.id), "rep_id": r.rep_id, "role": r.role}

@app.put("/api/company-reps/{rid}")
def update_rep(rid: str, data: dict, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    r = db.query(CompanyRep).filter((CompanyRep.id == rid) | (CompanyRep.rep_id == rid)).first()
    if not r: raise HTTPException(404, "Rep not found")
    
    # Only admin can change roles, users can only update their own info
    if "role" in data and current_user.role != "admin":
        raise HTTPException(403, "Only admin can change roles")
    if str(r.id) != str(current_user.id) and current_user.role != "admin":
        raise HTTPException(403, "Can only update your own profile")
    
    for k in ["name", "mobile", "email", "status", "role"]:
        if k in data and data[k] is not None: setattr(r, k, data[k])
    
    if "password" in data and data["password"]:
        r.password_hash = get_password_hash(data["password"])
    
    db.commit()
    return {"message": "Rep updated"}

@app.delete("/api/company-reps/{rid}")
def delete_rep(rid: str, db: Session = Depends(get_db)):
    r = db.query(CompanyRep).filter((CompanyRep.id == rid) | (CompanyRep.rep_id == rid)).first()
    if not r: raise HTTPException(404, "Rep not found")
    db.delete(r); db.commit()
    return {"message": "Rep deleted"}

# ============================================
# INVENTORY API
# ============================================
@app.get("/api/inventory")
def list_inventory(project_id: str = None, status: str = None, db: Session = Depends(get_db)):
    q = db.query(Inventory)
    if project_id:
        p = db.query(Project).filter((Project.id == project_id) | (Project.project_id == project_id)).first()
        if p: q = q.filter(Inventory.project_id == p.id)
    if status: q = q.filter(Inventory.status == status)
    inventory = q.order_by(Inventory.created_at.desc()).all()
    result = []
    for i in inventory:
        p = db.query(Project).filter(Project.id == i.project_id).first()
        result.append({
            "id": str(i.id), "inventory_id": i.inventory_id, "project_id": str(i.project_id),
            "project_name": p.name if p else None, "unit_number": i.unit_number,
            "unit_type": i.unit_type, "block": i.block, "area_marla": float(i.area_marla),
            "rate_per_marla": float(i.rate_per_marla),
            "total_value": float(i.area_marla) * float(i.rate_per_marla),
            "status": i.status, "factor_details": i.factor_details, "notes": i.notes
        })
    return result

@app.get("/api/inventory/available")
def list_available_inventory(db: Session = Depends(get_db)):
    inventory = db.query(Inventory).filter(Inventory.status == "available").order_by(Inventory.created_at.desc()).all()
    result = []
    for i in inventory:
        p = db.query(Project).filter(Project.id == i.project_id).first()
        result.append({
            "id": str(i.id), "inventory_id": i.inventory_id, "project_id": str(i.project_id),
            "project_name": p.name if p else None, "unit_number": i.unit_number,
            "unit_type": i.unit_type, "block": i.block, "area_marla": float(i.area_marla),
            "rate_per_marla": float(i.rate_per_marla),
            "total_value": float(i.area_marla) * float(i.rate_per_marla),
            "status": i.status
        })
    return result

@app.get("/api/inventory/template/download")
def download_inventory_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['project_id*', 'unit_number*', 'unit_type', 'block', 'area_marla*', 'rate_per_marla*', 'factor_details', 'notes'])
    writer.writerow(['PRJ-0001', 'A-101', 'plot', 'A', '5', '500000', 'Corner', 'Prime location'])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=inventory_template.csv"})

@app.get("/api/inventory/summary")
def get_inventory_summary(db: Session = Depends(get_db)):
    total_projects = db.query(Project).count()
    total_available = db.query(Inventory).filter(Inventory.status == "available").count()
    total_sold = db.query(Inventory).filter(Inventory.status == "sold").count()
    available_value = db.query(func.sum(Inventory.area_marla * Inventory.rate_per_marla)).filter(Inventory.status == "available").scalar() or 0
    sold_value = db.query(func.sum(Inventory.area_marla * Inventory.rate_per_marla)).filter(Inventory.status == "sold").scalar() or 0
    return {
        "total_projects": total_projects, "total_available": total_available,
        "total_sold": total_sold, "available_value": float(available_value), "sold_value": float(sold_value)
    }

@app.get("/api/inventory/{iid}")
def get_inventory_item(iid: str, db: Session = Depends(get_db)):
    i = db.query(Inventory).filter((Inventory.id == iid) | (Inventory.inventory_id == iid)).first()
    if not i: raise HTTPException(404, "Inventory not found")
    p = db.query(Project).filter(Project.id == i.project_id).first()
    return {
        "id": str(i.id), "inventory_id": i.inventory_id, "project_id": str(i.project_id),
        "project_name": p.name if p else None, "unit_number": i.unit_number,
        "unit_type": i.unit_type, "block": i.block, "area_marla": float(i.area_marla),
        "rate_per_marla": float(i.rate_per_marla), "status": i.status,
        "factor_details": i.factor_details, "notes": i.notes
    }

@app.post("/api/inventory")
def create_inventory(data: dict, db: Session = Depends(get_db)):
    p = db.query(Project).filter((Project.id == data["project_id"]) | (Project.project_id == data["project_id"])).first()
    if not p: raise HTTPException(404, "Project not found")
    i = Inventory(project_id=p.id, unit_number=data["unit_number"], unit_type=data.get("unit_type", "plot"),
                  block=data.get("block"), area_marla=data["area_marla"], rate_per_marla=data["rate_per_marla"],
                  factor_details=data.get("factor_details"), notes=data.get("notes"))
    db.add(i); db.commit(); db.refresh(i)
    return {"message": "Inventory created", "id": str(i.id), "inventory_id": i.inventory_id}

@app.put("/api/inventory/{iid}")
def update_inventory(iid: str, data: dict, db: Session = Depends(get_db)):
    i = db.query(Inventory).filter((Inventory.id == iid) | (Inventory.inventory_id == iid)).first()
    if not i: raise HTTPException(404, "Inventory not found")
    for k in ["unit_number", "unit_type", "block", "area_marla", "rate_per_marla", "status", "factor_details", "notes"]:
        if k in data and data[k] is not None: setattr(i, k, data[k])
    db.commit()
    return {"message": "Inventory updated"}

@app.delete("/api/inventory/{iid}")
def delete_inventory(iid: str, db: Session = Depends(get_db)):
    i = db.query(Inventory).filter((Inventory.id == iid) | (Inventory.inventory_id == iid)).first()
    if not i: raise HTTPException(404, "Inventory not found")
    db.delete(i); db.commit()
    return {"message": "Inventory deleted"}

@app.post("/api/inventory/bulk-import")
async def bulk_import_inventory(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": []}
    for i, row in enumerate(reader, 2):
        try:
            p = db.query(Project).filter(Project.project_id == row.get('project_id*')).first()
            if not p: results["errors"].append(f"Row {i}: Project not found"); continue
            inv = Inventory(project_id=p.id, unit_number=row['unit_number*'],
                            unit_type=row.get('unit_type', 'plot'), block=row.get('block'),
                            area_marla=float(row['area_marla*']), rate_per_marla=float(row['rate_per_marla*']),
                            factor_details=row.get('factor_details'), notes=row.get('notes'))
            db.add(inv); db.flush()
            results["success"] += 1
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    return results

# ============================================
# TRANSACTIONS API
# ============================================
@app.get("/api/transactions")
def list_transactions(db: Session = Depends(get_db)):
    try:
        txns = db.query(Transaction).order_by(Transaction.created_at.desc()).all()
        result = []
        for t in txns:
            c = db.query(Customer).filter(Customer.id == t.customer_id).first()
            b = db.query(Broker).filter(Broker.id == t.broker_id).first() if t.broker_id else None
            p = db.query(Project).filter(Project.id == t.project_id).first()
            installments = db.query(Installment).filter(Installment.transaction_id == t.id).all()
            paid = sum(float(i.amount_paid or 0) for i in installments)
            result.append({
                "id": str(t.id), "transaction_id": t.transaction_id,
                "customer_name": c.name if c else None, "customer_mobile": c.mobile if c else None,
                "broker_name": b.name if b else None, "project_name": p.name if p else None,
                "unit_number": t.unit_number, "block": t.block,
                "area_marla": float(t.area_marla), "rate_per_marla": float(t.rate_per_marla),
                "total_value": float(t.total_value), "total_paid": paid,
                "balance": float(t.total_value) - paid, "status": t.status,
                "booking_date": str(t.booking_date) if t.booking_date else None
            })
        return result
    except Exception as e:
        print(f"Error listing transactions: {e}")
        import traceback
        traceback.print_exc()
        return []

@app.get("/api/transactions/summary")
def get_transactions_summary(project_id: str = None, db: Session = Depends(get_db)):
    try:
        q = db.query(Transaction)
        if project_id and project_id.strip():
            p = db.query(Project).filter(Project.project_id == project_id).first()
            if not p:
                try:
                    p = db.query(Project).filter(Project.id == project_id).first()
                except: pass
            if p: q = q.filter(Transaction.project_id == p.id)
        txns = q.all()
        total_value = sum(float(t.total_value or 0) for t in txns)
        current_month_start = date.today().replace(day=1)
        this_month = [t for t in txns if t.booking_date and t.booking_date >= current_month_start]
        this_month_value = sum(float(t.total_value or 0) for t in this_month)
        return {
            "total_transactions": len(txns), "total_value": total_value,
            "this_month_count": len(this_month), "this_month_value": this_month_value
        }
    except Exception as e:
        return {"total_transactions": 0, "total_value": 0, "this_month_count": 0, "this_month_value": 0}

@app.get("/api/transactions/template/download")
def download_transactions_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['customer_mobile*', 'project_id*', 'unit_number*', 'broker_mobile', 'area_marla', 'rate_per_marla', 'installment_cycle', 'num_installments', 'first_due_date', 'booking_date', 'notes'])
    writer.writerow(['0300-1234567', 'PRJ-0001', 'A-101', '0301-2345678', '5', '500000', 'bi-annual', '4', '2025-06-01', '2025-01-15', 'Sample booking'])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=transactions_template.csv"})

@app.get("/api/transactions/{tid}")
def get_transaction(tid: str, db: Session = Depends(get_db)):
    t = db.query(Transaction).filter((Transaction.id == tid) | (Transaction.transaction_id == tid)).first()
    if not t: raise HTTPException(404, "Transaction not found")
    c = db.query(Customer).filter(Customer.id == t.customer_id).first()
    b = db.query(Broker).filter(Broker.id == t.broker_id).first() if t.broker_id else None
    p = db.query(Project).filter(Project.id == t.project_id).first()
    r = db.query(CompanyRep).filter(CompanyRep.id == t.company_rep_id).first() if t.company_rep_id else None
    installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.installment_number).all()
    return {
        "id": str(t.id), "transaction_id": t.transaction_id,
        "customer": {"id": str(c.id), "name": c.name, "mobile": c.mobile} if c else None,
        "broker": {"id": str(b.id), "name": b.name, "commission_rate": float(t.broker_commission_rate)} if b else None,
        "project": {"id": str(p.id), "name": p.name} if p else None,
        "company_rep": {"id": str(r.id), "name": r.name} if r else None,
        "unit_number": t.unit_number, "block": t.block,
        "area_marla": float(t.area_marla), "rate_per_marla": float(t.rate_per_marla),
        "total_value": float(t.total_value),
        "installment_cycle": t.installment_cycle, "num_installments": t.num_installments,
        "first_due_date": str(t.first_due_date), "booking_date": str(t.booking_date) if t.booking_date else None,
        "status": t.status, "notes": t.notes,
        "installments": [{
            "id": str(i.id), "number": i.installment_number, "due_date": str(i.due_date),
            "amount": float(i.amount), "amount_paid": float(i.amount_paid or 0),
            "balance": float(i.amount) - float(i.amount_paid or 0), "status": i.status
        } for i in installments]
    }

@app.post("/api/transactions")
def create_transaction(data: dict, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter((Customer.id == data["customer_id"]) | (Customer.customer_id == data["customer_id"]) | (Customer.mobile == data["customer_id"])).first()
    if not customer: raise HTTPException(404, "Customer not found")
    
    inventory = db.query(Inventory).filter((Inventory.id == data["inventory_id"]) | (Inventory.inventory_id == data["inventory_id"])).first()
    if not inventory: raise HTTPException(404, "Inventory not found")
    if inventory.status != "available": raise HTTPException(400, f"Unit not available (status: {inventory.status})")
    
    project = db.query(Project).filter(Project.id == inventory.project_id).first()
    broker = db.query(Broker).filter((Broker.id == data["broker_id"]) | (Broker.broker_id == data["broker_id"]) | (Broker.mobile == data["broker_id"])).first() if data.get("broker_id") else None
    rep = db.query(CompanyRep).filter((CompanyRep.id == data["company_rep_id"]) | (CompanyRep.rep_id == data["company_rep_id"])).first() if data.get("company_rep_id") else None
    
    area = float(data.get("area_marla") or inventory.area_marla)
    rate = float(data.get("rate_per_marla") or inventory.rate_per_marla)
    total = area * rate
    first_due = date.fromisoformat(data["first_due_date"]) if isinstance(data["first_due_date"], str) else data["first_due_date"]
    
    t = Transaction(
        customer_id=customer.id, broker_id=broker.id if broker else None,
        project_id=project.id, inventory_id=inventory.id, company_rep_id=rep.id if rep else None,
        broker_commission_rate=data.get("broker_commission_rate", broker.commission_rate if broker else 0),
        unit_number=inventory.unit_number, block=inventory.block,
        area_marla=area, rate_per_marla=rate, total_value=total,
        installment_cycle=data.get("installment_cycle", "bi-annual"),
        num_installments=data.get("num_installments", 4), first_due_date=first_due,
        notes=data.get("notes"),
        booking_date=date.fromisoformat(data["booking_date"]) if data.get("booking_date") else date.today()
    )
    db.add(t); db.commit(); db.refresh(t)
    
    cycle_months = {"monthly": 1, "quarterly": 3, "bi-annual": 6, "annual": 12}.get(t.installment_cycle, 6)
    installment_amount = total / t.num_installments
    for n in range(t.num_installments):
        due = first_due + relativedelta(months=n * cycle_months)
        db.add(Installment(transaction_id=t.id, installment_number=n + 1, due_date=due, amount=installment_amount))
    
    inventory.status = "sold"
    db.commit()
    return {"message": "Transaction created", "id": str(t.id), "transaction_id": t.transaction_id}

@app.put("/api/transactions/{tid}")
def update_transaction(tid: str, data: dict, db: Session = Depends(get_db)):
    t = db.query(Transaction).filter((Transaction.id == tid) | (Transaction.transaction_id == tid)).first()
    if not t: raise HTTPException(404, "Transaction not found")
    for k in ["broker_commission_rate", "status", "notes"]:
        if k in data and data[k] is not None: setattr(t, k, data[k])
    db.commit()
    return {"message": "Transaction updated"}

@app.post("/api/transactions/bulk-import")
async def bulk_import_transactions(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": []}
    for i, row in enumerate(reader, 2):
        try:
            customer = db.query(Customer).filter(Customer.mobile == row.get('customer_mobile*')).first()
            if not customer: results["errors"].append(f"Row {i}: Customer not found"); continue
            inventory = db.query(Inventory).filter(Inventory.inventory_id == row.get('inventory_id*')).first()
            if not inventory: results["errors"].append(f"Row {i}: Inventory not found"); continue
            if inventory.status != "available": results["errors"].append(f"Row {i}: Unit not available"); continue
            
            project = db.query(Project).filter(Project.id == inventory.project_id).first()
            broker = db.query(Broker).filter(Broker.mobile == row.get('broker_mobile')).first() if row.get('broker_mobile') else None
            area = float(row.get('area_marla') or inventory.area_marla)
            rate = float(row.get('rate_per_marla') or inventory.rate_per_marla)
            first_due = date.fromisoformat(row['first_due_date*'])
            cycle = row.get('installment_cycle', 'bi-annual')
            num_inst = int(row.get('num_installments') or 4)
            
            t = Transaction(
                customer_id=customer.id, broker_id=broker.id if broker else None,
                project_id=project.id, inventory_id=inventory.id,
                broker_commission_rate=float(row.get('broker_commission_rate') or (broker.commission_rate if broker else 0)),
                unit_number=inventory.unit_number, block=inventory.block,
                area_marla=area, rate_per_marla=rate, total_value=area * rate,
                installment_cycle=cycle, num_installments=num_inst, first_due_date=first_due,
                booking_date=date.fromisoformat(row.get('booking_date')) if row.get('booking_date') else date.today(),
                notes=row.get('notes')
            )
            db.add(t); db.flush()
            
            cycle_months = {"monthly": 1, "quarterly": 3, "bi-annual": 6, "annual": 12}.get(cycle, 6)
            for n in range(num_inst):
                due = first_due + relativedelta(months=n * cycle_months)
                db.add(Installment(transaction_id=t.id, installment_number=n + 1, due_date=due, amount=(area * rate) / num_inst))
            
            inventory.status = "sold"
            results["success"] += 1
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    return results

# ============================================
# INSTALLMENTS API
# ============================================
@app.get("/api/installments/{tid}")
def get_installments(tid: str, db: Session = Depends(get_db)):
    t = db.query(Transaction).filter((Transaction.id == tid) | (Transaction.transaction_id == tid)).first()
    if not t: raise HTTPException(404, "Transaction not found")
    installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.installment_number).all()
    return [{"id": str(i.id), "number": i.installment_number, "due_date": str(i.due_date),
             "amount": float(i.amount), "amount_paid": float(i.amount_paid or 0),
             "balance": float(i.amount) - float(i.amount_paid or 0), "status": i.status} for i in installments]

@app.put("/api/installments/{iid}")
def update_installment(iid: str, data: dict, db: Session = Depends(get_db)):
    i = db.query(Installment).filter(Installment.id == iid).first()
    if not i: raise HTTPException(404, "Installment not found")
    if "due_date" in data: i.due_date = date.fromisoformat(data["due_date"]) if isinstance(data["due_date"], str) else data["due_date"]
    if "amount" in data: i.amount = data["amount"]
    if "amount_paid" in data: i.amount_paid = data["amount_paid"]
    if "notes" in data: i.notes = data["notes"]
    if float(i.amount_paid or 0) >= float(i.amount): i.status = "paid"
    elif float(i.amount_paid or 0) > 0: i.status = "partial"
    db.commit()
    return {"message": "Installment updated"}

# ============================================
# INTERACTIONS API
# ============================================
@app.get("/api/interactions")
def list_interactions(rep_id: str = None, customer_id: str = None, broker_id: str = None, 
                      limit: int = 100, db: Session = Depends(get_db)):
    q = db.query(Interaction)
    if rep_id:
        r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
        if r: q = q.filter(Interaction.company_rep_id == r.id)
    if customer_id:
        c = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_id == customer_id)).first()
        if c: q = q.filter(Interaction.customer_id == c.id)
    if broker_id:
        b = db.query(Broker).filter((Broker.id == broker_id) | (Broker.broker_id == broker_id)).first()
        if b: q = q.filter(Interaction.broker_id == b.id)
    
    interactions = q.order_by(Interaction.created_at.desc()).limit(limit).all()
    result = []
    for i in interactions:
        rep = db.query(CompanyRep).filter(CompanyRep.id == i.company_rep_id).first()
        cust = db.query(Customer).filter(Customer.id == i.customer_id).first() if i.customer_id else None
        broker = db.query(Broker).filter(Broker.id == i.broker_id).first() if i.broker_id else None
        result.append({
            "id": str(i.id), "interaction_id": i.interaction_id,
            "rep_name": rep.name if rep else None, "rep_id": rep.rep_id if rep else None,
            "customer_name": cust.name if cust else None, "customer_id": cust.customer_id if cust else None,
            "broker_name": broker.name if broker else None, "broker_id": broker.broker_id if broker else None,
            "interaction_type": i.interaction_type, "status": i.status,
            "notes": i.notes, "next_follow_up": str(i.next_follow_up) if i.next_follow_up else None,
            "created_at": str(i.created_at)
        })
    return result

@app.get("/api/interactions/summary")
def get_interactions_summary(db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    
    total = db.query(Interaction).count()
    total_calls = db.query(Interaction).filter(Interaction.interaction_type == "call").count()
    total_messages = db.query(Interaction).filter(Interaction.interaction_type == "message").count()
    total_whatsapp = db.query(Interaction).filter(Interaction.interaction_type == "whatsapp").count()
    
    today_count = db.query(Interaction).filter(func.date(Interaction.created_at) == today).count()
    week_count = db.query(Interaction).filter(func.date(Interaction.created_at) >= week_start).count()
    month_count = db.query(Interaction).filter(func.date(Interaction.created_at) >= month_start).count()
    
    # Pending follow-ups
    pending_followups = db.query(Interaction).filter(
        Interaction.next_follow_up.isnot(None),
        Interaction.next_follow_up <= today
    ).count()
    
    return {
        "total_interactions": total, "total_calls": total_calls,
        "total_messages": total_messages, "total_whatsapp": total_whatsapp,
        "today": today_count, "this_week": week_count, "this_month": month_count,
        "pending_followups": pending_followups
    }

@app.post("/api/interactions")
def create_interaction(data: dict, db: Session = Depends(get_db)):
    rep = db.query(CompanyRep).filter((CompanyRep.id == data["company_rep_id"]) | (CompanyRep.rep_id == data["company_rep_id"])).first()
    if not rep: raise HTTPException(404, "Company rep not found")
    
    customer = None
    broker = None
    if data.get("customer_id"):
        customer = db.query(Customer).filter((Customer.id == data["customer_id"]) | (Customer.customer_id == data["customer_id"]) | (Customer.mobile == data["customer_id"])).first()
    if data.get("broker_id"):
        broker = db.query(Broker).filter((Broker.id == data["broker_id"]) | (Broker.broker_id == data["broker_id"]) | (Broker.mobile == data["broker_id"])).first()
    
    if not customer and not broker:
        raise HTTPException(400, "Must specify customer or broker")
    
    i = Interaction(
        company_rep_id=rep.id,
        customer_id=customer.id if customer else None,
        broker_id=broker.id if broker else None,
        interaction_type=data["interaction_type"],
        status=data.get("status"),
        notes=data.get("notes"),
        next_follow_up=date.fromisoformat(data["next_follow_up"]) if data.get("next_follow_up") else None
    )
    db.add(i); db.commit(); db.refresh(i)
    return {"message": "Interaction created", "id": str(i.id), "interaction_id": i.interaction_id}

@app.put("/api/interactions/{iid}")
def update_interaction(iid: str, data: dict, db: Session = Depends(get_db)):
    i = db.query(Interaction).filter((Interaction.id == iid) | (Interaction.interaction_id == iid)).first()
    if not i: raise HTTPException(404, "Interaction not found")
    for k in ["status", "notes"]:
        if k in data and data[k] is not None: setattr(i, k, data[k])
    if "next_follow_up" in data:
        i.next_follow_up = date.fromisoformat(data["next_follow_up"]) if data["next_follow_up"] else None
    db.commit()
    return {"message": "Interaction updated"}

@app.delete("/api/interactions/{iid}")
def delete_interaction(iid: str, db: Session = Depends(get_db)):
    i = db.query(Interaction).filter((Interaction.id == iid) | (Interaction.interaction_id == iid)).first()
    if not i: raise HTTPException(404, "Interaction not found")
    db.delete(i); db.commit()
    return {"message": "Interaction deleted"}

# ============================================
# CAMPAIGNS API
# ============================================
@app.get("/api/campaigns")
def list_campaigns(db: Session = Depends(get_db)):
    try:
        campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).all()
        result = []
        for c in campaigns:
            leads = db.query(Lead).filter(Lead.campaign_id == c.id).all()
            lead_stats = {"total": len(leads), "new": 0, "contacted": 0, "qualified": 0, "converted": 0, "lost": 0}
            for l in leads:
                if l.status in lead_stats: lead_stats[l.status] += 1
            result.append({
                "id": str(c.id), "campaign_id": c.campaign_id, "name": c.name,
                "source": c.source, "start_date": str(c.start_date) if c.start_date else None,
                "end_date": str(c.end_date) if c.end_date else None,
                "budget": float(c.budget) if c.budget else None, "status": c.status,
                "notes": c.notes, "lead_stats": lead_stats
            })
        return result
    except Exception as e:
        print(f"Error listing campaigns: {e}")
        return []

@app.get("/api/campaigns/summary")
def get_campaigns_summary(db: Session = Depends(get_db)):
    try:
        total = db.query(Campaign).count()
        active = db.query(Campaign).filter(Campaign.status == "active").count()
        total_leads = db.query(Lead).count()
        converted = db.query(Lead).filter(Lead.status == "converted").count()
        total_budget = db.query(func.sum(Campaign.budget)).scalar() or 0
        return {
            "total_campaigns": total, "active_campaigns": active,
            "total_leads": total_leads, "converted_leads": converted,
            "total_budget": float(total_budget),
            "conversion_rate": round(converted / total_leads * 100, 1) if total_leads > 0 else 0
        }
    except Exception as e:
        print(f"Error getting campaigns summary: {e}")
        return {"total_campaigns": 0, "active_campaigns": 0, "total_leads": 0, "converted_leads": 0, "total_budget": 0, "conversion_rate": 0}

@app.post("/api/campaigns")
def create_campaign(data: dict, db: Session = Depends(get_db)):
    try:
        c = Campaign(
            name=data["name"], source=data.get("source"),
            start_date=date.fromisoformat(data["start_date"]) if data.get("start_date") else None,
            end_date=date.fromisoformat(data["end_date"]) if data.get("end_date") else None,
            budget=data.get("budget") if data.get("budget") else None, 
            notes=data.get("notes")
        )
        db.add(c); db.commit(); db.refresh(c)
        return {"message": "Campaign created", "id": str(c.id), "campaign_id": c.campaign_id}
    except Exception as e:
        db.rollback()
        print(f"Error creating campaign: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Error creating campaign: {str(e)}")

@app.put("/api/campaigns/{cid}")
def update_campaign(cid: str, data: dict, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter((Campaign.id == cid) | (Campaign.campaign_id == cid)).first()
    if not c: raise HTTPException(404, "Campaign not found")
    for k in ["name", "source", "budget", "status", "notes"]:
        if k in data and data[k] is not None: setattr(c, k, data[k])
    if "start_date" in data: c.start_date = date.fromisoformat(data["start_date"]) if data["start_date"] else None
    if "end_date" in data: c.end_date = date.fromisoformat(data["end_date"]) if data["end_date"] else None
    db.commit()
    return {"message": "Campaign updated"}

@app.delete("/api/campaigns/{cid}")
def delete_campaign(cid: str, db: Session = Depends(get_db)):
    c = db.query(Campaign).filter((Campaign.id == cid) | (Campaign.campaign_id == cid)).first()
    if not c: raise HTTPException(404, "Campaign not found")
    db.delete(c); db.commit()
    return {"message": "Campaign deleted"}

# ============================================
# LEADS API
# ============================================
@app.get("/api/leads")
def list_leads(campaign_id: str = None, rep_id: str = None, status: str = None, 
               limit: int = 100, db: Session = Depends(get_db)):
    try:
        q = db.query(Lead)
        if campaign_id and campaign_id.strip():
            c = db.query(Campaign).filter((Campaign.id == campaign_id) | (Campaign.campaign_id == campaign_id)).first()
            if c: q = q.filter(Lead.campaign_id == c.id)
        if rep_id and rep_id.strip():
            r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
            if r: q = q.filter(Lead.assigned_rep_id == r.id)
        if status and status.strip(): q = q.filter(Lead.status == status)
        
        leads = q.order_by(Lead.created_at.desc()).limit(limit).all()
        result = []
        for l in leads:
            campaign = db.query(Campaign).filter(Campaign.id == l.campaign_id).first() if l.campaign_id else None
            rep = db.query(CompanyRep).filter(CompanyRep.id == l.assigned_rep_id).first() if l.assigned_rep_id else None
            result.append({
                "id": str(l.id), "lead_id": l.lead_id, "name": l.name,
                "mobile": l.mobile, "email": l.email,
                "campaign_name": campaign.name if campaign else None,
                "campaign_id": campaign.campaign_id if campaign else None,
            "assigned_rep": rep.name if rep else None, "rep_id": rep.rep_id if rep else None,
            "status": l.status, "lead_type": l.lead_type or "prospect", "notes": l.notes,
            "created_at": str(l.created_at)
        })
        return result
    except Exception as e:
        print(f"Error listing leads: {e}")
        return []

@app.post("/api/leads")
def create_lead(data: dict, db: Session = Depends(get_db)):
    try:
        campaign = None
        rep = None
        if data.get("campaign_id"):
            campaign = db.query(Campaign).filter((Campaign.id == data["campaign_id"]) | (Campaign.campaign_id == data["campaign_id"])).first()
        if data.get("assigned_rep_id"):
            rep = db.query(CompanyRep).filter((CompanyRep.id == data["assigned_rep_id"]) | (CompanyRep.rep_id == data["assigned_rep_id"])).first()
        
        l = Lead(
            campaign_id=campaign.id if campaign else None,
            assigned_rep_id=rep.id if rep else None,
            name=data["name"], mobile=data.get("mobile"), email=data.get("email"),
            source_details=data.get("source_details"), status=data.get("status", "new"),
            lead_type=data.get("lead_type", "prospect"), notes=data.get("notes")
        )
        db.add(l); db.commit(); db.refresh(l)
        return {"message": "Lead created", "id": str(l.id), "lead_id": l.lead_id}
    except Exception as e:
        db.rollback()
        print(f"Error creating lead: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Error creating lead: {str(e)}")

@app.get("/api/leads/template/download")
def download_leads_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name*', 'mobile', 'email', 'assigned_rep', 'lead_type', 'source_details', 'notes'])
    writer.writerow(['John Doe', '0300-1234567', 'john@email.com', 'REP-0001', 'prospect', 'Facebook form', 'Interested in Phase 2'])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=leads_template.csv"})

@app.post("/api/leads/bulk-import")
async def bulk_import_leads(file: UploadFile = File(...), campaign_id: str = None, db: Session = Depends(get_db)):
    campaign = None
    if campaign_id:
        campaign = db.query(Campaign).filter((Campaign.id == campaign_id) | (Campaign.campaign_id == campaign_id)).first()
    
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": []}
    for i, row in enumerate(reader, 2):
        try:
            name = row.get('name', '').strip()
            if not name: results["errors"].append(f"Row {i}: Name required"); continue
            
            rep = None
            if row.get('assigned_rep'):
                rep = db.query(CompanyRep).filter(
                    (CompanyRep.rep_id == row['assigned_rep']) | (CompanyRep.name == row['assigned_rep'])
                ).first()
            
            l = Lead(
                campaign_id=campaign.id if campaign else None,
                assigned_rep_id=rep.id if rep else None,
                name=name, mobile=row.get('mobile'), email=row.get('email'),
                source_details=row.get('source_details'), notes=row.get('notes')
            )
            db.add(l); db.flush()
            results["success"] += 1
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    return results

@app.put("/api/leads/{lid}")
def update_lead(lid: str, data: dict, db: Session = Depends(get_db)):
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")
    for k in ["name", "mobile", "email", "source_details", "status", "lead_type", "notes"]:
        if k in data and data[k] is not None: setattr(l, k, data[k])
    if "assigned_rep_id" in data:
        rep = db.query(CompanyRep).filter((CompanyRep.id == data["assigned_rep_id"]) | (CompanyRep.rep_id == data["assigned_rep_id"])).first() if data["assigned_rep_id"] else None
        l.assigned_rep_id = rep.id if rep else None
    db.commit()
    return {"message": "Lead updated"}

@app.post("/api/leads/{lid}/convert")
def convert_lead(lid: str, data: dict, db: Session = Depends(get_db)):
    """Convert a lead to customer or broker"""
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")
    
    convert_to = data.get("convert_to")  # 'customer' or 'broker'
    if convert_to == "customer":
        # Check if customer with same mobile exists
        existing = db.query(Customer).filter(Customer.mobile == l.mobile).first() if l.mobile else None
        if existing:
            l.converted_customer_id = existing.id
            l.lead_type = "customer"
            l.status = "converted"
        else:
            # Create new customer
            c = Customer(name=l.name, mobile=l.mobile or f"lead-{l.lead_id}", email=l.email)
            db.add(c); db.flush()
            l.converted_customer_id = c.id
            l.lead_type = "customer"
            l.status = "converted"
        db.commit()
        return {"message": "Lead converted to customer", "customer_id": str(l.converted_customer_id)}
    
    elif convert_to == "broker":
        existing = db.query(Broker).filter(Broker.mobile == l.mobile).first() if l.mobile else None
        if existing:
            l.converted_broker_id = existing.id
            l.lead_type = "broker"
            l.status = "converted"
        else:
            b = Broker(name=l.name, mobile=l.mobile or f"lead-{l.lead_id}", email=l.email)
            db.add(b); db.flush()
            l.converted_broker_id = b.id
            l.lead_type = "broker"
            l.status = "converted"
        db.commit()
        return {"message": "Lead converted to broker", "broker_id": str(l.converted_broker_id)}
    
    raise HTTPException(400, "Invalid conversion type")

@app.delete("/api/leads/{lid}")
def delete_lead(lid: str, db: Session = Depends(get_db)):
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")
    db.delete(l); db.commit()
    return {"message": "Lead deleted"}

# ============================================
# RECEIPTS API
# ============================================
@app.get("/api/receipts")
def list_receipts(customer_id: str = None, transaction_id: str = None, limit: int = 100, db: Session = Depends(get_db)):
    try:
        q = db.query(Receipt)
        if customer_id and customer_id.strip():
            c = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_id == customer_id)).first()
            if c: q = q.filter(Receipt.customer_id == c.id)
        if transaction_id and transaction_id.strip():
            t = db.query(Transaction).filter((Transaction.id == transaction_id) | (Transaction.transaction_id == transaction_id)).first()
            if t: q = q.filter(Receipt.transaction_id == t.id)
        
        receipts = q.order_by(Receipt.created_at.desc()).limit(limit).all()
        result = []
        for r in receipts:
            cust = db.query(Customer).filter(Customer.id == r.customer_id).first()
            txn = db.query(Transaction).filter(Transaction.id == r.transaction_id).first() if r.transaction_id else None
            proj = db.query(Project).filter(Project.id == txn.project_id).first() if txn else None
            rep = db.query(CompanyRep).filter(CompanyRep.id == r.created_by_rep_id).first() if r.created_by_rep_id else None
            
            # Get allocations
            allocations = db.query(ReceiptAllocation).filter(ReceiptAllocation.receipt_id == r.id).all()
            alloc_details = []
            for a in allocations:
                inst = db.query(Installment).filter(Installment.id == a.installment_id).first()
                alloc_details.append({
                    "id": str(a.id), "installment_number": inst.installment_number if inst else None,
                    "amount": float(a.amount)
                })
            
            result.append({
                "id": str(r.id), "receipt_id": r.receipt_id,
                "customer_name": cust.name if cust else None, "customer_id": cust.customer_id if cust else None,
                "transaction_id": txn.transaction_id if txn else None,
                "project_name": proj.name if proj else None, "unit_number": txn.unit_number if txn else None,
                "amount": float(r.amount), "payment_method": r.payment_method,
                "reference_number": r.reference_number,
                "payment_date": str(r.payment_date) if r.payment_date else None,
                "notes": r.notes, "created_by": rep.name if rep else None,
                "created_at": str(r.created_at), "allocations": alloc_details
            })
        return result
    except Exception as e:
        print(f"Error listing receipts: {e}")
        return []

@app.get("/api/receipts/summary")
def get_receipts_summary(db: Session = Depends(get_db)):
    try:
        today = date.today()
        month_start = today.replace(day=1)
        
        total_receipts = db.query(Receipt).count()
        total_amount = db.query(func.sum(Receipt.amount)).scalar() or 0
        today_count = db.query(Receipt).filter(Receipt.payment_date == today).count()
        today_amount = db.query(func.sum(Receipt.amount)).filter(Receipt.payment_date == today).scalar() or 0
        month_count = db.query(Receipt).filter(Receipt.payment_date >= month_start).count()
        month_amount = db.query(func.sum(Receipt.amount)).filter(Receipt.payment_date >= month_start).scalar() or 0
        
        # By payment method
        by_method = {}
        for method in ['cash', 'cheque', 'bank_transfer', 'online']:
            amt = db.query(func.sum(Receipt.amount)).filter(Receipt.payment_method == method).scalar() or 0
            by_method[method] = float(amt)
        
        return {
            "total_receipts": total_receipts, "total_amount": float(total_amount),
            "today_count": today_count, "today_amount": float(today_amount),
            "month_count": month_count, "month_amount": float(month_amount),
            "by_method": by_method
        }
    except Exception as e:
        print(f"Error getting receipts summary: {e}")
        return {"total_receipts": 0, "total_amount": 0, "today_count": 0, "today_amount": 0, "month_count": 0, "month_amount": 0, "by_method": {}}

@app.get("/api/receipts/customer/{cid}/transactions")
def get_customer_transactions_for_receipt(cid: str, db: Session = Depends(get_db)):
    """Get customer's transactions with installment details for receipt allocation"""
    c = db.query(Customer).filter((Customer.id == cid) | (Customer.customer_id == cid) | (Customer.mobile == cid)).first()
    if not c: raise HTTPException(404, "Customer not found")
    
    txns = db.query(Transaction).filter(Transaction.customer_id == c.id).all()
    result = []
    for t in txns:
        proj = db.query(Project).filter(Project.id == t.project_id).first()
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.installment_number).all()
        
        inst_list = []
        for i in installments:
            balance = float(i.amount) - float(i.amount_paid or 0)
            if balance > 0:  # Only show unpaid installments
                inst_list.append({
                    "id": str(i.id), "number": i.installment_number,
                    "due_date": str(i.due_date), "amount": float(i.amount),
                    "paid": float(i.amount_paid or 0), "balance": balance, "status": i.status
                })
        
        if inst_list:  # Only include transactions with pending installments
            result.append({
                "id": str(t.id), "transaction_id": t.transaction_id,
                "project_name": proj.name if proj else None, "unit_number": t.unit_number,
                "total_value": float(t.total_value),
                "total_paid": sum(float(i.amount_paid or 0) for i in installments),
                "balance": float(t.total_value) - sum(float(i.amount_paid or 0) for i in installments),
                "installments": inst_list
            })
    return result

@app.post("/api/receipts")
def create_receipt(data: dict, db: Session = Depends(get_db)):
    customer = db.query(Customer).filter(
        (Customer.id == data["customer_id"]) | (Customer.customer_id == data["customer_id"]) | (Customer.mobile == data["customer_id"])
    ).first()
    if not customer: raise HTTPException(404, "Customer not found")
    
    transaction = None
    if data.get("transaction_id"):
        transaction = db.query(Transaction).filter(
            (Transaction.id == data["transaction_id"]) | (Transaction.transaction_id == data["transaction_id"])
        ).first()
    
    rep = None
    if data.get("created_by_rep_id"):
        rep = db.query(CompanyRep).filter(
            (CompanyRep.id == data["created_by_rep_id"]) | (CompanyRep.rep_id == data["created_by_rep_id"])
        ).first()
    
    r = Receipt(
        customer_id=customer.id,
        transaction_id=transaction.id if transaction else None,
        amount=data["amount"],
        payment_method=data.get("payment_method"),
        reference_number=data.get("reference_number"),
        payment_date=date.fromisoformat(data["payment_date"]) if data.get("payment_date") else date.today(),
        notes=data.get("notes"),
        created_by_rep_id=rep.id if rep else None
    )
    db.add(r); db.flush()
    
    # Auto-allocate to installments if transaction specified
    allocations = data.get("allocations", [])
    if allocations:
        for alloc in allocations:
            inst = db.query(Installment).filter(Installment.id == alloc["installment_id"]).first()
            if inst:
                db.add(ReceiptAllocation(receipt_id=r.id, installment_id=inst.id, amount=alloc["amount"]))
                inst.amount_paid = float(inst.amount_paid or 0) + float(alloc["amount"])
                if float(inst.amount_paid) >= float(inst.amount):
                    inst.status = "paid"
                elif float(inst.amount_paid) > 0:
                    inst.status = "partial"
    elif transaction:
        # Auto-allocate to oldest unpaid installments
        remaining = float(data["amount"])
        installments = db.query(Installment).filter(
            Installment.transaction_id == transaction.id,
            Installment.status != "paid"
        ).order_by(Installment.installment_number).all()
        
        for inst in installments:
            if remaining <= 0: break
            balance = float(inst.amount) - float(inst.amount_paid or 0)
            alloc_amount = min(remaining, balance)
            
            db.add(ReceiptAllocation(receipt_id=r.id, installment_id=inst.id, amount=alloc_amount))
            inst.amount_paid = float(inst.amount_paid or 0) + alloc_amount
            if float(inst.amount_paid) >= float(inst.amount):
                inst.status = "paid"
            elif float(inst.amount_paid) > 0:
                inst.status = "partial"
            remaining -= alloc_amount
    
    db.commit(); db.refresh(r)
    return {"message": "Receipt created", "id": str(r.id), "receipt_id": r.receipt_id}

@app.delete("/api/receipts/{rid}")
def delete_receipt(rid: str, db: Session = Depends(get_db)):
    r = db.query(Receipt).filter((Receipt.id == rid) | (Receipt.receipt_id == rid)).first()
    if not r: raise HTTPException(404, "Receipt not found")
    
    # Reverse allocations
    allocations = db.query(ReceiptAllocation).filter(ReceiptAllocation.receipt_id == r.id).all()
    for a in allocations:
        inst = db.query(Installment).filter(Installment.id == a.installment_id).first()
        if inst:
            inst.amount_paid = max(0, float(inst.amount_paid or 0) - float(a.amount))
            if float(inst.amount_paid) >= float(inst.amount):
                inst.status = "paid"
            elif float(inst.amount_paid) > 0:
                inst.status = "partial"
            else:
                inst.status = "pending"
        db.delete(a)
    
    db.delete(r); db.commit()
    return {"message": "Receipt deleted"}

# ============================================
# CREDITORS API
# ============================================
@app.get("/api/creditors")
def list_creditors(db: Session = Depends(get_db)):
    creditors = db.query(Creditor).order_by(Creditor.created_at.desc()).all()
    return [{
        "id": str(c.id), "creditor_id": c.creditor_id, "name": c.name,
        "mobile": c.mobile, "company": c.company, "bank_name": c.bank_name,
        "bank_account": c.bank_account, "bank_iban": c.bank_iban,
        "notes": c.notes, "status": c.status, "created_at": str(c.created_at)
    } for c in creditors]

@app.get("/api/creditors/{cid}")
def get_creditor(cid: str, db: Session = Depends(get_db)):
    c = db.query(Creditor).filter((Creditor.id == cid) | (Creditor.creditor_id == cid)).first()
    if not c: raise HTTPException(404, "Creditor not found")
    return {
        "id": str(c.id), "creditor_id": c.creditor_id, "name": c.name,
        "mobile": c.mobile, "company": c.company, "bank_name": c.bank_name,
        "bank_account": c.bank_account, "bank_iban": c.bank_iban,
        "notes": c.notes, "status": c.status, "created_at": str(c.created_at)
    }

@app.post("/api/creditors")
def create_creditor(data: dict, db: Session = Depends(get_db)):
    c = Creditor(
        name=data["name"], mobile=data.get("mobile"), company=data.get("company"),
        bank_name=data.get("bank_name"), bank_account=data.get("bank_account"),
        bank_iban=data.get("bank_iban"), notes=data.get("notes")
    )
    db.add(c); db.commit(); db.refresh(c)
    return {"message": "Creditor created", "id": str(c.id), "creditor_id": c.creditor_id}

@app.put("/api/creditors/{cid}")
def update_creditor(cid: str, data: dict, db: Session = Depends(get_db)):
    c = db.query(Creditor).filter((Creditor.id == cid) | (Creditor.creditor_id == cid)).first()
    if not c: raise HTTPException(404, "Creditor not found")
    for k in ["name", "mobile", "company", "bank_name", "bank_account", "bank_iban", "notes", "status"]:
        if k in data and data[k] is not None: setattr(c, k, data[k])
    db.commit()
    return {"message": "Creditor updated"}

@app.delete("/api/creditors/{cid}")
def delete_creditor(cid: str, db: Session = Depends(get_db)):
    c = db.query(Creditor).filter((Creditor.id == cid) | (Creditor.creditor_id == cid)).first()
    if not c: raise HTTPException(404, "Creditor not found")
    db.delete(c); db.commit()
    return {"message": "Creditor deleted"}

# ============================================
# PAYMENTS API
# ============================================
@app.get("/api/payments")
def list_payments(
    broker_id: str = None, rep_id: str = None, creditor_id: str = None,
    payment_type: str = None, status: str = None, start_date: str = None,
    end_date: str = None, limit: int = 100, db: Session = Depends(get_db)
):
    q = db.query(Payment)
    if broker_id:
        b = db.query(Broker).filter((Broker.id == broker_id) | (Broker.broker_id == broker_id)).first()
        if b: q = q.filter(Payment.broker_id == b.id)
    if rep_id:
        r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
        if r: q = q.filter(Payment.company_rep_id == r.id)
    if creditor_id:
        c = db.query(Creditor).filter((Creditor.id == creditor_id) | (Creditor.creditor_id == creditor_id)).first()
        if c: q = q.filter(Payment.creditor_id == c.id)
    if payment_type: q = q.filter(Payment.payment_type == payment_type)
    if status: q = q.filter(Payment.status == status)
    if start_date: q = q.filter(Payment.payment_date >= date.fromisoformat(start_date))
    if end_date: q = q.filter(Payment.payment_date <= date.fromisoformat(end_date))
    
    payments = q.order_by(Payment.created_at.desc()).limit(limit).all()
    result = []
    for p in payments:
        broker = db.query(Broker).filter(Broker.id == p.broker_id).first() if p.broker_id else None
        rep = db.query(CompanyRep).filter(CompanyRep.id == p.company_rep_id).first() if p.company_rep_id else None
        creditor = db.query(Creditor).filter(Creditor.id == p.creditor_id).first() if p.creditor_id else None
        txn = db.query(Transaction).filter(Transaction.id == p.transaction_id).first() if p.transaction_id else None
        approver = db.query(CompanyRep).filter(CompanyRep.id == p.approved_by_rep_id).first() if p.approved_by_rep_id else None
        
        result.append({
            "id": str(p.id), "payment_id": p.payment_id, "payment_type": p.payment_type,
            "payee_type": p.payee_type, "broker_name": broker.name if broker else None,
            "broker_id": broker.broker_id if broker else None,
            "rep_name": rep.name if rep else None, "rep_id": rep.rep_id if rep else None,
            "creditor_name": creditor.name if creditor else None,
            "creditor_id": creditor.creditor_id if creditor else None,
            "transaction_id": txn.transaction_id if txn else None,
            "amount": float(p.amount), "payment_method": p.payment_method,
            "reference_number": p.reference_number,
            "payment_date": str(p.payment_date) if p.payment_date else None,
            "notes": p.notes, "approved_by": approver.name if approver else None,
            "status": p.status, "created_at": str(p.created_at)
        })
    return result

@app.get("/api/payments/summary")
def get_payments_summary(db: Session = Depends(get_db)):
    today = date.today()
    month_start = today.replace(day=1)
    
    total_payments = db.query(Payment).count()
    total_amount = db.query(func.sum(Payment.amount)).filter(Payment.status == "completed").scalar() or 0
    today_count = db.query(Payment).filter(Payment.payment_date == today, Payment.status == "completed").count()
    today_amount = db.query(func.sum(Payment.amount)).filter(Payment.payment_date == today, Payment.status == "completed").scalar() or 0
    month_count = db.query(Payment).filter(Payment.payment_date >= month_start, Payment.status == "completed").count()
    month_amount = db.query(func.sum(Payment.amount)).filter(Payment.payment_date >= month_start, Payment.status == "completed").scalar() or 0
    
    # By payment type
    by_type = {}
    for ptype in ['broker_commission', 'rep_incentive', 'creditor', 'other']:
        amt = db.query(func.sum(Payment.amount)).filter(Payment.payment_type == ptype, Payment.status == "completed").scalar() or 0
        by_type[ptype] = float(amt)
    
    # Pending payments
    pending_count = db.query(Payment).filter(Payment.status == "pending").count()
    pending_amount = db.query(func.sum(Payment.amount)).filter(Payment.status == "pending").scalar() or 0
    
    return {
        "total_payments": total_payments, "total_amount": float(total_amount),
        "today_count": today_count, "today_amount": float(today_amount),
        "month_count": month_count, "month_amount": float(month_amount),
        "by_type": by_type, "pending_count": pending_count, "pending_amount": float(pending_amount)
    }

@app.get("/api/payments/available-commissions")
def get_available_commissions(broker_id: str = None, rep_id: str = None, db: Session = Depends(get_db)):
    """Calculate available commissions for brokers/reps"""
    result = {}
    
    if broker_id:
        broker = db.query(Broker).filter((Broker.id == broker_id) | (Broker.broker_id == broker_id)).first()
        if not broker: raise HTTPException(404, "Broker not found")
        
        # Get all transactions for this broker
        txns = db.query(Transaction).filter(Transaction.broker_id == broker.id).all()
        total_commission_earned = sum(float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100 for t in txns)
        
        # Get total paid
        total_paid = db.query(func.sum(Payment.amount)).filter(
            Payment.broker_id == broker.id,
            Payment.payment_type == "broker_commission",
            Payment.status == "completed"
        ).scalar() or 0
        
        result["broker"] = {
            "broker_id": broker.broker_id, "name": broker.name,
            "total_commission_earned": total_commission_earned,
            "total_commission_paid": float(total_paid),
            "available_commission": total_commission_earned - float(total_paid),
            "transactions": [{"transaction_id": t.transaction_id, "commission": float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100} for t in txns]
        }
    
    if rep_id:
        rep = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
        if not rep: raise HTTPException(404, "Rep not found")
        
        # For reps, we'd need to define incentive structure - for now, return basic info
        total_paid = db.query(func.sum(Payment.amount)).filter(
            Payment.company_rep_id == rep.id,
            Payment.payment_type == "rep_incentive",
            Payment.status == "completed"
        ).scalar() or 0
        
        result["rep"] = {
            "rep_id": rep.rep_id, "name": rep.name,
            "total_incentive_paid": float(total_paid)
        }
    
    return result

@app.get("/api/payments/broker/{broker_id}")
def get_broker_payments(broker_id: str, db: Session = Depends(get_db)):
    broker = db.query(Broker).filter((Broker.id == broker_id) | (Broker.broker_id == broker_id)).first()
    if not broker: raise HTTPException(404, "Broker not found")
    
    payments = db.query(Payment).filter(
        Payment.broker_id == broker.id
    ).order_by(Payment.created_at.desc()).all()
    
    return [{
        "id": str(p.id), "payment_id": p.payment_id, "amount": float(p.amount),
        "payment_type": p.payment_type, "payment_method": p.payment_method,
        "payment_date": str(p.payment_date), "status": p.status,
        "transaction_id": db.query(Transaction).filter(Transaction.id == p.transaction_id).first().transaction_id if p.transaction_id else None,
        "created_at": str(p.created_at)
    } for p in payments]

@app.get("/api/payments/rep/{rep_id}")
def get_rep_payments(rep_id: str, db: Session = Depends(get_db)):
    rep = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
    if not rep: raise HTTPException(404, "Rep not found")
    
    payments = db.query(Payment).filter(
        Payment.company_rep_id == rep.id
    ).order_by(Payment.created_at.desc()).all()
    
    return [{
        "id": str(p.id), "payment_id": p.payment_id, "amount": float(p.amount),
        "payment_type": p.payment_type, "payment_method": p.payment_method,
        "payment_date": str(p.payment_date), "status": p.status,
        "created_at": str(p.created_at)
    } for p in payments]

@app.get("/api/payments/{pid}")
def get_payment(pid: str, db: Session = Depends(get_db)):
    p = db.query(Payment).filter((Payment.id == pid) | (Payment.payment_id == pid)).first()
    if not p: raise HTTPException(404, "Payment not found")
    
    broker = db.query(Broker).filter(Broker.id == p.broker_id).first() if p.broker_id else None
    rep = db.query(CompanyRep).filter(CompanyRep.id == p.company_rep_id).first() if p.company_rep_id else None
    creditor = db.query(Creditor).filter(Creditor.id == p.creditor_id).first() if p.creditor_id else None
    txn = db.query(Transaction).filter(Transaction.id == p.transaction_id).first() if p.transaction_id else None
    approver = db.query(CompanyRep).filter(CompanyRep.id == p.approved_by_rep_id).first() if p.approved_by_rep_id else None
    
    # Get allocations
    allocations = db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == p.id).all()
    alloc_details = []
    for a in allocations:
        t = db.query(Transaction).filter(Transaction.id == a.transaction_id).first()
        alloc_details.append({
            "id": str(a.id), "transaction_id": t.transaction_id if t else None,
            "amount": float(a.amount)
        })
    
    return {
        "id": str(p.id), "payment_id": p.payment_id, "payment_type": p.payment_type,
        "payee_type": p.payee_type,
        "broker": {"id": str(broker.id), "name": broker.name, "broker_id": broker.broker_id} if broker else None,
        "rep": {"id": str(rep.id), "name": rep.name, "rep_id": rep.rep_id} if rep else None,
        "creditor": {"id": str(creditor.id), "name": creditor.name, "creditor_id": creditor.creditor_id} if creditor else None,
        "transaction": {"id": str(txn.id), "transaction_id": txn.transaction_id} if txn else None,
        "amount": float(p.amount), "payment_method": p.payment_method,
        "reference_number": p.reference_number,
        "payment_date": str(p.payment_date) if p.payment_date else None,
        "notes": p.notes, "approved_by": {"id": str(approver.id), "name": approver.name} if approver else None,
        "status": p.status, "created_at": str(p.created_at),
        "allocations": alloc_details
    }

@app.post("/api/payments")
def create_payment(data: dict, db: Session = Depends(get_db)):
    broker = None
    rep = None
    creditor = None
    transaction = None
    approver = None
    
    if data.get("broker_id"):
        broker = db.query(Broker).filter(
            (Broker.id == data["broker_id"]) | (Broker.broker_id == data["broker_id"]) | (Broker.mobile == data["broker_id"])
        ).first()
        if not broker: raise HTTPException(404, "Broker not found")
    
    if data.get("company_rep_id"):
        rep = db.query(CompanyRep).filter(
            (CompanyRep.id == data["company_rep_id"]) | (CompanyRep.rep_id == data["company_rep_id"])
        ).first()
        if not rep: raise HTTPException(404, "Rep not found")
    
    if data.get("creditor_id"):
        creditor = db.query(Creditor).filter(
            (Creditor.id == data["creditor_id"]) | (Creditor.creditor_id == data["creditor_id"])
        ).first()
        if not creditor: raise HTTPException(404, "Creditor not found")
    
    if data.get("transaction_id"):
        transaction = db.query(Transaction).filter(
            (Transaction.id == data["transaction_id"]) | (Transaction.transaction_id == data["transaction_id"])
        ).first()
    
    if data.get("approved_by_rep_id"):
        approver = db.query(CompanyRep).filter(
            (CompanyRep.id == data["approved_by_rep_id"]) | (CompanyRep.rep_id == data["approved_by_rep_id"])
        ).first()
    
    # Determine payee_type
    payee_type = None
    if broker: payee_type = "broker"
    elif rep: payee_type = "company_rep"
    elif creditor: payee_type = "creditor"
    
    p = Payment(
        payment_type=data["payment_type"],
        payee_type=payee_type,
        broker_id=broker.id if broker else None,
        company_rep_id=rep.id if rep else None,
        creditor_id=creditor.id if creditor else None,
        transaction_id=transaction.id if transaction else None,
        amount=data["amount"],
        payment_method=data.get("payment_method"),
        reference_number=data.get("reference_number"),
        payment_date=date.fromisoformat(data["payment_date"]) if data.get("payment_date") else date.today(),
        notes=data.get("notes"),
        approved_by_rep_id=approver.id if approver else None,
        status=data.get("status", "completed")
    )
    db.add(p); db.flush()
    
    # Handle allocations
    allocations = data.get("allocations", [])
    if allocations:
        for alloc in allocations:
            txn = db.query(Transaction).filter(
                (Transaction.id == alloc["transaction_id"]) | (Transaction.transaction_id == alloc["transaction_id"])
            ).first()
            if txn:
                db.add(PaymentAllocation(payment_id=p.id, transaction_id=txn.id, amount=alloc["amount"]))
    elif transaction:
        # Auto-allocate to transaction if only one transaction specified
        db.add(PaymentAllocation(payment_id=p.id, transaction_id=transaction.id, amount=data["amount"]))
    
    db.commit(); db.refresh(p)
    return {"message": "Payment created", "id": str(p.id), "payment_id": p.payment_id}

@app.put("/api/payments/{pid}")
def update_payment(pid: str, data: dict, db: Session = Depends(get_db)):
    p = db.query(Payment).filter((Payment.id == pid) | (Payment.payment_id == pid)).first()
    if not p: raise HTTPException(404, "Payment not found")
    
    for k in ["payment_type", "amount", "payment_method", "reference_number", "notes", "status"]:
        if k in data and data[k] is not None: setattr(p, k, data[k])
    if "payment_date" in data: p.payment_date = date.fromisoformat(data["payment_date"]) if data["payment_date"] else None
    
    db.commit()
    return {"message": "Payment updated"}

@app.delete("/api/payments/{pid}")
def delete_payment(pid: str, db: Session = Depends(get_db)):
    p = db.query(Payment).filter((Payment.id == pid) | (Payment.payment_id == pid)).first()
    if not p: raise HTTPException(404, "Payment not found")
    
    # Delete allocations
    allocations = db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == p.id).all()
    for a in allocations:
        db.delete(a)
    
    db.delete(p); db.commit()
    return {"message": "Payment deleted"}

# ============================================
# DASHBOARD API
# ============================================
@app.get("/api/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """Overall system statistics"""
    try:
        today = date.today()
        month_start = today.replace(day=1)
        
        # Customers
        total_customers = db.query(Customer).count()
        active_customers = db.query(Customer).join(Transaction).distinct().count()
        
        # Transactions
        total_transactions = db.query(Transaction).count()
        total_sale_value = db.query(func.sum(Transaction.total_value)).scalar() or 0
        
        # Receipts
        total_received = db.query(func.sum(Receipt.amount)).scalar() or 0
        month_received = db.query(func.sum(Receipt.amount)).filter(Receipt.payment_date >= month_start).scalar() or 0
        
        # Payments
        total_paid = db.query(func.sum(Payment.amount)).filter(Payment.status == "completed").scalar() or 0
        month_paid = db.query(func.sum(Payment.amount)).filter(Payment.payment_date >= month_start, Payment.status == "completed").scalar() or 0
        
        # Outstanding breakdown: Overdue vs Future Receivable
        today = date.today()
        total_overdue = 0
        total_future_receivable = 0
        
        all_transactions = db.query(Transaction).all()
        for txn in all_transactions:
            installments = db.query(Installment).filter(Installment.transaction_id == txn.id).all()
            for inst in installments:
                balance = float(inst.amount) - float(inst.amount_paid or 0)
                if balance > 0:
                    if inst.due_date <= today:
                        total_overdue += balance
                    else:
                        total_future_receivable += balance
        
        total_outstanding = float(total_sale_value) - float(total_received)
        
        # Projects
        total_projects = db.query(Project).count()
        active_projects = db.query(Project).filter(Project.status == "active").count()
        
        # Brokers
        total_brokers = db.query(Broker).count()
        active_brokers = db.query(Broker).filter(Broker.status == "active").count()
        
        # Inventory
        total_units = db.query(Inventory).count()
        available_units = db.query(Inventory).filter(Inventory.status == "available").count()
        sold_units = db.query(Inventory).filter(Inventory.status == "sold").count()
        
        # This month transactions
        this_month_txns = db.query(Transaction).filter(Transaction.booking_date >= month_start).count()
        this_month_sale = db.query(func.sum(Transaction.total_value)).filter(Transaction.booking_date >= month_start).scalar() or 0
        
        return {
            "customers": {"total": total_customers, "active": active_customers},
            "transactions": {"total": total_transactions, "total_value": float(total_sale_value), "this_month": this_month_txns, "this_month_value": float(this_month_sale)},
            "financials": {
                "total_sale": float(total_sale_value),
                "total_received": float(total_received),
                "total_outstanding": float(total_outstanding),
                "total_overdue": float(total_overdue),
                "future_receivable": float(total_future_receivable),
                "total_paid": float(total_paid),
                "month_received": float(month_received),
                "month_paid": float(month_paid)
            },
            "projects": {"total": total_projects, "active": active_projects},
            "brokers": {"total": total_brokers, "active": active_brokers},
            "inventory": {"total": total_units, "available": available_units, "sold": sold_units}
        }
    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg.lower() or "column" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail=f"Database schema error: Missing columns. Please run the migration script: python migrate_vector_schema.py. Error: {error_msg[:200]}"
            )
        raise HTTPException(status_code=500, detail=f"Error loading dashboard summary: {error_msg[:200]}")

@app.get("/api/dashboard/customer-stats")
def get_customer_stats(db: Session = Depends(get_db)):
    """Customer financial summaries"""
    customers = db.query(Customer).all()
    result = []
    
    for c in customers:
        txns = db.query(Transaction).filter(Transaction.customer_id == c.id).all()
        total_sale = sum(float(t.total_value or 0) for t in txns)
        
        # Calculate received
        total_received = 0
        for t in txns:
            installments = db.query(Installment).filter(Installment.transaction_id == t.id).all()
            total_received += sum(float(i.amount_paid or 0) for i in installments)
        
        # Calculate overdue (installments past due date)
        today = date.today()
        overdue = 0
        future_receivable = 0
        
        for t in txns:
            installments = db.query(Installment).filter(Installment.transaction_id == t.id).all()
            for i in installments:
                balance = float(i.amount) - float(i.amount_paid or 0)
                if balance > 0:
                    if i.due_date < today:
                        overdue += balance
                    else:
                        future_receivable += balance
        
        # Interaction count
        interactions = db.query(Interaction).filter(Interaction.customer_id == c.id).count()
        
        result.append({
            "customer_id": c.customer_id,
            "name": c.name,
            "mobile": c.mobile,
            "total_sale": total_sale,
            "total_received": total_received,
            "overdue": overdue,
            "future_receivable": future_receivable,
            "outstanding": total_sale - total_received,
            "interaction_count": interactions,
            "transaction_count": len(txns)
        })
    
    return result

@app.get("/api/dashboard/project-stats")
def get_project_stats(db: Session = Depends(get_db)):
    """Project performance statistics"""
    try:
        projects = db.query(Project).all()
        result = []
        
        for p in projects:
            inventory = db.query(Inventory).filter(Inventory.project_id == p.id).all()
            txns = db.query(Transaction).filter(Transaction.project_id == p.id).all()
            
            # Inventory stats
            available = [i for i in inventory if i.status == "available"]
            sold = [i for i in inventory if i.status == "sold"]
            total_marlas = sum(float(i.area_marla) for i in inventory)
            available_marlas = sum(float(i.area_marla) for i in available)
            sold_marlas = sum(float(i.area_marla) for i in sold)
            
            # Financial stats
            total_sale = sum(float(t.total_value or 0) for t in txns)
            total_received = 0
            overdue = 0
            future_receivable = 0
            today = date.today()
            
            for t in txns:
                installments = db.query(Installment).filter(Installment.transaction_id == t.id).all()
                for i in installments:
                    paid = float(i.amount_paid or 0)
                    total_received += paid
                    balance = float(i.amount) - paid
                    if balance > 0:
                        if i.due_date < today:
                            overdue += balance
                        else:
                            future_receivable += balance
            
            result.append({
                "project_id": p.project_id,
                "name": p.name,
                "location": p.location,
                "inventory": {
                    "total_units": len(inventory),
                    "available_units": len(available),
                    "sold_units": len(sold),
                    "total_marlas": total_marlas,
                    "available_marlas": available_marlas,
                    "sold_marlas": sold_marlas
                },
                "financials": {
                    "total_sale": total_sale,
                    "total_received": total_received,
                    "overdue": overdue,
                    "future_receivable": future_receivable,
                    "outstanding": total_sale - total_received
                },
                "transaction_count": len(txns)
            })
        
        return result
    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg.lower() or "column" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail=f"Database schema error: Missing columns. Please run the migration script: python migrate_vector_schema.py. Error: {error_msg[:200]}"
            )
        raise HTTPException(status_code=500, detail=f"Error loading project stats: {error_msg[:200]}")

@app.get("/api/dashboard/broker-stats")
def get_broker_stats(db: Session = Depends(get_db)):
    """Broker performance statistics"""
    brokers = db.query(Broker).all()
    result = []
    
    for b in brokers:
        txns = db.query(Transaction).filter(Transaction.broker_id == b.id).all()
        total_sale = sum(float(t.total_value or 0) for t in txns)
        total_commission_earned = sum(float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100 for t in txns)
        
        # Commission paid
        total_commission_paid = db.query(func.sum(Payment.amount)).filter(
            Payment.broker_id == b.id,
            Payment.payment_type == "broker_commission",
            Payment.status == "completed"
        ).scalar() or 0
        
        # Interactions
        interactions = db.query(Interaction).filter(Interaction.broker_id == b.id).count()
        
        result.append({
            "broker_id": b.broker_id,
            "name": b.name,
            "mobile": b.mobile,
            "total_transactions": len(txns),
            "total_sale_value": total_sale,
            "commission": {
                "rate": float(b.commission_rate or 0),
                "total_earned": total_commission_earned,
                "total_paid": float(total_commission_paid),
                "pending": total_commission_earned - float(total_commission_paid)
            },
            "interaction_count": interactions
        })
    
    return result

@app.get("/api/dashboard/revenue-trends")
def get_revenue_trends(start_date: str = None, end_date: str = None, db: Session = Depends(get_db)):
    """Time-series revenue data"""
    if not start_date:
        start_date = (date.today() - timedelta(days=90)).isoformat()
    if not end_date:
        end_date = date.today().isoformat()
    
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    
    # Get receipts by date
    receipts = db.query(Receipt).filter(
        Receipt.payment_date >= start,
        Receipt.payment_date <= end
    ).order_by(Receipt.payment_date).all()
    
    # Group by date
    daily_receipts = {}
    for r in receipts:
        date_str = str(r.payment_date)
        if date_str not in daily_receipts:
            daily_receipts[date_str] = 0
        daily_receipts[date_str] += float(r.amount)
    
    # Get payments by date
    payments = db.query(Payment).filter(
        Payment.payment_date >= start,
        Payment.payment_date <= end,
        Payment.status == "completed"
    ).order_by(Payment.payment_date).all()
    
    daily_payments = {}
    for p in payments:
        date_str = str(p.payment_date)
        if date_str not in daily_payments:
            daily_payments[date_str] = 0
        daily_payments[date_str] += float(p.amount)
    
    # Generate all dates in range
    trends = []
    current = start
    while current <= end:
        date_str = current.isoformat()
        trends.append({
            "date": date_str,
            "receipts": daily_receipts.get(date_str, 0),
            "payments": daily_payments.get(date_str, 0),
            "net": daily_receipts.get(date_str, 0) - daily_payments.get(date_str, 0)
        })
        current += timedelta(days=1)
    
    return trends

@app.get("/api/dashboard/top-receivables")
def get_top_receivables(limit: int = 10, db: Session = Depends(get_db)):
    """Top receivables by customer with overdue breakdown"""
    try:
        today = date.today()
        customers = db.query(Customer).all()
        result = []
        
        for c in customers:
            txns = db.query(Transaction).filter(Transaction.customer_id == c.id).all()
            total_sale = sum(float(t.total_value or 0) for t in txns)
            
            # Calculate received
            total_received = 0
            overdue_amount = 0
            future_amount = 0
            overdue_installments = []
            future_installments = []
            
            for t in txns:
                installments = db.query(Installment).filter(Installment.transaction_id == t.id).all()
                for i in installments:
                    paid = float(i.amount_paid or 0)
                    total_received += paid
                    balance = float(i.amount) - paid
                    if balance > 0:
                        inst_data = {
                            "installment_number": i.installment_number,
                            "due_date": str(i.due_date),
                            "amount": float(i.amount),
                            "amount_paid": paid,
                            "balance": balance,
                            "status": i.status,
                            "transaction_id": str(t.transaction_id),
                            "project_name": db.query(Project).filter(Project.id == t.project_id).first().name if t.project_id else None
                        }
                        if i.due_date <= today:
                            overdue_amount += balance
                            overdue_installments.append(inst_data)
                        else:
                            future_amount += balance
                            future_installments.append(inst_data)
            
            outstanding = total_sale - total_received
            if outstanding > 0:
                result.append({
                    "customer_id": c.customer_id,
                    "customer_name": c.name,
                    "mobile": c.mobile,
                    "total_sale": total_sale,
                    "total_received": total_received,
                    "total_outstanding": outstanding,
                    "overdue": overdue_amount,
                    "future_receivable": future_amount,
                    "overdue_installments": overdue_installments,
                    "future_installments": future_installments,
                    "transaction_count": len(txns)
                })
        
        # Sort by total outstanding descending
        result.sort(key=lambda x: x["total_outstanding"], reverse=True)
        return result[:limit]
    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg.lower() or "column" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail=f"Database schema error: Missing columns. Please run the migration script: python migrate_vector_schema.py. Error: {error_msg[:200]}"
            )
        raise HTTPException(status_code=500, detail=f"Error loading top receivables: {error_msg[:200]}")

@app.get("/api/dashboard/project-inventory")
def get_project_inventory(db: Session = Depends(get_db)):
    """Project-wise inventory breakdown with detailed metrics"""
    try:
        projects = db.query(Project).all()
        result = []
        
        for p in projects:
            inventory = db.query(Inventory).filter(Inventory.project_id == p.id).all()
            available = [i for i in inventory if i.status == "available"]
            sold = [i for i in inventory if i.status == "sold"]
            
            # Calculate totals
            total_units = len(inventory)
            available_units = len(available)
            sold_units = len(sold)
            
            total_marlas = sum(float(i.area_marla or 0) for i in inventory)
            available_marlas = sum(float(i.area_marla or 0) for i in available)
            sold_marlas = sum(float(i.area_marla or 0) for i in sold)
            
            total_value = sum(float(i.area_marla or 0) * float(i.rate_per_marla or 0) for i in inventory)
            available_value = sum(float(i.area_marla or 0) * float(i.rate_per_marla or 0) for i in available)
            sold_value = sum(float(i.area_marla or 0) * float(i.rate_per_marla or 0) for i in sold)
            
            # Average rates
            avg_rate = total_value / total_marlas if total_marlas > 0 else 0
            available_avg_rate = available_value / available_marlas if available_marlas > 0 else 0
            
            # Unit type breakdown
            unit_types = {}
            for i in inventory:
                ut = i.unit_type or "plot"
                if ut not in unit_types:
                    unit_types[ut] = {"total": 0, "available": 0, "sold": 0}
                unit_types[ut]["total"] += 1
                if i.status == "available":
                    unit_types[ut]["available"] += 1
                elif i.status == "sold":
                    unit_types[ut]["sold"] += 1
            
            result.append({
                "project_id": p.project_id,
                "name": p.name,
                "location": p.location,
                "status": p.status,
                "summary": {
                    "total_units": total_units,
                    "available_units": available_units,
                    "sold_units": sold_units,
                    "utilization_rate": (sold_units / total_units * 100) if total_units > 0 else 0
                },
                "area": {
                    "total_marlas": total_marlas,
                    "available_marlas": available_marlas,
                    "sold_marlas": sold_marlas,
                    "available_percentage": (available_marlas / total_marlas * 100) if total_marlas > 0 else 0
                },
                "value": {
                    "total_value": total_value,
                    "available_value": available_value,
                    "sold_value": sold_value,
                    "avg_rate_per_marla": avg_rate,
                    "available_avg_rate": available_avg_rate
                },
                "unit_types": unit_types
            })
        
        return result
    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg.lower() or "column" in error_msg.lower():
            raise HTTPException(
                status_code=500,
                detail=f"Database schema error: Missing columns. Please run the migration script: python migrate_vector_schema.py. Error: {error_msg[:200]}"
            )
        raise HTTPException(status_code=500, detail=f"Error loading project inventory: {error_msg[:200]}")

@app.get("/api/customers/{customer_id}/details")
def get_customer_details(customer_id: str, db: Session = Depends(get_db)):
    """Comprehensive customer details for modal popup"""
    # Find customer by ID or mobile
    customer = db.query(Customer).filter(
        (Customer.customer_id == customer_id) | (Customer.mobile == customer_id) | (Customer.id == customer_id)
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    today = date.today()
    
    # Transactions
    txns = db.query(Transaction).filter(Transaction.customer_id == customer.id).all()
    total_sale = sum(float(t.total_value or 0) for t in txns)
    
    # Receipts
    receipts = db.query(Receipt).filter(Receipt.customer_id == customer.id).order_by(Receipt.payment_date.desc()).all()
    total_received = sum(float(r.amount) for r in receipts)
    
    # Installments breakdown
    overdue_installments = []
    future_installments = []
    paid_installments = []
    total_overdue = 0
    total_future = 0
    
    for t in txns:
        project = db.query(Project).filter(Project.id == t.project_id).first()
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.due_date).all()
        
        for i in installments:
            paid = float(i.amount_paid or 0)
            balance = float(i.amount) - paid
            
            inst_data = {
                "id": str(i.id),
                "installment_number": i.installment_number,
                "due_date": str(i.due_date),
                "amount": float(i.amount),
                "amount_paid": paid,
                "balance": balance,
                "status": i.status,
                "transaction_id": str(t.transaction_id),
                "project_name": project.name if project else None,
                "unit_number": t.unit_number
            }
            
            if balance <= 0:
                paid_installments.append(inst_data)
            elif i.due_date <= today:
                overdue_installments.append(inst_data)
                total_overdue += balance
            else:
                future_installments.append(inst_data)
                total_future += balance
    
    # Interactions
    interactions = db.query(Interaction).filter(Interaction.customer_id == customer.id).order_by(Interaction.created_at.desc()).limit(20).all()
    
    return {
        "customer": {
            "id": str(customer.id),
            "customer_id": customer.customer_id,
            "name": customer.name,
            "mobile": customer.mobile,
            "email": customer.email,
            "address": customer.address,
            "cnic": customer.cnic,
            "notes": customer.notes,
            "created_at": str(customer.created_at) if customer.created_at else None
        },
        "financials": {
            "total_sale": total_sale,
            "total_received": total_received,
            "total_outstanding": total_sale - total_received,
            "total_overdue": total_overdue,
            "future_receivable": total_future,
            "transaction_count": len(txns)
        },
        "installments": {
            "overdue": overdue_installments,
            "future": future_installments,
            "paid": paid_installments
        },
        "receipts": [{
            "id": str(r.id),
            "receipt_id": r.receipt_id,
            "amount": float(r.amount),
            "payment_date": str(r.payment_date),
            "payment_method": r.payment_method,
            "reference_number": r.reference_number,
            "notes": r.notes
        } for r in receipts],
        "interactions": [{
            "id": str(i.id),
            "interaction_id": i.interaction_id,
            "interaction_type": i.interaction_type,
            "status": i.status,
            "notes": i.notes,
            "created_at": str(i.created_at),
            "next_follow_up": str(i.next_follow_up) if i.next_follow_up else None,
            "rep_name": db.query(CompanyRep).filter(CompanyRep.id == i.company_rep_id).first().name if i.company_rep_id else None
        } for i in interactions]
    }

@app.get("/api/brokers/{broker_id}/details")
def get_broker_details(broker_id: str, db: Session = Depends(get_db)):
    """Comprehensive broker details for modal popup"""
    # Find broker by ID or mobile
    broker = db.query(Broker).filter(
        (Broker.broker_id == broker_id) | (Broker.mobile == broker_id) | (Broker.id == broker_id)
    ).first()
    
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    
    # Transactions
    txns = db.query(Transaction).filter(Transaction.broker_id == broker.id).all()
    total_sale = sum(float(t.total_value or 0) for t in txns)
    
    # Commission calculations
    total_commission_earned = sum(float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100 for t in txns)
    
    # Commission paid
    payments = db.query(Payment).filter(
        Payment.broker_id == broker.id,
        Payment.payment_type == "broker_commission"
    ).order_by(Payment.payment_date.desc()).all()
    
    total_commission_paid = sum(float(p.amount) for p in payments if p.status == "completed")
    
    # Brokered transactions details
    brokered_transactions = []
    for t in txns:
        project = db.query(Project).filter(Project.id == t.project_id).first()
        customer = db.query(Customer).filter(Customer.id == t.customer_id).first()
        commission = float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100
        
        brokered_transactions.append({
            "transaction_id": str(t.transaction_id),
            "booking_date": str(t.booking_date),
            "project_name": project.name if project else None,
            "customer_name": customer.name if customer else None,
            "total_value": float(t.total_value),
            "commission_rate": float(t.broker_commission_rate or 0),
            "commission_amount": commission,
            "status": t.status
        })
    
    # Interactions
    interactions = db.query(Interaction).filter(Interaction.broker_id == broker.id).order_by(Interaction.created_at.desc()).limit(20).all()
    
    return {
        "broker": {
            "id": str(broker.id),
            "broker_id": broker.broker_id,
            "name": broker.name,
            "mobile": broker.mobile,
            "email": broker.email,
            "company": broker.company,
            "address": broker.address,
            "cnic": broker.cnic,
            "commission_rate": float(broker.commission_rate or 0),
            "bank_name": broker.bank_name,
            "bank_account": broker.bank_account,
            "bank_iban": broker.bank_iban,
            "status": broker.status,
            "notes": broker.notes,
            "created_at": str(broker.created_at) if broker.created_at else None
        },
        "performance": {
            "total_transactions": len(txns),
            "total_sale_value": total_sale,
            "commission": {
                "rate": float(broker.commission_rate or 0),
                "total_earned": total_commission_earned,
                "total_paid": total_commission_paid,
                "pending": total_commission_earned - total_commission_paid
            }
        },
        "brokered_transactions": brokered_transactions,
        "payments": [{
            "id": str(p.id),
            "payment_id": p.payment_id,
            "amount": float(p.amount),
            "payment_date": str(p.payment_date),
            "payment_method": p.payment_method,
            "status": p.status,
            "reference_number": p.reference_number
        } for p in payments],
        "interactions": [{
            "id": str(i.id),
            "interaction_id": i.interaction_id,
            "interaction_type": i.interaction_type,
            "status": i.status,
            "notes": i.notes,
            "created_at": str(i.created_at),
            "next_follow_up": str(i.next_follow_up) if i.next_follow_up else None,
            "rep_name": db.query(CompanyRep).filter(CompanyRep.id == i.company_rep_id).first().name if i.company_rep_id else None
        } for i in interactions]
    }

# ============================================
# REPORTS API
# ============================================
@app.get("/api/reports/customers/detailed/{customer_id}")
def get_customer_detailed_report(customer_id: str, db: Session = Depends(get_db)):
    """Get detailed customer financial report"""
    try:
        try:
            from app.reports import get_customer_detailed_report as get_report
        except ImportError:
            from reports import get_customer_detailed_report as get_report
        report = get_report(customer_id, db)
        if not report:
            raise HTTPException(status_code=404, detail="Customer not found")
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")

@app.get("/api/reports/customers/list")
def get_customers_list_report(db: Session = Depends(get_db)):
    """Get customer list with financials"""
    try:
        try:
            from app.reports import get_customer_detailed_report as get_report
        except ImportError:
            from reports import get_customer_detailed_report as get_report
        customers = db.query(Customer).all()
        result = []
        for c in customers:
            try:
                report = get_report(str(c.id), db)
                if report:
                    result.append({
                        "customer_id": report["customer"]["customer_id"],
                        "name": report["customer"]["name"],
                        "mobile": report["customer"]["mobile"],
                        "total_sale": report["financials"]["total_sale"],
                        "total_received": report["financials"]["total_received"],
                        "overdue": report["financials"]["overdue"],
                        "future_receivable": report["financials"]["future_receivable"],
                        "outstanding": report["financials"]["outstanding"],
                        "interaction_count": report["interactions"]["total_count"]
                    })
            except Exception:
                continue  # Skip customers with errors
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating customer list: {str(e)}")

@app.get("/api/reports/projects/{project_id}")
def get_project_report(project_id: str, db: Session = Depends(get_db)):
    """Get project financial report"""
    try:
        try:
            from app.reports import get_project_detailed_report as get_report
        except ImportError:
            from reports import get_project_detailed_report as get_report
        report = get_report(project_id, db)
        if not report:
            raise HTTPException(status_code=404, detail="Project not found")
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")

@app.get("/api/reports/brokers/{broker_id}")
def get_broker_report(broker_id: str, db: Session = Depends(get_db)):
    """Get detailed broker report"""
    try:
        try:
            from app.reports import get_broker_detailed_report as get_report
        except ImportError:
            from reports import get_broker_detailed_report as get_report
        report = get_report(broker_id, db)
        if not report:
            raise HTTPException(status_code=404, detail="Broker not found")
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")

@app.get("/api/reports/customers/pdf/{customer_id}")
def get_customer_pdf(customer_id: str, db: Session = Depends(get_db)):
    """Generate PDF report for customer"""
    try:
        try:
            from app.reports import get_customer_detailed_report as get_report
            from app.report_generator import generate_customer_pdf
        except ImportError:
            from reports import get_customer_detailed_report as get_report
            from report_generator import generate_customer_pdf
        report = get_report(customer_id, db)
        if not report:
            raise HTTPException(status_code=404, detail="Customer not found")
        pdf_buffer = generate_customer_pdf(report)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=customer_{report['customer']['customer_id']}_report.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

@app.get("/api/reports/customers/excel")
def get_customers_excel(db: Session = Depends(get_db)):
    """Generate Excel report for all customers"""
    try:
        try:
            from app.reports import get_customer_detailed_report as get_report
            from app.report_generator import generate_customer_excel
        except ImportError:
            from reports import get_customer_detailed_report as get_report
            from report_generator import generate_customer_excel
        from io import BytesIO
        import zipfile
        
        customers = db.query(Customer).all()
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for c in customers:
                try:
                    report = get_report(str(c.id), db)
                    if report:
                        excel_buffer = generate_customer_excel(report)
                        zip_file.writestr(f"customer_{report['customer']['customer_id']}.xlsx", excel_buffer.getvalue())
                except Exception:
                    continue  # Skip customers with errors
        
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=customers_report.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")

@app.get("/api/reports/projects/pdf/{project_id}")
def get_project_pdf(project_id: str, db: Session = Depends(get_db)):
    """Generate PDF report for project"""
    try:
        try:
            from app.reports import get_project_detailed_report as get_report
            from app.report_generator import generate_project_pdf
        except ImportError:
            from reports import get_project_detailed_report as get_report
            from report_generator import generate_project_pdf
        report = get_report(project_id, db)
        if not report:
            raise HTTPException(status_code=404, detail="Project not found")
        pdf_buffer = generate_project_pdf(report)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=project_{report['project']['project_id']}_report.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

@app.get("/api/reports/projects/excel")
def get_projects_excel(db: Session = Depends(get_db)):
    """Generate Excel report for all projects"""
    try:
        try:
            from app.reports import get_project_detailed_report as get_report
            from app.report_generator import generate_customer_excel  # Reuse customer format
        except ImportError:
            from reports import get_project_detailed_report as get_report
            from report_generator import generate_customer_excel  # Reuse customer format
        from io import BytesIO
        import zipfile
        
        projects = db.query(Project).all()
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for p in projects:
                try:
                    report = get_report(str(p.id), db)
                    if report:
                        # Convert project report to similar format
                        excel_buffer = generate_customer_excel({
                            "customer": {"customer_id": report["project"]["project_id"], "name": report["project"]["name"]},
                            "financials": report["financials"],
                            "transactions": report["transactions"],
                            "interactions": {"total_count": 0, "history": []}
                        })
                        zip_file.writestr(f"project_{report['project']['project_id']}.xlsx", excel_buffer.getvalue())
                except Exception:
                    continue  # Skip projects with errors
        
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=projects_report.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")

@app.get("/api/reports/brokers/pdf/{broker_id}")
def get_broker_pdf(broker_id: str, db: Session = Depends(get_db)):
    """Generate PDF report for broker"""
    try:
        try:
            from app.reports import get_broker_detailed_report as get_report
            from app.report_generator import generate_broker_pdf
        except ImportError:
            from reports import get_broker_detailed_report as get_report
            from report_generator import generate_broker_pdf
        report = get_report(broker_id, db)
        if not report:
            raise HTTPException(status_code=404, detail="Broker not found")
        pdf_buffer = generate_broker_pdf(report)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=broker_{report['broker']['broker_id']}_report.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

@app.get("/api/reports/brokers/excel")
def get_brokers_excel(db: Session = Depends(get_db)):
    """Generate Excel report for all brokers"""
    try:
        try:
            from app.reports import get_broker_detailed_report as get_report
            from app.report_generator import generate_customer_excel  # Reuse format
        except ImportError:
            from reports import get_broker_detailed_report as get_report
            from report_generator import generate_customer_excel  # Reuse format
        from io import BytesIO
        import zipfile
        
        brokers = db.query(Broker).all()
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for b in brokers:
                try:
                    report = get_report(str(b.id), db)
                    if report:
                        excel_buffer = generate_customer_excel({
                            "customer": {"customer_id": report["broker"]["broker_id"], "name": report["broker"]["name"]},
                            "financials": {
                                "total_sale": report["financials"]["total_sale_value"],
                                "total_received": report["financials"].get("total_received", 0),
                                "overdue": report["financials"].get("due", 0),
                                "future_receivable": report["financials"].get("future_receivable", 0),
                                "outstanding": report["financials"].get("outstanding", 0)
                            },
                            "transactions": report["transactions"],
                            "interactions": report["interactions"]
                        })
                        zip_file.writestr(f"broker_{report['broker']['broker_id']}.xlsx", excel_buffer.getvalue())
                except Exception:
                    continue  # Skip brokers with errors
        
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=brokers_report.zip"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")

# ============================================
# MEDIA API
# ============================================
import shutil
from pathlib import Path

MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", "media"))
MEDIA_ROOT.mkdir(exist_ok=True)
for entity_type in ["transactions", "interactions", "projects", "receipts", "payments"]:
    (MEDIA_ROOT / entity_type).mkdir(exist_ok=True)

def get_file_type(filename: str) -> str:
    """Determine file type from extension"""
    ext = filename.lower().split('.')[-1] if '.' in filename else ''
    if ext in ['pdf']: return 'pdf'
    elif ext in ['xlsx', 'xls']: return 'excel'
    elif ext in ['jpg', 'jpeg', 'png', 'gif', 'webp']: return 'image'
    elif ext in ['mp3', 'wav', 'm4a']: return 'audio'
    elif ext in ['mp4', 'avi', 'mov', 'mkv']: return 'video'
    else: return 'other'

@app.get("/api/media/library")
def get_media_library(
    entity_type: str = Query(None),
    file_type: str = Query(None),
    search: str = Query(None),
    limit: int = Query(100),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    """Get all media files with search and filters"""
    try:
        query = db.query(MediaFile)
        
        # Apply filters
        if entity_type:
            query = query.filter(MediaFile.entity_type == entity_type)
        if file_type:
            query = query.filter(MediaFile.file_type == file_type)
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                (func.lower(MediaFile.file_name).like(search_term)) |
                (func.lower(MediaFile.description).like(search_term))
            )
        
        # Get total count
        total = query.count()
        
        # Apply pagination and ordering
        files = query.order_by(MediaFile.created_at.desc()).offset(offset).limit(limit).all()
        
        # Build response with entity information
        result = []
        for f in files:
            # Get entity details
            entity_name = None
            entity_ref = None
            
            if f.entity_type == "transaction":
                entity = db.query(Transaction).filter(Transaction.id == f.entity_id).first()
                if entity:
                    customer = db.query(Customer).filter(Customer.id == entity.customer_id).first() if entity.customer_id else None
                    project = db.query(Project).filter(Project.id == entity.project_id).first() if entity.project_id else None
                    entity_name = f"{(customer.name if customer else 'N/A')} - {(project.name if project else 'N/A')}"
                    entity_ref = entity.transaction_id
            elif f.entity_type == "receipt":
                entity = db.query(Receipt).filter(Receipt.id == f.entity_id).first()
                if entity:
                    customer = db.query(Customer).filter(Customer.id == entity.customer_id).first() if entity.customer_id else None
                    entity_name = f"Receipt for {customer.name if customer else 'N/A'}"
                    entity_ref = entity.receipt_id
            elif f.entity_type == "payment":
                entity = db.query(Payment).filter(Payment.id == f.entity_id).first()
                if entity:
                    if entity.broker_id:
                        broker = db.query(Broker).filter(Broker.id == entity.broker_id).first()
                        entity_name = f"Payment to {broker.name if broker else 'N/A'}"
                    elif entity.company_rep_id:
                        rep = db.query(CompanyRep).filter(CompanyRep.id == entity.company_rep_id).first()
                        entity_name = f"Payment to {rep.name if rep else 'N/A'}"
                    elif entity.creditor_id:
                        creditor = db.query(Creditor).filter(Creditor.id == entity.creditor_id).first()
                        entity_name = f"Payment to {creditor.name if creditor else 'N/A'}"
                    else:
                        entity_name = "Payment"
                    entity_ref = entity.payment_id
            elif f.entity_type == "project":
                try:
                    entity = db.query(Project).filter(Project.id == f.entity_id).first()
                    if entity:
                        entity_name = entity.name
                        entity_ref = entity.project_id
                except Exception as e:
                    # If lookup fails, still return the file but without entity info
                    entity_name = None
                    entity_ref = None
            elif f.entity_type == "interaction":
                entity = db.query(Interaction).filter(Interaction.id == f.entity_id).first()
                if entity:
                    if entity.customer_id:
                        customer = db.query(Customer).filter(Customer.id == entity.customer_id).first()
                        entity_name = f"Interaction with {customer.name if customer else 'N/A'}"
                    elif entity.broker_id:
                        broker = db.query(Broker).filter(Broker.id == entity.broker_id).first()
                        entity_name = f"Interaction with {broker.name if broker else 'N/A'}"
                    else:
                        entity_name = "Interaction"
                    entity_ref = entity.interaction_id
            
            # Get uploader info
            rep = db.query(CompanyRep).filter(CompanyRep.id == f.uploaded_by_rep_id).first() if f.uploaded_by_rep_id else None
            
            result.append({
                "id": str(f.id),
                "file_id": f.file_id,
                "file_name": f.file_name,
                "file_type": f.file_type,
                "file_size": f.file_size,
                "description": f.description,
                "entity_type": f.entity_type,
                "entity_id": str(f.entity_id),
                "entity_name": entity_name,
                "entity_ref": entity_ref,
                "uploaded_by": rep.name if rep else None,
                "created_at": str(f.created_at)
            })
        
        return {
            "total": total,
            "files": result,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"Error in get_media_library: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Error loading media library: {str(e)}")

@app.post("/api/media/upload")
async def upload_media(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    file: UploadFile = File(...),
    description: str = Form(None),
    uploaded_by_rep_id: str = Form(None),
    db: Session = Depends(get_db)
):
    """Upload media file"""
    if entity_type not in ["transaction", "interaction", "project", "receipt", "payment"]:
        raise HTTPException(400, "Invalid entity_type")
    
    # Verify entity exists
    entity = None
    if entity_type == "transaction":
        entity = db.query(Transaction).filter((Transaction.id == entity_id) | (Transaction.transaction_id == entity_id)).first()
    elif entity_type == "interaction":
        entity = db.query(Interaction).filter((Interaction.id == entity_id) | (Interaction.interaction_id == entity_id)).first()
    elif entity_type == "project":
        entity = db.query(Project).filter((Project.id == entity_id) | (Project.project_id == entity_id)).first()
    elif entity_type == "receipt":
        entity = db.query(Receipt).filter((Receipt.id == entity_id) | (Receipt.receipt_id == entity_id)).first()
    elif entity_type == "payment":
        entity = db.query(Payment).filter((Payment.id == entity_id) | (Payment.payment_id == entity_id)).first()
    
    if not entity:
        raise HTTPException(404, f"{entity_type} not found")
    
    # Get rep if provided
    rep = None
    if uploaded_by_rep_id:
        rep = db.query(CompanyRep).filter((CompanyRep.id == uploaded_by_rep_id) | (CompanyRep.rep_id == uploaded_by_rep_id)).first()
    
    # Save file
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else ''
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = MEDIA_ROOT / f"{entity_type}s" / unique_filename
    
    # Ensure directory exists
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    file_size = file_path.stat().st_size
    file_type = get_file_type(file.filename)
    
    # Store absolute path to avoid resolution issues
    file_path_absolute = file_path.resolve()
    
    # Generate file_id from sequence
    try:
        file_id_result = db.execute(text("SELECT nextval('media_file_id_seq')")).scalar()
        file_id = f"MED-{str(file_id_result).zfill(5)}"
    except Exception:
        # Fallback if sequence doesn't exist yet
        file_id_result = db.execute(text("SELECT COUNT(*) + 1 FROM media_files")).scalar()
        file_id = f"MED-{str(file_id_result).zfill(5)}"
    
    # Create database record
    # Ensure entity_id is a UUID object
    if isinstance(entity.id, uuid.UUID):
        entity_uuid = entity.id
    elif isinstance(entity.id, str):
        entity_uuid = uuid.UUID(entity.id)
    else:
        entity_uuid = uuid.UUID(str(entity.id))
    
    media = MediaFile(
        file_id=file_id,
        entity_type=entity_type,
        entity_id=entity_uuid,
        file_name=file.filename,
        file_path=str(file_path_absolute),
        file_type=file_type,
        file_size=file_size,
        uploaded_by_rep_id=rep.id if rep else None,
        description=description
    )
    db.add(media); db.commit(); db.refresh(media)
    
    return {
        "message": "File uploaded",
        "id": str(media.id),
        "file_id": media.file_id,
        "file_name": media.file_name,
        "file_size": media.file_size
    }

@app.get("/api/media/{file_id}/download")
def download_media_file(file_id: str, db: Session = Depends(get_db)):
    """Download media file"""
    # Try to match by file_id (string) first, or by id (UUID) if file_id is a valid UUID
    try:
        # Check if file_id is a valid UUID
        file_id_uuid = uuid.UUID(file_id)
        # If it's a UUID, try matching both id and file_id
        media = db.query(MediaFile).filter(
            (MediaFile.id == file_id_uuid) | (MediaFile.file_id == file_id)
        ).first()
    except (ValueError, TypeError):
        # If not a valid UUID, only match by file_id (string)
        media = db.query(MediaFile).filter(MediaFile.file_id == file_id).first()
    
    if not media:
        raise HTTPException(404, "File not found")
    
    # Resolve file path - handle both absolute and relative paths
    file_path_str = media.file_path
    
    # Normalize path separators
    file_path_str = file_path_str.replace('\\', '/')
    
    # Try multiple resolution strategies
    file_path = None
    
    # Strategy 1: If it's already an absolute path and exists
    test_path = Path(file_path_str)
    if test_path.is_absolute() and test_path.exists():
        file_path = test_path
    
    # Strategy 2: Try relative to MEDIA_ROOT (most common for old files)
    if not file_path or not file_path.exists():
        # Remove 'media/' prefix if present
        if file_path_str.startswith('media/'):
            relative_part = file_path_str[6:]  # Remove 'media/' prefix
            file_path = MEDIA_ROOT / relative_part
        else:
            # Use as-is relative to MEDIA_ROOT
            file_path = MEDIA_ROOT / file_path_str
    
    # Strategy 3: Try relative to current working directory
    if not file_path.exists():
        file_path = Path.cwd() / file_path_str
    
    # Strategy 4: Try as absolute path from root
    if not file_path.exists() and not test_path.is_absolute():
        # Try making it absolute from MEDIA_ROOT
        if not file_path_str.startswith(str(MEDIA_ROOT)):
            file_path = MEDIA_ROOT / file_path_str.lstrip('/')
    
    if not file_path.exists():
        # Last attempt: try resolving MEDIA_ROOT and building path
        media_root_abs = MEDIA_ROOT.resolve()
        if file_path_str.startswith('media/'):
            relative_part = file_path_str[6:]
            file_path = media_root_abs / relative_part
        else:
            file_path = media_root_abs / file_path_str.lstrip('/')
    
    if not file_path.exists():
        raise HTTPException(404, f"File not found on disk. Tried: {file_path}. Stored path: {file_path_str}. MEDIA_ROOT: {MEDIA_ROOT}")
    
    return FileResponse(
        path=str(file_path),
        filename=media.file_name,
        media_type="application/octet-stream"
    )

@app.get("/api/media/{entity_type}/{entity_id}")
def list_media_files(entity_type: str, entity_id: str, db: Session = Depends(get_db)):
    """List media files for an entity"""
    if entity_type not in ["transaction", "interaction", "project", "receipt", "payment"]:
        raise HTTPException(400, "Invalid entity_type")
    
    # Get entity
    entity = None
    if entity_type == "transaction":
        entity = db.query(Transaction).filter((Transaction.id == entity_id) | (Transaction.transaction_id == entity_id)).first()
    elif entity_type == "interaction":
        entity = db.query(Interaction).filter((Interaction.id == entity_id) | (Interaction.interaction_id == entity_id)).first()
    elif entity_type == "project":
        entity = db.query(Project).filter((Project.id == entity_id) | (Project.project_id == entity_id)).first()
    elif entity_type == "receipt":
        entity = db.query(Receipt).filter((Receipt.id == entity_id) | (Receipt.receipt_id == entity_id)).first()
    elif entity_type == "payment":
        entity = db.query(Payment).filter((Payment.id == entity_id) | (Payment.payment_id == entity_id)).first()
    
    if not entity:
        raise HTTPException(404, f"{entity_type} not found")
    
    files = db.query(MediaFile).filter(
        MediaFile.entity_type == entity_type,
        MediaFile.entity_id == entity.id
    ).order_by(MediaFile.created_at.desc()).all()
    
    result = []
    for f in files:
        rep = db.query(CompanyRep).filter(CompanyRep.id == f.uploaded_by_rep_id).first() if f.uploaded_by_rep_id else None
        result.append({
            "id": str(f.id),
            "file_id": f.file_id,
            "file_name": f.file_name,
            "file_type": f.file_type,
            "file_size": f.file_size,
            "description": f.description,
            "uploaded_by": rep.name if rep else None,
            "created_at": str(f.created_at)
        })
    
    return result

@app.get("/api/media/{file_id}")
def get_media_file_info(file_id: str, db: Session = Depends(get_db)):
    """Get media file metadata"""
    # Try to match by file_id (string) first, or by id (UUID) if file_id is a valid UUID
    try:
        # Check if file_id is a valid UUID
        file_id_uuid = uuid.UUID(file_id)
        # If it's a UUID, try matching both id and file_id
        media = db.query(MediaFile).filter(
            (MediaFile.id == file_id_uuid) | (MediaFile.file_id == file_id)
        ).first()
    except (ValueError, TypeError):
        # If not a valid UUID, only match by file_id (string)
        media = db.query(MediaFile).filter(MediaFile.file_id == file_id).first()
    
    if not media:
        raise HTTPException(404, "File not found")
    
    rep = db.query(CompanyRep).filter(CompanyRep.id == media.uploaded_by_rep_id).first() if media.uploaded_by_rep_id else None
    
    return {
        "id": str(media.id),
        "file_id": media.file_id,
        "entity_type": media.entity_type,
        "entity_id": str(media.entity_id),
        "file_name": media.file_name,
        "file_type": media.file_type,
        "file_size": media.file_size,
        "description": media.description,
        "uploaded_by": rep.name if rep else None,
        "created_at": str(media.created_at)
    }

@app.delete("/api/media/{file_id}")
def delete_media_file(file_id: str, db: Session = Depends(get_db)):
    """Delete media file"""
    # Try to match by file_id (string) first, or by id (UUID) if file_id is a valid UUID
    try:
        # Check if file_id is a valid UUID
        file_id_uuid = uuid.UUID(file_id)
        # If it's a UUID, try matching both id and file_id
        media = db.query(MediaFile).filter(
            (MediaFile.id == file_id_uuid) | (MediaFile.file_id == file_id)
        ).first()
    except (ValueError, TypeError):
        # If not a valid UUID, only match by file_id (string)
        media = db.query(MediaFile).filter(MediaFile.file_id == file_id).first()
    
    if not media:
        raise HTTPException(404, "File not found")
    
    # Delete file from disk
    file_path = Path(media.file_path)
    if file_path.exists():
        file_path.unlink()
    
    db.delete(media); db.commit()
    return {"message": "File deleted"}

# ============================================
# VECTOR API ENDPOINTS
# ============================================

# Vector Projects Endpoints
@app.get("/api/vector/projects")
def get_vector_projects(
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """List all Vector projects (standalone + linked)"""
    projects = db.query(VectorProject).all()
    result = []
    for p in projects:
        linked_project = None
        if p.linked_project_id:
            linked_project = db.query(Project).filter(Project.id == p.linked_project_id).first()
        
        result.append({
            "id": str(p.id),
            "name": p.name,
            "map_name": p.map_name,
            "map_size": p.map_size,
            "linked_project_id": str(p.linked_project_id) if p.linked_project_id else None,
            "linked_project_name": linked_project.name if linked_project else None,
            "vector_metadata": p.vector_metadata,
            "system_branches": p.system_branches,
            "has_map": bool(p.map_pdf_base64),
            "created_at": str(p.created_at),
            "updated_at": str(p.updated_at)
        })
    return result

@app.get("/api/vector/projects/{project_id}")
def get_vector_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get Vector project details - returns full project data in JSON format for frontend"""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    # Get all related data
    annotations = db.query(VectorAnnotation).filter(VectorAnnotation.project_id == project_uuid).all()
    shapes = db.query(VectorShape).filter(VectorShape.project_id == project_uuid).all()
    labels = db.query(VectorLabel).filter(VectorLabel.project_id == project_uuid).all()
    branches = db.query(VectorBranch).filter(VectorBranch.project_id == project_uuid).all()
    creator_notes = db.query(VectorCreatorNote).filter(VectorCreatorNote.project_id == project_uuid).all()
    change_logs = db.query(VectorChangeLog).filter(VectorChangeLog.project_id == project_uuid).order_by(VectorChangeLog.timestamp.desc()).all()
    legend = db.query(VectorLegend).filter(VectorLegend.project_id == project_uuid).first()
    
    # Extract plots and metadata from vector_metadata
    plots = project.vector_metadata.get('plots', []) if project.vector_metadata else []
    plot_offsets = project.vector_metadata.get('plotOffsets', {}) if project.vector_metadata else {}
    plot_rotations = project.vector_metadata.get('plotRotations', {}) if project.vector_metadata else {}
    
    # Convert annotations to frontend format
    # PRIORITY: Use vector_metadata if it has annotations, otherwise use separate table
    annos = []
    
    # Check vector_metadata for annotations (this is where we save them)
    # FIXED: Check if 'annos' key exists, not just if it's truthy (empty list is falsy but valid)
    if project.vector_metadata and 'annos' in project.vector_metadata:
        metadata_annos = project.vector_metadata.get('annos')
        # Use annotations from vector_metadata if it's a list (even if empty, we'll use it)
        if isinstance(metadata_annos, list):
            annos = metadata_annos
            print(f"DEBUG: Using {len(annos)} annotations from vector_metadata")
        else:
            print(f"DEBUG: vector_metadata.annos exists but is not a list, type: {type(metadata_annos)}, value: {metadata_annos}")
    elif len(annotations) > 0:
        # Fallback to separate table if no annotations in vector_metadata
        print(f"DEBUG: No 'annos' in vector_metadata, using {len(annotations)} annotations from separate table")
        for a in annotations:
            annos.append({
                "id": a.annotation_id,  # Use annotation_id as id (timestamp-based)
                "note": a.note,
                "cat": a.category or "",
                "color": a.color or "#6366f1",
                "fontSize": a.font_size or 12,
                "rotation": a.rotation or 0,
                "plotIds": a.plot_ids or [],
                "plotNums": a.plot_nums or []
            })
    else:
        print(f"DEBUG: No annotations found - vector_metadata: {project.vector_metadata is not None}, has 'annos' key: {'annos' in project.vector_metadata if project.vector_metadata else False}, separate table: {len(annotations)}")
    
    print(f"DEBUG: Final annos count being returned: {len(annos)}")
    
    # Convert shapes to frontend format
    # PRIORITY: Use vector_metadata if it has shapes, otherwise use separate table
    shapes_list = []
    if project.vector_metadata and project.vector_metadata.get('shapes') and len(project.vector_metadata.get('shapes', [])) > 0:
        shapes_list = project.vector_metadata.get('shapes', [])
    elif len(shapes) > 0:
        for s in shapes:
            shape_data = s.data if isinstance(s.data, dict) else {}
            shape_obj = {
                "id": s.shape_id,
                "type": s.type or "rectangle",
                "x": s.x or 0,
                "y": s.y or 0,
                "width": s.width or 50,
                "height": s.height or 50,
                "color": s.color or "#6366f1"
            }
            # Merge additional shape data
            if shape_data:
                shape_obj.update(shape_data)
            shapes_list.append(shape_obj)
    
    # Convert labels to frontend format
    # PRIORITY: Use vector_metadata if it has labels, otherwise use separate table
    labels_list = []
    if project.vector_metadata and project.vector_metadata.get('labels') and len(project.vector_metadata.get('labels', [])) > 0:
        labels_list = project.vector_metadata.get('labels', [])
    elif len(labels) > 0:
        for l in labels:
            labels_list.append({
                "id": l.label_id,
                "text": l.text or "",
                "x": l.x or 0,
                "y": l.y or 0,
                "size": l.size or 12,
                "color": l.color or "#000000"
            })
    
    # Convert branches to frontend format
    # PRIORITY: Use vector_metadata if it has branches, otherwise use separate table
    branches_list = []
    if project.vector_metadata and project.vector_metadata.get('branches') and len(project.vector_metadata.get('branches', [])) > 0:
        branches_list = project.vector_metadata.get('branches', [])
    elif len(branches) > 0:
        for b in branches:
            branches_list.append({
                "id": str(b.id),
                "name": b.name,
                "timestamp": str(b.timestamp) if b.timestamp else None,
                "annoCount": b.anno_count or 0,
                "data": b.data or {}
            })
    
    # Convert creator notes
    # PRIORITY: Use vector_metadata if it has creator notes, otherwise use separate table
    creator_notes_list = []
    if project.vector_metadata and project.vector_metadata.get('creatorNotes') and len(project.vector_metadata.get('creatorNotes', [])) > 0:
        creator_notes_list = project.vector_metadata.get('creatorNotes', [])
    elif len(creator_notes) > 0:
        for n in creator_notes:
            creator_notes_list.append({
                "id": str(n.id),
                "text": n.text,
                "timestamp": str(n.timestamp) if n.timestamp else None
            })
    
    # Convert change log
    # PRIORITY: Use vector_metadata if it has change log, otherwise use separate table
    change_log_list = []
    if project.vector_metadata and project.vector_metadata.get('changeLog') and len(project.vector_metadata.get('changeLog', [])) > 0:
        change_log_list = project.vector_metadata.get('changeLog', [])
    elif len(change_logs) > 0:
        for log in change_logs:
            change_log_list.append({
                "timestamp": str(log.timestamp) if log.timestamp else None,
                "action": log.action or "",
                "details": log.details or ""
            })
    
    # Get legend
    # PRIORITY: Use vector_metadata if it has legend data, otherwise use separate table
    if project.vector_metadata and project.vector_metadata.get('legend'):
        legend_data = project.vector_metadata.get('legend', {})
        # Ensure it has all required fields
        if not isinstance(legend_data, dict):
            legend_data = {}
        legend_data = {
            "visible": legend_data.get("visible", True) if isinstance(legend_data.get("visible"), bool) else (legend_data.get("visible", "true") == "true" or legend_data.get("visible", True) == True),
            "minimized": legend_data.get("minimized", False) if isinstance(legend_data.get("minimized"), bool) else (legend_data.get("minimized", "false") == "true" or legend_data.get("minimized", False) == True),
            "position": legend_data.get("position", "bottom-right"),
            "manualEntries": legend_data.get("manualEntries", [])
        }
    elif legend:
        legend_data = {
            "visible": legend.visible if legend else True,
            "minimized": legend.minimized if legend else False,
            "position": legend.position or "bottom-right",
            "manualEntries": legend.manual_entries or [] if legend else []
        }
    else:
        legend_data = {
            "visible": True,
            "minimized": False,
            "position": "bottom-right",
            "manualEntries": []
        }
    
    # Get inventory if linked to Radius project, otherwise from vector_metadata
    inventory = {}
    if project.linked_project_id:
        inventory_items = db.query(Inventory).filter(Inventory.project_id == project.linked_project_id).all()
        for inv in inventory_items:
            inventory[inv.unit_number] = {
                "marla": inv.marla,
                "totalValue": inv.total_value,
                "ratePerMarla": inv.rate_per_marla,
                "dimensions": inv.dimensions,
                "owner": inv.owner,
                "status": inv.status,
                "notes": inv.notes
            }
    elif project.vector_metadata and project.vector_metadata.get('inventory'):
        inventory = project.vector_metadata.get('inventory', {})
    
    # Build project metadata
    project_metadata = project.vector_metadata.get('projectMetadata', {}) if project.vector_metadata else {
        "created": str(project.created_at),
        "lastModified": str(project.updated_at),
        "version": "8.2",
        "createdBy": "",
        "description": "",
        "notes": []
    }
    
    # Return full project data in frontend JSON format
    return {
        "projectName": project.name,
        "mapName": project.map_name or "Map",
        "pdfBase64": project.map_pdf_base64,
        "plots": plots,
        "annos": annos,  # Preserve order from database
        "inventory": inventory,
        "shapes": shapes_list,
        "labels": labels_list,
        "branches": branches_list,
        "plotOffsets": plot_offsets,
        "plotRotations": plot_rotations,
        "creatorNotes": creator_notes_list,
        "changeLog": change_log_list,
        "legend": legend_data,
        "projectMetadata": project_metadata
    }

@app.post("/api/vector/projects")
def create_vector_project(
    name: str = Form(...),
    map_name: str = Form(None),
    map_pdf_base64: str = Form(None),
    map_size: str = Form(None),
    vector_metadata: str = Form(None),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Create Vector project (standalone)"""
    import json
    
    parsed_metadata = json.loads(vector_metadata) if vector_metadata else None
    if parsed_metadata:
        # Debug: Log what's being saved
        annos_in_save = parsed_metadata.get('annos', [])
        print(f"DEBUG CREATE: Creating project with vector_metadata containing {len(annos_in_save) if isinstance(annos_in_save, list) else 'non-list'} annotations")
        if isinstance(annos_in_save, list) and len(annos_in_save) > 0:
            print(f"DEBUG CREATE: First annotation sample: id={annos_in_save[0].get('id') if annos_in_save[0] else 'none'}, note={annos_in_save[0].get('note') if annos_in_save[0] else 'none'}")
    
    project = VectorProject(
        name=name,
        map_name=map_name,
        map_pdf_base64=map_pdf_base64,
        map_size=json.loads(map_size) if map_size else None,
        vector_metadata=parsed_metadata,
        system_branches={"sales": {}, "inventory": {}}
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    
    return {
        "id": str(project.id),
        "name": project.name,
        "map_name": project.map_name,
        "map_size": project.map_size,
        "system_branches": project.system_branches,
        "created_at": str(project.created_at)
    }

@app.put("/api/vector/projects/{project_id}")
def update_vector_project(
    project_id: str,
    name: str = Form(None),
    map_name: str = Form(None),
    map_pdf_base64: str = Form(None),
    map_size: str = Form(None),
    vector_metadata: str = Form(None),
    system_branches: str = Form(None),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Update Vector project"""
    import json
    
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    if name is not None:
        project.name = name
    if map_name is not None:
        project.map_name = map_name
    if map_pdf_base64 is not None:
        project.map_pdf_base64 = map_pdf_base64
    if map_size is not None:
        project.map_size = json.loads(map_size) if map_size else None
    if vector_metadata is not None:
        parsed_metadata = json.loads(vector_metadata) if vector_metadata else None
        if parsed_metadata:
            # Debug: Log what's being saved
            annos_in_save = parsed_metadata.get('annos', [])
            print(f"DEBUG UPDATE: Updating project with vector_metadata containing {len(annos_in_save) if isinstance(annos_in_save, list) else 'non-list'} annotations")
            if isinstance(annos_in_save, list) and len(annos_in_save) > 0:
                print(f"DEBUG UPDATE: First annotation sample: id={annos_in_save[0].get('id') if annos_in_save[0] else 'none'}, note={annos_in_save[0].get('note') if annos_in_save[0] else 'none'}")
        project.vector_metadata = parsed_metadata
    if system_branches is not None:
        project.system_branches = json.loads(system_branches) if system_branches else None
    
    project.updated_at = func.now()
    db.commit()
    db.refresh(project)
    
    return {
        "id": str(project.id),
        "name": project.name,
        "map_name": project.map_name,
        "map_size": project.map_size,
        "system_branches": project.system_branches,
        "updated_at": str(project.updated_at)
    }

@app.delete("/api/vector/projects/{project_id}")
def delete_vector_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Delete Vector project"""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    db.delete(project)
    db.commit()
    return {"message": "Vector project deleted"}

@app.post("/api/vector/projects/{project_id}/link")
def link_vector_project(
    project_id: str,
    linked_project_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Link Vector project to Radius project"""
    import json
    
    try:
        vector_project_uuid = uuid.UUID(project_id)
        radius_project_uuid = uuid.UUID(linked_project_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    vector_project = db.query(VectorProject).filter(VectorProject.id == vector_project_uuid).first()
    if not vector_project:
        raise HTTPException(404, "Vector project not found")
    
    radius_project = db.query(Project).filter(Project.id == radius_project_uuid).first()
    if not radius_project:
        raise HTTPException(404, "Radius project not found")
    
    vector_project.linked_project_id = radius_project_uuid
    # Initialize system branches if not exists
    if not vector_project.system_branches:
        vector_project.system_branches = {"sales": {}, "inventory": {}}
    
    vector_project.updated_at = func.now()
    db.commit()
    
    # Create or update reconciliation record
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == vector_project_uuid).first()
    if not recon:
        recon = VectorReconciliation(
            project_id=vector_project_uuid,
            linked_project_id=radius_project_uuid,
            sync_status="linked"
        )
        db.add(recon)
    else:
        recon.linked_project_id = radius_project_uuid
        recon.sync_status = "linked"
    
    db.commit()
    
    return {
        "message": "Vector project linked to Radius project",
        "vector_project_id": str(vector_project.id),
        "linked_project_id": str(radius_project.id),
        "linked_project_name": radius_project.name
    }

@app.post("/api/vector/projects/{project_id}/unlink")
def unlink_vector_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Unlink Vector project from Radius project"""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    project.linked_project_id = None
    project.updated_at = func.now()
    db.commit()
    
    # Update reconciliation record
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == project_uuid).first()
    if recon:
        recon.linked_project_id = None
        recon.sync_status = "standalone"
        db.commit()
    
    return {"message": "Vector project unlinked"}

@app.get("/api/vector/projects/{project_id}/sync-status")
def get_sync_status(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get sync status for Vector project"""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == project_uuid).first()
    
    # Check if incomplete (no source map)
    is_incomplete = not bool(project.map_pdf_base64)
    
    status = "standalone"
    if project.linked_project_id:
        status = recon.sync_status if recon else "linked"
    
    return {
        "status": status,
        "is_incomplete": is_incomplete,
        "linked_project_id": str(project.linked_project_id) if project.linked_project_id else None,
        "last_sync_at": str(recon.last_sync_at) if recon and recon.last_sync_at else None,
        "has_map": bool(project.map_pdf_base64)
    }

# Vector Annotations Endpoints
@app.get("/api/vector/projects/{project_id}/annotations")
def get_vector_annotations(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get annotations for Vector project"""
    try:
        project_uuid = uuid.UUID(project_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    annotations = db.query(VectorAnnotation).filter(VectorAnnotation.project_id == project_uuid).all()
    return [{
        "id": str(a.id),
        "annotation_id": a.annotation_id,
        "note": a.note,
        "category": a.category,
        "color": a.color,
        "font_size": a.font_size,
        "rotation": a.rotation,
        "plot_ids": a.plot_ids,
        "plot_nums": a.plot_nums
    } for a in annotations]

@app.post("/api/vector/projects/{project_id}/annotations")
def create_vector_annotation(
    project_id: str,
    annotation_id: str = Form(...),
    note: str = Form(None),
    category: str = Form(None),
    color: str = Form(None),
    font_size: int = Form(None),
    rotation: int = Form(0),
    plot_ids: str = Form(None),
    plot_nums: str = Form(None),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Create annotation for Vector project"""
    import json
    
    try:
        project_uuid = uuid.UUID(project_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    annotation = VectorAnnotation(
        project_id=project_uuid,
        annotation_id=annotation_id,
        note=note,
        category=category,
        color=color,
        font_size=font_size,
        rotation=rotation,
        plot_ids=json.loads(plot_ids) if plot_ids else [],
        plot_nums=json.loads(plot_nums) if plot_nums else []
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    
    return {
        "id": str(annotation.id),
        "annotation_id": annotation.annotation_id,
        "note": annotation.note,
        "plot_ids": annotation.plot_ids,
        "plot_nums": annotation.plot_nums
    }

@app.put("/api/vector/projects/{project_id}/annotations/{anno_id}")
def update_vector_annotation(
    project_id: str,
    anno_id: str,
    note: str = Form(None),
    category: str = Form(None),
    color: str = Form(None),
    font_size: int = Form(None),
    rotation: int = Form(None),
    plot_ids: str = Form(None),
    plot_nums: str = Form(None),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Update annotation"""
    import json
    
    try:
        project_uuid = uuid.UUID(project_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    annotation = db.query(VectorAnnotation).filter(
        VectorAnnotation.project_id == project_uuid,
        VectorAnnotation.annotation_id == anno_id
    ).first()
    
    if not annotation:
        raise HTTPException(404, "Annotation not found")
    
    if note is not None:
        annotation.note = note
    if category is not None:
        annotation.category = category
    if color is not None:
        annotation.color = color
    if font_size is not None:
        annotation.font_size = font_size
    if rotation is not None:
        annotation.rotation = rotation
    if plot_ids is not None:
        annotation.plot_ids = json.loads(plot_ids) if plot_ids else []
    if plot_nums is not None:
        annotation.plot_nums = json.loads(plot_nums) if plot_nums else []
    
    annotation.updated_at = func.now()
    db.commit()
    db.refresh(annotation)
    
    return {
        "id": str(annotation.id),
        "annotation_id": annotation.annotation_id,
        "note": annotation.note,
        "plot_ids": annotation.plot_ids,
        "plot_nums": annotation.plot_nums
    }

@app.delete("/api/vector/projects/{project_id}/annotations/{anno_id}")
def delete_vector_annotation(
    project_id: str,
    anno_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Delete annotation"""
    try:
        project_uuid = uuid.UUID(project_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    annotation = db.query(VectorAnnotation).filter(
        VectorAnnotation.project_id == project_uuid,
        VectorAnnotation.annotation_id == anno_id
    ).first()
    
    if not annotation:
        raise HTTPException(404, "Annotation not found")
    
    db.delete(annotation)
    db.commit()
    return {"message": "Annotation deleted"}

# Vector Shapes, Labels, Legend, Branches endpoints (similar pattern)
@app.get("/api/vector/projects/{project_id}/shapes")
def get_vector_shapes(project_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        shapes = db.query(VectorShape).filter(VectorShape.project_id == project_uuid).all()
        return [{"id": str(s.id), "shape_id": s.shape_id, "type": s.type, "x": s.x, "y": s.y, "width": s.width, "height": s.height, "color": s.color, "data": s.data} for s in shapes]
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.post("/api/vector/projects/{project_id}/shapes")
def create_vector_shape(project_id: str, shape_id: str = Form(...), type: str = Form(None), x: int = Form(None), y: int = Form(None), width: int = Form(None), height: int = Form(None), color: str = Form(None), data: str = Form(None), db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    import json
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
        if not project:
            raise HTTPException(404, "Vector project not found")
        shape = VectorShape(project_id=project_uuid, shape_id=shape_id, type=type, x=x, y=y, width=width, height=height, color=color, data=json.loads(data) if data else None)
        db.add(shape)
        db.commit()
        db.refresh(shape)
        return {"id": str(shape.id), "shape_id": shape.shape_id}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.get("/api/vector/projects/{project_id}/labels")
def get_vector_labels(project_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        labels = db.query(VectorLabel).filter(VectorLabel.project_id == project_uuid).all()
        return [{"id": str(l.id), "label_id": l.label_id, "text": l.text, "x": l.x, "y": l.y, "size": l.size, "color": l.color} for l in labels]
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.post("/api/vector/projects/{project_id}/labels")
def create_vector_label(project_id: str, label_id: str = Form(...), text: str = Form(None), x: int = Form(None), y: int = Form(None), size: int = Form(None), color: str = Form(None), db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
        if not project:
            raise HTTPException(404, "Vector project not found")
        label = VectorLabel(project_id=project_uuid, label_id=label_id, text=text, x=x, y=y, size=size, color=color)
        db.add(label)
        db.commit()
        db.refresh(label)
        return {"id": str(label.id), "label_id": label.label_id}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.get("/api/vector/projects/{project_id}/legend")
def get_vector_legend(project_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        legend = db.query(VectorLegend).filter(VectorLegend.project_id == project_uuid).first()
        if not legend:
            return {"visible": True, "minimized": False, "position": None, "manual_entries": []}
        return {"id": str(legend.id), "visible": legend.visible == "true", "minimized": legend.minimized == "true", "position": legend.position, "manual_entries": legend.manual_entries}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.put("/api/vector/projects/{project_id}/legend")
def update_vector_legend(project_id: str, visible: str = Form(None), minimized: str = Form(None), position: str = Form(None), manual_entries: str = Form(None), db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    import json
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
        if not project:
            raise HTTPException(404, "Vector project not found")
        legend = db.query(VectorLegend).filter(VectorLegend.project_id == project_uuid).first()
        if not legend:
            legend = VectorLegend(project_id=project_uuid, visible="true", minimized="false")
            db.add(legend)
        if visible is not None:
            legend.visible = visible
        if minimized is not None:
            legend.minimized = minimized
        if position is not None:
            legend.position = position
        if manual_entries is not None:
            legend.manual_entries = json.loads(manual_entries) if manual_entries else None
        legend.updated_at = func.now()
        db.commit()
        db.refresh(legend)
        return {"id": str(legend.id), "visible": legend.visible == "true", "minimized": legend.minimized == "true", "position": legend.position, "manual_entries": legend.manual_entries}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.get("/api/vector/projects/{project_id}/branches")
def get_vector_branches(project_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        branches = db.query(VectorBranch).filter(VectorBranch.project_id == project_uuid).all()
        return [{"id": str(b.id), "name": b.name, "timestamp": str(b.timestamp) if b.timestamp else None, "anno_count": b.anno_count, "data": b.data} for b in branches]
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.post("/api/vector/projects/{project_id}/branches")
def create_vector_branch(project_id: str, name: str = Form(...), timestamp: str = Form(None), anno_count: int = Form(None), data: str = Form(None), db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    import json
    from dateutil.parser import parse as parse_date
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
        if not project:
            raise HTTPException(404, "Vector project not found")
        branch = VectorBranch(project_id=project_uuid, name=name, timestamp=parse_date(timestamp) if timestamp else datetime.utcnow(), anno_count=anno_count, data=json.loads(data) if data else None)
        db.add(branch)
        db.commit()
        db.refresh(branch)
        return {"id": str(branch.id), "name": branch.name}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.post("/api/vector/projects/{project_id}/backup")
def create_vector_backup(project_id: str, backup_data: str = Form(...), db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    import json
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
        if not project:
            raise HTTPException(404, "Vector project not found")
        backup = VectorProjectBackup(project_id=project_uuid, backup_data=json.loads(backup_data), created_by=current_user.id)
        db.add(backup)
        db.commit()
        db.refresh(backup)
        return {"id": str(backup.id), "created_at": str(backup.created_at)}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.get("/api/vector/projects/{project_id}/backups")
def get_vector_backups(project_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        backups = db.query(VectorProjectBackup).filter(VectorProjectBackup.project_id == project_uuid).order_by(VectorProjectBackup.created_at.desc()).all()
        return [{"id": str(b.id), "created_at": str(b.created_at), "created_by": str(b.created_by)} for b in backups]
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

@app.post("/api/vector/projects/{project_id}/backups/{backup_id}/restore")
def restore_vector_backup(project_id: str, backup_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    try:
        project_uuid = uuid.UUID(project_id)
        backup_uuid = uuid.UUID(backup_id)
        backup = db.query(VectorProjectBackup).filter(VectorProjectBackup.id == backup_uuid, VectorProjectBackup.project_id == project_uuid).first()
        if not backup:
            raise HTTPException(404, "Backup not found")
        return {"backup_data": backup.backup_data, "message": "Backup data retrieved"}
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid ID")

# Reconciliation Endpoints
@app.get("/api/vector/projects/{project_id}/reconcile")
def get_reconciliation_report(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get reconciliation report (discrepancies, missing data)"""
    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not vector_project:
        raise HTTPException(404, "Vector project not found")
    
    if not vector_project.linked_project_id:
        return {
            "status": "standalone",
            "message": "Vector project is not linked to a Radius project",
            "missing_inventory": [],
            "missing_plots": [],
            "smart_matches": []
        }
    
    # Get Vector annotations and extract plot numbers
    annotations = db.query(VectorAnnotation).filter(VectorAnnotation.project_id == project_uuid).all()
    vector_plot_nums = set()
    for anno in annotations:
        if anno.plot_nums:
            vector_plot_nums.update(anno.plot_nums)
    
    # Get Radius inventory for linked project
    inventory_items = db.query(Inventory).filter(Inventory.project_id == vector_project.linked_project_id).all()
    radius_unit_nums = [item.unit_number for item in inventory_items]
    
    # Find missing data
    missing_inventory = list(vector_plot_nums - set(radius_unit_nums))
    missing_plots = [unit for unit in radius_unit_nums if unit not in vector_plot_nums]
    
    # Smart matching
    smart_matches = smart_match_plot_numbers(list(vector_plot_nums), radius_unit_nums)
    
    # Update reconciliation record
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == project_uuid).first()
    if not recon:
        recon = VectorReconciliation(
            project_id=project_uuid,
            linked_project_id=vector_project.linked_project_id,
            sync_status="needs-reconciliation" if (missing_inventory or missing_plots) else "synced",
            discrepancies={"missing_inventory": missing_inventory, "missing_plots": missing_plots}
        )
        db.add(recon)
    else:
        recon.discrepancies = {"missing_inventory": missing_inventory, "missing_plots": missing_plots}
        recon.sync_status = "needs-reconciliation" if (missing_inventory or missing_plots) else "synced"
        recon.updated_at = func.now()
    
    db.commit()
    
    return {
        "status": recon.sync_status,
        "missing_inventory": missing_inventory,
        "missing_plots": missing_plots,
        "smart_matches": smart_matches,
        "total_vector_plots": len(vector_plot_nums),
        "total_radius_units": len(radius_unit_nums)
    }

@app.post("/api/vector/projects/{project_id}/reconcile/match")
def smart_match_plots(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Smart match plot/unit numbers (fuzzy matching)"""
    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not vector_project or not vector_project.linked_project_id:
        raise HTTPException(404, "Vector project not found or not linked")
    
    # Get Vector plot numbers
    annotations = db.query(VectorAnnotation).filter(VectorAnnotation.project_id == project_uuid).all()
    vector_plot_nums = set()
    for anno in annotations:
        if anno.plot_nums:
            vector_plot_nums.update(anno.plot_nums)
    
    # Get Radius unit numbers
    inventory_items = db.query(Inventory).filter(Inventory.project_id == vector_project.linked_project_id).all()
    radius_unit_nums = [item.unit_number for item in inventory_items]
    
    # Perform smart matching
    matches = smart_match_plot_numbers(list(vector_plot_nums), radius_unit_nums)
    
    return {
        "matches": matches,
        "total_matches": len([m for m in matches if m["radius_unit"] is not None]),
        "auto_matched": len([m for m in matches if m["auto_match"]])
    }

@app.post("/api/vector/projects/{project_id}/reconcile/sync-from-projects")
def sync_from_projects(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Sync data from Radius Projects → Vector (one-way)"""
    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not vector_project or not vector_project.linked_project_id:
        raise HTTPException(404, "Vector project not found or not linked")
    
    # Get Radius inventory
    inventory_items = db.query(Inventory).filter(Inventory.project_id == vector_project.linked_project_id).all()
    
    # Get Radius transactions
    transactions = db.query(Transaction).filter(Transaction.project_id == vector_project.linked_project_id).all()
    
    # Update system-generated branches
    inventory_branch = {}
    for item in inventory_items:
        inventory_branch[item.unit_number] = {
            "unit_number": item.unit_number,
            "area_marla": float(item.area_marla) if item.area_marla else 0,
            "rate_per_marla": float(item.rate_per_marla) if item.rate_per_marla else 0,
            "status": item.status,
            "plot_coordinates": item.plot_coordinates,
            "plot_offset": item.plot_offset
        }
    
    sales_branch = {}
    for txn in transactions:
        sales_branch[txn.transaction_id] = {
            "transaction_id": txn.transaction_id,
            "unit_number": txn.unit_number,
            "total_value": float(txn.total_value) if txn.total_value else 0,
            "status": txn.status,
            "booking_date": str(txn.booking_date) if txn.booking_date else None
        }
    
    # Update system branches
    if not vector_project.system_branches:
        vector_project.system_branches = {}
    vector_project.system_branches["inventory"] = inventory_branch
    vector_project.system_branches["sales"] = sales_branch
    vector_project.updated_at = func.now()
    
    # Update reconciliation record
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == project_uuid).first()
    if not recon:
        recon = VectorReconciliation(
            project_id=project_uuid,
            linked_project_id=vector_project.linked_project_id,
            sync_status="synced",
            last_sync_at=datetime.utcnow()
        )
        db.add(recon)
    else:
        recon.sync_status = "synced"
        recon.last_sync_at = datetime.utcnow()
        recon.updated_at = func.now()
    
    db.commit()
    
    return {
        "message": "Data synced from Radius Projects to Vector",
        "inventory_items_synced": len(inventory_items),
        "transactions_synced": len(transactions),
        "last_sync_at": str(recon.last_sync_at)
    }

@app.post("/api/vector/projects/{project_id}/reconcile/add-to-projects")
def add_to_projects(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Add Vector map data to Radius Projects"""
    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not vector_project:
        raise HTTPException(404, "Vector project not found")
    
    # Get Vector annotations to extract plot data
    annotations = db.query(VectorAnnotation).filter(VectorAnnotation.project_id == project_uuid).all()
    
    # This endpoint prepares data for adding to Radius Projects
    # Actual creation would be done via existing /api/projects and /api/inventory endpoints
    plot_data = []
    for anno in annotations:
        if anno.plot_nums:
            for plot_num in anno.plot_nums:
                plot_data.append({
                    "plot_number": plot_num,
                    "annotation": anno.note,
                    "category": anno.category,
                    "color": anno.color
                })
    
    return {
        "message": "Vector map data prepared for adding to Radius Projects",
        "plots_count": len(plot_data),
        "plots": plot_data,
        "note": "Use /api/projects and /api/inventory endpoints to create actual records"
    }

@app.get("/api/vector/projects/{project_id}/incomplete-check")
def check_incomplete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Check if Vector project is incomplete (no source map)"""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    is_incomplete = not bool(project.map_pdf_base64)
    
    return {
        "is_incomplete": is_incomplete,
        "has_map": bool(project.map_pdf_base64),
        "map_name": project.map_name,
        "message": "Vector project without source map needs attention" if is_incomplete else "Vector project has source map"
    }

@app.post("/api/vector/projects/import")
def import_vector_json(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Import Vector JSON file - 100% compatible with original Vector format"""
    import json
    
    try:
        # Read and parse JSON file
        content = file.file.read()
        if isinstance(content, bytes):
            content = content.decode('utf-8')
        
        vector_data = json.loads(content)
        
        # Extract project data
        project_name = vector_data.get('projectName', file.filename.replace('.json', ''))
        map_name = vector_data.get('mapName', '')
        pdf_base64 = vector_data.get('pdfBase64', '')
        map_size = vector_data.get('mapSize', {})
        project_metadata = vector_data.get('projectMetadata', {})
        
        # Create or update Vector project
        vector_project = VectorProject(
            name=project_name,
            map_name=map_name,
            map_pdf_base64=pdf_base64 if pdf_base64 else None,
            map_size=map_size if map_size else None,
            vector_metadata=project_metadata if project_metadata else None,
            system_branches=vector_data.get('branches', {})
        )
        db.add(vector_project)
        db.flush()  # Get the ID
        
        # Import plots (convert to annotations/shapes as needed)
        plots = vector_data.get('plots', [])
        plot_offsets = vector_data.get('plotOffsets', {})
        plot_rotations = vector_data.get('plotRotations', {})
        
        # Import annotations
        annos = vector_data.get('annos', [])
        for anno in annos:
            vector_anno = VectorAnnotation(
                project_id=vector_project.id,
                annotation_id=str(anno.get('id', uuid.uuid4())),
                note=anno.get('note', ''),
                category=anno.get('cat', ''),
                color=anno.get('color', '#000000'),
                font_size=anno.get('fontSize', 12),
                rotation=anno.get('rotation', 0),
                plot_ids=anno.get('plotIds', []),
                plot_nums=anno.get('plotNums', [])
            )
            db.add(vector_anno)
        
        # Import labels
        labels = vector_data.get('labels', [])
        for label in labels:
            vector_label = VectorLabel(
                project_id=vector_project.id,
                label_id=str(label.get('id', uuid.uuid4())),
                text=label.get('text', ''),
                x=label.get('x', 0),
                y=label.get('y', 0),
                size=label.get('size', 12),
                color=label.get('color', '#000000')
            )
            db.add(vector_label)
        
        # Import shapes
        shapes = vector_data.get('shapes', [])
        for shape in shapes:
            vector_shape = VectorShape(
                project_id=vector_project.id,
                shape_id=str(shape.get('id', uuid.uuid4())),
                type=shape.get('type', ''),
                x=shape.get('x', 0),
                y=shape.get('y', 0),
                width=shape.get('width', 0),
                height=shape.get('height', 0),
                color=shape.get('color', '#000000'),
                data=shape.get('data', {})
            )
            db.add(vector_shape)
        
        # Import legend
        legend = vector_data.get('legend', {})
        if legend:
            vector_legend = VectorLegend(
                project_id=vector_project.id,
                visible=str(legend.get('visible', 'true')).lower(),
                minimized=str(legend.get('minimized', 'false')).lower(),
                position=legend.get('position', ''),
                manual_entries=legend.get('manualEntries', {})
            )
            db.add(vector_legend)
        
        # Import creator notes
        creator_notes = vector_data.get('creatorNotes', [])
        if isinstance(creator_notes, list):
            for note in creator_notes:
                if isinstance(note, dict):
                    vector_note = VectorCreatorNote(
                        project_id=vector_project.id,
                        note=note.get('note', ''),
                        timestamp=datetime.fromisoformat(note.get('timestamp', datetime.now().isoformat())) if isinstance(note.get('timestamp'), str) else datetime.now()
                    )
                    db.add(vector_note)
        
        # Import change log
        change_log = vector_data.get('changeLog', [])
        if isinstance(change_log, list):
            for log_entry in change_log:
                if isinstance(log_entry, dict):
                    vector_log = VectorChangeLog(
                        project_id=vector_project.id,
                        action=log_entry.get('action', ''),
                        details=log_entry.get('details', {}),
                        timestamp=datetime.fromisoformat(log_entry.get('timestamp', datetime.now().isoformat())) if isinstance(log_entry.get('timestamp'), str) else datetime.now()
                    )
                    db.add(vector_log)
        
        # Store plots data in vector_metadata for reference
        if not vector_project.vector_metadata:
            vector_project.vector_metadata = {}
        vector_project.vector_metadata['plots'] = plots
        vector_project.vector_metadata['plotOffsets'] = plot_offsets
        vector_project.vector_metadata['plotRotations'] = plot_rotations
        vector_project.vector_metadata['imported_from'] = file.filename
        vector_project.vector_metadata['import_timestamp'] = datetime.now().isoformat()
        
        db.commit()
        db.refresh(vector_project)
        
        return {
            "message": "Vector project imported successfully",
            "project_id": str(vector_project.id),
            "name": vector_project.name,
            "plots_imported": len(plots),
            "annotations_imported": len(annos),
            "labels_imported": len(labels),
            "shapes_imported": len(shapes)
        }
        
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Invalid JSON file: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Error importing Vector project: {str(e)}")

@app.post("/api/vector/projects/{project_id}/unlink")
def unlink_vector_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Unlink Vector project from Radius project"""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    
    if not project:
        raise HTTPException(404, "Vector project not found")
    
    project.linked_project_id = None
    db.commit()
    
    return {"message": "Project unlinked successfully"}
