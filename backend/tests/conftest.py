"""
Pytest conftest — ensure backend/app and backend/app/services are importable
from repo root without setting PYTHONPATH manually.
"""
import sys
from pathlib import Path

_app_dir = str(Path(__file__).resolve().parent.parent / "app")
_svc_dir = str(Path(__file__).resolve().parent.parent / "app" / "services")

for p in (_app_dir, _svc_dir):
    if p not in sys.path:
        sys.path.insert(0, p)
