import os
import requests
import json
from fastapi import HTTPException
try:
    from ..database import SessionLocal
    from ..models import File as FileModel
except ImportError:
    from database import SessionLocal
    from models import File as FileModel

DOCSPACE_URL = os.getenv("DOCSPACE_URL", "https://docspace-7ru0rj.onlyoffice.com")
DOCSPACE_API_KEY = os.getenv("DOCSPACE_API_KEY", "sk-8a6d73fa4043e677682f2f6c7150d01936184e57b91c5f7cf94486f2eeb69ba4")

class DocSpaceClient:
    def __init__(self):
        self.base_url = DOCSPACE_URL.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {DOCSPACE_API_KEY}" if not DOCSPACE_API_KEY.startswith("Bearer ") else DOCSPACE_API_KEY, 
            "Accept": "application/json"
        }
        
    def check_connection(self):
        """Checks if we can connect to DocSpace"""
        try:
            url = f"{self.base_url}/api/2.0/people/@self"
            response = requests.get(url, headers=self.headers)
            print(f"DocSpace Check Connection: {response.status_code} - {response.text[:100]}")
            return response.status_code == 200
        except Exception as e:
            print(f"DocSpace Check Connection Failed: {e}")
            return False

    def create_room(self, title="Cloud Storage Imports"):
        """Creates a room to store imported files"""
        url = f"{self.base_url}/api/2.0/room"
        payload = {
            "title": title,
            "roomType": 1 # 1 = Collaboration?
        }
        # Use json=payload to auto-set Content-Type: application/json
        response = requests.post(url, headers=self.headers, json=payload)
        return response.json()

    def upload_file(self, file_content: bytes, file_name: str, folder_id="@my"):
        """Uploads a file to DocSpace"""
        # Endpoint: /api/2.0/files/{folderId}/upload
        url = f"{self.base_url}/api/2.0/files/{folder_id}/upload"
        
        files = {
            'file': (file_name, file_content)
        }
        # Note: requests takes care of Content-Type for multipart
        headers = {k: v for k, v in self.headers.items() if k != "Content-Type"}
        
        response = requests.post(url, headers=headers, files=files)
        if response.status_code not in [200, 201]:
            print(f"DocSpace Upload Error: {response.text}")
            raise HTTPException(status_code=502, detail=f"Failed to upload to DocSpace: {response.text}")
        
        return response.json()

    def get_file_info(self, file_id):
        """Get file info to retrieve updated content/url"""
        url = f"{self.base_url}/api/2.0/files/file/{file_id}"
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            return None
        return response.json()

    def download_file(self, file_id):
        """Download file content from DocSpace"""
        # First get file info to find the view url or download url
        info = self.get_file_info(file_id)
        if not info or 'response' not in info:
             raise HTTPException(status_code=404, detail="File not found in DocSpace")
        
        # DocSpace API structure: response -> viewUrl / originalUrl ?
        # Actual content download likely requires a separate call or using the 'viewUrl' which might be a public link?
        # Typically /api/2.0/files/file/{fileId}/presigned_download_url ??
        # Let's try finding the download URL from the 'response' object
        file_data = info['response']
        return requests.get(file_data['originalUrl']).content # simplistic approach

docspace_client = DocSpaceClient()
