import os
import google.generativeai as genai
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
        api_key = config.get("api_key")
        if not api_key:
            raise ValueError("Gemini API Key is required")
        genai.configure(api_key=api_key)
        self.model_name = config.get("model", "gemini-1.5-flash")
        self.model = genai.GenerativeModel(self.model_name)

    async def stream_chat(self, messages: List[Dict], attachments: List[Dict] = None) -> AsyncGenerator[str, None]:
        # Convert messages to Gemini format
        # History is technically stateless in this simple implementation unless we manage ChatSession
        # For simplicity, we'll format prompts or use a chat session if applicable.
        # But for request/response REST pattern, we often just send the history.
        
        # Gemini expects contents=[ {'role': 'user', 'parts': [...]}, ... ]
        gemini_history = []
        
        # System instruction handling
        system_instruction = next((m['content'] for m in messages if m['role'] == 'system'), None)
        if system_instruction:
            # Gemini supports system_instruction at model init, but here we might just prepend it
            # Or simpler: re-initialize model with system_instruction if supported
            self.model = genai.GenerativeModel(self.model_name, system_instruction=system_instruction)

        for msg in messages:
            if msg['role'] == 'system': continue
            role = 'user' if msg['role'] == 'user' else 'model'
            parts = [msg['content']]
            gemini_history.append({'role': role, 'parts': parts})

        # Attachments (Images/PDFs) for the LATEST user message
        if attachments and gemini_history and gemini_history[-1]['role'] == 'user':
            parts = gemini_history[-1]['parts']
            for att in attachments:
                if att['mime_type'].startswith('image/') or att['mime_type'] == 'application/pdf':
                    # Gemini client expects data parts
                    parts.append({
                        'mime_type': att['mime_type'],
                        'data': base64.b64decode(att['content_base64']) # Assumes incoming is base64
                    })
        
        # Execute
        chat = self.model.start_chat(history=gemini_history[:-1]) # History up to last msg
        last_msg = gemini_history[-1]['parts']
        
        response = await chat.send_message_async(last_msg, stream=True)
        async for chunk in response:
            if chunk.text:
                yield chunk.text

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
