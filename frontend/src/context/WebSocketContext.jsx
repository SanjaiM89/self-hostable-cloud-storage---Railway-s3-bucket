import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

const MAX_RETRIES = 3;
const BASE_DELAY = 3000; // 3 seconds

export const WebSocketProvider = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    const ws = useRef(null);
    const retryCount = useRef(0);
    const retryTimer = useRef(null);
    const isMounted = useRef(true);
    const [status, setStatus] = useState('disconnected');
    const subscribers = useRef([]);

    useEffect(() => {
        isMounted.current = true;

        if (!isAuthenticated || !user) {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
                setStatus('disconnected');
            }
            return;
        }

        const connect = () => {
            if (!isMounted.current) return;
            if (ws.current?.readyState === WebSocket.OPEN) return;
            if (retryCount.current >= MAX_RETRIES) {
                console.log('WS: Max retries reached, giving up.');
                setStatus('disconnected');
                return;
            }

            setStatus('connecting');
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const wsBase = backendUrl.replace(/^http/, 'ws');

            try {
                const socket = new WebSocket(`${wsBase}/ws/${user.username}`);

                socket.onopen = () => {
                    if (!isMounted.current) { socket.close(); return; }
                    console.log('WS Connected');
                    retryCount.current = 0;
                    setStatus('connected');
                };

                socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        subscribers.current.forEach(callback => callback(data));
                    } catch (e) {
                        // Ignore parse errors
                    }
                };

                socket.onclose = () => {
                    if (!isMounted.current) return;
                    setStatus('disconnected');
                    ws.current = null;
                    retryCount.current += 1;
                    if (retryCount.current < MAX_RETRIES) {
                        const delay = BASE_DELAY * Math.pow(2, retryCount.current - 1);
                        retryTimer.current = setTimeout(connect, delay);
                    }
                };

                socket.onerror = () => {
                    // onclose will fire after onerror, so just let it propagate
                    socket.close();
                };

                ws.current = socket;
            } catch (e) {
                // WebSocket constructor can throw if URL is invalid
                console.warn('WS: Failed to create connection', e);
                setStatus('disconnected');
            }
        };

        connect();

        return () => {
            isMounted.current = false;
            clearTimeout(retryTimer.current);
            if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
        };
    }, [isAuthenticated, user]);

    const subscribe = useCallback((callback) => {
        subscribers.current.push(callback);
        return () => {
            subscribers.current = subscribers.current.filter(cb => cb !== callback);
        };
    }, []);

    return (
        <WebSocketContext.Provider value={{ status, subscribe }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => useContext(WebSocketContext);
