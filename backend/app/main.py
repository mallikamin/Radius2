"""
Radius CRM v3 - Complete Backend
Customers, Brokers, Projects, Inventory, Transactions
"""
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Query, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, String, Text, DateTime, Numeric, ForeignKey, Integer, Date, Boolean, text, or_, and_, case, literal
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
import time
import logging
import httpx
from collections import defaultdict

logger = logging.getLogger(__name__)

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

def find_entity(db, model, id_field_name, value):
    """Safely lookup by UUID id or string entity_id (handles non-UUID strings)"""
    try:
        uuid.UUID(str(value))
        return db.query(model).filter(
            (model.id == value) | (getattr(model, id_field_name) == value)
        ).first()
    except ValueError:
        return db.query(model).filter(getattr(model, id_field_name) == value).first()

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
    additional_mobiles = Column(JSONB, default=list)
    source = Column(String(100))
    source_other = Column(Text)
    occupation = Column(String(100))
    occupation_other = Column(Text)
    interested_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    interested_project_other = Column(Text)
    area = Column(Text)
    city = Column(Text)
    country_code = Column(String(5), default="+92")
    notes = Column(Text)
    assigned_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
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
    assigned_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
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
    role = Column(String(50), default="user")  # admin, manager, cco, user, viewer, creator
    rep_type = Column(String(20))  # direct, indirect, both, or NULL (no isolation)
    title = Column(String(100))  # CEO, CFO, COO, CCO, Director Land, etc.
    reports_to = Column(String(20))  # rep_id of manager (org hierarchy)
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
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"))
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
    pipeline_stage = Column(String(100), default="New")
    last_contacted_at = Column(DateTime)
    is_stale = Column(Boolean, default=False)
    additional_mobiles = Column(JSONB, default=list)
    source = Column(String(100))
    source_other = Column(Text)
    occupation = Column(String(100))
    occupation_other = Column(Text)
    interested_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    interested_project_other = Column(Text)
    area = Column(Text)
    city = Column(Text)
    country_code = Column(String(5), default="+92")
    lead_metadata = Column("metadata", JSONB, default=dict)
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
# DELETION REQUESTS (Soft-delete approval workflow)
# ============================================
class DeletionRequest(Base):
    __tablename__ = "deletion_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(String(20), unique=True, nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    entity_name = Column(String(255))
    requested_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    requested_at = Column(DateTime, server_default=func.now())
    reason = Column(Text)
    status = Column(String(20), default="pending")
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    reviewed_at = Column(DateTime)
    rejection_reason = Column(Text)

# ============================================
# NOTIFICATION & PIPELINE MODELS
# ============================================
class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    notification_id = Column(String(20), unique=True)
    user_rep_id = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    message = Column(Text)
    type = Column(String(50), default="info")
    category = Column(String(50))
    entity_type = Column(String(50))
    entity_id = Column(String(50))
    is_read = Column(Boolean, default=False)
    data = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())
    read_at = Column(DateTime)

class SearchLog(Base):
    __tablename__ = "search_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    searcher_rep_id = Column(String(20), nullable=False)
    search_query = Column(String(255), nullable=False)
    search_type = Column(String(50))
    matched_entity_type = Column(String(50))
    matched_entity_id = Column(String(50))
    matched_entity_name = Column(String(255))
    owner_rep_id = Column(String(20))
    created_at = Column(DateTime, server_default=func.now())

class LeadAssignmentRequest(Base):
    __tablename__ = "lead_assignment_requests"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(String(20), unique=True)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False)
    requested_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id", ondelete="SET NULL"))
    reason = Column(Text)
    status = Column(String(20), default="pending")
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    reviewed_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    display_order = Column(Integer, nullable=False)
    color = Column(String(20), default="#6B7280")
    is_terminal = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

class LookupValue(Base):
    __tablename__ = "lookup_values"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String(50), nullable=False)
    label = Column(String(255), nullable=False)
    sort_order = Column(Integer, nullable=False, default=99)
    is_active = Column(Boolean, default=True)
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
# TASK & VOICE MODELS
# ============================================
class Task(Base):
    __tablename__ = "tasks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(String(20), unique=True)
    title = Column(String(300), nullable=False)
    description = Column(Text)
    task_type = Column(String(30), default="GENERAL")
    department = Column(String(30))
    priority = Column(String(10), default="MEDIUM")
    status = Column(String(30), default="TODO")
    assignee_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"), nullable=False)
    delegated_by = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"))
    due_date = Column(Date)
    completed_at = Column(DateTime)
    completion_notes = Column(Text)
    pending_assignment = Column(Boolean, default=False)
    original_assignee_text = Column(String(200))
    linked_inventory_id = Column(UUID(as_uuid=True), ForeignKey("inventory.id"))
    linked_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    linked_customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))
    linked_project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class TaskComment(Base):
    __tablename__ = "task_comments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class TaskActivity(Base):
    __tablename__ = "task_activities"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"), nullable=False)
    action = Column(String(50), nullable=False)
    old_value = Column(String(200))
    new_value = Column(String(200))
    details = Column(JSONB, default=dict)
    created_at = Column(DateTime, server_default=func.now())

class QueryHistory(Base):
    __tablename__ = "query_history"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_text = Column(Text, nullable=False)
    intent = Column(String(30))
    domain = Column(String(30))
    confidence = Column(Numeric(3, 2), default=0.0)
    sql_query = Column(Text)
    response_text = Column(Text)
    success = Column(Boolean, default=False)
    usage_count = Column(Integer, default=1)
    is_learned = Column(Boolean, default=False)
    feedback_score = Column(Numeric(3, 2), default=0.0)
    error_message = Column(Text)
    processing_time_ms = Column(Numeric(10, 2))
    corrected_intent = Column(String(30))
    corrected_domain = Column(String(30))
    corrected_response = Column(Text)
    is_approved = Column(Boolean, default=False)
    user_rep_id = Column(String(20))
    created_at = Column(DateTime, server_default=func.now())
    last_used_at = Column(DateTime, server_default=func.now())

class QueryFeedback(Base):
    __tablename__ = "query_feedback"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_history_id = Column(UUID(as_uuid=True), ForeignKey("query_history.id"), nullable=False)
    feedback_type = Column(String(20), nullable=False)
    rating = Column(Integer)
    correct_intent = Column(String(30))
    correct_domain = Column(String(30))
    correct_response = Column(Text)
    user_comment = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

# ============================================
# HELPER FUNCTIONS
# ============================================
def normalize_mobile(mobile):
    """Normalize Pakistan mobile number for duplicate detection"""
    if not mobile:
        return None
    m = mobile.strip().replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    if m.startswith("+92"):
        m = "0" + m[3:]
    elif m.startswith("92") and len(m) > 10:
        m = "0" + m[2:]
    return m if m else None

def create_notification(db, user_rep_id, notif_type, title, message, category=None, entity_type=None, entity_id=None, data=None):
    """Helper to create a notification record"""
    n = Notification(
        user_rep_id=user_rep_id,
        type=notif_type,
        title=title,
        message=message,
        category=category or notif_type,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        data=data or {}
    )
    db.add(n)
    return n

def notify_duplicate_attempt(db, duplicates, attempted_by_user, action_type, campaign_name=None):
    """Send notifications when duplicate lead addition is attempted.
    action_type: 'single' = notify original rep + admin/CCO, 'bulk' = admin/CCO only.
    """
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    campaign_info = f" to campaign '{campaign_name}'" if campaign_name else ""

    # For single add: notify original lead owner
    if action_type == "single":
        notified_reps = set()
        for dup in duplicates:
            if dup["type"] == "lead" and dup.get("assigned_rep_id"):
                rep_id = dup["assigned_rep_id"]
                if rep_id not in notified_reps and rep_id != attempted_by_user.rep_id:
                    notified_reps.add(rep_id)
                    create_notification(
                        db, rep_id, "duplicate_attempt",
                        "Duplicate Lead Attempt",
                        f"{attempted_by_user.name} tried adding your lead {dup['name']} ({dup['entity_id']}){campaign_info} on {timestamp}",
                        category="lead", entity_type="lead", entity_id=dup["entity_id"],
                        data={"attempted_by": attempted_by_user.rep_id, "attempted_by_name": attempted_by_user.name,
                              "mobile": dup["mobile"], "campaign": campaign_name}
                    )

    # Notify all admin/CCO users
    admins = db.query(CompanyRep).filter(
        CompanyRep.role.in_(["admin", "cco"]), CompanyRep.status == "active"
    ).all()
    for admin in admins:
        if admin.rep_id == attempted_by_user.rep_id:
            continue
        if action_type == "single":
            dup = duplicates[0]
            create_notification(
                db, admin.rep_id, "duplicate_attempt",
                "Duplicate Lead Blocked",
                f"{attempted_by_user.name} tried adding duplicate lead (matches {dup['type']} {dup['entity_id']} — {dup['name']}){campaign_info} on {timestamp}",
                category="admin", entity_type=dup["type"], entity_id=dup["entity_id"],
                data={"attempted_by": attempted_by_user.rep_id, "attempted_by_name": attempted_by_user.name,
                      "mobile": dup["mobile"], "campaign": campaign_name}
            )
        else:  # bulk
            create_notification(
                db, admin.rep_id, "duplicate_attempt",
                "Bulk Import — Duplicates Found",
                f"{attempted_by_user.name} bulk imported leads with {len(duplicates)} duplicate(s) detected{campaign_info} on {timestamp}",
                category="admin", entity_type="lead", entity_id=None,
                data={"attempted_by": attempted_by_user.rep_id, "attempted_by_name": attempted_by_user.name,
                      "duplicate_count": len(duplicates), "campaign": campaign_name}
            )

def check_duplicate_mobile(db, mobile, exclude_lead_id=None, exclude_customer_id=None, exclude_broker_id=None):
    """Check if mobile exists in customers, leads, or brokers tables. Returns list of matches."""
    if not mobile:
        return []
    normalized = normalize_mobile(mobile)
    if not normalized:
        return []
    # Use last 7 digits for fuzzy SQL match (avoids dash/format mismatch in stored values)
    suffix = normalized[-7:]
    # Strip non-digits in SQL for reliable matching: regexp_replace(mobile, '[^0-9]', '', 'g')
    stripped_cust = func.regexp_replace(Customer.mobile, '[^0-9]', '', 'g')
    stripped_lead = func.regexp_replace(Lead.mobile, '[^0-9]', '', 'g')
    stripped_broker = func.regexp_replace(Broker.mobile, '[^0-9]', '', 'g')
    matches = []
    # Check customers via SQL
    cust_q = db.query(Customer).filter(Customer.mobile.isnot(None), stripped_cust.like(f"%{suffix}%"))
    if exclude_customer_id:
        cust_q = cust_q.filter(Customer.id != exclude_customer_id)
    for c in cust_q.all():
        if normalize_mobile(c.mobile) == normalized:
            matches.append({
                "type": "customer", "id": str(c.id), "entity_id": c.customer_id,
                "name": c.name, "mobile": c.mobile
            })
    # Check leads via SQL
    lead_q = db.query(Lead, CompanyRep).outerjoin(
        CompanyRep, Lead.assigned_rep_id == CompanyRep.id
    ).filter(Lead.status != "converted", Lead.mobile.isnot(None), stripped_lead.like(f"%{suffix}%"))
    if exclude_lead_id:
        lead_q = lead_q.filter(Lead.id != exclude_lead_id)
    for l, rep in lead_q.all():
        if normalize_mobile(l.mobile) == normalized:
            matches.append({
                "type": "lead", "id": str(l.id), "entity_id": l.lead_id,
                "name": l.name, "mobile": l.mobile,
                "assigned_rep": rep.name if rep else None,
                "assigned_rep_id": rep.rep_id if rep else None
            })
    # Check customer additional_mobiles via SQL JSONB
    try:
        add_mob_cust = db.execute(text("""
            SELECT c.id, c.customer_id, c.name, c.mobile, am.elem
            FROM customers c, jsonb_array_elements_text(c.additional_mobiles) AS am(elem)
            WHERE c.additional_mobiles IS NOT NULL AND c.additional_mobiles != '[]'::jsonb
              AND regexp_replace(am.elem, '[^0-9]', '', 'g') LIKE :suffix_pattern
        """), {"suffix_pattern": f"%{suffix}%"})
        for row in add_mob_cust:
            if exclude_customer_id and str(row.id) == str(exclude_customer_id):
                continue
            if normalize_mobile(row.elem) == normalized:
                already = any(m["id"] == str(row.id) and m["type"] == "customer" for m in matches)
                if not already:
                    matches.append({
                        "type": "customer", "id": str(row.id), "entity_id": row.customer_id,
                        "name": row.name, "mobile": row.elem, "primary_mobile": row.mobile
                    })
    except Exception:
        pass  # additional_mobiles column may not exist yet on older DBs

    # Check lead additional_mobiles via SQL JSONB
    try:
        add_mob_lead = db.execute(text("""
            SELECT l.id, l.lead_id, l.name, l.mobile, am.elem, r.name as rep_name, r.rep_id as rep_rep_id
            FROM leads l
            LEFT JOIN company_reps r ON l.assigned_rep_id = r.id
            CROSS JOIN jsonb_array_elements_text(l.additional_mobiles) AS am(elem)
            WHERE l.status != 'converted'
              AND l.additional_mobiles IS NOT NULL AND l.additional_mobiles != '[]'::jsonb
              AND regexp_replace(am.elem, '[^0-9]', '', 'g') LIKE :suffix_pattern
        """), {"suffix_pattern": f"%{suffix}%"})
        for row in add_mob_lead:
            if exclude_lead_id and str(row.id) == str(exclude_lead_id):
                continue
            if normalize_mobile(row.elem) == normalized:
                already = any(m["id"] == str(row.id) and m["type"] == "lead" for m in matches)
                if not already:
                    matches.append({
                        "type": "lead", "id": str(row.id), "entity_id": row.lead_id,
                        "name": row.name, "mobile": row.elem, "primary_mobile": row.mobile,
                        "assigned_rep": row.rep_name, "assigned_rep_id": row.rep_rep_id
                    })
    except Exception:
        pass

    # Check brokers via SQL
    broker_q = db.query(Broker).filter(Broker.mobile.isnot(None), stripped_broker.like(f"%{suffix}%"))
    if exclude_broker_id:
        broker_q = broker_q.filter(Broker.id != exclude_broker_id)
    for b in broker_q.all():
        if normalize_mobile(b.mobile) == normalized:
            matches.append({
                "type": "broker", "id": str(b.id), "entity_id": b.broker_id,
                "name": b.name, "mobile": b.mobile
            })
    return matches

def get_rep_isolation_filter(current_user, db):
    """Returns isolation context for the current user. Used by GET list endpoints
    to filter data by rep ownership based on rep_type.

    Returns dict with:
        isolated: bool - True if filtering should apply
        rep_type: str - 'direct', 'indirect', 'both'
        rep_uuid: UUID - current user's UUID
        team_rep_uuids: list[UUID] - UUIDs of user + their direct reports (for managers)
    """
    role = current_user.role
    rep_type = getattr(current_user, 'rep_type', None)

    # Admin, CCO: no isolation
    if role in ("admin", "cco"):
        return {"isolated": False}

    # rep_type NULL = legacy user, no isolation (backward compat)
    if not rep_type:
        return {"isolated": False}

    # Build team: self + direct reports for managers
    team = [current_user.id]
    if role == "manager":
        direct_reports = db.query(CompanyRep).filter(
            CompanyRep.reports_to == current_user.rep_id,
            CompanyRep.status == "active"
        ).all()
        team.extend([r.id for r in direct_reports])

    return {
        "isolated": True,
        "rep_type": rep_type,
        "rep_uuid": current_user.id,
        "team_rep_uuids": team,
    }

# ============================================
# AUTHENTICATION SETUP
# ============================================
# SECRET_KEY for JWT tokens - MUST be set via SECRET_KEY env var in production
# Generate: python -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY = os.getenv("SECRET_KEY", "orbit-local-dev-key")
if SECRET_KEY in ("your-secret-key-change-in-production-min-32-chars", "changeme", ""):
    logger.critical("INSECURE SECRET_KEY detected! Set SECRET_KEY env var to a strong random value.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours default

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

def sync_vector_branches_from_orbit(project_id, db: Session):
    """Helper function to sync Vector branches when ORBIT data changes"""
    import time as time_module

    # Find Vector project linked to this ORBIT project
    vector_project = db.query(VectorProject).filter(
        VectorProject.linked_project_id == project_id
    ).first()

    if not vector_project:
        return  # No linked Vector project

    # Get Vector plots for matching
    plots = vector_project.vector_metadata.get('plots', []) if vector_project.vector_metadata else []

    # Build plot map
    plot_map = {}
    for p in plots:
        plot_num = p.get('n', '')
        if plot_num:
            plot_map[plot_num] = p.get('id')
            plot_map[plot_num.upper()] = p.get('id')
            plot_map[plot_num.strip().upper()] = p.get('id')

    # Get current inventory and transactions
    inventory_items = db.query(Inventory).filter(Inventory.project_id == project_id).all()
    transactions = db.query(Transaction).filter(Transaction.project_id == project_id).all()

    # Build sold units set
    sold_units = set()
    for txn in transactions:
        if txn.unit_number:
            sold_units.add(txn.unit_number.upper())
    for item in inventory_items:
        if item.status and item.status.lower() == 'sold' and item.unit_number:
            sold_units.add(item.unit_number.upper())

    # Build annotation arrays
    sold_plot_ids = []
    sold_plot_nums = []
    available_plot_ids = []
    available_plot_nums = []

    for item in inventory_items:
        unit_num = item.unit_number
        if not unit_num:
            continue
        plot_id = plot_map.get(unit_num) or plot_map.get(unit_num.upper())
        if plot_id:
            if unit_num.upper() in sold_units:
                sold_plot_ids.append(plot_id)
                sold_plot_nums.append(unit_num)
            else:
                available_plot_ids.append(plot_id)
                available_plot_nums.append(unit_num)

    # Generate annotations
    current_time = int(time_module.time() * 1000)

    sales_annotation = None
    if sold_plot_ids:
        sales_annotation = {
            "id": f"auto_sold_{current_time}",
            "note": "SOLD",
            "cat": "SOLD",
            "color": "#ef4444",
            "plotIds": sold_plot_ids,
            "plotNums": sold_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    inventory_annotation = None
    if available_plot_ids:
        inventory_annotation = {
            "id": f"auto_inventory_{current_time}",
            "note": "INVENTORY",
            "cat": "INVENTORY",
            "color": "#22c55e",
            "plotIds": available_plot_ids,
            "plotNums": available_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    # Update system_branches
    vector_project.system_branches = {
        "sales": {
            "annotations": [sales_annotation] if sales_annotation else [],
            "lastSyncAt": datetime.utcnow().isoformat(),
            "transactionCount": len(transactions),
            "plotCount": len(sold_plot_ids)
        },
        "inventory": {
            "annotations": [inventory_annotation] if inventory_annotation else [],
            "lastSyncAt": datetime.utcnow().isoformat(),
            "unitCount": len(inventory_items),
            "plotCount": len(available_plot_ids)
        }
    }
    vector_project.updated_at = func.now()

    # Update reconciliation
    recon = db.query(VectorReconciliation).filter(
        VectorReconciliation.project_id == vector_project.id
    ).first()
    if recon:
        recon.last_sync_at = datetime.utcnow()
        recon.sync_status = "synced"

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

# ============================================
# RATE LIMITER & API USAGE TRACKING
# ============================================
class RateLimiter:
    """In-memory sliding window rate limiter per user."""
    def __init__(self):
        self._requests = defaultdict(list)  # user_key -> [timestamps]

    def check(self, user_key: str, max_requests: int, window_seconds: int) -> bool:
        """Returns True if request is allowed, False if rate-limited."""
        now = time.time()
        cutoff = now - window_seconds
        # Prune old entries
        self._requests[user_key] = [t for t in self._requests[user_key] if t > cutoff]
        if len(self._requests[user_key]) >= max_requests:
            return False
        self._requests[user_key].append(now)
        return True

    def get_usage(self, user_key: str, window_seconds: int) -> int:
        """Get number of requests in current window."""
        now = time.time()
        cutoff = now - window_seconds
        self._requests[user_key] = [t for t in self._requests[user_key] if t > cutoff]
        return len(self._requests[user_key])

    def cleanup(self, max_age_seconds: int = 86400):
        """Remove entries older than max_age_seconds to prevent memory leak."""
        now = time.time()
        cutoff = now - max_age_seconds
        empty_keys = []
        for key in self._requests:
            self._requests[key] = [t for t in self._requests[key] if t > cutoff]
            if not self._requests[key]:
                empty_keys.append(key)
        for key in empty_keys:
            del self._requests[key]

# Rate limiters for different endpoint categories
voice_limiter = RateLimiter()   # Voice/AI queries
task_limiter = RateLimiter()    # Task CRUD operations
api_limiter = RateLimiter()     # General API catch-all

# Usage limits (configurable via env vars)
VOICE_RATE_LIMIT = int(os.getenv("VOICE_RATE_LIMIT", "30"))         # queries per window
VOICE_RATE_WINDOW = int(os.getenv("VOICE_RATE_WINDOW", "60"))       # window in seconds
VOICE_DAILY_LIMIT = int(os.getenv("VOICE_DAILY_LIMIT", "500"))      # per user per day
TASK_RATE_LIMIT = int(os.getenv("TASK_RATE_LIMIT", "60"))           # task ops per window
TASK_RATE_WINDOW = int(os.getenv("TASK_RATE_WINDOW", "60"))         # window in seconds

# API usage counters (daily, in-memory — resets on restart, persisted via query_history)
_daily_usage = defaultdict(lambda: {"voice_queries": 0, "task_ops": 0, "date": None})

def _track_daily_usage(user_key: str, category: str):
    """Track daily API usage per user."""
    today = date.today().isoformat()
    if _daily_usage[user_key]["date"] != today:
        _daily_usage[user_key] = {"voice_queries": 0, "task_ops": 0, "date": today}
    _daily_usage[user_key][category] = _daily_usage[user_key].get(category, 0) + 1

def _check_daily_limit(user_key: str, category: str, limit: int) -> bool:
    """Returns True if within daily limit."""
    today = date.today().isoformat()
    if _daily_usage[user_key]["date"] != today:
        return True
    return _daily_usage[user_key].get(category, 0) < limit

def require_rate_limit(limiter: RateLimiter, max_req: int, window: int, category: str = "api"):
    """Dependency that enforces rate limiting."""
    def _check(current_user=Depends(get_current_user)):
        user_key = current_user.rep_id or str(current_user.id)
        if not limiter.check(user_key, max_req, window):
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Max {max_req} requests per {window}s. Please wait."
            )
        _track_daily_usage(user_key, category)
        return current_user
    return _check

@app.get("/")
def root():
    return {"status": "running", "app": "Radius CRM v3"}

login_limiter = RateLimiter()
LOGIN_RATE_LIMIT = int(os.getenv("LOGIN_RATE_LIMIT", "5"))       # attempts per window
LOGIN_RATE_WINDOW = int(os.getenv("LOGIN_RATE_WINDOW", "60"))    # window in seconds

@app.post("/api/auth/login")
def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    """Login endpoint - returns JWT token"""
    # Rate limit login attempts per username
    if not login_limiter.check(username.lower(), LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW):
        raise HTTPException(status_code=429, detail=f"Too many login attempts. Try again in {LOGIN_RATE_WINDOW} seconds.")
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
                    "role": user.role if hasattr(user, 'role') else 'user',
                    "rep_type": user.rep_type if hasattr(user, 'rep_type') else None
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
            "rep_type": current_user.rep_type if hasattr(current_user, 'rep_type') else None,
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
def list_customers(db: Session = Depends(get_db),
                   current_user: CompanyRep = Depends(get_current_user)):
    iso = get_rep_isolation_filter(current_user, db)
    q = db.query(Customer).order_by(Customer.created_at.desc())
    if iso["isolated"]:
        rt = iso["rep_type"]
        if rt == "indirect":
            return []  # indirect reps don't see customers
        q = q.filter(Customer.assigned_rep_id.in_(iso["team_rep_uuids"]))
    customers = q.all()
    return [{
        "id": str(c.id), "customer_id": c.customer_id, "name": c.name,
        "mobile": c.mobile, "address": c.address, "cnic": c.cnic,
        "email": c.email,
        "additional_mobiles": c.additional_mobiles or [],
        "source": c.source, "source_other": c.source_other,
        "occupation": c.occupation, "occupation_other": c.occupation_other,
        "interested_project_id": str(c.interested_project_id) if c.interested_project_id else None,
        "interested_project_other": c.interested_project_other,
        "area": c.area, "city": c.city,
        "country_code": c.country_code or "+92",
        "notes": c.notes,
        "assigned_rep_id": str(c.assigned_rep_id) if c.assigned_rep_id else None,
        "created_at": str(c.created_at)
    } for c in customers]

@app.get("/api/customers/{cid}")
def get_customer(cid: str, db: Session = Depends(get_db),
                 current_user: CompanyRep = Depends(get_current_user)):
    c = db.query(Customer).filter(
        (Customer.id == cid) | (Customer.customer_id == cid) | (Customer.mobile == cid)
    ).first()
    if not c:
        raise HTTPException(404, "Customer not found")
    broker = db.query(Broker).filter(Broker.mobile == c.mobile).first()
    return {
        "id": str(c.id), "customer_id": c.customer_id, "name": c.name,
        "mobile": c.mobile, "address": c.address, "cnic": c.cnic,
        "email": c.email,
        "additional_mobiles": c.additional_mobiles or [],
        "source": c.source, "source_other": c.source_other,
        "occupation": c.occupation, "occupation_other": c.occupation_other,
        "interested_project_id": str(c.interested_project_id) if c.interested_project_id else None,
        "interested_project_other": c.interested_project_other,
        "area": c.area, "city": c.city,
        "country_code": c.country_code or "+92",
        "notes": c.notes,
        "assigned_rep_id": str(c.assigned_rep_id) if c.assigned_rep_id else None,
        "created_at": str(c.created_at),
        "is_also_broker": broker is not None,
        "broker_id": broker.broker_id if broker else None
    }

@app.post("/api/customers")
def create_customer(data: dict, db: Session = Depends(get_db),
                    current_user: CompanyRep = Depends(get_current_user)):
    if db.query(Customer).filter(Customer.mobile == data["mobile"]).first():
        raise HTTPException(400, f"Customer with mobile {data['mobile']} already exists")
    # Check for duplicate mobile in leads + additional mobiles
    warnings = []
    dupes = check_duplicate_mobile(db, data.get("mobile"))
    for d in dupes:
        if d["type"] == "lead":
            warnings.append(f"Lead {d['entity_id']} ({d['name']}) has same mobile — assigned to {d.get('assigned_rep', 'unassigned')}")
    # Check additional mobiles for duplicates
    additional = [m for m in (data.get("additional_mobiles") or []) if m and m.strip()]
    for am in additional:
        am_dupes = check_duplicate_mobile(db, am)
        for d in am_dupes:
            warnings.append(f"Additional mobile {am} matches {d['type']} {d['entity_id']} ({d['name']})")
    # Resolve interested_project_id
    interested_project_id = None
    if data.get("interested_project_id") and data["interested_project_id"] != "other":
        p = db.query(Project).filter(
            (Project.id == data["interested_project_id"]) | (Project.project_id == data["interested_project_id"])
        ).first()
        interested_project_id = p.id if p else None
    c = Customer(
        name=data["name"], mobile=data["mobile"], address=data.get("address"),
        cnic=data.get("cnic"), email=data.get("email"),
        additional_mobiles=additional if additional else [],
        source=data.get("source"), source_other=data.get("source_other"),
        occupation=data.get("occupation"), occupation_other=data.get("occupation_other"),
        interested_project_id=interested_project_id,
        interested_project_other=data.get("interested_project_other"),
        area=data.get("area"), city=data.get("city"),
        country_code=data.get("country_code", "+92"),
        notes=data.get("notes"),
        assigned_rep_id=current_user.id
    )
    db.add(c); db.commit(); db.refresh(c)
    result = {"message": "Customer created", "id": str(c.id), "customer_id": c.customer_id}
    if warnings:
        result["warnings"] = warnings
    return result

@app.put("/api/customers/{cid}")
def update_customer(cid: str, data: dict, db: Session = Depends(get_db),
                    current_user: CompanyRep = Depends(get_current_user)):
    c = db.query(Customer).filter((Customer.id == cid) | (Customer.customer_id == cid)).first()
    if not c: raise HTTPException(404, "Customer not found")
    for k in ["name", "mobile", "address", "cnic", "email",
              "additional_mobiles", "source", "source_other", "occupation", "occupation_other",
              "interested_project_other", "area", "city", "country_code", "notes"]:
        if k in data: setattr(c, k, data[k])
    # Handle interested_project_id separately (FK resolution)
    if "interested_project_id" in data:
        if data["interested_project_id"] and data["interested_project_id"] != "other":
            p = db.query(Project).filter(
                (Project.id == data["interested_project_id"]) | (Project.project_id == data["interested_project_id"])
            ).first()
            c.interested_project_id = p.id if p else None
        else:
            c.interested_project_id = None
    # Filter empty strings from additional_mobiles
    if c.additional_mobiles:
        c.additional_mobiles = [m for m in c.additional_mobiles if m and m.strip()]
    db.commit()
    return {"message": "Customer updated"}

@app.delete("/api/customers/{cid}")
def delete_customer(cid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    c = find_entity(db, Customer, "customer_id", cid)
    if not c: raise HTTPException(404, "Customer not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(c); db.commit()
        return {"message": "Customer deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="customer", entity_id=c.id, entity_name=c.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

@app.get("/api/customers/template/download")
def download_customer_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['name*', 'mobile*', 'address', 'cnic', 'email', 'source', 'occupation', 'area', 'city', 'notes'])
    writer.writerow(['Ahmed Khan', '0300-1234567', 'DHA Phase 5', '35201-1234567-1', 'ahmed@email.com', 'Walk-in', 'Businessman', 'DHA Phase 5', 'Karachi', 'Interested in plots'])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=customers_template.csv"})

@app.post("/api/customers/bulk-import")
async def bulk_import_customers(file: UploadFile = File(...), db: Session = Depends(get_db),
                                current_user: CompanyRep = Depends(get_current_user)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": [], "created": []}
    for i, row in enumerate(reader, 2):
        try:
            name, mobile = row.get('name*', '').strip(), row.get('mobile*', '').strip()
            if not name or not mobile: results["errors"].append(f"Row {i}: Name and mobile required"); continue
            dupes = check_duplicate_mobile(db, mobile)
            if dupes:
                dup = dupes[0]
                results["errors"].append(f"Row {i}: Mobile exists in {dup['type']} {dup['entity_id']} ({dup['name']})")
                continue
            c = Customer(name=name, mobile=mobile, address=row.get('address'), cnic=row.get('cnic'), email=row.get('email'),
                         source=row.get('source'), occupation=row.get('occupation'),
                         area=row.get('area'), city=row.get('city'), notes=row.get('notes'),
                         assigned_rep_id=current_user.id)
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
def list_brokers(db: Session = Depends(get_db),
                 current_user: CompanyRep = Depends(get_current_user)):
    iso = get_rep_isolation_filter(current_user, db)
    q = db.query(Broker).order_by(Broker.created_at.desc())
    if iso["isolated"]:
        rt = iso["rep_type"]
        if rt == "direct":
            return []  # direct reps don't see brokers
        q = q.filter(Broker.assigned_rep_id.in_(iso["team_rep_uuids"]))
    brokers = q.all()
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
def delete_broker(bid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    b = find_entity(db, Broker, "broker_id", bid)
    if not b: raise HTTPException(404, "Broker not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(b); db.commit()
        return {"message": "Broker deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="broker", entity_id=b.id, entity_name=b.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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
            # Check for duplicate brokers and leads (exclude customers — brokers link to matching customers)
            dupes = check_duplicate_mobile(db, mobile)
            broker_or_lead_dupes = [d for d in dupes if d["type"] in ("broker", "lead")]
            if broker_or_lead_dupes:
                dup = broker_or_lead_dupes[0]
                results["errors"].append(f"Row {i}: Mobile exists in {dup['type']} {dup['entity_id']} ({dup['name']})")
                continue
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
def delete_project(pid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    p = find_entity(db, Project, "project_id", pid)
    if not p: raise HTTPException(404, "Project not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        try:
            db.delete(p); db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(400, "Cannot delete project with linked inventory. Remove inventory first.")
        return {"message": "Project deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="project", entity_id=p.id, entity_name=p.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

# ============================================
# COMPANY REPS API
# ============================================
@app.get("/api/company-reps")
def list_reps(db: Session = Depends(get_db)):
    reps = db.query(CompanyRep).order_by(CompanyRep.created_at.desc()).all()
    return [{"id": str(r.id), "rep_id": r.rep_id, "name": r.name, "mobile": r.mobile,
             "email": r.email, "status": r.status, "role": r.role,
             "rep_type": r.rep_type, "title": r.title, "reports_to": r.reports_to} for r in reps]

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
        role=role,
        rep_type=data.get("rep_type"),
        title=data.get("title"),
        reports_to=data.get("reports_to")
    )
    db.add(r); db.commit(); db.refresh(r)
    return {"message": "Rep created", "id": str(r.id), "rep_id": r.rep_id, "role": r.role, "rep_type": r.rep_type}

@app.put("/api/company-reps/{rid}")
def update_rep(rid: str, data: dict, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    r = db.query(CompanyRep).filter((CompanyRep.id == rid) | (CompanyRep.rep_id == rid)).first()
    if not r: raise HTTPException(404, "Rep not found")

    # Only admin can change roles or status
    if ("role" in data or "status" in data) and current_user.role != "admin":
        raise HTTPException(403, "Only admin can change roles or status")
    # Non-admin/cco can only update their own profile (name, mobile, email, password)
    if str(r.id) != str(current_user.id) and current_user.role not in ["admin", "cco"]:
        raise HTTPException(403, "Can only update your own profile")
    
    for k in ["name", "mobile", "email", "status", "role", "rep_type", "title", "reports_to"]:
        if k in data: setattr(r, k, data[k])
    
    if "password" in data and data["password"]:
        r.password_hash = get_password_hash(data["password"])
    
    db.commit()
    return {"message": "Rep updated"}

@app.delete("/api/company-reps/{rid}")
def delete_rep(rid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    r = find_entity(db, CompanyRep, "rep_id", rid)
    if not r: raise HTTPException(404, "Rep not found")

    # Only admin, cco, or manager can delete (or request deletion)
    if current_user.role not in ["admin", "cco", "manager"]:
        raise HTTPException(403, "Insufficient permissions to delete reps")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(r); db.commit()
        return {"message": "Rep deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="company_rep", entity_id=r.id, entity_name=r.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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

    # Trigger Vector sync if project is linked
    sync_vector_branches_from_orbit(p.id, db)
    db.commit()

    return {"message": "Inventory created", "id": str(i.id), "inventory_id": i.inventory_id}

@app.put("/api/inventory/{iid}")
def update_inventory(iid: str, data: dict, db: Session = Depends(get_db)):
    i = db.query(Inventory).filter((Inventory.id == iid) | (Inventory.inventory_id == iid)).first()
    if not i: raise HTTPException(404, "Inventory not found")
    project_id = i.project_id
    for k in ["unit_number", "unit_type", "block", "area_marla", "rate_per_marla", "status", "factor_details", "notes"]:
        if k in data and data[k] is not None: setattr(i, k, data[k])
    db.commit()

    # Trigger Vector sync if project is linked
    if project_id:
        sync_vector_branches_from_orbit(project_id, db)
        db.commit()

    return {"message": "Inventory updated"}

@app.delete("/api/inventory/{iid}")
def delete_inventory(iid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    i = find_entity(db, Inventory, "inventory_id", iid)
    if not i: raise HTTPException(404, "Inventory not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        project_id = i.project_id
        db.delete(i); db.commit()

        # Trigger Vector sync if project is linked
        if project_id:
            sync_vector_branches_from_orbit(project_id, db)
            db.commit()

        return {"message": "Inventory deleted"}

    # Non-admin: create deletion request
    entity_name = i.unit_number if i.unit_number else str(i.id)
    req = DeletionRequest(entity_type="inventory", entity_id=i.id, entity_name=entity_name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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
def list_transactions(db: Session = Depends(get_db),
                      current_user: CompanyRep = Depends(get_current_user)):
    try:
        q = db.query(Transaction).order_by(Transaction.created_at.desc())
        iso = get_rep_isolation_filter(current_user, db)
        if iso["isolated"]:
            rt = iso["rep_type"]
            if rt == "direct":
                q = q.filter(Transaction.company_rep_id.in_(iso["team_rep_uuids"]))
            elif rt == "indirect":
                broker_ids = [b.id for b in db.query(Broker.id).filter(Broker.assigned_rep_id.in_(iso["team_rep_uuids"])).all()]
                q = q.filter(Transaction.broker_id.in_(broker_ids)) if broker_ids else q.filter(literal(False))
            else:  # both
                broker_ids = [b.id for b in db.query(Broker.id).filter(Broker.assigned_rep_id.in_(iso["team_rep_uuids"])).all()]
                q = q.filter(or_(
                    Transaction.company_rep_id.in_(iso["team_rep_uuids"]),
                    Transaction.broker_id.in_(broker_ids) if broker_ids else literal(False)
                ))
        txns = q.all()
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

    # Trigger Vector sync if project is linked
    sync_vector_branches_from_orbit(project.id, db)
    db.commit()

    return {"message": "Transaction created", "id": str(t.id), "transaction_id": t.transaction_id}

@app.put("/api/transactions/{tid}")
def update_transaction(tid: str, data: dict, db: Session = Depends(get_db)):
    t = db.query(Transaction).filter((Transaction.id == tid) | (Transaction.transaction_id == tid)).first()
    if not t: raise HTTPException(404, "Transaction not found")
    for k in ["broker_commission_rate", "status", "notes"]:
        if k in data and data[k] is not None: setattr(t, k, data[k])
    db.commit()

    # Trigger Vector sync if project is linked
    if t.project_id:
        sync_vector_branches_from_orbit(t.project_id, db)
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
                      lead_id: str = None, limit: int = 100, db: Session = Depends(get_db),
                      current_user: CompanyRep = Depends(get_current_user)):
    q = db.query(Interaction)
    iso = get_rep_isolation_filter(current_user, db)
    if iso["isolated"]:
        q = q.filter(Interaction.company_rep_id.in_(iso["team_rep_uuids"]))
    if rep_id:
        r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
        if r: q = q.filter(Interaction.company_rep_id == r.id)
    if customer_id:
        c = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_id == customer_id)).first()
        if c: q = q.filter(Interaction.customer_id == c.id)
    if broker_id:
        b = db.query(Broker).filter((Broker.id == broker_id) | (Broker.broker_id == broker_id)).first()
        if b: q = q.filter(Interaction.broker_id == b.id)
    if lead_id:
        try:
            lid_uuid = uuid.UUID(str(lead_id))
            ld = db.query(Lead).filter((Lead.id == lid_uuid) | (Lead.lead_id == lead_id)).first()
        except (ValueError, AttributeError):
            ld = db.query(Lead).filter(Lead.lead_id == lead_id).first()
        if ld: q = q.filter(Interaction.lead_id == ld.id)

    interactions = q.order_by(Interaction.created_at.desc()).limit(limit).all()

    # Pre-fetch related entities to avoid N+1 queries
    rep_ids = set(i.company_rep_id for i in interactions if i.company_rep_id)
    cust_ids = set(i.customer_id for i in interactions if i.customer_id)
    broker_ids = set(i.broker_id for i in interactions if i.broker_id)
    lead_ids = set(i.lead_id for i in interactions if i.lead_id)
    reps_map = {r.id: r for r in db.query(CompanyRep).filter(CompanyRep.id.in_(rep_ids)).all()} if rep_ids else {}
    custs_map = {c.id: c for c in db.query(Customer).filter(Customer.id.in_(cust_ids)).all()} if cust_ids else {}
    brokers_map = {b.id: b for b in db.query(Broker).filter(Broker.id.in_(broker_ids)).all()} if broker_ids else {}
    leads_map = {l.id: l for l in db.query(Lead).filter(Lead.id.in_(lead_ids)).all()} if lead_ids else {}

    result = []
    for i in interactions:
        rep = reps_map.get(i.company_rep_id)
        cust = custs_map.get(i.customer_id)
        broker = brokers_map.get(i.broker_id)
        ld = leads_map.get(i.lead_id)
        result.append({
            "id": str(i.id), "interaction_id": i.interaction_id,
            "rep_name": rep.name if rep else None, "rep_id": rep.rep_id if rep else None,
            "customer_name": cust.name if cust else None, "customer_id": cust.customer_id if cust else None,
            "broker_name": broker.name if broker else None, "broker_id": broker.broker_id if broker else None,
            "lead_name": ld.name if ld else None, "lead_id": ld.lead_id if ld else None,
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
def create_interaction(data: dict, db: Session = Depends(get_db),
                       current_user: CompanyRep = Depends(get_current_user)):
    try:
        rep_uuid = uuid.UUID(str(data["company_rep_id"]))
        rep = db.query(CompanyRep).filter((CompanyRep.id == rep_uuid) | (CompanyRep.rep_id == data["company_rep_id"])).first()
    except (ValueError, AttributeError):
        rep = db.query(CompanyRep).filter(CompanyRep.rep_id == data["company_rep_id"]).first()
    if not rep: raise HTTPException(404, "Company rep not found")

    customer = None
    broker = None
    lead = None
    if data.get("customer_id"):
        try:
            cid = uuid.UUID(str(data["customer_id"]))
            customer = db.query(Customer).filter((Customer.id == cid) | (Customer.customer_id == data["customer_id"])).first()
        except (ValueError, AttributeError):
            customer = db.query(Customer).filter((Customer.customer_id == data["customer_id"]) | (Customer.mobile == data["customer_id"])).first()
    if data.get("broker_id"):
        try:
            bid = uuid.UUID(str(data["broker_id"]))
            broker = db.query(Broker).filter((Broker.id == bid) | (Broker.broker_id == data["broker_id"])).first()
        except (ValueError, AttributeError):
            broker = db.query(Broker).filter((Broker.broker_id == data["broker_id"]) | (Broker.mobile == data["broker_id"])).first()
    if data.get("lead_id"):
        try:
            lid_uuid = uuid.UUID(str(data["lead_id"]))
            lead = db.query(Lead).filter((Lead.id == lid_uuid) | (Lead.lead_id == data["lead_id"])).first()
        except (ValueError, AttributeError):
            lead = db.query(Lead).filter(Lead.lead_id == data["lead_id"]).first()

    # Auto-link customer/broker if lead has been synced
    if lead and not customer and lead.converted_customer_id:
        customer = db.query(Customer).filter(Customer.id == lead.converted_customer_id).first()
    if lead and not broker and lead.converted_broker_id:
        broker = db.query(Broker).filter(Broker.id == lead.converted_broker_id).first()

    if not customer and not broker and not lead:
        raise HTTPException(400, "Must specify customer, broker, or lead")

    i = Interaction(
        company_rep_id=rep.id,
        customer_id=customer.id if customer else None,
        broker_id=broker.id if broker else None,
        lead_id=lead.id if lead else None,
        interaction_type=data["interaction_type"],
        status=data.get("status"),
        notes=data.get("notes"),
        next_follow_up=date.fromisoformat(data["next_follow_up"]) if data.get("next_follow_up") else None
    )
    db.add(i); db.commit(); db.refresh(i)

    # Update lead's last_contacted_at if interaction is for a lead
    if lead:
        lead.last_contacted_at = datetime.utcnow()
        lead.is_stale = False
        db.commit()

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
def delete_interaction(iid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    i = find_entity(db, Interaction, "interaction_id", iid)
    if not i: raise HTTPException(404, "Interaction not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(i); db.commit()
        return {"message": "Interaction deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="interaction", entity_id=i.id, entity_name=str(i.id), requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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
def delete_campaign(cid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    c = find_entity(db, Campaign, "campaign_id", cid)
    if not c: raise HTTPException(404, "Campaign not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(c); db.commit()
        return {"message": "Campaign deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="campaign", entity_id=c.id, entity_name=c.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

# ============================================
# LEADS API
# ============================================
@app.get("/api/leads")
def list_leads(campaign_id: str = None, rep_id: str = None, status: str = None,
               limit: int = 100, db: Session = Depends(get_db),
               current_user: CompanyRep = Depends(get_current_user)):
    try:
        q = db.query(Lead)
        # Data isolation
        iso = get_rep_isolation_filter(current_user, db)
        if iso["isolated"]:
            q = q.filter(Lead.assigned_rep_id.in_(iso["team_rep_uuids"]))
        if campaign_id and campaign_id.strip():
            c = db.query(Campaign).filter((Campaign.id == campaign_id) | (Campaign.campaign_id == campaign_id)).first()
            if c: q = q.filter(Lead.campaign_id == c.id)
        if rep_id and rep_id.strip():
            r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
            if r: q = q.filter(Lead.assigned_rep_id == r.id)
        if status and status.strip(): q = q.filter(Lead.status == status)

        leads = q.order_by(Lead.created_at.desc()).limit(limit).all()
        # Pre-fetch related entities to avoid N+1
        camp_ids = set(l.campaign_id for l in leads if l.campaign_id)
        rep_ids = set(l.assigned_rep_id for l in leads if l.assigned_rep_id)
        camps_map = {c.id: c for c in db.query(Campaign).filter(Campaign.id.in_(camp_ids)).all()} if camp_ids else {}
        reps_map = {r.id: r for r in db.query(CompanyRep).filter(CompanyRep.id.in_(rep_ids)).all()} if rep_ids else {}
        result = []
        for l in leads:
            campaign = camps_map.get(l.campaign_id)
            rep = reps_map.get(l.assigned_rep_id)
            result.append({
                "id": str(l.id), "lead_id": l.lead_id, "name": l.name,
                "mobile": l.mobile, "email": l.email,
                "campaign_name": campaign.name if campaign else None,
                "campaign_id": campaign.campaign_id if campaign else None,
                "assigned_rep": rep.name if rep else None, "rep_id": rep.rep_id if rep else None,
                "status": l.status, "lead_type": l.lead_type or "prospect", "notes": l.notes,
                "pipeline_stage": l.pipeline_stage or "New",
                "converted_customer_id": str(l.converted_customer_id) if l.converted_customer_id else None,
                "converted_broker_id": str(l.converted_broker_id) if l.converted_broker_id else None,
                "additional_mobiles": l.additional_mobiles or [],
                "source": l.source, "source_other": l.source_other,
                "occupation": l.occupation, "occupation_other": l.occupation_other,
                "interested_project_id": str(l.interested_project_id) if l.interested_project_id else None,
                "interested_project_other": l.interested_project_other,
                "area": l.area, "city": l.city,
                "country_code": l.country_code or "+92",
                "source_details": l.source_details,
                "created_at": str(l.created_at)
            })
        return result
    except Exception as e:
        print(f"Error listing leads: {e}")
        return []

@app.post("/api/leads")
def create_lead(data: dict, db: Session = Depends(get_db),
                current_user: CompanyRep = Depends(get_current_user)):
    try:
        campaign = None
        rep = None
        campaign_name = None
        if data.get("campaign_id"):
            campaign = db.query(Campaign).filter((Campaign.id == data["campaign_id"]) | (Campaign.campaign_id == data["campaign_id"])).first()
            campaign_name = campaign.name if campaign else None
        if data.get("assigned_rep_id"):
            rep = db.query(CompanyRep).filter((CompanyRep.id == data["assigned_rep_id"]) | (CompanyRep.rep_id == data["assigned_rep_id"])).first()

        # Check for duplicates — block creation if mobile matches existing record
        mobile = data.get("mobile", "").strip() if data.get("mobile") else ""
        if mobile:
            dupes = check_duplicate_mobile(db, mobile)
            if dupes:
                # Send notifications before blocking
                notify_duplicate_attempt(db, dupes, current_user, "single", campaign_name)
                db.commit()
                dup = dupes[0]
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "Duplicate mobile number detected",
                        "duplicate": {
                            "type": dup["type"],
                            "entity_id": dup["entity_id"],
                            "name": dup["name"],
                            "mobile": dup["mobile"],
                            "assigned_rep": dup.get("assigned_rep"),
                            "assigned_rep_id": dup.get("assigned_rep_id")
                        }
                    }
                )

        # Resolve interested_project_id
        interested_project_id = None
        if data.get("interested_project_id") and data["interested_project_id"] != "other":
            p = db.query(Project).filter(
                (Project.id == data["interested_project_id"]) | (Project.project_id == data["interested_project_id"])
            ).first()
            interested_project_id = p.id if p else None
        # Filter additional mobiles
        additional = [m for m in (data.get("additional_mobiles") or []) if m and m.strip()]
        l = Lead(
            campaign_id=campaign.id if campaign else None,
            assigned_rep_id=rep.id if rep else current_user.id,
            name=data["name"], mobile=mobile or None, email=data.get("email"),
            source_details=data.get("source_details"), status=data.get("status", "new"),
            lead_type=data.get("lead_type", "prospect"), notes=data.get("notes"),
            pipeline_stage=data.get("pipeline_stage", "New"),
            additional_mobiles=additional if additional else [],
            source=data.get("source"), source_other=data.get("source_other"),
            occupation=data.get("occupation"), occupation_other=data.get("occupation_other"),
            interested_project_id=interested_project_id,
            interested_project_other=data.get("interested_project_other"),
            area=data.get("area"), city=data.get("city"),
            country_code=data.get("country_code", "+92")
        )
        db.add(l); db.commit(); db.refresh(l)
        return {"message": "Lead created", "id": str(l.id), "lead_id": l.lead_id}
    except HTTPException:
        raise
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
    writer.writerow(['name*', 'mobile', 'email', 'assigned_rep', 'assigned_broker', 'pre_assigned_customer', 'lead_type', 'source_details', 'source', 'occupation', 'area', 'city', 'notes'])
    writer.writerow(['John Doe', '0300-1234567', 'john@email.com', 'REP-0001', 'BRK-0001', 'CUST-0001', 'prospect', 'Facebook form', 'Social Media', 'Businessman', 'DHA Phase 5', 'Karachi', 'Interested in Phase 2'])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=leads_template.csv"})

@app.post("/api/leads/bulk-import")
async def bulk_import_leads(file: UploadFile = File(...), campaign_id: str = None, db: Session = Depends(get_db),
                            current_user: CompanyRep = Depends(get_current_user)):
    campaign = None
    campaign_name = None
    if campaign_id:
        campaign = db.query(Campaign).filter((Campaign.id == campaign_id) | (Campaign.campaign_id == campaign_id)).first()
        campaign_name = campaign.name if campaign else None

    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "errors": [], "duplicates": [], "warnings": []}
    all_dup_records = []  # For notification at end
    for i, row in enumerate(reader, 2):
        try:
            name = row.get('name', row.get('name*', '')).strip()
            if not name: results["errors"].append(f"Row {i}: Name required"); continue

            mobile = (row.get('mobile') or '').strip()
            # Check for duplicates if mobile provided
            if mobile:
                dupes = check_duplicate_mobile(db, mobile)
                if dupes:
                    for dup in dupes:
                        results["duplicates"].append({
                            "row": i, "uploaded_name": name, "uploaded_mobile": mobile,
                            "system_type": dup["type"], "system_entity_id": dup["entity_id"],
                            "system_name": dup["name"], "system_mobile": dup["mobile"],
                            "system_assigned_rep": dup.get("assigned_rep") or "N/A"
                        })
                        all_dup_records.append(dup)
                        # Auto-create follow-up task for the owner rep
                        owner_rep_id = dup.get("assigned_rep_id")
                        if owner_rep_id:
                            owner_rep = db.query(CompanyRep).filter(CompanyRep.rep_id == owner_rep_id).first()
                            if owner_rep:
                                task = Task(
                                    title=f"Follow up with {dup['name']} — showed interest in {campaign_name or 'campaign'}",
                                    description=f"Duplicate detected during bulk import. {name} (mobile: {mobile}) matches existing {dup['type']} {dup['entity_id']}. Campaign: {campaign_name or 'N/A'}.",
                                    task_type="FOLLOW_UP",
                                    priority="HIGH",
                                    status="TODO",
                                    assignee_id=owner_rep.id,
                                    created_by=current_user.id,
                                    due_date=date.today() + timedelta(days=2)
                                )
                                db.add(task)
                                create_notification(
                                    db, owner_rep_id, "follow_up",
                                    f"New interest: {dup['name']}",
                                    f"{name} showed interest in {campaign_name or 'campaign'}. A follow-up task has been auto-created.",
                                    category="lead", entity_type="lead", entity_id=dup["entity_id"]
                                )
                    continue  # Skip this row

            rep = None
            if row.get('assigned_rep'):
                rep = db.query(CompanyRep).filter(
                    (CompanyRep.rep_id == row['assigned_rep']) | (CompanyRep.name == row['assigned_rep'])
                ).first()
                if not rep:
                    results["warnings"].append(f"Row {i}: assigned_rep '{row['assigned_rep']}' not found, skipping assignment")

            # Lookup assigned_broker (optional)
            broker = None
            if row.get('assigned_broker'):
                broker = db.query(Broker).filter(
                    (Broker.broker_id == row['assigned_broker']) | (Broker.name == row['assigned_broker'])
                ).first()
                if not broker:
                    results["warnings"].append(f"Row {i}: assigned_broker '{row['assigned_broker']}' not found, skipping assignment")

            # Lookup pre_assigned_customer (optional)
            pre_customer = None
            if row.get('pre_assigned_customer'):
                pre_customer = db.query(Customer).filter(
                    (Customer.customer_id == row['pre_assigned_customer']) | (Customer.mobile == row['pre_assigned_customer'])
                ).first()
                if not pre_customer:
                    results["warnings"].append(f"Row {i}: pre_assigned_customer '{row['pre_assigned_customer']}' not found, skipping")

            l = Lead(
                campaign_id=campaign.id if campaign else None,
                assigned_rep_id=rep.id if rep else None,
                name=name, mobile=mobile or None, email=row.get('email'),
                source_details=row.get('source_details'), notes=row.get('notes'),
                source=row.get('source'), occupation=row.get('occupation'),
                area=row.get('area'), city=row.get('city'),
                metadata={
                    "assigned_broker_id": str(broker.id) if broker else None,
                    "assigned_broker_name": broker.name if broker else None,
                    "pre_assigned_customer_id": str(pre_customer.id) if pre_customer else None,
                    "pre_assigned_customer_name": pre_customer.name if pre_customer else None,
                }
            )
            db.add(l); db.flush()
            results["success"] += 1
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    # Notify admin/CCO about duplicates (not individual reps — individual already notified above)
    if all_dup_records:
        notify_duplicate_attempt(db, all_dup_records, current_user, "bulk", campaign_name)
        db.commit()
    return results

@app.put("/api/leads/{lid}")
def update_lead(lid: str, data: dict, db: Session = Depends(get_db),
                current_user: CompanyRep = Depends(get_current_user)):
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")
    for k in ["name", "mobile", "email", "source_details", "status", "lead_type", "notes", "pipeline_stage",
              "additional_mobiles", "source", "source_other", "occupation", "occupation_other",
              "interested_project_other", "area", "city", "country_code"]:
        if k in data: setattr(l, k, data[k])
    if "interested_project_id" in data:
        if data["interested_project_id"] and data["interested_project_id"] != "other":
            p = db.query(Project).filter(
                (Project.id == data["interested_project_id"]) | (Project.project_id == data["interested_project_id"])
            ).first()
            l.interested_project_id = p.id if p else None
        else:
            l.interested_project_id = None
    if "assigned_rep_id" in data:
        rep = None
        if data["assigned_rep_id"]:
            try:
                rid = uuid.UUID(str(data["assigned_rep_id"]))
                rep = db.query(CompanyRep).filter((CompanyRep.id == rid) | (CompanyRep.rep_id == data["assigned_rep_id"])).first()
            except (ValueError, AttributeError):
                rep = db.query(CompanyRep).filter(CompanyRep.rep_id == data["assigned_rep_id"]).first()
        l.assigned_rep_id = rep.id if rep else None
    db.commit()
    return {"message": "Lead updated"}

@app.post("/api/leads/{lid}/convert")
def convert_lead(lid: str, data: dict, db: Session = Depends(get_db),
                 current_user: CompanyRep = Depends(get_current_user)):
    """Sync a lead to the customer or broker database. Does NOT mark as converted — that only happens when pipeline_stage is set to Won."""
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")

    convert_to = data.get("convert_to")  # 'customer' or 'broker'
    if convert_to == "customer":
        # Check if customer with same mobile already exists (using normalized comparison)
        existing = None
        if l.mobile:
            normalized = normalize_mobile(l.mobile)
            if normalized:
                patterns = [normalized]
                if normalized.startswith("0"):
                    patterns.append("+92" + normalized[1:])
                    patterns.append("92" + normalized[1:])
                existing = db.query(Customer).filter(or_(*[Customer.mobile.ilike(p) for p in patterns])).first()
        linked_existing = False
        if existing:
            l.converted_customer_id = existing.id
            linked_existing = True
            entity_id = existing.customer_id
        else:
            c = Customer(name=l.name, mobile=l.mobile or f"lead-{l.lead_id}", email=l.email)
            db.add(c); db.flush()
            l.converted_customer_id = c.id
            entity_id = c.customer_id
        l.lead_type = "customer"
        # Carry forward lead interactions to the customer
        db.query(Interaction).filter(
            Interaction.lead_id == l.id,
            Interaction.customer_id.is_(None)
        ).update({"customer_id": l.converted_customer_id}, synchronize_session="fetch")
        db.commit()
        return {"message": "Lead synced to customer DB", "customer_id": str(l.converted_customer_id),
                "linked_existing": linked_existing, "entity_id": entity_id}

    elif convert_to == "broker":
        existing = None
        if l.mobile:
            normalized = normalize_mobile(l.mobile)
            if normalized:
                patterns = [normalized]
                if normalized.startswith("0"):
                    patterns.append("+92" + normalized[1:])
                    patterns.append("92" + normalized[1:])
                existing = db.query(Broker).filter(or_(*[Broker.mobile.ilike(p) for p in patterns])).first()
        linked_existing = False
        if existing:
            l.converted_broker_id = existing.id
            linked_existing = True
            entity_id = existing.broker_id
        else:
            b = Broker(name=l.name, mobile=l.mobile or f"lead-{l.lead_id}", email=l.email)
            db.add(b); db.flush()
            l.converted_broker_id = b.id
            entity_id = b.broker_id
        l.lead_type = "broker"
        db.commit()
        return {"message": "Lead synced to broker DB", "broker_id": str(l.converted_broker_id),
                "linked_existing": linked_existing, "entity_id": entity_id}

    raise HTTPException(400, "Invalid conversion type")

@app.delete("/api/leads/{lid}")
def delete_lead(lid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    l = find_entity(db, Lead, "lead_id", lid)
    if not l: raise HTTPException(404, "Lead not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(l); db.commit()
        return {"message": "Lead deleted"}

    # Non-admin: create deletion request
    entity_name = l.name if l.name else str(l.id)
    req = DeletionRequest(entity_type="lead", entity_id=l.id, entity_name=entity_name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

# ============================================
# RECEIPTS API
# ============================================
@app.get("/api/receipts")
def list_receipts(customer_id: str = None, transaction_id: str = None, limit: int = 100,
                  db: Session = Depends(get_db),
                  current_user: CompanyRep = Depends(get_current_user)):
    try:
        q = db.query(Receipt)
        # Data isolation: direct/both reps see receipts for their customers only
        iso = get_rep_isolation_filter(current_user, db)
        if iso["isolated"]:
            rt = iso["rep_type"]
            if rt == "indirect":
                return []  # indirect reps don't see receipts
            own_cust_ids = [c.id for c in db.query(Customer.id).filter(Customer.assigned_rep_id.in_(iso["team_rep_uuids"])).all()]
            q = q.filter(Receipt.customer_id.in_(own_cust_ids)) if own_cust_ids else q.filter(literal(False))
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
def delete_receipt(rid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    r = find_entity(db, Receipt, "receipt_id", rid)
    if not r: raise HTTPException(404, "Receipt not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
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

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="receipt", entity_id=r.id, entity_name=r.receipt_id, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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
def delete_creditor(cid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    c = find_entity(db, Creditor, "creditor_id", cid)
    if not c: raise HTTPException(404, "Creditor not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        db.delete(c); db.commit()
        return {"message": "Creditor deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="creditor", entity_id=c.id, entity_name=c.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

# ============================================
# PAYMENTS API
# ============================================
@app.get("/api/payments")
def list_payments(
    broker_id: str = None, rep_id: str = None, creditor_id: str = None,
    payment_type: str = None, status: str = None, start_date: str = None,
    end_date: str = None, limit: int = 100, db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    q = db.query(Payment)
    # Data isolation: indirect/both reps see payments for their brokers only
    iso = get_rep_isolation_filter(current_user, db)
    if iso["isolated"]:
        rt = iso["rep_type"]
        if rt == "direct":
            return []  # direct reps don't see payments
        own_broker_ids = [b.id for b in db.query(Broker.id).filter(Broker.assigned_rep_id.in_(iso["team_rep_uuids"])).all()]
        q = q.filter(Payment.broker_id.in_(own_broker_ids)) if own_broker_ids else q.filter(literal(False))
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
def delete_payment(pid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    p = find_entity(db, Payment, "payment_id", pid)
    if not p: raise HTTPException(404, "Payment not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        # Delete allocations
        allocations = db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == p.id).all()
        for a in allocations:
            db.delete(a)

        db.delete(p); db.commit()
        return {"message": "Payment deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="payment", entity_id=p.id, entity_name=p.payment_id, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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
            "additional_mobiles": customer.additional_mobiles or [],
            "source": customer.source, "source_other": customer.source_other,
            "occupation": customer.occupation, "occupation_other": customer.occupation_other,
            "interested_project_id": str(customer.interested_project_id) if customer.interested_project_id else None,
            "interested_project_other": customer.interested_project_other,
            "area": customer.area, "city": customer.city,
            "country_code": customer.country_code or "+92",
            "assigned_rep_id": str(customer.assigned_rep_id) if customer.assigned_rep_id else None,
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
    if entity_type not in ["transaction", "interaction", "project", "receipt", "payment", "customer", "broker"]:
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
    elif entity_type == "customer":
        entity = db.query(Customer).filter((Customer.id == entity_id) | (Customer.customer_id == entity_id)).first()
    elif entity_type == "broker":
        entity = db.query(Broker).filter((Broker.id == entity_id) | (Broker.broker_id == entity_id)).first()

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
    if entity_type not in ["transaction", "interaction", "project", "receipt", "payment", "customer", "broker"]:
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
    elif entity_type == "customer":
        entity = db.query(Customer).filter((Customer.id == entity_id) | (Customer.customer_id == entity_id)).first()
    elif entity_type == "broker":
        entity = db.query(Broker).filter((Broker.id == entity_id) | (Broker.broker_id == entity_id)).first()

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
def delete_media_file(file_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
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

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        # Delete file from disk
        file_path = Path(media.file_path)
        if file_path.exists():
            file_path.unlink()

        db.delete(media); db.commit()
        return {"message": "File deleted"}

    # Non-admin: create deletion request
    entity_name = media.file_name if media.file_name else str(media.id)
    req = DeletionRequest(entity_type="media", entity_id=media.id, entity_name=entity_name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

# ============================================
# DELETION REQUESTS API
# ============================================

@app.get("/api/deletion-requests")
def list_deletion_requests(status: str = None, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    q = db.query(DeletionRequest).order_by(DeletionRequest.requested_at.desc())
    if status:
        q = q.filter(DeletionRequest.status == status)
    if current_user.role != "admin":
        q = q.filter(DeletionRequest.requested_by == current_user.id)
    requests = q.limit(200).all()
    result = []
    for r in requests:
        requester = db.query(CompanyRep).filter(CompanyRep.id == r.requested_by).first()
        reviewer = db.query(CompanyRep).filter(CompanyRep.id == r.reviewed_by).first() if r.reviewed_by else None
        result.append({
            "id": str(r.id), "request_id": r.request_id, "entity_type": r.entity_type,
            "entity_id": str(r.entity_id), "entity_name": r.entity_name,
            "requested_by": requester.name if requester else "Unknown",
            "requested_by_id": str(r.requested_by) if r.requested_by else None,
            "requested_at": str(r.requested_at), "reason": r.reason, "status": r.status,
            "reviewed_by": reviewer.name if reviewer else None,
            "reviewed_at": str(r.reviewed_at) if r.reviewed_at else None,
            "rejection_reason": r.rejection_reason
        })
    return result

@app.get("/api/deletion-requests/pending-count")
def get_pending_deletion_count(db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    count = db.query(DeletionRequest).filter(DeletionRequest.status == "pending").count()
    return {"count": count}

@app.post("/api/deletion-requests/{request_id}/approve")
def approve_deletion_request(request_id: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(require_role(["admin"]))):
    req = find_entity(db, DeletionRequest, "request_id", request_id)
    if not req: raise HTTPException(404, "Deletion request not found")
    if req.status != "pending": raise HTTPException(400, "Request is not pending")

    # Map entity types to models
    entity_map = {
        "customer": Customer, "broker": Broker, "project": Project,
        "company_rep": CompanyRep, "inventory": Inventory, "interaction": Interaction,
        "campaign": Campaign, "lead": Lead, "receipt": Receipt,
        "creditor": Creditor, "payment": Payment, "media": MediaFile
    }
    model_class = entity_map.get(req.entity_type)
    if not model_class:
        raise HTTPException(400, f"Unknown entity type: {req.entity_type}")

    entity = db.query(model_class).filter(model_class.id == req.entity_id).first()
    if not entity:
        req.status = "approved"
        req.reviewed_by = current_user.id
        req.reviewed_at = datetime.utcnow()
        db.commit()
        return {"message": "Approved but entity already deleted"}

    # Handle special cascading cases
    if req.entity_type == "receipt":
        allocations = db.query(ReceiptAllocation).filter(ReceiptAllocation.receipt_id == entity.id).all()
        for a in allocations:
            inst = db.query(Installment).filter(Installment.id == a.installment_id).first()
            if inst:
                inst.amount_paid = max(0, float(inst.amount_paid or 0) - float(a.amount))
                if float(inst.amount_paid) >= float(inst.amount): inst.status = "paid"
                elif float(inst.amount_paid) > 0: inst.status = "partial"
                else: inst.status = "pending"
            db.delete(a)
    elif req.entity_type == "payment":
        allocations = db.query(PaymentAllocation).filter(PaymentAllocation.payment_id == entity.id).all()
        for a in allocations:
            db.delete(a)
    elif req.entity_type == "inventory":
        project_id = entity.project_id
        db.delete(entity)
        db.flush()
        if project_id:
            try: sync_vector_branches_from_orbit(project_id, db)
            except: pass
        req.status = "approved"
        req.reviewed_by = current_user.id
        req.reviewed_at = datetime.utcnow()
        db.commit()
        return {"message": f"{req.entity_type} deletion approved and executed"}

    db.delete(entity)
    req.status = "approved"
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.utcnow()
    db.commit()
    return {"message": f"{req.entity_type} deletion approved and executed"}

@app.post("/api/deletion-requests/{request_id}/reject")
def reject_deletion_request(request_id: str, data: dict, db: Session = Depends(get_db), current_user: CompanyRep = Depends(require_role(["admin"]))):
    req = find_entity(db, DeletionRequest, "request_id", request_id)
    if not req: raise HTTPException(404, "Deletion request not found")
    if req.status != "pending": raise HTTPException(400, "Request is not pending")
    req.status = "rejected"
    req.reviewed_by = current_user.id
    req.reviewed_at = datetime.utcnow()
    req.rejection_reason = data.get("reason", "")
    db.commit()
    return {"message": "Deletion request rejected"}

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

        # DEBUG: Log plot IDs being returned
        print(f"DEBUG LOAD: Returning {len(plots)} plots")
        if len(plots) > 0:
            print(f"DEBUG LOAD: First 3 plot IDs: {[p.get('id') for p in plots[:3]]}")
            print(f"DEBUG LOAD: First plot structure: {plots[0]}")

        # Convert annotations to frontend format
        # PRIORITY: Use vector_metadata if it has annotations, otherwise use separate table
        annos = []

        # Check vector_metadata for annotations (this is where we save them)
        # FIXED: Check if 'annos' key exists, not just if it's truthy (empty list is falsy but valid)
        print(f"DEBUG: vector_metadata keys: {list(project.vector_metadata.keys()) if project.vector_metadata else 'None'}")
        if project.vector_metadata and 'annos' in project.vector_metadata:
            metadata_annos = project.vector_metadata.get('annos')
            # Use annotations from vector_metadata if it's a list (even if empty, we'll use it)
            if isinstance(metadata_annos, list):
                annos = metadata_annos
                print(f"DEBUG: Using {len(annos)} annotations from vector_metadata")
                if len(annos) > 0:
                    print(f"DEBUG: First annotation: {annos[0]}")
                    print(f"DEBUG: First annotation plotIds: {annos[0].get('plotIds', 'N/A')}")
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

        # Get inventory - merge from both sources if available
        # Priority: ORBIT data (linked project) + Vector metadata inventory
        inventory = {}

        # First, load from vector_metadata if exists (this preserves user-entered data)
        if project.vector_metadata and project.vector_metadata.get('inventory'):
            inventory = dict(project.vector_metadata.get('inventory', {}))
            print(f"DEBUG LOAD: Loaded {len(inventory)} inventory items from vector_metadata")

        # Then, overlay/merge with ORBIT data if linked (ORBIT data takes precedence)
        if project.linked_project_id:
            inventory_items = db.query(Inventory).filter(Inventory.project_id == project.linked_project_id).all()
            print(f"DEBUG LOAD: Found {len(inventory_items)} inventory items from ORBIT")
            for inv in inventory_items:
                # Calculate total value from area and rate
                total_value = float(inv.area_marla or 0) * float(inv.rate_per_marla or 0)

                # Build composite key to match plot naming convention (e.g., "1-IB1")
                unit = inv.unit_number.strip() if inv.unit_number else ''
                blk = inv.block.strip() if inv.block else ''
                composite_key = f"{unit}-{blk}" if blk else unit

                # Merge with existing data (ORBIT data overwrites but preserves extra fields)
                existing = inventory.get(composite_key, {})
                inv_data = {
                    **existing,  # Keep any extra fields from vector_metadata
                    "marla": float(inv.area_marla) if inv.area_marla else existing.get('marla'),
                    "totalValue": total_value if total_value > 0 else existing.get('totalValue', 0),
                    "ratePerMarla": float(inv.rate_per_marla) if inv.rate_per_marla else existing.get('ratePerMarla'),
                    "dimensions": inv.factor_details or existing.get('dimensions', ''),
                    "block": blk,
                    "unitNumber": unit,
                    "unitType": inv.unit_type or existing.get('unitType', 'plot'),
                    "status": inv.status or existing.get('status', ''),
                    "notes": inv.notes or existing.get('notes', ''),
                    "plotCoordinates": inv.plot_coordinates or existing.get('plotCoordinates'),
                    "isManualPlot": inv.is_manual_plot == "true"
                }

                # Store by composite key (primary)
                inventory[composite_key] = inv_data
                # Also store by unit-only for fallback lookups
                if blk and unit not in inventory:
                    inventory[unit] = inv_data

        print(f"DEBUG LOAD: Final inventory has {len(inventory)} items")
        if len(inventory) > 0:
            sample_key = list(inventory.keys())[0]
            print(f"DEBUG LOAD: Sample inventory item '{sample_key}': {inventory[sample_key]}")

        # Build project metadata
        project_metadata = project.vector_metadata.get('projectMetadata', {}) if project.vector_metadata else {
            "created": str(project.created_at),
            "lastModified": str(project.updated_at),
            "version": "8.2",
            "createdBy": "",
            "description": "",
            "notes": []
        }

        # Get linked project info
        linked_project_name = None
        if project.linked_project_id:
            linked_project = db.query(Project).filter(Project.id == project.linked_project_id).first()
            if linked_project:
                linked_project_name = linked_project.name

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
            "projectMetadata": project_metadata,
            "systemBranches": project.system_branches or {"sales": {}, "inventory": {}},
            "linkedProjectId": str(project.linked_project_id) if project.linked_project_id else None,
            "linkedProjectName": linked_project_name
        }
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        import traceback
        print(f"ERROR in get_vector_project: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(500, f"Failed to load project: {str(e)}")

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
        plots_in_save = parsed_metadata.get('plots', [])
        annos_in_save = parsed_metadata.get('annos', [])
        print(f"DEBUG CREATE: Creating project with {len(plots_in_save)} plots and {len(annos_in_save) if isinstance(annos_in_save, list) else 'non-list'} annotations")
        if isinstance(plots_in_save, list) and len(plots_in_save) > 0:
            print(f"DEBUG CREATE: First 3 plot IDs: {[p.get('id') for p in plots_in_save[:3]]}")
        if isinstance(annos_in_save, list) and len(annos_in_save) > 0:
            print(f"DEBUG CREATE: First annotation plotIds (first 5): {annos_in_save[0].get('plotIds', [])[:5] if annos_in_save[0] else 'none'}")
    
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
            plots_in_save = parsed_metadata.get('plots', [])
            annos_in_save = parsed_metadata.get('annos', [])
            print(f"DEBUG UPDATE: Updating project with {len(plots_in_save)} plots and {len(annos_in_save) if isinstance(annos_in_save, list) else 'non-list'} annotations")
            if isinstance(plots_in_save, list) and len(plots_in_save) > 0:
                print(f"DEBUG UPDATE: First 3 plot IDs: {[p.get('id') for p in plots_in_save[:3]]}")
            if isinstance(annos_in_save, list) and len(annos_in_save) > 0:
                print(f"DEBUG UPDATE: First annotation plotIds (first 5): {annos_in_save[0].get('plotIds', [])[:5] if annos_in_save[0] else 'none'}")
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
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not project:
        raise HTTPException(404, "Vector project not found")

    # Non-admin: create deletion request
    if current_user.role != "admin":
        req = DeletionRequest(entity_type="vector_project", entity_id=project.id, entity_name=project.name, requested_by=current_user.id)
        db.add(req); db.commit(); db.refresh(req)
        return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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

    # AUTO-GENERATE ANNOTATIONS from ORBIT data
    # Get Vector plots for matching
    plots = vector_project.vector_metadata.get('plots', []) if vector_project.vector_metadata else []
    print(f"DEBUG LINK: Vector project has {len(plots)} plots")

    # Build a map of plot number to plot ID with multiple matching strategies
    plot_map = {}
    for p in plots:
        plot_num = p.get('n', '')
        if plot_num:
            # Store multiple variations for flexible matching
            plot_map[plot_num] = p.get('id')
            plot_map[plot_num.upper()] = p.get('id')
            plot_map[plot_num.lower()] = p.get('id')
            plot_map[plot_num.strip()] = p.get('id')
            plot_map[plot_num.strip().upper()] = p.get('id')
            plot_map[plot_num.strip().lower()] = p.get('id')
            # Also try removing common prefixes/suffixes
            clean_num = plot_num.strip().upper().replace('PLOT', '').replace('PLOT#', '').replace('#', '').replace('-', '').strip()
            if clean_num:
                plot_map[clean_num] = p.get('id')

    print(f"DEBUG LINK: Plot map has {len(plot_map)} entries, sample keys: {list(plot_map.keys())[:10]}")

    # Get inventory and transactions from linked ORBIT project
    inventory_items = db.query(Inventory).filter(Inventory.project_id == radius_project_uuid).all()
    transactions = db.query(Transaction).filter(Transaction.project_id == radius_project_uuid).all()
    print(f"DEBUG LINK: Found {len(inventory_items)} inventory items and {len(transactions)} transactions")

    # Build set of sold unit numbers
    sold_units = set()
    for txn in transactions:
        if txn.unit_number:
            sold_units.add(txn.unit_number.upper())
            sold_units.add(txn.unit_number.strip().upper())
    for item in inventory_items:
        if item.status and item.status.lower() == 'sold' and item.unit_number:
            sold_units.add(item.unit_number.upper())
            sold_units.add(item.unit_number.strip().upper())
    print(f"DEBUG LINK: Found {len(sold_units)} sold units")

    # Build annotation arrays
    sold_plot_ids = []
    sold_plot_nums = []
    available_plot_ids = []
    available_plot_nums = []
    unmatched_units = []

    # Helper function to find matching plot ID
    def find_plot_id(unit_num):
        if not unit_num:
            return None
        # Try various matching strategies
        variations = [
            unit_num,
            unit_num.upper(),
            unit_num.lower(),
            unit_num.strip(),
            unit_num.strip().upper(),
            unit_num.strip().lower(),
            unit_num.strip().upper().replace('PLOT', '').replace('#', '').replace('-', '').strip(),
        ]
        for v in variations:
            if v in plot_map:
                return plot_map[v]
        return None

    for item in inventory_items:
        unit_num = item.unit_number
        if not unit_num:
            continue
        plot_id = find_plot_id(unit_num)
        if plot_id:
            if unit_num.upper() in sold_units or unit_num.strip().upper() in sold_units:
                sold_plot_ids.append(plot_id)
                sold_plot_nums.append(unit_num)
            else:
                available_plot_ids.append(plot_id)
                available_plot_nums.append(unit_num)
        else:
            unmatched_units.append(unit_num)

    if unmatched_units:
        print(f"DEBUG LINK: {len(unmatched_units)} units didn't match any plots: {unmatched_units[:10]}")
    print(f"DEBUG LINK: Matched {len(sold_plot_ids)} sold plots, {len(available_plot_ids)} available plots")

    # Create auto-generated annotations
    import time
    current_time = int(time.time() * 1000)

    sales_annotation = None
    if sold_plot_ids:
        sales_annotation = {
            "id": f"auto_sold_{current_time}",
            "note": "SOLD",
            "cat": "SOLD",
            "color": "#ef4444",
            "plotIds": sold_plot_ids,
            "plotNums": sold_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    inventory_annotation = None
    if available_plot_ids:
        inventory_annotation = {
            "id": f"auto_inventory_{current_time}",
            "note": "INVENTORY",
            "cat": "INVENTORY",
            "color": "#22c55e",
            "plotIds": available_plot_ids,
            "plotNums": available_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    # Check if this is a "raw" link (no inventory/transactions in ORBIT yet)
    is_raw_link = len(inventory_items) == 0 and len(transactions) == 0

    # Create raw branch with all manual plots if no ORBIT data exists yet
    raw_annotation = None
    if is_raw_link and plots:
        # Create a raw branch containing all plots from the Vector map
        # This serves as a template for when ORBIT data is populated
        all_plot_ids = [p.get('id') for p in plots if p.get('id')]
        all_plot_nums = [p.get('n') for p in plots if p.get('n')]
        raw_annotation = {
            "id": f"raw_linked_{current_time}",
            "note": "LINKED (Awaiting ORBIT Data)",
            "cat": "RAW",
            "color": "#94a3b8",  # Gray color for pending
            "plotIds": all_plot_ids,
            "plotNums": all_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True,
            "isRawLink": True
        }

    # Store in system_branches
    # Keep existing manual annotations (WIP) intact - they are in vector_metadata.annos
    vector_project.system_branches = {
        "sales": {
            "annotations": [sales_annotation] if sales_annotation else [],
            "lastSyncAt": datetime.utcnow().isoformat(),
            "transactionCount": len(transactions),
            "plotCount": len(sold_plot_ids)
        },
        "inventory": {
            "annotations": [inventory_annotation] if inventory_annotation else [],
            "lastSyncAt": datetime.utcnow().isoformat(),
            "unitCount": len(inventory_items),
            "plotCount": len(available_plot_ids)
        },
        "raw": {
            "annotations": [raw_annotation] if raw_annotation else [],
            "lastSyncAt": datetime.utcnow().isoformat(),
            "isAwaitingData": is_raw_link,
            "plotCount": len(plots) if is_raw_link else 0
        }
    }

    vector_project.updated_at = func.now()
    db.commit()

    # Create or update reconciliation record
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == vector_project_uuid).first()
    sync_status = "awaiting_data" if is_raw_link else "synced"
    if not recon:
        recon = VectorReconciliation(
            project_id=vector_project_uuid,
            linked_project_id=radius_project_uuid,
            sync_status=sync_status,
            last_sync_at=datetime.utcnow()
        )
        db.add(recon)
    else:
        recon.linked_project_id = radius_project_uuid
        recon.sync_status = sync_status
        recon.last_sync_at = datetime.utcnow()

    db.commit()

    # Build response message based on link type
    if is_raw_link:
        message = "Vector project linked to ORBIT project (awaiting inventory/transaction data)"
    else:
        message = "Vector project linked to ORBIT project with auto-generated annotations"

    return {
        "message": message,
        "vector_project_id": str(vector_project.id),
        "linked_project_id": str(radius_project.id),
        "linked_project_name": radius_project.name,
        "sold_plots": len(sold_plot_ids),
        "inventory_plots": len(available_plot_ids),
        "is_raw_link": is_raw_link,
        "total_vector_plots": len(plots)
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
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

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

@app.post("/api/vector/projects/{project_id}/sync-branches")
def sync_branches(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Generate TWO separate auto-generated Vector projects from linked ORBIT data.

    Creates/Updates:
    1. Status Map: SOLD vs AVAILABLE (2 annotations)
    2. Customer Map: Customer-wise breakdown with unique colors

    The original Vector project remains UNTOUCHED.
    """
    import time
    import colorsys

    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not vector_project:
        raise HTTPException(404, "Vector project not found")

    if not vector_project.linked_project_id:
        raise HTTPException(400, "Vector project not linked to an ORBIT project")

    # Check if this is an auto-generated project - if so, use the SOURCE project's data
    is_auto_generated = vector_project.vector_metadata.get('isAutoGenerated', False) if vector_project.vector_metadata else False
    source_project = None
    master_project = vector_project  # The project that has the reconciliation mappings

    if is_auto_generated:
        source_project_id = vector_project.vector_metadata.get('sourceProjectId')
        if source_project_id:
            try:
                source_project = db.query(VectorProject).filter(VectorProject.id == uuid.UUID(source_project_id)).first()
                if source_project:
                    master_project = source_project
                    print(f"DEBUG SYNC: Auto-generated project detected, using source project: {source_project_id}")
            except:
                pass

    # Get linked ORBIT project name
    linked_project = db.query(Project).filter(Project.id == vector_project.linked_project_id).first()
    orbit_project_name = linked_project.name if linked_project else "ORBIT"

    # Helper function to generate unique colors for customers
    def generate_unique_colors(n):
        """Generate n visually distinct colors."""
        colors = []
        for i in range(n):
            hue = i / n
            saturation = 0.7 + (i % 3) * 0.1  # Vary saturation slightly
            lightness = 0.5
            r, g, b = colorsys.hls_to_rgb(hue, lightness, saturation)
            colors.append(f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}")
        return colors

    # Get Vector plots for matching - always use MASTER project's plots
    plots = master_project.vector_metadata.get('plots', []) if master_project.vector_metadata else []
    print(f"DEBUG SYNC: Master project has {len(plots)} plots")
    print(f"DEBUG SYNC: Is auto-generated: {is_auto_generated}, Master project ID: {master_project.id}")

    # Build multiple maps for flexible matching
    # Map 1: Exact plot name -> plot data (for "1-IB1" style names)
    # Map 2: Parsed (unit, block) -> plot data
    plot_by_name = {}  # "1-IB1" -> {id, n}
    plot_by_unit_block = {}  # ("1", "IB1") -> {id, n}
    plot_by_unit_only = {}  # "1" -> {id, n} (for simple cases without blocks)

    for p in plots:
        plot_num = p.get('n', '').strip()
        plot_id = p.get('id')
        if not plot_num or not plot_id:
            continue

        plot_data = {'id': plot_id, 'n': plot_num}

        # Store by exact name (case variations)
        plot_by_name[plot_num] = plot_data
        plot_by_name[plot_num.upper()] = plot_data
        plot_by_name[plot_num.lower()] = plot_data

        # Try to parse "unit-block" format (e.g., "149-IB1", "1-A", "25-IB2")
        if '-' in plot_num:
            parts = plot_num.split('-', 1)
            if len(parts) == 2:
                unit_part = parts[0].strip()
                block_part = parts[1].strip()
                # Store by (unit, block) tuple
                plot_by_unit_block[(unit_part, block_part)] = plot_data
                plot_by_unit_block[(unit_part.upper(), block_part.upper())] = plot_data
                plot_by_unit_block[(unit_part.lower(), block_part.lower())] = plot_data
        else:
            # Simple unit number without block
            plot_by_unit_only[plot_num] = plot_data
            plot_by_unit_only[plot_num.upper()] = plot_data
            plot_by_unit_only[plot_num.lower()] = plot_data

    print(f"DEBUG SYNC: Built maps - by_name: {len(plot_by_name)}, by_unit_block: {len(plot_by_unit_block)}, by_unit_only: {len(plot_by_unit_only)}")

    # Get inventory items from linked ORBIT project
    inventory_items = db.query(Inventory).filter(
        Inventory.project_id == vector_project.linked_project_id
    ).all()

    # Get transactions to identify SOLD items
    transactions = db.query(Transaction).filter(
        Transaction.project_id == vector_project.linked_project_id
    ).all()

    print(f"DEBUG SYNC: Found {len(inventory_items)} inventory items, {len(transactions)} transactions")

    # Build set of sold unit identifiers (unit_number-block or just unit_number)
    # Also build inventory_id -> sold mapping for manual mapping lookup
    sold_identifiers = set()
    sold_inventory_ids = set()  # Track which inventory_ids are sold

    for txn in transactions:
        print(f"DEBUG SYNC: Transaction found - unit: {txn.unit_number}, inventory_id (UUID): {txn.inventory_id}")
        if txn.unit_number:
            # IMPORTANT: Only add unit-only identifier if there's NO block
            # Otherwise only add the composite to prevent cross-block matching
            txn_unit = txn.unit_number.strip().upper()
            txn_block = txn.block.strip().upper() if hasattr(txn, 'block') and txn.block else ''
            if txn_block:
                # Has block - ONLY add composite identifier
                sold_identifiers.add(f"{txn_unit}-{txn_block}")
            else:
                # No block - add unit only
                sold_identifiers.add(txn_unit)

        # Get the inventory item to find its string inventory_id
        if txn.inventory_id:
            txn_inv = db.query(Inventory).filter(Inventory.id == txn.inventory_id).first()
            if txn_inv:
                sold_inventory_ids.add(txn_inv.inventory_id)  # The string like "INV-00001"
                print(f"DEBUG SYNC: Transaction inventory_id (string): {txn_inv.inventory_id}")

    # Also check inventory status for sold items
    for item in inventory_items:
        if item.status and item.status.lower() == 'sold' and item.unit_number:
            sold_inventory_ids.add(item.inventory_id)
            # IMPORTANT: Only add unit-only identifier if there's NO block
            # Otherwise only add the composite to prevent cross-block matching
            item_unit = item.unit_number.strip().upper()
            item_block = item.block.strip().upper() if item.block else ''
            if item_block:
                # Has block - ONLY add composite identifier
                sold_identifiers.add(f"{item_unit}-{item_block}")
            else:
                # No block - add unit only
                sold_identifiers.add(item_unit)

    print(f"DEBUG SYNC: Found {len(sold_identifiers)} sold identifiers, {len(sold_inventory_ids)} sold inventory_ids")
    if sold_inventory_ids:
        print(f"DEBUG SYNC: Sold inventory_ids: {list(sold_inventory_ids)[:5]}")

    # Load manual mappings (inventory_id -> plot_id)
    manual_mappings = {}
    inv_id_to_plot = {}  # Reverse lookup: inventory_id -> plot_data

    # Debug: Check what's in MASTER project's vector_metadata (where mappings are stored)
    print(f"DEBUG SYNC: master_project.vector_metadata type: {type(master_project.vector_metadata)}")
    if master_project.vector_metadata:
        print(f"DEBUG SYNC: master_project.vector_metadata keys: {list(master_project.vector_metadata.keys())}")
        raw_mappings = master_project.vector_metadata.get('plot_inventory_mapping')
        print(f"DEBUG SYNC: plot_inventory_mapping type: {type(raw_mappings)}, value exists: {raw_mappings is not None}")
        if raw_mappings:
            print(f"DEBUG SYNC: plot_inventory_mapping count: {len(raw_mappings)}")

    if master_project.vector_metadata and master_project.vector_metadata.get('plot_inventory_mapping'):
        mappings = master_project.vector_metadata['plot_inventory_mapping']
        for plot_id, mapping_data in mappings.items():
            inv_id = mapping_data.get('inventory_id')
            plot_name = mapping_data.get('plot_name', '')
            if inv_id:
                inv_id_to_plot[inv_id] = {'id': plot_id, 'n': plot_name}
                inv_id_to_plot[inv_id.upper()] = {'id': plot_id, 'n': plot_name}
                inv_id_to_plot[inv_id.lower()] = {'id': plot_id, 'n': plot_name}
        print(f"DEBUG SYNC: Loaded {len(inv_id_to_plot)} manual mappings (from {len(mappings)} plot entries)")
        if inv_id_to_plot:
            sample = list(inv_id_to_plot.items())[:3]
            print(f"DEBUG SYNC: Sample mappings: {sample}")
    else:
        print("DEBUG SYNC: No manual mappings found")

    # Smart matching function
    def find_matching_plot(inventory_item):
        """Find matching Vector plot for an ORBIT inventory item.

        IMPORTANT: When inventory has a block, we MUST match unit+block exactly.
        We only fall back to unit-only matching when inventory has NO block specified.
        This prevents matching "1-IB2" transaction to "1-IB1" plot.
        """
        # Strategy 0: Check manual mapping first (by inventory_id)
        inv_id = inventory_item.inventory_id
        if inv_id:
            if inv_id in inv_id_to_plot:
                print(f"DEBUG SYNC: Manual mapping found for {inv_id}")
                return inv_id_to_plot[inv_id]
            if inv_id.upper() in inv_id_to_plot:
                return inv_id_to_plot[inv_id.upper()]

        unit = inventory_item.unit_number.strip() if inventory_item.unit_number else ''
        blk = inventory_item.block.strip() if inventory_item.block else ''

        if not unit:
            return None

        # Strategy 1: Try exact "unit-block" match (e.g., "1-IB1")
        # This is the ONLY strategy when inventory HAS a block
        if blk:
            composite_key = f"{unit}-{blk}"
            if composite_key in plot_by_name:
                print(f"DEBUG SYNC: Exact unit-block match: {composite_key}")
                return plot_by_name[composite_key]
            if composite_key.upper() in plot_by_name:
                print(f"DEBUG SYNC: Exact unit-block match (upper): {composite_key.upper()}")
                return plot_by_name[composite_key.upper()]

            # Try tuple lookup
            if (unit, blk) in plot_by_unit_block:
                print(f"DEBUG SYNC: Tuple unit-block match: ({unit}, {blk})")
                return plot_by_unit_block[(unit, blk)]
            if (unit.upper(), blk.upper()) in plot_by_unit_block:
                print(f"DEBUG SYNC: Tuple unit-block match (upper): ({unit.upper()}, {blk.upper()})")
                return plot_by_unit_block[(unit.upper(), blk.upper())]

            # IMPORTANT: Do NOT fall through to unit-only matching when block is specified
            # If block is specified but no match found, return None - don't match wrong block
            print(f"DEBUG SYNC: No exact match for unit={unit}, block={blk} - NOT falling back to unit-only")
            return None

        # Strategy 2: Try just unit number ONLY when inventory has NO block
        # This is safe because we know the inventory doesn't have a block requirement
        if unit in plot_by_name:
            print(f"DEBUG SYNC: Unit-only match (no block in inventory): {unit}")
            return plot_by_name[unit]
        if unit.upper() in plot_by_name:
            print(f"DEBUG SYNC: Unit-only match (upper, no block): {unit.upper()}")
            return plot_by_name[unit.upper()]
        if unit in plot_by_unit_only:
            print(f"DEBUG SYNC: Unit-only from simple plots: {unit}")
            return plot_by_unit_only[unit]
        if unit.upper() in plot_by_unit_only:
            print(f"DEBUG SYNC: Unit-only from simple plots (upper): {unit.upper()}")
            return plot_by_unit_only[unit.upper()]

        return None

    # Build annotation arrays
    sold_plot_ids = []
    sold_plot_nums = []
    available_plot_ids = []
    available_plot_nums = []
    matched_items = []
    unmatched_items = []

    for item in inventory_items:
        unit_num = item.unit_number
        block = item.block or ''

        if not unit_num:
            continue

        plot_data = find_matching_plot(item)  # Pass full item for inventory_id lookup

        # Check if this item is SOLD - STRICT matching to prevent cross-block contamination
        # When item has a block, we ONLY check the composite identifier
        item_unit = unit_num.strip().upper()
        item_block = block.strip().upper() if block else ''
        item_identifier = f"{item_unit}-{item_block}" if item_block else item_unit

        is_sold = (
            item.inventory_id in sold_inventory_ids or  # By inventory_id (from transactions) - most reliable
            (item.status and item.status.lower() == 'sold') or  # By status field
            item_identifier in sold_identifiers  # By exact identifier (composite if has block, unit-only otherwise)
            # NOTE: We do NOT fallback to unit-only when block is present - prevents cross-block matching
        )

        if plot_data and is_sold:
            print(f"DEBUG SYNC: Item {item.inventory_id} ({unit_num}) is SOLD, matched to plot {plot_data['n']}")

        if plot_data:
            matched_items.append({
                'unit': unit_num,
                'block': block,
                'plot_id': plot_data['id'],
                'plot_name': plot_data['n'],
                'status': 'sold' if is_sold else 'available'
            })
            if is_sold:
                sold_plot_ids.append(plot_data['id'])
                sold_plot_nums.append(plot_data['n'])
            else:
                available_plot_ids.append(plot_data['id'])
                available_plot_nums.append(plot_data['n'])
        else:
            unmatched_items.append({
                'unit': unit_num,
                'block': block,
                'status': 'sold' if is_sold else 'available',
                'reason': 'No matching plot found in Vector map'
            })

    print(f"DEBUG SYNC: Matched {len(matched_items)} items, {len(unmatched_items)} unmatched")
    if unmatched_items[:5]:
        print(f"DEBUG SYNC: Sample unmatched: {unmatched_items[:5]}")

    # Check if this is still a "raw" link (no inventory/transactions in ORBIT yet)
    is_raw_link = len(inventory_items) == 0 and len(transactions) == 0

    if is_raw_link:
        return {
            "message": f"Linked but awaiting ORBIT data. {len(plots)} Vector plots available.",
            "isAwaitingData": True,
            "needsReconciliation": False,
            "statusMapId": None,
            "customerMapId": None
        }

    # ========================================
    # CREATE/UPDATE AUTO-GENERATED PROJECTS
    # ========================================
    current_time = int(time.time() * 1000)

    # Get existing auto-generated project IDs from MASTER project metadata
    # Re-query master project to get fresh data from DB
    db.refresh(master_project)

    auto_gen_metadata = master_project.vector_metadata.get('auto_generated_maps', {}) if master_project.vector_metadata else {}
    status_map_id = auto_gen_metadata.get('status_map_id')
    customer_map_id = auto_gen_metadata.get('customer_map_id')

    print(f"DEBUG SYNC: Looking for existing auto-generated maps in master project {master_project.id}")
    print(f"DEBUG SYNC: auto_gen_metadata = {auto_gen_metadata}")
    print(f"DEBUG SYNC: Existing status_map_id = {status_map_id}, customer_map_id = {customer_map_id}")

    # Build inventory data for legend calculations
    # KEY FIX: Build inventory using PLOT NAMES (plot.n) as keys, not ORBIT unit-block
    # This ensures LegendPanel can look up vectorState.inventory[plot.n]
    inventory_for_legend = {}

    # First, build a lookup from inventory_id to inventory data
    inv_id_to_data = {}
    for item in inventory_items:
        unit = item.unit_number.strip() if item.unit_number else ''
        blk = item.block.strip() if item.block else ''

        area_marla = float(item.area_marla) if item.area_marla else 0
        rate_per_marla = float(item.rate_per_marla) if item.rate_per_marla else 0
        total_value = area_marla * rate_per_marla

        # Get customer name from transaction if sold
        customer_name = None
        if item.status and item.status.lower() == 'sold':
            txn = next((t for t in transactions if t.inventory_id == item.id), None)
            if txn and txn.customer_id:
                customer = db.query(Customer).filter(Customer.id == txn.customer_id).first()
                if customer:
                    customer_name = customer.name

        inv_data = {
            'marla': area_marla,
            'totalValue': total_value,
            'rate': rate_per_marla,
            'status': item.status or 'available',
            'block': blk,
            'unitNumber': unit,
            'inventoryId': item.inventory_id,
            'customer': customer_name
        }

        # Store by inventory_id for reconciliation lookup
        if item.inventory_id:
            inv_id_to_data[item.inventory_id] = inv_data
            inv_id_to_data[item.inventory_id.upper()] = inv_data
            inv_id_to_data[item.inventory_id.lower()] = inv_data

        # Also store by unit-block combo for fallback
        orbit_key = f"{unit}-{blk}" if blk else unit
        inv_id_to_data[orbit_key] = inv_data
        inv_id_to_data[orbit_key.upper()] = inv_data

    print(f"DEBUG SYNC: Built inv_id_to_data with {len(inv_id_to_data)} entries")

    # Now build inventory_for_legend using PLOT NAMES from the reconciliation mapping
    # This maps Vector plot names to ORBIT inventory data
    plot_inv_mapping = master_project.vector_metadata.get('plot_inventory_mapping', {}) if master_project.vector_metadata else {}
    print(f"DEBUG SYNC: Found {len(plot_inv_mapping)} reconciliation mappings")

    # For each plot, try to find its inventory data
    for plot in plots:
        plot_name = plot.get('n', '')
        plot_id = plot.get('id', '')
        if not plot_name:
            continue

        inv_data = None

        # Strategy 1: Use reconciliation mapping (plot_id -> inventory_id)
        if plot_id in plot_inv_mapping:
            mapping = plot_inv_mapping[plot_id]
            inv_id = mapping.get('inventory_id', '')
            if inv_id and inv_id in inv_id_to_data:
                inv_data = inv_id_to_data[inv_id]
                print(f"DEBUG SYNC: Plot {plot_name} matched via reconciliation to {inv_id}")

        # Strategy 2: Try direct match by plot name
        if not inv_data:
            if plot_name in inv_id_to_data:
                inv_data = inv_id_to_data[plot_name]
            elif plot_name.upper() in inv_id_to_data:
                inv_data = inv_id_to_data[plot_name.upper()]

        # Strategy 3: Parse plot name and try unit-block variations
        if not inv_data and '-' in plot_name:
            parts = plot_name.split('-', 1)
            if len(parts) == 2:
                # Try "unit-block" format
                for key in [f"{parts[0]}-{parts[1]}", f"{parts[1]}-{parts[0]}"]:
                    if key in inv_id_to_data:
                        inv_data = inv_id_to_data[key]
                        break
                    if key.upper() in inv_id_to_data:
                        inv_data = inv_id_to_data[key.upper()]
                        break

        if inv_data:
            inventory_for_legend[plot_name] = inv_data

    print(f"DEBUG SYNC: Built inventory_for_legend with {len(inventory_for_legend)} entries (by plot name)")
    if inventory_for_legend:
        sample_keys = list(inventory_for_legend.keys())[:5]
        print(f"DEBUG SYNC: Sample inventory keys (plot names): {sample_keys}")

    # Base metadata for auto-generated projects (copy from MASTER project)
    base_plots = plots.copy()  # Same plots as master
    base_metadata = {
        'plots': base_plots,
        'plotOffsets': master_project.vector_metadata.get('plotOffsets', {}) if master_project.vector_metadata else {},
        'plotRotations': master_project.vector_metadata.get('plotRotations', {}) if master_project.vector_metadata else {},
        'inventory': inventory_for_legend,  # Include inventory for legend calculations
        'isAutoGenerated': True,
        'sourceProjectId': str(master_project.id),
        'sourceProjectName': master_project.name,
        'lastSyncAt': datetime.utcnow().isoformat()
    }

    # ========================================
    # 1. STATUS MAP (SOLD vs AVAILABLE)
    # ========================================
    status_annotations = []

    # SOLD annotation (red)
    if sold_plot_ids:
        status_annotations.append({
            "id": f"status_sold_{current_time}",
            "note": "SOLD",
            "cat": "SOLD",
            "color": "#ef4444",  # Red
            "plotIds": sold_plot_ids,
            "plotNums": sold_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True,
            "source": "ORBIT"
        })

    # AVAILABLE annotation (green)
    if available_plot_ids:
        status_annotations.append({
            "id": f"status_available_{current_time}",
            "note": "AVAILABLE",
            "cat": "AVAILABLE",
            "color": "#22c55e",  # Green
            "plotIds": available_plot_ids,
            "plotNums": available_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True,
            "source": "ORBIT"
        })

    status_metadata = {
        **base_metadata,
        'annos': status_annotations,
        'mapType': 'status'
    }

    # Create or update Status Map project
    if status_map_id:
        # Update existing
        status_project = db.query(VectorProject).filter(VectorProject.id == uuid.UUID(status_map_id)).first()
        if status_project:
            status_project.vector_metadata = status_metadata
            status_project.updated_at = func.now()
            print(f"DEBUG SYNC: Updated Status Map project {status_map_id}")
        else:
            status_map_id = None  # Project was deleted, create new

    if not status_map_id:
        # Create new Status Map project (using MASTER project's data)
        status_project = VectorProject(
            name=f"{master_project.name} - Status [Auto]",
            map_name=master_project.map_name,
            map_pdf_base64=master_project.map_pdf_base64,
            map_size=master_project.map_size,
            linked_project_id=master_project.linked_project_id,
            vector_metadata=status_metadata
        )
        db.add(status_project)
        db.flush()  # Get the ID
        status_map_id = str(status_project.id)
        print(f"DEBUG SYNC: Created Status Map project {status_map_id}")

    # ========================================
    # 2. CUSTOMER MAP (Customer-wise breakdown)
    # ========================================

    # Build customer -> plots mapping from transactions
    customer_plots = {}  # customer_name -> {plot_ids: [], plot_nums: []}

    # Get transaction details with customer names
    for txn in transactions:
        customer = db.query(Customer).filter(Customer.id == txn.customer_id).first()
        customer_name = customer.name if customer else "Unknown Customer"

        # Find the plot for this transaction
        inv_item = db.query(Inventory).filter(Inventory.id == txn.inventory_id).first()
        if inv_item:
            plot_data = find_matching_plot(inv_item)
            if plot_data:
                if customer_name not in customer_plots:
                    customer_plots[customer_name] = {'plot_ids': [], 'plot_nums': []}
                customer_plots[customer_name]['plot_ids'].append(plot_data['id'])
                customer_plots[customer_name]['plot_nums'].append(plot_data['n'])

    # Generate unique colors for each customer
    customer_names = list(customer_plots.keys())
    customer_colors = generate_unique_colors(len(customer_names) + 1)  # +1 for AVAILABLE

    customer_annotations = []

    # Add annotation for each customer
    for idx, customer_name in enumerate(customer_names):
        data = customer_plots[customer_name]
        if data['plot_ids']:
            customer_annotations.append({
                "id": f"customer_{idx}_{current_time}",
                "note": customer_name,
                "cat": customer_name,
                "color": customer_colors[idx],
                "plotIds": data['plot_ids'],
                "plotNums": data['plot_nums'],
                "fontSize": 10,
                "rotation": 0,
                "isAutoGenerated": True,
                "source": "ORBIT",
                "customerName": customer_name
            })

    # Add AVAILABLE annotation (for unsold plots)
    if available_plot_ids:
        customer_annotations.append({
            "id": f"customer_available_{current_time}",
            "note": "AVAILABLE",
            "cat": "AVAILABLE",
            "color": "#22c55e",  # Green for available
            "plotIds": available_plot_ids,
            "plotNums": available_plot_nums,
            "fontSize": 10,
            "rotation": 0,
            "isAutoGenerated": True,
            "source": "ORBIT"
        })

    customer_metadata = {
        **base_metadata,
        'annos': customer_annotations,
        'mapType': 'customer',
        'customerCount': len(customer_names)
    }

    # Create or update Customer Map project
    if customer_map_id:
        # Update existing
        customer_project = db.query(VectorProject).filter(VectorProject.id == uuid.UUID(customer_map_id)).first()
        if customer_project:
            customer_project.vector_metadata = customer_metadata
            customer_project.updated_at = func.now()
            print(f"DEBUG SYNC: Updated Customer Map project {customer_map_id}")
        else:
            customer_map_id = None  # Project was deleted, create new

    if not customer_map_id:
        # Create new Customer Map project (using MASTER project's data)
        customer_project = VectorProject(
            name=f"{master_project.name} - Customers [Auto]",
            map_name=master_project.map_name,
            map_pdf_base64=master_project.map_pdf_base64,
            map_size=master_project.map_size,
            linked_project_id=master_project.linked_project_id,
            vector_metadata=customer_metadata
        )
        db.add(customer_project)
        db.flush()
        customer_map_id = str(customer_project.id)
        print(f"DEBUG SYNC: Created Customer Map project {customer_map_id}")

    # ========================================
    # 3. AUTOMATED MASTER (Copy of master with ORBIT updates)
    # ========================================
    # This preserves master's annotations but enriches them with ORBIT status data
    # Any changes to master annotations are synced to this copy

    auto_master_map_id = auto_gen_metadata.get('auto_master_map_id')

    # Get master's original annotations (preserve exact structure)
    master_annos = master_project.vector_metadata.get('annos', []) if master_project.vector_metadata else []

    # Create enriched annotations - copy master annotations and add ORBIT status info
    enriched_annotations = []

    # Build plot_id -> sold status lookup
    sold_plot_id_set = set(sold_plot_ids)

    for anno in master_annos:
        # Deep copy the annotation
        enriched_anno = dict(anno)

        # Enrich plotIds with sold status counts
        anno_sold_count = 0
        anno_available_count = 0
        for pid in anno.get('plotIds', []):
            if pid in sold_plot_id_set:
                anno_sold_count += 1
            else:
                anno_available_count += 1

        # Add ORBIT status info to annotation note (optional enhancement)
        enriched_anno['orbitStats'] = {
            'soldCount': anno_sold_count,
            'availableCount': anno_available_count,
            'totalCount': len(anno.get('plotIds', []))
        }

        enriched_annotations.append(enriched_anno)

    # Also include master's labels, shapes, etc.
    master_labels = master_project.vector_metadata.get('labels', []) if master_project.vector_metadata else []
    master_shapes = master_project.vector_metadata.get('shapes', []) if master_project.vector_metadata else []

    auto_master_metadata = {
        **base_metadata,
        'annos': enriched_annotations,
        'labels': master_labels,
        'shapes': master_shapes,
        'mapType': 'auto_master',
        'preservesMasterAnnotations': True,
        'masterSyncedAt': datetime.utcnow().isoformat()
    }

    # Create or update Automated Master project
    if auto_master_map_id:
        auto_master_project = db.query(VectorProject).filter(VectorProject.id == uuid.UUID(auto_master_map_id)).first()
        if auto_master_project:
            auto_master_project.vector_metadata = auto_master_metadata
            auto_master_project.updated_at = func.now()
            print(f"DEBUG SYNC: Updated Automated Master project {auto_master_map_id}")
        else:
            auto_master_map_id = None

    if not auto_master_map_id:
        auto_master_project = VectorProject(
            name=f"{master_project.name} - Master [Auto]",
            map_name=master_project.map_name,
            map_pdf_base64=master_project.map_pdf_base64,
            map_size=master_project.map_size,
            linked_project_id=master_project.linked_project_id,
            vector_metadata=auto_master_metadata
        )
        db.add(auto_master_project)
        db.flush()
        auto_master_map_id = str(auto_master_project.id)
        print(f"DEBUG SYNC: Created Automated Master project {auto_master_map_id}")

    # ========================================
    # UPDATE MASTER PROJECT METADATA
    # ========================================
    # Store references to auto-generated maps in MASTER project (not auto-generated ones)
    from sqlalchemy.orm.attributes import flag_modified

    if not master_project.vector_metadata:
        master_project.vector_metadata = {}

    new_metadata = dict(master_project.vector_metadata)
    new_metadata['auto_generated_maps'] = {
        'status_map_id': status_map_id,
        'customer_map_id': customer_map_id,
        'auto_master_map_id': auto_master_map_id,
        'last_sync_at': datetime.utcnow().isoformat()
    }
    master_project.vector_metadata = new_metadata
    flag_modified(master_project, 'vector_metadata')
    master_project.updated_at = func.now()

    print(f"DEBUG SYNC: Saving auto_generated_maps to master project: status={status_map_id}, customer={customer_map_id}")

    # Update reconciliation record (always on MASTER project)
    master_project_uuid = master_project.id
    recon = db.query(VectorReconciliation).filter(VectorReconciliation.project_id == master_project_uuid).first()
    sync_status = "needs_reconciliation" if unmatched_items else "synced"
    if recon:
        recon.last_sync_at = datetime.utcnow()
        recon.sync_status = sync_status
        recon.discrepancies = {"unmatched": unmatched_items} if unmatched_items else None
        recon.updated_at = func.now()
    else:
        recon = VectorReconciliation(
            project_id=master_project_uuid,
            linked_project_id=master_project.linked_project_id,
            sync_status=sync_status,
            discrepancies={"unmatched": unmatched_items} if unmatched_items else None,
            last_sync_at=datetime.utcnow()
        )
        db.add(recon)

    db.commit()

    # Verify the auto_generated_maps was saved correctly
    db.refresh(master_project)
    saved_auto_gen = master_project.vector_metadata.get('auto_generated_maps', {}) if master_project.vector_metadata else {}
    print(f"DEBUG SYNC: After commit, auto_generated_maps in DB: {saved_auto_gen}")

    # Build response message
    if unmatched_items:
        message = f"Created/Updated 3 auto-maps: {len(sold_plot_ids)} SOLD + {len(available_plot_ids)} AVAILABLE + Master copy. {len(unmatched_items)} items need reconciliation."
    else:
        message = f"Created/Updated 3 auto-maps: {len(sold_plot_ids)} SOLD ({len(customer_names)} customers) + {len(available_plot_ids)} AVAILABLE + Master copy with {len(master_annos)} annotations."

    return {
        "message": message,
        "statusMapId": status_map_id,
        "customerMapId": customer_map_id,
        "autoMasterMapId": auto_master_map_id,
        "statusMapName": f"{master_project.name} - Status [Auto]",
        "customerMapName": f"{master_project.name} - Customers [Auto]",
        "autoMasterMapName": f"{master_project.name} - Master [Auto]",
        "soldCount": len(sold_plot_ids),
        "availableCount": len(available_plot_ids),
        "customerCount": len(customer_names),
        "masterAnnosCount": len(master_annos),
        "unmatchedCount": len(unmatched_items),
        "isAwaitingData": False,
        "needsReconciliation": len(unmatched_items) > 0
    }


@app.delete("/api/vector/projects/{project_id}/cleanup-auto-maps")
def cleanup_auto_generated_maps(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Delete all auto-generated maps for a master project, keeping only the latest one of each type."""
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")
    if current_user.role != "admin":
        raise HTTPException(403, "Only admin can cleanup auto-generated maps")
    try:
        project_uuid = uuid.UUID(project_id)
        master_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not master_project:
        raise HTTPException(404, "Vector project not found")

    # Find all auto-generated projects that reference this master
    # Use multiple query strategies to catch all duplicates
    auto_projects = []
    seen_ids = set()

    # Strategy 1: Query by sourceProjectId (text extraction)
    try:
        projects_by_source = db.query(VectorProject).filter(
            VectorProject.vector_metadata.op('->>')('sourceProjectId') == str(project_uuid)
        ).all()
        for p in projects_by_source:
            if p.id not in seen_ids:
                auto_projects.append(p)
                seen_ids.add(p.id)
    except Exception as e:
        print(f"DEBUG CLEANUP: Strategy 1 error: {e}")

    # Strategy 2: Query all projects and filter by isAutoGenerated + matching linked_project
    # This catches projects that might have been created with different metadata structure
    try:
        all_vector_projects = db.query(VectorProject).filter(
            VectorProject.linked_project_id == master_project.linked_project_id,
            VectorProject.id != master_project.id
        ).all()
        for p in all_vector_projects:
            if p.id not in seen_ids and p.vector_metadata:
                if p.vector_metadata.get('isAutoGenerated') == True:
                    # Verify it's related to this master (by name pattern or sourceProjectId)
                    source_id = p.vector_metadata.get('sourceProjectId', '')
                    if source_id == str(project_uuid) or source_id == str(master_project.id):
                        auto_projects.append(p)
                        seen_ids.add(p.id)
                    # Also check by name pattern (e.g., "ProjectName - Status [Auto]")
                    elif master_project.name and p.name and master_project.name in p.name and '[Auto]' in p.name:
                        auto_projects.append(p)
                        seen_ids.add(p.id)
    except Exception as e:
        print(f"DEBUG CLEANUP: Strategy 2 error: {e}")

    print(f"DEBUG CLEANUP: Found {len(auto_projects)} auto-generated projects for cleanup")

    # Group by type
    status_maps = []
    customer_maps = []
    auto_master_maps = []

    for proj in auto_projects:
        if proj.vector_metadata:
            map_type = proj.vector_metadata.get('mapType')
            print(f"DEBUG CLEANUP: Project {proj.id} ({proj.name}) - mapType: {map_type}")
            if map_type == 'status':
                status_maps.append(proj)
            elif map_type == 'customer':
                customer_maps.append(proj)
            elif map_type == 'auto_master':
                auto_master_maps.append(proj)

    # Keep only the most recent of each type (by updated_at)
    deleted_count = 0
    kept_status_id = None
    kept_customer_id = None
    kept_auto_master_id = None

    if status_maps:
        status_maps.sort(key=lambda p: p.updated_at or p.created_at, reverse=True)
        kept_status_id = str(status_maps[0].id)
        for proj in status_maps[1:]:
            db.delete(proj)
            deleted_count += 1

    if customer_maps:
        customer_maps.sort(key=lambda p: p.updated_at or p.created_at, reverse=True)
        kept_customer_id = str(customer_maps[0].id)
        for proj in customer_maps[1:]:
            db.delete(proj)
            deleted_count += 1

    if auto_master_maps:
        auto_master_maps.sort(key=lambda p: p.updated_at or p.created_at, reverse=True)
        kept_auto_master_id = str(auto_master_maps[0].id)
        for proj in auto_master_maps[1:]:
            db.delete(proj)
            deleted_count += 1

    # Update master project's auto_generated_maps reference
    if kept_status_id or kept_customer_id or kept_auto_master_id:
        from sqlalchemy.orm.attributes import flag_modified

        if not master_project.vector_metadata:
            master_project.vector_metadata = {}

        new_metadata = dict(master_project.vector_metadata)
        new_metadata['auto_generated_maps'] = {
            'status_map_id': kept_status_id,
            'customer_map_id': kept_customer_id,
            'auto_master_map_id': kept_auto_master_id,
            'last_sync_at': datetime.utcnow().isoformat()
        }
        master_project.vector_metadata = new_metadata
        flag_modified(master_project, 'vector_metadata')

    db.commit()

    return {
        "message": f"Cleaned up {deleted_count} duplicate auto-generated maps",
        "deleted_count": deleted_count,
        "kept_status_map_id": kept_status_id,
        "kept_customer_map_id": kept_customer_id,
        "kept_auto_master_map_id": kept_auto_master_id
    }


# ============================================
# RECONCILIATION ENDPOINTS
# ============================================

@app.get("/api/vector/projects/{project_id}/reconciliation/template")
def download_reconciliation_template(
    project_id: str,
    format: str = Query("xlsx", description="Output format: xlsx or csv"),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Download template for mapping Vector plots to ORBIT inventory.

    The template includes:
    - Sheet 1: Vector plots with empty inventory_id column to fill
    - Sheet 2: ORBIT inventory reference for lookup

    Supports: xlsx (default) or csv
    """
    import io

    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not vector_project:
        raise HTTPException(404, "Vector project not found")

    # Get Vector plots
    plots = vector_project.vector_metadata.get('plots', []) if vector_project.vector_metadata else []

    # Get ORBIT inventory if linked
    orbit_inventory = []
    if vector_project.linked_project_id:
        inventory_items = db.query(Inventory).filter(
            Inventory.project_id == vector_project.linked_project_id
        ).all()
        orbit_inventory = [{
            'inventory_id': item.inventory_id,
            'unit_number': item.unit_number,
            'block': item.block or '',
            'area_marla': float(item.area_marla) if item.area_marla else 0,
            'status': item.status or ''
        } for item in inventory_items]

    from fastapi.responses import StreamingResponse

    if format.lower() == 'xlsx':
        # Generate Excel file with two sheets
        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment

            wb = openpyxl.Workbook()

            # Sheet 1: Mapping (to be filled)
            ws1 = wb.active
            ws1.title = "Mapping"

            # Headers with styling
            headers = ['plot_name', 'plot_id', 'inventory_id']
            header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF")

            for col, header in enumerate(headers, 1):
                cell = ws1.cell(row=1, column=col, value=header)
                cell.fill = header_fill
                cell.font = header_font

            # Add Vector plots
            for row, p in enumerate(plots, 2):
                ws1.cell(row=row, column=1, value=p.get('n', ''))
                ws1.cell(row=row, column=2, value=p.get('id', ''))
                ws1.cell(row=row, column=3, value='')  # Empty for user to fill

            # Adjust column widths
            ws1.column_dimensions['A'].width = 20
            ws1.column_dimensions['B'].width = 45
            ws1.column_dimensions['C'].width = 20

            # Sheet 2: ORBIT Inventory Reference
            ws2 = wb.create_sheet(title="ORBIT_Inventory_Reference")

            ref_headers = ['inventory_id', 'unit_number', 'block', 'area_marla', 'status']
            ref_fill = PatternFill(start_color="70AD47", end_color="70AD47", fill_type="solid")

            for col, header in enumerate(ref_headers, 1):
                cell = ws2.cell(row=1, column=col, value=header)
                cell.fill = ref_fill
                cell.font = header_font

            for row, inv in enumerate(orbit_inventory, 2):
                ws2.cell(row=row, column=1, value=inv['inventory_id'])
                ws2.cell(row=row, column=2, value=inv['unit_number'])
                ws2.cell(row=row, column=3, value=inv['block'])
                ws2.cell(row=row, column=4, value=inv['area_marla'])
                ws2.cell(row=row, column=5, value=inv['status'])

            # Adjust column widths
            for col in ['A', 'B', 'C', 'D', 'E']:
                ws2.column_dimensions[col].width = 15

            # Save to bytes
            output = io.BytesIO()
            wb.save(output)
            output.seek(0)

            filename = f"reconciliation_template_{vector_project.name.replace(' ', '_')}.xlsx"

            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )

        except ImportError:
            # Fallback to CSV if openpyxl not available
            format = 'csv'

    # CSV format fallback
    import csv
    output = io.StringIO()

    output.write("# RECONCILIATION TEMPLATE\n")
    output.write("# Fill in inventory_id for each plot, then upload this file\n")
    output.write("#\n")

    writer = csv.writer(output)
    writer.writerow(['plot_name', 'plot_id', 'inventory_id'])

    for p in plots:
        writer.writerow([p.get('n', ''), p.get('id', ''), ''])

    output.write("\n# === ORBIT INVENTORY REFERENCE ===\n")
    output.write("# inventory_id,unit_number,block,area_marla,status\n")
    for inv in orbit_inventory:
        output.write(f"# {inv['inventory_id']},{inv['unit_number']},{inv['block']},{inv['area_marla']},{inv['status']}\n")

    output.seek(0)
    filename = f"reconciliation_template_{vector_project.name.replace(' ', '_')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.post("/api/vector/projects/{project_id}/reconciliation/upload")
def upload_reconciliation_mapping(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Upload completed reconciliation mapping (CSV or Excel).

    Expected columns:
    plot_name, plot_id, inventory_id

    Supports: .csv, .xlsx, .xls
    """
    import csv
    import io

    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not vector_project:
        raise HTTPException(404, "Vector project not found")

    # Determine file type and parse accordingly
    filename = file.filename.lower() if file.filename else ''
    file_content = file.file.read()

    rows = []

    if filename.endswith('.xlsx') or filename.endswith('.xls'):
        # Parse Excel file
        try:
            import openpyxl
            from io import BytesIO

            wb = openpyxl.load_workbook(BytesIO(file_content), read_only=True)
            ws = wb.active

            # Get headers from first row
            headers = []
            header_map = {}  # Map column index to header name

            for row_idx, row in enumerate(ws.iter_rows(values_only=True)):
                if row_idx == 0:
                    # First row is headers - normalize them
                    for col_idx, cell in enumerate(row):
                        if cell:
                            header = str(cell).strip().lower().replace(' ', '_')
                            headers.append(header)
                            header_map[col_idx] = header
                    continue

                # Skip empty rows
                if not any(row):
                    continue

                # Build row dict
                row_dict = {}
                for col_idx, cell in enumerate(row):
                    if col_idx in header_map:
                        row_dict[header_map[col_idx]] = str(cell).strip() if cell else ''

                if row_dict:
                    rows.append(row_dict)

            print(f"DEBUG UPLOAD: Parsed Excel with {len(rows)} rows, headers: {headers}")

        except ImportError:
            raise HTTPException(400, "Excel support requires openpyxl. Please install it or use CSV format.")
        except Exception as e:
            print(f"DEBUG UPLOAD: Excel parse error: {e}")
            raise HTTPException(400, f"Failed to parse Excel file: {str(e)}")
    else:
        # Parse CSV file
        try:
            content = file_content.decode('utf-8')
            reader = csv.DictReader(
                [line for line in content.split('\n') if line.strip() and not line.strip().startswith('#')]
            )
            rows = list(reader)
            print(f"DEBUG UPLOAD: Parsed CSV with {len(rows)} rows")
        except Exception as e:
            print(f"DEBUG UPLOAD: CSV parse error: {e}")
            raise HTTPException(400, f"Failed to parse CSV file: {str(e)}")

    # Process rows into mappings
    mappings = {}
    valid_count = 0
    skipped_count = 0

    for row in rows:
        # Handle various column name formats
        plot_name = (row.get('plot_name') or row.get('plot name') or row.get('plotname') or '').strip()
        plot_id = (row.get('plot_id') or row.get('plot id') or row.get('plotid') or '').strip()
        inventory_id = (row.get('inventory_id') or row.get('inventory id') or row.get('inventoryid') or
                       row.get('inv_id') or row.get('invid') or '').strip()

        if plot_id and inventory_id:
            mappings[plot_id] = {
                'plot_name': plot_name,
                'inventory_id': inventory_id
            }
            valid_count += 1
        elif plot_id:
            skipped_count += 1

    print(f"DEBUG UPLOAD: Created {valid_count} mappings, skipped {skipped_count}")
    if mappings:
        sample_mapping = list(mappings.items())[:3]
        print(f"DEBUG UPLOAD: Sample mappings: {sample_mapping}")

    # Store mapping in vector_metadata - create NEW dict to force SQLAlchemy to detect change
    # (In-place mutations of JSONB may not be detected even with flag_modified)
    from sqlalchemy.orm.attributes import flag_modified

    existing_metadata = dict(vector_project.vector_metadata) if vector_project.vector_metadata else {}
    existing_metadata['plot_inventory_mapping'] = mappings

    # Assign completely new dict to trigger change detection
    vector_project.vector_metadata = existing_metadata
    flag_modified(vector_project, 'vector_metadata')

    vector_project.updated_at = func.now()

    db.commit()

    # Query fresh from DB to verify the save actually worked
    db.expire(vector_project)  # Clear cached state
    db.refresh(vector_project)  # Refresh from DB

    # Verify the save
    verify_mappings = vector_project.vector_metadata.get('plot_inventory_mapping', {}) if vector_project.vector_metadata else {}
    print(f"DEBUG UPLOAD: Verified {len(verify_mappings)} mappings saved to DB")
    if len(verify_mappings) != valid_count:
        print(f"DEBUG UPLOAD: WARNING - Count mismatch! Expected {valid_count}, got {len(verify_mappings)}")

    return {
        "message": f"Mapping uploaded successfully. {valid_count} plots mapped, {skipped_count} skipped (no inventory_id).",
        "mappedCount": valid_count,
        "skippedCount": skipped_count,
        "mappings": mappings
    }


@app.get("/api/vector/projects/{project_id}/reconciliation/mapping")
def get_reconciliation_mapping(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get current plot-to-inventory mapping."""
    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not vector_project:
        raise HTTPException(404, "Vector project not found")

    mappings = {}
    if vector_project.vector_metadata:
        mappings = vector_project.vector_metadata.get('plot_inventory_mapping', {})
        print(f"DEBUG GET_MAPPING: Found {len(mappings)} mappings in vector_metadata")
    else:
        print(f"DEBUG GET_MAPPING: No vector_metadata found")

    return {
        "mappings": mappings,
        "count": len(mappings)
    }


@app.delete("/api/vector/projects/{project_id}/reconciliation/mapping")
def clear_reconciliation_mapping(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Clear all plot-to-inventory mappings."""
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")
    if current_user.role != "admin":
        raise HTTPException(403, "Only admin can clear reconciliation mappings")
    try:
        project_uuid = uuid.UUID(project_id)
        vector_project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not vector_project:
        raise HTTPException(404, "Vector project not found")

    if vector_project.vector_metadata and 'plot_inventory_mapping' in vector_project.vector_metadata:
        del vector_project.vector_metadata['plot_inventory_mapping']
        # Force SQLAlchemy to detect the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(vector_project, 'vector_metadata')
        vector_project.updated_at = func.now()
        db.commit()

    return {"message": "Mapping cleared successfully"}


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

@app.get("/api/vector/orphan-tracking")
def get_orphan_tracking(
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get orphan projects - Vector projects without ORBIT links and vice versa"""
    # Available to all authenticated users (read-only)

    # Get all Vector projects
    vector_projects = db.query(VectorProject).all()

    # Get all ORBIT projects
    orbit_projects = db.query(Project).all()

    # Build a map of ORBIT project ID to linked Vector project for quick lookup
    orbit_to_vector = {}
    for vp in vector_projects:
        if vp.linked_project_id:
            orbit_to_vector[str(vp.linked_project_id)] = {
                "id": str(vp.id),
                "name": vp.name
            }

    # Find Vector projects without ORBIT links (orphan vectors)
    orphan_vectors = []
    linked_vectors = []
    for vp in vector_projects:
        vp_data = {
            "id": str(vp.id),
            "name": vp.name,
            "map_name": vp.map_name,
            "created_at": str(vp.created_at),
            "has_map": bool(vp.map_pdf_base64),
            "type": "vector"
        }
        if not vp.linked_project_id:
            orphan_vectors.append(vp_data)
        else:
            # Find linked ORBIT project name
            linked_orbit = db.query(Project).filter(Project.id == vp.linked_project_id).first()
            vp_data["linked_orbit_id"] = str(vp.linked_project_id)
            vp_data["linked_orbit_name"] = linked_orbit.name if linked_orbit else "Unknown"
            linked_vectors.append(vp_data)

    # Find ORBIT projects without Vector links (orphan orbit)
    orphan_orbit = []
    linked_orbit = []
    for op in orbit_projects:
        inventory_count = db.query(Inventory).filter(Inventory.project_id == op.id).count()
        transaction_count = db.query(Transaction).filter(Transaction.project_id == op.id).count()
        op_data = {
            "id": str(op.id),
            "name": op.name,
            "project_id": op.project_id,
            "created_at": str(op.created_at),
            "inventory_count": inventory_count,
            "transaction_count": transaction_count,
            "type": "orbit"
        }

        # Check if this ORBIT project is linked to a Vector project
        linked_vector = orbit_to_vector.get(str(op.id))
        if linked_vector:
            op_data["linked_vector_id"] = linked_vector["id"]
            op_data["linked_vector_name"] = linked_vector["name"]
            linked_orbit.append(op_data)
        else:
            orphan_orbit.append(op_data)

    return {
        "orphan_vectors": orphan_vectors,
        "orphan_orbit": orphan_orbit,
        "linked_vectors": linked_vectors,
        "linked_orbit": linked_orbit,
        "total_orphan_vectors": len(orphan_vectors),
        "total_orphan_orbit": len(orphan_orbit),
        "total_linked": len(linked_vectors),
        "total_orphans": len(orphan_vectors) + len(orphan_orbit)
    }

@app.get("/api/vector/link-suggestions")
def get_link_suggestions(
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Suggest potential links between orphan Vector and ORBIT projects based on name similarity"""
    # Available to all authenticated users

    # Get orphan Vector projects
    vector_projects = db.query(VectorProject).filter(VectorProject.linked_project_id == None).all()

    # Get orphan ORBIT projects (not linked to any Vector project)
    linked_orbit_ids = [str(vp.linked_project_id) for vp in db.query(VectorProject).filter(VectorProject.linked_project_id != None).all()]
    orbit_projects = db.query(Project).filter(~Project.id.in_(linked_orbit_ids) if linked_orbit_ids else True).all()

    suggestions = []

    for vp in vector_projects:
        vp_name = (vp.name or '').lower()
        for op in orbit_projects:
            op_name = (op.name or '').lower()

            # Check if names are similar (simple substring match)
            if vp_name and op_name and (vp_name in op_name or op_name in vp_name):
                suggestions.append({
                    "vector_project": {
                        "id": str(vp.id),
                        "name": vp.name
                    },
                    "orbit_project": {
                        "id": str(op.id),
                        "name": op.name
                    },
                    "confidence": "high" if vp_name == op_name else "medium"
                })

    return {
        "suggestions": suggestions,
        "total": len(suggestions)
    }

# ============================================
# NOTIFICATION API
# ============================================
@app.get("/api/notifications")
def list_notifications(limit: int = 50, db: Session = Depends(get_db),
                       current_user: CompanyRep = Depends(get_current_user)):
    notifs = db.query(Notification).filter(
        Notification.user_rep_id == current_user.rep_id
    ).order_by(Notification.created_at.desc()).limit(limit).all()
    return [{
        "id": n.id, "notification_id": n.notification_id,
        "title": n.title, "message": n.message, "type": n.type,
        "category": n.category, "entity_type": n.entity_type,
        "entity_id": n.entity_id, "is_read": bool(n.is_read),
        "data": n.data or {}, "created_at": str(n.created_at),
        "read_at": str(n.read_at) if n.read_at else None
    } for n in notifs]

@app.get("/api/notifications/unread")
def get_unread_notifications(db: Session = Depends(get_db),
                              current_user: CompanyRep = Depends(get_current_user)):
    notifs = db.query(Notification).filter(
        Notification.user_rep_id == current_user.rep_id,
        Notification.is_read == False
    ).order_by(Notification.created_at.desc()).limit(20).all()
    count = db.query(Notification).filter(
        Notification.user_rep_id == current_user.rep_id,
        Notification.is_read == False
    ).count()
    return {
        "count": count,
        "notifications": [{
            "id": n.id, "notification_id": n.notification_id,
            "title": n.title, "message": n.message, "type": n.type,
            "category": n.category, "data": n.data or {},
            "created_at": str(n.created_at)
        } for n in notifs]
    }

@app.post("/api/notifications/{nid}/read")
def mark_notification_read(nid: int, db: Session = Depends(get_db),
                           current_user: CompanyRep = Depends(get_current_user)):
    n = db.query(Notification).filter(
        Notification.id == nid,
        Notification.user_rep_id == current_user.rep_id
    ).first()
    if not n: raise HTTPException(404, "Notification not found")
    n.is_read = True
    n.read_at = datetime.utcnow()
    db.commit()
    return {"message": "Marked as read"}

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(db: Session = Depends(get_db),
                                 current_user: CompanyRep = Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.user_rep_id == current_user.rep_id,
        Notification.is_read == False
    ).update({"is_read": True, "read_at": datetime.utcnow()}, synchronize_session="fetch")
    db.commit()
    return {"message": "All notifications marked as read"}

# ============================================
# DUPLICATE CHECK API
# ============================================
@app.get("/api/duplicate-check")
def duplicate_check(mobile: str = None, db: Session = Depends(get_db),
                    current_user: CompanyRep = Depends(get_current_user)):
    if not mobile:
        return {"found": False, "matches": []}
    matches = check_duplicate_mobile(db, mobile)
    return {"found": len(matches) > 0, "matches": matches}

# ============================================
# UNIFIED SEARCH API
# ============================================
@app.get("/api/search/unified")
def unified_search(q: str = "", search_type: str = "mobile",
                   db: Session = Depends(get_db),
                   current_user: CompanyRep = Depends(get_current_user)):
    if not q or len(q) < 2:
        return {"results": []}

    results = []
    seen_ids = set()  # Deduplicate results from multi-transaction JOINs

    if search_type == "mobile":
        normalized = normalize_mobile(q)
        if normalized:
            suffix = normalized[-7:]  # last 7 digits for fuzzy SQL match
            # Strip non-digits in SQL for reliable matching
            stripped_cust_mobile = func.regexp_replace(Customer.mobile, '[^0-9]', '', 'g')
            stripped_lead_mobile = func.regexp_replace(Lead.mobile, '[^0-9]', '', 'g')

            # Search customers via SQL with JOIN for rep
            cust_rows = db.query(Customer, CompanyRep).outerjoin(
                Transaction, Transaction.customer_id == Customer.id
            ).outerjoin(
                CompanyRep, CompanyRep.id == Transaction.company_rep_id
            ).filter(
                Customer.mobile.isnot(None),
                stripped_cust_mobile.like(f"%{suffix}%")
            ).all()
            for c, rep in cust_rows:
                if str(c.id) in seen_ids:
                    continue
                if normalize_mobile(c.mobile) == normalized:
                    seen_ids.add(str(c.id))
                    results.append({
                        "type": "customer", "id": str(c.id), "entity_id": c.customer_id,
                        "name": c.name, "mobile": c.mobile,
                        "owner_rep": rep.name if rep else None,
                        "owner_rep_id": rep.rep_id if rep else None
                    })
            # Search leads via SQL with JOIN for rep
            lead_rows = db.query(Lead, CompanyRep).outerjoin(
                CompanyRep, CompanyRep.id == Lead.assigned_rep_id
            ).filter(
                Lead.status != "converted",
                Lead.mobile.isnot(None),
                stripped_lead_mobile.like(f"%{suffix}%")
            ).all()
            for l, rep in lead_rows:
                if normalize_mobile(l.mobile) == normalized:
                    results.append({
                        "type": "lead", "id": str(l.id), "entity_id": l.lead_id,
                        "name": l.name, "mobile": l.mobile,
                        "pipeline_stage": l.pipeline_stage,
                        "owner_rep": rep.name if rep else None,
                        "owner_rep_id": rep.rep_id if rep else None
                    })
    else:
        # Name search via SQL ILIKE
        cust_rows = db.query(Customer, CompanyRep).outerjoin(
            Transaction, Transaction.customer_id == Customer.id
        ).outerjoin(
            CompanyRep, CompanyRep.id == Transaction.company_rep_id
        ).filter(
            Customer.name.ilike(f"%{q}%")
        ).all()
        for c, rep in cust_rows:
            if str(c.id) in seen_ids:
                continue
            seen_ids.add(str(c.id))
            results.append({
                "type": "customer", "id": str(c.id), "entity_id": c.customer_id,
                "name": c.name, "mobile": c.mobile,
                "owner_rep": rep.name if rep else None,
                "owner_rep_id": rep.rep_id if rep else None
            })
        lead_rows = db.query(Lead, CompanyRep).outerjoin(
            CompanyRep, CompanyRep.id == Lead.assigned_rep_id
        ).filter(
            Lead.status != "converted",
            Lead.name.ilike(f"%{q}%")
        ).all()
        for l, rep in lead_rows:
            results.append({
                "type": "lead", "id": str(l.id), "entity_id": l.lead_id,
                "name": l.name, "mobile": l.mobile,
                "pipeline_stage": l.pipeline_stage,
                "owner_rep": rep.name if rep else None,
                "owner_rep_id": rep.rep_id if rep else None
            })

    # Log search if results found belonging to another rep, aggregate notifications per owner
    owner_results = {}  # owner_rep_id -> list of result names
    for r in results:
        if r.get("owner_rep_id") and r["owner_rep_id"] != current_user.rep_id:
            # Log each search hit individually
            log = SearchLog(
                searcher_rep_id=current_user.rep_id,
                search_query=q,
                search_type=search_type,
                matched_entity_type=r["type"],
                matched_entity_id=r["entity_id"],
                matched_entity_name=r["name"],
                owner_rep_id=r["owner_rep_id"]
            )
            db.add(log)
            # Aggregate for notification
            owner_id = r["owner_rep_id"]
            if owner_id not in owner_results:
                owner_results[owner_id] = []
            owner_results[owner_id].append(r["name"])
    # Send one aggregated notification per owner rep
    for owner_id, names in owner_results.items():
        count = len(names)
        preview = ", ".join(names[:3])
        if count > 3:
            preview += f" (+{count - 3} more)"
        create_notification(
            db, owner_id, "search_alert",
            f"{current_user.name} searched your records ({count} found)",
            f"{current_user.name} ({current_user.rep_id}) searched for '{q}' — matched: {preview}",
            category="search_alert",
            data={"searcher_rep_id": current_user.rep_id, "searcher_name": current_user.name, "match_count": count}
        )
    if owner_results:
        try:
            db.commit()
        except Exception as e:
            print(f"[WARN] Search log commit failed: {e}")
            db.rollback()

    return {"results": results}

@app.get("/api/search-log")
def get_search_log(limit: int = 50, db: Session = Depends(get_db),
                   current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    logs = db.query(SearchLog).order_by(SearchLog.created_at.desc()).limit(limit).all()
    return [{
        "id": str(l.id), "searcher_rep_id": l.searcher_rep_id,
        "search_query": l.search_query, "search_type": l.search_type,
        "matched_entity_type": l.matched_entity_type,
        "matched_entity_id": l.matched_entity_id,
        "matched_entity_name": l.matched_entity_name,
        "owner_rep_id": l.owner_rep_id,
        "created_at": str(l.created_at)
    } for l in logs]

# ============================================
# PIPELINE STAGES API
# ============================================
@app.get("/api/pipeline-stages")
def list_pipeline_stages(db: Session = Depends(get_db),
                         current_user: CompanyRep = Depends(get_current_user)):
    stages = db.query(PipelineStage).order_by(PipelineStage.display_order).all()
    return [{
        "id": str(s.id), "name": s.name, "display_order": s.display_order,
        "color": s.color, "is_terminal": bool(s.is_terminal),
        "created_at": str(s.created_at)
    } for s in stages]

@app.post("/api/pipeline-stages")
def create_pipeline_stage(data: dict, db: Session = Depends(get_db),
                          current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    s = PipelineStage(
        name=data["name"],
        display_order=data.get("display_order", 99),
        color=data.get("color", "#6B7280"),
        is_terminal=bool(data.get("is_terminal", False))
    )
    db.add(s); db.commit(); db.refresh(s)
    return {"message": "Stage created", "id": str(s.id)}

@app.put("/api/pipeline-stages/{sid}")
def update_pipeline_stage(sid: str, data: dict, db: Session = Depends(get_db),
                          current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    s = db.query(PipelineStage).filter(PipelineStage.id == sid).first()
    if not s: raise HTTPException(404, "Stage not found")
    for k in ["name", "display_order", "color"]:
        if k in data: setattr(s, k, data[k])
    if "is_terminal" in data:
        s.is_terminal = bool(data["is_terminal"])
    db.commit()
    return {"message": "Stage updated"}

@app.delete("/api/pipeline-stages/{sid}")
def delete_pipeline_stage(sid: str, data: dict = {}, db: Session = Depends(get_db),
                          current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    s = db.query(PipelineStage).filter(PipelineStage.id == sid).first()
    if not s: raise HTTPException(404, "Stage not found")
    # Don't delete if leads exist in this stage
    count = db.query(Lead).filter(Lead.pipeline_stage == s.name).count()
    if count > 0:
        raise HTTPException(400, f"Cannot delete stage with {count} leads. Move leads first.")
    db.delete(s); db.commit()
    return {"message": "Stage deleted"}

# ============================================
# LOOKUP VALUES API (admin-managed dropdowns)
# ============================================
@app.get("/api/lookup-values")
def list_lookup_values(category: str = None, db: Session = Depends(get_db),
                       current_user: CompanyRep = Depends(get_current_user)):
    q = db.query(LookupValue).filter(LookupValue.is_active == True)
    if category:
        q = q.filter(LookupValue.category == category)
    values = q.order_by(LookupValue.category, LookupValue.sort_order).all()
    return [{
        "id": str(v.id), "category": v.category, "label": v.label,
        "sort_order": v.sort_order, "is_active": v.is_active,
        "created_at": str(v.created_at)
    } for v in values]

@app.post("/api/lookup-values")
def create_lookup_value(data: dict, db: Session = Depends(get_db),
                        current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    existing = db.query(LookupValue).filter(
        LookupValue.category == data["category"],
        LookupValue.label == data["label"]
    ).first()
    if existing:
        raise HTTPException(400, f"Value '{data['label']}' already exists in '{data['category']}'")
    v = LookupValue(
        category=data["category"],
        label=data["label"],
        sort_order=data.get("sort_order", 99)
    )
    db.add(v); db.commit(); db.refresh(v)
    return {"message": "Value created", "id": str(v.id)}

@app.put("/api/lookup-values/{vid}")
def update_lookup_value(vid: str, data: dict, db: Session = Depends(get_db),
                        current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    v = db.query(LookupValue).filter(LookupValue.id == vid).first()
    if not v: raise HTTPException(404, "Value not found")
    for k in ["label", "sort_order", "is_active"]:
        if k in data: setattr(v, k, data[k])
    db.commit()
    return {"message": "Value updated"}

@app.delete("/api/lookup-values/{vid}")
def delete_lookup_value(vid: str, db: Session = Depends(get_db),
                        current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    v = db.query(LookupValue).filter(LookupValue.id == vid).first()
    if not v: raise HTTPException(404, "Value not found")
    db.delete(v); db.commit()
    return {"message": "Value deleted"}

# ============================================
# LEAD PIPELINE API
# ============================================
@app.get("/api/leads/pipeline")
def get_leads_pipeline(rep_id: str = None, campaign_id: str = None,
                       stale_only: bool = False, db: Session = Depends(get_db),
                       current_user: CompanyRep = Depends(get_current_user)):
    # User role only sees their own leads
    effective_rep_id = None
    if current_user.role == "user":
        effective_rep_id = current_user.id
    elif rep_id:
        r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
        if r: effective_rep_id = r.id

    # Include active leads + recently Won/Lost (last 90 days) so they appear in terminal stages
    cutoff = datetime.utcnow() - timedelta(days=90)
    q = db.query(Lead).filter(
        or_(
            Lead.status.notin_(["converted", "lost"]),
            and_(Lead.status.in_(["converted", "lost"]), Lead.updated_at >= cutoff)
        )
    )
    if effective_rep_id:
        q = q.filter(Lead.assigned_rep_id == effective_rep_id)
    if campaign_id:
        camp = db.query(Campaign).filter((Campaign.id == campaign_id) | (Campaign.campaign_id == campaign_id)).first()
        if camp: q = q.filter(Lead.campaign_id == camp.id)
    if stale_only:
        q = q.filter(Lead.is_stale == True)

    leads = q.order_by(Lead.created_at.desc()).all()

    # Pre-fetch all reps and campaigns to avoid N+1 queries
    rep_ids = set(l.assigned_rep_id for l in leads if l.assigned_rep_id)
    camp_ids = set(l.campaign_id for l in leads if l.campaign_id)
    reps_map = {r.id: r for r in db.query(CompanyRep).filter(CompanyRep.id.in_(rep_ids)).all()} if rep_ids else {}
    camps_map = {c.id: c for c in db.query(Campaign).filter(Campaign.id.in_(camp_ids)).all()} if camp_ids else {}

    # Group by pipeline_stage
    stages = db.query(PipelineStage).order_by(PipelineStage.display_order).all()
    pipeline = {}
    for s in stages:
        pipeline[s.name] = {"stage": s.name, "color": s.color, "is_terminal": bool(s.is_terminal), "leads": [], "count": 0}

    for l in leads:
        rep = reps_map.get(l.assigned_rep_id)
        camp = camps_map.get(l.campaign_id)
        days_since_contact = None
        if l.last_contacted_at:
            days_since_contact = (datetime.utcnow() - l.last_contacted_at).days

        lead_data = {
            "id": str(l.id), "lead_id": l.lead_id, "name": l.name,
            "mobile": l.mobile, "email": l.email,
            "pipeline_stage": l.pipeline_stage or "New",
            "status": l.status, "lead_type": l.lead_type,
            "campaign_name": camp.name if camp else None,
            "campaign_source": camp.source if camp else None,
            "assigned_rep": rep.name if rep else None,
            "assigned_rep_id": rep.rep_id if rep else None,
            "days_since_contact": days_since_contact,
            "is_stale": bool(l.is_stale),
            "converted_customer_id": str(l.converted_customer_id) if l.converted_customer_id else None,
            "converted_broker_id": str(l.converted_broker_id) if l.converted_broker_id else None,
            "notes": l.notes, "created_at": str(l.created_at)
        }

        stage_name = l.pipeline_stage or "New"
        if stage_name in pipeline:
            pipeline[stage_name]["leads"].append(lead_data)
            pipeline[stage_name]["count"] += 1
        else:
            if "New" in pipeline:
                pipeline["New"]["leads"].append(lead_data)
                pipeline["New"]["count"] += 1

    return {"pipeline": list(pipeline.values()), "total": len(leads)}

@app.put("/api/leads/{lid}/stage")
def update_lead_stage(lid: str, data: dict, db: Session = Depends(get_db),
                      current_user: CompanyRep = Depends(get_current_user)):
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")
    # Viewers cannot modify leads
    if current_user.role == "viewer":
        raise HTTPException(403, "Insufficient permissions")
    # Non-privileged roles can only update their own assigned leads
    if current_user.role in ("user", "creator") and l.assigned_rep_id != current_user.id:
        raise HTTPException(403, "You can only update your own leads")
    new_stage = data.get("stage")
    if not new_stage: raise HTTPException(400, "Stage required")
    # Verify stage exists
    stage = db.query(PipelineStage).filter(PipelineStage.name == new_stage).first()
    if not stage: raise HTTPException(400, f"Invalid stage: {new_stage}")
    l.pipeline_stage = new_stage
    # If terminal stage, update status
    if stage.is_terminal:
        if new_stage == "Won":
            l.status = "converted"  # Sale closed
        elif new_stage == "Lost":
            l.status = "lost"
    db.commit()
    return {"message": f"Lead moved to {new_stage}"}

# ============================================
# LEAD ASSIGNMENT API
# ============================================
@app.post("/api/leads/bulk-assign")
def bulk_assign_leads(data: dict, db: Session = Depends(get_db),
                      current_user: CompanyRep = Depends(require_role(["admin", "manager", "cco"]))):
    lead_ids = data.get("lead_ids", [])
    rep_id = data.get("rep_id")
    if not lead_ids or not rep_id:
        raise HTTPException(400, "lead_ids and rep_id required")

    rep = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
    if not rep: raise HTTPException(404, "Rep not found")

    # Batch fetch leads to avoid N+1
    leads = db.query(Lead).filter(
        or_(Lead.id.in_(lead_ids), Lead.lead_id.in_(lead_ids))
    ).all()
    count = 0
    for l in leads:
        l.assigned_rep_id = rep.id
        count += 1

    # Notification + data in single atomic commit
    create_notification(
        db, rep.rep_id, "assignment",
        f"{count} leads assigned to you",
        f"{current_user.name} assigned {count} leads to you",
        category="assignment"
    )
    db.commit()
    return {"message": f"{count} leads assigned to {rep.name}"}

@app.post("/api/leads/{lid}/request-assignment")
def request_lead_assignment(lid: str, data: dict, db: Session = Depends(get_db),
                            current_user: CompanyRep = Depends(get_current_user)):
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")

    # Check if there's already a pending request
    existing = db.query(LeadAssignmentRequest).filter(
        LeadAssignmentRequest.lead_id == l.id,
        LeadAssignmentRequest.requested_by == current_user.id,
        LeadAssignmentRequest.status == "pending"
    ).first()
    if existing:
        raise HTTPException(400, "You already have a pending request for this lead")

    req = LeadAssignmentRequest(
        lead_id=l.id,
        requested_by=current_user.id,
        reason=data.get("reason", "")
    )
    db.add(req); db.commit(); db.refresh(req)

    # Notify admin/cco
    admins = db.query(CompanyRep).filter(CompanyRep.role.in_(["admin", "cco"]), CompanyRep.status == "active").all()
    for admin in admins:
        create_notification(
            db, admin.rep_id, "assignment_request",
            f"{current_user.name} requests lead {l.lead_id}",
            f"{current_user.name} wants to be assigned lead {l.name} ({l.lead_id}). Reason: {data.get('reason', 'N/A')}",
            category="assignment_request",
            entity_type="lead",
            entity_id=l.lead_id
        )
    db.commit()
    return {"message": "Assignment request submitted", "request_id": req.request_id}

@app.get("/api/lead-assignment-requests")
def list_assignment_requests(status: str = "pending", db: Session = Depends(get_db),
                             current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    q = db.query(LeadAssignmentRequest)
    if status:
        q = q.filter(LeadAssignmentRequest.status == status)
    requests = q.order_by(LeadAssignmentRequest.created_at.desc()).all()
    # Pre-fetch related entities to avoid N+1
    lead_ids = set(r.lead_id for r in requests if r.lead_id)
    rep_ids = set(r.requested_by for r in requests) | set(r.reviewed_by for r in requests if r.reviewed_by)
    leads_map = {l.id: l for l in db.query(Lead).filter(Lead.id.in_(lead_ids)).all()} if lead_ids else {}
    reps_map = {r.id: r for r in db.query(CompanyRep).filter(CompanyRep.id.in_(rep_ids)).all()} if rep_ids else {}
    result = []
    for r in requests:
        lead = leads_map.get(r.lead_id)
        requester = reps_map.get(r.requested_by)
        reviewer = reps_map.get(r.reviewed_by)
        result.append({
            "id": str(r.id), "request_id": r.request_id,
            "lead_id": lead.lead_id if lead else None, "lead_name": lead.name if lead else None,
            "requested_by": requester.name if requester else None,
            "requester_rep_id": requester.rep_id if requester else None,
            "reason": r.reason, "status": r.status,
            "reviewed_by": reviewer.name if reviewer else None,
            "reviewed_at": str(r.reviewed_at) if r.reviewed_at else None,
            "created_at": str(r.created_at)
        })
    return result

@app.post("/api/lead-assignment-requests/{rid}/review")
def review_assignment_request(rid: str, data: dict, db: Session = Depends(get_db),
                              current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    req = db.query(LeadAssignmentRequest).filter(
        (LeadAssignmentRequest.id == rid) | (LeadAssignmentRequest.request_id == rid)
    ).first()
    if not req: raise HTTPException(404, "Request not found")
    if req.status != "pending": raise HTTPException(400, "Request is not pending")

    action = data.get("action")  # "approve" or "reject"
    if action == "approve":
        req.status = "approved"
        req.reviewed_by = current_user.id
        req.reviewed_at = datetime.utcnow()

        # Assign the lead
        lead = db.query(Lead).filter(Lead.id == req.lead_id).first()
        if lead:
            lead.assigned_rep_id = req.requested_by

        # Notify requester
        requester = db.query(CompanyRep).filter(CompanyRep.id == req.requested_by).first()
        if requester:
            create_notification(
                db, requester.rep_id, "assignment_approved",
                f"Lead assignment approved",
                f"Your request for lead {lead.lead_id if lead else 'unknown'} ({lead.name if lead else ''}) was approved by {current_user.name}",
                category="assignment"
            )
    elif action == "reject":
        req.status = "rejected"
        req.reviewed_by = current_user.id
        req.reviewed_at = datetime.utcnow()

        requester = db.query(CompanyRep).filter(CompanyRep.id == req.requested_by).first()
        lead = db.query(Lead).filter(Lead.id == req.lead_id).first()
        if requester:
            create_notification(
                db, requester.rep_id, "assignment_rejected",
                f"Lead assignment rejected",
                f"Your request for lead {lead.lead_id if lead else 'unknown'} was rejected by {current_user.name}",
                category="assignment"
            )
    else:
        raise HTTPException(400, "Action must be 'approve' or 'reject'")

    db.commit()
    return {"message": f"Request {action}d"}

# ============================================
# STALE LEAD API
# ============================================
@app.get("/api/leads/stale")
def list_stale_leads(db: Session = Depends(get_db),
                     current_user: CompanyRep = Depends(require_role(["admin", "manager", "cco"]))):
    stale_rows = db.query(Lead, CompanyRep).outerjoin(
        CompanyRep, CompanyRep.id == Lead.assigned_rep_id
    ).filter(
        Lead.is_stale == True,
        Lead.status.notin_(["converted", "lost"])
    ).order_by(Lead.last_contacted_at.asc().nullsfirst()).all()
    result = []
    for l, rep in stale_rows:
        days = None
        if l.last_contacted_at:
            days = (datetime.utcnow() - l.last_contacted_at).days
        result.append({
            "id": str(l.id), "lead_id": l.lead_id, "name": l.name,
            "mobile": l.mobile, "pipeline_stage": l.pipeline_stage,
            "assigned_rep": rep.name if rep else None,
            "assigned_rep_id": rep.rep_id if rep else None,
            "days_since_contact": days,
            "created_at": str(l.created_at)
        })
    return result

@app.post("/api/leads/check-stale")
def check_stale_leads(db: Session = Depends(get_db),
                      current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    """Flag leads with no interaction in 60 days"""
    threshold = datetime.utcnow() - timedelta(days=60)

    # Bulk SQL: flag newly stale (no contact in 60+ days, not already stale)
    newly_stale = db.query(Lead).filter(
        Lead.status.notin_(["converted", "lost"]),
        or_(Lead.last_contacted_at == None, Lead.last_contacted_at < threshold),
        or_(Lead.is_stale == False, Lead.is_stale == None)
    ).update({"is_stale": True}, synchronize_session="fetch")

    # Bulk SQL: unflag recovered leads (contacted recently but still marked stale)
    db.query(Lead).filter(
        Lead.status.notin_(["converted", "lost"]),
        Lead.is_stale == True,
        Lead.last_contacted_at != None,
        Lead.last_contacted_at >= threshold
    ).update({"is_stale": False}, synchronize_session="fetch")

    db.commit()

    # Notify admin/cco about newly stale leads
    if newly_stale > 0:
        admins = db.query(CompanyRep).filter(
            CompanyRep.role.in_(["admin", "cco"]),
            CompanyRep.status == "active"
        ).all()
        for admin in admins:
            create_notification(
                db, admin.rep_id, "stale_lead",
                f"{newly_stale} leads flagged as stale",
                f"{newly_stale} leads have had no interaction in 60+ days and need attention",
                category="stale_lead"
            )
        db.commit()

    return {"message": f"Stale check complete. {newly_stale} newly flagged.", "total_stale": db.query(Lead).filter(Lead.is_stale == True).count()}

@app.post("/api/leads/{lid}/reassign")
def reassign_lead(lid: str, data: dict, db: Session = Depends(get_db),
                  current_user: CompanyRep = Depends(require_role(["admin", "cco"]))):
    l = db.query(Lead).filter((Lead.id == lid) | (Lead.lead_id == lid)).first()
    if not l: raise HTTPException(404, "Lead not found")

    new_rep_id = data.get("rep_id")
    if not new_rep_id: raise HTTPException(400, "rep_id required")

    new_rep = db.query(CompanyRep).filter((CompanyRep.id == new_rep_id) | (CompanyRep.rep_id == new_rep_id)).first()
    if not new_rep: raise HTTPException(404, "Rep not found")

    old_rep = db.query(CompanyRep).filter(CompanyRep.id == l.assigned_rep_id).first() if l.assigned_rep_id else None

    l.assigned_rep_id = new_rep.id

    # Notifications + data in single atomic commit
    create_notification(
        db, new_rep.rep_id, "assignment",
        f"Lead {l.lead_id} assigned to you",
        f"{current_user.name} assigned lead {l.name} ({l.lead_id}) to you",
        category="assignment",
        entity_type="lead",
        entity_id=l.lead_id
    )
    if old_rep:
        create_notification(
            db, old_rep.rep_id, "reassignment",
            f"Lead {l.lead_id} reassigned",
            f"Lead {l.name} ({l.lead_id}) has been reassigned from you to {new_rep.name} by {current_user.name}",
            category="reassignment",
            entity_type="lead",
            entity_id=l.lead_id
        )
    db.commit()
    return {"message": f"Lead reassigned to {new_rep.name}"}


# ============================================
# ANALYTICS ENGINE ENDPOINTS
# ============================================

@app.get("/api/analytics/campaign-metrics")
def analytics_campaign_metrics(
    campaign_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(require_role(["admin", "cco", "manager", "creator"]))
):
    """Comprehensive campaign analytics with funnel, source breakdown, and revenue attribution."""
    try:
        # Build base lead query with optional filters
        lead_q = db.query(Lead)
        if campaign_id:
            camp = db.query(Campaign).filter(
                (Campaign.campaign_id == campaign_id) | (Campaign.id == campaign_id)
            ).first()
            if camp:
                lead_q = lead_q.filter(Lead.campaign_id == camp.id)
        if start_date:
            lead_q = lead_q.filter(Lead.created_at >= start_date)
        if end_date:
            lead_q = lead_q.filter(Lead.created_at <= end_date)

        all_leads = lead_q.all()
        total = len(all_leads)

        # Overall metrics
        converted = sum(1 for l in all_leads if l.status == "converted")
        lost = sum(1 for l in all_leads if l.status == "lost")
        active = total - converted - lost
        conversion_rate = round((converted / total * 100), 1) if total > 0 else 0.0

        # Average days to conversion
        conv_days = []
        for l in all_leads:
            if l.status == "converted" and l.updated_at and l.created_at:
                delta = (l.updated_at - l.created_at).days
                conv_days.append(delta)
        avg_days = round(sum(conv_days) / len(conv_days), 1) if conv_days else 0.0

        # Funnel: count by pipeline_stage, ordered by PipelineStage.display_order
        stages_db = db.query(PipelineStage).order_by(PipelineStage.display_order).all()
        stage_order = {s.name: (s.display_order, s.color) for s in stages_db}
        stage_counts = {}
        for l in all_leads:
            ps = l.pipeline_stage or "New"
            stage_counts[ps] = stage_counts.get(ps, 0) + 1

        funnel = []
        prev_count = total
        for s in stages_db:
            count = stage_counts.pop(s.name, 0)
            pct_total = round(count / total * 100, 1) if total > 0 else 0.0
            pct_prev = round(count / prev_count * 100, 1) if prev_count > 0 else 0.0
            funnel.append({
                "stage": s.name, "count": count, "color": s.color,
                "pct_of_total": pct_total, "pct_of_previous": pct_prev
            })
            if count > 0:
                prev_count = count
        # Any stages not in DB config
        for stage_name, count in stage_counts.items():
            pct_total = round(count / total * 100, 1) if total > 0 else 0.0
            funnel.append({
                "stage": stage_name, "count": count, "color": "#6B7280",
                "pct_of_total": pct_total, "pct_of_previous": 0.0
            })

        # By source: group by campaign.source
        campaigns = db.query(Campaign).all()
        camp_map = {c.id: c for c in campaigns}
        source_data = {}
        for l in all_leads:
            c = camp_map.get(l.campaign_id)
            src = c.source if c else "unknown"
            if src not in source_data:
                source_data[src] = {"leads": 0, "converted": 0, "budget": 0.0}
            source_data[src]["leads"] += 1
            if l.status == "converted":
                source_data[src]["converted"] += 1
            if c and c.budget and src not in source_data.get("_budgeted", set()):
                source_data.setdefault("_camp_ids", set())
                if c.id not in source_data.get("_camp_ids", set()):
                    source_data[src]["budget"] += float(c.budget or 0)
                    source_data.setdefault("_camp_ids", set()).add(c.id)

        source_data.pop("_camp_ids", None)
        by_source = []
        for src, d in source_data.items():
            cr = round(d["converted"] / d["leads"] * 100, 1) if d["leads"] > 0 else 0.0
            cpl = round(d["budget"] / d["leads"], 0) if d["leads"] > 0 and d["budget"] > 0 else 0.0
            by_source.append({
                "source": src, "leads": d["leads"], "converted": d["converted"],
                "conversion_rate": cr, "budget": d["budget"], "cost_per_lead": cpl
            })

        # By campaign: per-campaign breakdown with revenue attribution
        # Pre-fetch revenue: lead -> converted_customer_id -> transactions
        converted_cust_ids = [l.converted_customer_id for l in all_leads if l.converted_customer_id]
        revenue_by_customer = {}
        if converted_cust_ids:
            txn_rows = db.query(
                Transaction.customer_id,
                func.sum(Transaction.total_value).label("revenue"),
                func.count(Transaction.id).label("deals")
            ).filter(Transaction.customer_id.in_(converted_cust_ids)).group_by(Transaction.customer_id).all()
            for row in txn_rows:
                revenue_by_customer[row.customer_id] = {"revenue": float(row.revenue or 0), "deals": int(row.deals)}

        # Build lead-to-campaign mapping for revenue rollup
        camp_revenue = {}
        for l in all_leads:
            if l.converted_customer_id and l.converted_customer_id in revenue_by_customer:
                cid = l.campaign_id
                if cid not in camp_revenue:
                    camp_revenue[cid] = {"revenue": 0.0, "deals": 0}
                camp_revenue[cid]["revenue"] += revenue_by_customer[l.converted_customer_id]["revenue"]
                camp_revenue[cid]["deals"] += revenue_by_customer[l.converted_customer_id]["deals"]

        camp_leads = {}
        for l in all_leads:
            cid = l.campaign_id
            if cid not in camp_leads:
                camp_leads[cid] = {"total": 0, "converted": 0, "lost": 0}
            camp_leads[cid]["total"] += 1
            if l.status == "converted":
                camp_leads[cid]["converted"] += 1
            elif l.status == "lost":
                camp_leads[cid]["lost"] += 1

        by_campaign = []
        for c in campaigns:
            cl = camp_leads.get(c.id, {"total": 0, "converted": 0, "lost": 0})
            if cl["total"] == 0 and not campaign_id:
                continue
            cr_val = round(cl["converted"] / cl["total"] * 100, 1) if cl["total"] > 0 else 0.0
            rev = camp_revenue.get(c.id, {"revenue": 0.0, "deals": 0})
            by_campaign.append({
                "campaign_id": c.campaign_id, "name": c.name, "source": c.source or "unknown",
                "status": c.status, "leads": cl["total"], "converted": cl["converted"],
                "lost": cl["lost"], "conversion_rate": cr_val,
                "budget": float(c.budget or 0),
                "revenue_generated": rev["revenue"], "deals": rev["deals"],
                "roi": round((rev["revenue"] - float(c.budget or 0)) / float(c.budget or 1) * 100, 1) if c.budget and float(c.budget) > 0 else 0.0
            })

        # Total revenue attribution
        total_revenue = sum(c["revenue_generated"] for c in by_campaign)
        total_budget = sum(c["budget"] for c in by_campaign)

        return {
            "overall": {
                "total_leads": total, "converted": converted, "lost": lost,
                "active": active, "conversion_rate": conversion_rate,
                "avg_days_to_conversion": avg_days,
                "total_revenue_attributed": total_revenue,
                "total_budget": total_budget,
                "overall_roi": round((total_revenue - total_budget) / total_budget * 100, 1) if total_budget > 0 else 0.0
            },
            "funnel": funnel,
            "by_source": sorted(by_source, key=lambda x: x["leads"], reverse=True),
            "by_campaign": sorted(by_campaign, key=lambda x: x["leads"], reverse=True)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analytics error: {str(e)}")


@app.get("/api/analytics/rep-performance")
def analytics_rep_performance(
    campaign_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(require_role(["admin", "cco", "manager"]))
):
    """Rep-wise performance: lead aging, interactions, conversions, follow-ups."""
    try:
        # Build base lead query
        lead_q = db.query(Lead)
        if campaign_id:
            camp = db.query(Campaign).filter(
                (Campaign.campaign_id == campaign_id) | (Campaign.id == campaign_id)
            ).first()
            if camp:
                lead_q = lead_q.filter(Lead.campaign_id == camp.id)

        all_leads = lead_q.all()
        today = date.today()

        # Pre-fetch all reps
        reps = db.query(CompanyRep).filter(CompanyRep.status == "active").all()
        rep_map = {r.id: r for r in reps}

        # Group leads by assigned_rep_id
        rep_leads = {}
        for l in all_leads:
            rid = l.assigned_rep_id
            if rid not in rep_leads:
                rep_leads[rid] = []
            rep_leads[rid].append(l)

        # Pre-fetch interactions grouped by company_rep_id (single query)
        interaction_q = db.query(
            Interaction.company_rep_id,
            Interaction.interaction_type,
            func.count(Interaction.id).label("cnt")
        )
        if campaign_id and 'camp' in dir() and camp:
            lead_ids = [l.id for l in all_leads]
            if lead_ids:
                interaction_q = interaction_q.filter(Interaction.lead_id.in_(lead_ids))
        interaction_q = interaction_q.group_by(Interaction.company_rep_id, Interaction.interaction_type)
        interaction_rows = interaction_q.all()

        int_map = {}
        for row in interaction_rows:
            rid = row.company_rep_id
            if rid not in int_map:
                int_map[rid] = {"total": 0, "call": 0, "message": 0, "whatsapp": 0}
            int_map[rid][row.interaction_type] = int_map[rid].get(row.interaction_type, 0) + int(row.cnt)
            int_map[rid]["total"] += int(row.cnt)

        # Pre-fetch pending followups by rep (single query)
        followup_q = db.query(
            Interaction.company_rep_id,
            func.count(Interaction.id).label("cnt")
        ).filter(
            Interaction.next_follow_up <= today,
            Interaction.next_follow_up.isnot(None)
        )
        if campaign_id and 'camp' in dir() and camp:
            lead_ids = [l.id for l in all_leads]
            if lead_ids:
                followup_q = followup_q.filter(Interaction.lead_id.in_(lead_ids))
        followup_rows = followup_q.group_by(Interaction.company_rep_id).all()
        followup_map = {row.company_rep_id: int(row.cnt) for row in followup_rows}

        # Build per-rep metrics
        result_reps = []
        total_not_attempted = 0
        total_pending = 0
        total_converted_all = 0
        total_assigned_all = 0

        all_rep_ids = set(rep_leads.keys()) | set(r.id for r in reps)
        for rid in all_rep_ids:
            rep = rep_map.get(rid)
            if not rep:
                continue
            leads_list = rep_leads.get(rid, [])
            total_assigned = len(leads_list)
            if total_assigned == 0 and rid not in rep_leads:
                continue

            # Not attempted buckets: leads with last_contacted_at IS NULL and status not terminal
            not_attempted = {"0_7d": 0, "7_14d": 0, "14d_plus": 0, "total": 0}
            converted_count = 0
            lost_count = 0
            response_days = []

            for l in leads_list:
                if l.status == "converted":
                    converted_count += 1
                elif l.status == "lost":
                    lost_count += 1

                if l.last_contacted_at is None and l.status not in ("converted", "lost"):
                    days_since = (today - l.created_at.date()).days if l.created_at else 0
                    not_attempted["total"] += 1
                    if days_since <= 7:
                        not_attempted["0_7d"] += 1
                    elif days_since <= 14:
                        not_attempted["7_14d"] += 1
                    else:
                        not_attempted["14d_plus"] += 1

                # Average response time (days from creation to first contact)
                if l.last_contacted_at and l.created_at:
                    rd = (l.last_contacted_at - l.created_at).total_seconds() / 86400
                    if rd >= 0:
                        response_days.append(rd)

            interactions = int_map.get(rid, {"total": 0, "call": 0, "message": 0, "whatsapp": 0})
            pending = followup_map.get(rid, 0)
            cr = round(converted_count / total_assigned * 100, 1) if total_assigned > 0 else 0.0
            avg_resp = round(sum(response_days) / len(response_days), 1) if response_days else None

            result_reps.append({
                "rep_id": rep.rep_id, "name": rep.name,
                "total_assigned": total_assigned,
                "not_attempted": not_attempted,
                "interactions": interactions,
                "pending_followups": pending,
                "converted": converted_count, "lost": lost_count,
                "active": total_assigned - converted_count - lost_count,
                "conversion_rate": cr,
                "avg_response_days": avg_resp
            })

            total_not_attempted += not_attempted["total"]
            total_pending += pending
            total_converted_all += converted_count
            total_assigned_all += total_assigned

        result_reps.sort(key=lambda x: x["total_assigned"], reverse=True)

        return {
            "reps": result_reps,
            "totals": {
                "total_assigned": total_assigned_all,
                "total_not_attempted": total_not_attempted,
                "total_pending_followups": total_pending,
                "total_converted": total_converted_all,
                "overall_conversion_rate": round(total_converted_all / total_assigned_all * 100, 1) if total_assigned_all > 0 else 0.0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rep analytics error: {str(e)}")

# ============================================
# TASK MANAGEMENT ENDPOINTS
# ============================================
from app.services.task_service import task_service as _task_service
from app.services.voice_query_service import voice_query_service as _voice_service

VALID_TASK_TYPES = {"general", "follow_up", "documentation", "meeting", "inventory",
    "transaction", "customer", "report", "approval", "sales", "collection",
    "site_visit", "legal", "recovery", "reconciliation"}
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}

def _build_rep_name_cache(db, tasks):
    """Batch-fetch rep names to avoid N+1 queries in _task_to_dict loops."""
    ids = set()
    for t in tasks:
        if t.assignee_id: ids.add(t.assignee_id)
        if t.created_by: ids.add(t.created_by)
    if not ids:
        return {}
    reps = db.query(CompanyRep.id, CompanyRep.name).filter(CompanyRep.id.in_(list(ids))).all()
    return {r.id: r.name for r in reps}

def _task_to_dict(task, db, name_cache=None):
    """Convert Task model to dict with assignee/creator names.
    Pass name_cache (from _build_rep_name_cache) to avoid N+1 queries in loops."""
    if name_cache is not None:
        assignee_name = name_cache.get(task.assignee_id) if task.assignee_id else None
        creator_name = name_cache.get(task.created_by) if task.created_by else None
    else:
        assignee_name = None
        creator_name = None
        if task.assignee_id:
            assignee = db.query(CompanyRep).filter(CompanyRep.id == task.assignee_id).first()
            assignee_name = assignee.name if assignee else None
        if task.created_by:
            creator = db.query(CompanyRep).filter(CompanyRep.id == task.created_by).first()
            creator_name = creator.name if creator else None
    return {
        "id": str(task.id),
        "task_id": task.task_id,
        "title": task.title,
        "description": task.description,
        "task_type": task.task_type,
        "department": task.department,
        "priority": task.priority,
        "status": task.status,
        "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        "assignee_name": assignee_name,
        "created_by": str(task.created_by) if task.created_by else None,
        "creator_name": creator_name,
        "delegated_by": str(task.delegated_by) if task.delegated_by else None,
        "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "completion_notes": task.completion_notes,
        "pending_assignment": task.pending_assignment,
        "original_assignee_text": task.original_assignee_text,
        "linked_inventory_id": str(task.linked_inventory_id) if task.linked_inventory_id else None,
        "linked_transaction_id": str(task.linked_transaction_id) if task.linked_transaction_id else None,
        "linked_customer_id": str(task.linked_customer_id) if task.linked_customer_id else None,
        "linked_project_id": str(task.linked_project_id) if task.linked_project_id else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }

def _check_task_access(task, current_user):
    """Verify user has access to a task. Admin/CCO see all, others only their own."""
    if current_user.role in ("admin", "cco"):
        return True
    return task.assignee_id == current_user.id or task.created_by == current_user.id

@app.post("/api/tasks")
async def create_task(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    task_type: str = Form("general", alias="type"),
    priority: str = Form("medium"),
    assignee_id: Optional[str] = Form(None, alias="assigned_to"),
    due_date: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    crm_entity_type: Optional[str] = Form(None),
    crm_entity_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot create tasks")
    # Input validation (#13, #14)
    if len(title) > 500:
        raise HTTPException(status_code=400, detail="Title too long (max 500 chars)")
    if description and len(description) > 5000:
        raise HTTPException(status_code=400, detail="Description too long (max 5000 chars)")
    task_type_lower = task_type.lower()
    priority_lower = priority.lower()
    if task_type_lower not in VALID_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid task type. Valid: {', '.join(sorted(VALID_TASK_TYPES))}")
    if priority_lower not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Valid: {', '.join(sorted(VALID_PRIORITIES))}")
    try:
        parsed_due = date.fromisoformat(due_date) if due_date else None
        parsed_assignee = uuid.UUID(assignee_id) if assignee_id else None
        # Map generic crm_entity_type/crm_entity_id to specific linked fields
        linked_inventory_id = crm_entity_id if crm_entity_type == "inventory" else None
        linked_transaction_id = crm_entity_id if crm_entity_type == "transaction" else None
        linked_customer_id = crm_entity_id if crm_entity_type in ("customer", "lead") else None
        linked_project_id = crm_entity_id if crm_entity_type == "project" else None
        task = _task_service.create_task(
            db, current_user.id, title, description, task_type_lower, priority_lower,
            parsed_assignee, parsed_due, department,
            linked_inventory_id, linked_transaction_id,
            linked_customer_id, linked_project_id
        )
        return _task_to_dict(task, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/tasks/from-text")
async def create_task_from_text(
    text: str = Form(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot create tasks")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="Text too long (max 2000 chars)")
    # Rate limit voice-driven task creation same as voice queries
    user_key = current_user.rep_id or str(current_user.id)
    if not voice_limiter.check(user_key, VOICE_RATE_LIMIT, VOICE_RATE_WINDOW):
        raise HTTPException(status_code=429, detail="Rate limit exceeded for voice task creation")
    try:
        task = _task_service.create_task_from_text(db, text, current_user.id)
        return _task_to_dict(task, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/tasks")
async def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    department: Optional[str] = None,
    task_type: Optional[str] = None,
    search: Optional[str] = None,
    assignee_id: Optional[str] = None,
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    role = current_user.role
    user_id = current_user.id

    # Fix #6: Only admin/cco can filter by arbitrary assignee_id
    if assignee_id and role in ("admin", "cco"):
        tasks = _task_service.get_tasks(db, user_id=assignee_id, role=role,
                                         status=status, priority=priority, department=department,
                                         task_type=task_type, search=search, assignee_only=True,
                                         limit=limit, offset=skip, current_rep_id=current_user.rep_id)
    else:
        tasks = _task_service.get_tasks(db, user_id=user_id, role=role,
                                         status=status, priority=priority, department=department,
                                         task_type=task_type, search=search, limit=limit, offset=skip,
                                         current_rep_id=current_user.rep_id)
    # Fix #7: Batch-fetch rep names to avoid N+1 queries
    name_cache = _build_rep_name_cache(db, tasks)
    return [_task_to_dict(t, db, name_cache) for t in tasks]

@app.get("/api/tasks/my")
async def my_tasks(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    tasks = _task_service.get_my_tasks(db, current_user.id)
    name_cache = _build_rep_name_cache(db, tasks)
    return [_task_to_dict(t, db, name_cache) for t in tasks]

@app.get("/api/tasks/reports/summary")
async def task_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return _task_service.get_task_summary(db, current_user.id, current_user.role, current_rep_id=current_user.rep_id)

@app.get("/api/tasks/executive-summary")
async def executive_summary(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """C-suite executive summary — tasks grouped by direct reports with stats and recent updates."""
    return _task_service.get_executive_summary(db, current_rep_id=current_user.rep_id)

@app.get("/api/tasks/departments/config")
async def departments_config(
    current_user = Depends(get_current_user)
):
    return _task_service.get_departments_config()

@app.get("/api/tasks/status-options/{task_type_name}")
async def status_options(
    task_type_name: str,
    current_user = Depends(get_current_user)
):
    return {"task_type": task_type_name, "statuses": _task_service.get_valid_statuses(task_type_name)}

@app.get("/api/tasks/{task_id}")
async def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    task = _task_service._find_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Fix #5: IDOR check
    if not _check_task_access(task, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    result = _task_to_dict(task, db)
    # Include comments and activities (Fix #8: batch-fetch names)
    comments = _task_service.get_comments(db, task_id)
    activities = _task_service.get_activities(db, task_id)
    # Batch-fetch all author/actor names
    people_ids = set()
    for c in comments:
        if c.author_id: people_ids.add(c.author_id)
    for a in activities:
        if a.actor_id: people_ids.add(a.actor_id)
    people_names = {}
    if people_ids:
        reps = db.query(CompanyRep.id, CompanyRep.name).filter(CompanyRep.id.in_(list(people_ids))).all()
        people_names = {r.id: r.name for r in reps}
    result["comments"] = [{
        "id": str(c.id), "content": c.content,
        "author_id": str(c.author_id),
        "author_name": people_names.get(c.author_id, "Unknown"),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    } for c in comments]
    result["activities"] = [{
        "id": str(a.id), "action": a.action,
        "old_value": a.old_value, "new_value": a.new_value,
        "actor_id": str(a.actor_id),
        "actor_name": people_names.get(a.actor_id, "Unknown"),
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in activities]
    # Include subtasks
    subtasks = db.query(Task).filter(Task.parent_task_id == task.id).order_by(Task.created_at).all()
    sub_cache = _build_rep_name_cache(db, subtasks)
    result["subtasks"] = [_task_to_dict(s, db, sub_cache) for s in subtasks]
    return result

@app.put("/api/tasks/{task_id}")
async def update_task(
    task_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    status_val: Optional[str] = Form(None, alias="status"),
    department: Optional[str] = Form(None),
    assignee_id: Optional[str] = Form(None),
    due_date: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    task = _task_service._find_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _check_task_access(task, current_user):
        raise HTTPException(status_code=403, detail="Access denied")
    # Input validation
    if title and len(title) > 500:
        raise HTTPException(status_code=400, detail="Title too long (max 500 chars)")
    if description is not None and len(description) > 5000:
        raise HTTPException(status_code=400, detail="Description too long (max 5000 chars)")
    if priority and priority.lower() not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Valid: {', '.join(sorted(VALID_PRIORITIES))}")
    changes = []
    if title:
        task.title = title
        changes.append(f"title updated")
    if description is not None:
        task.description = description
        changes.append("description updated")
    if priority:
        old_pri = task.priority
        task.priority = priority
        changes.append(f"priority: {old_pri} -> {priority}")
    if department:
        task.department = department
        changes.append(f"department: {department}")
    if assignee_id:
        task.assignee_id = uuid.UUID(assignee_id)
        rep = db.query(CompanyRep).filter(CompanyRep.id == uuid.UUID(assignee_id)).first()
        changes.append(f"assigned to {rep.name if rep else assignee_id}")
    if due_date:
        task.due_date = date.fromisoformat(due_date)
        changes.append(f"due date: {due_date}")
    if status_val:
        updated = _task_service.update_task_status(db, task_id, status_val, current_user.id)
        return _task_to_dict(updated, db)

    task.updated_at = datetime.utcnow()
    # Log activity and notify stakeholders for field updates
    if changes:
        _task_service._log_activity(db, task.id, current_user.id, "updated", "", "; ".join(changes))
        _task_service._notify_task_stakeholders(
            db, task, current_user.id,
            f"Task updated: {task.title}",
            "; ".join(changes)
        )
    db.commit()
    return _task_to_dict(task, db)

@app.delete("/api/tasks/{task_id}")
async def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Delete a task. Admin/CCO can delete any, others can delete tasks they created."""
    task = _task_service._find_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role not in ("admin", "cco") and task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator or admin can delete tasks")
    db.delete(task)
    db.commit()
    return {"detail": "Task deleted", "task_id": task_id}

@app.post("/api/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        task = _task_service.complete_task(db, task_id, current_user.id, notes)
        return _task_to_dict(task, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/tasks/{task_id}/delegate")
async def delegate_task(
    task_id: str,
    new_assignee_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        task = _task_service.delegate_task(db, task_id, new_assignee_id, current_user.id)
        return _task_to_dict(task, db)
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/tasks/{task_id}/comments")
async def add_task_comment(
    task_id: str,
    content: str = Form(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="Comment too long (max 5000 chars)")
    try:
        comment = _task_service.add_comment(db, task_id, current_user.id, content)
        author = db.query(CompanyRep).filter(CompanyRep.id == comment.author_id).first()
        return {
            "id": str(comment.id), "content": comment.content,
            "author_id": str(comment.author_id),
            "author_name": author.name if author else "Unknown",
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/tasks/{task_id}/comments")
async def get_task_comments(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        comments = _task_service.get_comments(db, task_id)
        author_ids = set(c.author_id for c in comments if c.author_id)
        author_names = {}
        if author_ids:
            reps = db.query(CompanyRep.id, CompanyRep.name).filter(CompanyRep.id.in_(list(author_ids))).all()
            author_names = {r.id: r.name for r in reps}
        return [{
            "id": str(c.id), "content": c.content,
            "author_id": str(c.author_id),
            "author_name": author_names.get(c.author_id, "Unknown"),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        } for c in comments]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/tasks/{task_id}/activities")
async def get_task_activities(
    task_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        activities = _task_service.get_activities(db, task_id)
        actor_ids = set(a.actor_id for a in activities if a.actor_id)
        actor_names = {}
        if actor_ids:
            reps = db.query(CompanyRep.id, CompanyRep.name).filter(CompanyRep.id.in_(list(actor_ids))).all()
            actor_names = {r.id: r.name for r in reps}
        return [{
            "id": str(a.id), "action": a.action,
            "old_value": a.old_value, "new_value": a.new_value,
            "actor_id": str(a.actor_id),
            "actor_name": actor_names.get(a.actor_id, "Unknown"),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        } for a in activities]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/tasks/{task_id}/subtasks")
async def create_subtask(
    task_id: str,
    title: str = Form(...),
    description: Optional[str] = Form(None),
    assignee_id: Optional[str] = Form(None),
    priority: str = Form("medium"),
    due_date: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    parent = _task_service._find_task(db, task_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent task not found")
    try:
        parsed_due = date.fromisoformat(due_date) if due_date else None
        parsed_assignee = uuid.UUID(assignee_id) if assignee_id else None
        subtask = _task_service.create_task(
            db, current_user.id, title, description,
            parent.task_type, priority, parsed_assignee, parsed_due,
            parent.department, str(parent.linked_inventory_id) if parent.linked_inventory_id else None,
            str(parent.linked_transaction_id) if parent.linked_transaction_id else None,
            str(parent.linked_customer_id) if parent.linked_customer_id else None,
            str(parent.linked_project_id) if parent.linked_project_id else None,
        )
        subtask.parent_task_id = parent.id
        db.commit()
        return _task_to_dict(subtask, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============================================
# VOICE QUERY ENDPOINTS
# ============================================

@app.post("/api/voice/query")
async def voice_query(
    query: str = Form(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # Rate limit: voice queries
    user_key = current_user.rep_id or str(current_user.id)
    if not voice_limiter.check(user_key, VOICE_RATE_LIMIT, VOICE_RATE_WINDOW):
        raise HTTPException(status_code=429, detail=f"Voice query rate limit exceeded ({VOICE_RATE_LIMIT}/{VOICE_RATE_WINDOW}s). Please wait.")
    if not _check_daily_limit(user_key, "voice_queries", VOICE_DAILY_LIMIT):
        raise HTTPException(status_code=429, detail=f"Daily voice query limit reached ({VOICE_DAILY_LIMIT}/day). Contact admin.")
    _track_daily_usage(user_key, "voice_queries")
    # Enforce max query length
    if len(query) > 1000:
        raise HTTPException(status_code=400, detail="Query too long (max 1000 chars)")
    user_rep_id = current_user.rep_id
    return _voice_service.process_query(db, query, user_rep_id)

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen"

@app.post("/api/voice/upload")
async def voice_upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Accept audio file, transcribe via Deepgram, then run voice query pipeline."""
    if not DEEPGRAM_API_KEY:
        raise HTTPException(status_code=503, detail="Voice transcription not configured (DEEPGRAM_API_KEY missing)")
    # Rate limit same as text queries
    user_key = current_user.rep_id or str(current_user.id)
    if not voice_limiter.check(user_key, VOICE_RATE_LIMIT, VOICE_RATE_WINDOW):
        raise HTTPException(status_code=429, detail=f"Voice query rate limit exceeded ({VOICE_RATE_LIMIT}/{VOICE_RATE_WINDOW}s). Please wait.")
    if not _check_daily_limit(user_key, "voice_queries", VOICE_DAILY_LIMIT):
        raise HTTPException(status_code=429, detail=f"Daily voice query limit reached ({VOICE_DAILY_LIMIT}/day). Contact admin.")

    audio_bytes = await file.read()
    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Audio too short. Please record for at least 1 second.")
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio too large (max 25MB)")

    # Transcribe via Deepgram
    content_type = file.content_type or "audio/webm"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                DEEPGRAM_API_URL,
                content=audio_bytes,
                headers={
                    "Authorization": f"Token {DEEPGRAM_API_KEY}",
                    "Content-Type": content_type,
                },
                params={
                    "model": "nova-3",
                    "smart_format": "true",
                    "punctuate": "true",
                    "language": "en",
                },
            )
        if resp.status_code != 200:
            logger.error(f"Deepgram error {resp.status_code}: {resp.text[:200]}")
            raise HTTPException(status_code=502, detail="Speech transcription failed. Please try again.")
        dg_data = resp.json()
        transcript = dg_data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
        confidence = dg_data.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("confidence", 0)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Speech transcription timed out. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Deepgram transcription error: {e}")
        raise HTTPException(status_code=502, detail="Speech transcription failed.")

    if not transcript or not transcript.strip():
        return {"response_text": "I couldn't understand the audio. Please try again or type your question.", "transcript": "", "confidence": 0}

    _track_daily_usage(user_key, "voice_queries")
    # Run through existing query pipeline
    result = _voice_service.process_query(db, transcript.strip(), current_user.rep_id)
    result["transcript"] = transcript.strip()
    result["stt_confidence"] = round(confidence, 3)
    return result

@app.get("/api/voice/history")
async def voice_history(
    skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    user_rep_id = current_user.rep_id
    query = db.query(QueryHistory)
    if user_rep_id:
        query = query.filter(QueryHistory.user_rep_id == user_rep_id)
    items = query.order_by(QueryHistory.created_at.desc()).offset(skip).limit(limit).all()
    return [{
        "id": str(h.id), "query_text": h.query_text,
        "intent": h.intent, "domain": h.domain,
        "confidence": float(h.confidence) if h.confidence else 0,
        "response_text": h.response_text,
        "success": h.success, "processing_time_ms": float(h.processing_time_ms) if h.processing_time_ms else 0,
        "created_at": h.created_at.isoformat() if h.created_at else None,
    } for h in items]

@app.post("/api/voice/feedback")
async def voice_feedback(
    query_id: str = Form(...),
    feedback_type: str = Form(...),
    rating: Optional[int] = Form(None),
    correct_intent: Optional[str] = Form(None),
    correct_domain: Optional[str] = Form(None),
    correct_response: Optional[str] = Form(None),
    user_comment: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    feedback = QueryFeedback(
        query_history_id=uuid.UUID(query_id),
        feedback_type=feedback_type,
        rating=rating,
        correct_intent=correct_intent,
        correct_domain=correct_domain,
        correct_response=correct_response,
        user_comment=user_comment,
    )
    db.add(feedback)
    db.commit()
    return {"status": "ok", "id": str(feedback.id)}

@app.get("/api/voice/stats")
async def voice_stats(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role not in ("admin", "cco"):
        raise HTTPException(status_code=403, detail="Admin access required")
    total = db.query(QueryHistory).count()
    successful = db.query(QueryHistory).filter(QueryHistory.success == True).count()
    from sqlalchemy import func as sqlfunc
    intent_dist = dict(db.query(QueryHistory.intent, sqlfunc.count()).group_by(QueryHistory.intent).all())
    domain_dist = dict(db.query(QueryHistory.domain, sqlfunc.count()).group_by(QueryHistory.domain).all())
    return {
        "total_queries": total,
        "successful_queries": successful,
        "success_rate": round(successful / total * 100, 1) if total > 0 else 0,
        "intent_distribution": intent_dist,
        "domain_distribution": domain_dist,
    }

# ============================================
# API USAGE MONITORING & SERVER HEALTH
# ============================================

@app.get("/api/admin/usage")
async def get_api_usage(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get API usage stats for all users. Admin/CCO only."""
    if current_user.role not in ("admin", "cco"):
        raise HTTPException(status_code=403, detail="Admin access required")

    today = date.today().isoformat()
    usage_data = []
    for user_key, data in _daily_usage.items():
        if data.get("date") == today:
            usage_data.append({
                "user": user_key,
                "voice_queries": data.get("voice_queries", 0),
                "task_ops": data.get("task_ops", 0),
                "date": data["date"],
            })

    # Voice usage from DB (last 24h)
    from sqlalchemy import func as sqlfunc
    yesterday = datetime.utcnow() - timedelta(hours=24)
    db_voice_24h = db.query(QueryHistory).filter(QueryHistory.created_at >= yesterday).count()
    db_voice_by_user = dict(
        db.query(QueryHistory.user_rep_id, sqlfunc.count())
        .filter(QueryHistory.created_at >= yesterday)
        .group_by(QueryHistory.user_rep_id).all()
    )

    return {
        "today": today,
        "limits": {
            "voice_per_minute": VOICE_RATE_LIMIT,
            "voice_daily": VOICE_DAILY_LIMIT,
            "task_per_minute": TASK_RATE_LIMIT,
        },
        "daily_usage": usage_data,
        "voice_24h_total": db_voice_24h,
        "voice_24h_by_user": db_voice_by_user,
    }

@app.get("/api/admin/health")
async def server_health(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Server health check with resource usage. Admin/CCO only."""
    if current_user.role not in ("admin", "cco"):
        raise HTTPException(status_code=403, detail="Admin access required")

    import platform
    health = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "platform": platform.system(),
        "python_version": platform.python_version(),
    }

    # DB connection check
    try:
        db.execute(text("SELECT 1"))
        health["database"] = "connected"
    except Exception as e:
        health["database"] = f"error: {str(e)}"
        health["status"] = "degraded"

    # DB size
    try:
        result = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
        health["db_size_mb"] = round(result / (1024 * 1024), 1) if result else 0
    except Exception:
        health["db_size_mb"] = None

    # Table row counts (key tables only)
    try:
        counts = {}
        for table in ["customers", "brokers", "inventory", "transactions", "tasks", "query_history"]:
            try:
                cnt = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                counts[table] = cnt
            except Exception:
                counts[table] = -1
        health["table_counts"] = counts
    except Exception:
        pass

    # Memory usage (if psutil available)
    try:
        import psutil
        proc = psutil.Process()
        mem = proc.memory_info()
        health["memory"] = {
            "rss_mb": round(mem.rss / (1024 * 1024), 1),
            "vms_mb": round(mem.vms / (1024 * 1024), 1),
        }
        health["cpu_percent"] = proc.cpu_percent(interval=0.1)
        disk = psutil.disk_usage("/")
        health["disk"] = {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb": round(disk.used / (1024**3), 1),
            "free_gb": round(disk.free / (1024**3), 1),
            "percent": disk.percent,
        }
    except ImportError:
        health["memory"] = "psutil not installed"

    # Rate limiter stats
    voice_limiter.cleanup()
    task_limiter.cleanup()
    health["active_rate_limit_users"] = {
        "voice": len(voice_limiter._requests),
        "task": len(task_limiter._requests),
    }

    return health
