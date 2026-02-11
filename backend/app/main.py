"""
Radius CRM v3 - Complete Backend
Customers, Brokers, Projects, Inventory, Transactions
"""
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Query, Form, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, String, Text, DateTime, Numeric, ForeignKey, Integer, Date, Boolean, text, extract
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
import json as json_module
import asyncio
import queue
import threading
import hashlib

# ============================================
# FILE STORAGE SETUP - Map PDFs stored on filesystem instead of DB
# ============================================
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'uploads', 'maps')
os.makedirs(UPLOAD_DIR, exist_ok=True)

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
    # Buyback & Costing fields
    buyback_count = Column(Integer, default=0)  # Number of times this plot was bought back
    last_buyback_id = Column(UUID(as_uuid=True))  # FK added via migration
    company_cost = Column(Numeric(15, 2))  # Company's acquisition cost for this unit
    original_listing_price = Column(Numeric(15, 2))  # Original price before any buybacks
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
    status = Column(String(20), default="active")  # active, bought_back, cancelled
    notes = Column(Text)
    booking_date = Column(Date, default=date.today)
    # Buyback tracking
    buyback_id = Column(UUID(as_uuid=True))  # FK added via migration, links to buyback if bought back
    is_resale = Column(String(10), default="false")  # "true" if this transaction is a resale after buyback
    resale_commission_rate = Column(Numeric(5, 2))  # Custom commission rate for resales
    original_buyback_id = Column(UUID(as_uuid=True))  # If resale, links to the buyback that made inventory available
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
# BUYBACK MODELS
# ============================================
class Buyback(Base):
    __tablename__ = "buybacks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buyback_id = Column(String(20), unique=True, nullable=False)

    # Links to original records
    original_transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=False)
    inventory_id = Column(UUID(as_uuid=True), ForeignKey("inventory.id"), nullable=False)
    original_customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)

    # Financial details
    original_sale_price = Column(Numeric(15, 2), nullable=False)
    buyback_price = Column(Numeric(15, 2), nullable=False)
    buyback_profit_rate = Column(Numeric(5, 2), default=5.00)
    reinventory_price = Column(Numeric(15, 2), nullable=False)
    reinventory_markup_rate = Column(Numeric(5, 2), default=2.00)
    original_commission_amount = Column(Numeric(15, 2), default=0)

    # Costing
    company_cost_auto = Column(Numeric(15, 2))
    company_cost_manual = Column(Numeric(15, 2))
    company_cost_override = Column(String(10), default="false")

    # Settlement
    settlement_type = Column(String(30), default="full")  # full, partial, settlement
    settlement_amount = Column(Numeric(15, 2))
    amount_paid_to_customer = Column(Numeric(15, 2), default=0)

    # Metadata
    reason = Column(Text)
    notes = Column(Text)

    # Status & Workflow
    status = Column(String(20), default="pending")  # pending, approved, in_progress, completed, cancelled
    initiated_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    approved_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    approved_at = Column(DateTime)

    # Dates
    buyback_date = Column(Date, default=date.today)
    completion_date = Column(Date)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())

class BuybackLedger(Base):
    __tablename__ = "buyback_ledger"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ledger_id = Column(String(20), unique=True, nullable=False)

    buyback_id = Column(UUID(as_uuid=True), ForeignKey("buybacks.id"), nullable=False)

    # Entry details
    entry_type = Column(String(30), nullable=False)  # payment_to_customer, adjustment, settlement
    amount = Column(Numeric(15, 2), nullable=False)

    # Payment details
    payment_method = Column(String(50))  # cash, cheque, bank_transfer
    reference_number = Column(String(100))
    payment_date = Column(Date, default=date.today)

    notes = Column(Text)
    created_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
    created_at = Column(DateTime, server_default=func.now())

class PlotHistory(Base):
    __tablename__ = "plot_history"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    inventory_id = Column(UUID(as_uuid=True), ForeignKey("inventory.id"), nullable=False)

    # Event details
    event_type = Column(String(30), nullable=False)  # initial_listing, sale, buyback, resale, price_change
    event_date = Column(Date, nullable=False)

    # Ownership tracking
    previous_owner_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))  # NULL for initial listing
    new_owner_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"))       # NULL for buyback

    # Linked records
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"))
    buyback_id = Column(UUID(as_uuid=True), ForeignKey("buybacks.id"))

    # Financial snapshot at time of event
    price_at_event = Column(Numeric(15, 2))
    rate_per_marla = Column(Numeric(15, 2))

    # Metadata
    notes = Column(Text)
    created_by_rep_id = Column(UUID(as_uuid=True), ForeignKey("company_reps.id"))
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
# VECTOR MODELS
# ============================================
class VectorProject(Base):
    __tablename__ = "vector_projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    map_name = Column(String(255), nullable=True)
    map_pdf_base64 = Column(Text, nullable=True)  # Legacy: base64 PDF data (prefer map_file_path)
    map_file_path = Column(String(500), nullable=True)  # NEW: filesystem path for map PDF (avoids ~5MB base64 in DB)
    # MIGRATION NOTE: Run this SQL to add the column if it doesn't exist:
    #   ALTER TABLE vector_projects ADD COLUMN IF NOT EXISTS map_file_path VARCHAR(500);
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
# NOTIFICATION MODEL
# ============================================
class Notification(Base):
    __tablename__ = 'notifications'
    id = Column(Integer, primary_key=True)
    notification_id = Column(String(20), unique=True)
    user_rep_id = Column(String(20), nullable=False)  # Target user
    title = Column(String(200), nullable=False)
    message = Column(Text)
    type = Column(String(50), default='info')  # info, warning, alert, success
    category = Column(String(50))  # overdue, deletion_request, follow_up, system
    entity_type = Column(String(50))  # customer, transaction, installment, etc.
    entity_id = Column(String(50))  # Reference ID
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    read_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'notification_id': self.notification_id,
            'user_rep_id': self.user_rep_id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'category': self.category,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'is_read': self.is_read,
            'created_at': str(self.created_at) if self.created_at else None,
            'read_at': str(self.read_at) if self.read_at else None
        }

# ============================================
# AUDIT LOG MODEL
# ============================================
class AuditLog(Base):
    __tablename__ = 'audit_log'
    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=func.now())
    user_rep_id = Column(String(20))
    user_name = Column(String(100))
    action = Column(String(20))  # CREATE, UPDATE, DELETE
    entity_type = Column(String(50))  # customer, transaction, etc.
    entity_id = Column(String(50))
    entity_name = Column(String(200))
    changes = Column(Text)  # JSON string of before/after for UPDATEs
    ip_address = Column(String(50))

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': str(self.timestamp) if self.timestamp else None,
            'user_rep_id': self.user_rep_id,
            'user_name': self.user_name,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'entity_name': self.entity_name,
            'changes': self.changes,
            'ip_address': self.ip_address
        }

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
    transactions = db.query(Transaction).filter(
        Transaction.project_id == project_id,
        Transaction.status == "active"  # Only active transactions count as sold
    ).all()

    # Build status sets from inventory
    sold_units = set()
    buyback_pending_units = set()
    resold_units = set()  # Available units that were previously bought back

    for item in inventory_items:
        if not item.unit_number:
            continue
        unit_upper = item.unit_number.upper()
        status = (item.status or '').lower()

        if status == 'sold':
            sold_units.add(unit_upper)
        elif status == 'buyback_pending':
            buyback_pending_units.add(unit_upper)
        elif status == 'available' and item.buyback_count and item.buyback_count > 0:
            resold_units.add(unit_upper)

    # Also check active transactions for sold status
    for txn in transactions:
        if txn.unit_number and txn.status == "active":
            sold_units.add(txn.unit_number.upper())

    # Build annotation arrays by status
    sold_plot_ids = []
    sold_plot_nums = []
    available_plot_ids = []
    available_plot_nums = []
    buyback_pending_plot_ids = []
    buyback_pending_plot_nums = []
    resold_plot_ids = []
    resold_plot_nums = []

    for item in inventory_items:
        unit_num = item.unit_number
        if not unit_num:
            continue
        plot_id = plot_map.get(unit_num) or plot_map.get(unit_num.upper())
        if not plot_id:
            continue

        unit_upper = unit_num.upper()
        status = (item.status or '').lower()

        if unit_upper in buyback_pending_units or status == 'buyback_pending':
            buyback_pending_plot_ids.append(plot_id)
            buyback_pending_plot_nums.append(unit_num)
        elif unit_upper in sold_units or status == 'sold':
            sold_plot_ids.append(plot_id)
            sold_plot_nums.append(unit_num)
        elif unit_upper in resold_units:
            # Plots that are available but have been bought back before
            resold_plot_ids.append(plot_id)
            resold_plot_nums.append(unit_num)
        elif status == 'available':
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
            "color": "#ef4444",  # Red
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
            "note": "AVAILABLE",
            "cat": "AVAILABLE",
            "color": "#22c55e",  # Green
            "plotIds": available_plot_ids,
            "plotNums": available_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    buyback_pending_annotation = None
    if buyback_pending_plot_ids:
        buyback_pending_annotation = {
            "id": f"auto_buyback_pending_{current_time}",
            "note": "BUYBACK PENDING",
            "cat": "BUYBACK_PENDING",
            "color": "#f59e0b",  # Amber
            "plotIds": buyback_pending_plot_ids,
            "plotNums": buyback_pending_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    resold_annotation = None
    if resold_plot_ids:
        resold_annotation = {
            "id": f"auto_resold_{current_time}",
            "note": "RESOLD",
            "cat": "RESOLD",
            "color": "#8b5cf6",  # Purple - indicates previously bought back, now available
            "plotIds": resold_plot_ids,
            "plotNums": resold_plot_nums,
            "fontSize": 12,
            "rotation": 0,
            "isAutoGenerated": True
        }

    # Build annotations list
    sales_annotations = []
    if sales_annotation:
        sales_annotations.append(sales_annotation)
    if buyback_pending_annotation:
        sales_annotations.append(buyback_pending_annotation)

    inventory_annotations = []
    if inventory_annotation:
        inventory_annotations.append(inventory_annotation)
    if resold_annotation:
        inventory_annotations.append(resold_annotation)

    # Update system_branches with all status types
    vector_project.system_branches = {
        "sales": {
            "annotations": sales_annotations,
            "lastSyncAt": datetime.utcnow().isoformat(),
            "transactionCount": len(transactions),
            "plotCount": len(sold_plot_ids),
            "buybackPendingCount": len(buyback_pending_plot_ids)
        },
        "inventory": {
            "annotations": inventory_annotations,
            "lastSyncAt": datetime.utcnow().isoformat(),
            "unitCount": len(inventory_items),
            "availableCount": len(available_plot_ids),
            "resoldCount": len(resold_plot_ids)
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
# NOTIFICATION HELPER
# ============================================
def create_notification(db, rep_id, title, message, type='info', category='system', entity_type=None, entity_id=None):
    """Helper to create a notification"""
    try:
        seq = db.execute(text("SELECT nextval('notifications_id_seq')")).scalar()
        notif = Notification(
            id=seq,
            notification_id=f'NTF-{seq:05d}',
            user_rep_id=rep_id,
            title=title,
            message=message,
            type=type,
            category=category,
            entity_type=entity_type,
            entity_id=entity_id
        )
        db.add(notif)
        return notif
    except Exception as e:
        print(f"Error creating notification: {e}")
        return None

# ============================================
# AUDIT LOG HELPER
# ============================================
def log_audit(db, request, current_user, action, entity_type, entity_id, entity_name=None, changes=None):
    """Log an audit entry"""
    try:
        entry = AuditLog(
            user_rep_id=current_user.rep_id if hasattr(current_user, 'rep_id') else current_user.get('rep_id', 'unknown'),
            user_name=current_user.name if hasattr(current_user, 'name') else current_user.get('name', 'unknown'),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            entity_name=entity_name,
            changes=json_module.dumps(changes) if changes else None,
            ip_address=request.client.host if request and request.client else None
        )
        db.add(entry)
    except Exception as e:
        print(f"Audit log error: {e}")

# ============================================
# SSE REAL-TIME UPDATES
# ============================================
sse_clients = []
sse_lock = threading.Lock()

def broadcast_sse(event_type, data):
    """Broadcast an SSE event to all connected clients"""
    message = f"event: {event_type}\ndata: {json_module.dumps(data)}\n\n"
    with sse_lock:
        dead_clients = []
        for client_queue in sse_clients:
            try:
                client_queue.put_nowait(message)
            except:
                dead_clients.append(client_queue)
        for dead in dead_clients:
            sse_clients.remove(dead)

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
    expose_headers=["X-Total-Count"],
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
def list_customers(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    total_count = db.query(func.count(Customer.id)).scalar()
    customers = db.query(Customer).order_by(Customer.created_at.desc()).offset(skip).limit(limit).all()
    data = [{
        "id": str(c.id), "customer_id": c.customer_id, "name": c.name,
        "mobile": c.mobile, "address": c.address, "cnic": c.cnic,
        "email": c.email, "created_at": str(c.created_at)
    } for c in customers]
    return JSONResponse(content=data, headers={"X-Total-Count": str(total_count)})

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
def create_customer(data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    if db.query(Customer).filter(Customer.mobile == data["mobile"]).first():
        raise HTTPException(400, f"Customer with mobile {data['mobile']} already exists")
    c = Customer(name=data["name"], mobile=data["mobile"], address=data.get("address"),
                 cnic=data.get("cnic"), email=data.get("email"))
    db.add(c); db.commit(); db.refresh(c)
    log_audit(db, request, current_user, 'CREATE', 'customer', c.customer_id, c.name)
    db.commit()
    return {"message": "Customer created", "id": str(c.id), "customer_id": c.customer_id}

@app.put("/api/customers/{cid}")
def update_customer(cid: str, data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    c = db.query(Customer).filter((Customer.id == cid) | (Customer.customer_id == cid)).first()
    if not c: raise HTTPException(404, "Customer not found")
    before = {"name": c.name, "mobile": c.mobile, "address": c.address, "cnic": c.cnic, "email": c.email}
    for k in ["name", "mobile", "address", "cnic", "email"]:
        if k in data and data[k] is not None: setattr(c, k, data[k])
    after = {"name": c.name, "mobile": c.mobile, "address": c.address, "cnic": c.cnic, "email": c.email}
    changes_dict = {k: {'before': before[k], 'after': after[k]} for k in before if before[k] != after.get(k)}
    db.commit()
    log_audit(db, request, current_user, 'UPDATE', 'customer', c.customer_id, c.name, changes_dict if changes_dict else None)
    db.commit()
    return {"message": "Customer updated"}

@app.delete("/api/customers/{cid}")
def delete_customer(cid: str, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    c = find_entity(db, Customer, "customer_id", cid)
    if not c: raise HTTPException(404, "Customer not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

    # Admin can delete directly
    if current_user.role == "admin":
        customer_id_str = c.customer_id
        customer_name = c.name
        db.delete(c); db.commit()
        log_audit(db, request, current_user, 'DELETE', 'customer', customer_id_str, customer_name)
        db.commit()
        return {"message": "Customer deleted"}

    # Non-admin: create deletion request
    req = DeletionRequest(entity_type="customer", entity_id=c.id, entity_name=c.name, requested_by=current_user.id)
    db.add(req); db.commit(); db.refresh(req)
    # Notify admins about deletion request
    admins = db.query(CompanyRep).filter(CompanyRep.role == 'admin').all()
    for admin in admins:
        create_notification(db, admin.rep_id, f'Deletion Request: {c.name}',
                          f'{current_user.name} requested deletion of customer {c.name}',
                          type='warning', category='deletion_request', entity_type='customer', entity_id=c.customer_id)
    db.commit()
    return {"message": "Deletion request submitted", "request_id": req.request_id, "pending": True}

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
def list_brokers(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    total_count = db.query(func.count(Broker.id)).scalar()
    brokers = db.query(Broker).order_by(Broker.created_at.desc()).offset(skip).limit(limit).all()
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
    return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})

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
def list_projects(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    try:
        total_count = db.query(func.count(Project.id)).scalar()
        projects = db.query(Project).order_by(Project.created_at.desc()).offset(skip).limit(limit).all()
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
        return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})
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
             "email": r.email, "status": r.status, "role": r.role} for r in reps]

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
def delete_rep(rid: str, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    r = find_entity(db, CompanyRep, "rep_id", rid)
    if not r: raise HTTPException(404, "Rep not found")

    # Creator role cannot delete
    if current_user.role == "creator":
        raise HTTPException(403, "Creator role cannot delete records")

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
def list_inventory(project_id: str = None, status: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    q = db.query(Inventory, Project.name.label("project_name")).outerjoin(Project, Inventory.project_id == Project.id)
    if project_id:
        p = db.query(Project).filter((Project.id == project_id) | (Project.project_id == project_id)).first()
        if p: q = q.filter(Inventory.project_id == p.id)
    if status: q = q.filter(Inventory.status == status)
    total_count = q.count()
    rows = q.order_by(Inventory.created_at.desc()).offset(skip).limit(limit).all()
    result = []
    for i, project_name in rows:
        result.append({
            "id": str(i.id), "inventory_id": i.inventory_id, "project_id": str(i.project_id),
            "project_name": project_name, "unit_number": i.unit_number,
            "unit_type": i.unit_type, "block": i.block, "area_marla": float(i.area_marla),
            "rate_per_marla": float(i.rate_per_marla),
            "total_value": float(i.area_marla) * float(i.rate_per_marla),
            "status": i.status, "factor_details": i.factor_details, "notes": i.notes
        })
    return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})

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
async def bulk_import_inventory(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    content = await file.read()
    reader = csv.DictReader(io.StringIO(content.decode('utf-8-sig')))
    results = {"success": 0, "skipped": 0, "errors": []}
    for i, row in enumerate(reader, 2):
        try:
            p = db.query(Project).filter(Project.project_id == row.get('project_id*')).first()
            if not p: results["errors"].append(f"Row {i}: Project not found"); continue
            # Dedup check: skip if project_id + unit_number already exists
            existing = db.query(Inventory).filter(
                Inventory.project_id == p.id,
                Inventory.unit_number == row['unit_number*']
            ).first()
            if existing:
                results["skipped"] += 1
                results["errors"].append(f"Row {i}: Duplicate - unit {row['unit_number*']} already exists in project {row.get('project_id*')}")
                continue
            inv = Inventory(project_id=p.id, unit_number=row['unit_number*'],
                            unit_type=row.get('unit_type', 'plot'), block=row.get('block'),
                            area_marla=float(row['area_marla*']), rate_per_marla=float(row['rate_per_marla*']),
                            factor_details=row.get('factor_details'), notes=row.get('notes'))
            db.add(inv); db.flush()
            results["success"] += 1
        except Exception as e: results["errors"].append(f"Row {i}: {e}")
    db.commit()
    if results["success"] > 0:
        log_audit(db, request, current_user, 'CREATE', 'inventory_bulk',
                  f'bulk-{results["success"]}',
                  f'Bulk imported {results["success"]} inventory items')
        db.commit()
    return results

# ============================================
# TRANSACTIONS API
# ============================================
@app.get("/api/transactions")
def list_transactions(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    try:
        total_count = db.query(func.count(Transaction.id)).scalar()
        # Use JOINs to fetch related names in a single query (avoids N+1)
        txn_rows = (
            db.query(
                Transaction,
                Customer.name.label("customer_name"),
                Customer.mobile.label("customer_mobile"),
                Broker.name.label("broker_name"),
                Project.name.label("project_name")
            )
            .outerjoin(Customer, Transaction.customer_id == Customer.id)
            .outerjoin(Broker, Transaction.broker_id == Broker.id)
            .outerjoin(Project, Transaction.project_id == Project.id)
            .order_by(Transaction.created_at.desc())
            .offset(skip).limit(limit)
            .all()
        )
        # Pre-fetch total_paid per transaction via SQL aggregation
        txn_ids = [row[0].id for row in txn_rows]
        paid_map = {}
        if txn_ids:
            paid_rows = (
                db.query(Installment.transaction_id, func.sum(Installment.amount_paid))
                .filter(Installment.transaction_id.in_(txn_ids))
                .group_by(Installment.transaction_id)
                .all()
            )
            paid_map = {str(tid): float(total or 0) for tid, total in paid_rows}
        result = []
        for t, customer_name, customer_mobile, broker_name, project_name in txn_rows:
            paid = paid_map.get(str(t.id), 0)
            result.append({
                "id": str(t.id), "transaction_id": t.transaction_id,
                "customer_name": customer_name, "customer_mobile": customer_mobile,
                "broker_name": broker_name, "project_name": project_name,
                "unit_number": t.unit_number, "block": t.block,
                "area_marla": float(t.area_marla), "rate_per_marla": float(t.rate_per_marla),
                "total_value": float(t.total_value), "total_paid": paid,
                "balance": float(t.total_value) - paid, "status": t.status,
                "booking_date": str(t.booking_date) if t.booking_date else None
            })
        return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})
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
def create_transaction(data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    customer = db.query(Customer).filter((Customer.id == data["customer_id"]) | (Customer.customer_id == data["customer_id"]) | (Customer.mobile == data["customer_id"])).first()
    if not customer: raise HTTPException(404, "Customer not found")

    inventory = db.query(Inventory).filter((Inventory.id == data["inventory_id"]) | (Inventory.inventory_id == data["inventory_id"])).first()
    if not inventory: raise HTTPException(404, "Inventory not found")
    if inventory.status != "available": raise HTTPException(400, f"Unit not available (status: {inventory.status})")

    project = db.query(Project).filter(Project.id == inventory.project_id).first()
    broker = db.query(Broker).filter((Broker.id == data["broker_id"]) | (Broker.broker_id == data["broker_id"]) | (Broker.mobile == data["broker_id"])).first() if data.get("broker_id") else None
    rep = db.query(CompanyRep).filter((CompanyRep.id == data["company_rep_id"]) | (CompanyRep.rep_id == data["company_rep_id"])).first() if data.get("company_rep_id") else None

    if not data.get("first_due_date"):
        raise HTTPException(400, "first_due_date is required")

    old_inv_status = inventory.status
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

    # Audit log
    log_audit(db, request, current_user, 'CREATE', 'transaction', t.transaction_id,
              f'{customer.name} - {inventory.unit_number}')
    db.commit()

    # SSE broadcast: inventory status changed to sold
    broadcast_sse('inventory_update', {
        'inventory_id': inventory.inventory_id,
        'unit_number': inventory.unit_number,
        'project_id': project.project_id,
        'old_status': old_inv_status,
        'new_status': inventory.status,
        'updated_by': current_user.rep_id
    })

    return {"message": "Transaction created", "id": str(t.id), "transaction_id": t.transaction_id}

@app.put("/api/transactions/{tid}")
def update_transaction(tid: str, data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    t = db.query(Transaction).filter((Transaction.id == tid) | (Transaction.transaction_id == tid)).first()
    if not t: raise HTTPException(404, "Transaction not found")
    before = {"broker_commission_rate": str(t.broker_commission_rate), "status": t.status, "notes": t.notes}
    for k in ["broker_commission_rate", "status", "notes"]:
        if k in data and data[k] is not None: setattr(t, k, data[k])
    after = {"broker_commission_rate": str(t.broker_commission_rate), "status": t.status, "notes": t.notes}
    changes_dict = {k: {'before': before[k], 'after': after[k]} for k in before if before[k] != after.get(k)}
    db.commit()

    # Trigger Vector sync if project is linked
    if t.project_id:
        sync_vector_branches_from_orbit(t.project_id, db)
        db.commit()

    log_audit(db, request, current_user, 'UPDATE', 'transaction', t.transaction_id, t.unit_number, changes_dict if changes_dict else None)
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
                      skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
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

    total_count = q.count()
    interactions = q.order_by(Interaction.created_at.desc()).offset(skip).limit(limit).all()
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
    return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})

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
def list_campaigns(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    try:
        total_count = db.query(func.count(Campaign.id)).scalar()
        campaigns = db.query(Campaign).order_by(Campaign.created_at.desc()).offset(skip).limit(limit).all()
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
        return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})
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
               skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    try:
        q = db.query(Lead)
        if campaign_id and campaign_id.strip():
            c = db.query(Campaign).filter((Campaign.id == campaign_id) | (Campaign.campaign_id == campaign_id)).first()
            if c: q = q.filter(Lead.campaign_id == c.id)
        if rep_id and rep_id.strip():
            r = db.query(CompanyRep).filter((CompanyRep.id == rep_id) | (CompanyRep.rep_id == rep_id)).first()
            if r: q = q.filter(Lead.assigned_rep_id == r.id)
        if status and status.strip(): q = q.filter(Lead.status == status)

        total_count = q.count()
        leads = q.order_by(Lead.created_at.desc()).offset(skip).limit(limit).all()
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
        return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})
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
def list_receipts(customer_id: str = None, transaction_id: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    try:
        q = db.query(Receipt)
        if customer_id and customer_id.strip():
            c = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_id == customer_id)).first()
            if c: q = q.filter(Receipt.customer_id == c.id)
        if transaction_id and transaction_id.strip():
            t = db.query(Transaction).filter((Transaction.id == transaction_id) | (Transaction.transaction_id == transaction_id)).first()
            if t: q = q.filter(Receipt.transaction_id == t.id)

        total_count = q.count()
        receipts = q.order_by(Receipt.created_at.desc()).offset(skip).limit(limit).all()
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
        return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})
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
def create_receipt(data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
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
    log_audit(db, request, current_user, 'CREATE', 'receipt', r.receipt_id,
              f'PKR {float(data["amount"]):,.0f} from {customer.name}')
    db.commit()
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
    end_date: str = None, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)
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

    total_count = q.count()
    payments = q.order_by(Payment.created_at.desc()).offset(skip).limit(limit).all()
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
    return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})

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
# BUYBACK API
# ============================================

def generate_buyback_id(db: Session):
    """Generate next buyback ID (BBK-XXXX)"""
    result = db.execute(text("SELECT MAX(CAST(SUBSTRING(buyback_id FROM 5) AS INTEGER)) FROM buybacks WHERE buyback_id LIKE 'BBK-%'")).scalar()
    next_num = (result or 0) + 1
    return f"BBK-{next_num:04d}"

def generate_ledger_id(db: Session):
    """Generate next ledger ID (BBL-XXXXX)"""
    result = db.execute(text("SELECT MAX(CAST(SUBSTRING(ledger_id FROM 5) AS INTEGER)) FROM buyback_ledger WHERE ledger_id LIKE 'BBL-%'")).scalar()
    next_num = (result or 0) + 1
    return f"BBL-{next_num:05d}"

@app.get("/api/buybacks")
def list_buybacks(
    status: str = None, project_id: str = None, customer_id: str = None,
    start_date: str = None, end_date: str = None, skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db)
):
    """List all buybacks with filters"""
    q = db.query(Buyback)

    if status:
        q = q.filter(Buyback.status == status)
    if project_id:
        # Filter by project via inventory
        proj = db.query(Project).filter((Project.id == project_id) | (Project.project_id == project_id)).first()
        if proj:
            inv_ids = [i.id for i in db.query(Inventory).filter(Inventory.project_id == proj.id).all()]
            q = q.filter(Buyback.inventory_id.in_(inv_ids))
    if customer_id:
        cust = db.query(Customer).filter((Customer.id == customer_id) | (Customer.customer_id == customer_id) | (Customer.mobile == customer_id)).first()
        if cust:
            q = q.filter(Buyback.original_customer_id == cust.id)
    if start_date:
        q = q.filter(Buyback.buyback_date >= date.fromisoformat(start_date))
    if end_date:
        q = q.filter(Buyback.buyback_date <= date.fromisoformat(end_date))

    total_count = q.count()
    buybacks = q.order_by(Buyback.created_at.desc()).offset(skip).limit(limit).all()
    result = []

    for b in buybacks:
        txn = db.query(Transaction).filter(Transaction.id == b.original_transaction_id).first()
        inv = db.query(Inventory).filter(Inventory.id == b.inventory_id).first()
        cust = db.query(Customer).filter(Customer.id == b.original_customer_id).first()
        proj = db.query(Project).filter(Project.id == inv.project_id).first() if inv else None
        initiator = db.query(CompanyRep).filter(CompanyRep.id == b.initiated_by_rep_id).first() if b.initiated_by_rep_id else None

        result.append({
            "id": str(b.id),
            "buyback_id": b.buyback_id,
            "transaction_id": txn.transaction_id if txn else None,
            "inventory_id": inv.inventory_id if inv else None,
            "unit_number": inv.unit_number if inv else None,
            "block": inv.block if inv else None,
            "area_marla": float(inv.area_marla) if inv else None,
            "project_name": proj.name if proj else None,
            "project_id": proj.project_id if proj else None,
            "customer_name": cust.name if cust else None,
            "customer_mobile": cust.mobile if cust else None,
            "original_sale_price": float(b.original_sale_price),
            "buyback_price": float(b.buyback_price),
            "buyback_profit_rate": float(b.buyback_profit_rate),
            "reinventory_price": float(b.reinventory_price),
            "reinventory_markup_rate": float(b.reinventory_markup_rate),
            "company_cost": float(b.company_cost_manual or b.company_cost_auto or 0),
            "settlement_type": b.settlement_type,
            "settlement_amount": float(b.settlement_amount) if b.settlement_amount else None,
            "amount_paid_to_customer": float(b.amount_paid_to_customer or 0),
            "balance_due": float((b.settlement_amount or b.buyback_price) - (b.amount_paid_to_customer or 0)),
            "reason": b.reason,
            "status": b.status,
            "initiated_by": initiator.name if initiator else None,
            "buyback_date": str(b.buyback_date) if b.buyback_date else None,
            "completion_date": str(b.completion_date) if b.completion_date else None,
            "created_at": str(b.created_at)
        })

    return JSONResponse(content=result, headers={"X-Total-Count": str(total_count)})

@app.get("/api/buybacks/summary")
def get_buybacks_summary(project_id: str = None, db: Session = Depends(get_db)):
    """Get buyback statistics"""
    q = db.query(Buyback)

    if project_id:
        proj = db.query(Project).filter((Project.id == project_id) | (Project.project_id == project_id)).first()
        if proj:
            inv_ids = [i.id for i in db.query(Inventory).filter(Inventory.project_id == proj.id).all()]
            q = q.filter(Buyback.inventory_id.in_(inv_ids))

    today = date.today()
    month_start = today.replace(day=1)

    total_buybacks = q.count()
    pending_count = q.filter(Buyback.status == "pending").count()
    approved_count = q.filter(Buyback.status == "approved").count()
    in_progress_count = q.filter(Buyback.status == "in_progress").count()
    completed_count = q.filter(Buyback.status == "completed").count()
    cancelled_count = q.filter(Buyback.status == "cancelled").count()

    total_buyback_value = q.filter(Buyback.status == "completed").with_entities(func.sum(Buyback.buyback_price)).scalar() or 0
    total_paid_out = q.filter(Buyback.status == "completed").with_entities(func.sum(Buyback.amount_paid_to_customer)).scalar() or 0

    month_completed = q.filter(Buyback.completion_date >= month_start, Buyback.status == "completed").count()
    month_value = q.filter(Buyback.completion_date >= month_start, Buyback.status == "completed").with_entities(func.sum(Buyback.buyback_price)).scalar() or 0

    # Pending payments (approved/in_progress with balance due)
    pending_payments = 0
    active_buybacks = db.query(Buyback).filter(Buyback.status.in_(["approved", "in_progress"])).all()
    for b in active_buybacks:
        settlement = float(b.settlement_amount or b.buyback_price)
        paid = float(b.amount_paid_to_customer or 0)
        pending_payments += (settlement - paid)

    return {
        "total_buybacks": total_buybacks,
        "by_status": {
            "pending": pending_count,
            "approved": approved_count,
            "in_progress": in_progress_count,
            "completed": completed_count,
            "cancelled": cancelled_count
        },
        "total_buyback_value": float(total_buyback_value),
        "total_paid_out": float(total_paid_out),
        "pending_payments": pending_payments,
        "month_completed": month_completed,
        "month_value": float(month_value)
    }

@app.get("/api/buybacks/{bid}")
def get_buyback(bid: str, db: Session = Depends(get_db)):
    """Get buyback details with ledger"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    txn = db.query(Transaction).filter(Transaction.id == b.original_transaction_id).first()
    inv = db.query(Inventory).filter(Inventory.id == b.inventory_id).first()
    cust = db.query(Customer).filter(Customer.id == b.original_customer_id).first()
    proj = db.query(Project).filter(Project.id == inv.project_id).first() if inv else None
    initiator = db.query(CompanyRep).filter(CompanyRep.id == b.initiated_by_rep_id).first() if b.initiated_by_rep_id else None
    approver = db.query(CompanyRep).filter(CompanyRep.id == b.approved_by_rep_id).first() if b.approved_by_rep_id else None

    # Get ledger entries
    ledger_entries = db.query(BuybackLedger).filter(BuybackLedger.buyback_id == b.id).order_by(BuybackLedger.payment_date.desc()).all()
    ledger = []
    for le in ledger_entries:
        rep = db.query(CompanyRep).filter(CompanyRep.id == le.created_by_rep_id).first() if le.created_by_rep_id else None
        ledger.append({
            "id": str(le.id),
            "ledger_id": le.ledger_id,
            "entry_type": le.entry_type,
            "amount": float(le.amount),
            "payment_method": le.payment_method,
            "reference_number": le.reference_number,
            "payment_date": str(le.payment_date) if le.payment_date else None,
            "notes": le.notes,
            "created_by": rep.name if rep else None,
            "created_at": str(le.created_at)
        })

    # Get installments status from original transaction
    installments = []
    if txn:
        insts = db.query(Installment).filter(Installment.transaction_id == txn.id).order_by(Installment.installment_number).all()
        for inst in insts:
            installments.append({
                "number": inst.installment_number,
                "amount": float(inst.amount),
                "amount_paid": float(inst.amount_paid or 0),
                "status": inst.status,
                "due_date": str(inst.due_date) if inst.due_date else None
            })

    return {
        "id": str(b.id),
        "buyback_id": b.buyback_id,
        "transaction": {
            "id": str(txn.id) if txn else None,
            "transaction_id": txn.transaction_id if txn else None,
            "booking_date": str(txn.booking_date) if txn and txn.booking_date else None,
            "total_value": float(txn.total_value) if txn else None,
            "broker_commission_rate": float(txn.broker_commission_rate) if txn and txn.broker_commission_rate else None
        },
        "inventory": {
            "id": str(inv.id) if inv else None,
            "inventory_id": inv.inventory_id if inv else None,
            "unit_number": inv.unit_number if inv else None,
            "block": inv.block if inv else None,
            "area_marla": float(inv.area_marla) if inv else None,
            "current_rate": float(inv.rate_per_marla) if inv else None,
            "status": inv.status if inv else None
        },
        "customer": {
            "id": str(cust.id) if cust else None,
            "customer_id": cust.customer_id if cust else None,
            "name": cust.name if cust else None,
            "mobile": cust.mobile if cust else None
        },
        "project": {
            "id": str(proj.id) if proj else None,
            "project_id": proj.project_id if proj else None,
            "name": proj.name if proj else None
        },
        "original_sale_price": float(b.original_sale_price),
        "buyback_price": float(b.buyback_price),
        "buyback_profit_rate": float(b.buyback_profit_rate),
        "reinventory_price": float(b.reinventory_price),
        "reinventory_markup_rate": float(b.reinventory_markup_rate),
        "original_commission_amount": float(b.original_commission_amount or 0),
        "company_cost_auto": float(b.company_cost_auto) if b.company_cost_auto else None,
        "company_cost_manual": float(b.company_cost_manual) if b.company_cost_manual else None,
        "company_cost_override": b.company_cost_override,
        "company_cost": float(b.company_cost_manual or b.company_cost_auto or 0),
        "settlement_type": b.settlement_type,
        "settlement_amount": float(b.settlement_amount) if b.settlement_amount else float(b.buyback_price),
        "amount_paid_to_customer": float(b.amount_paid_to_customer or 0),
        "balance_due": float((b.settlement_amount or b.buyback_price) - (b.amount_paid_to_customer or 0)),
        "reason": b.reason,
        "notes": b.notes,
        "status": b.status,
        "initiated_by": {"id": str(initiator.id), "name": initiator.name, "rep_id": initiator.rep_id} if initiator else None,
        "approved_by": {"id": str(approver.id), "name": approver.name, "rep_id": approver.rep_id} if approver else None,
        "approved_at": str(b.approved_at) if b.approved_at else None,
        "buyback_date": str(b.buyback_date) if b.buyback_date else None,
        "completion_date": str(b.completion_date) if b.completion_date else None,
        "created_at": str(b.created_at),
        "ledger": ledger,
        "installments": installments
    }

@app.post("/api/buybacks")
def create_buyback(data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    """Initiate a buyback for a sold transaction"""
    # Find original transaction
    txn = db.query(Transaction).filter(
        (Transaction.id == data.get("transaction_id")) |
        (Transaction.transaction_id == data.get("transaction_id"))
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if txn.status != "active":
        raise HTTPException(status_code=400, detail=f"Transaction is not active (status: {txn.status})")

    # Check if already has pending buyback
    existing = db.query(Buyback).filter(
        Buyback.original_transaction_id == txn.id,
        Buyback.status.in_(["pending", "approved", "in_progress"])
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Transaction already has an active buyback ({existing.buyback_id})")

    # Get inventory
    inv = db.query(Inventory).filter(Inventory.id == txn.inventory_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    if inv.status != "sold":
        raise HTTPException(status_code=400, detail=f"Inventory is not sold (status: {inv.status})")

    # Get initiator
    initiator = None
    if data.get("initiated_by_rep_id"):
        initiator = db.query(CompanyRep).filter(
            (CompanyRep.id == data["initiated_by_rep_id"]) | (CompanyRep.rep_id == data["initiated_by_rep_id"])
        ).first()

    # Calculate prices
    original_price = float(txn.total_value)
    commission_rate = float(txn.broker_commission_rate or 0)
    commission_amount = original_price * commission_rate / 100

    profit_rate = float(data.get("buyback_profit_rate", 5.0))
    markup_rate = float(data.get("reinventory_markup_rate", 2.0))

    buyback_price = original_price * (1 + profit_rate / 100)
    reinventory_price = buyback_price * (1 + markup_rate / 100)

    # Calculate company cost (what the company nets after all is said and done)
    # Net = Original Sale - Commission Paid - Buyback Profit Paid
    company_cost = original_price - commission_amount - (original_price * profit_rate / 100)

    # Settlement amount (may be negotiated)
    settlement_type = data.get("settlement_type", "full")
    if settlement_type == "full":
        settlement_amount = buyback_price
    else:
        settlement_amount = float(data.get("settlement_amount", buyback_price))

    # Create buyback
    buyback = Buyback(
        buyback_id=generate_buyback_id(db),
        original_transaction_id=txn.id,
        inventory_id=inv.id,
        original_customer_id=txn.customer_id,
        original_sale_price=original_price,
        buyback_price=buyback_price,
        buyback_profit_rate=profit_rate,
        reinventory_price=reinventory_price,
        reinventory_markup_rate=markup_rate,
        original_commission_amount=commission_amount,
        company_cost_auto=company_cost,
        settlement_type=settlement_type,
        settlement_amount=settlement_amount,
        reason=data.get("reason"),
        notes=data.get("notes"),
        status="pending",
        initiated_by_rep_id=initiator.id if initiator else None,
        buyback_date=date.fromisoformat(data["buyback_date"]) if data.get("buyback_date") else date.today()
    )
    db.add(buyback)

    # Update inventory status
    inv.status = "buyback_pending"

    # Create plot history entry
    history = PlotHistory(
        inventory_id=inv.id,
        event_type="buyback_initiated",
        event_date=buyback.buyback_date,
        previous_owner_id=txn.customer_id,
        transaction_id=txn.id,
        price_at_event=buyback_price,
        rate_per_marla=float(inv.rate_per_marla),
        notes=f"Buyback initiated: {data.get('reason', 'No reason specified')}",
        created_by_rep_id=initiator.id if initiator else None
    )
    db.add(history)

    db.commit()
    db.refresh(buyback)

    # Sync Vector branches to reflect buyback_pending status
    sync_vector_branches_from_orbit(inv.project_id, db)

    # Audit log
    customer = db.query(Customer).filter(Customer.id == txn.customer_id).first()
    log_audit(db, request, current_user, 'CREATE', 'buyback', buyback.buyback_id,
              f'{customer.name if customer else "Unknown"} - {inv.unit_number}')

    # Notify admins/managers about buyback initiation
    reps = db.query(CompanyRep).filter(CompanyRep.role.in_(['admin', 'manager'])).all()
    for rep in reps:
        create_notification(db, rep.rep_id,
                          f'Buyback Initiated: {inv.unit_number}',
                          f'Buyback {buyback.buyback_id} initiated for {customer.name if customer else "Unknown"} - PKR {float(buyback.buyback_price):,.0f}',
                          type='warning', category='system', entity_type='buyback', entity_id=buyback.buyback_id)
    db.commit()

    # SSE broadcast: inventory status changed to buyback_pending
    broadcast_sse('inventory_update', {
        'inventory_id': inv.inventory_id,
        'unit_number': inv.unit_number,
        'project_id': str(inv.project_id),
        'old_status': 'sold',
        'new_status': 'buyback_pending',
        'updated_by': current_user.rep_id
    })

    return {
        "message": "Buyback initiated",
        "id": str(buyback.id),
        "buyback_id": buyback.buyback_id,
        "status": buyback.status,
        "original_sale_price": float(buyback.original_sale_price),
        "buyback_price": float(buyback.buyback_price),
        "reinventory_price": float(buyback.reinventory_price),
        "company_cost": float(buyback.company_cost_auto)
    }

@app.put("/api/buybacks/{bid}")
def update_buyback(bid: str, data: dict, db: Session = Depends(get_db)):
    """Update buyback details (rates, settlement, notes)"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    if b.status == "completed":
        raise HTTPException(status_code=400, detail="Cannot update completed buyback")

    # Recalculate if rates changed
    if "buyback_profit_rate" in data or "reinventory_markup_rate" in data:
        profit_rate = float(data.get("buyback_profit_rate", b.buyback_profit_rate))
        markup_rate = float(data.get("reinventory_markup_rate", b.reinventory_markup_rate))
        original_price = float(b.original_sale_price)

        buyback_price = original_price * (1 + profit_rate / 100)
        reinventory_price = buyback_price * (1 + markup_rate / 100)
        commission = float(b.original_commission_amount or 0)
        company_cost = original_price - commission - (original_price * profit_rate / 100)

        b.buyback_profit_rate = profit_rate
        b.reinventory_markup_rate = markup_rate
        b.buyback_price = buyback_price
        b.reinventory_price = reinventory_price
        b.company_cost_auto = company_cost

        # Update settlement if it was full
        if b.settlement_type == "full":
            b.settlement_amount = buyback_price

    # Update other fields
    if "settlement_type" in data:
        b.settlement_type = data["settlement_type"]
    if "settlement_amount" in data:
        b.settlement_amount = float(data["settlement_amount"])
    if "reason" in data:
        b.reason = data["reason"]
    if "notes" in data:
        b.notes = data["notes"]
    if "company_cost_manual" in data:
        b.company_cost_manual = float(data["company_cost_manual"])
        b.company_cost_override = "true"

    db.commit()
    return {"message": "Buyback updated", "buyback_id": b.buyback_id}

@app.delete("/api/buybacks/{bid}")
def cancel_buyback(bid: str, db: Session = Depends(get_db)):
    """Cancel a pending buyback"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    if b.status not in ["pending", "approved"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel buyback with status: {b.status}")

    # Restore inventory status
    inv = db.query(Inventory).filter(Inventory.id == b.inventory_id).first()
    if inv and inv.status == "buyback_pending":
        inv.status = "sold"

    b.status = "cancelled"

    # Add history entry
    history = PlotHistory(
        inventory_id=b.inventory_id,
        event_type="buyback_cancelled",
        event_date=date.today(),
        buyback_id=b.id,
        notes="Buyback cancelled"
    )
    db.add(history)

    db.commit()

    # Sync Vector branches to reflect status change back to sold
    if inv:
        sync_vector_branches_from_orbit(inv.project_id, db)

    return {"message": "Buyback cancelled", "buyback_id": b.buyback_id}

@app.post("/api/buybacks/{bid}/approve")
def approve_buyback(bid: str, data: dict, request: Request, db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)):
    """Approve a pending buyback"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    if b.status != "pending":
        raise HTTPException(status_code=400, detail=f"Buyback is not pending (status: {b.status})")

    approver = None
    if data.get("approved_by_rep_id"):
        approver = db.query(CompanyRep).filter(
            (CompanyRep.id == data["approved_by_rep_id"]) | (CompanyRep.rep_id == data["approved_by_rep_id"])
        ).first()

    b.status = "approved"
    b.approved_by_rep_id = approver.id if approver else None
    b.approved_at = datetime.utcnow()

    db.commit()
    log_audit(db, request, current_user, 'UPDATE', 'buyback', b.buyback_id,
              f'Approved buyback {b.buyback_id}',
              {'status': {'before': 'pending', 'after': 'approved'}})
    db.commit()
    return {
        "message": "Buyback approved",
        "buyback_id": b.buyback_id,
        "status": b.status,
        "approved_at": str(b.approved_at)
    }

@app.post("/api/buybacks/{bid}/complete")
def complete_buyback(bid: str, data: dict, db: Session = Depends(get_db)):
    """Complete buyback and re-add inventory"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    if b.status not in ["approved", "in_progress"]:
        raise HTTPException(status_code=400, detail=f"Buyback must be approved first (status: {b.status})")

    inv = db.query(Inventory).filter(Inventory.id == b.inventory_id).first()
    txn = db.query(Transaction).filter(Transaction.id == b.original_transaction_id).first()

    # 1. Update original transaction
    if txn:
        txn.status = "bought_back"
        txn.buyback_id = b.id

    # 2. Clear pending installments
    if txn:
        pending_installments = db.query(Installment).filter(
            Installment.transaction_id == txn.id,
            Installment.status.in_(["pending", "partial"])
        ).all()
        for inst in pending_installments:
            inst.status = "cleared_buyback"
            inst.notes = f"Cleared via buyback {b.buyback_id}" + (f" | {inst.notes}" if inst.notes else "")

    # 3. Update inventory for re-listing
    if inv:
        # Store original price if not already stored
        if not inv.original_listing_price:
            inv.original_listing_price = float(inv.area_marla) * float(inv.rate_per_marla)

        inv.status = "available"
        inv.rate_per_marla = float(b.reinventory_price) / float(inv.area_marla)
        inv.buyback_count = (inv.buyback_count or 0) + 1
        inv.last_buyback_id = b.id
        inv.company_cost = float(b.company_cost_manual or b.company_cost_auto or 0)

    # 4. Create plot history entry
    history = PlotHistory(
        inventory_id=b.inventory_id,
        event_type="buyback",
        event_date=data.get("completion_date") and date.fromisoformat(data["completion_date"]) or date.today(),
        previous_owner_id=txn.customer_id if txn else None,
        new_owner_id=None,  # Now company-owned
        transaction_id=txn.id if txn else None,
        buyback_id=b.id,
        price_at_event=float(b.buyback_price),
        rate_per_marla=float(inv.rate_per_marla) if inv else None,
        notes=b.reason
    )
    db.add(history)

    # 5. Update buyback record
    b.status = "completed"
    b.completion_date = data.get("completion_date") and date.fromisoformat(data["completion_date"]) or date.today()
    if data.get("final_notes"):
        b.notes = (b.notes or "") + f"\n\nCompletion: {data['final_notes']}"

    db.commit()

    # Sync Vector branches to reflect plot is now available (and mark as resold if applicable)
    if inv:
        sync_vector_branches_from_orbit(inv.project_id, db)

        # SSE broadcast: inventory status changed back to available
        broadcast_sse('inventory_update', {
            'inventory_id': inv.inventory_id,
            'unit_number': inv.unit_number,
            'project_id': str(inv.project_id),
            'old_status': 'buyback_pending',
            'new_status': 'available',
            'updated_by': 'system'
        })

    return {
        "message": "Buyback completed",
        "buyback_id": b.buyback_id,
        "status": "completed",
        "inventory_status": inv.status if inv else None,
        "new_rate_per_marla": float(inv.rate_per_marla) if inv else None
    }

# Buyback Ledger Endpoints
@app.get("/api/buybacks/{bid}/ledger")
def get_buyback_ledger(bid: str, db: Session = Depends(get_db)):
    """Get all ledger entries for a buyback"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    entries = db.query(BuybackLedger).filter(BuybackLedger.buyback_id == b.id).order_by(BuybackLedger.payment_date.desc()).all()
    result = []
    for e in entries:
        rep = db.query(CompanyRep).filter(CompanyRep.id == e.created_by_rep_id).first() if e.created_by_rep_id else None
        result.append({
            "id": str(e.id),
            "ledger_id": e.ledger_id,
            "entry_type": e.entry_type,
            "amount": float(e.amount),
            "payment_method": e.payment_method,
            "reference_number": e.reference_number,
            "payment_date": str(e.payment_date) if e.payment_date else None,
            "notes": e.notes,
            "created_by": rep.name if rep else None,
            "created_at": str(e.created_at)
        })

    return {
        "buyback_id": b.buyback_id,
        "settlement_amount": float(b.settlement_amount or b.buyback_price),
        "total_paid": float(b.amount_paid_to_customer or 0),
        "balance_due": float((b.settlement_amount or b.buyback_price) - (b.amount_paid_to_customer or 0)),
        "entries": result
    }

@app.post("/api/buybacks/{bid}/ledger")
def add_ledger_entry(bid: str, data: dict, db: Session = Depends(get_db)):
    """Record a payment to customer"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    if b.status == "completed":
        raise HTTPException(status_code=400, detail="Buyback is already completed")
    if b.status == "cancelled":
        raise HTTPException(status_code=400, detail="Buyback is cancelled")

    # Get rep
    rep = None
    if data.get("created_by_rep_id"):
        rep = db.query(CompanyRep).filter(
            (CompanyRep.id == data["created_by_rep_id"]) | (CompanyRep.rep_id == data["created_by_rep_id"])
        ).first()

    amount = float(data.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    entry = BuybackLedger(
        ledger_id=generate_ledger_id(db),
        buyback_id=b.id,
        entry_type=data.get("entry_type", "payment_to_customer"),
        amount=amount,
        payment_method=data.get("payment_method"),
        reference_number=data.get("reference_number"),
        payment_date=date.fromisoformat(data["payment_date"]) if data.get("payment_date") else date.today(),
        notes=data.get("notes"),
        created_by_rep_id=rep.id if rep else None
    )
    db.add(entry)

    # Update buyback total paid
    b.amount_paid_to_customer = float(b.amount_paid_to_customer or 0) + amount

    # Update status to in_progress if it was approved
    if b.status == "approved":
        b.status = "in_progress"

    db.commit()
    db.refresh(entry)

    settlement = float(b.settlement_amount or b.buyback_price)
    total_paid = float(b.amount_paid_to_customer or 0)

    return {
        "message": "Ledger entry created",
        "ledger_id": entry.ledger_id,
        "total_paid": total_paid,
        "balance_remaining": settlement - total_paid
    }

@app.delete("/api/buybacks/{bid}/ledger/{lid}")
def delete_ledger_entry(bid: str, lid: str, db: Session = Depends(get_db)):
    """Reverse a ledger entry"""
    b = db.query(Buyback).filter((Buyback.id == bid) | (Buyback.buyback_id == bid)).first()
    if not b:
        raise HTTPException(status_code=404, detail="Buyback not found")

    entry = db.query(BuybackLedger).filter(
        (BuybackLedger.id == lid) | (BuybackLedger.ledger_id == lid),
        BuybackLedger.buyback_id == b.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Ledger entry not found")

    # Reverse the amount
    b.amount_paid_to_customer = max(0, float(b.amount_paid_to_customer or 0) - float(entry.amount))

    db.delete(entry)
    db.commit()

    return {"message": "Ledger entry deleted", "new_total_paid": float(b.amount_paid_to_customer)}

# Plot History Endpoint
@app.get("/api/inventory/{iid}/history")
def get_plot_history(iid: str, db: Session = Depends(get_db)):
    """Get ownership timeline for a plot"""
    inv = db.query(Inventory).filter(
        (Inventory.id == iid) | (Inventory.inventory_id == iid)
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")

    proj = db.query(Project).filter(Project.id == inv.project_id).first()

    # Get all history entries
    entries = db.query(PlotHistory).filter(PlotHistory.inventory_id == inv.id).order_by(PlotHistory.event_date.desc(), PlotHistory.created_at.desc()).all()

    history = []
    for h in entries:
        prev_owner = db.query(Customer).filter(Customer.id == h.previous_owner_id).first() if h.previous_owner_id else None
        new_owner = db.query(Customer).filter(Customer.id == h.new_owner_id).first() if h.new_owner_id else None
        txn = db.query(Transaction).filter(Transaction.id == h.transaction_id).first() if h.transaction_id else None
        buyback = db.query(Buyback).filter(Buyback.id == h.buyback_id).first() if h.buyback_id else None

        history.append({
            "id": str(h.id),
            "event_type": h.event_type,
            "event_date": str(h.event_date) if h.event_date else None,
            "previous_owner": {"name": prev_owner.name, "customer_id": prev_owner.customer_id} if prev_owner else None,
            "new_owner": {"name": new_owner.name, "customer_id": new_owner.customer_id} if new_owner else None,
            "transaction_id": txn.transaction_id if txn else None,
            "buyback_id": buyback.buyback_id if buyback else None,
            "price_at_event": float(h.price_at_event) if h.price_at_event else None,
            "rate_per_marla": float(h.rate_per_marla) if h.rate_per_marla else None,
            "notes": h.notes,
            "created_at": str(h.created_at)
        })

    return {
        "inventory_id": inv.inventory_id,
        "unit_number": inv.unit_number,
        "block": inv.block,
        "area_marla": float(inv.area_marla),
        "current_rate": float(inv.rate_per_marla),
        "current_status": inv.status,
        "buyback_count": inv.buyback_count or 0,
        "project": {"project_id": proj.project_id, "name": proj.name} if proj else None,
        "company_cost": float(inv.company_cost) if inv.company_cost else None,
        "original_listing_price": float(inv.original_listing_price) if inv.original_listing_price else None,
        "history": history
    }

# Costing Endpoints
@app.get("/api/costing/project/{pid}")
def get_project_costing(pid: str, db: Session = Depends(get_db)):
    """Get project-level costing summary"""
    proj = db.query(Project).filter((Project.id == pid) | (Project.project_id == pid)).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    inventory = db.query(Inventory).filter(Inventory.project_id == proj.id).all()

    total_units = len(inventory)
    available_units = sum(1 for i in inventory if i.status == "available")
    sold_units = sum(1 for i in inventory if i.status == "sold")
    buyback_pending_units = sum(1 for i in inventory if i.status == "buyback_pending")

    # Calculate values
    total_current_value = sum(float(i.area_marla) * float(i.rate_per_marla) for i in inventory)
    total_company_cost = sum(float(i.company_cost or 0) for i in inventory if i.company_cost)
    total_original_value = sum(float(i.original_listing_price or i.area_marla * i.rate_per_marla) for i in inventory)

    # Buyback stats
    buybacks = db.query(Buyback).filter(Buyback.inventory_id.in_([i.id for i in inventory])).all()
    total_buybacks = len(buybacks)
    completed_buybacks = sum(1 for b in buybacks if b.status == "completed")
    total_buyback_value = sum(float(b.buyback_price) for b in buybacks if b.status == "completed")
    total_profit_paid = sum(float(b.original_sale_price) * float(b.buyback_profit_rate) / 100 for b in buybacks if b.status == "completed")

    # Per-unit breakdown
    units = []
    for inv in inventory:
        current_value = float(inv.area_marla) * float(inv.rate_per_marla)
        company_cost = float(inv.company_cost) if inv.company_cost else current_value
        units.append({
            "inventory_id": inv.inventory_id,
            "unit_number": inv.unit_number,
            "block": inv.block,
            "area_marla": float(inv.area_marla),
            "rate_per_marla": float(inv.rate_per_marla),
            "current_value": current_value,
            "company_cost": company_cost,
            "net_margin": current_value - company_cost,
            "status": inv.status,
            "buyback_count": inv.buyback_count or 0
        })

    return {
        "project_id": proj.project_id,
        "project_name": proj.name,
        "summary": {
            "total_units": total_units,
            "available_units": available_units,
            "sold_units": sold_units,
            "buyback_pending_units": buyback_pending_units,
            "total_current_value": total_current_value,
            "total_company_cost": total_company_cost,
            "total_original_value": total_original_value,
            "total_buybacks": total_buybacks,
            "completed_buybacks": completed_buybacks,
            "total_buyback_value": total_buyback_value,
            "total_profit_paid": total_profit_paid
        },
        "units": units
    }

@app.get("/api/costing/plot/{iid}")
def get_plot_costing(iid: str, db: Session = Depends(get_db)):
    """Get plot-level costing details"""
    inv = db.query(Inventory).filter((Inventory.id == iid) | (Inventory.inventory_id == iid)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")

    proj = db.query(Project).filter(Project.id == inv.project_id).first()

    current_value = float(inv.area_marla) * float(inv.rate_per_marla)
    company_cost = float(inv.company_cost) if inv.company_cost else None
    original_value = float(inv.original_listing_price) if inv.original_listing_price else current_value

    # Get all buybacks for this plot
    buybacks = db.query(Buyback).filter(Buyback.inventory_id == inv.id).order_by(Buyback.buyback_date.desc()).all()
    buyback_history = []
    total_profit_paid = 0
    total_commission_paid = 0

    for b in buybacks:
        cust = db.query(Customer).filter(Customer.id == b.original_customer_id).first()
        if b.status == "completed":
            profit = float(b.original_sale_price) * float(b.buyback_profit_rate) / 100
            total_profit_paid += profit
            total_commission_paid += float(b.original_commission_amount or 0)

        buyback_history.append({
            "buyback_id": b.buyback_id,
            "customer_name": cust.name if cust else None,
            "original_sale_price": float(b.original_sale_price),
            "buyback_price": float(b.buyback_price),
            "profit_rate": float(b.buyback_profit_rate),
            "profit_amount": float(b.original_sale_price) * float(b.buyback_profit_rate) / 100,
            "reinventory_price": float(b.reinventory_price),
            "status": b.status,
            "buyback_date": str(b.buyback_date) if b.buyback_date else None
        })

    # Net Price per Marla = Current Rate - (Total Profit Paid + Total Commission) / Area
    deductions_per_marla = (total_profit_paid + total_commission_paid) / float(inv.area_marla) if inv.area_marla else 0
    net_price_per_marla = float(inv.rate_per_marla) - deductions_per_marla if inv.buyback_count else float(inv.rate_per_marla)

    return {
        "inventory_id": inv.inventory_id,
        "unit_number": inv.unit_number,
        "block": inv.block,
        "project": {"project_id": proj.project_id, "name": proj.name} if proj else None,
        "area_marla": float(inv.area_marla),
        "current_rate_per_marla": float(inv.rate_per_marla),
        "current_value": current_value,
        "original_value": original_value,
        "company_cost": company_cost,
        "status": inv.status,
        "buyback_count": inv.buyback_count or 0,
        "costing_breakdown": {
            "total_profit_paid": total_profit_paid,
            "total_commission_paid": total_commission_paid,
            "total_deductions": total_profit_paid + total_commission_paid,
            "deductions_per_marla": deductions_per_marla,
            "net_price_per_marla": net_price_per_marla
        },
        "buyback_history": buyback_history
    }

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
        
        # Outstanding breakdown: Overdue vs Future Receivable (single SQL query, no N+1)
        today = date.today()
        overdue_result = db.query(
            func.coalesce(func.sum(Installment.amount - func.coalesce(Installment.amount_paid, 0)), 0)
        ).filter(
            (Installment.amount - func.coalesce(Installment.amount_paid, 0)) > 0,
            Installment.due_date <= today
        ).scalar()
        total_overdue = float(overdue_result or 0)

        future_result = db.query(
            func.coalesce(func.sum(Installment.amount - func.coalesce(Installment.amount_paid, 0)), 0)
        ).filter(
            (Installment.amount - func.coalesce(Installment.amount_paid, 0)) > 0,
            Installment.due_date > today
        ).scalar()
        total_future_receivable = float(future_result or 0)
        
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


# ============================================
# DASHBOARD - OVERDUE AGING BUCKETS
# ============================================
@app.get("/api/dashboard/overdue-aging")
def dashboard_overdue_aging(db: Session = Depends(get_db)):
    """Get overdue installments grouped by aging buckets: 0-30, 31-60, 61-90, 90+ days"""
    try:
        today = date.today()

        overdue = db.query(Installment).join(
            Transaction, Transaction.id == Installment.transaction_id
        ).filter(
            Installment.due_date < today,
            Installment.status.in_(['pending', 'partial']),
            Transaction.status == 'active'
        ).all()

        buckets = {'0_30': [], '31_60': [], '61_90': [], '90_plus': []}
        totals = {'0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0}

        for inst in overdue:
            days_overdue = (today - inst.due_date).days
            balance = float(inst.amount or 0) - float(inst.amount_paid or 0)
            if balance <= 0:
                continue

            entry = {
                'installment_id': str(inst.id),
                'transaction_id': str(inst.transaction_id),
                'due_date': str(inst.due_date),
                'amount': float(inst.amount or 0),
                'amount_paid': float(inst.amount_paid or 0),
                'balance': balance,
                'days_overdue': days_overdue
            }

            txn = db.query(Transaction).filter(Transaction.id == inst.transaction_id).first()
            if txn:
                customer = db.query(Customer).filter(Customer.id == txn.customer_id).first()
                entry['customer_name'] = customer.name if customer else 'Unknown'
                entry['transaction_id_display'] = txn.transaction_id
            else:
                entry['customer_name'] = 'Unknown'
                entry['transaction_id_display'] = 'N/A'

            if days_overdue <= 30:
                buckets['0_30'].append(entry)
                totals['0_30'] += balance
            elif days_overdue <= 60:
                buckets['31_60'].append(entry)
                totals['31_60'] += balance
            elif days_overdue <= 90:
                buckets['61_90'].append(entry)
                totals['61_90'] += balance
            else:
                buckets['90_plus'].append(entry)
                totals['90_plus'] += balance

        return {
            'buckets': buckets,
            'totals': totals,
            'total_overdue': sum(totals.values()),
            'total_count': sum(len(b) for b in buckets.values())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading overdue aging: {str(e)[:200]}")


# ============================================
# DASHBOARD - REVENUE COLLECTION TREND
# ============================================
@app.get("/api/dashboard/revenue-collection-trend")
def dashboard_revenue_collection_trend(months: int = 12, db: Session = Depends(get_db)):
    """Monthly receipts collected vs installments due for the last N months"""
    try:
        today = date.today()
        start_date = today.replace(day=1) - timedelta(days=months * 30)

        due_by_month = db.query(
            extract('year', Installment.due_date).label('year'),
            extract('month', Installment.due_date).label('month'),
            func.sum(Installment.amount).label('total_due')
        ).filter(
            Installment.due_date >= start_date
        ).group_by('year', 'month').all()

        collected_by_month = db.query(
            extract('year', Receipt.payment_date).label('year'),
            extract('month', Receipt.payment_date).label('month'),
            func.sum(Receipt.amount).label('total_collected')
        ).filter(
            Receipt.payment_date >= start_date
        ).group_by('year', 'month').all()

        months_data = []
        for i in range(months):
            d = today.replace(day=1) - timedelta(days=i * 30)
            y, m = d.year, d.month
            due = next((float(r.total_due or 0) for r in due_by_month if int(r.year) == y and int(r.month) == m), 0)
            collected = next((float(r.total_collected or 0) for r in collected_by_month if int(r.year) == y and int(r.month) == m), 0)
            month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            months_data.append({
                'month': f"{month_names[m - 1]} {y}",
                'due': due,
                'collected': collected,
                'collection_rate': round((collected / due * 100) if due > 0 else 0, 1)
            })

        months_data.reverse()
        return months_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading revenue collection trend: {str(e)[:200]}")


# ============================================
# DASHBOARD - COMMISSION TRACKING
# ============================================
@app.get("/api/dashboard/commission-tracking")
def dashboard_commission_tracking(db: Session = Depends(get_db)):
    """Commission earned vs paid vs pending per broker"""
    try:
        brokers = db.query(Broker).all()
        result = []
        for broker in brokers:
            txns = db.query(Transaction).filter(
                Transaction.broker_id == broker.id,
                Transaction.status == 'active'
            ).all()
            total_earned = sum(
                float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100
                for t in txns
            )
            total_paid = float(db.query(func.sum(Payment.amount)).filter(
                Payment.broker_id == broker.id,
                Payment.payment_type == "broker_commission",
                Payment.status == "completed"
            ).scalar() or 0)
            pending = total_earned - total_paid
            if total_earned > 0:
                result.append({
                    'broker_id': broker.broker_id,
                    'broker_name': broker.name,
                    'total_earned': round(total_earned, 2),
                    'total_paid': round(total_paid, 2),
                    'pending': round(pending, 2),
                    'transactions': len(txns)
                })
        result.sort(key=lambda x: x['pending'], reverse=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading commission tracking: {str(e)[:200]}")


@app.get("/api/customers/{customer_id}/details")
def get_customer_details(customer_id: str, db: Session = Depends(get_db)):
    """Comprehensive customer details for modal popup"""
    # Find customer by customer_id or mobile
    customer = db.query(Customer).filter(
        (Customer.customer_id == customer_id) | (Customer.mobile == customer_id)
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
            "notes": getattr(customer, 'notes', None),
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
    # Find broker by broker_id or mobile
    broker = db.query(Broker).filter(
        (Broker.broker_id == broker_id) | (Broker.mobile == broker_id)
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
            "has_map": bool(p.map_pdf_base64) or bool(p.map_file_path),
            "map_file_url": f"/api/vector/maps/{p.map_file_path}" if p.map_file_path else None,
            "created_at": str(p.created_at),
            "updated_at": str(p.updated_at)
        })
    return result

@app.get("/api/vector/projects/{project_id}")
def get_vector_project(
    project_id: str,
    include_pdf: bool = Query(False, description="Include base64 PDF data in response (large payload). Default: False - returns file URL instead."),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Get Vector project details - returns full project data in JSON format for frontend.
    By default, base64 PDF data is NOT included to reduce payload size (~5MB).
    If map_file_path exists, a URL reference is returned instead.
    Set include_pdf=true to force include base64 data (backward compatibility)."""
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

        # Determine PDF data to return:
        # - If map_file_path exists, return URL reference (lightweight) instead of base64
        # - If include_pdf=true is requested, always include base64 (backward compatibility)
        # - If no file path but base64 exists, return base64 (legacy data)
        pdf_base64_value = None
        map_file_url = None

        if project.map_file_path:
            map_file_url = f"/api/vector/maps/{project.map_file_path}"
            if include_pdf:
                # Caller explicitly requested base64 data - serve it from file if possible
                file_path = os.path.join(UPLOAD_DIR, project.map_file_path)
                if os.path.exists(file_path):
                    import base64
                    with open(file_path, 'rb') as f:
                        pdf_base64_value = base64.b64encode(f.read()).decode('utf-8')
                else:
                    # Fallback to DB base64 if file is missing
                    pdf_base64_value = project.map_pdf_base64
        else:
            # No file path yet - use legacy base64 from DB (backward compatibility)
            pdf_base64_value = project.map_pdf_base64

        # Return full project data in frontend JSON format
        return {
            "projectName": project.name,
            "mapName": project.map_name or "Map",
            "pdfBase64": pdf_base64_value,
            "mapFileUrl": map_file_url,
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

    # Clean up map file from filesystem if it exists
    if project.map_file_path:
        map_path = os.path.join(UPLOAD_DIR, project.map_file_path)
        if os.path.exists(map_path):
            try:
                os.remove(map_path)
                print(f"Deleted map file: {map_path}")
            except OSError as e:
                print(f"Warning: Could not delete map file {map_path}: {e}")

    db.delete(project)
    db.commit()
    return {"message": "Vector project deleted"}

# ============================================
# VECTOR MAP FILE UPLOAD/SERVE ENDPOINTS
# ============================================
@app.post("/api/vector/projects/{project_id}/upload-map")
async def upload_vector_map(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Upload a map PDF file for a vector project.
    Stores the PDF on the filesystem instead of as base64 in the database,
    reducing DB load by ~5MB per vector project fetch."""
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")

    if not project:
        raise HTTPException(status_code=404, detail="Vector project not found")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    content_hash = hashlib.md5(content).hexdigest()[:8]
    filename = f"map_{project_id}_{content_hash}.pdf"
    filepath = os.path.join(UPLOAD_DIR, filename)

    if project.map_file_path and project.map_file_path != filename:
        old_path = os.path.join(UPLOAD_DIR, project.map_file_path)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

    with open(filepath, 'wb') as f:
        f.write(content)

    project.map_file_path = filename
    project.updated_at = func.now()
    db.commit()

    print(f"Uploaded map PDF for project {project_id}: {filename} ({len(content)} bytes)")
    return {'filename': filename, 'size': len(content), 'url': f'/api/vector/maps/{filename}'}

@app.get("/api/vector/maps/{filename}")
async def serve_vector_map(filename: str):
    """Serve a map PDF file from the filesystem."""
    safe_filename = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, safe_filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Map file not found")
    return FileResponse(filepath, media_type='application/pdf',
        headers={'Cache-Control': 'public, max-age=86400', 'Content-Disposition': f'inline; filename="{safe_filename}"'})

@app.post("/api/vector/projects/{project_id}/migrate-pdf")
async def migrate_vector_pdf_to_file(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Migrate a vector project's base64 PDF from DB to filesystem."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(403, "Only admin/manager can run migrations")
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(VectorProject).filter(VectorProject.id == project_uuid).first()
    except (ValueError, TypeError):
        raise HTTPException(400, "Invalid project ID")
    if not project:
        raise HTTPException(404, "Vector project not found")
    if project.map_file_path:
        filepath = os.path.join(UPLOAD_DIR, project.map_file_path)
        if os.path.exists(filepath):
            return {"message": "Already migrated", "filename": project.map_file_path}
    if not project.map_pdf_base64:
        return {"message": "No base64 PDF to migrate", "skipped": True}
    import base64
    try:
        content = base64.b64decode(project.map_pdf_base64)
    except Exception as e:
        raise HTTPException(400, f"Invalid base64 data: {str(e)}")
    content_hash = hashlib.md5(content).hexdigest()[:8]
    filename = f"map_{project_id}_{content_hash}.pdf"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(content)
    project.map_file_path = filename
    project.updated_at = func.now()
    # Note: We keep map_pdf_base64 for now to allow rollback.
    # To clear it and save ~5MB per project, run:
    #   UPDATE vector_projects SET map_pdf_base64 = NULL WHERE map_file_path IS NOT NULL;
    db.commit()
    print(f"Migrated PDF for project {project_id}: {filename} ({len(content)} bytes)")
    return {"message": "PDF migrated to filesystem", "filename": filename, "size": len(content), "url": f"/api/vector/maps/{filename}"}

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
    
    # Check if incomplete (no source map) - consider both base64 and file path
    is_incomplete = not (bool(project.map_pdf_base64) or bool(project.map_file_path))

    status = "standalone"
    if project.linked_project_id:
        status = recon.sync_status if recon else "linked"

    return {
        "status": status,
        "is_incomplete": is_incomplete,
        "linked_project_id": str(project.linked_project_id) if project.linked_project_id else None,
        "last_sync_at": str(recon.last_sync_at) if recon and recon.last_sync_at else None,
        "has_map": bool(project.map_pdf_base64) or bool(project.map_file_path),
        "map_file_url": f"/api/vector/maps/{project.map_file_path}" if project.map_file_path else None
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
            map_file_path=master_project.map_file_path,  # Share filesystem PDF reference
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
            map_file_path=master_project.map_file_path,  # Share filesystem PDF reference
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
            map_file_path=master_project.map_file_path,  # Share filesystem PDF reference
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
    
    is_incomplete = not (bool(project.map_pdf_base64) or bool(project.map_file_path))

    return {
        "is_incomplete": is_incomplete,
        "has_map": bool(project.map_pdf_base64) or bool(project.map_file_path),
        "map_name": project.map_name,
        "map_file_url": f"/api/vector/maps/{project.map_file_path}" if project.map_file_path else None,
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
            "has_map": bool(vp.map_pdf_base64) or bool(vp.map_file_path),
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
# NOTIFICATION ENDPOINTS
# ============================================

@app.get("/api/notifications")
async def get_notifications(
    skip: int = 0, limit: int = 20, unread_only: bool = False,
    db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)
):
    """Get notifications for current user"""
    query = db.query(Notification).filter(Notification.user_rep_id == current_user.rep_id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    total = query.count()
    items = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()
    unread_count = db.query(Notification).filter(
        Notification.user_rep_id == current_user.rep_id,
        Notification.is_read == False
    ).count()
    return {'items': [n.to_dict() for n in items], 'total': total, 'unread_count': unread_count}

@app.put("/api/notifications/read-all")
async def mark_all_notifications_read(
    db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)
):
    """Mark all notifications as read for current user"""
    db.query(Notification).filter(
        Notification.user_rep_id == current_user.rep_id,
        Notification.is_read == False
    ).update({'is_read': True, 'read_at': func.now()})
    db.commit()
    return {'status': 'ok'}

@app.put("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: int, db: Session = Depends(get_db),
    current_user: CompanyRep = Depends(get_current_user)
):
    """Mark a single notification as read"""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notif.user_rep_id != current_user.rep_id:
        raise HTTPException(status_code=403, detail="Not your notification")
    notif.is_read = True
    notif.read_at = func.now()
    db.commit()
    return {'status': 'ok'}

@app.post("/api/notifications/generate-overdue")
async def generate_overdue_notifications(
    db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)
):
    """Generate notifications for overdue installments"""
    today = datetime.now().date()

    overdue = db.query(Installment).join(
        Transaction, Installment.transaction_id == Transaction.id
    ).filter(
        Installment.due_date < today,
        Installment.status.in_(['pending', 'partial']),
        Transaction.status == 'active'
    ).all()

    created = 0
    for inst in overdue:
        # Check if we already notified about this installment today
        existing = db.query(Notification).filter(
            Notification.entity_type == 'installment',
            Notification.entity_id == str(inst.id),
            Notification.category == 'overdue',
            func.date(Notification.created_at) == today
        ).first()

        if not existing:
            txn = db.query(Transaction).filter(Transaction.id == inst.transaction_id).first()
            customer = db.query(Customer).filter(Customer.id == txn.customer_id).first() if txn else None

            balance = float(inst.amount or 0) - float(inst.amount_paid or 0)
            days_overdue = (today - inst.due_date).days

            # Notify all admin/manager users
            reps = db.query(CompanyRep).filter(CompanyRep.role.in_(['admin', 'manager'])).all()
            for rep in reps:
                seq = db.execute(text("SELECT nextval('notifications_id_seq')")).scalar()
                notif = Notification(
                    id=seq,
                    notification_id=f'NTF-{seq:05d}',
                    user_rep_id=rep.rep_id,
                    title=f'Overdue: {customer.name if customer else "Unknown"} - {days_overdue} days',
                    message=f'Installment #{inst.installment_number} for {txn.transaction_id if txn else "?"} is {days_overdue} days overdue. Balance: PKR {balance:,.0f}',
                    type='warning' if days_overdue <= 30 else 'alert',
                    category='overdue',
                    entity_type='installment',
                    entity_id=str(inst.id)
                )
                db.add(notif)
                created += 1

    db.commit()
    return {'created': created}

# ============================================
# AUDIT LOG ENDPOINTS
# ============================================

@app.get("/api/audit-log")
async def get_audit_log(
    skip: int = 0, limit: int = 50,
    entity_type: str = None, action: str = None, user_rep_id: str = None,
    db: Session = Depends(get_db), current_user: CompanyRep = Depends(get_current_user)
):
    """Get audit log entries (admin/manager only)"""
    if current_user.role not in ['admin', 'manager']:
        raise HTTPException(status_code=403, detail="Access denied")

    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_rep_id:
        query = query.filter(AuditLog.user_rep_id == user_rep_id)

    total = query.count()
    items = query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return {'items': [a.to_dict() for a in items], 'total': total}

# ============================================
# SSE REAL-TIME UPDATES ENDPOINT
# ============================================

@app.get("/api/events/stream")
async def sse_stream(current_user: CompanyRep = Depends(get_current_user)):
    """Server-Sent Events stream for real-time updates"""
    client_queue = queue.Queue(maxsize=100)

    with sse_lock:
        sse_clients.append(client_queue)

    async def event_generator():
        try:
            # Send initial connection message
            yield f"event: connected\ndata: {json_module.dumps({'user': current_user.rep_id})}\n\n"

            while True:
                try:
                    message = client_queue.get(timeout=30)
                    yield message
                except queue.Empty:
                    # Send keepalive
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            with sse_lock:
                if client_queue in sse_clients:
                    sse_clients.remove(client_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )
