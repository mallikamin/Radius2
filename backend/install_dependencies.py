"""
Quick script to install required dependencies for the migration.
Run this before running migrate_vector_schema.py if you get import errors.
"""

import subprocess
import sys

def install_package(package):
    """Install a package using pip"""
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        return True
    except subprocess.CalledProcessError:
        return False

def main():
    print("=" * 60)
    print("Installing Migration Dependencies")
    print("=" * 60)
    print()
    
    required_packages = [
        ("sqlalchemy", "SQLAlchemy ORM"),
        ("psycopg2-binary", "PostgreSQL driver (binary)")
    ]
    
    failed = []
    
    for package, description in required_packages:
        print(f"Installing {description} ({package})...", end=" ")
        if install_package(package):
            print("✓ Success")
        else:
            print("✗ Failed")
            failed.append(package)
    
    print()
    if failed:
        print("=" * 60)
        print("Some packages failed to install:")
        for package in failed:
            print(f"  - {package}")
        print()
        print("Please install them manually:")
        print(f"  pip install {' '.join(failed)}")
        sys.exit(1)
    else:
        print("=" * 60)
        print("✓ All dependencies installed successfully!")
        print()
        print("You can now run the migration:")
        print("  python migrate_vector_schema.py")
        sys.exit(0)

if __name__ == "__main__":
    main()

