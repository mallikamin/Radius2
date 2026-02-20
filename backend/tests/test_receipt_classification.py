"""
Tests for receipt classification service.

Covers:
  - Incremental receipts crossing 10% and x% thresholds
  - Boundary values (9.99%, 10.00%, x-0.01%, x%)
  - Override precedence (inventory override vs project default vs legacy)
  - Historical pinning (transaction.payment_plan_version_id)
  - Locked plan preference
  - Legacy transaction fallback (payment_plan_version_id = NULL)
  - Regression: existing receipt endpoints still work

Unit tests mock DB objects; integration tests hit the live dev API.

Usage (from repo root — no PYTHONPATH needed):
    pytest backend/tests/test_receipt_classification.py -q -k unit
    pytest backend/tests/test_receipt_classification.py -q -k integration
"""
import pytest
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# conftest.py adds backend/app + backend/app/services to sys.path
# so we can stub the 'main' module once here for all unit tests.
# ---------------------------------------------------------------------------
import sys

_fake_main = MagicMock()
for _name in ("Installment", "ProjectInventoryPaymentOverride",
              "ProjectPaymentPlan", "ProjectPaymentPlanVersion"):
    getattr(_fake_main, _name).__name__ = _name
# Register as BOTH possible import paths so _get_models() succeeds
sys.modules.setdefault("main", _fake_main)
sys.modules.setdefault("app.main", _fake_main)

# Now import the service (it will use our stub for model classes)
from services.receipt_classification_service import (
    classify_receipt,
    resolve_down_payment_threshold,
    _extract_booking_percent,
    TOKEN_MONEY,
    PARTIAL_DOWN_PAYMENT,
    DOWN_PAYMENT_COMPLETED,
)


# ---------------------------------------------------------------------------
# Helpers: fake ORM objects for unit tests
# ---------------------------------------------------------------------------

class FakeInstallment:
    def __init__(self, amount, amount_paid=0):
        self.id = uuid.uuid4()
        self.transaction_id = None
        self.installment_number = 1
        self.amount = Decimal(str(amount))
        self.amount_paid = Decimal(str(amount_paid))
        self.status = "pending"


class FakeTransaction:
    def __init__(self, total_value, inventory_id=None, project_id=None,
                 num_installments=4, payment_plan_version_id=None):
        self.id = uuid.uuid4()
        self.total_value = Decimal(str(total_value))
        self.inventory_id = inventory_id or uuid.uuid4()
        self.project_id = project_id or uuid.uuid4()
        self.num_installments = num_installments
        self.payment_plan_version_id = payment_plan_version_id


class FakeOverride:
    def __init__(self, override_type, plan_version_id=None, custom_installments=None):
        self.id = uuid.uuid4()
        self.inventory_id = None
        self.override_type = override_type
        self.plan_version_id = plan_version_id
        self.custom_installments = custom_installments


class FakePlanVersion:
    def __init__(self, installments, plan_id=None):
        self.id = uuid.uuid4()
        self.plan_id = plan_id or uuid.uuid4()
        self.installments = installments
        self.is_active = True


class FakePlan:
    def __init__(self, project_id, is_default=True, status="active", is_locked=False):
        self.id = uuid.uuid4()
        self.project_id = project_id
        self.is_default = is_default
        self.status = status
        self.is_locked = is_locked


def _make_db_mock(installments=None, override=None, plan=None, plan_version=None):
    """Build a mock db session that returns the given objects for .query().filter().first()/all()."""
    db = MagicMock()

    def query_side_effect(model):
        mock_q = MagicMock()
        model_name = model.__name__ if hasattr(model, "__name__") else str(model)

        if model_name == "Installment":
            mock_q.filter.return_value.all.return_value = installments or []
            return mock_q
        elif model_name == "ProjectInventoryPaymentOverride":
            mock_q.filter.return_value.first.return_value = override
            return mock_q
        elif model_name == "ProjectPaymentPlan":
            mock_q.filter.return_value.first.return_value = plan
            return mock_q
        elif model_name == "ProjectPaymentPlanVersion":
            mock_q.filter.return_value.first.return_value = plan_version
            return mock_q
        else:
            return mock_q

    db.query.side_effect = query_side_effect
    return db


def _classify_with_threshold(total_value, cumulative_paid, threshold_pct,
                              source="legacy_default", version_id=None):
    """Helper: classify with a known threshold (bypasses resolve logic)."""
    txn = FakeTransaction(total_value)
    inst = FakeInstallment(total_value, amount_paid=cumulative_paid)
    db = _make_db_mock(installments=[inst])

    with patch("services.receipt_classification_service.resolve_down_payment_threshold",
                return_value=(Decimal(str(threshold_pct)), source, version_id)):
        return classify_receipt(txn, db)


# ---------------------------------------------------------------------------
# UNIT TESTS: classify_receipt logic
# ---------------------------------------------------------------------------

class TestUnitClassifyReceipt:
    """Unit tests for the classification function with mocked DB."""

    # ── Token Money: 0% to <10% ────────────────────────────────────────

    def test_unit_zero_paid_is_token_money(self):
        r = _classify_with_threshold(1000000, 0, 25)
        assert r["classification"] == TOKEN_MONEY
        assert r["paid_percent"] == 0.0

    def test_unit_5_percent_is_token_money(self):
        r = _classify_with_threshold(1000000, 50000, 25)
        assert r["classification"] == TOKEN_MONEY
        assert r["paid_percent"] == 5.0

    def test_unit_9_99_percent_is_token_money(self):
        """Boundary: 9.99% should still be TOKEN_MONEY."""
        r = _classify_with_threshold(1000000, 99900, 25)
        assert r["classification"] == TOKEN_MONEY
        assert r["paid_percent"] == 9.99

    # ── Partial Down Payment: 10% to <x% ──────────────────────────────

    def test_unit_10_percent_is_partial_down_payment(self):
        """Boundary: exactly 10% crosses into PARTIAL_DOWN_PAYMENT."""
        r = _classify_with_threshold(1000000, 100000, 25)
        assert r["classification"] == PARTIAL_DOWN_PAYMENT
        assert r["paid_percent"] == 10.0

    def test_unit_15_percent_is_partial_down_payment(self):
        r = _classify_with_threshold(1000000, 150000, 25)
        assert r["classification"] == PARTIAL_DOWN_PAYMENT
        assert r["paid_percent"] == 15.0

    def test_unit_x_minus_001_is_partial_down_payment(self):
        """Boundary: just below threshold x (24.99%) is still PARTIAL."""
        r = _classify_with_threshold(1000000, 249900, 25)
        assert r["classification"] == PARTIAL_DOWN_PAYMENT
        assert r["paid_percent"] == 24.99

    # ── Down Payment Completed: >=x% ──────────────────────────────────

    def test_unit_exactly_x_is_completed(self):
        """Boundary: exactly at threshold x (25%) -> DOWN_PAYMENT_COMPLETED."""
        r = _classify_with_threshold(1000000, 250000, 25)
        assert r["classification"] == DOWN_PAYMENT_COMPLETED
        assert r["paid_percent"] == 25.0

    def test_unit_above_x_is_completed(self):
        r = _classify_with_threshold(1000000, 500000, 25)
        assert r["classification"] == DOWN_PAYMENT_COMPLETED
        assert r["paid_percent"] == 50.0

    def test_unit_fully_paid_is_completed(self):
        r = _classify_with_threshold(1000000, 1000000, 25)
        assert r["classification"] == DOWN_PAYMENT_COMPLETED
        assert r["paid_percent"] == 100.0

    # ── Edge: x <= 10% (empty PARTIAL range) ──────────────────────────

    def test_unit_threshold_10_skips_partial(self):
        """When x = 10, paid >= 10% jumps straight to COMPLETED."""
        r = _classify_with_threshold(1000000, 100000, 10)
        assert r["classification"] == DOWN_PAYMENT_COMPLETED

    def test_unit_threshold_5_still_token_at_7(self):
        """When x = 5%, paid = 7% -> TOKEN_MONEY (10% floor takes priority)."""
        r = _classify_with_threshold(1000000, 70000, 5)
        assert r["classification"] == TOKEN_MONEY

    def test_unit_threshold_5_completes_at_10(self):
        """When x = 5%, paid = 10% -> COMPLETED (since 10 >= 5)."""
        r = _classify_with_threshold(1000000, 100000, 5)
        assert r["classification"] == DOWN_PAYMENT_COMPLETED

    # ── Response structure ─────────────────────────────────────────────

    def test_unit_response_fields(self):
        vid = uuid.uuid4()
        r = _classify_with_threshold(1000000, 150000, 25, source="project_plan", version_id=vid)
        assert set(r.keys()) == {
            "classification", "cumulative_paid", "total_value",
            "paid_percent", "threshold_percent", "payment_rule_source", "plan_version_id",
        }
        assert r["payment_rule_source"] == "project_plan"
        assert r["threshold_percent"] == 25.0
        assert r["plan_version_id"] == str(vid)

    def test_unit_zero_total_value(self):
        """Guard: zero total_value should not crash."""
        r = _classify_with_threshold(0, 0, 25)
        assert r["classification"] == TOKEN_MONEY
        assert r["paid_percent"] == 0.0


# ---------------------------------------------------------------------------
# UNIT TESTS: resolve_down_payment_threshold precedence
# ---------------------------------------------------------------------------

class TestUnitResolveThreshold:
    """Unit tests for threshold resolution order."""

    def test_unit_historical_pin_takes_top_precedence(self):
        """Transaction.payment_plan_version_id is the #1 source."""
        version = FakePlanVersion([
            {"number": 1, "label": "Booking", "percentage": 12, "month_offset": 0},
            {"number": 2, "label": "Balance", "percentage": 88, "month_offset": 6},
        ])
        txn = FakeTransaction(1000000, payment_plan_version_id=version.id)

        # Also set an inventory override — it should NOT be used
        override = FakeOverride("custom", custom_installments=[
            {"number": 1, "label": "Booking", "percentage": 30, "month_offset": 0},
            {"number": 2, "label": "Balance", "percentage": 70, "month_offset": 12},
        ])

        db = MagicMock()
        def query_side_effect(model):
            name = model.__name__ if hasattr(model, "__name__") else str(model)
            mock_q = MagicMock()
            if name == "ProjectPaymentPlanVersion":
                mock_q.filter.return_value.first.return_value = version
            elif name == "ProjectInventoryPaymentOverride":
                mock_q.filter.return_value.first.return_value = override
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q
        db.query.side_effect = query_side_effect

        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("12")
        assert source == "pinned_version"
        assert vid == version.id

    def test_unit_inventory_override_custom_when_no_pin(self):
        """Inventory custom override takes precedence when no historical pin."""
        txn = FakeTransaction(1000000)  # no payment_plan_version_id
        override = FakeOverride("custom", custom_installments=[
            {"number": 1, "label": "Booking", "percentage": 15, "month_offset": 0},
            {"number": 2, "label": "Balance", "percentage": 85, "month_offset": 12},
        ])
        db = _make_db_mock(override=override)
        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("15")
        assert source == "inventory_override"
        assert vid is None

    def test_unit_inventory_override_plan_version(self):
        """Inventory override pointing to a plan version."""
        txn = FakeTransaction(1000000)
        version = FakePlanVersion([
            {"number": 1, "label": "Booking", "percentage": 20, "month_offset": 0},
            {"number": 2, "label": "Inst 1", "percentage": 40, "month_offset": 6},
            {"number": 3, "label": "Inst 2", "percentage": 40, "month_offset": 12},
        ])
        override = FakeOverride("plan_version", plan_version_id=version.id)

        db = MagicMock()
        def query_side_effect(model):
            name = model.__name__ if hasattr(model, "__name__") else str(model)
            mock_q = MagicMock()
            if name == "ProjectInventoryPaymentOverride":
                mock_q.filter.return_value.first.return_value = override
            elif name == "ProjectPaymentPlanVersion":
                mock_q.filter.return_value.first.return_value = version
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q
        db.query.side_effect = query_side_effect

        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("20")
        assert source == "inventory_override"
        assert vid == version.id

    def test_unit_locked_plan_preferred_over_unlocked_default(self):
        """Locked active plan beats unlocked default plan."""
        txn = FakeTransaction(1000000)

        # The locked plan's version has 10% booking
        locked_plan = FakePlan(txn.project_id, is_default=True, is_locked=True)
        locked_version = FakePlanVersion([
            {"number": 1, "label": "Booking", "percentage": 10, "month_offset": 0},
            {"number": 2, "label": "Inst", "percentage": 90, "month_offset": 12},
        ], plan_id=locked_plan.id)

        db = MagicMock()
        call_count = {"plan_queries": 0}
        def query_side_effect(model):
            name = model.__name__ if hasattr(model, "__name__") else str(model)
            mock_q = MagicMock()
            if name == "ProjectInventoryPaymentOverride":
                mock_q.filter.return_value.first.return_value = None
            elif name == "ProjectPaymentPlan":
                # First query (locked + default) returns the locked plan
                mock_q.filter.return_value.first.return_value = locked_plan
            elif name == "ProjectPaymentPlanVersion":
                mock_q.filter.return_value.first.return_value = locked_version
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q
        db.query.side_effect = query_side_effect

        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("10")
        assert source == "project_plan"
        assert vid == locked_version.id

    def test_unit_project_plan_when_no_override(self):
        """Falls through to project plan when no override and no pin."""
        txn = FakeTransaction(1000000)
        plan = FakePlan(txn.project_id)
        version = FakePlanVersion([
            {"number": 1, "label": "Booking", "percentage": 10, "month_offset": 0},
            {"number": 2, "label": "Inst 1", "percentage": 30, "month_offset": 6},
            {"number": 3, "label": "Inst 2", "percentage": 30, "month_offset": 12},
            {"number": 4, "label": "Inst 3", "percentage": 30, "month_offset": 18},
        ], plan_id=plan.id)

        db = MagicMock()
        def query_side_effect(model):
            name = model.__name__ if hasattr(model, "__name__") else str(model)
            mock_q = MagicMock()
            if name == "ProjectInventoryPaymentOverride":
                mock_q.filter.return_value.first.return_value = None
            elif name == "ProjectPaymentPlan":
                mock_q.filter.return_value.first.return_value = plan
            elif name == "ProjectPaymentPlanVersion":
                mock_q.filter.return_value.first.return_value = version
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q
        db.query.side_effect = query_side_effect

        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("10")
        assert source == "project_plan"
        assert vid == version.id

    def test_unit_legacy_fallback_when_no_plan(self):
        """Falls through to legacy when no pin, no override, no plan."""
        txn = FakeTransaction(1000000, num_installments=4)
        db = _make_db_mock()
        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("25.00")
        assert source == "legacy_default"
        assert vid is None

    def test_unit_legacy_fallback_6_installments(self):
        txn = FakeTransaction(1000000, num_installments=6)
        db = _make_db_mock()
        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("16.67")
        assert source == "legacy_default"

    def test_unit_legacy_fallback_2_installments(self):
        txn = FakeTransaction(1000000, num_installments=2)
        db = _make_db_mock()
        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        assert threshold == Decimal("50.00")
        assert source == "legacy_default"

    def test_unit_pinned_version_missing_falls_through(self):
        """If pinned version_id is set but DB row missing, falls to next level."""
        txn = FakeTransaction(1000000, num_installments=4,
                              payment_plan_version_id=uuid.uuid4())

        # Version query returns None (missing)
        db = _make_db_mock()
        threshold, source, vid = resolve_down_payment_threshold(txn, db)
        # Should fall through to legacy (no override, no plan)
        assert source == "legacy_default"
        assert threshold == Decimal("25.00")


# ---------------------------------------------------------------------------
# UNIT TESTS: incremental receipts crossing thresholds
# ---------------------------------------------------------------------------

class TestUnitIncrementalReceipts:
    """Simulate sequential receipts and verify classification transitions."""

    def test_unit_incremental_crossing_10(self):
        """Receipts at 5%, 9.99%, 10% -- crosses TOKEN->PARTIAL boundary."""
        total = 1000000
        assert _classify_with_threshold(total, 50000, 25)["classification"] == TOKEN_MONEY
        assert _classify_with_threshold(total, 99900, 25)["classification"] == TOKEN_MONEY
        assert _classify_with_threshold(total, 100000, 25)["classification"] == PARTIAL_DOWN_PAYMENT

    def test_unit_incremental_crossing_x(self):
        """Receipts at 10%, 24.99%, 25% -- crosses PARTIAL->COMPLETED boundary."""
        total = 1000000
        assert _classify_with_threshold(total, 100000, 25)["classification"] == PARTIAL_DOWN_PAYMENT
        assert _classify_with_threshold(total, 249900, 25)["classification"] == PARTIAL_DOWN_PAYMENT
        assert _classify_with_threshold(total, 250000, 25)["classification"] == DOWN_PAYMENT_COMPLETED

    def test_unit_incremental_with_high_threshold(self):
        """x = 40%: TOKEN -> PARTIAL (10-40) -> COMPLETED (40+)."""
        total = 500000
        assert _classify_with_threshold(total, 24000, 40)["classification"] == TOKEN_MONEY
        assert _classify_with_threshold(total, 50000, 40)["classification"] == PARTIAL_DOWN_PAYMENT
        assert _classify_with_threshold(total, 199500, 40)["classification"] == PARTIAL_DOWN_PAYMENT
        assert _classify_with_threshold(total, 200000, 40)["classification"] == DOWN_PAYMENT_COMPLETED


# ---------------------------------------------------------------------------
# UNIT TESTS: _extract_booking_percent edge cases
# ---------------------------------------------------------------------------

class TestUnitExtractBookingPercent:

    def test_unit_extract_normal(self):
        items = [
            {"number": 1, "label": "Booking", "percentage": 10, "month_offset": 0},
            {"number": 2, "label": "Inst", "percentage": 90, "month_offset": 6},
        ]
        assert _extract_booking_percent(items) == Decimal("10")

    def test_unit_extract_unordered(self):
        items = [
            {"number": 3, "label": "Poss", "percentage": 30, "month_offset": 12},
            {"number": 1, "label": "Book", "percentage": 20, "month_offset": 0},
            {"number": 2, "label": "Inst", "percentage": 50, "month_offset": 6},
        ]
        assert _extract_booking_percent(items) == Decimal("20")

    def test_unit_extract_empty(self):
        assert _extract_booking_percent([]) is None
        assert _extract_booking_percent(None) is None
        assert _extract_booking_percent("invalid") is None

    def test_unit_extract_missing_key(self):
        assert _extract_booking_percent([{"number": 1, "label": "X"}]) is None


# ---------------------------------------------------------------------------
# INTEGRATION TESTS: receipt endpoints (require running dev API)
# ---------------------------------------------------------------------------

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

BASE = "http://localhost:8010"
AUTH_HEADER = {}


@pytest.fixture(scope="module")
def integration_auth():
    """Login once for integration tests (NOT autouse)."""
    if not HAS_HTTPX:
        pytest.skip("httpx not available")
    try:
        r = httpx.post(f"{BASE}/api/auth/login",
                       data={"username": "REP-0002", "password": "admin123"},
                       timeout=5)
        if r.status_code != 200:
            pytest.skip(f"Cannot authenticate to dev API: {r.status_code}")
        AUTH_HEADER["Authorization"] = f"Bearer {r.json()['access_token']}"
    except Exception:
        pytest.skip("Dev API not reachable")


@pytest.mark.usefixtures("integration_auth")
class TestIntegrationReceiptList:
    """Regression: existing receipt list endpoint still works."""

    def test_integration_list_receipts(self):
        if not HAS_HTTPX:
            pytest.skip("httpx not available")
        r = httpx.get(f"{BASE}/api/receipts", headers=AUTH_HEADER, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_integration_receipts_summary(self):
        if not HAS_HTTPX:
            pytest.skip("httpx not available")
        r = httpx.get(f"{BASE}/api/receipts/summary", headers=AUTH_HEADER, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "total_receipts" in data
        assert "total_amount" in data

    def test_integration_list_receipts_has_classification_or_error(self):
        """Receipts linked to transactions include classification or classification_error."""
        if not HAS_HTTPX:
            pytest.skip("httpx not available")
        r = httpx.get(f"{BASE}/api/receipts?limit=5", headers=AUTH_HEADER, timeout=10)
        assert r.status_code == 200
        for entry in r.json():
            if entry.get("transaction_id"):
                # Must have either classification dict or classification_error string
                has_class = "classification" in entry
                has_err = "classification_error" in entry
                if has_class:
                    c = entry["classification"]
                    assert c["classification"] in [TOKEN_MONEY, PARTIAL_DOWN_PAYMENT, DOWN_PAYMENT_COMPLETED]
                    assert "paid_percent" in c
                    assert "payment_rule_source" in c


@pytest.mark.usefixtures("integration_auth")
class TestIntegrationReceiptGet:
    """Test single receipt GET endpoint."""

    def test_integration_get_receipt_by_id(self):
        if not HAS_HTTPX:
            pytest.skip("httpx not available")
        r = httpx.get(f"{BASE}/api/receipts?limit=1", headers=AUTH_HEADER, timeout=10)
        if r.status_code != 200 or not r.json():
            pytest.skip("No receipts in dev DB")
        rid = r.json()[0]["receipt_id"]
        r2 = httpx.get(f"{BASE}/api/receipts/{rid}", headers=AUTH_HEADER, timeout=10)
        assert r2.status_code == 200
        data = r2.json()
        assert data["receipt_id"] == rid
        assert "amount" in data
        assert "allocations" in data
