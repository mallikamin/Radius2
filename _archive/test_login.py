#!/usr/bin/env python3
"""Simple script to test login"""
import requests

# Test login
response = requests.post(
    'http://localhost:8002/api/auth/login',
    data={
        'username': 'REP-0001',
        'password': 'test123'
    }
)

print("Status Code:", response.status_code)
print("Response Text:", response.text)
try:
    print("Response JSON:", response.json())
except:
    print("Could not parse JSON response")

if response.status_code == 200:
    token = response.json()['access_token']
    print("\n[SUCCESS] Login successful!")
    print(f"Token: {token[:50]}...")
    
    # Test getting user info
    print("\n--- Testing /api/auth/me ---")
    me_response = requests.get(
        'http://localhost:8002/api/auth/me',
        headers={'Authorization': f'Bearer {token}'}
    )
    print("Status Code:", me_response.status_code)
    if me_response.status_code == 200:
        print("User Info:", me_response.json())
    else:
        print("Error:", me_response.text)
else:
    print("\n[FAILED] Login failed!")
    print("Error:", response.text)

