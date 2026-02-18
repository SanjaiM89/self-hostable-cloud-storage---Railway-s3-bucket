import os

import requests
import json
import base64
from typing import List, AsyncGenerator, Dict, Any

class BaseAIProvider:
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    async def stream_chat(self, messages: List[Dict], attachments: List[Dict] = None) -> AsyncGenerator[str, None]:
        raise NotImplementedError

class GeminiProvider(BaseAIProvider):
    def __init__(self, config: Dict):
        super().__init__(config)
        self.api_key = config.get("api_key")
        if not self.api_key:
            raise ValueError("Gemini API Key is required")
        self.model_name = config.get("model", "gemini-1.5-flash")
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    async def stream_chat(self, messages: List[Dict], attachments: List[Dict] = None) -> AsyncGenerator[str, None]:
        # Construct contents
        contents = []
        
        # Handle system instruction if needed (Gemini REST API supports system_instruction field separately)
        system_instruction = next((m['content'] for m in messages if m['role'] == 'system'), None)
        
        # Filter out system messages from standard flow
        filtered_messages = [m for m in messages if m['role'] != 'system']

        for msg in filtered_messages:
            role = "user" if msg['role'] == "user" else "model"
            parts = [{"text": msg['content']}]
            contents.append({"role": role, "parts": parts})

        # Attachments for the last user message
        if attachments and contents and contents[-1]['role'] == 'user':
            for att in attachments:
                if att['mime_type'].startswith('image/') or att['mime_type'] == 'application/pdf':
                    # Gemini REST expects inline_data
                     contents[-1]['parts'].append({
                        "inline_data": {
                            "mime_type": att['mime_type'],
                            "data": att['content_base64']
                        }
                    })

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                # "maxOutputTokens": 8192,
            }
        }

        if system_instruction:
            payload["system_instruction"] = {
                "parts": [{"text": system_instruction}]
            }

        url = f"{self.base_url}/{self.model_name}:streamGenerateContent?key={self.api_key}"
        
        try:
            with requests.post(url, json=payload, stream=True) as r:
                r.raise_for_status()
                # Gemini streams a JSON array of parsed objects, but often sends them in chunks.
                # However, the format is slightly complex: "[{},{},...]"
                # Easier to process line by line if they send newlines, but sometimes they assume SSE-like parsing?
                # Actually, Gemini REST stream returns a list of JSON objects, usually one per line or separated consistently.
                # Let's try iterating lines. IF that fails, we might need a smarter parser.
                # Usually it sends: "{\n...}\n,\n{\n...}"
                
                # A safer way for manual JSON streaming without a dedicated library:
                # Use iter_content and buffer? 
                # Or simplistically assume line-based JSON if nicely formatted.
                # Official documentation says response comes as a series of JSON objects. 
                # Let's try to just read and decode chunks, looking for "text" within "candidates".
                
                # Update: Requests iter_lines logic might break on formatted JSON.
                # However, usually there's a structure.
                # Let's assume standard behavior:
                
                for line in r.iter_lines():
                    if line:
                        line = line.decode('utf-8').strip()
                        # Skip array mechanics
                        if line == '[' or line == ']' or line == ',' or line == '':
                            continue
                        
                        # Sometimes lines are comma separated objects?
                        if line.startswith(','): line = line[1:]
                        
                        try:
                            data = json.loads(line)
                            if 'candidates' in data and len(data['candidates']) > 0:
                                candidate = data['candidates'][0]
                                if 'content' in candidate and 'parts' in candidate['content']:
                                     for part in candidate['content']['parts']:
                                         if 'text' in part:
                                             yield part['text']
                        except json.JSONDecodeError:
                            # It might be a multiline JSON object.
                            # This simple parser is risky.
                            pass
                        
        except Exception as e:
            yield f"\n[Error connecting to Gemini: {str(e)}]"

class OllamaProvider(BaseAIProvider):
    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = config.get("base_url", "http://localhost:11434")
        self.model = config.get("model", "llama3")

    async def stream_chat(self, messages: List[Dict], attachments: List[Dict] = None) -> AsyncGenerator[str, None]:
        payload = {
            "model": self.model,
            "messages": messages, # Ollama supports standard openai-like messages
            "stream": True
        }
        
        # Ollama supports images in messages but slightly different format usually.
        # Standard OpenAI format: content: [{"type": "text", "text": "..." }, {"type": "image_url", ...}]
        # Ollama raw API: "images": [base64] field in message object.
        
        if attachments:
            last_msg = payload['messages'][-1]
            if last_msg['role'] == 'user':
                last_msg['images'] = []
                for att in attachments:
                    if att['mime_type'].startswith('image/'):
                         last_msg['images'].append(att['content_base64'])
        
        try:
            with requests.post(f"{self.base_url}/api/chat", json=payload, stream=True) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        body = json.loads(line)
                        if 'message' in body and 'content' in body['message']:
                            yield body['message']['content']
                        if body.get('done'):
                            break
        except requests.exceptions.ConnectionError:
            yield f"\n[Error: Could not connect to Ollama at {self.base_url}. Please ensure Ollama is running.]"
        except Exception as e:
            yield f"\n[Error connecting to Ollama: {str(e)}]"

class LMStudioProvider(BaseAIProvider):
    def __init__(self, config: Dict):
        super().__init__(config)
        self.base_url = config.get("base_url", "http://localhost:1234/v1")
        self.model = config.get("model", "local-model")
        self.api_key = config.get("api_key", "lm-studio")

    async def stream_chat(self, messages: List[Dict], attachments: List[Dict] = None) -> AsyncGenerator[str, None]:
        # Standard OpenAI compatible
        
        # Prepare messages
        final_messages = []
        for msg in messages:
            final_messages.append(msg)
            
        # Handle attachments for the last user message
        if attachments and final_messages and final_messages[-1]['role'] == 'user':
            last_msg = final_messages[-1]
            content_parts = [{"type": "text", "text": last_msg['content']}]
            
            for att in attachments:
                if att['mime_type'].startswith('image/'):
                     content_parts.append({
                         "type": "image_url",
                         "image_url": {
                             "url": f"data:{att['mime_type']};base64,{att['content_base64']}"
                         }
                     })
            
            # Replace string content with list of parts
            final_messages[-1]['content'] = content_parts

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "model": self.model,
            "messages": final_messages,
            "stream": True
        }
        
        try:
            # Using synchronous requests in async wrapper for now, or use httpx if available. 
            # Since strict async isn't enforced in this base implementation (it's a generator), this works.
            with requests.post(f"{self.base_url}/chat/completions", json=payload, headers=headers, stream=True) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith('data: '):
                            if line == 'data: [DONE]': break
                            try:
                                data = json.loads(line[6:])
                                if 'choices' in data and len(data['choices']) > 0:
                                    delta = data['choices'][0].get('delta', {})
                                    if 'content' in delta:
                                        yield delta['content']
                            except json.JSONDecodeError:
                                pass
        except requests.exceptions.ConnectionError:
            yield f"\n[Error: Could not connect to LM Studio at {self.base_url}. Please ensure the LM Studio server is running and listening on this URL.]"
        except Exception as e:
             yield f"\n[Error connecting to LM Studio: {str(e)}]"

def get_provider(config: Dict) -> BaseAIProvider:
    provider = config.get("provider", "gemini")
    if provider == "gemini":
        return GeminiProvider(config)
    elif provider == "ollama":
        return OllamaProvider(config)
    elif provider == "lmstudio":
        return LMStudioProvider(config)
    else:
        raise ValueError(f"Unknown provider: {provider}")
