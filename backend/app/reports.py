"""
Radius CRM - Report Generation Module
Data aggregation and formatting for customer, project, and broker reports
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Dict, List, Optional


def get_customer_detailed_report(customer_id: str, db: Session) -> Dict:
    """Get detailed customer financial report with interactions"""
    from main import Customer, Transaction, Installment, Interaction, CompanyRep, Project, Receipt
    
    # Get customer
    customer = db.query(Customer).filter(
        (Customer.id == customer_id) | (Customer.customer_id == customer_id) | (Customer.mobile == customer_id)
    ).first()
    if not customer:
        return None
    
    # Get transactions
    txns = db.query(Transaction).filter(Transaction.customer_id == customer.id).all()
    
    # Calculate financials
    total_sale = sum(float(t.total_value or 0) for t in txns)
    total_received = 0
    overdue = 0
    future_receivable = 0
    today = date.today()
    
    transaction_details = []
    for t in txns:
        project = db.query(Project).filter(Project.id == t.project_id).first()
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.installment_number).all()
        
        txn_received = sum(float(i.amount_paid or 0) for i in installments)
        total_received += txn_received
        
        txn_overdue = 0
        txn_future = 0
        installment_details = []
        
        for i in installments:
            balance = float(i.amount) - float(i.amount_paid or 0)
            if balance > 0:
                if i.due_date < today:
                    txn_overdue += balance
                    overdue += balance
                else:
                    txn_future += balance
                    future_receivable += balance
            
            installment_details.append({
                "number": i.installment_number,
                "due_date": str(i.due_date),
                "amount": float(i.amount),
                "paid": float(i.amount_paid or 0),
                "balance": balance,
                "status": i.status,
                "is_overdue": i.due_date < today and balance > 0
            })
        
        transaction_details.append({
            "transaction_id": t.transaction_id,
            "project_name": project.name if project else None,
            "unit_number": t.unit_number,
            "area_marla": float(t.area_marla),
            "total_value": float(t.total_value),
            "received": txn_received,
            "overdue": txn_overdue,
            "future_receivable": txn_future,
            "balance": float(t.total_value) - txn_received,
            "booking_date": str(t.booking_date) if t.booking_date else None,
            "installments": installment_details
        })
    
    # Get interactions
    interactions = db.query(Interaction).filter(Interaction.customer_id == customer.id).order_by(Interaction.created_at.desc()).all()
    interaction_history = []
    for i in interactions:
        rep = db.query(CompanyRep).filter(CompanyRep.id == i.company_rep_id).first()
        interaction_history.append({
            "interaction_id": i.interaction_id,
            "date": str(i.created_at),
            "rep_name": rep.name if rep else None,
            "rep_id": rep.rep_id if rep else None,
            "type": i.interaction_type,
            "status": i.status,
            "notes": i.notes,
            "next_follow_up": str(i.next_follow_up) if i.next_follow_up else None
        })
    
    # Get receipts summary
    receipts = db.query(Receipt).filter(Receipt.customer_id == customer.id).all()
    receipt_summary = {
        "total_count": len(receipts),
        "total_amount": sum(float(r.amount) for r in receipts),
        "by_method": {}
    }
    for r in receipts:
        method = r.payment_method or "unknown"
        if method not in receipt_summary["by_method"]:
            receipt_summary["by_method"][method] = 0
        receipt_summary["by_method"][method] += float(r.amount)
    
    return {
        "customer": {
            "customer_id": customer.customer_id,
            "name": customer.name,
            "mobile": customer.mobile,
            "email": customer.email,
            "address": customer.address,
            "cnic": customer.cnic,
            "created_at": str(customer.created_at)
        },
        "financials": {
            "total_sale": total_sale,
            "total_received": total_received,
            "overdue": overdue,
            "future_receivable": future_receivable,
            "outstanding": total_sale - total_received
        },
        "transactions": transaction_details,
        "interactions": {
            "total_count": len(interactions),
            "history": interaction_history
        },
        "receipts": receipt_summary
    }


def get_project_detailed_report(project_id: str, db: Session) -> Dict:
    """Get detailed project financial report"""
    from main import Project, Inventory, Transaction, Installment, Customer, Broker
    
    # Get project
    project = db.query(Project).filter(
        (Project.id == project_id) | (Project.project_id == project_id)
    ).first()
    if not project:
        return None
    
    # Get inventory
    inventory = db.query(Inventory).filter(Inventory.project_id == project.id).all()
    available = [i for i in inventory if i.status == "available"]
    sold = [i for i in inventory if i.status == "sold"]
    
    # Inventory summary
    total_marlas = sum(float(i.area_marla) for i in inventory)
    available_marlas = sum(float(i.area_marla) for i in available)
    sold_marlas = sum(float(i.area_marla) for i in sold)
    total_inventory_value = sum(float(i.area_marla) * float(i.rate_per_marla) for i in inventory)
    available_value = sum(float(i.area_marla) * float(i.rate_per_marla) for i in available)
    
    # Get transactions
    txns = db.query(Transaction).filter(Transaction.project_id == project.id).all()
    
    # Financial calculations
    total_sale = sum(float(t.total_value or 0) for t in txns)
    total_received = 0
    overdue = 0
    future_receivable = 0
    today = date.today()
    
    transaction_details = []
    for t in txns:
        customer = db.query(Customer).filter(Customer.id == t.customer_id).first()
        broker = db.query(Broker).filter(Broker.id == t.broker_id).first() if t.broker_id else None
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).all()
        
        txn_received = sum(float(i.amount_paid or 0) for i in installments)
        total_received += txn_received
        
        txn_overdue = 0
        txn_future = 0
        for i in installments:
            balance = float(i.amount) - float(i.amount_paid or 0)
            if balance > 0:
                if i.due_date < today:
                    txn_overdue += balance
                    overdue += balance
                else:
                    txn_future += balance
                    future_receivable += balance
        
        transaction_details.append({
            "transaction_id": t.transaction_id,
            "customer_name": customer.name if customer else None,
            "customer_id": customer.customer_id if customer else None,
            "broker_name": broker.name if broker else None,
            "broker_id": broker.broker_id if broker else None,
            "unit_number": t.unit_number,
            "area_marla": float(t.area_marla),
            "total_value": float(t.total_value),
            "received": txn_received,
            "overdue": txn_overdue,
            "future_receivable": txn_future,
            "balance": float(t.total_value) - txn_received,
            "booking_date": str(t.booking_date) if t.booking_date else None
        })
    
    return {
        "project": {
            "project_id": project.project_id,
            "name": project.name,
            "location": project.location,
            "description": project.description,
            "status": project.status
        },
        "inventory": {
            "total_units": len(inventory),
            "available_units": len(available),
            "sold_units": len(sold),
            "total_marlas": total_marlas,
            "available_marlas": available_marlas,
            "sold_marlas": sold_marlas,
            "total_value": total_inventory_value,
            "available_value": available_value,
            "sold_value": total_inventory_value - available_value,
            "details": [{
                "inventory_id": i.inventory_id,
                "unit_number": i.unit_number,
                "unit_type": i.unit_type,
                "block": i.block,
                "area_marla": float(i.area_marla),
                "rate_per_marla": float(i.rate_per_marla),
                "total_value": float(i.area_marla) * float(i.rate_per_marla),
                "status": i.status
            } for i in inventory]
        },
        "financials": {
            "total_sale": total_sale,
            "total_received": total_received,
            "overdue": overdue,
            "future_receivable": future_receivable,
            "outstanding": total_sale - total_received
        },
        "transactions": transaction_details
    }


def get_broker_detailed_report(broker_id: str, db: Session) -> Dict:
    """Get detailed broker report with commission details"""
    from main import Broker, Transaction, Payment, Interaction, CompanyRep, Customer, Project
    
    # Get broker
    broker = db.query(Broker).filter(
        (Broker.id == broker_id) | (Broker.broker_id == broker_id) | (Broker.mobile == broker_id)
    ).first()
    if not broker:
        return None
    
    # Get transactions
    txns = db.query(Transaction).filter(Transaction.broker_id == broker.id).all()
    
    # Calculate commission
    total_sale = sum(float(t.total_value or 0) for t in txns)
    total_commission_earned = sum(float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100 for t in txns)
    
    # Get commission payments
    payments = db.query(Payment).filter(
        Payment.broker_id == broker.id,
        Payment.payment_type == "broker_commission",
        Payment.status == "completed"
    ).all()
    total_commission_paid = sum(float(p.amount) for p in payments)
    commission_pending = total_commission_earned - total_commission_paid
    
    # Transaction details with commission
    transaction_details = []
    for t in txns:
        customer = db.query(Customer).filter(Customer.id == t.customer_id).first()
        project = db.query(Project).filter(Project.id == t.project_id).first()
        commission = float(t.total_value or 0) * float(t.broker_commission_rate or 0) / 100
        
        # Get payments for this transaction
        txn_payments = [p for p in payments if p.transaction_id == t.id]
        txn_commission_paid = sum(float(p.amount) for p in txn_payments)
        
        transaction_details.append({
            "transaction_id": t.transaction_id,
            "customer_name": customer.name if customer else None,
            "customer_id": customer.customer_id if customer else None,
            "project_name": project.name if project else None,
            "unit_number": t.unit_number,
            "total_value": float(t.total_value),
            "commission_rate": float(t.broker_commission_rate or 0),
            "commission_earned": commission,
            "commission_paid": txn_commission_paid,
            "commission_pending": commission - txn_commission_paid,
            "booking_date": str(t.booking_date) if t.booking_date else None
        })
    
    # Payment history
    payment_history = []
    for p in payments:
        approver = db.query(CompanyRep).filter(CompanyRep.id == p.approved_by_rep_id).first() if p.approved_by_rep_id else None
        txn = db.query(Transaction).filter(Transaction.id == p.transaction_id).first() if p.transaction_id else None
        payment_history.append({
            "payment_id": p.payment_id,
            "amount": float(p.amount),
            "payment_method": p.payment_method,
            "payment_date": str(p.payment_date) if p.payment_date else None,
            "transaction_id": txn.transaction_id if txn else None,
            "approved_by": approver.name if approver else None,
            "reference_number": p.reference_number,
            "notes": p.notes
        })
    
    # Interactions
    interactions = db.query(Interaction).filter(Interaction.broker_id == broker.id).order_by(Interaction.created_at.desc()).all()
    interaction_history = []
    for i in interactions:
        rep = db.query(CompanyRep).filter(CompanyRep.id == i.company_rep_id).first()
        interaction_history.append({
            "interaction_id": i.interaction_id,
            "date": str(i.created_at),
            "rep_name": rep.name if rep else None,
            "rep_id": rep.rep_id if rep else None,
            "type": i.interaction_type,
            "status": i.status,
            "notes": i.notes,
            "next_follow_up": str(i.next_follow_up) if i.next_follow_up else None
        })
    
    return {
        "broker": {
            "broker_id": broker.broker_id,
            "name": broker.name,
            "mobile": broker.mobile,
            "email": broker.email,
            "company": broker.company,
            "address": broker.address,
            "commission_rate": float(broker.commission_rate or 0),
            "bank_name": broker.bank_name,
            "bank_account": broker.bank_account,
            "bank_iban": broker.bank_iban,
            "status": broker.status
        },
        "financials": {
            "total_transactions": len(txns),
            "total_sale_value": total_sale,
            "total_received": 0,  # Would need to calculate from customer receipts
            "due": 0,  # Would need to calculate from installments
            "future_receivable": 0  # Would need to calculate from installments
        },
        "commission": {
            "total_earned": total_commission_earned,
            "total_paid": total_commission_paid,
            "pending": commission_pending
        },
        "transactions": transaction_details,
        "payments": payment_history,
        "interactions": {
            "total_count": len(interactions),
            "history": interaction_history
        }
    }

