# -*- coding: utf-8 -*-
"""
Check new leads against production database for duplicates
"""
import subprocess
import json

# Read mobiles
with open('data_analysis/new_leads_mobiles.txt', 'r') as f:
    mobiles = [line.strip() for line in f if line.strip()]

print(f"Checking {len(mobiles)} mobiles against production...")

# Split into batches of 100
batch_size = 100
all_duplicates = []

for i in range(0, len(mobiles), batch_size):
    batch = mobiles[i:i+batch_size]
    mobile_list = "', '".join(batch)

    sql = f"""
    SELECT
        l.lead_id,
        l.name,
        l.mobile,
        cr.rep_id,
        cr.name as rep_name
    FROM leads l
    JOIN company_reps cr ON l.assigned_rep_id = cr.id
    WHERE l.mobile IN ('{mobile_list}')
    ORDER BY l.mobile;
    """

    # Execute via SSH
    cmd = [
        'ssh', 'root@159.65.158.26',
        f"docker exec orbit_db psql -U sitara -d sitara_crm -t -c \"{sql}\""
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0 and result.stdout.strip():
        # Parse results
        lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]
        for line in lines:
            if '|' in line:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 5:
                    all_duplicates.append({
                        'lead_id': parts[0],
                        'name': parts[1],
                        'mobile': parts[2],
                        'rep_id': parts[3],
                        'rep_name': parts[4],
                    })

    print(f"  Batch {i//batch_size + 1}/{(len(mobiles) + batch_size - 1)//batch_size}: {len(all_duplicates)} duplicates found so far")

print()
print("=" * 80)
print(f"DUPLICATE CHECK RESULTS")
print("=" * 80)
print(f"Total new mobiles checked: {len(mobiles)}")
print(f"Existing duplicates in production: {len(all_duplicates)}")
print()

if all_duplicates:
    print("Duplicate details:")
    for dup in all_duplicates[:30]:
        print(f"  {dup['mobile']}: {dup['name']} (Assigned to: {dup['rep_id']} - {dup['rep_name']})")
    if len(all_duplicates) > 30:
        print(f"  ... and {len(all_duplicates) - 30} more")
    print()

    # Save duplicates to file
    dup_mobiles = set(d['mobile'] for d in all_duplicates)
    with open('data_analysis/duplicate_mobiles.txt', 'w') as f:
        f.write('\n'.join(sorted(dup_mobiles)))

    with open('data_analysis/duplicate_details.json', 'w', encoding='utf-8') as f:
        json.dump(all_duplicates, f, indent=2, ensure_ascii=False)

    print(f"Duplicate mobiles saved to: data_analysis/duplicate_mobiles.txt")
    print(f"Duplicate details saved to: data_analysis/duplicate_details.json")
    print()
    print(f"CLEAN LEADS TO UPLOAD: {len(mobiles) - len(dup_mobiles)}")
else:
    print("✓ No duplicates found! All leads are new.")
    print(f"TOTAL LEADS TO UPLOAD: {len(mobiles)}")

print()
