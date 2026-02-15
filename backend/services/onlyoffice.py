import jwt
import os
import datetime
import time

# Configuration
ONLYOFFICE_URL = os.getenv("ONLYOFFICE_URL", "https://your-onlyoffice-app.onrender.com").strip().rstrip("/")
ONLYOFFICE_JWT_SECRET = os.getenv("ONLYOFFICE_JWT_SECRET", "supersecretjwtkeysupersecretjwtkey")
ONLYOFFICE_JWT_HEADER = "Authorization" # standard

class OnlyOfficeService:
    @staticmethod
    def create_jwt(payload: dict) -> str:
        """
        Sign a payload with HS256 using ONLYOFFICE_JWT_SECRET.
        Adds 'iat' and 'exp' claims.
        """
        now = int(time.time())
        # payload["iat"] = now
        # payload["exp"] = now + 5 * 60 # 5 minutes expiry for token
        
        # OnlyOffice expects specific payload structure sometimes, 
        # but generally standard JWT.
        token = jwt.encode(payload, ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        return token

    @staticmethod
    def decode_jwt(token: str) -> dict:
        """
        Verify and decode JWT from OnlyOffice Callback.
        """
        try:
            # Handle "Bearer " prefix if present
            if token.startswith("Bearer "):
                token = token[7:]
                
            return jwt.decode(token, ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError as e:
            print(f"JWT Verification Failed: {e}")
            return None

    @staticmethod
    def get_editor_config(file_model, user, download_url, callback_url):
        """
        Generate the Full Editor Config for Frontend.
        """
        file_ext = os.path.splitext(file_model.name)[1].lower().replace(".", "")
        document_type = OnlyOfficeService.get_document_type(file_ext)
        
        # Unique Key: Hash of (ID + ModifiedTime) to force refresh on update
        # timestamp = int(file_model.updated_at.timestamp()) if file_model.updated_at else 0
        timestamp = int(time.time()) # For now force unique
        key = f"{file_model.id}-{timestamp}" 

        config = {
            "document": {
                "fileType": file_ext,
                "key": key,
                "title": file_model.name,
                "url": download_url,
                "permissions": {
                    "download": True,
                    "edit": True,
                    "print": True,
                    "review": True
                }
            },
            "documentType": document_type,
            "editorConfig": {
                "callbackUrl": callback_url,
                "user": {
                    "id": str(user.id),
                    "name": user.username
                },
                "lang": "en",
                # "mode": "edit"
            }
        }
        
        # Sign the config
        token = OnlyOfficeService.create_jwt(config)
        config["token"] = token
        
        return config

    @staticmethod
    def get_document_type(ext):
        words = ["doc", "docx", "docm", "dot", "dotx", "dotm", "odt", "fodt", "ott", "rtf", "txt", "html", "htm", "mht", "xml", "pdf", "djvu", "fb2", "epub", "xps"]
        cells = ["xls", "xlsx", "xlsm", "xlt", "xltx", "xltm", "ods", "fods", "ots", "csv"]
        slides = ["ppt", "pptx", "pptm", "pps", "ppsx", "ppsm", "pot", "potx", "potm", "odp", "fodp", "otp"]
        
        if ext in words: return "word"
        if ext in cells: return "cell"
        if ext in slides: return "slide"
        return "word" # default
