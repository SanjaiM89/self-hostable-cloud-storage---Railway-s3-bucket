import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './mobile/mobile.css';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { AIProvider } from './context/AIContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <WebSocketProvider>
        <ThemeProvider>
          <AIProvider>
            <App />
          </AIProvider>
        </ThemeProvider>
      </WebSocketProvider>
    </AuthProvider>
  </React.StrictMode>
);
