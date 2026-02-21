"""
Generate SQL migration for Sitara Square (PRJ-0001) data import.
Reads Excel file and produces a DO $$ PL/pgSQL block that:
  1. Updates inventory rates (shops 11, 12, 13)
  2. Creates new customers (17)
  3. Creates new brokers (10)
  4. Creates 28 transactions + installments
  5. Allocates payments chronologically
  6. Marks inventory as 'sold'
"""

import pandas as pd
from datetime import date, datetime, time

EXCEL_PATH = r"C:\ST\Sitara Square\Feb\21st Feb\Sitara Square inventory updating.xlsx"
OUTPUT_PATH = r"C:\Users\Malik\desktop\radius2-analytics\database\sitara_square_migration.sql"


def normalize_pk_phone(raw):
    """Normalize Pakistani phone numbers to 03XXXXXXXXX format."""
    s = str(raw).strip().replace(" ", "").replace("-", "").replace("+", "")
    # +44 UK number — return as international
    if s.startswith("44") and len(s) >= 12:
        return "+" + s
    # Remove leading 92 country code
    if s.startswith("92") and len(s) > 10:
        s = "0" + s[2:]
    # Add leading 0 if 10 digits starting with 3
    if len(s) == 10 and s.startswith("3"):
        s = "0" + s
    return s


def title_case_clean(name):
    """Title case and clean name."""
    name = name.strip()
    # Remove 'sb.' suffix
    if name.lower().endswith(" sb."):
        name = name[:-4].strip()
    # Special mappings
    name_map = {
        "SEITH IFTIKHAR": "Seth Iftikhar",
        "KASHMIR VENTURE) JAHANGIR MAGOO": "Jahangir Magoo",
        "M. Zahid Javed": "M. Zahid Javed",
    }
    if name in name_map:
        return name_map[name]
    # Title case
    return name.title()


def sql_str(val):
    """Escape single quotes for SQL."""
    if val is None:
        return "NULL"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def parse_installment_date(val):
    """Parse installment date from Excel. Returns date string or None if zero/null."""
    if val is None or val == "" or val == "NaT":
        return None
    if isinstance(val, time):
        # time(0,0) means no date
        if val == time(0, 0):
            return None
        return None
    if isinstance(val, datetime):
        if val.year < 2000:  # clearly invalid
            return None
        return val.strftime("%Y-%m-%d")
    if isinstance(val, date):
        return val.strftime("%Y-%m-%d")
    s = str(val).strip()
    if s in ("00:00:00", "0", "", "NaT", "nan"):
        return None
    return s


def main():
    df = pd.read_excel(EXCEL_PATH)

    # ---- Collect unique customers ----
    customers = {}  # mobile -> {name, mobile, country_code, notes}
    for _, row in df.iterrows():
        raw_name = str(row["Customer Name"]).strip()
        raw_phone = row["Contact#"]
        phone = normalize_pk_phone(raw_phone)
        clean_name = title_case_clean(raw_name)

        country_code = "+92"
        notes = None
        if phone.startswith("+44"):
            country_code = "+44"
        if raw_name == "KASHMIR VENTURE) JAHANGIR MAGOO":
            notes = "Kashmir Venture"

        if phone not in customers:
            customers[phone] = {
                "name": clean_name,
                "mobile": phone,
                "country_code": country_code,
                "notes": notes,
            }

    # ---- Collect unique brokers ----
    brokers = {}  # mobile -> {name, mobile, notes}
    for _, row in df.iterrows():
        raw_name = str(row["Broker Name"]).strip()
        raw_phone = row["Broker Contact#"]

        # Fix Malik Asif broker phone override
        clean_name = title_case_clean(raw_name)
        if clean_name == "Malik Asif":
            phone = "03227861900"
        else:
            phone = normalize_pk_phone(raw_phone)

        notes = None
        if "Dani Bhai" in raw_name:
            clean_name = "Bilal Saud"
            notes = "Also known as Dani Bhai"

        if phone not in brokers:
            brokers[phone] = {
                "name": clean_name,
                "mobile": phone,
                "notes": notes,
            }

    # ---- Existing records (from DB query) ----
    existing_customers = {
        "03008666660": "CUST-0007",  # Raja Dawood
        "03219661312": "CUST-0010",  # Azhar Jameel
    }
    existing_brokers = {
        "03218661120": "BRK-0006",  # Shahzad Akram
    }

    new_customers = {k: v for k, v in customers.items() if k not in existing_customers}
    new_brokers = {k: v for k, v in brokers.items() if k not in existing_brokers}

    # ---- Build SQL ----
    lines = []
    lines.append("-- =============================================================")
    lines.append("-- Sitara Square (PRJ-0001) Data Migration")
    lines.append("-- Generated from: Sitara Square inventory updating.xlsx")
    lines.append(f"-- Date: {date.today().isoformat()}")
    lines.append("-- =============================================================")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")
    lines.append("DO $$")
    lines.append("DECLARE")
    lines.append("  prj_uuid UUID;")

    # Declare customer variables
    for i, phone in enumerate(customers.keys()):
        lines.append(f"  cust_{i} UUID;  -- {customers[phone]['name']} ({phone})")

    # Declare broker variables
    for i, phone in enumerate(brokers.keys()):
        lines.append(f"  brk_{i} UUID;  -- {brokers[phone]['name']} ({phone})")

    lines.append("  inv_uuid UUID;")
    lines.append("  txn_uuid UUID;")
    lines.append("  inst_amount NUMERIC(15,2);")
    lines.append("  remaining NUMERIC(15,2);")
    lines.append("  paid_this NUMERIC(15,2);")
    lines.append("BEGIN")
    lines.append("")

    # ---- Step 1: Get project UUID ----
    lines.append("  -- ============ Step 1: Get Project UUID ============")
    lines.append("  SELECT id INTO prj_uuid FROM projects WHERE project_id = 'PRJ-0001';")
    lines.append("  IF prj_uuid IS NULL THEN")
    lines.append("    RAISE EXCEPTION 'PRJ-0001 not found!';")
    lines.append("  END IF;")
    lines.append("")

    # ---- Step 2: Update inventory rates ----
    lines.append("  -- ============ Step 2: Update Inventory Rates ============")
    rate_updates = [
        ("11", "12825000.00"),
        ("12", "12825000.00"),
        ("13", "12800000.00"),
    ]
    for unit, rate in rate_updates:
        lines.append(
            f"  UPDATE inventory SET rate_per_marla = {rate}, updated_at = NOW() "
            f"WHERE project_id = prj_uuid AND unit_number = '{unit}';"
        )
    lines.append("")

    # ---- Step 3: Create / lookup customers ----
    lines.append("  -- ============ Step 3: Create / Lookup Customers ============")
    cust_phone_to_var = {}
    for i, (phone, data) in enumerate(customers.items()):
        var = f"cust_{i}"
        cust_phone_to_var[phone] = var

        if phone in existing_customers:
            lines.append(
                f"  -- Existing: {data['name']} ({phone}) = {existing_customers[phone]}"
            )
            lines.append(
                f"  SELECT id INTO {var} FROM customers WHERE mobile = {sql_str(phone)};"
            )
        else:
            lines.append(f"  -- New: {data['name']} ({phone})")
            cols = "name, mobile, country_code"
            vals = f"{sql_str(data['name'])}, {sql_str(phone)}, {sql_str(data['country_code'])}"
            if data.get("notes"):
                cols += ", notes"
                vals += f", {sql_str(data['notes'])}"
            cols += ", interested_project_id"
            vals += ", prj_uuid"
            lines.append(
                f"  INSERT INTO customers ({cols}) VALUES ({vals}) RETURNING id INTO {var};"
            )
        lines.append("")

    # ---- Step 4: Create / lookup brokers ----
    lines.append("  -- ============ Step 4: Create / Lookup Brokers ============")
    brk_phone_to_var = {}
    for i, (phone, data) in enumerate(brokers.items()):
        var = f"brk_{i}"
        brk_phone_to_var[phone] = var

        if phone in existing_brokers:
            lines.append(
                f"  -- Existing: {data['name']} ({phone}) = {existing_brokers[phone]}"
            )
            lines.append(
                f"  SELECT id INTO {var} FROM brokers WHERE mobile = {sql_str(phone)};"
            )
        else:
            lines.append(f"  -- New: {data['name']} ({phone})")
            cols = "name, mobile"
            vals = f"{sql_str(data['name'])}, {sql_str(phone)}"
            if data.get("notes"):
                cols += ", notes"
                vals += f", {sql_str(data['notes'])}"
            lines.append(
                f"  INSERT INTO brokers ({cols}) VALUES ({vals}) RETURNING id INTO {var};"
            )
        lines.append("")

    # ---- Step 5: Create transactions + installments ----
    lines.append("  -- ============ Step 5: Transactions + Installments ============")

    for idx, row in df.iterrows():
        raw_cust_phone = normalize_pk_phone(row["Contact#"])
        raw_brk_name = title_case_clean(str(row["Broker Name"]).strip())
        if raw_brk_name == "Malik Asif":
            brk_phone = "03227861900"
        elif "Dani Bhai" in str(row["Broker Name"]):
            brk_phone = normalize_pk_phone(row["Broker Contact#"])
        else:
            brk_phone = normalize_pk_phone(row["Broker Contact#"])

        cust_var = cust_phone_to_var[raw_cust_phone]
        brk_var = brk_phone_to_var[brk_phone]

        shop_num = str(int(row["Shop#"]))
        area = float(row["Area"])
        rate = float(row["SHOP SALE RATE MARLA"])
        total_value = float(row["TOTAL SALE AMOUNT RECEIVABLE"])
        net_received = float(row["Net Received"])

        # Parse installment dates
        dates = []
        for col in ["1st Installment Date", "2nd Installment", "3rd installment", "4th Installment"]:
            d = parse_installment_date(row[col])
            dates.append(d)

        # Determine if 100% paid (no real dates)
        is_fully_paid = abs(net_received - total_value) < 1
        has_dates = any(d is not None for d in dates)

        if not has_dates:
            if is_fully_paid:
                # Arbitrary dates for fully paid
                dates = ["2025-01-01", "2025-07-01", "2026-01-01", "2026-07-01"]
            else:
                # <50% recovery, no dates → 1/1/2025 + bi-annual
                recovery_pct = net_received / total_value if total_value > 0 else 0
                dates = ["2025-01-01", "2025-07-01", "2026-01-01", "2026-07-01"]

        first_due = dates[0] if dates[0] else "2025-01-01"

        cust_name = customers[raw_cust_phone]["name"]
        lines.append(f"  -- Transaction: {cust_name} -> Shop {shop_num}")
        lines.append(
            f"  SELECT id INTO inv_uuid FROM inventory "
            f"WHERE project_id = prj_uuid AND unit_number = '{shop_num}';"
        )
        lines.append(f"  IF inv_uuid IS NULL THEN")
        lines.append(f"    RAISE EXCEPTION 'Inventory not found for shop {shop_num}';")
        lines.append(f"  END IF;")
        lines.append("")

        # Insert transaction
        lines.append(
            f"  INSERT INTO transactions "
            f"(customer_id, broker_id, project_id, inventory_id, "
            f"unit_number, area_marla, rate_per_marla, total_value, "
            f"installment_cycle, num_installments, first_due_date, "
            f"booking_date, status) "
            f"VALUES ("
            f"{cust_var}, {brk_var}, prj_uuid, inv_uuid, "
            f"'{shop_num}', {area}, {rate}, {total_value}, "
            f"'bi-annual', 4, '{first_due}', "
            f"'{first_due}', 'active'"
            f") RETURNING id INTO txn_uuid;"
        )
        lines.append("")

        # Create installments with payment allocation
        inst_amount_val = round(total_value / 4, 2)
        lines.append(f"  inst_amount := {inst_amount_val};")
        lines.append(f"  remaining := {net_received};")
        lines.append("")

        for inst_num in range(4):
            due = dates[inst_num] if inst_num < len(dates) and dates[inst_num] else first_due

            # For last installment, handle rounding
            if inst_num == 3:
                actual_amount = f"({total_value} - 3 * inst_amount)"
            else:
                actual_amount = "inst_amount"

            lines.append(f"  -- Installment {inst_num + 1}: due {due}")
            lines.append(f"  paid_this := LEAST(remaining, {actual_amount});")
            lines.append(
                f"  INSERT INTO installments "
                f"(transaction_id, installment_number, due_date, amount, amount_paid, status) "
                f"VALUES (txn_uuid, {inst_num + 1}, '{due}', {actual_amount}, "
                f"paid_this, CASE WHEN paid_this >= {actual_amount} THEN 'paid' ELSE 'pending' END);"
            )
            lines.append(f"  remaining := remaining - paid_this;")
            lines.append("")

        # Mark inventory as sold
        lines.append(
            f"  UPDATE inventory SET status = 'sold', updated_at = NOW() "
            f"WHERE id = inv_uuid;"
        )
        lines.append("")

    lines.append("  RAISE NOTICE 'Migration complete: 28 transactions created';")
    lines.append("END $$;")
    lines.append("")

    # ---- Verification queries ----
    lines.append("-- ============ Verification Queries ============")
    lines.append("SELECT 'Customers' as entity, COUNT(*) as count FROM customers;")
    lines.append("SELECT 'Brokers' as entity, COUNT(*) as count FROM brokers;")
    lines.append(
        "SELECT 'Transactions' as entity, COUNT(*) as count FROM transactions "
        "WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001');"
    )
    lines.append(
        "SELECT 'Sold Inventory' as entity, COUNT(*) as count FROM inventory "
        "WHERE project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001') AND status = 'sold';"
    )
    lines.append(
        "SELECT t.transaction_id, c.name as customer, i.unit_number as shop, "
        "t.total_value, SUM(inst.amount_paid) as total_paid "
        "FROM transactions t "
        "JOIN customers c ON t.customer_id = c.id "
        "JOIN inventory i ON t.inventory_id = i.id "
        "LEFT JOIN installments inst ON inst.transaction_id = t.id "
        "WHERE t.project_id = (SELECT id FROM projects WHERE project_id = 'PRJ-0001') "
        "GROUP BY t.transaction_id, c.name, i.unit_number, t.total_value "
        "ORDER BY i.unit_number::int;"
    )
    lines.append("")
    lines.append("COMMIT;")

    # Write output
    sql = "\n".join(lines)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(sql)

    print(f"Generated: {OUTPUT_PATH}")
    print(f"  New customers: {len(new_customers)}")
    print(f"  New brokers: {len(new_brokers)}")
    print(f"  Transactions: {len(df)}")
    print(f"  Rate updates: {len(rate_updates)}")

    # Print summary
    print("\n--- New Customers ---")
    for phone, data in new_customers.items():
        print(f"  {data['name']:30s} {phone}")

    print("\n--- New Brokers ---")
    for phone, data in new_brokers.items():
        print(f"  {data['name']:30s} {phone}")

    print("\n--- Transactions ---")
    for _, row in df.iterrows():
        cust = title_case_clean(str(row["Customer Name"]).strip())
        shop = int(row["Shop#"])
        total = float(row["TOTAL SALE AMOUNT RECEIVABLE"])
        received = float(row["Net Received"])
        pct = (received / total * 100) if total > 0 else 0
        print(f"  Shop {shop:2d}: {cust:30s} Total={total:>14,.0f}  Paid={received:>14,.0f}  ({pct:.0f}%)")


if __name__ == "__main__":
    main()
