import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './mobile/mobile.css';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { AIProvider } from './context/AIContext';
import { MusicProvider } from './context/MusicContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <WebSocketProvider>
        <ThemeProvider>
          <AIProvider>
            <MusicProvider>
              <App />
            </MusicProvider>
          </AIProvider>
        </ThemeProvider>
      </WebSocketProvider>
    </AuthProvider>
  </React.StrictMode>
);
