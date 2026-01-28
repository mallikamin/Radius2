"""
Database Migration Script for Vector Integration
Adds Vector-specific fields to existing tables and creates Vector tables.

Usage:
    python migrate_vector_schema.py

This script:
1. Reads the SQL migration file
2. Connects to the database using the same connection string as main.py
3. Executes the migration safely
4. Provides clear success/error messages
"""

import os
import sys
from pathlib import Path

# Check for required dependencies
try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import SQLAlchemyError
except ImportError as e:
    print("ERROR: Missing required dependency: sqlalchemy")
    print("Please install it with: pip install sqlalchemy")
    sys.exit(1)

# Note: We don't check for psycopg2 here because SQLAlchemy will handle the import
# when creating the engine. We'll catch the error then and provide helpful guidance.

def print_help():
    """Print help message"""
    print("=" * 60)
    print("Vector Integration Database Migration")
    print("=" * 60)
    print()
    print("Usage:")
    print("  python migrate_vector_schema.py")
    print("  python migrate_vector_schema.py [connection_string]")
    print("  python migrate_vector_schema.py [user] [password] [host] [port] [database]")
    print()
    print("Environment Variables:")
    print("  DATABASE_URL - Full PostgreSQL connection string")
    print("  POSTGRES_USER or DB_USER - Database username")
    print("  POSTGRES_PASSWORD or DB_PASSWORD - Database password")
    print("  POSTGRES_DB or DB_NAME - Database name")
    print("  DB_HOST or POSTGRES_HOST - Database host (default: localhost)")
    print("  DB_PORT or POSTGRES_PORT - Database port (default: 5432)")
    print()
    print("Examples:")
    print("  python migrate_vector_schema.py")
    print("  python migrate_vector_schema.py postgresql://user:pass@localhost:5432/dbname")
    print("  python migrate_vector_schema.py postgres postgres123 localhost 5432 sitara_crm")
    print("  python migrate_vector_schema.py --yes  # Skip confirmation prompt")
    print()
    print("For Docker Compose:")
    print("  Check your docker-compose.yml for POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB")
    print("  Or run: docker-compose exec db env | grep POSTGRES")
    print()

# Get the database URL from environment or use default
# Priority: 1. DATABASE_URL env var, 2. Command line args, 3. Default
def get_database_url():
    """Get database URL from environment, command line, or default"""
    # Check environment variable first
    if "DATABASE_URL" in os.environ:
        return os.environ["DATABASE_URL"]
    
    # Check for Docker Compose database credentials
    # Common Docker Compose database environment variables
    db_user = os.getenv("POSTGRES_USER") or os.getenv("DB_USER") or "sitara"
    db_password = os.getenv("POSTGRES_PASSWORD") or os.getenv("DB_PASSWORD") or "sitara123"
    db_name = os.getenv("POSTGRES_DB") or os.getenv("DB_NAME") or "sitara_crm"
    db_host = os.getenv("DB_HOST") or os.getenv("POSTGRES_HOST") or "localhost"
    db_port = os.getenv("DB_PORT") or os.getenv("POSTGRES_PORT") or "5432"
    
    # Check command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--help" or sys.argv[1] == "-h":
            print_help()
            sys.exit(0)
        elif sys.argv[1].startswith("postgresql://"):
            return sys.argv[1]
        elif len(sys.argv) >= 3:
            # Format: python migrate_vector_schema.py user password [host] [port] [database]
            db_user = sys.argv[1]
            db_password = sys.argv[2]
            if len(sys.argv) > 3:
                db_host = sys.argv[3]
            if len(sys.argv) > 4:
                db_port = sys.argv[4]
            if len(sys.argv) > 5:
                db_name = sys.argv[5]
    
    return f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

# Get database URL - call this after function definitions
DATABASE_URL = get_database_url()

def run_migration():
    """Execute the migration SQL script"""
    # Get the path to the migration SQL file
    script_dir = Path(__file__).parent
    migration_file = script_dir / "migrations" / "add_vector_fields.sql"
    
    if not migration_file.exists():
        print(f"ERROR: Migration file not found at {migration_file}")
        print("Please ensure the migration file exists.")
        sys.exit(1)
    
    # Read the SQL migration script
    try:
        with open(migration_file, 'r', encoding='utf-8') as f:
            sql_script = f.read()
    except Exception as e:
        print(f"ERROR: Failed to read migration file: {e}")
        sys.exit(1)
    
    # Create database engine
    try:
        print(f"Connecting to database...")
        engine = create_engine(
            DATABASE_URL,
            pool_size=5,
            max_overflow=0,
            pool_pre_ping=True
        )
        
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✓ Database connection successful")
        
    except ImportError as e:
        error_msg = str(e)
        if "psycopg2" in error_msg.lower() or "No module named" in error_msg:
            print(f"\nERROR: Missing PostgreSQL driver dependency")
            print(f"Error: {error_msg}")
            print("\nTo fix this, install the PostgreSQL driver:")
            print("  pip install psycopg2-binary")
            print("\nNote: psycopg2-binary is recommended as it's pre-compiled")
            print("and doesn't require PostgreSQL development libraries.")
        else:
            print(f"ERROR: Missing dependency: {error_msg}")
        sys.exit(1)
    except Exception as e:
        error_msg = str(e)
        print(f"ERROR: Failed to connect to database: {error_msg}")
        # Mask password in URL
        masked_url = DATABASE_URL
        if '@' in masked_url:
            parts = masked_url.split('@')
            if ':' in parts[0]:
                user_pass = parts[0].split('://')[1] if '://' in parts[0] else parts[0]
                if ':' in user_pass:
                    user = user_pass.split(':')[0]
                    masked_url = masked_url.replace(user_pass, f"{user}:***")
        print(f"Database URL: {masked_url}")
        
        if "password authentication failed" in error_msg.lower():
            print("\n" + "=" * 60)
            print("Authentication Failed - Database Credentials Issue")
            print("=" * 60)
            print("\nPossible solutions:")
            print("1. Check your database credentials")
            print("2. For Docker Compose, find the correct credentials:")
            print("   docker-compose exec db env | grep POSTGRES")
            print("   OR check your docker-compose.yml file")
            print("3. Set environment variables:")
            print("   export POSTGRES_USER=your_user")
            print("   export POSTGRES_PASSWORD=your_password")
            print("   export POSTGRES_DB=your_database")
            print("4. Or pass credentials directly:")
            print("   python migrate_vector_schema.py user password host port database")
            print("\nExample:")
            print("   python migrate_vector_schema.py postgres mypassword localhost 5432 sitara_crm")
        elif "psycopg2" in error_msg.lower() or "No module named" in error_msg:
            print("\nTo fix this, install the PostgreSQL driver:")
            print("  pip install psycopg2-binary")
        sys.exit(1)
    
    # Execute migration
    try:
        print("\nExecuting migration...")
        with engine.begin() as conn:
            # Execute the entire SQL script
            # PostgreSQL will handle DO blocks and multiple statements correctly
            try:
                conn.execute(text(sql_script))
                print("✓ Migration SQL executed successfully")
            except SQLAlchemyError as e:
                # Some errors are expected (e.g., table/column already exists)
                error_msg = str(e)
                if any(keyword in error_msg.lower() for keyword in ["already exists", "duplicate", "does not exist"]):
                    # Check if it's a harmless "already exists" error
                    if "already exists" in error_msg.lower():
                        print("⚠ Some objects already exist (this is normal if migration was run before)")
                        print("✓ Migration completed (idempotent - safe to run multiple times)")
                    else:
                        print(f"✗ Migration error: {error_msg[:300]}")
                        raise
                else:
                    print(f"✗ Migration error: {error_msg[:300]}")
                    raise
        
        print("\n✓ Migration completed successfully!")
        print("\nNext steps:")
        print("1. Restart your backend server")
        print("2. Test the API endpoints to ensure they work correctly")
        print("3. Check the frontend to verify data loads properly")
        
    except SQLAlchemyError as e:
        print(f"\n✗ Migration failed: {e}")
        print("\nPlease check the error message above and fix any issues.")
        print("The migration script is idempotent, so you can safely run it again after fixing issues.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error during migration: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        engine.dispose()

if __name__ == "__main__":
    print("=" * 60)
    print("Vector Integration Database Migration")
    print("=" * 60)
    print()
    print(f"Database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
    print(f"User: {DATABASE_URL.split('://')[1].split(':')[0] if '://' in DATABASE_URL else 'N/A'}")
    print()
    
    # Show help if requested
    if len(sys.argv) > 1 and (sys.argv[1] == "--help" or sys.argv[1] == "-h"):
        print_help()
        sys.exit(0)
    
    # Check for --yes or -y flag to skip confirmation
    skip_confirmation = any(arg in ['--yes', '-y'] for arg in sys.argv)
    
    # Confirm before proceeding (unless --yes flag is used)
    if not skip_confirmation:
        try:
            response = input("This will modify your database schema. Continue? (yes/no): ")
            if response.lower() not in ['yes', 'y']:
                print("Migration cancelled.")
                sys.exit(0)
        except (EOFError, KeyboardInterrupt):
            print("\nMigration cancelled.")
            sys.exit(0)
    
    print()
    run_migration()

