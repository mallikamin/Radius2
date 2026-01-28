# Finding Docker Database Credentials

If you're getting "password authentication failed" errors, you need to find the correct database credentials from your Docker Compose setup.

## Method 1: Check Docker Compose File

Look for a `docker-compose.yml` file in your project root and check the database service:

```yaml
services:
  db:
    environment:
      POSTGRES_USER: your_username
      POSTGRES_PASSWORD: your_password
      POSTGRES_DB: your_database_name
```

## Method 2: Check Running Container Environment

Run this command to see the database environment variables:

```bash
docker-compose exec db env | grep POSTGRES
```

Or if your container has a different name:

```bash
docker ps  # Find your database container name
docker exec <container_name> env | grep POSTGRES
```

## Method 3: Check Backend Configuration

Check your backend's `main.py` or environment variables to see what database URL it's using:

```bash
# In your backend directory
grep -r "DATABASE_URL" .
# Or check .env file if it exists
```

## Method 4: Use the Migration Script with Credentials

Once you have the credentials, you can pass them directly:

```bash
python migrate_vector_schema.py <user> <password> <host> <port> <database>
```

Example:
```bash
python migrate_vector_schema.py postgres mypassword localhost 5432 sitara_crm
```

Or set environment variables:

```bash
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=mypassword
export POSTGRES_DB=sitara_crm
python migrate_vector_schema.py
```

## Common Docker Compose Database Names

- Container name: `sitara_v3_db` (from your output)
- Common usernames: `postgres`, `sitara`, `admin`
- Common database names: `sitara_crm`, `postgres`, `radius`

## Quick Test

To test if you have the right credentials, try connecting with psql:

```bash
psql -h localhost -U <username> -d <database_name>
```

Or using Docker:

```bash
docker-compose exec db psql -U <username> -d <database_name>
```

