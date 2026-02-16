import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
    const { isAuthenticated, user } = useAuth();
    const ws = useRef(null);
    const [status, setStatus] = useState('disconnected'); // disconnected, connecting, connected
    const subscribers = useRef([]);

    useEffect(() => {
        if (!isAuthenticated || !user) {
            if (ws.current) {
                ws.current.close();
                ws.current = null;
                setStatus('disconnected');
            }
            return;
        }

        const connect = () => {
            if (ws.current?.readyState === WebSocket.OPEN) return;

            setStatus('connecting');
            // Assuming backend is same host or configured env
            // Determine WS URL
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // If development (Vite default proxy), we might need direct backend URL or use relative /api path if proxied
            // Assuming /api proxy setup or direct backend URL. 
            // backend/main.py has /ws endpoint.

            // NOTE: You might need to adjust this URL based on your dev setup
            // If using Vite proxy: `ws://${window.location.host}/ws` (if proxy forwards ws)
            // Or typically `ws://localhost:8000/ws`

            // Trying to use relative path if proxy expects it, or absolute if we know backend port
            // Let's assume common default: 
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const wsBase = backendUrl.replace(/^http/, 'ws');

            const socket = new WebSocket(`${wsBase}/ws/${user.username}`);

            socket.onopen = () => {
                console.log('WS Connected');
                setStatus('connected');
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Notify subscribers
                    subscribers.current.forEach(callback => callback(data));
                } catch (e) {
                    console.error('WS Message Parse Error', e);
                }
            };

            socket.onclose = () => {
                console.log('WS Disconnected');
                setStatus('disconnected');
                // Reconnect logic could go here (exp. backoff)
                setTimeout(connect, 3000);
            };

            socket.onerror = (err) => {
                console.error('WS Error', err);
                socket.close();
            };

            ws.current = socket;
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [isAuthenticated, user]);

    const subscribe = (callback) => {
        subscribers.current.push(callback);
        return () => {
            subscribers.current = subscribers.current.filter(cb => cb !== callback);
        };
    };

    return (
        <WebSocketContext.Provider value={{ status, subscribe }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => useContext(WebSocketContext);
