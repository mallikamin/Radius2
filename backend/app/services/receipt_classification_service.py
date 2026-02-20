"""
Receipt Classification Service
===============================
Classifies transaction payment status based on cumulative paid-to-date percentage.

Classification tiers:
  - TOKEN_MONEY:              0% <= paid% < 10%
  - PARTIAL_DOWN_PAYMENT:    10% <= paid% < x%
  - DOWN_PAYMENT_COMPLETED:  paid% >= x%

Where x = first installment (booking) percentage, resolved in order:
  0. Historical pin: transaction.payment_plan_version_id (if set)
  1. Inventory-level payment override
  2. Active project payment plan version (prefer locked, then default)
  3. Legacy fallback: 100 / num_installments

Phase 2 contract ref: PHASE2_API_CONTRACT_RBAC_IMPACT.md §4.2
"""

import logging
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger("orbit.receipt_classification")

# Classification constants
TOKEN_MONEY = "TOKEN_MONEY"
PARTIAL_DOWN_PAYMENT = "PARTIAL_DOWN_PAYMENT"
DOWN_PAYMENT_COMPLETED = "DOWN_PAYMENT_COMPLETED"


def _get_models():
    """Import ORM models with fallback for both app boot paths.

    Under uvicorn (app.main):  ``from app.main import ...``
    Under direct/test:         ``from main import ...``
    """
    try:
        from app.main import (
            Installment,
            ProjectInventoryPaymentOverride,
            ProjectPaymentPlan,
            ProjectPaymentPlanVersion,
        )
    except ImportError:
        from main import (  # type: ignore[no-redef]
            Installment,
            ProjectInventoryPaymentOverride,
            ProjectPaymentPlan,
            ProjectPaymentPlanVersion,
        )
    return Installment, ProjectInventoryPaymentOverride, ProjectPaymentPlan, ProjectPaymentPlanVersion


def _extract_booking_percent(installments_json):
    """Extract the first installment's percentage from a JSONB installment array.
    Returns Decimal or None if data is invalid/empty."""
    if not installments_json or not isinstance(installments_json, list) or len(installments_json) == 0:
        return None
    try:
        sorted_items = sorted(installments_json, key=lambda i: i.get("number", 0))
        return Decimal(str(sorted_items[0]["percentage"]))
    except (KeyError, TypeError, IndexError, ValueError):
        return None


def resolve_down_payment_threshold(transaction, db):
    """
    Resolve the down payment threshold percentage (x) for a transaction.

    Resolution order:
      0. Historical pin — if transaction.payment_plan_version_id is set,
         use that version directly (immutable snapshot at booking time).
      1. Inventory override  (project_inventory_payment_overrides)
      2. Active project payment plan — prefer locked plan first,
         then fall back to any active default plan.
      3. Legacy fallback (equal split: 100 / num_installments)

    Returns: (threshold_percent: Decimal, payment_rule_source: str, version_id: uuid|None)
    """
    (
        Installment,
        ProjectInventoryPaymentOverride,
        ProjectPaymentPlan,
        ProjectPaymentPlanVersion,
    ) = _get_models()

    # ── 0. Historical pin ─────────────────────────────────────────────
    pinned_vid = getattr(transaction, "payment_plan_version_id", None)
    if pinned_vid:
        version = (
            db.query(ProjectPaymentPlanVersion)
            .filter(ProjectPaymentPlanVersion.id == pinned_vid)
            .first()
        )
        if version and version.installments:
            pct = _extract_booking_percent(version.installments)
            if pct is not None:
                return (pct, "pinned_version", version.id)
        # If pinned version missing/corrupt, log and continue to fallback
        logger.warning(
            "Pinned payment_plan_version_id=%s not found or empty for txn %s — falling through",
            pinned_vid, getattr(transaction, "id", "?"),
        )

    # ── 1. Inventory override ─────────────────────────────────────────
    override = (
        db.query(ProjectInventoryPaymentOverride)
        .filter(ProjectInventoryPaymentOverride.inventory_id == transaction.inventory_id)
        .first()
    )

    if override:
        if override.override_type == "plan_version" and override.plan_version_id:
            version = (
                db.query(ProjectPaymentPlanVersion)
                .filter(ProjectPaymentPlanVersion.id == override.plan_version_id)
                .first()
            )
            if version:
                pct = _extract_booking_percent(version.installments)
                if pct is not None:
                    return (pct, "inventory_override", version.id)
        elif override.override_type == "custom" and override.custom_installments:
            pct = _extract_booking_percent(override.custom_installments)
            if pct is not None:
                return (pct, "inventory_override", None)

    # ── 2. Active project payment plan version ────────────────────────
    #   Prefer: locked active plan > default active plan > any active plan
    plan = None

    # 2a. Locked + active default
    plan = (
        db.query(ProjectPaymentPlan)
        .filter(
            ProjectPaymentPlan.project_id == transaction.project_id,
            ProjectPaymentPlan.status == "active",
            ProjectPaymentPlan.is_locked == True,
            ProjectPaymentPlan.is_default == True,
        )
        .first()
    )

    # 2b. Locked + active (any, not necessarily default)
    if not plan:
        plan = (
            db.query(ProjectPaymentPlan)
            .filter(
                ProjectPaymentPlan.project_id == transaction.project_id,
                ProjectPaymentPlan.status == "active",
                ProjectPaymentPlan.is_locked == True,
            )
            .first()
        )

    # 2c. Active default (unlocked)
    if not plan:
        plan = (
            db.query(ProjectPaymentPlan)
            .filter(
                ProjectPaymentPlan.project_id == transaction.project_id,
                ProjectPaymentPlan.status == "active",
                ProjectPaymentPlan.is_default == True,
            )
            .first()
        )

    if plan:
        version = (
            db.query(ProjectPaymentPlanVersion)
            .filter(
                ProjectPaymentPlanVersion.plan_id == plan.id,
                ProjectPaymentPlanVersion.is_active == True,
            )
            .first()
        )
        if version and version.installments:
            pct = _extract_booking_percent(version.installments)
            if pct is not None:
                return (pct, "project_plan", version.id)

    # ── 3. Legacy fallback ────────────────────────────────────────────
    num_inst = getattr(transaction, "num_installments", None) or 4
    threshold = (Decimal("100") / Decimal(str(num_inst))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return (threshold, "legacy_default", None)


def classify_receipt(transaction, db):
    """
    Classify payment status of a transaction based on cumulative paid amount.

    Reads cumulative_paid from all installments' amount_paid.
    This is a READ-ONLY operation — no payment plan mutations.

    Returns dict:
      {
        "classification": TOKEN_MONEY | PARTIAL_DOWN_PAYMENT | DOWN_PAYMENT_COMPLETED,
        "cumulative_paid": float,
        "total_value": float,
        "paid_percent": float,
        "threshold_percent": float,
        "payment_rule_source": str,
        "plan_version_id": str | None
      }

    Raises no exceptions — returns error-detail dict on failure.
    """
    Installment = _get_models()[0]

    # Calculate cumulative paid across all installments for this transaction
    installments = (
        db.query(Installment)
        .filter(Installment.transaction_id == transaction.id)
        .all()
    )

    cumulative_paid = sum(Decimal(str(i.amount_paid or 0)) for i in installments)
    total_value = Decimal(str(transaction.total_value))

    # Guard: zero or negative total (shouldn't happen, but be safe)
    if total_value <= 0:
        return {
            "classification": TOKEN_MONEY,
            "cumulative_paid": float(cumulative_paid),
            "total_value": float(total_value),
            "paid_percent": 0.0,
            "threshold_percent": 0.0,
            "payment_rule_source": "legacy_default",
            "plan_version_id": None,
        }

    paid_percent = ((cumulative_paid / total_value) * 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # Resolve threshold
    threshold, source, version_id = resolve_down_payment_threshold(transaction, db)

    # Classify (checked in order — TOKEN_MONEY floor at 10%)
    if paid_percent < Decimal("10"):
        classification = TOKEN_MONEY
    elif paid_percent < threshold:
        classification = PARTIAL_DOWN_PAYMENT
    else:
        classification = DOWN_PAYMENT_COMPLETED

    return {
        "classification": classification,
        "cumulative_paid": float(cumulative_paid),
        "total_value": float(total_value),
        "paid_percent": float(paid_percent),
        "threshold_percent": float(threshold),
        "payment_rule_source": source,
        "plan_version_id": str(version_id) if version_id else None,
    }
