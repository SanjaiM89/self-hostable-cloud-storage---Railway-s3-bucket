from sqlalchemy.orm import Session
from .providers import get_provider
from .utils import extract_text_from_file
import logging

logger = logging.getLogger(__name__)

async def chat_stream(user_ai_config: dict, messages: list, context_files: list = None, attachments: list = None):
    """
    Orchestrates the chat session.
    1. Prepares context from open files.
    2. Initializes the appropriate AI provider.
    3. Streams the response.
    """
    try:
        # 1. Prepare Context
        context_text = ""
        if context_files:
            context_text += "Here are the files the user is currently looking at:\n\n"
            for f in context_files:
                # Truncate content if too large (naive approach for now)
                content = f.get('content', '')
                if len(content) > 20000:
                    content = content[:20000] + "...[truncated]"
                context_text += f"-- File: {f.get('name')} --\n{content}\n\n"
        
        # 2. Inject Context into specific system message or prepend to last user message
        # Strat: Prepend to last user message to ensure model sees it "just now"
        # Or better: Add a system message if none exists, or append to it.
        
        # Copy messages to avoid mutating original list
        msgs = [m.copy() for m in messages]
        
        if context_text:
            system_msg_idx = next((i for i, m in enumerate(msgs) if m['role'] == 'system'), None)
            if system_msg_idx is not None:
                msgs[system_msg_idx]['content'] += f"\n\n{context_text}"
            else:
                # Insert system message at start
                msgs.insert(0, {
                    "role": "system",
                    "content": f"You are a helpful AI assistant integrated into a cloud storage platform.\n{context_text}"
                })

        # 2a. Process Attachments (Local Parsing)
        # The user specifically requested local parsing for MD and PDF.
        # We will extract text and append to the last user message.
        processed_attachments = []
        if attachments:
            attachment_text = ""
            for att in attachments:
                filename = att.get('name', 'file')
                mime = att.get('mime_type', '')
                ext = filename.split('.')[-1].lower() if '.' in filename else ''
                
                # Check if we should parse this locally
                # User mentioned MD and PDF specifically
                logger.info(f"Processing attachment: {filename}, ext: {ext}, mime: {mime}")
                if ext in ['md', 'markdown', 'pdf', 'txt', 'py', 'js', 'html', 'css', 'json']:
                     # Decode base64 content if needed, but here att should have 'content_base64'
                     # Wait, extract_text_from_file expects bytes. 
                     # att from frontend (via providers.py logci) has 'content_base64'.
                     import base64
                     try:
                         file_bytes = base64.b64decode(att['content_base64'])
                         text = extract_text_from_file(file_bytes, filename, mime)
                         logger.info(f"Extracted text length: {len(text)}")
                         attachment_text += f"\n\n--- Attachment: {filename} ---\n{text}\n"
                     except Exception as e:
                         logger.error(f"Failed to parse attachment {filename}: {e}")
                         # If parsing fails, maybe keep it as attachment? 
                         # For now, just log and skip text injection, let it pass to provider if supported.
                         processed_attachments.append(att)
                else:
                    # Keep as attachment for provider (e.g. images)
                    processed_attachments.append(att)
            
            # Append extracted text to the last user message
            if attachment_text:
                # Find last user message
                for i in range(len(msgs) - 1, -1, -1):
                    if msgs[i]['role'] == 'user':
                        msgs[i]['content'] += attachment_text
                        break
        
        # 3. Get Provider
        # Default to Gemini if not configured (or handle error)
        config = user_ai_config if user_ai_config else {"provider": "gemini", "api_key": "", "model": "gemini-1.5-flash"}
        
        # If no config at all, default to free/local if possible? 
        # For now, let provider logic handle missing keys (it raises ValueError).
        
        provider = get_provider(config)
        
        # 4. Stream
        async for chunk in provider.stream_chat(msgs, processed_attachments):
            yield chunk

    except Exception as e:
        logger.error(f"AI Service Error: {e}")
        yield f"\n\n[System Error: {str(e)}]"
