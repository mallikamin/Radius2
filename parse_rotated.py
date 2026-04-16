import sys
import json

with open('raw_metadata.txt', 'r') as f:
    data = json.loads(f.read().strip())

annos = data.get('annos', [])
rotated = [a for a in annos if a.get('rotation', 0) != 0]

print(f'Total annotations: {len(annos)}')
print(f'Rotated annotations: {len(rotated)}')
print(f'\nRotated annotations:')
for a in rotated[:15]:
    print(f"  - ID: {a['id']}, Note: {a['note']}, Rotation: {a.get('rotation', 0)}°")

print(f"\n✅ First rotated annotation (test target):")
if rotated:
    target = rotated[0]
    print(f"   ID: {target['id']}")
    print(f"   Note: {target['note']}")
    print(f"   Rotation: {target.get('rotation', 0)}°")
    print(f"   Color: {target.get('color')}")
