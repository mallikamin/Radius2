"""
Test script to verify API endpoints work after migration.
Run this after running the migration to ensure all endpoints return 200 status codes.

Usage:
    python test_endpoints.py [base_url]

Example:
    python test_endpoints.py http://localhost:8010
    (Backend port 8010 matches docker-compose.yml port mapping)
"""

import sys
import requests
from typing import List, Tuple

# Default base URL - matches docker-compose.yml backend port mapping (8010:8000)
DEFAULT_BASE_URL = "http://localhost:8010"

def test_endpoint(url: str, method: str = "GET", data: dict = None) -> Tuple[bool, str, int]:
    """Test an endpoint and return (success, message, status_code)"""
    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=10)
        else:
            return False, f"Unsupported method: {method}", 0
        
        status_code = response.status_code
        if status_code == 200:
            return True, "OK", status_code
        else:
            try:
                error_detail = response.json().get("detail", "Unknown error")
            except:
                error_detail = response.text[:200]
            return False, f"Error: {error_detail}", status_code
    except requests.exceptions.ConnectionError:
        return False, "Connection error - Is the server running?", 0
    except requests.exceptions.Timeout:
        return False, "Request timeout", 0
    except Exception as e:
        return False, f"Exception: {str(e)[:200]}", 0

def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    
    # Remove trailing slash
    base_url = base_url.rstrip('/')
    
    print("=" * 60)
    print("API Endpoint Test Script")
    print("=" * 60)
    print(f"Testing endpoints at: {base_url}")
    print()
    print("Note: Make sure your backend server is running!")
    print("For Docker Compose: docker-compose up")
    print(f"Default backend port: 8010 (from docker-compose.yml)")
    print(f"Default frontend port: 5180 (from docker-compose.yml)")
    print()
    print("Usage: python test_endpoints.py [base_url]")
    print("Example: python test_endpoints.py http://localhost:8010")
    print()
    
    # List of endpoints to test
    endpoints = [
        ("/api/projects", "GET"),
        ("/api/dashboard/summary", "GET"),
        ("/api/dashboard/project-stats", "GET"),
        ("/api/dashboard/project-inventory", "GET"),
        ("/api/dashboard/top-receivables?limit=10", "GET"),
    ]
    
    results = []
    passed = 0
    failed = 0
    
    for endpoint, method in endpoints:
        url = f"{base_url}{endpoint}"
        print(f"Testing {method} {endpoint}...", end=" ")
        
        success, message, status_code = test_endpoint(url, method)
        
        if success:
            print(f"✓ PASSED (200)")
            passed += 1
        else:
            print(f"✗ FAILED ({status_code})")
            print(f"  {message}")
            failed += 1
        
        results.append((endpoint, success, message, status_code))
    
    print()
    print("=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"Total endpoints tested: {len(endpoints)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print()
    
    if failed > 0:
        print("Failed endpoints:")
        for endpoint, success, message, status_code in results:
            if not success:
                print(f"  - {endpoint}: {message} (Status: {status_code})")
        print()
        print("Troubleshooting:")
        print("1. Ensure the migration has been run: python migrate_vector_schema.py")
        print("2. Check that the backend server is running")
        print("3. Verify database connection is working")
        print("4. Check backend logs for detailed error messages")
        sys.exit(1)
    else:
        print("✓ All endpoints are working correctly!")
        print()
        print("Next steps:")
        print("1. Test the frontend to ensure data loads properly")
        print("2. Test Vector functionality (if Vector tab is integrated)")
        sys.exit(0)

if __name__ == "__main__":
    main()

