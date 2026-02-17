import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

const AIContext = createContext();

export function AIProvider({ children }) {
    const { isAuthenticated, user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Context Registry
    const contextRegistry = useRef(new Map());

    const toggleAI = useCallback(() => setIsOpen(prev => !prev), []);

    const registerContext = useCallback((id, getter) => {
        contextRegistry.current.set(id, getter);
        return () => {
            contextRegistry.current.delete(id);
        };
    }, []);

    const getActiveContext = useCallback(() => {
        const contexts = [];
        for (const getter of contextRegistry.current.values()) {
            try {
                const ctx = getter();
                if (ctx) contexts.push(ctx);
            } catch (err) {
                console.error("Error getting context:", err);
            }
        }
        return contexts;
    }, []);

    const sendMessage = useCallback(async (text, attachments = []) => {
        if (!text && attachments.length === 0) return;

        const userMsg = { role: 'user', content: text, attachments };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            const contextFiles = getActiveContext();

            const payload = {
                messages: [...messages, userMsg].map(m => ({
                    role: m.role,
                    content: m.content
                })),
                context_files: contextFiles,
                attachments: attachments
            };

            // We need to use fetch for streaming, but we must use the correct API URL
            // api.defaults.baseURL handles it for axios, but here we need to be explicit if using fetch
            // Or we can use the aiAPI.chat method if we implement streaming there. 
            // Let's use the API_URL from utils/api.js logic:

            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

            const response = await fetch(`${API_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Failed to send message');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const last = newMsgs[newMsgs.length - 1];
                    last.content += chunk;
                    return newMsgs;
                });
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => {
                const newMsgs = [...prev];
                if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === 'assistant') {
                    newMsgs[newMsgs.length - 1].content += `\n[Error: ${error.message}]`;
                } else {
                    newMsgs.push({ role: 'assistant', content: `[Error: ${error.message}]` });
                }
                return newMsgs;
            });
        } finally {
            setIsLoading(false);
        }
    }, [messages, getActiveContext]);

    const clearChat = useCallback(() => setMessages([]), []);

    return (
        <AIContext.Provider value={{
            isOpen,
            toggleAI,
            messages,
            sendMessage,
            isLoading,
            registerContext,
            clearChat
        }}>
            {children}
        </AIContext.Provider>
    );
}

export const useAI = () => useContext(AIContext);
