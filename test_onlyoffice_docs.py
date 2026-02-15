import requests

ONLYOFFICE_URL = "https://documentserver-production-b7c4.up.railway.app"

def check_onlyoffice():
    print(f"Checking OnlyOffice at: {ONLYOFFICE_URL}")
    
    # 1. Check Health/Welcome Page
    try:
        r = requests.get(f"{ONLYOFFICE_URL}/welcome/", timeout=10)
        print(f"Welcome Page: {r.status_code}")
    except Exception as e:
        print(f"Welcome Page Error: {e}")

    # 2. Check API Script (Crucial for Frontend)
    api_url = f"{ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js"
    try:
        r = requests.get(api_url, timeout=10)
        print(f"API Script: {r.status_code}")
        if r.status_code == 200:
            print("API Script found! This is good.")
        else:
            print("API Script NOT found.")
    except Exception as e:
        print(f"API Script Error: {e}")

    # 3. Check Command Service (Health Check)
    health_url = f"{ONLYOFFICE_URL}/healthcheck"
    try:
        r = requests.get(health_url, timeout=10)
        print(f"Health Check: {r.status_code}")
        print(f"Response: {r.text}")
    except Exception as e:
        print(f"Health Check Error: {e}")

if __name__ == "__main__":
    check_onlyoffice()
