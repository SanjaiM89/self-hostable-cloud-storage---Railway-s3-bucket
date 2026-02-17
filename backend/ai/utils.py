import os
import mimetypes
from pypdf import PdfReader
from docx import Document
from io import BytesIO

def extract_text_from_file(file_content: bytes, filename: str, mime_type: str = None) -> str:
    """
    Extracts text from a file based on its mime type/extension.
    """
    if not mime_type:
        mime_type, _ = mimetypes.guess_type(filename)
    
    ext = filename.split('.')[-1].lower() if '.' in filename else ''

    try:
        if mime_type == 'application/pdf' or ext == 'pdf':
            return _extract_pdf(file_content)
        elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or ext == 'docx':
            return _extract_docx(file_content)
        elif mime_type and mime_type.startswith('text/'):
            return file_content.decode('utf-8', errors='ignore')
        else:
            # Fallback for code files etc
            return file_content.decode('utf-8', errors='ignore')
    except Exception as e:
        return f"[Error extracting text from {filename}: {str(e)}]"

def _extract_pdf(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    text = []
    for page in reader.pages:
        text.append(page.extract_text() or "")
    return "\n".join(text)

def _extract_docx(content: bytes) -> str:
    doc = Document(BytesIO(content))
    return "\n".join([p.text for p in doc.paragraphs])
