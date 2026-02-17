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

        # 3. Get Provider
        # Default to Gemini if not configured (or handle error)
        config = user_ai_config if user_ai_config else {"provider": "gemini", "api_key": "", "model": "gemini-1.5-flash"}
        
        # If no config at all, default to free/local if possible? 
        # For now, let provider logic handle missing keys (it raises ValueError).
        
        provider = get_provider(config)
        
        # 4. Stream
        async for chunk in provider.stream_chat(msgs, attachments):
            yield chunk

    except Exception as e:
        logger.error(f"AI Service Error: {e}")
        yield f"\n\n[System Error: {str(e)}]"
