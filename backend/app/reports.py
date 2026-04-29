"""
Orbit by Malik Amin - Report Generation Module
Data aggregation and formatting for customer, project, and broker reports
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime
from typing import Dict, List, Optional
import uuid


def _get_marla_wise_breakdown(inventory: List) -> List[Dict]:
    """Group inventory by marla ranges for summary"""
    marla_ranges = {}
    for i in inventory:
        marla = float(i.area_marla or 0)
        rate = float(i.rate_per_marla or 0)
        value = marla * rate
        status = i.status or "available"
        
        # Create range key (e.g., "5-10", "10-15")
        if marla < 5:
            range_key = "0-5"
        elif marla < 10:
            range_key = "5-10"
        elif marla < 15:
            range_key = "10-15"
        elif marla < 20:
            range_key = "15-20"
        else:
            range_key = "20+"
        
        if range_key not in marla_ranges:
            marla_ranges[range_key] = {
                "range": range_key,
                "total_units": 0,
                "available_units": 0,
                "sold_units": 0,
                "total_marlas": 0,
                "available_marlas": 0,
                "sold_marlas": 0,
                "total_value": 0,
                "available_value": 0,
                "sold_value": 0
            }
        
        marla_ranges[range_key]["total_units"] += 1
        marla_ranges[range_key]["total_marlas"] += marla
        marla_ranges[range_key]["total_value"] += value
        
        if status == "available":
            marla_ranges[range_key]["available_units"] += 1
            marla_ranges[range_key]["available_marlas"] += marla
            marla_ranges[range_key]["available_value"] += value
        elif status == "sold":
            marla_ranges[range_key]["sold_units"] += 1
            marla_ranges[range_key]["sold_marlas"] += marla
            marla_ranges[range_key]["sold_value"] += value
    
    return sorted(marla_ranges.values(), key=lambda x: x["range"])


def get_customer_detailed_report(customer_id: str, db: Session) -> Dict:
    """Get detailed customer financial report with interactions"""
    try:
        from app.main import Customer, Transaction, Installment, Interaction, CompanyRep, Project, Receipt, ReceiptAllocation
    except ImportError:
        from main import Customer, Transaction, Installment, Interaction, CompanyRep, Project, Receipt, ReceiptAllocation
    
    # Get customer - handle UUID conversion
    try:
        customer_uuid = uuid.UUID(customer_id)
        customer = db.query(Customer).filter(
            (Customer.id == customer_uuid) | 
            (Customer.customer_id == customer_id) | 
            (Customer.mobile == customer_id)
        ).first()
    except ValueError:
        # If not a valid UUID, only search by customer_id or mobile
        customer = db.query(Customer).filter(
            (Customer.customer_id == customer_id) | 
            (Customer.mobile == customer_id)
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
    
    # Get all receipts with allocations
    all_receipts = db.query(Receipt).filter(Receipt.customer_id == customer.id).all()
    receipt_allocations_map = {}
    for receipt in all_receipts:
        allocations = db.query(ReceiptAllocation).filter(ReceiptAllocation.receipt_id == receipt.id).all()
        for alloc in allocations:
            if alloc.installment_id not in receipt_allocations_map:
                receipt_allocations_map[alloc.installment_id] = []
            receipt_allocations_map[alloc.installment_id].append({
                "receipt_id": receipt.receipt_id,
                "amount": float(alloc.amount),
                "payment_date": str(receipt.payment_date) if receipt.payment_date else None,
                "payment_method": receipt.payment_method,
                "reference_number": receipt.reference_number
            })
    
    # Get unallocated receipts (receipts without allocations)
    unallocated_receipts = []
    for receipt in all_receipts:
        allocations = db.query(ReceiptAllocation).filter(ReceiptAllocation.receipt_id == receipt.id).all()
        allocated_amount = sum(float(a.amount) for a in allocations)
        receipt_amount = float(receipt.amount or 0)
        if allocated_amount < receipt_amount:
            unallocated_receipts.append({
                "receipt_id": receipt.receipt_id,
                "total_amount": receipt_amount,
                "allocated_amount": allocated_amount,
                "unallocated_amount": receipt_amount - allocated_amount,
                "payment_date": str(receipt.payment_date) if receipt.payment_date else None,
                "payment_method": receipt.payment_method,
                "reference_number": receipt.reference_number
            })
    
    transaction_details = []
    all_installments_schedule = []
    
    for t in txns:
        project = db.query(Project).filter(Project.id == t.project_id).first() if t.project_id else None
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.installment_number).all() if t.id else []
        
        txn_received = sum(float(i.amount_paid or 0) for i in installments)
        total_received += txn_received
        
        txn_overdue = 0
        txn_future = 0
        installment_details = []
        
        for i in installments:
            amount = float(i.amount or 0)
            amount_paid = float(i.amount_paid or 0)
            balance = amount - amount_paid
            
            # Calculate days outstanding
            days_outstanding = None
            if i.due_date and balance > 0:
                if i.due_date < today:
                    days_outstanding = (today - i.due_date).days
                else:
                    days_outstanding = 0
            
            # Get receipt allocations for this installment
            receipt_allocations = receipt_allocations_map.get(i.id, [])
            
            if balance > 0 and i.due_date:
                if i.due_date < today:
                    txn_overdue += balance
                    overdue += balance
                else:
                    txn_future += balance
                    future_receivable += balance
            
            installment_data = {
                "number": i.installment_number or 0,
                "due_date": str(i.due_date) if i.due_date else None,
                "amount": amount,
                "paid": amount_paid,
                "balance": balance,
                "status": i.status or "pending",
                "is_overdue": i.due_date and i.due_date < today and balance > 0,
                "days_outstanding": days_outstanding,
                "transaction_id": t.transaction_id,
                "project_name": project.name if project else None,
                "receipt_allocations": receipt_allocations
            }
            
            installment_details.append(installment_data)
            all_installments_schedule.append(installment_data)
        
        transaction_details.append({
            "transaction_id": t.transaction_id,
            "project_name": project.name if project else None,
            "project_id": project.project_id if project else None,
            "unit_number": t.unit_number or None,
            "area_marla": float(t.area_marla or 0),
            "total_value": float(t.total_value or 0),
            "received": txn_received,
            "overdue": txn_overdue,
            "future_receivable": txn_future,
            "balance": float(t.total_value or 0) - txn_received,
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
        "total_amount": sum(float(r.amount or 0) for r in receipts),
        "by_method": {}
    }
    for r in receipts:
        method = r.payment_method or "unknown"
        if method not in receipt_summary["by_method"]:
            receipt_summary["by_method"][method] = 0
        receipt_summary["by_method"][method] += float(r.amount or 0)
    
    # Sort installments schedule by due date
    all_installments_schedule.sort(key=lambda x: x["due_date"] if x["due_date"] else "9999-99-99")
    
    return {
        "report_header": {
            "title": "Customer Detailed Financial Report",
            "generated_by": "Orbit by Malik Amin",
            "generated_at": str(datetime.now()),
            "report_type": "customer"
        },
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
        "installment_schedule": all_installments_schedule,
        "unallocated_receipts": unallocated_receipts,
        "interactions": {
            "total_count": len(interactions),
            "history": interaction_history
        },
        "receipts": receipt_summary
    }


def get_project_detailed_report(project_id: str, db: Session) -> Dict:
    """Get detailed project financial report"""
    try:
        from app.main import Project, Inventory, Transaction, Installment, Customer, Broker, ReceiptAllocation, Receipt
    except ImportError:
        from main import Project, Inventory, Transaction, Installment, Customer, Broker, ReceiptAllocation, Receipt
    
    # Get project - handle UUID conversion
    try:
        project_uuid = uuid.UUID(project_id)
        project = db.query(Project).filter(
            (Project.id == project_uuid) | 
            (Project.project_id == project_id)
        ).first()
    except ValueError:
        # If not a valid UUID, only search by project_id
        project = db.query(Project).filter(
            Project.project_id == project_id
        ).first()
    
    if not project:
        return None
    
    # Get inventory
    inventory = db.query(Inventory).filter(Inventory.project_id == project.id).all()
    available = [i for i in inventory if i.status == "available"]
    sold = [i for i in inventory if i.status == "sold"]
    
    # Inventory summary
    total_marlas = sum(float(i.area_marla or 0) for i in inventory)
    available_marlas = sum(float(i.area_marla or 0) for i in available)
    sold_marlas = sum(float(i.area_marla or 0) for i in sold)
    total_inventory_value = sum(float(i.area_marla or 0) * float(i.rate_per_marla or 0) for i in inventory)
    available_value = sum(float(i.area_marla or 0) * float(i.rate_per_marla or 0) for i in available)
    
    # Get transactions
    txns = db.query(Transaction).filter(Transaction.project_id == project.id).all()
    
    # Financial calculations
    total_sale = sum(float(t.total_value or 0) for t in txns)
    total_received = 0
    overdue = 0
    future_receivable = 0
    today = date.today()
    
    # Group by customer for receivables
    customer_receivables = {}
    transaction_details = []
    all_customer_installments = []
    
    for t in txns:
        customer = db.query(Customer).filter(Customer.id == t.customer_id).first() if t.customer_id else None
        broker = db.query(Broker).filter(Broker.id == t.broker_id).first() if t.broker_id else None
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).order_by(Installment.installment_number).all() if t.id else []
        
        txn_received = sum(float(i.amount_paid or 0) for i in installments)
        total_received += txn_received
        
        txn_overdue = 0
        txn_future = 0
        installment_details = []
        
        for i in installments:
            amount = float(i.amount or 0)
            amount_paid = float(i.amount_paid or 0)
            balance = amount - amount_paid
            
            # Calculate days outstanding
            days_outstanding = None
            if i.due_date and balance > 0:
                if i.due_date < today:
                    days_outstanding = (today - i.due_date).days
                else:
                    days_outstanding = 0
            
            # Get receipt allocations
            allocations = db.query(ReceiptAllocation).filter(ReceiptAllocation.installment_id == i.id).all()
            receipt_allocations = []
            for alloc in allocations:
                receipt = db.query(Receipt).filter(Receipt.id == alloc.receipt_id).first()
                if receipt:
                    receipt_allocations.append({
                        "receipt_id": receipt.receipt_id,
                        "amount": float(alloc.amount),
                        "payment_date": str(receipt.payment_date) if receipt.payment_date else None,
                        "payment_method": receipt.payment_method
                    })
            
            if balance > 0 and i.due_date:
                if i.due_date < today:
                    txn_overdue += balance
                    overdue += balance
                else:
                    txn_future += balance
                    future_receivable += balance
            
            installment_data = {
                "installment_number": i.installment_number or 0,
                "due_date": str(i.due_date) if i.due_date else None,
                "amount": amount,
                "paid": amount_paid,
                "balance": balance,
                "days_outstanding": days_outstanding,
                "is_overdue": i.due_date and i.due_date < today and balance > 0,
                "receipt_allocations": receipt_allocations,
                "transaction_id": t.transaction_id,
                "unit_number": t.unit_number
            }
            
            installment_details.append(installment_data)
            
            # Group by customer for receivables
            if customer and balance > 0:
                customer_key = customer.customer_id
                if customer_key not in customer_receivables:
                    customer_receivables[customer_key] = {
                        "customer_id": customer.customer_id,
                        "customer_name": customer.name,
                        "mobile": customer.mobile,
                        "total_overdue": 0,
                        "total_future": 0,
                        "total_outstanding": 0,
                        "installments": []
                    }
                
                customer_receivables[customer_key]["total_outstanding"] += balance
                if i.due_date and i.due_date < today:
                    customer_receivables[customer_key]["total_overdue"] += balance
                else:
                    customer_receivables[customer_key]["total_future"] += balance
                
                customer_receivables[customer_key]["installments"].append(installment_data)
                all_customer_installments.append({
                    **installment_data,
                    "customer_id": customer.customer_id,
                    "customer_name": customer.name
                })
        
        transaction_details.append({
            "transaction_id": t.transaction_id,
            "customer_name": customer.name if customer else None,
            "customer_id": customer.customer_id if customer else None,
            "broker_name": broker.name if broker else None,
            "broker_id": broker.broker_id if broker else None,
            "unit_number": t.unit_number or None,
            "area_marla": float(t.area_marla or 0),
            "total_value": float(t.total_value or 0),
            "received": txn_received,
            "overdue": txn_overdue,
            "future_receivable": txn_future,
            "balance": float(t.total_value or 0) - txn_received,
            "booking_date": str(t.booking_date) if t.booking_date else None,
            "installments": installment_details
        })
    
    # Sort customer receivables by total outstanding (descending)
    customer_receivables_list = sorted(
        customer_receivables.values(),
        key=lambda x: x["total_outstanding"],
        reverse=True
    )
    
    # Sort installments by days outstanding for each customer
    for customer_data in customer_receivables_list:
        customer_data["installments"].sort(
            key=lambda x: (x["days_outstanding"] if x["days_outstanding"] is not None else 9999, x["due_date"] or "")
        )
    
    return {
        "report_header": {
            "title": "Project Financial Report",
            "generated_by": "Orbit by Malik Amin",
            "generated_at": str(datetime.now()),
            "report_type": "project"
        },
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
                "unit_number": i.unit_number or None,
                "unit_type": i.unit_type or None,
                "block": i.block or None,
                "area_marla": float(i.area_marla or 0),
                "rate_per_marla": float(i.rate_per_marla or 0),
                "total_value": float(i.area_marla or 0) * float(i.rate_per_marla or 0),
                "status": i.status or "available"
            } for i in inventory],
            "marla_wise_breakdown": _get_marla_wise_breakdown(inventory)
        },
        "financials": {
            "total_sale": total_sale,
            "total_received": total_received,
            "overdue": overdue,
            "future_receivable": future_receivable,
            "outstanding": total_sale - total_received
        },
        "transactions": transaction_details,
        "customer_receivables": customer_receivables_list,
        "installment_schedule": sorted(all_customer_installments, key=lambda x: (x["days_outstanding"] if x["days_outstanding"] is not None else 9999, x["due_date"] or ""))
    }


def get_broker_detailed_report(broker_id: str, db: Session) -> Dict:
    """Get detailed broker report with commission details"""
    try:
        from app.main import Broker, Transaction, Payment, Interaction, CompanyRep, Customer, Project, Installment
    except ImportError:
        from main import Broker, Transaction, Payment, Interaction, CompanyRep, Customer, Project, Installment
    
    # Get broker - handle UUID conversion
    try:
        broker_uuid = uuid.UUID(broker_id)
        broker = db.query(Broker).filter(
            (Broker.id == broker_uuid) | 
            (Broker.broker_id == broker_id) | 
            (Broker.mobile == broker_id)
        ).first()
    except ValueError:
        # If not a valid UUID, only search by broker_id or mobile
        broker = db.query(Broker).filter(
            (Broker.broker_id == broker_id) | 
            (Broker.mobile == broker_id)
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
    total_commission_paid = sum(float(p.amount or 0) for p in payments)
    commission_pending = total_commission_earned - total_commission_paid
    
    # Calculate financials from broker's transactions (customer receipts, due, future receivable)
    total_received = 0
    total_due = 0
    total_future_receivable = 0
    today = date.today()
    
    for t in txns:
        installments = db.query(Installment).filter(Installment.transaction_id == t.id).all() if t.id else []
        for i in installments:
            amount_paid = float(i.amount_paid or 0)
            total_received += amount_paid
            
            amount = float(i.amount or 0)
            balance = amount - amount_paid
            if balance > 0 and i.due_date:
                if i.due_date < today:
                    total_due += balance
                else:
                    total_future_receivable += balance
    
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
        "report_header": {
            "title": "Broker Detailed Report",
            "generated_by": "Orbit by Malik Amin",
            "generated_at": str(datetime.now()),
            "report_type": "broker"
        },
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
            "total_received": total_received,
            "due": total_due,
            "future_receivable": total_future_receivable,
            "outstanding": total_sale - total_received
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


def get_receivables_timeline(project_ids: List[str], db: Session) -> Dict:
    """Month-wise receivables timeline across selected projects.

    Groups all installments with outstanding balance by calendar month.
    Overdue = due_date < today, Future = due_date >= today.
    """
    try:
        from app.main import Project, Transaction, Installment, Customer
    except ImportError:
        from main import Project, Transaction, Installment, Customer

    today = date.today()
    current_month_key = today.strftime("%Y-%m")

    # Resolve project IDs to ORM objects
    if project_ids:
        project_list = []
        for pid in project_ids:
            try:
                p_uuid = uuid.UUID(pid)
                project = db.query(Project).filter(
                    (Project.id == p_uuid) | (Project.project_id == pid)
                ).first()
            except ValueError:
                project = db.query(Project).filter(Project.project_id == pid).first()
            if project:
                project_list.append(project)
    else:
        project_list = db.query(Project).all()

    # month_key -> month bucket
    months_data: Dict[str, Dict] = {}
    summary = {
        "total_overdue": 0.0,
        "total_future": 0.0,
        "total_outstanding": 0.0,
        "total_installments": 0,
    }

    for project in project_list:
        txns = db.query(Transaction).filter(Transaction.project_id == project.id).all()

        for txn in txns:
            customer = db.query(Customer).filter(Customer.id == txn.customer_id).first() if txn.customer_id else None
            installments = (
                db.query(Installment)
                .filter(Installment.transaction_id == txn.id)
                .order_by(Installment.installment_number)
                .all()
            )

            for inst in installments:
                amount = float(inst.amount or 0)
                amount_paid = float(inst.amount_paid or 0)
                balance = amount - amount_paid

                if balance <= 0 or not inst.due_date:
                    continue

                is_overdue = inst.due_date < today
                month_key = inst.due_date.strftime("%Y-%m")
                month_label = inst.due_date.strftime("%B %Y")
                days_outstanding = (today - inst.due_date).days if is_overdue else 0

                # Determine month category for visual labelling
                if month_key < current_month_key:
                    month_type = "overdue"
                elif month_key == current_month_key:
                    month_type = "current"
                else:
                    month_type = "future"

                # --- month bucket ---
                if month_key not in months_data:
                    months_data[month_key] = {
                        "month_key": month_key,
                        "month_label": month_label,
                        "month_type": month_type,
                        "total_installments": 0,
                        "total_due": 0.0,
                        "total_paid": 0.0,
                        "overdue": 0.0,
                        "future_receivable": 0.0,
                        "total_balance": 0.0,
                        "projects": {},
                    }

                month = months_data[month_key]
                month["total_installments"] += 1
                month["total_due"] += amount
                month["total_paid"] += amount_paid
                month["total_balance"] += balance
                if is_overdue:
                    month["overdue"] += balance
                else:
                    month["future_receivable"] += balance

                # --- project bucket inside month ---
                proj_key = str(project.id)
                if proj_key not in month["projects"]:
                    month["projects"][proj_key] = {
                        "project_id": project.project_id,
                        "project_name": project.name,
                        "installments_count": 0,
                        "total_due": 0.0,
                        "total_paid": 0.0,
                        "overdue": 0.0,
                        "future_receivable": 0.0,
                        "total_balance": 0.0,
                        "customers": {},
                    }

                proj = month["projects"][proj_key]
                proj["installments_count"] += 1
                proj["total_due"] += amount
                proj["total_paid"] += amount_paid
                proj["total_balance"] += balance
                if is_overdue:
                    proj["overdue"] += balance
                else:
                    proj["future_receivable"] += balance

                # --- customer bucket inside project ---
                cust_key = customer.customer_id if customer else "unknown"
                if cust_key not in proj["customers"]:
                    proj["customers"][cust_key] = {
                        "customer_id": customer.customer_id if customer else None,
                        "customer_name": customer.name if customer else "Unknown",
                        "mobile": customer.mobile if customer else None,
                        "total_due": 0.0,
                        "total_paid": 0.0,
                        "overdue": 0.0,
                        "future_receivable": 0.0,
                        "total_balance": 0.0,
                        "installments": [],
                    }

                cust = proj["customers"][cust_key]
                cust["total_due"] += amount
                cust["total_paid"] += amount_paid
                cust["total_balance"] += balance
                if is_overdue:
                    cust["overdue"] += balance
                else:
                    cust["future_receivable"] += balance

                cust["installments"].append({
                    "installment_number": inst.installment_number or 0,
                    "due_date": str(inst.due_date),
                    "amount": amount,
                    "paid": amount_paid,
                    "balance": balance,
                    "is_overdue": is_overdue,
                    "days_outstanding": days_outstanding,
                    "unit_number": txn.unit_number or "-",
                    "transaction_id": txn.transaction_id,
                })

                summary["total_installments"] += 1
                summary["total_outstanding"] += balance
                if is_overdue:
                    summary["total_overdue"] += balance
                else:
                    summary["total_future"] += balance

    # Flatten dicts to sorted lists
    months_sorted = []
    for month_key in sorted(months_data.keys()):
        month = months_data[month_key]
        projects_list = []
        for proj in sorted(month["projects"].values(), key=lambda x: x["project_name"]):
            customers_list = sorted(
                proj["customers"].values(),
                key=lambda x: x["total_balance"],
                reverse=True,
            )
            for c in customers_list:
                c["installments"].sort(key=lambda x: x["due_date"] or "")
            proj["customers"] = customers_list
            projects_list.append(proj)
        month["projects"] = projects_list
        months_sorted.append(month)

    return {
        "report_header": {
            "title": "Receivables Timeline Report",
            "generated_by": "Orbit by Malik Amin",
            "generated_at": str(datetime.now()),
            "report_type": "receivables_timeline",
        },
        "filters": {
            "project_ids": [p.project_id for p in project_list],
            "project_names": {p.project_id: p.name for p in project_list},
            "all_projects": len(project_ids) == 0,
        },
        "summary": summary,
        "months": months_sorted,
    }

