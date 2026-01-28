# Vector Integration Database Migration Guide

This guide explains how to run the database migration to add Vector-specific fields and tables to your Radius database.

## Overview

The Vector integration requires new columns in existing tables (`projects` and `inventory`) and new Vector-specific tables. This migration script safely adds these without affecting existing data.

## What This Migration Does

### Adds Columns to Existing Tables

**`projects` table:**
- `map_pdf_base64` (TEXT, nullable) - PDF map stored as base64
- `map_name` (VARCHAR(255), nullable) - Original PDF filename
- `map_size` (JSONB, nullable) - Map dimensions {width, height}
- `vector_metadata` (JSONB, nullable) - Vector-specific project settings

**`inventory` table:**
- `plot_coordinates` (JSONB, nullable) - Plot coordinates for map rendering {x, y, width, height}
- `plot_offset` (JSONB, nullable) - Plot positioning {offset_x, offset_y, rotation}
- `is_manual_plot` (VARCHAR(10), nullable, default 'false') - Whether plot was manually added

### Creates New Vector Tables

- `vector_projects` - Standalone Vector projects (can be linked to Radius projects)
- `vector_annotations` - Plot annotations
- `vector_shapes` - Custom shapes drawn on map
- `vector_labels` - Text labels on map
- `vector_legend` - Legend configuration
- `vector_branches` - Project branches/versions
- `vector_creator_notes` - Creator notes/timestamps
- `vector_change_log` - Change history
- `vector_project_backups` - Project backups
- `vector_backup_settings` - Backup configuration
- `vector_reconciliation` - Reconciliation records

## Prerequisites

1. **PostgreSQL Database**: Ensure your PostgreSQL database is running and accessible
2. **Database Connection**: Verify your `DATABASE_URL` environment variable or default connection string
3. **Python Dependencies**: Install required packages:
   ```bash
   pip install sqlalchemy psycopg2-binary
   ```
   Note: `psycopg2-binary` is recommended as it's pre-compiled and doesn't require PostgreSQL development libraries.
4. **Backup**: **IMPORTANT** - Backup your database before running the migration (recommended)

## Running the Migration

### Step 1: Navigate to Backend Directory

```bash
cd C:\Users\Malik\Desktop\radius2\backend
```

### Step 2: Verify Database Connection

The migration script uses the same database connection as your main application:
- Default: `postgresql://sitara:sitara123@localhost:5432/sitara_crm`
- Or set `DATABASE_URL` environment variable

### Step 3: Run the Migration Script

```bash
python migrate_vector_schema.py
```

The script will:
1. Connect to your database
2. Ask for confirmation before proceeding
3. Execute the migration SQL
4. Report success or any errors

### Step 4: Verify Migration Success

After running the migration, you should see:
```
✓ Database connection successful
✓ Migration SQL executed successfully
✓ Migration completed successfully!
```

### Step 5: Restart Your Backend Server

After the migration completes:
1. Stop your backend server (if running)
2. Restart it to ensure it picks up the new schema
3. Test the API endpoints

## Troubleshooting

### Error: "column does not exist"

If you see this error after running the migration:
- The migration may not have completed successfully
- Check the error message for specific details
- The migration script is idempotent - you can safely run it again

### Error: "table already exists"

This is normal if you run the migration multiple times. The script uses `IF NOT EXISTS` checks, so it's safe to run multiple times.

### Error: "permission denied"

Ensure your database user has the necessary permissions:
- `CREATE TABLE`
- `ALTER TABLE`
- `CREATE INDEX`

### Missing Dependencies

If you see "No module named 'psycopg2'" error:
```bash
pip install psycopg2-binary
```

This installs the PostgreSQL driver needed for SQLAlchemy to connect to PostgreSQL.

### Connection Errors

If you get connection errors:
1. Verify PostgreSQL is running
2. Check your `DATABASE_URL` or connection string
3. Ensure the database exists
4. Verify username/password are correct
5. Ensure `psycopg2-binary` is installed (see above)

## Manual Migration (Alternative)

If you prefer to run the SQL manually:

1. Open your PostgreSQL client (psql, pgAdmin, etc.)
2. Connect to your database
3. Open the file: `backend/migrations/add_vector_fields.sql`
4. Execute the SQL script

## Verification

After migration, verify the schema:

```sql
-- Check projects table has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' 
AND column_name IN ('map_pdf_base64', 'map_name', 'map_size', 'vector_metadata');

-- Check inventory table has new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'inventory' 
AND column_name IN ('plot_coordinates', 'plot_offset', 'is_manual_plot');

-- Check Vector tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'vector_%';
```

## Rollback

If you need to rollback the migration:

**WARNING**: This will delete Vector data. Only do this if necessary.

```sql
-- Drop Vector tables (in reverse dependency order)
DROP TABLE IF EXISTS vector_reconciliation CASCADE;
DROP TABLE IF EXISTS vector_backup_settings CASCADE;
DROP TABLE IF EXISTS vector_project_backups CASCADE;
DROP TABLE IF EXISTS vector_change_log CASCADE;
DROP TABLE IF EXISTS vector_creator_notes CASCADE;
DROP TABLE IF EXISTS vector_branches CASCADE;
DROP TABLE IF EXISTS vector_legend CASCADE;
DROP TABLE IF EXISTS vector_labels CASCADE;
DROP TABLE IF EXISTS vector_shapes CASCADE;
DROP TABLE IF EXISTS vector_annotations CASCADE;
DROP TABLE IF EXISTS vector_projects CASCADE;

-- Remove columns from existing tables
ALTER TABLE projects 
DROP COLUMN IF EXISTS map_pdf_base64,
DROP COLUMN IF EXISTS map_name,
DROP COLUMN IF EXISTS map_size,
DROP COLUMN IF EXISTS vector_metadata;

ALTER TABLE inventory
DROP COLUMN IF EXISTS plot_coordinates,
DROP COLUMN IF EXISTS plot_offset,
DROP COLUMN IF EXISTS is_manual_plot;
```

## Safety Features

- **Idempotent**: Safe to run multiple times
- **Non-destructive**: All new columns are nullable, won't break existing data
- **IF NOT EXISTS**: Checks prevent duplicate creation
- **Transaction-safe**: Uses database transactions for atomicity

## Next Steps

After successful migration:

1. ✅ Restart your backend server
2. ✅ Test API endpoints using the test script:
   ```bash
   python test_endpoints.py
   ```
   Or test manually:
   - `GET /api/projects` - Should return 200
   - `GET /api/dashboard/summary` - Should return 200
   - `GET /api/dashboard/project-stats` - Should return 200
   - `GET /api/dashboard/project-inventory` - Should return 200
   - `GET /api/dashboard/top-receivables` - Should return 200
3. ✅ Check frontend loads data correctly
4. ✅ Test Vector functionality (if Vector tab is integrated)

## Support

If you encounter issues:
1. Check the error message carefully
2. Verify database connection
3. Check PostgreSQL logs
4. Ensure all prerequisites are met
5. Review the migration SQL file for syntax issues

## Migration Script Location

- **SQL Migration**: `backend/migrations/add_vector_fields.sql`
- **Python Runner**: `backend/migrate_vector_schema.py`
- **Test Script**: `backend/test_endpoints.py`
- **This Guide**: `backend/README_MIGRATION.md`

