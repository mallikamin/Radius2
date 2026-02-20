"""
Cross-Rep Overlap Report Generator
Finds leads whose mobile numbers appear across different reps' cleaned files.
Groups by exact rep combination (2-way, 3-way, 4-way overlaps).
Excludes within-rep duplicates entirely.
"""

import pandas as pd
from collections import defaultdict
from datetime import datetime
import os

# ─── CONFIG ───────────────────────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data_analysis")
OUTPUT_DIR = DATA_DIR

REPS = {
    "Ali Zaidi": {"file": "Cleaned_Ali_Zaidi.xlsx", "rep_id": "REP-0018"},
    "Iram Aslam": {"file": "Cleaned_Iram_Aslam.xlsx", "rep_id": "REP-0019"},
    "Naeem Zaidi": {"file": "Cleaned_Naeem_Zaidi.xlsx", "rep_id": "REP-0017"},
    "Samia Rashid": {"file": "Cleaned_Samia_Rashid.xlsx", "rep_id": "REP-0016"},
}

# ─── LOAD & DEDUPLICATE WITHIN EACH REP ──────────────────────────────────────
# For each rep, keep only unique mobiles (first occurrence) so within-rep dupes
# are collapsed BEFORE we look for cross-rep overlaps.

rep_dfs = {}
for rep_name, cfg in REPS.items():
    path = os.path.join(DATA_DIR, cfg["file"])
    df = pd.read_excel(path)
    # Only valid mobiles
    df = df[df["mobile"].notna() & (df["mobile"] != "")].copy()
    df["mobile"] = df["mobile"].astype(str).str.strip()
    # Deduplicate within rep — keep first occurrence only
    df = df.drop_duplicates(subset="mobile", keep="first")
    rep_dfs[rep_name] = df
    print(f"  {rep_name}: {len(df)} unique mobiles loaded")

# ─── BUILD MOBILE → REPS INDEX ───────────────────────────────────────────────
# For each mobile, track which reps have it and the lead details from each rep.

mobile_index = defaultdict(list)  # mobile → [{rep, name, occupation, city, ...}]

for rep_name, df in rep_dfs.items():
    for _, row in df.iterrows():
        mobile_index[row["mobile"]].append({
            "rep": rep_name,
            "rep_id": REPS[rep_name]["rep_id"],
            "name": row.get("name", ""),
            "occupation": row.get("occupation", ""),
            "city": row.get("city", ""),
            "source": row.get("source", ""),
            "email": row.get("email", ""),
        })

# ─── FILTER: ONLY CROSS-REP (2+ DIFFERENT REPS) ─────────────────────────────
cross_overlaps = {}
for mobile, entries in mobile_index.items():
    unique_reps = set(e["rep"] for e in entries)
    if len(unique_reps) >= 2:
        cross_overlaps[mobile] = entries

print(f"\nTotal cross-rep overlapping mobiles: {len(cross_overlaps)}")

# ─── GROUP BY REP COMBINATION ────────────────────────────────────────────────
# Key = frozenset of rep names, Value = list of (mobile, entries)

combo_groups = defaultdict(list)
for mobile, entries in cross_overlaps.items():
    combo = frozenset(e["rep"] for e in entries)
    combo_groups[combo].append((mobile, entries))

# Sort combos: 4-way first, then 3-way, then 2-way. Within same size, alphabetical.
sorted_combos = sorted(combo_groups.keys(), key=lambda c: (-len(c), sorted(c)))

print(f"\nOverlap combinations found:")
for combo in sorted_combos:
    label = " + ".join(sorted(combo))
    print(f"  [{len(combo)}-way] {label}: {len(combo_groups[combo])} contacts")

# ─── BUILD EXCEL OUTPUT ──────────────────────────────────────────────────────

output_path = os.path.join(OUTPUT_DIR, "Cross_Rep_Overlaps_Report.xlsx")

with pd.ExcelWriter(output_path, engine="openpyxl") as writer:

    # ── SUMMARY SHEET ──
    summary_rows = []
    for combo in sorted_combos:
        label = " + ".join(sorted(combo))
        summary_rows.append({
            "Overlap Type": f"{len(combo)}-Way",
            "Reps Involved": label,
            "Count": len(combo_groups[combo]),
        })
    # Totals by type
    two_way = sum(r["Count"] for r in summary_rows if r["Overlap Type"] == "2-Way")
    three_way = sum(r["Count"] for r in summary_rows if r["Overlap Type"] == "3-Way")
    four_way = sum(r["Count"] for r in summary_rows if r["Overlap Type"] == "4-Way")
    summary_rows.append({"Overlap Type": "", "Reps Involved": "", "Count": ""})
    summary_rows.append({"Overlap Type": "TOTAL 2-Way", "Reps Involved": "", "Count": two_way})
    summary_rows.append({"Overlap Type": "TOTAL 3-Way", "Reps Involved": "", "Count": three_way})
    summary_rows.append({"Overlap Type": "TOTAL 4-Way", "Reps Involved": "", "Count": four_way})
    summary_rows.append({"Overlap Type": "GRAND TOTAL", "Reps Involved": "(unique mobiles)", "Count": len(cross_overlaps)})

    pd.DataFrame(summary_rows).to_excel(writer, sheet_name="Summary", index=False)

    # ── ONE SHEET PER COMBO ──
    sheet_num = 0
    for combo in sorted_combos:
        sheet_num += 1
        sorted_reps = sorted(combo)
        # Sheet name: e.g. "2W Ali+Iram" — max 31 chars for Excel
        short_names = [r.split()[0] for r in sorted_reps]
        sheet_name = f"{len(combo)}W {'_'.join(short_names)}"
        if len(sheet_name) > 31:
            sheet_name = sheet_name[:31]

        rows = []
        for mobile, entries in sorted(combo_groups[combo], key=lambda x: x[0]):
            # Build one row per mobile with columns for each rep's data side by side
            row = {"Mobile": mobile, "Overlap": f"{len(combo)}-Way"}

            for entry in entries:
                rep = entry["rep"]
                short = rep.split()[0]  # "Ali", "Iram", etc.
                row[f"{short} - Name"] = entry["name"]
                row[f"{short} - Occupation"] = entry["occupation"]
                row[f"{short} - City"] = entry["city"]
                row[f"{short} - Source"] = entry["source"]

            rows.append(row)

        df_out = pd.DataFrame(rows)
        df_out.to_excel(writer, sheet_name=sheet_name, index=False)

    # ── MASTER LIST (all overlaps, one row per mobile per rep — flat view) ──
    master_rows = []
    for mobile, entries in sorted(cross_overlaps.items()):
        unique_reps = sorted(set(e["rep"] for e in entries))
        combo_label = " + ".join(unique_reps)
        overlap_type = f"{len(unique_reps)}-Way"

        for entry in entries:
            master_rows.append({
                "Mobile": mobile,
                "Overlap Type": overlap_type,
                "Reps Sharing": combo_label,
                "This Rep": entry["rep"],
                "This Rep ID": entry["rep_id"],
                "Name (in this rep's file)": entry["name"],
                "Occupation": entry["occupation"],
                "City": entry["city"],
                "Source": entry["source"],
                "Email": entry["email"],
            })

    pd.DataFrame(master_rows).to_excel(writer, sheet_name="Master List", index=False)

print(f"\nReport saved: {output_path}")
print("Sheets:")
print("  - Summary: count by combination")
for combo in sorted_combos:
    sorted_reps = sorted(combo)
    short_names = [r.split()[0] for r in sorted_reps]
    sheet_name = f"{len(combo)}W {'_'.join(short_names)}"
    print(f"  - {sheet_name}: {len(combo_groups[combo])} contacts")
print("  - Master List: flat view, one row per rep per overlapping mobile")
